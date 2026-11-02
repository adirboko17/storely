"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { EmailHtmlPreview } from "@/components/admin/marketing/email-html-preview";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getEmail, getMarketingVersion, listEmails, subscribeMarketing } from "@/data/mock/marketing-session";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { formatInteger } from "@/lib/formatting/money";
import { audienceLabel, blockReasonLabel, campaignStatusLabel, duplicateCampaign, listCampaigns, loadAudience, recordSimulation, saveCampaign, type AudienceKey, type AudienceMember, type MarketingCampaign } from "@/lib/marketing/campaigns";
import { customerSegmentDetail, listCustomerSegments, type CustomerSegment } from "@/lib/marketing/customer-segments";

const field = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";

const AUDIENCE_HELP: Record<AudienceKey, string> = {
  subscribed: "רק לקוחות שביקשו לקבל דיוור.",
  all: "כל לקוח עם אימייל, גם אם לא נרשם לדיוור.",
  fresh: "לקוחות שנוספו לחנות בימים שתבחרו.",
  repeat: "לקוחות שרכשו יותר מפעמיים.",
};

function localValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Step({ n, title, detail, children }: { n: number; title: string; detail: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-[#f1f1f1] text-[13px] font-semibold">{n}</span>
      <div className="min-w-0">
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        <p className="m-0 mt-0.5 text-[13px] leading-5 text-[#4a4a4a]">{detail}</p>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

export function CampaignEditorScreen({ campaignId }: { campaignId: string }) {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const emails = listEmails();
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [missing, setMissing] = useState(false);
  const [when, setWhen] = useState("");
  const [audience, setAudience] = useState<AudienceMember[] | null>(null);
  const [audienceState, setAudienceState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);

  useEffect(() => {
    let alive = true;
    listCampaigns().then((rows) => {
      if (!alive) return;
      const found = rows.find((row) => row.id === campaignId) ?? null;
      setCampaign(found);
      setMissing(!found);
      setWhen(localValue(found?.scheduledAt ?? null));
    }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [campaignId, toast]);

  useEffect(() => {
    let alive = true;
    listCustomerSegments().then((rows) => { if (alive) setSegments(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [toast]);

  const selectedSegment = segments.find((segment) => segment.id === campaign?.savedSegmentId) ?? null;

  useEffect(() => {
    if (!campaign) return;
    const audienceKey = campaign.audience;
    const days = campaign.lookbackDays;
    const segment = selectedSegment;
    let alive = true;
    setAudienceState("loading");
    const timer = window.setTimeout(() => {
      loadAudience(audienceKey, days, segment).then((rows) => {
        if (!alive) return;
        setAudience(rows);
        setAudienceState("ready");
        setShowBlocked(false);
      }).catch((error: Error) => {
        if (!alive) return;
        setAudience(null);
        setAudienceState("error");
        toast(error.message);
      });
    }, audienceKey === "fresh" ? 400 : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [campaign?.id, campaign?.audience, campaign?.lookbackDays, campaign?.savedSegmentId, selectedSegment, toast]);

  if (missing) return <p className="px-5 py-6 text-sm">הקמפיין לא נמצא בחנות הזו.</p>;
  if (!campaign) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">טוען קמפיין…</p>;

  const email = campaign.messageId ? getEmail(campaign.messageId) : null;
  const locked = campaign.status === "cancelled";
  const rows = audience ?? [];
  const blocked = rows.filter((member) => !member.allowed);
  const allowedCount = rows.length - blocked.length;
  const reasonCounts = new Map<string, number>();
  for (const member of blocked) reasonCounts.set(member.reason, (reasonCounts.get(member.reason) ?? 0) + 1);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((member) => member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle)).slice(0, 8)
    : [];

  async function persist(next: Partial<MarketingCampaign> & { status?: MarketingCampaign["status"]; scheduledAt?: string | null }) {
    const saved = await saveCampaign({
      id: campaign!.id,
      name: next.name ?? campaign!.name,
      messageId: next.messageId === undefined ? campaign!.messageId : next.messageId,
      audience: next.audience ?? campaign!.audience,
      lookbackDays: next.lookbackDays === undefined ? campaign!.lookbackDays : next.lookbackDays,
      savedSegmentId: next.savedSegmentId === undefined ? campaign!.savedSegmentId : next.savedSegmentId,
      status: (next.status ?? campaign!.status) as "draft" | "scheduled" | "cancelled",
      scheduledAt: next.scheduledAt === undefined ? campaign!.scheduledAt : next.scheduledAt,
    });
    setCampaign(saved);
    return saved;
  }

  async function schedule() {
    const time = new Date(when);
    if (Number.isNaN(time.getTime()) || time.getTime() <= Date.now()) {
      toast("בחרו מועד עתידי");
      return;
    }
    if (!campaign!.messageId) {
      toast("בחרו מייל לפני התזמון");
      return;
    }
    try {
      await persist({ status: "scheduled", scheduledAt: time.toISOString() });
      toast("הקמפיין תוזמן. הוא לא יישלח לפני חיבור ספק");
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לתזמן");
    }
  }

  async function simulate() {
    try {
      const current = audience ?? await loadAudience(campaign!.audience, campaign!.lookbackDays, selectedSegment);
      setAudience(current);
      setAudienceState("ready");
      const recorded = await recordSimulation({
        campaignId: campaign!.id,
        eventName: "campaign",
        recipient: current[0]?.email ?? "",
        dedupeKey: `campaign:${campaign!.id}:${Date.now()}`,
        steps: current.map((member) => ({
          stepType: "email",
          outcome: member.allowed ? "would_send" : "suppressed",
          detail: { address: member.email, reason: member.reason, dispatched: false },
        })),
      });
      toast(recorded.wouldSend ? "הסימולציה נשמרה. אף מייל לא נשלח" : "הסימולציה נשמרה. אין נמען שמותר לשלוח אליו");
    } catch (error) {
      toast(error instanceof Error ? error.message : "הסימולציה נכשלה");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Link href="/admin/marketing/campaigns" className="text-sm text-[#4a4a4a] no-underline">קמפיינים</Link>
            <input aria-label="שם הקמפיין" value={campaign.name} disabled={locked} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} className="mt-1 h-10 w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-base font-bold outline-none" />
          </div>
          <span className="mt-7 inline-flex h-6 items-center rounded-md bg-[#ebebeb] px-2 text-xs font-semibold">{campaignStatusLabel(campaign.status)}</span>
        </div>
        <p className="m-0 text-sm text-[#4a4a4a]">שליחה אחת של המייל הזה לקהל שבחרת, במועד אחד. התזמון נשמר, והמייל יוצא רק אחרי שספק דיוור מחובר.</p>

        <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-5 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <Step n={1} title="המייל שנשלח" detail="נבחר מתוך הספרייה במיילים ו-SMS.">
              <label className="text-sm">
                מייל
                <select className={field} disabled={locked} value={campaign.messageId ?? ""} onChange={(event) => setCampaign({ ...campaign, messageId: event.target.value || null })}>
                  <option value="">בחרו מייל מהספרייה</option>
                  {emails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              {email ? <Link href={`/admin/marketing/emails/${email.id}`} className="mt-2 inline-block text-[13px] text-[#4a4a4a]">עריכת המייל</Link> : <p className="m-0 mt-2 text-[13px] text-[#4a4a4a]">אחרי הבחירה תופיע למטה תצוגה של המייל.</p>}
            </Step>
            <Step n={2} title="למי נשלח" detail={selectedSegment ? customerSegmentDetail(selectedSegment) : AUDIENCE_HELP[campaign.audience]}>
              <label className="text-sm">
                קהל
                <select className={field} disabled={locked} value={campaign.savedSegmentId ? `segment:${campaign.savedSegmentId}` : campaign.audience} onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith("segment:")) {
                    const segment = segments.find((item) => item.id === value.slice(8));
                    setCampaign({ ...campaign, savedSegmentId: segment?.id ?? null, savedSegmentName: segment?.name ?? null });
                    return;
                  }
                  setCampaign({ ...campaign, audience: value as AudienceKey, savedSegmentId: null, savedSegmentName: null });
                }}>
                  {(["subscribed", "all", "fresh", "repeat"] as AudienceKey[]).map((key) => <option key={key} value={key}>{audienceLabel(key)}</option>)}
                  {segments.length ? <optgroup label="פלחים שמורים">{segments.map((segment) => <option key={segment.id} value={`segment:${segment.id}`}>{segment.name}</option>)}</optgroup> : null}
                </select>
              </label>
              {campaign.audience === "fresh" ? (
                <label className="mt-2 block text-sm">
                  כמה ימים אחורה
                  <input className={field} inputMode="numeric" disabled={locked} value={campaign.lookbackDays ?? 30} onChange={(event) => setCampaign({ ...campaign, lookbackDays: Number(event.target.value.replace(/[^\d]/g, "")) || 0 })} />
                </label>
              ) : null}
            </Step>
            <Step n={3} title="מתי נשלח" detail="בחרו מועד עתידי. בלי מועד הקמפיין נשאר טיוטה.">
              <label className="text-sm">
                מועד שליחה
                <input className={field} type="datetime-local" disabled={locked} value={when} onChange={(event) => setWhen(event.target.value)} />
              </label>
            </Step>
            <div className="flex flex-wrap items-center gap-2 border-t border-[#f1f1f1] pt-4">
              <button type="button" className={darkButton} disabled={locked} onClick={() => void persist({}).then(() => toast("הטיוטה נשמרה")).catch((error: Error) => toast(error.message))}>שמירת טיוטה</button>
              <button type="button" className={softButton} disabled={locked} onClick={() => void schedule()}>תזמון</button>
              {campaign.status === "scheduled" ? (
                <button type="button" className={softButton} onClick={() => void persist({ status: "draft", scheduledAt: null }).then(() => toast("התזמון בוטל")).catch((error: Error) => toast(error.message))}>ביטול תזמון</button>
              ) : null}
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-transparent px-2 text-sm font-semibold text-[#4a4a4a]" onClick={() => void duplicateCampaign(campaign).then(() => toast("נוצר עותק בטיוטה")).catch((error: Error) => toast(error.message))}>שכפול</button>
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-transparent px-2 text-sm font-semibold text-[#4a4a4a]" onClick={() => void simulate()}>סימולציה</button>
            </div>
          </div>

          <aside className="grid gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div>
              <h2 className="m-0 text-sm font-semibold">מה יישלח</h2>
              <p className="m-0 mt-0.5 text-[13px] leading-5 text-[#4a4a4a]">{selectedSegment?.name ?? audienceLabel(campaign.audience)}</p>
            </div>
            {audienceState === "loading" ? <p className="m-0 text-sm text-[#4a4a4a]">בודקים מי ייכלל בקהל…</p> : null}
            {audienceState === "error" ? <p className="m-0 text-sm text-[#4a4a4a]">לא הצלחנו לטעון את הקהל.</p> : null}
            {audienceState === "ready" && audience ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[10px] bg-[#f3fbf6] px-3 py-2">
                    <b className="block text-lg" style={{ color: "#0c5132" }}>{formatInteger(allowedCount)}</b>
                    <span className="text-[13px] text-[#4a4a4a]">יקבלו את המייל</span>
                  </div>
                  <div className="rounded-[10px] bg-[#fdf4f2] px-3 py-2">
                    <b className="block text-lg" style={{ color: blocked.length ? "#8e1f0b" : "#4a4a4a" }}>{formatInteger(blocked.length)}</b>
                    <span className="text-[13px] text-[#4a4a4a]">לא יישלח אליהם</span>
                  </div>
                </div>
                {rows.length === 0 ? <p className="m-0 text-sm text-[#4a4a4a]">אין לקוחות שמתאימים לקהל הזה.</p> : null}
                {rows.length >= 1000 ? <p className="m-0 text-[13px] text-[#4a4a4a]">הבדיקה מציגה עד 1,000 לקוחות.</p> : null}
                {[...reasonCounts.entries()].map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span>{blockReasonLabel(reason)}</span>
                    <b>{formatInteger(count)}</b>
                  </div>
                ))}
                {blocked.length > 0 ? (
                  <button type="button" className="justify-self-start text-[13px] font-semibold text-[#4a4a4a]" onClick={() => setShowBlocked((open) => !open)}>
                    {showBlocked ? "הסתרת השמות" : "הצגת מי שלא יישלח"}
                  </button>
                ) : null}
                {showBlocked ? blocked.slice(0, 30).map((member) => (
                  <div key={member.customerId} className="text-sm">
                    <span className="block">{member.name}</span>
                    <span className="text-[12px] text-[#8e1f0b]">{member.email} · {blockReasonLabel(member.reason)}</span>
                  </div>
                )) : null}
                {showBlocked && blocked.length > 30 ? <p className="m-0 text-[13px] text-[#4a4a4a]">מוצגים 30 הראשונים מתוך {formatInteger(blocked.length)}.</p> : null}
                <label className="text-sm">
                  בדיקת לקוח
                  <input className={field} value={query} placeholder="שם או אימייל" onChange={(event) => setQuery(event.target.value)} />
                </label>
                {needle ? matches.map((member) => (
                  <div key={member.customerId} className="text-sm">
                    <span className="block">{member.name}</span>
                    <span className="text-[12px] font-semibold" style={{ color: member.allowed ? "#0c5132" : "#8e1f0b" }}>{member.email} · {member.allowed ? "יקבל את המייל" : blockReasonLabel(member.reason)}</span>
                  </div>
                )) : null}
                {needle && matches.length === 0 ? <p className="m-0 text-[13px] text-[#4a4a4a]">אין לקוח תואם בקהל שנטען.</p> : null}
              </>
            ) : null}
          </aside>
        </div>

        {email ? <EmailHtmlPreview email={email} storeName={getStoreIdentity().name} logoUrl={getSettings().logo} compact /> : null}
      </div>
    </div>
  );
}
