"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { blankBlock, createEmail, createSms, deleteEmail, deleteSms, emailReady, getMarketingVersion, listEmails, listFlows, listSms, saveEmail, smsReady, subscribeMarketing, type EmailBlock, type FlowStep, type MarketingEmail } from "@/data/mock/marketing-session";

const TEMPLATES: Array<{ key: string; name: string; detail: string; subject: string; preview: string; blocks: () => EmailBlock[] }> = [
  {
    key: "cart",
    name: "תזכורת לעגלה",
    detail: "כותרת, משפט קצר וכפתור לעגלה הנטושה של הלקוח.",
    subject: "העגלה שלכם מחכה",
    preview: "המוצרים עדיין שמורים",
    blocks: () => [
      { ...blankBlock("heading"), text: "שכחתם משהו בעגלה" },
      { ...blankBlock("text"), text: "היי {first_name}, המוצרים שבחרתם עדיין שמורים. אפשר להמשיך לתשלום מכאן." },
      { ...blankBlock("button"), label: "חזרה לעגלה", href: "{checkout_url}" },
    ],
  },
  {
    key: "welcome",
    name: "ברוכים הבאים",
    detail: "היכרות קצרה עם החנות וקישור לאתר.",
    subject: "כיף שהצטרפתם",
    preview: "כמה מילים מהחנות",
    blocks: () => [
      { ...blankBlock("logo") },
      { ...blankBlock("heading"), text: "ברוכים הבאים, {first_name}" },
      { ...blankBlock("text"), text: "שמחים שהצטרפתם אל {store_name}. כאן תקבלו עדכונים, מבצעים וחדשות מהחנות." },
      { ...blankBlock("button"), label: "לאתר", href: "{store_url}" },
    ],
  },
  {
    key: "thanks",
    name: "תודה על הרכישה",
    detail: "הודעת תודה אחרי הזמנה, עם שם הלקוח.",
    subject: "תודה על ההזמנה",
    preview: "קיבלנו את ההזמנה שלכם",
    blocks: () => [
      { ...blankBlock("heading"), text: "תודה, {first_name}" },
      { ...blankBlock("text"), text: "ההזמנה התקבלה. נעדכן אתכם כשהיא יוצאת לדרך." },
      { ...blankBlock("button"), label: "לאזור האישי", href: "{account_url}" },
    ],
  },
];

function usedIds(steps: FlowStep[], kind: "email" | "sms"): string[] {
  return steps.flatMap((step) => {
    if (kind === "email" && step.type === "email") return step.emailId ? [step.emailId] : [];
    if (kind === "sms" && step.type === "sms") return step.smsId ? [step.smsId] : [];
    if (step.type === "cond") return [...usedIds(step.yes ?? [], kind), ...usedIds(step.no ?? [], kind)];
    if (step.type === "ab") return [...usedIds(step.a ?? [], kind), ...usedIds(step.b ?? [], kind)];
    if (step.type === "both") return [...usedIds(step.mail ?? [], kind), ...usedIds(step.phone ?? [], kind)];
    return [];
  });
}

