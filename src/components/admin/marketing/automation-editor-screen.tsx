"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity } from "@/data/live/store-identity";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { FLOW_TRIGGERS, getFlow, getMarketingVersion, saveFlow, subscribeMarketing, type Flow, type FlowRule, type FlowStep } from "@/data/mock/marketing-session";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const inputClass = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";

type Branch = "yes" | "no" | "a" | "b";
type Path = Array<number | Branch>;
type Selection = { kind: "library" } | { kind: "trigger" } | { kind: "step"; path: Path } | { kind: "add"; parent: Path; index: number };
type StepKind = "email" | "sms" | "wait" | "cond" | "ab" | "end";

const FLOW_MOTION = `
@keyframes flow-shade { from { opacity: 0 } to { opacity: 1 } }
@keyframes flow-window { from { opacity: 0; transform: translateY(22px) scale(.94) } to { opacity: 1; transform: none } }
@keyframes flow-item { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
.flow-shade { animation: flow-shade 180ms ease both }
.flow-window { animation: flow-window 340ms cubic-bezier(.16,1,.3,1) both }
.flow-item { animation: flow-item 380ms cubic-bezier(.16,1,.3,1) both }
@media (prefers-reduced-motion: reduce) {
  .flow-shade, .flow-window, .flow-item { animation: none }
}
`;

const LIBRARY = [
  { title: "הודעות", items: [
    { kind: "email" as const, name: "אימייל", detail: "שליחה לתיבת הדואר", color: "#1d4ed8" },
    { kind: "sms" as const, name: "SMS", detail: "הודעת טקסט לנייד", color: "#6d28d9" },
  ] },
  { title: "תזמון", items: [
    { kind: "wait" as const, name: "המתנה", detail: "דיליי לפני השלב הבא", color: "#404040" },
  ] },
  { title: "לוגיקה", items: [
    { kind: "cond" as const, name: "פיצול תנאי", detail: "מסלול כן ומסלול לא", color: "#b45309" },
    { kind: "ab" as const, name: "בדיקת A/B", detail: "חלוקת הקהל לשני מסלולים", color: "#0f766e" },
    { kind: "end" as const, name: "סיום", detail: "עצירת המסלול", color: "#991b1b" },
  ] },
];

const FIELDS = [
  { id: "subscribed", label: "מנוי לדיוור", kind: "bool" },
  { id: "opened", label: "פתח את המייל הקודם", kind: "bool" },
  { id: "clicked", label: "לחץ על קישור", kind: "bool" },
  { id: "in_cart", label: "יש מוצר בעגלה", kind: "bool" },
  { id: "paid", label: "שילם", kind: "bool" },
  { id: "orders", label: "מספר הזמנות", kind: "number" },
  { id: "spent", label: "סכום רכישות", kind: "number" },
  { id: "segment", label: "נמצא בפלח", kind: "text" },
] as const;

function fieldOf(id: string) {
  return FIELDS.find((item) => item.id === id) ?? FIELDS[0];
}

function opsFor(kind: "bool" | "number" | "text") {
  if (kind === "number") return [{ id: "gte", label: "לפחות" }, { id: "lt", label: "פחות מ" }];
  if (kind === "text") return [{ id: "is", label: "הוא" }, { id: "is_not", label: "אינו" }];
  return [{ id: "is", label: "הוא" }];
}

function blankStep(kind: StepKind): FlowStep {
  if (kind === "email") return { type: "email", subject: "הודעה חדשה", preview: "", body: "" };
  if (kind === "sms") return { type: "sms", text: "" };
  if (kind === "wait") return { type: "wait", value: "1", unit: "שעות" };
  if (kind === "end") return { type: "end" };
  if (kind === "ab") return { type: "ab", percent: 50, a: [], b: [] };
  return { type: "cond", match: "all", rules: [{ field: "subscribed", op: "is", value: "yes" }], yes: [], no: [] };
}

