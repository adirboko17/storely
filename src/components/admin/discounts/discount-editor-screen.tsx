"use client";

import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { getCatalogVersion, listCatalogProducts, listCategorySubcategories, listExtraCollections, subscribeCatalog } from "@/data/mock/catalog-session";
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
import { currencySymbol } from "@/lib/formatting/currency";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm outline-none";
const card = "rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]";
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const STATUS = {
  active: { label: "פעיל", background: "#cdfee1", color: "#0c5132" },
  scheduled: { label: "מתוזמן", background: "#e0f0ff", color: "#00527c" },
  expired: { label: "פג תוקף", background: "#e3e3e3", color: "#616161" },
};

function formatDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "היום";
  return `${Number(match[3])} ב${MONTHS[Number(match[2]) - 1] ?? ""} ${match[1]}`;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function detailLines(discount: Discount) {
  const lines = [discount.eligibility === "all" ? "כל הלקוחות" : discount.segment.trim() || "פלח לקוחות"];
  if (discount.type === "product") {
    lines.push(
      discount.applies === "subs" && discount.collections.length
        ? `תתי קטגוריות: ${discount.collections.join(", ")}`
        : discount.applies === "colls" && discount.collections.length
          ? `קטגוריות: ${discount.collections.join(", ")}`
          : "כל המוצרים",
    );
  } else if (discount.type === "order") {
    lines.push("על כל ההזמנה");
  } else if (discount.type === "ship") {
    lines.push("משלוח חינם");
  } else {
    lines.push(`קנו ${discount.bxBuy || "0"}, קבלו ${discount.bxGet || "0"}${discount.bxColl.trim() ? ` מתוך ${discount.bxColl.trim()}` : ""}`);
  }
  if (discount.minType === "amount") lines.push(`מינימום ${currencySymbol()}${discount.minValue || "0"}`);
  else if (discount.minType === "qty") lines.push(`מינימום ${discount.minValue || "0"} פריטים`);
  else lines.push("בלי מינימום קנייה");
  if (discount.once) lines.push("שימוש אחד לכל לקוח");
  if (discount.limit) lines.push(discount.limitN.trim() ? `עד ${discount.limitN} שימושים` : "הגבלת שימושים");
  if (!discount.once && !discount.limit) lines.push("בלי הגבלת שימושים");
  const combos = [discount.combProduct && "מוצרים", discount.combOrder && "הזמנה", discount.combShip && "משלוח"].filter(Boolean);
  lines.push(combos.length ? `משתלבת עם הנחות ${combos.join(", ")}` : "לא משתלבת עם הנחות אחרות");
  lines.push(discount.hasEnd && discount.end ? `${formatDay(discount.start)} עד ${formatDay(discount.end)}` : `פעילה מ-${formatDay(discount.start)}`);
  return lines;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

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
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const existing = discountId == null ? null : getDiscount(discountId);
  const missing = discountId != null && !existing;
  const baseline = existing ?? blankDiscount(kind, discountId ?? 0);
  const [draft, setDraft] = useState<Discount>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(discountId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [combosOpen, setCombosOpen] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState("");
  if (bound !== discountId) {
    setBound(discountId);
    setDraft(baseline);
    setSaved(baseline);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const collections = useMemo(() => {
    const names = new Set<string>();
    for (const product of listCatalogProducts()) {
      if (product.category.trim()) names.add(product.category.trim());
      for (const name of product.collections) if (name.trim()) names.add(name.trim());
    }
    for (const name of listExtraCollections()) if (name.trim()) names.add(name.trim());
    return [...names].sort((a, b) => a.localeCompare(b, "he"));
  }, [getCatalogVersion()]);
  const subcategories = useMemo(() => {
    const names = new Set<string>();
    for (const product of listCatalogProducts()) {
      for (const name of product.subcategories ?? []) if (name.trim()) names.add(name.trim());
    }
    for (const category of collections) {
      for (const name of listCategorySubcategories(category)) if (name.trim()) names.add(name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b, "he"));
  }, [collections]);
  const targetNames = draft.applies === "subs" ? subcategories : collections;
  const collectionHits = targetNames.filter((name) => !draft.collections.includes(name) && (!collectionQuery.trim() || name.includes(collectionQuery.trim()))).slice(0, 6);

  function patch(next: Partial<Discount>) {
    setDraft({ ...draft, ...next });
    setError("");
  }

  function addCollection(name: string) {
    const title = name.trim();
    if (!title || draft.collections.includes(title)) return;
    patch({ collections: [...draft.collections, title] });
    setCollectionQuery("");
  }

  function save() {
    if (!draft.code.trim()) {
      setError(draft.method === "code" ? "יש להזין קוד הנחה" : "יש להזין כותרת");
      return;
    }
    if (draft.type !== "ship" && draft.type !== "bxgy" && !(Number(draft.value) > 0)) {
      setError("יש להזין ערך הנחה גבוה מ-0");
      return;
    }
    setSaving(true);
    const id = existing?.id ?? nextDiscountId();
    void saveDiscount({ ...draft, id })
      .then((next) => {
        setDraft(next);
        setSaved(next);
        setSaving(false);
        setError("");
        toast("ההנחה נשמרה");
        if (discountId == null) router.replace(`/admin/discounts/${id}`);
      })
      .catch(() => {
        setSaving(false);
        setError("שמירת ההנחה נכשלה");
      });
  }

  useUnsavedEditor(dirty, saving, save, () => { setDraft(saved); setError(""); });
  if (missing) notFound();
  const status = discountStatus(draft);
  const valueLabel = draft.type === "ship" ? "משלוח חינם" : draft.type === "bxgy" ? "קנה X קבל Y" : draft.valueType === "pct" ? `${draft.value || "0"}%` : `${currencySymbol()}${draft.value || "0"}`;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 px-4 py-6 min-[1000px]:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/discounts" aria-label="חזרה להנחות" className="grid size-8 place-items-center rounded-lg text-[#4a4a4a] no-underline hover:bg-[#f1f1f1]">
          <Icon name="chevron" className="rotate-180" />
        </Link>
        <h1 className="m-0 text-xl font-bold">{existing ? draft.code || KIND_LABEL[draft.type] : "יצירת הנחה"}</h1>
        {existing ? <span className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium" style={{ background: STATUS[status].background, color: STATUS[status].color }}>{STATUS[status].label}</span> : null}
      </div>
      {error ? <div className="rounded-xl bg-[#fedad9] px-4 py-2.5 text-sm font-bold text-[#8e1f0b]">{error}</div> : null}

      <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-5">
          <Section title={draft.method === "code" ? "קוד הנחה" : "כותרת"}>
            <div className={card}>
              <div className="inline-flex rounded-lg bg-[#f1f1f1] p-0.5">
                {([
                  ["code", "קוד הנחה"],
                  ["auto", "הנחה אוטומטית"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => patch({ method: value })} className={`h-7 rounded-md border-0 px-3 text-sm font-semibold ${draft.method === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#4a4a4a]"}`}>{label}</button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  {draft.method === "code" ? "קוד ההנחה" : "כותרת"}
                  {draft.method === "code" ? <button type="button" className="ms-auto border-0 bg-transparent p-0 text-sm font-semibold text-[#005bd3]" onClick={() => patch({ code: randomCode() })}>יצירת קוד אקראי</button> : null}
                </span>
                <input value={draft.code} onChange={(event) => patch({ code: draft.method === "code" ? event.target.value.toUpperCase() : event.target.value })} className={field} style={{ borderColor: error && !draft.code.trim() ? "#e51c00" : "#c9c9c9" }} placeholder={draft.method === "code" ? "SUMMER10" : "משלוח חינם מעל 200"} />
                <span className="mt-1.5 block text-[13px] text-ink-secondary">{draft.method === "code" ? "הלקוח מזין את הקוד בקופה." : "ההנחה מופעלת לבד, בלי קוד."}</span>
              </label>
            </div>
          </Section>

          <Section title={draft.type === "bxgy" ? "מה מקבלים" : draft.type === "ship" ? "ההנחה" : "ערך ההנחה"}>
            <div className={card}>
              {draft.type === "ship" ? <p className="m-0 text-sm text-[#303030]">דמי המשלוח מתבטלים כשהתנאים למטה מתקיימים.</p> : null}
              {draft.type === "bxgy" ? (
                <div className="grid gap-3 min-[700px]:grid-cols-3">
                  <label className="text-sm font-semibold">קנו כמות<input value={draft.bxBuy} onChange={(event) => patch({ bxBuy: event.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1.5 font-normal`} /></label>
                  <label className="text-sm font-semibold">קבלו כמות<input value={draft.bxGet} onChange={(event) => patch({ bxGet: event.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1.5 font-normal`} /></label>
                  <label className="text-sm font-semibold">מהקטגוריה<input value={draft.bxColl} onChange={(event) => patch({ bxColl: event.target.value })} className={`${field} mt-1.5 font-normal`} placeholder="שם הקטגוריה" /></label>
                </div>
              ) : null}
              {draft.type === "product" || draft.type === "order" ? (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 min-[700px]:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="text-sm font-semibold">סוג
                      <select value={draft.valueType} onChange={(event) => patch({ valueType: event.target.value as Discount["valueType"] })} className={`${field} mt-1.5 font-normal`}>
                        <option value="pct">אחוז</option>
                        <option value="fixed">סכום קבוע</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold">ערך
                      <span className="relative mt-1.5 block">
                        <input dir="ltr" value={draft.value} onChange={(event) => patch({ value: event.target.value.replace(/[^\d.]/g, "") })} className={`${field} text-end font-normal`} />
                        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-[#616161]">{draft.valueType === "pct" ? "%" : currencySymbol()}</span>
                      </span>
                    </label>
                  </div>
                  {draft.type === "product" ? (
                    <label className="text-sm font-semibold">חל על
                      <select value={draft.applies} onChange={(event) => { const applies = event.target.value as Discount["applies"]; patch({ applies, collections: applies === draft.applies ? draft.collections : [] }); setCollectionQuery(""); }} className={`${field} mt-1.5 font-normal`}>
                        <option value="all">כל המוצרים</option>
                        <option value="colls">קטגוריות מסוימות</option>
                        <option value="subs">תתי קטגוריות</option>
                      </select>
                    </label>
                  ) : <p className="m-0 text-[13px] text-ink-secondary">האחוז או הסכום יורדים מכלל ההזמנה.</p>}
                  {draft.type === "product" && draft.applies !== "all" ? (
                    <div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {draft.collections.map((name) => (
                          <button key={name} type="button" onClick={() => patch({ collections: draft.collections.filter((item) => item !== name) })} className="inline-flex h-7 items-center gap-1 rounded-full border-0 bg-[#f1f1f1] px-2.5 text-[13px] font-semibold">
                            {name}
                            <Icon name="close" size={12} />
                          </button>
                        ))}
                      </div>
                      <input value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCollection(collectionQuery); } }} placeholder={draft.applies === "subs" ? "חיפוש תת קטגוריה" : "חיפוש קטגוריה"} className={field} />
                      {collectionHits.length ? (
                        <div className="mt-1 overflow-hidden rounded-lg border border-[#e3e3e3]">
                          {collectionHits.map((name) => (
                            <button key={name} type="button" onClick={() => addCollection(name)} className="block w-full border-0 bg-white px-3 py-2 text-start text-sm hover:bg-[#f7f7f7]">{name}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="זכאות">
            <div className={card}>
              <select value={draft.eligibility} onChange={(event) => patch({ eligibility: event.target.value as Discount["eligibility"] })} className={field}>
                <option value="all">כל הלקוחות</option>
                <option value="seg">פלח לקוחות</option>
              </select>
              {draft.eligibility === "seg" ? <input value={draft.segment} onChange={(event) => patch({ segment: event.target.value })} placeholder="שם הפלח" className={`${field} mt-2`} /> : null}
            </div>
          </Section>

          <Section title="מינימום קנייה">
            <div className={`${card} flex flex-col gap-2 !p-2`}>
              {([
                ["none", "בלי מינימום"],
                ["amount", `סכום מינימום (${currencySymbol()})`],
                ["qty", "כמות מינימלית של פריטים"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-[#fafafa]">
                  <input type="radio" name="min" checked={draft.minType === value} onChange={() => patch({ minType: value })} className="mt-0.5 accent-[#303030]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{label}</span>
                    {draft.minType === value && value !== "none" ? <input dir="ltr" value={draft.minValue} onChange={(event) => patch({ minValue: event.target.value.replace(/[^\d.]/g, "") })} className={`${field} mt-2 font-normal`} /> : null}
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section title="מגבלת שימושים">
            <div className={`${card} flex flex-col gap-3`}>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={draft.limit} onChange={(event) => patch({ limit: event.target.checked })} className="mt-0.5 size-4 accent-[#303030]" />
                <span className="min-w-0 flex-1">
                  הגבלת מספר הפעמים שאפשר להשתמש בהנחה
                  {draft.limit ? <input dir="ltr" value={draft.limitN} onChange={(event) => patch({ limitN: event.target.value.replace(/[^\d]/g, "") })} placeholder="למשל 100" className={`${field} mt-2`} /> : null}
                </span>
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" checked={draft.once} onChange={(event) => patch({ once: event.target.checked })} className="size-4 accent-[#303030]" />
                שימוש אחד לכל לקוח
              </label>
            </div>
          </Section>

          <Section title="שילובים">
            <div className={card}>
              <div className="flex items-start gap-3">
                <p className="m-0 min-w-0 flex-1 text-sm text-[#303030]">
                  {draft.combProduct || draft.combOrder || draft.combShip
                    ? `ההנחה יכולה להשתלב עם ${[draft.combProduct && "הנחות מוצר", draft.combOrder && "הנחות הזמנה", draft.combShip && "הנחות משלוח"].filter(Boolean).join(", ")}.`
                    : "ההנחה לא תשתלב עם הנחות אחרות על מוצר, הזמנה או משלוח."}
                </p>
                <button type="button" aria-expanded={combosOpen} aria-label="עריכת שילובים" onClick={() => setCombosOpen((open) => !open)} className="grid size-7 shrink-0 place-items-center rounded-full border-0 bg-[#f1f1f1]">
                  <Icon name={combosOpen ? "close" : "plus"} size={14} />
                </button>
              </div>
              {combosOpen ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-[#ebebeb] pt-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.combProduct} onChange={(event) => patch({ combProduct: event.target.checked })} className="size-4 accent-[#303030]" />הנחות על מוצרים</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.combOrder} onChange={(event) => patch({ combOrder: event.target.checked })} className="size-4 accent-[#303030]" />הנחות על ההזמנה</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.combShip} onChange={(event) => patch({ combShip: event.target.checked })} className="size-4 accent-[#303030]" />הנחות משלוח</label>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="לוח זמנים">
            <div className={`${card} flex flex-wrap items-center gap-2`}>
              <input type="date" value={draft.start} onChange={(event) => patch({ start: event.target.value })} className="h-9 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" />
              {draft.hasEnd ? (
                <>
                  <span className="text-sm text-[#616161]">עד</span>
                  <input type="date" value={draft.end} onChange={(event) => patch({ end: event.target.value })} className="h-9 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" />
                  <button type="button" onClick={() => patch({ hasEnd: false, end: "" })} className="h-8 rounded-full border-0 bg-[#f1f1f1] px-3 text-sm font-semibold">הסרת סיום</button>
                </>
              ) : (
                <button type="button" onClick={() => patch({ hasEnd: true })} className="h-8 rounded-full border-0 bg-[#f1f1f1] px-3 text-sm font-semibold">+ הגדרת תאריך סיום</button>
              )}
            </div>
          </Section>
        </div>

        <aside className="sticky top-4 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div>
            <div className="text-sm font-semibold">{draft.code.trim() || (draft.method === "code" ? "עדיין אין קוד" : "עדיין אין כותרת")}</div>
            <div className="text-[13px] text-ink-secondary">{draft.method === "code" ? "קוד" : "כותרת"}</div>
          </div>
          <div className="border-t border-[#ebebeb] pt-3">
            <div className="text-[13px] text-ink-secondary">סוג</div>
            <div className="mt-1 text-sm font-semibold">{KIND_LABEL[draft.type]}</div>
            <div className="text-[13px] text-[#303030]">{valueLabel}</div>
          </div>
          <div className="border-t border-[#ebebeb] pt-3">
            <div className="text-[13px] text-ink-secondary">פרטים</div>
            <ul className="m-0 mt-2 list-inside list-disc space-y-1 px-2 text-sm leading-6">
              {detailLines(draft).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          {existing ? <div className="border-t border-[#ebebeb] pt-3 text-[13px] text-ink-secondary">שימושים עד כה: {draft.uses}</div> : null}
        </aside>
      </div>
    </div>
  );
}
