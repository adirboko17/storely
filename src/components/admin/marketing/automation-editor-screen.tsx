"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { getFlow, getMarketingVersion, saveFlow, subscribeMarketing, type Flow, type FlowStep } from "@/data/mock/marketing-session";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

export function AutomationEditorScreen({ flowId }: { flowId: number }) {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const existing = getFlow(flowId);
  const missing = !existing;
  const baseline = existing ?? { id: flowId, name: "", trigger: "", on: false, steps: [], stats: null };
  const [draft, setDraft] = useState<Flow>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(flowId);
  const [selected, setSelected] = useState(-1);
  const [saving, setSaving] = useState(false);
  if (bound !== flowId) {
    setBound(flowId);
    setDraft(baseline);
    setSaved(baseline);
    setSelected(-1);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  function save() {
    setSaving(true);
    window.setTimeout(() => {
      saveFlow(draft);
      setSaved(draft);
      setSaving(false);
      toast("האוטומציה נשמרה");
    }, 400);
  }
  useUnsavedEditor(dirty, saving, save, () => setDraft(saved));
  if (missing) notFound();
  const step = selected >= 0 ? draft.steps[selected] : null;

  function updateStep(next: FlowStep) {
    setDraft({ ...draft, steps: draft.steps.map((item, index) => (index === selected ? next : item)) });
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href="/admin/marketing/automations" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">אוטומציות /</span>
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-8 min-w-0 flex-1 border-0 text-[15px] font-bold outline-none" style={clearInput} />
        <span className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: draft.on ? "#cdfee1" : "#ebebeb", color: draft.on ? "#0c5132" : "#303030" }}>{draft.on ? "פעיל" : "טיוטה"}</span>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => toast("הודעת בדיקה נשלחה אל maya@lavana.co.il")}>שליחת בדיקה</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 px-3 text-sm font-semibold text-white" style={{ background: draft.on ? "#8e1f0b" : "#1a1a1a" }} onClick={() => { setDraft({ ...draft, on: !draft.on }); toast(draft.on ? "האוטומציה הושהתה" : "האוטומציה הופעלה"); }}>{draft.on ? "השהיה" : "הפעלה"}</button>
      </div>
      <div className="grid min-h-[520px] flex-1 min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col items-center gap-2 px-6 py-6">
          <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-[0_0_0_1px_rgba(0,0,0,.08)]">טריגר: {draft.trigger}</div>
          {draft.steps.map((item, index) => (
            <button key={index} type="button" className="w-full max-w-[420px] rounded-xl border-0 bg-white px-4 py-3 text-start shadow-[0_0_0_1px_rgba(0,0,0,.08)]" style={{ boxShadow: selected === index ? "0 0 0 2px #005bd3" : undefined }} onClick={() => setSelected(index)}>
              <b>{item.type === "wait" ? `המתנה ${item.value} ${item.unit}` : item.type === "cond" ? item.text : item.type === "email" ? item.subject : "SMS"}</b>
              <div className="text-[13px] text-[#4a4a4a]">{item.type === "email" ? item.preview : item.type === "sms" ? item.text : item.type}</div>
            </button>
          ))}
          <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { type: "email", subject: "הודעה חדשה", preview: "תצוגה מקדימה", body: "" }] })}>הוספת שלב</button>
        </div>
        <aside className="border-s border-[#ebebeb] bg-white p-4">
          {step ? (
            <div className="flex flex-col gap-3">
              <div className="font-semibold">עריכת שלב</div>
              {step.type === "email" ? (
                <>
                  <label className="text-sm font-semibold">נושא<input value={step.subject} onChange={(event) => updateStep({ ...step, subject: event.target.value })} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" /></label>
                  <label className="text-sm font-semibold">תצוגה מקדימה<input value={step.preview} onChange={(event) => updateStep({ ...step, preview: event.target.value })} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" /></label>
                  <label className="text-sm font-semibold">גוף<textarea value={step.body} onChange={(event) => updateStep({ ...step, body: event.target.value })} rows={5} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label>
                </>
              ) : null}
              {step.type === "sms" ? <label className="text-sm font-semibold">הודעה<textarea value={step.text} onChange={(event) => updateStep({ ...step, text: event.target.value })} rows={4} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label> : null}
              {step.type === "wait" ? <label className="text-sm font-semibold">משך<input value={step.value} onChange={(event) => updateStep({ ...step, value: event.target.value })} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" /></label> : null}
              {step.type === "cond" ? <label className="text-sm font-semibold">תנאי<input value={step.text} onChange={(event) => updateStep({ ...step, text: event.target.value })} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" /></label> : null}
              <button type="button" className="self-start text-sm text-[#8e1f0b]" onClick={() => { setDraft({ ...draft, steps: draft.steps.filter((_, index) => index !== selected) }); setSelected(-1); }}>מחיקת השלב</button>
            </div>
          ) : <div className="text-sm text-ink-secondary">בחרו שלב כדי לערוך אותו.</div>}
        </aside>
      </div>
    </div>
  );
}
