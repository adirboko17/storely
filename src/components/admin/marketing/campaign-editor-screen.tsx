"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { EmailHtmlPreview } from "@/components/admin/marketing/email-html-preview";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getEmail, getMarketingVersion, listEmails, subscribeMarketing } from "@/data/mock/marketing-session";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { audienceLabel, campaignStatusLabel, duplicateCampaign, listCampaigns, loadAudience, recordSimulation, saveCampaign, type AudienceKey, type AudienceMember, type MarketingCampaign } from "@/lib/marketing/campaigns";

const field = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";

function localValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

  if (missing) return <p className="px-5 py-6 text-sm">הקמפיין לא נמצא בחנות הזו.</p>;
  if (!campaign) return <p className="px-5 py-6 text-sm text-[#4a4a4a]">טוען קמפיין…</p>;

  const email = campaign.messageId ? getEmail(campaign.messageId) : null;
  const locked = campaign.status === "cancelled";

  async function persist(next: Partial<MarketingCampaign> & { status?: MarketingCampaign["status"]; scheduledAt?: string | null }) {
    const saved = await saveCampaign({
      id: campaign!.id,
      name: next.name ?? campaign!.name,
      messageId: next.messageId === undefined ? campaign!.messageId : next.messageId,
      audience: next.audience ?? campaign!.audience,
      lookbackDays: next.lookbackDays === undefined ? campaign!.lookbackDays : next.lookbackDays,
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

  async function previewAudience() {
    try {
      const rows = await loadAudience(campaign!.audience, campaign!.lookbackDays);
      setAudience(rows);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לטעון קהל");
    }
  }

  async function simulate() {
    try {
      const rows = audience ?? await loadAudience(campaign!.audience, campaign!.lookbackDays);
      setAudience(rows);
      const recorded = await recordSimulation({
        campaignId: campaign!.id,
        eventName: "campaign",
        recipient: rows[0]?.email ?? "",
        dedupeKey: `campaign:${campaign!.id}:${Date.now()}`,
        steps: rows.map((member) => ({
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
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <Link href="/admin/marketing/campaigns" className="text-sm text-[#4a4a4a] no-underline">קמפיינים /</Link>
          <input aria-label="שם הקמפיין" value={campaign.name} disabled={locked} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} className="h-8 min-w-0 flex-1 border-0 bg-transparent text-[15px] font-bold outline-none" />
          <span className="inline-flex h-5 items-center rounded-md bg-[#ebebeb] px-[7px] text-xs font-semibold">{campaignStatusLabel(campaign.status)}</span>
        </div>
        <div className="grid gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <label className="text-sm">
            מייל
            <select className={field} disabled={locked} value={campaign.messageId ?? ""} onChange={(event) => setCampaign({ ...campaign, messageId: event.target.value || null })}>
              <option value="">בחרו מייל מהספרייה</option>
              {emails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            קהל
            <select className={field} disabled={locked} value={campaign.audience} onChange={(event) => setCampaign({ ...campaign, audience: event.target.value as AudienceKey })}>
              {(["subscribed", "all", "fresh", "repeat"] as AudienceKey[]).map((key) => <option key={key} value={key}>{audienceLabel(key)}</option>)}
            </select>
          </label>
          {campaign.audience === "fresh" ? (
            <label className="text-sm">
              ימים אחורה
              <input className={field} inputMode="numeric" disabled={locked} value={campaign.lookbackDays ?? 30} onChange={(event) => setCampaign({ ...campaign, lookbackDays: Number(event.target.value.replace(/[^\d]/g, "")) || 0 })} />
            </label>
          ) : null}
          <label className="text-sm">
            מועד שליחה
            <input className={field} type="datetime-local" disabled={locked} value={when} onChange={(event) => setWhen(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white" disabled={locked} onClick={() => void persist({}).then(() => toast("הטיוטה נשמרה")).catch((error: Error) => toast(error.message))}>שמירת טיוטה</button>
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" disabled={locked} onClick={() => void schedule()}>תזמון</button>
            {campaign.status === "scheduled" ? (
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => void persist({ status: "draft", scheduledAt: null }).then(() => toast("התזמון בוטל")).catch((error: Error) => toast(error.message))}>ביטול תזמון</button>
            ) : null}
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => void duplicateCampaign(campaign).then(() => toast("נוצר עותק בטיוטה")).catch((error: Error) => toast(error.message))}>שכפול</button>
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => void previewAudience()}>הצגת קהל</button>
            <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => void simulate()}>סימולציה</button>
          </div>
        </div>
        {audience ? (
          <div className="rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <b className="text-sm">{audience.length} נמענים</b>
            {audience.length === 0 ? <p className="m-0 mt-2 text-sm text-[#4a4a4a]">אין לקוחות שמתאימים לקהל הזה.</p> : null}
            {audience.map((member) => (
              <div key={member.customerId} className="mt-2 flex items-center gap-2 text-sm">
                <span className="flex-1">{member.name} · {member.email}</span>
                <span className="text-xs font-semibold" style={{ color: member.allowed ? "#0c5132" : "#8e1f0b" }}>{member.allowed ? "היה נשלח" : `חסום · ${member.reason}`}</span>
              </div>
            ))}
          </div>
        ) : null}
        {email ? <EmailHtmlPreview email={email} storeName={getStoreIdentity().name} logoUrl={getSettings().logo} /> : <p className="m-0 text-sm text-[#4a4a4a]">אחרי בחירת מייל תופיע כאן תצוגת ה־HTML.</p>}
      </div>
    </div>
  );
}