function tone(step: FlowStep) {
  return LIBRARY.flatMap((group) => group.items).find((item) => item.kind === step.type) ?? LIBRARY[0].items[0];
}

function childList(step: FlowStep, branch: Branch) {
  if (step.type === "cond" && branch === "yes") return step.yes ?? [];
  if (step.type === "cond" && branch === "no") return step.no ?? [];
  if (step.type === "ab" && branch === "a") return step.a ?? [];
  if (step.type === "ab" && branch === "b") return step.b ?? [];
  return null;
}

function withChild(step: FlowStep, branch: Branch, next: FlowStep[]): FlowStep | null {
  if (step.type === "cond" && branch === "yes") return { ...step, yes: next };
  if (step.type === "cond" && branch === "no") return { ...step, no: next };
  if (step.type === "ab" && branch === "a") return { ...step, a: next };
  if (step.type === "ab" && branch === "b") return { ...step, b: next };
  return null;
}

function splitLanes(step: FlowStep) {
  if (step.type === "cond") return [{ key: "yes" as const, label: "כן", tone: "#0c5132", wash: "#f3faf6" }, { key: "no" as const, label: "לא", tone: "#8e1f0b", wash: "#fdf6f5" }];
  if (step.type === "ab") return [{ key: "a" as const, label: `A · ${step.percent}%`, tone: "#0f766e", wash: "#f3fafa" }, { key: "b" as const, label: `B · ${100 - step.percent}%`, tone: "#115e59", wash: "#f7f7f7" }];
  return [];
}