export function EmailsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const emails = listEmails();
  const messages = listSms();
  const flows = listFlows();
  const usedEmails = new Set(flows.flatMap((flow) => usedIds(flow.steps, "email")));
  const usedSms = new Set(flows.flatMap((flow) => usedIds(flow.steps, "sms")));
  const ready = emails.filter((email) => emailReady(email.id)).length + messages.filter((message) => smsReady(message.id)).length;
  const rows = [
    ...emails.map((email) => ({ id: email.id, kind: "email" as const, name: email.name, detail: email.subject || "בלי נושא", used: usedEmails.has(email.id) })),
    ...messages.map((message) => ({ id: message.id, kind: "sms" as const, name: message.name, detail: message.text || "הודעה ריקה", used: usedSms.has(message.id) })),
  ];

  function open(email: MarketingEmail) {
    router.push(`/admin/marketing/emails/${email.id}`);
  }

  function startBlank() {
    open(createEmail());
  }

  function startSms(text = "") {
    const message = createSms(text ? { name: "תזכורת קצרה", text } : undefined);
    router.push(`/admin/marketing/sms/${message.id}`);
  }

  function startTemplate(template: (typeof TEMPLATES)[number]) {
    const email = createEmail({ name: template.name, subject: template.subject, preview: template.preview });
    saveEmail({ ...email, blocks: template.blocks() });
    open(email);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <h1 className="m-0 text-[15px] font-bold">מיילים ו-SMS</h1>
        <div className="grid overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)] min-[800px]:grid-cols-4">
          {([
            ["מיילים", String(emails.length)],
            ["הודעות SMS", String(messages.length)],
            ["בשימוש באוטומציה", String(rows.filter((row) => row.used).length)],
            ["מוכנים לשליחה", String(ready)],
          ] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 border-e border-[#ebebeb] px-[18px] py-3.5">
              <span className="text-[13px] text-[#4a4a4a]">{label}</span>
              <b className="text-lg">{value}</b>
            </div>
          ))}
        </div>
        <p className="m-0 text-sm text-[#4a4a4a]">כאן מכינים מיילים וגם הודעות SMS. מייל יכול לכלול גרפיקה. SMS הוא טקסט בלבד, עד 250 תווים. באוטומציה רק בוחרים הודעה מוכנה.</p>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <button type="button" onClick={startBlank} className="flex items-center gap-3 rounded-[14px] border-0 bg-white p-3.5 text-start text-ink shadow-[0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#f7f7f7]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e0f0ff] text-sm font-bold text-[#00527c]">+</span>
            <span className="min-w-0">
              <b className="block text-sm">מייל חדש</b>
              <span className="block text-[13px] text-[#616161]">גרפיקה, צבעים וקישורים</span>
            </span>
          </button>
          <button type="button" onClick={() => startSms()} className="flex items-center gap-3 rounded-[14px] border-0 bg-white p-3.5 text-start text-ink shadow-[0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#f7f7f7]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ede7fb] text-sm font-bold text-[#5b3fc4]">+</span>
            <span className="min-w-0">
              <b className="block text-sm">SMS חדש</b>
              <span className="block text-[13px] text-[#616161]">טקסט בלבד, עד 250 תווים</span>
            </span>
          </button>
        </div>
        <h2 className="m-0 mt-1.5 text-[15px] font-semibold">ההודעות שלכם</h2>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="grid h-[34px] grid-cols-[minmax(0,1fr)_90px_minmax(0,1.2fr)_140px_40px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]">
            <span>שם</span>
            <span>ערוץ</span>
            <span>תוכן</span>
            <span>סטטוס</span>
            <span />
          </div>
          {rows.length ? rows.map((row) => (
            <div key={`${row.kind}-${row.id}`} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_90px_minmax(0,1.2fr)_140px_40px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-2.5 hover:bg-[#f7f7f7]" onClick={() => row.kind === "email" ? open(emails.find((email) => email.id === row.id) as MarketingEmail) : router.push(`/admin/marketing/sms/${row.id}`)}>
              <b className="truncate">{row.name}</b>
              <span className="inline-flex h-5 w-fit items-center rounded-md px-[7px] text-xs font-semibold" style={row.kind === "email" ? { background: "#e0f0ff", color: "#00527c" } : { background: "#ede7fb", color: "#5b3fc4" }}>{row.kind === "email" ? "דוא״ל" : "SMS"}</span>
              <span className="truncate text-[13px] text-[#4a4a4a]">{row.detail}</span>
              <span className="inline-flex h-5 w-fit items-center rounded-md px-[7px] text-xs font-semibold" style={row.used ? { background: "#e0f0ff", color: "#00527c" } : { background: "#ebebeb", color: "#303030" }}>{row.used ? "באוטומציה" : "לא מחובר"}</span>
              <button type="button" aria-label="מחיקה" onClick={(event) => { event.stopPropagation(); if (row.kind === "email") deleteEmail(row.id); else deleteSms(row.id); toast(row.kind === "email" ? "המייל נמחק" : "ה-SMS נמחק"); }} className="grid size-8 place-items-center rounded-full border-0 bg-transparent text-[#6b6b6b] hover:bg-[#f3f3f3] hover:text-[#1a1a1a]">
                <Icon name="trash" size={16} strokeWidth={1.6} />
              </button>
            </div>
          )) : (
            <div className="border-t border-[#f1f1f1] px-4 py-8 text-center text-sm text-[#4a4a4a]">עדיין אין הודעות. בנו מייל או SMS, או התחילו מאחת התבניות.</div>
          )}
        </div>
        <h2 className="m-0 mt-2.5 text-[15px] font-semibold">התחילו מתבנית</h2>
        <div className="grid gap-3 min-[800px]:grid-cols-3">
          {TEMPLATES.map((template) => (
            <button key={template.key} type="button" className="flex flex-col gap-2 rounded-[14px] border-0 bg-white p-3.5 text-start text-ink shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => startTemplate(template)}>
              <b>{template.name}</b>
              <span className="text-[13px] leading-[18px] text-pretty text-[#4a4a4a]">{template.detail}</span>
              <span className="inline-flex h-5 w-fit items-center rounded-md bg-[#ebebeb] px-[7px] text-xs font-semibold">דוא״ל</span>
            </button>
          ))}
          <button type="button" className="flex flex-col gap-2 rounded-[14px] border-0 bg-white p-3.5 text-start text-ink shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => startSms("היי {first_name}, העגלה שלך עדיין מחכה: {checkout_url}")}>
            <b>SMS לעגלה</b>
            <span className="text-[13px] leading-[18px] text-pretty text-[#4a4a4a]">הודעת טקסט קצרה עם שם הלקוח וקישור לעגלה. בלי תמונה ובלי צבע.</span>
            <span className="inline-flex h-5 w-fit items-center rounded-md bg-[#ebebeb] px-[7px] text-xs font-semibold">SMS</span>
          </button>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}
