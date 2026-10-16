"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { FLOW_TRIGGERS, TRIGGER_WINDOWS, createEmail, createSms, deleteFlow, emailReady, getEmail, getFlow, getMarketingVersion, getSms, listEmails, listSms, lookbackPhrase, saveFlow, smsReady, subscribeMarketing, triggerTitle, type Flow, type FlowRule, type FlowStep } from "@/data/mock/marketing-session";
import { getOrderSessionVersion, subscribeOrderSession } from "@/data/mock/order-session";
import { getPeopleVersion, subscribePeople } from "@/data/mock/people-session";
import { customerCountLabel, timedTrigger, triggerAudienceCount } from "@/data/mock/trigger-audience";
import { SimulationPanel } from "@/components/admin/marketing/simulation-panel";
import { cn } from "@/lib/cn";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const inputClass = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";

type Branch = "yes" | "no" | "a" | "b" | "mail" | "phone";
type Path = Array<number | Branch>;
type Selection = { kind: "library" } | { kind: "trigger" } | { kind: "step"; path: Path } | { kind: "add"; parent: Path; index: number } | { kind: "replace"; path: Path };
type StepKind = "email" | "sms" | "wait" | "cond" | "ab" | "both" | "end";

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
    { kind: "both" as const, name: "שני מסלולים", detail: "כולם מקבלים גם מייל וגם SMS", color: "#5b3fc4" },
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

function seedEmptyBoth(steps: FlowStep[]): FlowStep[] | null {
  let changed = false;
  const next = steps.map((step) => {
    if (step.type === "cond" || step.type === "ab" || step.type === "both") {
      const branches = step.type === "cond" ? (["yes", "no"] as const) : step.type === "ab" ? (["a", "b"] as const) : (["mail", "phone"] as const);
      let copy: FlowStep = step;
      for (const branch of branches) {
        const list = childList(step, branch) ?? [];
        const seeded = step.type === "both" && !step.mail?.length && !step.phone?.length
          ? branch === "mail" ? [{ type: "email" as const, emailId: "" }] : [{ type: "sms" as const, smsId: "" }]
          : seedEmptyBoth(list);
        if (seeded) {
          const updated = withChild(copy, branch, seeded);
          if (updated) {
            copy = updated;
            changed = true;
          }
        }
      }
      return copy;
    }
    return step;
  });
  return changed ? next : null;
}

function blankStep(kind: StepKind): FlowStep {
  if (kind === "email") return { type: "email", emailId: "" };
  if (kind === "sms") return { type: "sms", smsId: "" };
  if (kind === "wait") return { type: "wait", value: "1", unit: "שעות" };
  if (kind === "end") return { type: "end" };
  if (kind === "ab") return { type: "ab", percent: 50, a: [], b: [] };
  if (kind === "both") return { type: "both", mail: [{ type: "email", emailId: "" }], phone: [{ type: "sms", smsId: "" }] };
  return { type: "cond", match: "all", rules: [{ field: "subscribed", op: "is", value: "yes" }], yes: [], no: [] };
}

function tone(step: FlowStep) {
  const items = LIBRARY.flatMap((group) => group.items.map((item) => ({ ...item })));
  return items.find((item) => item.kind === step.type) ?? items[0];
}

function childList(step: FlowStep, branch: Branch) {
  if (step.type === "cond" && branch === "yes") return step.yes ?? [];
  if (step.type === "cond" && branch === "no") return step.no ?? [];
  if (step.type === "ab" && branch === "a") return step.a ?? [];
  if (step.type === "ab" && branch === "b") return step.b ?? [];
  if (step.type === "both" && branch === "mail") return step.mail ?? [];
  if (step.type === "both" && branch === "phone") return step.phone ?? [];
  return null;
}

function withChild(step: FlowStep, branch: Branch, next: FlowStep[]): FlowStep | null {
  if (step.type === "cond" && branch === "yes") return { ...step, yes: next };
  if (step.type === "cond" && branch === "no") return { ...step, no: next };
  if (step.type === "ab" && branch === "a") return { ...step, a: next };
  if (step.type === "ab" && branch === "b") return { ...step, b: next };
  if (step.type === "both" && branch === "mail") return { ...step, mail: next };
  if (step.type === "both" && branch === "phone") return { ...step, phone: next };
  return null;
}