function samePath(a: Path, b: Path) {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

function readList(steps: FlowStep[], parent: Path): FlowStep[] | null {
  if (parent.length === 0) return steps;
  const [index, branch, ...rest] = parent;
  if (typeof index !== "number" || (branch !== "yes" && branch !== "no" && branch !== "a" && branch !== "b")) return null;
  const step = steps[index];
  if (!step) return null;
  const list = childList(step, branch);
  if (!list) return null;
  return readList(list, rest);
}

function mapList(steps: FlowStep[], parent: Path, recipe: (list: FlowStep[]) => FlowStep[]): FlowStep[] {
  if (parent.length === 0) return recipe(steps);
  const [index, branch, ...rest] = parent;
  if (typeof index !== "number" || (branch !== "yes" && branch !== "no" && branch !== "a" && branch !== "b")) return steps;
  return steps.map((step, itemIndex) => {
    if (itemIndex !== index) return step;
    const current = childList(step, branch);
    if (!current) return step;
    const next = mapList(current, rest, recipe);
    return withChild(step, branch, next) ?? step;
  });
}

function getStep(steps: FlowStep[], path: Path) {
  const index = path[path.length - 1];
  if (typeof index !== "number") return null;
  return readList(steps, path.slice(0, -1))?.[index] ?? null;
}

function insertStep(steps: FlowStep[], parent: Path, index: number, step: FlowStep) {
  return mapList(steps, parent, (list) => {
    const next = [...list];
    next.splice(index, 0, step);
    return next;
  });
}

function replaceStep(steps: FlowStep[], path: Path, step: FlowStep) {
  const index = path[path.length - 1];
  if (typeof index !== "number") return steps;
  return mapList(steps, path.slice(0, -1), (list) => list.map((item, itemIndex) => (itemIndex === index ? step : item)));
}

function removeAt(steps: FlowStep[], path: Path) {
  const index = path[path.length - 1];
  if (typeof index !== "number") return steps;
  return mapList(steps, path.slice(0, -1), (list) => list.filter((_, itemIndex) => itemIndex !== index));
}

function summary(step: FlowStep) {
  if (step.type === "email") return { title: "מייל", detail: step.subject || "בלי נושא" };
  if (step.type === "sms") return { title: "SMS", detail: step.text || "הודעה ריקה" };
  if (step.type === "wait") return { title: "המתנה", detail: `${step.value || "0"} ${step.unit}` };
  if (step.type === "end") return { title: "סיום", detail: "המסלול נעצר כאן" };
  if (step.type === "ab") return { title: "בדיקת A/B", detail: `A ${step.percent}% · B ${100 - step.percent}%` };
  const count = step.rules?.length ?? 0;
  return { title: "פיצול תנאי", detail: count ? `${count} תנאים · ${step.match === "any" ? "או" : "וגם"}` : step.text || "הגדירו תנאים" };
}

function holds(stepPath: Path, parent: Path) {
  return parent.length >= stepPath.length && stepPath.every((token, index) => parent[index] === token);
}

function place(steps: FlowStep[], parent: Path, index: number, payload: string) {
  if (payload.startsWith("new:")) {
    const kind = payload.slice(4);
    if (kind !== "email" && kind !== "sms" && kind !== "wait" && kind !== "cond" && kind !== "ab" && kind !== "end") return null;
    return { steps: insertStep(steps, parent, index, blankStep(kind)), path: [...parent, index] as Path };
  }
  if (!payload.startsWith("move:")) return null;
  const from = JSON.parse(payload.slice(5)) as Path;
  if (!Array.isArray(from) || holds(from, parent)) return null;
  const moving = getStep(steps, from);
  const fromIndex = from[from.length - 1];
  if (!moving || typeof fromIndex !== "number") return null;
  let at = index;
  if (samePath(from.slice(0, -1), parent) && fromIndex < at) at -= 1;
  return { steps: insertStep(removeAt(steps, from), parent, at, moving), path: [...parent, at] as Path };
}

let skipClick = false;
let dragEffect: "copy" | "move" = "copy";

function beginDrag(event: { dataTransfer: DataTransfer }, payload: string, effect: "copy" | "move") {
  skipClick = true;
  dragEffect = effect;
  event.dataTransfer.setData("text/plain", payload);
  event.dataTransfer.effectAllowed = effect;
}

function runClick(action: () => void) {
  if (skipClick) return;
  action();
}

function FlowLane({
  steps,
  parent,
  selected,
  onAdd,
  onSelect,
  onDropPayload,
}: {
  steps: FlowStep[];
  parent: Path;
  selected: Selection;
  onAdd: (parent: Path, index: number) => void;
  onSelect: (path: Path) => void;
  onDropPayload: (parent: Path, index: number, payload: string) => void;
}) {
  const endAt = steps.findIndex((step) => step.type === "end");
  return (
    <div className="flex w-full flex-col items-center">
      {steps.map((step, index) => {
        const path = [...parent, index];
        const active = selected.kind === "step" && samePath(selected.path, path);
        const look = tone(step);
        const lanes = splitLanes(step);
        return (
          <div key={path.join("-")} className="flex w-full flex-col items-center">
            {endAt === -1 || index <= endAt ? <DropSlot active={selected.kind === "add" && selected.index === index && samePath(selected.parent, parent)} onClick={() => onAdd(parent, index)} onDrop={(payload) => onDropPayload(parent, index, payload)} /> : <div className="h-3" />}
            <div
              draggable
              onDragStart={(event) => beginDrag(event, `move:${JSON.stringify(path)}`, "move")}
              onDragEnd={() => window.setTimeout(() => { skipClick = false; }, 80)}
              onClick={() => runClick(() => onSelect(path))}
              className={`flex w-full cursor-grab items-center gap-3 bg-white px-3 py-2.5 text-start active:cursor-grabbing ${step.type === "wait" ? "max-w-[260px] rounded-full" : "max-w-[440px] rounded-2xl"}`}
              style={{ boxShadow: active ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.04)" }}
            >
              <Mark kind={step.type} color={look.color} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[#616161]">{summary(step).title}</span>
                <b className="block truncate text-sm">{summary(step).detail}</b>
              </span>
            </div>
            {lanes.length ? (
              <div className="flex w-full max-w-[760px] flex-col items-center">
                <div className="h-3 w-px bg-[#c9c9c9]" />
                <div className="h-px w-1/2 bg-[#c9c9c9]" />
                <div className="grid w-full grid-cols-2 gap-4">
                  {lanes.map((lane) => (
                    <div key={lane.key} className="flex flex-col items-center">
                      <div className="h-3 w-px bg-[#c9c9c9]" />
                      <div className="mb-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ color: lane.tone, background: lane.wash }}>{lane.label}</div>
                      <FlowLane steps={childList(step, lane.key) ?? []} parent={[...path, lane.key]} selected={selected} onAdd={onAdd} onSelect={onSelect} onDropPayload={onDropPayload} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {endAt === -1 ? (
        <DropSlot active={selected.kind === "add" && selected.index === steps.length && samePath(selected.parent, parent)} onClick={() => onAdd(parent, steps.length)} onDrop={(payload) => onDropPayload(parent, steps.length, payload)} />
      ) : null}
    </div>
  );
}

function DropSlot({ active, onClick, onDrop }: { active: boolean; onClick: () => void; onDrop: (payload: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div className="flex flex-col items-center" onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = dragEffect; setOver(true); }} onDragLeave={(event) => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; setOver(false); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setOver(false); onDrop(event.dataTransfer.getData("text/plain")); }}>
      <div className="h-3 w-px bg-[#c9c9c9]" />
      <button type="button" aria-label="הוספת שלב" onClick={onClick} className={`grid place-items-center border-0 bg-white text-sm font-semibold ${over ? "h-9 w-[220px] rounded-xl" : "size-7 rounded-full text-lg leading-none"}`} style={{ boxShadow: over || active ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.16)", background: over ? "#1a1a1a" : "#fff", color: over ? "#fff" : "#1a1a1a" }}>
        {over ? "שחררו כאן" : "+"}
      </button>
      <div className="h-3 w-px bg-[#c9c9c9]" />
    </div>
  );
}

export function AutomationEditorScreen({ flowId }: { flowId: number }) {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const existing = getFlow(flowId);
  const missing = !existing;
  const baseline = existing ?? { id: flowId, name: "", trigger: "", on: false, steps: [], stats: null };
  const [draft, setDraft] = useState<Flow>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(flowId);
  const [selected, setSelected] = useState<Selection>({ kind: "library" });
  const [segmentName, setSegmentName] = useState("");
  const [saving, setSaving] = useState(false);
  if (bound !== flowId) {
    setBound(flowId);
    setDraft(baseline);
    setSaved(baseline);
    setSelected({ kind: "library" });
    setSegmentName("");
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
  const step = selected.kind === "step" ? getStep(draft.steps, selected.path) : null;
  const needsTrigger = draft.trigger === "" || draft.trigger === "בחרו טריגר";

  function updateStep(next: FlowStep) {
    if (selected.kind !== "step") return;
    setDraft({ ...draft, steps: replaceStep(draft.steps, selected.path, next) });
  }

  function choose(kind: StepKind) {
    const parent = selected.kind === "add" ? selected.parent : [];
    const index = selected.kind === "add" ? selected.index : draft.steps.length;
    if (selected.kind !== "add" && draft.steps.some((item) => item.type === "end")) {
      toast("המסלול הראשי כבר נעצר בסיום");
      return;
    }
    const placed = place(draft.steps, parent, index, `new:${kind}`);
    if (!placed) return;
    setDraft({ ...draft, steps: placed.steps });
    setSelected({ kind: "step", path: placed.path });
  }

  function dropAt(parent: Path, index: number, payload: string) {
    try {
      const placed = place(draft.steps, parent, index, payload);
      if (!placed) return;
      setDraft({ ...draft, steps: placed.steps });
      setSelected({ kind: "step", path: placed.path });
    } catch {
      toast("לא הצלחנו להעביר את השלב");
    }
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
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => toast(`הודעת בדיקה נשלחה אל ${getStoreIdentity().ownerEmail}`)}>שליחת בדיקה</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 px-3 text-sm font-semibold text-white" style={{ background: draft.on ? "#8e1f0b" : "#1a1a1a" }} onClick={() => { if (!draft.on && needsTrigger) { setSelected({ kind: "trigger" }); toast("בחרו טריגר לפני ההפעלה"); return; } setDraft({ ...draft, on: !draft.on }); toast(draft.on ? "האוטומציה הושהתה" : "האוטומציה הופעלה"); }}>{draft.on ? "השהיה" : "הפעלה"}</button>
      </div>
      <div className="min-h-[calc(100dvh-92px)] bg-[#f3f3f3] px-6 py-8">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
          <button type="button" onClick={() => setSelected({ kind: "trigger" })} className="flex w-full max-w-[440px] items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-start" style={{ boxShadow: selected.kind === "trigger" ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.04)" }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#111] text-[11px] font-bold text-white">ט</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-[#616161]">טריגר</span>
              <b className="block truncate text-sm">{needsTrigger ? "בחרו טריגר" : draft.trigger}</b>
            </span>
          </button>
          <FlowLane steps={draft.steps} parent={[]} selected={selected} onAdd={(parent, index) => setSelected({ kind: "add", parent, index })} onSelect={(path) => setSelected({ kind: "step", path })} onDropPayload={dropAt} />
        </div>
      </div>
      {selected.kind === "add" ? (
        <FlowWindow title="מה השלב הבא" hint="בחרו מה יקרה כאן במסלול." wide onClose={() => setSelected({ kind: "library" })}>
          <Library onChoose={choose} />
        </FlowWindow>
      ) : null}
      {selected.kind === "step" && step ? (
        <FlowWindow title={summary(step).title} hint={summary(step).detail} onClose={() => setSelected({ kind: "library" })}>
          <StepEditor step={step} onChange={updateStep} onDelete={() => { setDraft({ ...draft, steps: removeAt(draft.steps, selected.path) }); setSelected({ kind: "library" }); }} />
        </FlowWindow>
      ) : null}
      {selected.kind === "trigger" ? (
        <FlowWindow title="טריגר" hint="אירוע רץ לבד כשמשהו קורה. קהל הוא הודעה יזומה, כמו מבצע לכל הלקוחות או לפלח." onClose={() => setSelected({ kind: "library" })}>
          <div className="flex flex-col gap-4">
            {(["אירוע", "קהל"] as const).map((group) => (
              <div key={group} className="flex flex-col gap-1.5">
                <div className="text-[12px] font-bold text-[#616161]">{group === "אירוע" ? "אירועים" : "קהלים"}</div>
                {FLOW_TRIGGERS.filter((item) => item.group === group).map((item) => {
                  const active = draft.trigger === item.label;
                  return (
                    <button key={item.id} type="button" onClick={() => { setDraft({ ...draft, trigger: item.label }); setSelected({ kind: "library" }); }} className="rounded-2xl border-0 px-3 py-2.5 text-start" style={{ background: active ? "#f6f6f6" : "#fff", boxShadow: active ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08)" }}>
                      <b className="block text-sm">{item.label}</b>
                      <span className="text-[13px] text-[#616161]">{item.detail}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <label className="text-sm font-semibold">
              פלח אחר
              <input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} placeholder="שם הפלח" className={inputClass} />
            </label>
            <button type="button" className="h-[30px] self-start rounded-[10px] border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white" onClick={() => { const name = segmentName.trim(); if (!name) { toast("הזינו שם פלח"); return; } setDraft({ ...draft, trigger: `פלח: ${name}` }); setSelected({ kind: "library" }); }}>שימוש בפלח</button>
          </div>
        </FlowWindow>
      ) : null}
    </div>
  );
}

function FlowWindow({ title, hint, wide, onClose, children }: { title: string; hint?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" onMouseDown={onClose}>
      <style>{FLOW_MOTION}</style>
      <div className="flow-shade absolute inset-0 bg-[#1a1a1a]/30 backdrop-blur-[3px]" />
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="flow-window relative flex max-h-[min(680px,calc(100dvh-48px))] w-full flex-col overflow-hidden rounded-[22px] bg-white" style={{ maxWidth: wide ? 640 : 460, boxShadow: "0 30px 80px rgba(0,0,0,.22), 0 0 0 1px rgba(255,255,255,.4)" }}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold">{title}</div>
            {hint ? <p className="m-0 mt-1 text-[13px] leading-5 text-[#616161]">{hint}</p> : null}
          </div>
          <button type="button" aria-label="סגירה" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-[#f3f3f3]">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function StepEditor({ step, onChange, onDelete }: { step: FlowStep; onChange: (next: FlowStep) => void; onDelete: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {step.type === "email" ? (
        <>
          <label className="text-sm font-semibold">נושא<input value={step.subject} onChange={(event) => onChange({ ...step, subject: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold">תצוגה מקדימה<input value={step.preview} onChange={(event) => onChange({ ...step, preview: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-semibold">גוף<textarea value={step.body} onChange={(event) => onChange({ ...step, body: event.target.value })} rows={5} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label>
        </>
      ) : null}
      {step.type === "sms" ? <label className="text-sm font-semibold">הודעה<textarea value={step.text} onChange={(event) => onChange({ ...step, text: event.target.value })} rows={4} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label> : null}
      {step.type === "wait" ? (
        <label className="text-sm font-semibold">
          כמה לחכות
          <span className="mt-1 grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <input value={step.value} onChange={(event) => onChange({ ...step, value: event.target.value.replace(/[^\d]/g, "") })} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" />
            <select value={step.unit} onChange={(event) => onChange({ ...step, unit: event.target.value })} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 font-normal">
              {["דקות", "שעות", "ימים"].map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </span>
        </label>
      ) : null}
      {step.type === "cond" ? <ConditionEditor step={step} onChange={onChange} /> : null}
      {step.type === "ab" ? (
        <label className="text-sm font-semibold">
          אחוז למסלול A
          <input value={String(step.percent)} onChange={(event) => { const percent = Math.min(99, Math.max(1, Number(event.target.value.replace(/[^\d]/g, "")) || 1)); onChange({ ...step, percent }); }} className={inputClass} />
          <span className="mt-1 block font-normal text-[#4a4a4a]">מסלול B מקבל {100 - step.percent}%.</span>
        </label>
      ) : null}
      {step.type === "end" ? <p className="m-0 text-sm text-[#4a4a4a]">המסלול נעצר כאן. לא מתווספים שלבים אחרי הסיום.</p> : null}
      <button type="button" className="self-start text-sm text-[#8e1f0b]" onClick={onDelete}>מחיקת השלב</button>
    </div>
  );
}

function Mark({ kind, color }: { kind: StepKind; color: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: color }}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {kind === "email" ? <path d="M2.5 4.5h11v7h-11zM2.5 5l5.5 4 5.5-4" /> : null}
        {kind === "sms" ? <path d="M3 3.5h10v7H6.5L3.5 13V3.5z" /> : null}
        {kind === "wait" ? <><circle cx="8" cy="8" r="5.2" /><path d="M8 5.2V8l2 1.4" /></> : null}
        {kind === "cond" ? <path d="M8 2.5v3M8 5.5l-4 3v5M8 5.5l4 3v5" /> : null}
        {kind === "ab" ? <path d="M3 3.5h4v9H3zM9 3.5h4v9H9z" /> : null}
        {kind === "end" ? <path d="M4.5 4.5h7v7h-7z" /> : null}
      </svg>
    </span>
  );
}

function Library({ onChoose }: { onChoose: (kind: StepKind) => void }) {
  let delay = 0;
  return (
    <div className="flex flex-col gap-4">
      {LIBRARY.map((group) => (
        <div key={group.title}>
          <div className="mb-2 text-[12px] font-bold text-[#616161]">{group.title}</div>
          <div className="grid grid-cols-2 gap-2">
            {group.items.map((item) => {
              const wait = delay;
              delay += 45;
              return (
                <button key={item.kind} type="button" onClick={() => onChoose(item.kind)} className="flow-item flex items-center gap-2.5 rounded-2xl border-0 bg-white px-3 py-3 text-start shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,.06),0_0_0_1px_rgba(0,0,0,.1)]" style={{ animationDelay: `${wait}ms`, gridColumn: group.items.length === 1 ? "1 / -1" : undefined }}>
                  <Mark kind={item.kind} color={item.color} />
                  <span className="min-w-0">
                    <b className="block text-sm">{item.name}</b>
                    <span className="block text-[12px] leading-4 text-[#616161]">{item.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionEditor({ step, onChange }: { step: Extract<FlowStep, { type: "cond" }>; onChange: (next: FlowStep) => void }) {
  const match = step.match === "any" ? "any" : "all";
  const rules = step.rules?.length ? step.rules : [];

  function write(nextRules: FlowRule[], nextMatch = match) {
    onChange({ ...step, match: nextMatch, rules: nextRules, text: undefined });
  }

  function changeRule(index: number, patch: Partial<FlowRule>) {
    write(rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {([{ id: "all", label: "וגם" }, { id: "any", label: "או" }] as const).map((item) => (
          <button key={item.id} type="button" onClick={() => write(rules.length ? rules : [{ field: "subscribed", op: "is", value: "yes" }], item.id)} className="h-[30px] rounded-[10px] border-0 px-3 text-sm font-semibold" style={{ background: match === item.id ? "#1a1a1a" : "#ebebeb", color: match === item.id ? "#fff" : "#1a1a1a" }}>{item.label}</button>
        ))}
      </div>
      <p className="m-0 text-[13px] leading-5 text-[#4a4a4a]">{match === "all" ? "כל התנאים צריכים להתקיים כדי להיכנס למסלול אם כן." : "מספיק שאחד מהתנאים מתקיים כדי להיכנס למסלול אם כן."}</p>
      {rules.map((rule, index) => {
        const field = fieldOf(rule.field);
        const ops = opsFor(field.kind);
        return (
          <div key={index} className="flex flex-col gap-2 rounded-[10px] p-2 shadow-[0_0_0_1px_#e3e3e3]">
            <select value={field.id} onChange={(event) => { const next = fieldOf(event.target.value); const op = opsFor(next.kind)[0]?.id ?? "is"; changeRule(index, { field: next.id, op, value: next.kind === "bool" ? "yes" : next.kind === "number" ? "1" : "" }); }} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm">
              {FIELDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <select value={ops.some((item) => item.id === rule.op) ? rule.op : ops[0]?.id} onChange={(event) => changeRule(index, { op: event.target.value })} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm">
                {ops.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              {field.kind === "bool" ? (
                <select value={rule.value === "no" ? "no" : "yes"} onChange={(event) => changeRule(index, { value: event.target.value })} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm">
                  <option value="yes">כן</option>
                  <option value="no">לא</option>
                </select>
              ) : (
                <input value={rule.value} onChange={(event) => changeRule(index, { value: field.kind === "number" ? event.target.value.replace(/[^\d]/g, "") : event.target.value })} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm" />
              )}
            </div>
            {rules.length > 1 ? <button type="button" className="self-start text-[13px] text-[#8e1f0b]" onClick={() => write(rules.filter((_, ruleIndex) => ruleIndex !== index))}>הסרת תנאי</button> : null}
          </div>
        );
      })}
      <button type="button" className="h-[30px] self-start rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => write([...rules, { field: "subscribed", op: "is", value: "yes" }])}>הוספת תנאי</button>
      {step.text && rules.length === 0 ? <p className="m-0 text-[13px] text-[#4a4a4a]">תנאי קודם: {step.text}</p> : null}
    </div>
  );
}
