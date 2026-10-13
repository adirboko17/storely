"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import {
  KIND_LABEL,
  blankDiscount,
  discountStatus,
  getDiscount,
  getDiscountVersion,
  nextDiscountId,
  saveDiscount,
  subscribeDiscounts,
  type Discount,
  type DiscountKind,
} from "@/data/mock/discount-session";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm outline-none";
const STATUS = {
  active: { label: "פעיל", background: "#cdfee1", color: "#0c5132" },
  scheduled: { label: "מתוזמן", background: "#e0f0ff", color: "#00527c" },
  expired: { label: "פג תוקף", background: "#e3e3e3", color: "#616161" },
};

export function DiscountNewScreen() {
  const params = useSearchParams();
  const type = params.get("type");
  const kind: DiscountKind = type === "product" || type === "ship" || type === "bxgy" || type === "order" ? type : "order";
  return <DiscountEditorScreen discountId={null} kind={kind} />;
}

export function DiscountEditorScreen({ discountId, kind }: { discountId: number | null; kind: DiscountKind }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeDiscounts, getDiscountVersion, () => 0);
  const existing = discountId == null ? null : getDiscount(discountId);
  const missing = discountId != null && !existing;
  const baseline = existing ?? blankDiscount(kind, discountId ?? 0);
  const [draft, setDraft] = useState<Discount>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(discountId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (bound !== discountId) {
    setBound(discountId);
    setDraft(baseline);
    setSaved(baseline);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    if (!draft.code.trim()) {
      setError("יש להזין קוד או כותרת");
      return;
    }
    if (draft.type !== "ship" && draft.type !== "bxgy" && !(Number(draft.value) > 0)) {
      setError("יש להזין ערך הנחה גבוה מ-0");
      return;
    }
    setSaving(true);
    const id = existing?.id ?? nextDiscountId();
    window.setTimeout(() => {
      const next = { ...draft, id };
      saveDiscount(next);
      setDraft(next);
      setSaved(next);
      setSaving(false);
      setError("");
      toast("ההנחה נשמרה");
      if (discountId == null) router.replace(`/admin/discounts/${id}`);
    }, 500);
  }

  useUnsavedEditor(dirty, saving, save, () => { setDraft(saved); setError(""); });
  if (missing) notFound();
  const status = discountStatus(draft);

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link href="/admin/discounts" aria-label="חזרה להנחות" className="grid size-8 place-items-center rounded-lg text-[#4a4a4a] no-underline">←</Link>
        <h1 className="m-0 text-[22px] leading-7 font-bold">{draft.code || KIND_LABEL[draft.type]}</h1>
        {existing ? <span className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium" style={{ background: STATUS[status].background, color: STATUS[status].color }}>{STATUS[status].label}</span> : null}
      </div>
      {error ? <div className="rounded-xl bg-[#fedad9] px-4 py-2.5 font-bold text-[#8e1f0b]">{error}</div> : null}
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <label className="block font-semibold">קוד או כותרת<input value={draft.code} onChange={(event) => { setDraft({ ...draft, code: event.target.value }); setError(""); }} className={`${field} mt-1.5 font-normal`} style={{ borderColor: error ? "#e51c00" : "#c9c9c9", background: error ? "#fff4f4" : "#fff" }} /></label>
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            <label className="font-semibold">אופן
              <select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as Discount["method"] })} className={`${field} mt-1.5 font-normal`}>
                <option value="code">קוד הנחה</option>
                <option value="auto">הנחה אוטומטית</option>
              </select>
            </label>
            {draft.type !== "bxgy" && draft.type !== "ship" ? (
              <label className="font-semibold">ערך
                <div className="mt-1.5 flex gap-2">
                  <select value={draft.valueType} onChange={(event) => setDraft({ ...draft, valueType: event.target.value as Discount["valueType"] })} className={`${field} font-normal`}><option value="pct">אחוז</option><option value="fixed">סכום</option></select>
                  <input dir="ltr" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} className={`${field} text-end font-normal`} />
                </div>
              </label>
            ) : null}
          </div>
          {draft.type === "bxgy" ? (
            <div className="grid gap-3 min-[700px]:grid-cols-3">
              <label className="font-semibold">קנו<input value={draft.bxBuy} onChange={(event) => setDraft({ ...draft, bxBuy: event.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
              <label className="font-semibold">קבלו<input value={draft.bxGet} onChange={(event) => setDraft({ ...draft, bxGet: event.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
              <label className="font-semibold">מהאוסף<input value={draft.bxColl} onChange={(event) => setDraft({ ...draft, bxColl: event.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
            </div>
          ) : null}
          <label className="font-semibold">מינימום
            <div className="mt-1.5 flex gap-2">
              <select value={draft.minType} onChange={(event) => setDraft({ ...draft, minType: event.target.value as Discount["minType"] })} className={`${field} font-normal`}>
                <option value="none">ללא</option>
                <option value="amount">סכום</option>
                <option value="qty">כמות</option>
              </select>
              {draft.minType !== "none" ? <input dir="ltr" value={draft.minValue} onChange={(event) => setDraft({ ...draft, minValue: event.target.value })} className={`${field} text-end font-normal`} /> : null}
            </div>
          </label>
          <label className="font-semibold">זכאות
            <select value={draft.eligibility} onChange={(event) => setDraft({ ...draft, eligibility: event.target.value as Discount["eligibility"] })} className={`${field} mt-1.5 font-normal`}>
              <option value="all">כל הלקוחות</option>
              <option value="seg">פלח</option>
            </select>
          </label>
          {draft.eligibility === "seg" ? <input value={draft.segment} onChange={(event) => setDraft({ ...draft, segment: event.target.value })} placeholder="שם הפלח" className={field} /> : null}
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            <label className="font-semibold">התחלה<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
            <label className="font-semibold">סיום<input type="date" value={draft.end} disabled={!draft.hasEnd} onChange={(event) => setDraft({ ...draft, end: event.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
          </div>
          <label className="flex items-center gap-2 font-normal"><input type="checkbox" checked={draft.hasEnd} onChange={(event) => setDraft({ ...draft, hasEnd: event.target.checked })} className="size-4 accent-[#303030]" />יש תאריך סיום</label>
          <label className="flex items-center gap-2 font-normal"><input type="checkbox" checked={draft.once} onChange={(event) => setDraft({ ...draft, once: event.target.checked })} className="size-4 accent-[#303030]" />שימוש אחד לכל לקוח</label>
        </div>
        <aside className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="font-semibold">שילובים</div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.combProduct} onChange={(event) => setDraft({ ...draft, combProduct: event.target.checked })} className="size-4 accent-[#303030]" />הנחות על מוצרים</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.combOrder} onChange={(event) => setDraft({ ...draft, combOrder: event.target.checked })} className="size-4 accent-[#303030]" />הנחות על ההזמנה</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.combShip} onChange={(event) => setDraft({ ...draft, combShip: event.target.checked })} className="size-4 accent-[#303030]" />הנחות משלוח</label>
          <div className="text-sm text-ink-secondary">שימושים עד כה: {draft.uses}</div>
        </aside>
      </div>
    </div>
  );
}
