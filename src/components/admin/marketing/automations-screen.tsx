"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { createFlow, getMarketingVersion, listFlows, subscribeMarketing, toggleFlow } from "@/data/mock/marketing-session";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

const TEMPLATES = [
  { key: "cart" as const, name: "עגלה נטושה", detail: "תזכורת שעה אחרי שהלקוח עזב עגלה מלאה, ותזכורת שנייה עם הנחה.", channels: ["דוא״ל", "SMS"] },
  { key: "welcome" as const, name: "סדרת ברוכים הבאים", detail: "היכרות עם המותג וקוד הנחה לרכישה ראשונה.", channels: ["דוא״ל"] },
  { key: "thanks" as const, name: "תודה על הרכישה", detail: "הודעת תודה, ואחרי שבוע בקשה לביקורת.", channels: ["דוא״ל"] },
  { key: "blank" as const, name: "אוטומציה ריקה", detail: "בנו אוטומציה משלכם מאפס.", channels: [] as string[] },
];

export function AutomationsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const flows = listFlows();
  const sent = flows.reduce((sum, flow) => sum + (flow.stats?.[0] ?? 0), 0);
  const revenue = flows.reduce((sum, flow) => sum + (flow.stats?.[3] ?? 0), 0);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[15px] font-bold">אוטומציות</h1>
          <button type="button" className={softButton} onClick={() => toast("שם שולח: Storely · שעות שקטות: 22:00–08:00")}>הגדרות שליחה</button>
          <button type="button" className={darkButton} onClick={() => { const flow = createFlow("blank"); router.push(`/admin/marketing/automations/${flow.id}`); }}>יצירת אוטומציה</button>
        </div>
        <div className="grid overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)] min-[800px]:grid-cols-4">
          {[["אוטומציות פעילות", String(flows.filter((flow) => flow.on).length)], ["הודעות שנשלחו (30 יום)", formatInteger(sent)], ["הכנסות מאוטומציות", formatMoney0(revenue)], ["יתרת SMS", "4,820"]].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 border-e border-[#ebebeb] px-[18px] py-3.5"><span className="text-[13px] text-[#4a4a4a]">{label}</span><b dir="ltr" className="text-right text-lg">{value}</b></div>
          ))}
        </div>
        <h2 className="m-0 mt-1.5 text-[15px] font-semibold">האוטומציות שלכם</h2>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="grid h-[34px] grid-cols-[minmax(0,1fr)_110px_90px_90px_90px_110px_50px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]"><span>שם</span><span>ערוץ</span><span className="text-left">נשלחו</span><span className="text-left">פתיחה</span><span className="text-left">הקלקה</span><span className="text-left">הכנסות</span><span>פעיל</span></div>
          {flows.map((flow) => {
            const channels = [...new Set(flow.steps.filter((step) => step.type === "email" || step.type === "sms").map((step) => step.type))];
            return (
              <div key={flow.id} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_110px_90px_90px_90px_110px_50px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-2.5 hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/marketing/automations/${flow.id}`)}>
                <div><b className="block">{flow.name}</b><span className="text-xs text-ink-secondary">טריגר: {flow.trigger}</span></div>
                <div className="flex gap-1">{channels.map((channel) => <span key={channel} className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: channel === "email" ? "#e0f0ff" : "#ede7fb", color: channel === "email" ? "#00527c" : "#5b3fc4" }}>{channel === "email" ? "דוא״ל" : "SMS"}</span>)}</div>
                <span className="text-left">{flow.stats ? formatInteger(flow.stats[0]) : "—"}</span>
                <span dir="ltr" className="text-left">{flow.stats?.[1] ?? "—"}</span>
                <span dir="ltr" className="text-left">{flow.stats?.[2] ?? "—"}</span>
                <b dir="ltr" className="text-left">{flow.stats ? formatMoney0(flow.stats[3]) : "—"}</b>
                <button type="button" role="switch" aria-checked={flow.on} className="relative h-[18px] w-8 rounded-full border-0" style={{ background: flow.on ? "#303030" : "#d4d4d4" }} onClick={(event) => { event.stopPropagation(); toggleFlow(flow.id); toast(flow.on ? "האוטומציה הושהתה" : "האוטומציה הופעלה"); }}><span className="absolute top-0.5 size-3.5 rounded-full bg-white" style={{ left: flow.on ? 16 : 2 }} /></button>
              </div>
            );
          })}
        </div>
        <h2 className="m-0 mt-2.5 text-[15px] font-semibold">התחילו מתבנית</h2>
        <div className="grid gap-3 min-[800px]:grid-cols-4">
          {TEMPLATES.map((template) => (
            <button key={template.key} type="button" className="flex flex-col gap-2 rounded-[14px] border-0 bg-white p-3.5 text-start text-ink shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => { const flow = createFlow(template.key); router.push(`/admin/marketing/automations/${flow.id}`); }}>
              <b>{template.name}</b>
              <span className="text-[13px] leading-[18px] text-pretty text-[#4a4a4a]">{template.detail}</span>
              <div className="flex gap-1">{template.channels.map((channel) => <span key={channel} className="inline-flex h-5 items-center rounded-md bg-[#ebebeb] px-[7px] text-xs font-semibold">{channel}</span>)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}
