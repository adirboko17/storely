"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getEmail, getSms, saveFlow, type Flow } from "@/data/mock/marketing-session";
import { getSettings } from "@/data/mock/settings-session";
import { deliveryDecision, recordSimulation } from "@/lib/marketing/campaigns";
import { renderEmailDocument, sampleEmailProfile } from "@/lib/marketing/email-document";
import { simulateFlow, simulationDedupeKey, type SimulationProfile, type SimulationResult } from "@/lib/marketing/simulate";

const empty: SimulationProfile = {
  email: "dana@example.test",
  phone: "0500000000",
  name: "דנה לוי",
  subscribed: true,
  opened: false,
  clicked: false,
  inCart: true,
  paid: false,
  orders: 0,
  spent: 0,
  segment: "",
};

export function SimulationPanel({ flow, eventLabel, onClose }: { flow: Flow; eventLabel: string; onClose: () => void }) {
  const { toast } = useAdmin();
  const [profile, setProfile] = useState<SimulationProfile>(empty);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      saveFlow(flow);
      const simulated = await simulateFlow(flow, eventLabel || flow.trigger, profile, (channel, address) => deliveryDecision(channel, address), {
        email: (id) => {
          const email = getEmail(id);
          return email ? renderEmailDocument(email, { ...sampleEmailProfile(getStoreIdentity().name, getSettings().logo), firstName: profile.name.split(" ")[0] || profile.name, fullName: profile.name, email: profile.email }) : null;
        },
        sms: (id) => getSms(id)?.text ?? "",
      });
      const recorded = await recordSimulation({
        flowId: flow.id,
        eventName: eventLabel || flow.trigger,
        recipient: profile.email,
        dedupeKey: simulationDedupeKey(flow.id, eventLabel || flow.trigger, profile.email),
        steps: simulated.steps,
      });
      setResult(simulated);
      toast(recorded.duplicate ? "האירוע כבר סומלץ לנמען הזה ולא רץ שוב" : "הסימולציה נשמרה. לא נשלח אימייל או SMS");
    } catch (error) {
      toast(error instanceof Error ? error.message : "הסימולציה נכשלה");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-2xl bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,.16)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <b className="flex-1 text-sm">סימולציה יבשה</b>
          <button type="button" className="border-0 bg-transparent text-sm" onClick={onClose}>סגירה</button>
        </div>
        <p className="text-sm text-[#4a4a4a]">המסלול רץ על הטריגר «{eventLabel || flow.trigger}» מול פרופיל בדיקה. זמני ההמתנה נרשמים ולא עוצרים את הריצה. שום הודעה לא יוצאת.</p>
        <div className="grid gap-2">
          <input aria-label="אימייל לבדיקה" className="h-[34px] rounded-[10px] border border-[#c9c9c9] px-3 text-sm" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} />
          <input aria-label="טלפון לבדיקה" className="h-[34px] rounded-[10px] border border-[#c9c9c9] px-3 text-sm" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.subscribed} onChange={(event) => setProfile({ ...profile, subscribed: event.target.checked })} />מנוי לדיוור</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.inCart} onChange={(event) => setProfile({ ...profile, inCart: event.target.checked })} />יש מוצר בעגלה</label>
          <label className="text-sm">מספר הזמנות<input className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] px-3" inputMode="numeric" value={profile.orders} onChange={(event) => setProfile({ ...profile, orders: Number(event.target.value.replace(/[^\d]/g, "")) || 0 })} /></label>
        </div>
        <button type="button" disabled={running} className="mt-3 h-9 rounded-[10px] border-0 bg-[#1a1a1a] px-4 text-sm font-semibold text-white" onClick={() => void run()}>{running ? "מריץ…" : "הרצת סימולציה"}</button>
        {result ? (
          <ol className="m-0 mt-3 list-none p-0">
            {result.steps.map((step, index) => (
              <li key={`${step.stepType}-${index}`} className="border-t border-[#f1f1f1] py-2 text-sm">
                <b>{step.stepType}</b> · {step.outcome}
                {step.outcome === "would_send" ? " · היה נשלח, אבל הספק לא מחובר" : ""}
                {step.outcome === "suppressed" ? ` · נחסם (${String(step.detail.reason ?? "")})` : ""}
                {step.outcome === "wait" ? ` · ${String(step.detail.minutes ?? 0)} דקות, בסימולציה חלפו 0` : ""}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