function splitLanes(step: FlowStep) {
  if (step.type === "cond") return [{ key: "yes" as const, label: "כן", tone: "#0c5132", wash: "#f3faf6" }, { key: "no" as const, label: "לא", tone: "#8e1f0b", wash: "#fdf6f5" }];
  if (step.type === "ab") return [{ key: "a" as const, label: `A · ${step.percent}%`, tone: "#0f766e", wash: "#f3fafa" }, { key: "b" as const, label: `B · ${100 - step.percent}%`, tone: "#115e59", wash: "#f7f7f7" }];
  if (step.type === "both") return [{ key: "mail" as const, label: "מייל", tone: "#1d4ed8", wash: "#eef4ff" }, { key: "phone" as const, label: "SMS", tone: "#5b3fc4", wash: "#f6f3ff" }];
  return [];
}

function isBranch(value: unknown): value is Branch {
  return value === "yes" || value === "no" || value === "a" || value === "b" || value === "mail" || value === "phone";
}

function samePath(a: Path, b: Path) {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

function readList(steps: FlowStep[], parent: Path): FlowStep[] | null {
  if (parent.length === 0) return steps;
  const [index, branch, ...rest] = parent;
  if (typeof index !== "number" || !isBranch(branch)) return null;
  const step = steps[index];
  if (!step) return null;
  const list = childList(step, branch);
  if (!list) return null;
  return readList(list, rest);
}

function mapList(steps: FlowStep[], parent: Path, recipe: (list: FlowStep[]) => FlowStep[]): FlowStep[] {
  if (parent.length === 0) return recipe(steps);
  const [index, branch, ...rest] = parent;
  if (typeof index !== "number" || !isBranch(branch)) return steps;
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
  if (step.type === "email") return { title: "מייל", detail: (step.emailId ? getEmail(step.emailId)?.name : "") || "בחרו מייל" };
  if (step.type === "sms") return { title: "SMS", detail: (step.smsId ? getSms(step.smsId)?.name : "") || "בחרו SMS" };
  if (step.type === "wait") return { title: "המתנה", detail: `${step.value || "0"} ${step.unit}` };
  if (step.type === "end") return { title: "סיום", detail: "המסלול נעצר כאן" };
  if (step.type === "ab") return { title: "בדיקת A/B", detail: `A ${step.percent}% · B ${100 - step.percent}%` };
  if (step.type === "both") return { title: "שני מסלולים", detail: "כולם מקבלים גם מייל וגם SMS" };
  const count = step.rules?.length ?? 0;
  return { title: "פיצול תנאי", detail: count ? `${count} תנאים · ${step.match === "any" ? "או" : "וגם"}` : step.text || "הגדירו תנאים" };
}

function stepReady(step: FlowStep) {
  if (step.type === "email") return emailReady(step.emailId);
  if (step.type === "sms") return smsReady(step.smsId);
  if (step.type === "wait") return Number(step.value) > 0;
  if (step.type === "end") return true;
  if (step.type === "ab") return step.percent >= 1 && step.percent <= 99;
  if (step.type === "both") return true;
  const rules = step.rules ?? [];
  if (!rules.length) return Boolean(step.text?.trim());
  return rules.every((rule) => {
    const field = fieldOf(rule.field);
    if (field.kind === "bool") return rule.value === "yes" || rule.value === "no";
    return rule.value.trim().length > 0;
  });
}

function priorBlock(steps: FlowStep[], trigger: string, parent: Path, index: number): { message: string; focus: Selection } | null {
  if (trigger.trim() === "" || trigger === "בחרו טריגר") {
    return { message: "בחרו טריגר לפני שממשיכים לשלב הבא", focus: { kind: "trigger" } };
  }
  if (index > 0) {
    const previous = readList(steps, parent)?.[index - 1];
    if (previous && !stepReady(previous)) {
      return { message: "מלאו את פרטי השלב הקודם לפני שממשיכים", focus: { kind: "step", path: [...parent, index - 1] } };
    }
    return null;
  }
  if (parent.length === 0) return null;
  const owner = parent.slice(0, -1);
  const previous = getStep(steps, owner);
  if (previous && !stepReady(previous)) {
    return { message: "מלאו את פרטי השלב הקודם לפני שממשיכים", focus: { kind: "step", path: owner } };
  }
  return null;
}

function holds(stepPath: Path, parent: Path) {
  return parent.length >= stepPath.length && stepPath.every((token, index) => parent[index] === token);
}

function place(steps: FlowStep[], parent: Path, index: number, payload: string) {
  if (payload.startsWith("new:")) {
    const kind = payload.slice(4);
    if (kind !== "email" && kind !== "sms" && kind !== "wait" && kind !== "cond" && kind !== "ab" && kind !== "both" && kind !== "end") return null;
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
  onReplace,
  onRemove,
  onDropPayload,
}: {
  steps: FlowStep[];
  parent: Path;
  selected: Selection;
  onAdd: (parent: Path, index: number) => void;
  onSelect: (path: Path) => void;
  onReplace: (path: Path) => void;
  onRemove: (path: Path) => void;
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
              className={`flex w-full cursor-grab items-center gap-3 bg-white px-3 py-2.5 text-start active:cursor-grabbing ${step.type === "wait" ? "max-w-[440px] rounded-full" : "max-w-[440px] rounded-2xl"}`}
              style={{ boxShadow: active ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.04)" }}
            >
              <Mark kind={step.type} color={look.color} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-[#616161]">{summary(step).title}</span>
                <b className="block truncate text-sm">{summary(step).detail}</b>
              </span>
              <span className="flex shrink-0 items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
                <button type="button" onClick={(event) => { event.stopPropagation(); onReplace(path); }} className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold text-[#1a1a1a] hover:bg-[#e6e6e6]">החלפה</button>
                <button type="button" aria-label="מחיקה" onClick={(event) => { event.stopPropagation(); onRemove(path); }} className="grid size-7 place-items-center rounded-full border-0 bg-transparent text-[#6b6b6b] hover:bg-[#f3f3f3] hover:text-[#1a1a1a]">
                  <Icon name="trash" size={16} strokeWidth={1.6} />
                </button>
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
                      <FlowLane steps={childList(step, lane.key) ?? []} parent={[...path, lane.key]} selected={selected} onAdd={onAdd} onSelect={onSelect} onReplace={onReplace} onRemove={onRemove} onDropPayload={onDropPayload} />
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
  const router = useRouter();
  const { toast, narrow, navCollapsed } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  const existing = getFlow(flowId);
  const missing = !existing;
  const baseline = existing ?? { id: flowId, name: "", trigger: "", on: false, steps: [], stats: null };
  const [draft, setDraft] = useState<Flow>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(flowId);
  const [selected, setSelected] = useState<Selection>({ kind: "library" });
  const [saving, setSaving] = useState(false);
<<<<<<< HEAD
  const [simulate, setSimulate] = useState(false);
=======
  const [removeOpen, setRemoveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
>>>>>>> badfc7635e55322105934465ec7648b752ea42cc
  if (bound !== flowId) {
    setBound(flowId);
    setDraft(baseline);
    setSaved(baseline);
    setSelected({ kind: "library" });
  }
  const plantedDraft = seedEmptyBoth(draft.steps);
  const plantedSaved = seedEmptyBoth(saved.steps);
  if (plantedDraft || plantedSaved) {
    if (plantedDraft) setDraft({ ...draft, steps: plantedDraft });
    if (plantedSaved) {
      const next = { ...saved, steps: plantedSaved };
      setSaved(next);
      saveFlow(next);
    }
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
  if (missing && !leaving) notFound();
  const step = selected.kind === "step" ? getStep(draft.steps, selected.path) : null;
  const needsTrigger = draft.trigger === "" || draft.trigger === "בחרו טריגר";

  function updateStep(next: FlowStep) {
    if (selected.kind !== "step") return;
    setDraft({ ...draft, steps: replaceStep(draft.steps, selected.path, next) });
  }

  function keep(next: Flow) {
    setDraft(next);
    setSaved(next);
    saveFlow(next);
  }

  function choose(kind: StepKind) {
    if (selected.kind === "replace") {
      const current = getStep(draft.steps, selected.path);
      const step = current?.type === kind ? current : blankStep(kind);
      keep({ ...draft, steps: replaceStep(draft.steps, selected.path, step) });
      setSelected(step.type === "both" ? { kind: "library" } : { kind: "step", path: selected.path });
      return;
    }
    const parent = selected.kind === "add" ? selected.parent : [];
    const index = selected.kind === "add" ? selected.index : draft.steps.length;
    const block = priorBlock(draft.steps, draft.trigger, parent, index);
    if (block) {
      toast(block.message);
      setSelected(block.focus);
      return;
    }
    if (selected.kind !== "add" && draft.steps.some((item) => item.type === "end")) {
      toast("המסלול הראשי כבר נעצר בסיום");
      return;
    }
    const placed = place(draft.steps, parent, index, `new:${kind}`);
    if (!placed) return;
    keep({ ...draft, steps: placed.steps });
    setSelected(kind === "both" ? { kind: "library" } : { kind: "step", path: placed.path });
  }

  function requestAdd(parent: Path, index: number) {
    const block = priorBlock(draft.steps, draft.trigger, parent, index);
    if (block) {
      toast(block.message);
      setSelected(block.focus);
      return;
    }
    setSelected({ kind: "add", parent, index });
  }

  function removeStep(path: Path) {
    setDraft({ ...draft, steps: removeAt(draft.steps, path) });
    if (selected.kind === "step" && (samePath(selected.path, path) || holds(path, selected.path))) setSelected({ kind: "library" });
    if (selected.kind === "replace" && (samePath(selected.path, path) || holds(path, selected.path))) setSelected({ kind: "library" });
  }

  function dropAt(parent: Path, index: number, payload: string) {
    try {
      if (payload.startsWith("new:")) {
        const block = priorBlock(draft.steps, draft.trigger, parent, index);
        if (block) {
          toast(block.message);
          setSelected(block.focus);
          return;
        }
      }
      const placed = place(draft.steps, parent, index, payload);
      if (!placed) return;
      setDraft({ ...draft, steps: placed.steps });
      const opened = getStep(placed.steps, placed.path);
      setSelected(opened?.type === "both" ? { kind: "library" } : { kind: "step", path: placed.path });
    } catch {
      toast("לא הצלחנו להעביר את השלב");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      {simulate ? <SimulationPanel flow={draft} eventLabel={draft.trigger} onClose={() => setSimulate(false)} /> : null}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href="/admin/marketing/automations" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">אוטומציות /</span>
        <label htmlFor="automation-name" className="flex min-w-0 items-center gap-1">
          <input id="automation-name" aria-label="שם האוטומציה" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="שם האוטומציה" className="h-8 max-w-[280px] min-w-[4ch] border-0 bg-transparent px-0.5 text-[15px] font-bold outline-none" style={{ ...clearInput, fieldSizing: "content" }} />
          <Icon name="pencil" size={14} strokeWidth={1.7} className="shrink-0 text-[#8a8a8a]" />
        </label>
        <span className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: draft.on ? "#cdfee1" : "#ebebeb", color: draft.on ? "#0c5132" : "#303030" }}>{draft.on ? "פעיל" : "טיוטה"}</span>
        <button type="button" className="ms-auto grid size-8 place-items-center rounded-lg border-0 bg-white text-[#8a8a8a] shadow-[0_0_0_1px_rgba(0,0,0,.1)] hover:text-[#8e1f0b]" aria-label="מחיקת האוטומציה" onClick={() => setRemoveOpen(true)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="min-h-[calc(100dvh-92px)] bg-[#f3f3f3] px-6 pt-8 pb-28">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
          <div role="button" tabIndex={0} onClick={() => setSelected({ kind: "trigger" })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected({ kind: "trigger" }); } }} className="flex w-full max-w-[440px] cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-start" style={{ boxShadow: selected.kind === "trigger" ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.04)" }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#111] text-[11px] font-bold text-white">ט</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-[#616161]">{needsTrigger ? "טריגר" : `טריגר · ${customerCountLabel(triggerAudienceCount(draft.trigger, draft.lookback ?? 0))}`}</span>
              <b className="block truncate text-sm">{needsTrigger ? "בחרו טריגר" : triggerTitle(draft.trigger, draft.lookback)}</b>
            </span>
            <button type="button" onClick={(event) => { event.stopPropagation(); setSelected({ kind: "trigger" }); }} className="h-7 shrink-0 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold text-[#1a1a1a] hover:bg-[#e6e6e6]">{needsTrigger ? "בחירה" : "החלפה"}</button>
          </div>
          <FlowLane steps={draft.steps} parent={[]} selected={selected} onAdd={requestAdd} onSelect={(path) => { if (getStep(draft.steps, path)?.type === "both") return; setSelected({ kind: "step", path }); }} onReplace={(path) => setSelected({ kind: "replace", path })} onRemove={removeStep} onDropPayload={dropAt} />
        </div>
      </div>
      <div className={cn("pointer-events-none fixed bottom-5 z-30 flex justify-center px-4", narrow ? "inset-x-0" : navCollapsed ? "right-[52px] left-1.5" : "right-60 left-1.5")}>
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.14),0_0_0_1px_rgba(0,0,0,.06)]">
          <button type="button" className="h-9 rounded-full border-0 bg-transparent px-4 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f3f3f3]" onClick={() => setSimulate(true)}>סימולציה</button>
          <button type="button" className="h-9 rounded-full border-0 px-4 text-sm font-semibold text-white" style={{ background: draft.on ? "#8e1f0b" : "#1a1a1a" }} onClick={() => { if (!draft.on && needsTrigger) { setSelected({ kind: "trigger" }); toast("בחרו טריגר לפני ההפעלה"); return; } setDraft({ ...draft, on: !draft.on }); toast(draft.on ? "האוטומציה הושהתה" : "האוטומציה הופעלה"); }}>{draft.on ? "השהיה" : "הפעלה"}</button>
        </div>
      </div>
      {selected.kind === "add" || selected.kind === "replace" ? (
        <FlowWindow title={selected.kind === "replace" ? "החלפת השלב" : "מה השלב הבא"} hint={selected.kind === "replace" ? "בחרו שלב אחר במקום הנוכחי." : "בחרו מה יקרה כאן במסלול."} wide onClose={() => setSelected({ kind: "library" })}>
          <Library onConfirm={choose} />
        </FlowWindow>
      ) : null}
      {selected.kind === "step" && step && step.type !== "both" ? (
        <FlowWindow title={summary(step).title} hint={step.type === "email" || step.type === "sms" ? undefined : summary(step).detail} onClose={() => setSelected({ kind: "library" })}>
          <StepEditor
            step={step}
            onChange={updateStep}
            onDelete={() => { setDraft({ ...draft, steps: removeAt(draft.steps, selected.path) }); setSelected({ kind: "library" }); }}
            onEditEmail={(emailId) => {
              const next = { ...draft, steps: replaceStep(draft.steps, selected.path, { type: "email", emailId }) };
              setDraft(next);
              setSaved(next);
              saveFlow(next);
              router.push(`/admin/marketing/emails/${emailId}?from=${flowId}`);
            }}
            onCreateEmail={() => {
              const email = createEmail();
              const next = { ...draft, steps: replaceStep(draft.steps, selected.path, { type: "email", emailId: email.id }) };
              setDraft(next);
              setSaved(next);
              saveFlow(next);
              router.push(`/admin/marketing/emails/${email.id}?from=${flowId}`);
            }}
            onEditSms={(smsId) => {
              const next = { ...draft, steps: replaceStep(draft.steps, selected.path, { type: "sms", smsId }) };
              setDraft(next);
              setSaved(next);
              saveFlow(next);
              router.push(`/admin/marketing/sms/${smsId}?from=${flowId}`);
            }}
            onCreateSms={() => {
              const message = createSms();
              const next = { ...draft, steps: replaceStep(draft.steps, selected.path, { type: "sms", smsId: message.id }) };
              setDraft(next);
              setSaved(next);
              saveFlow(next);
              router.push(`/admin/marketing/sms/${message.id}?from=${flowId}`);
            }}
            onCommit={(next) => {
              if (selected.kind !== "step") return;
              keep({ ...draft, steps: replaceStep(draft.steps, selected.path, next) });
              setSelected({ kind: "library" });
            }}
          />
        </FlowWindow>
      ) : null}
      {selected.kind === "trigger" ? (
        <TriggerDialog trigger={draft.trigger} lookback={draft.lookback} onClose={() => setSelected({ kind: "library" })} onConfirm={(trigger, lookback) => { keep({ ...draft, trigger, lookback }); setSelected({ kind: "library" }); }} />
      ) : null}
      {removeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onMouseDown={() => setRemoveOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="מחיקת אוטומציה" className="w-full max-w-[420px] rounded-2xl bg-white p-5 text-ink shadow-[0_24px_70px_rgba(0,0,0,.28)]" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">למחוק את {draft.name || "האוטומציה"}?</h2>
            <p className="m-0 mt-2 text-sm text-[#4a4a4a]">האוטומציה תוסר מהרשימה. אי אפשר לשחזר אותה.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold text-ink" onClick={() => setRemoveOpen(false)}>ביטול</button>
              <button type="button" className="h-8 rounded-lg border-0 bg-[#8e1f0b] px-3 text-sm font-semibold text-white" onClick={() => { setLeaving(true); deleteFlow(flowId); router.push("/admin/marketing/automations"); toast("האוטומציה נמחקה"); }}>מחיקה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlowWindow({ title, hint, wide, onClose, footer, children }: { title: string; hint?: string; wide?: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
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
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? <div className="px-5 pt-1 pb-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function StepEditor({ step, onChange, onDelete, onEditEmail, onCreateEmail, onEditSms, onCreateSms, onCommit }: { step: FlowStep; onChange: (next: FlowStep) => void; onDelete: () => void; onEditEmail: (emailId: string) => void; onCreateEmail: () => void; onEditSms: (smsId: string) => void; onCreateSms: () => void; onCommit: (next: FlowStep) => void }) {
  const emails = step.type === "email" ? listEmails() : [];
  const messages = step.type === "sms" ? listSms() : [];
  const chosen = step.type === "email" && step.emailId ? getEmail(step.emailId) : null;
  const chosenSms = step.type === "sms" && step.smsId ? getSms(step.smsId) : null;
  return (
    <div className="flex flex-col gap-3">
      {step.type === "email" ? (
          <PickList
          empty="עדיין אין מיילים"
          createLabel="מייל חדש"
          items={emails.map((email) => ({ id: email.id, name: email.name, detail: email.subject || "בלי נושא" }))}
          selectedId={step.emailId ?? ""}
          onConfirm={(id) => onCommit({ type: "email", emailId: id })}
          onCreate={onCreateEmail}
          onEdit={chosen ? () => onEditEmail(chosen.id) : undefined}
        />
      ) : null}
      {step.type === "sms" ? (
          <PickList
          empty="עדיין אין הודעות SMS"
          createLabel="SMS חדש"
          items={messages.map((message) => ({ id: message.id, name: message.name, detail: message.text || "הודעה ריקה" }))}
          selectedId={step.smsId ?? ""}
          onConfirm={(id) => onCommit({ type: "sms", smsId: id })}
          onCreate={onCreateSms}
          onEdit={chosenSms ? () => onEditSms(chosenSms.id) : undefined}
        />
      ) : null}
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
      {step.type === "email" || step.type === "sms" ? null : <button type="button" onClick={() => onCommit(step)} className="h-11 w-full rounded-2xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white">אישור</button>}
      <button type="button" onClick={onDelete} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border-0 bg-transparent text-sm font-semibold text-[#6b6b6b] hover:bg-[#f6f6f6] hover:text-[#1a1a1a]">
        <Icon name="trash" size={15} strokeWidth={1.6} />
        מחיקת השלב
      </button>
    </div>
  );
}

function PickList({ items, selectedId, empty, createLabel, onConfirm, onCreate, onEdit }: { items: Array<{ id: string; name: string; detail: string }>; selectedId: string; empty: string; createLabel: string; onConfirm: (id: string) => void; onCreate: () => void; onEdit?: () => void }) {
  const [picked, setPicked] = useState(selectedId);
  return (
    <div className="overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
      {items.length ? (
        <div className="max-h-64 overflow-auto">
          {items.map((item) => {
            const selected = item.id === picked;
            return (
              <div key={item.id} className="flex items-center gap-2 border-b border-[#f3f3f3] px-3 py-2.5" style={{ background: selected ? "#f7f7f7" : "#fff" }}>
                <button type="button" onClick={() => setPicked(item.id)} className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-start">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full" style={{ boxShadow: selected ? "inset 0 0 0 5px #1a1a1a" : "inset 0 0 0 1.5px #c9c9c9" }} />
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{item.name}</b>
                    <span className="block truncate text-[13px] text-[#616161]">{item.detail}</span>
                  </span>
                </button>
                {selected && onEdit ? <button type="button" onClick={onEdit} className="h-7 shrink-0 rounded-full border-0 bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">עריכה</button> : null}
              </div>
            );
          })}
        </div>
      ) : <div className="px-4 py-8 text-center text-sm text-[#616161]">{empty}</div>}
      <button type="button" onClick={onCreate} className="flex h-11 w-full items-center gap-2 border-0 bg-[#fafafa] px-3 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f3f3f3]">
        <span className="grid size-5 place-items-center rounded-full bg-[#1a1a1a] text-[14px] leading-none text-white">+</span>
        {createLabel}
      </button>
      {picked ? <button type="button" onClick={() => onConfirm(picked)} className="h-11 w-full border-0 border-t border-[#f3f3f3] bg-[#1a1a1a] text-sm font-semibold text-white">אישור</button> : null}
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
        {kind === "both" ? <path d="M8 2.5v3.5M8 6 4 9.5V13.5M8 6l4 3.5V13.5" /> : null}
        {kind === "end" ? <path d="M4.5 4.5h7v7h-7z" /> : null}
      </svg>
    </span>
  );
}

function Library({ onConfirm }: { onConfirm: (kind: StepKind) => void }) {
  const [picked, setPicked] = useState<StepKind | "">("");
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
              const selected = picked === item.kind;
              return (
                <button key={item.kind} type="button" onClick={() => setPicked(item.kind)} className="flow-item flex items-center gap-2.5 rounded-2xl border-0 bg-white px-3 py-3 text-start transition-transform duration-200 hover:-translate-y-0.5" style={{ animationDelay: `${wait}ms`, gridColumn: group.items.length === 1 ? "1 / -1" : undefined, boxShadow: selected ? "0 0 0 2px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.08)" }}>
                  <Mark kind={item.kind} color={item.color} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm">{item.name}</b>
                    <span className="block text-[12px] leading-4 text-[#616161]">{item.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {picked ? <button type="button" onClick={() => onConfirm(picked)} className="h-11 rounded-2xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white">אישור</button> : null}
    </div>
  );
}

function TriggerDialog({ trigger, lookback, onClose, onConfirm }: { trigger: string; lookback?: number; onClose: () => void; onConfirm: (trigger: string, lookback: number) => void }) {
  const [picked, setPicked] = useState(trigger === "בחרו טריגר" ? "" : trigger);
  const [range, setRange] = useState(false);
  return (
    <>
      <FlowWindow
        title="טריגר"
        hint="אירוע רץ לבד. קהל הוא הודעה שאתם שולחים."
        onClose={() => { if (!range) onClose(); }}
        footer={picked ? <button type="button" onClick={() => { if (timedTrigger(picked)) setRange(true); else onConfirm(picked, 0); }} className="h-11 w-full rounded-2xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white">{timedTrigger(picked) ? "המשך לבחירת זמן" : "אישור"}</button> : null}
      >
        <div className="flex flex-col gap-4">
          {(["אירוע", "קהל"] as const).map((group) => (
            <div key={group}>
              <div className="mb-1.5 text-[12px] font-bold text-[#616161]">{group === "אירוע" ? "אירועים" : "קהלים"}</div>
              <div className="overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                {FLOW_TRIGGERS.filter((item) => item.group === group).map((item) => {
                  const active = picked === item.label;
                  return (
                    <button key={item.id} type="button" onClick={() => setPicked(item.label)} className="flex w-full items-center gap-2.5 border-0 border-b border-[#f3f3f3] px-3 py-2.5 text-start last:border-b-0" style={{ background: active ? "#f7f7f7" : "#fff" }}>
                      <span className="grid size-4 shrink-0 place-items-center rounded-full" style={{ boxShadow: active ? "inset 0 0 0 5px #1a1a1a" : "inset 0 0 0 1.5px #c9c9c9" }} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm">{item.label}</b>
                        <span className="block truncate text-[12px] text-[#616161]">{item.detail}</span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-[#1a1a1a]">{triggerAudienceCount(item.label, timedTrigger(item.label) ? (lookback ?? 0) : 0)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </FlowWindow>
      {range && picked ? <RangeDialog label={picked} lookback={lookback} onClose={() => setRange(false)} onConfirm={(days) => onConfirm(picked, days)} /> : null}
    </>
  );
}

function RangeDialog({ label, lookback, onClose, onConfirm }: { label: string; lookback?: number; onClose: () => void; onConfirm: (days: number) => void }) {
  const preset = TRIGGER_WINDOWS.some((item) => item.days === lookback);
  const [choice, setChoice] = useState<number | "custom">(lookback ? (preset ? lookback : "custom") : 0);
  const savedCustom = !lookback || preset ? { amount: "2", unit: "weeks" as const } : lookback % 30 === 0 ? { amount: String(lookback / 30), unit: "months" as const } : lookback % 7 === 0 ? { amount: String(lookback / 7), unit: "weeks" as const } : { amount: String(lookback), unit: "days" as const };
  const [amount, setAmount] = useState(savedCustom.amount);
  const [unit, setUnit] = useState<(typeof savedCustom)["unit"]>(savedCustom.unit);
  const customDays = Math.max(1, Number(amount) || 1) * (unit === "weeks" ? 7 : unit === "months" ? 30 : 1);
  const days = choice === "custom" ? customDays : choice;
  return (
    <FlowWindow
      title="כמה זמן אחורה"
      hint={label}
      onClose={onClose}
      footer={<button type="button" onClick={() => onConfirm(days)} className="h-11 w-full rounded-2xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white">אישור</button>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setChoice(0)} className="h-8 rounded-full border-0 px-3 text-[13px] font-semibold" style={{ background: choice === 0 ? "#1a1a1a" : "#f3f3f3", color: choice === 0 ? "#fff" : "#1a1a1a" }}>כל הזמנים</button>
          {TRIGGER_WINDOWS.map((item) => (
            <button key={item.days} type="button" onClick={() => setChoice(item.days)} className="h-8 rounded-full border-0 px-3 text-[13px] font-semibold" style={{ background: choice === item.days ? "#1a1a1a" : "#f3f3f3", color: choice === item.days ? "#fff" : "#1a1a1a" }}>{item.label}</button>
          ))}
          <button type="button" onClick={() => setChoice("custom")} className="h-8 rounded-full border-0 px-3 text-[13px] font-semibold" style={{ background: choice === "custom" ? "#1a1a1a" : "#f3f3f3", color: choice === "custom" ? "#fff" : "#1a1a1a" }}>מותאם</button>
        </div>
        {choice === "custom" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm" />
            <select value={unit} onChange={(event) => setUnit(event.target.value as "days" | "weeks" | "months")} className="h-[34px] rounded-[10px] border border-[#c9c9c9] bg-white px-2 text-sm">
              <option value="days">ימים</option>
              <option value="weeks">שבועות</option>
              <option value="months">חודשים</option>
            </select>
          </div>
        ) : null}
        <div className="text-sm font-semibold">{customerCountLabel(triggerAudienceCount(label, days))} {lookbackPhrase(days)}</div>
      </div>
    </FlowWindow>
  );
}

function ConditionEditor({ step, onChange }: { step: Extract<FlowStep, { type: "cond" }>; onChange: (next: FlowStep) => void }) {
  const match = step.match === "any" ? "any" : "all";
  const rules = step.rules?.length ? step.rules : [];

  function write(nextRules: FlowRule[], nextMatch: "all" | "any" = match) {
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
