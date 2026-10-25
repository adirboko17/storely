"use client";

import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { getCatalogVersion, isVideoMedia, listCatalogProducts, listCategorySubcategories, listExtraCollections, subscribeCatalog } from "@/data/mock/catalog-session";
import {
  KIND_LABEL,
  blankDiscount,
  bxgyDetail,
  discountProductScope,
  discountStatus,
  getDiscount,
  getDiscountVersion,
  nextDiscountId,
  saveDiscount,
  subscribeDiscounts,
  type BxgyMode,
  type Discount,
  type DiscountKind,
} from "@/data/mock/discount-session";
import { currencySymbol } from "@/lib/formatting/currency";
import { formatMoney } from "@/lib/formatting/money";
import type { Product } from "@/types/commerce";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm outline-none";
const card = "rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]";
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const STATUS = {
  active: { label: "פעיל", background: "#cdfee1", color: "#0c5132" },
  scheduled: { label: "מתוזמן", background: "#e0f0ff", color: "#00527c" },
  expired: { label: "פג תוקף", background: "#e3e3e3", color: "#616161" },
};

function productPhoto(product: Product) {
  return product.media?.find((item) => item && !isVideoMedia(item)) ?? "";
}

function foldSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

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
    lines.push(discountProductScope(discount));
  } else if (discount.type === "order") {
    lines.push("על כל ההזמנה");
  } else if (discount.type === "ship") {
    lines.push("משלוח חינם");
  } else {
    lines.push(...bxgyDetail(discount));
  }
  if (discount.minType === "amount") lines.push(`מינימום ${currencySymbol()}${discount.minValue || "0"}`);
  else if (discount.minType === "qty") lines.push(`מינימום ${discount.minValue || "0"} פריטים`);
  else lines.push("בלי מינימום קנייה");
  if (discount.once) lines.push("שימוש אחד לכל לקוח");
  if (discount.limit) lines.push(discount.limitN.trim() ? `עד ${discount.limitN} שימושים` : "הגבלת שימושים");
  if (!discount.once && !discount.limit) lines.push("בלי הגבלת שימושים");
  const combos = [discount.combProduct && "מוצרים", discount.combOrder && "הזמנה", discount.combShip && "משלוח"].filter(Boolean);
  lines.push(combos.length ? `משתלבת עם הנחות ${combos.join(", ")}` : "לא משתלבת עם הנחות אחרות");
  if (discount.type === "bxgy") lines.push(discount.combBundle ? "משתלבת עם באנדלים" : "לא משתלבת עם באנדלים");
  if (discount.blockGift) lines.push("לא משתלבת עם כרטיס מתנה");
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

const BXGY_MODES: Array<{ id: BxgyMode; title: string; detail: string }> = [
  { id: "pair", title: "מוצר תמורת מוצר", detail: "בוחרים איזה מוצר קונים ואיזה מוצר מקבלים במתנה. אפשר עם קוד קופון או אוטומטית בקופה." },
  { id: "qty", title: "כמות על אותו מוצר", detail: "בוחרים איזה מוצר קונים, באיזו כמות, וכמה יחידות מאותו מוצר מקבלים במתנה." },
  { id: "cats", title: "קטגוריה תמורת קטגוריה", detail: "בוחרים מאיזו קטגוריה קונים ומאיזו קטגוריה מקבלים מוצר במתנה. אפשר לסמן מוצרים נבחרים." },
];

function productInCategory(product: Product, category: string) {
  const name = category.trim();
  return Boolean(name) && (product.category.trim() === name || product.collections.includes(name));
}

function catalogProductLabel(products: Product[], sourceId: string) {
  const product = products.find((item) => item.sourceId === sourceId);
  if (!product) return "מוצר";
  const title = product.title.trim() || "מוצר";
  const shared = products.filter((item) => item.title.trim() === product.title.trim()).length > 1;
  return shared && product.variant.trim() ? `${title} · ${product.variant.trim()}` : title;
}

function uniqueProducts(products: Product[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (!product.sourceId || seen.has(product.sourceId)) return false;
    seen.add(product.sourceId);
    return true;
  });
}

function ProductSearch({ products, selected, multiple, placeholder, emptyLabel = "אין מוצרים בחנות", onChange }: { products: Product[]; selected: string[]; multiple: boolean; placeholder: string; emptyLabel?: string; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const needle = foldSearch(query);
  const hits = products.filter((product) => {
    if (!product.sourceId || selected.includes(product.sourceId)) return false;
    if (!needle) return true;
    return foldSearch(`${product.title} ${product.variant} ${product.sku}`).includes(needle);
  }).slice(0, 8);

  function add(sourceId: string) {
    if (!sourceId || selected.includes(sourceId)) return;
    onChange(multiple ? [...selected, sourceId].slice(0, 40) : [sourceId]);
    setQuery("");
    if (!multiple) setOpen(false);
  }

  return (
    <div ref={ref}>
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const chosen = products.find((item) => item.sourceId === id);
            const photo = chosen ? productPhoto(chosen) : "";
            return (
              <button key={id} type="button" onClick={() => onChange(selected.filter((item) => item !== id))} className="inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[#f1f1f1] py-1 pr-1 pl-2.5 text-[13px] font-semibold">
                {photo ? <img src={photo} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-[#e3e3e3]" />}
                {catalogProductLabel(products, id)}
                <Icon name="close" size={12} />
              </button>
            );
          })}
        </div>
      ) : null}
      <input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); return; } if (event.key === "Enter") { event.preventDefault(); const hit = hits[0]; if (hit?.sourceId) add(hit.sourceId); } }} placeholder={placeholder} autoComplete="off" className={field} />
      {open && hits.length ? (
        <div className="mt-1 max-h-80 overflow-auto rounded-lg border border-[#e3e3e3] bg-white">
          {hits.map((product) => {
            const photo = productPhoto(product);
            return (
              <button key={product.sourceId} type="button" onClick={() => product.sourceId && add(product.sourceId)} className="flex w-full items-center gap-3 border-0 border-b border-[#f1f1f1] bg-white px-2.5 py-2 text-start last:border-b-0 hover:bg-[#f7f7f7]">
                {photo ? <img src={photo} alt="" className="size-12 shrink-0 rounded-lg object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" /> : <span className="size-12 shrink-0 rounded-lg bg-[#f3f3f3] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#303030]">{product.title.trim() || "מוצר"}</span>
                  {product.variant.trim() && product.variant.trim() !== "Default Title" && product.variant.trim() !== "ברירת מחדל" ? <span className="mt-0.5 block truncate text-[12px] text-[#616161]">{product.variant.trim()}</span> : null}
                </span>
                <span className="shrink-0 text-sm text-[#303030]">{formatMoney(product.price)}</span>
              </button>
            );
          })}
        </div>
      ) : open && needle ? <p className="m-0 mt-2 text-[13px] text-ink-secondary">אין מוצר בשם הזה</p> : open && products.length === 0 ? <p className="m-0 mt-2 text-[13px] text-ink-secondary">{emptyLabel}</p> : null}
    </div>
  );
}

function CategorySearch({ names, value, placeholder, onChange }: { names: string[]; value: string; placeholder: string; onChange: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const hits = names.filter((name) => name !== value && (!query.trim() || name.includes(query.trim()))).slice(0, 6);
  return (
    <div ref={ref}>
      {value ? (
        <button type="button" onClick={() => onChange("")} className="mb-2 inline-flex h-7 items-center gap-1 rounded-full border-0 bg-[#f1f1f1] px-2.5 text-[13px] font-semibold">
          {value}
          <Icon name="close" size={12} />
        </button>
      ) : null}
      <input value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); return; } if (event.key === "Enter") { event.preventDefault(); const hit = hits[0]; if (hit) { onChange(hit); setQuery(""); setOpen(false); } } }} placeholder={placeholder} className={field} />
      {open && hits.length ? (
        <div className="mt-1 overflow-hidden rounded-lg border border-[#e3e3e3]">
          {hits.map((name) => (
            <button key={name} type="button" onClick={() => { onChange(name); setQuery(""); setOpen(false); }} className="block w-full border-0 bg-white px-3 py-2 text-start text-sm hover:bg-[#f7f7f7]">{name}</button>
          ))}
        </div>
      ) : open ? <p className="m-0 mt-2 text-[13px] text-ink-secondary">{names.length ? "אין קטגוריה בשם הזה" : "אין קטגוריות בחנות"}</p> : null}
    </div>
  );
}

function bxgyReady(draft: Discount, buyLimited: boolean, getLimited: boolean) {
  if (draft.type !== "bxgy") return draft;
  if (draft.bxMode === "pair") return { ...draft, bxBuy: "1", bxGet: "1", bxColl: "", bxGetColl: "" };
  if (draft.bxMode === "qty") return { ...draft, bxGetIds: [...draft.bxBuyIds], bxColl: "", bxGetColl: "" };
  return { ...draft, bxBuy: "1", bxGet: "1", bxBuyIds: buyLimited ? draft.bxBuyIds : [], bxGetIds: getLimited ? draft.bxGetIds : [] };
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
  const [buyLimited, setBuyLimited] = useState(baseline.bxMode === "cats" && baseline.bxBuyIds.length > 0);
  const [getLimited, setGetLimited] = useState(baseline.bxMode === "cats" && baseline.bxGetIds.length > 0);
  const [collectionQuery, setCollectionQuery] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productPickerRef = useRef<HTMLDivElement>(null);
  if (bound !== discountId) {
    setBound(discountId);
    setDraft(baseline);
    setSaved(baseline);
    setBuyLimited(baseline.bxMode === "cats" && baseline.bxBuyIds.length > 0);
    setGetLimited(baseline.bxMode === "cats" && baseline.bxGetIds.length > 0);
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
  const products = listCatalogProducts().filter((product) => product.sourceId);
  useEffect(() => {
    if (!productPickerOpen) return;
    function close(event: PointerEvent) {
      if (!productPickerRef.current?.contains(event.target as Node)) setProductPickerOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [productPickerOpen]);
  const productNeedle = foldSearch(collectionQuery);
  const productHits = products
    .filter((product) => {
      if (!product.sourceId || draft.collections.includes(product.sourceId)) return false;
      if (!productNeedle) return true;
      return foldSearch(`${product.title} ${product.variant} ${product.sku}`).includes(productNeedle);
    })
    .slice(0, 8);
  function productLabel(sourceId: string) {
    const product = products.find((item) => item.sourceId === sourceId);
    if (!product) return "מוצר";
    const title = product.title.trim() || "מוצר";
    const shared = products.filter((item) => item.title.trim() === product.title.trim()).length > 1;
    return shared && product.variant.trim() ? `${title} · ${product.variant.trim()}` : title;
  }

  function patch(next: Partial<Discount>) {
    setDraft({ ...draft, ...next });
    setError("");
  }

  function chooseBxgyMode(mode: BxgyMode) {
    if (draft.bxMode === mode) return;
    setBuyLimited(false);
    setGetLimited(false);
    patch({ bxMode: mode, bxBuyIds: [], bxGetIds: [], bxColl: "", bxGetColl: "", bxBuy: mode === "qty" ? "2" : "1", bxGet: "1" });
  }

  function keepCategoryProducts(ids: string[], category: string) {
    return ids.filter((id) => {
      const product = products.find((item) => item.sourceId === id);
      return product ? productInCategory(product, category) : false;
    });
  }

  function addCollection(name: string) {
    const title = name.trim();
    if (!title || draft.collections.includes(title)) return;
    patch({ collections: [...draft.collections, title] });
    setCollectionQuery("");
  }

  function addProduct(sourceId: string) {
    if (!sourceId || draft.collections.includes(sourceId) || draft.collections.length >= 40) return;
    patch({ collections: [...draft.collections, sourceId] });
    setCollectionQuery("");
  }

  function save() {
    if (!draft.code.trim()) {
      setError(draft.method === "code" ? "יש להזין קוד הנחה" : "יש להזין כותרת");
      return;
    }
    if (draft.type === "bxgy") {
      if (draft.bxMode === "pair" && (draft.bxBuyIds.length !== 1 || draft.bxGetIds.length !== 1)) {
        setError("יש לבחור את המוצר שקונים ואת המוצר שמתקבל במתנה");
        return;
      }
      if (draft.bxMode === "pair" && draft.bxBuyIds[0] === draft.bxGetIds[0]) {
        setError("מוצר הקנייה ומוצר המתנה צריכים להיות שונים");
        return;
      }
      if (draft.bxMode === "qty" && draft.bxBuyIds.length !== 1) {
        setError("יש לבחור את המוצר שקונים");
        return;
      }
      if (draft.bxMode === "qty" && (!(Number(draft.bxBuy) > 0) || !(Number(draft.bxGet) > 0))) {
        setError("יש להזין כמות לקנייה וכמות במתנה");
        return;
      }
      if (draft.bxMode === "cats" && (!draft.bxColl.trim() || !draft.bxGetColl.trim())) {
        setError("יש לבחור קטגוריית קנייה וקטגוריית מתנה");
        return;
      }
      if (draft.bxMode === "cats" && buyLimited && draft.bxBuyIds.length === 0) {
        setError("יש לסמן מוצרים נבחרים מהקטגוריה שקונים, או לבטל את הסימון");
        return;
      }
      if (draft.bxMode === "cats" && getLimited && draft.bxGetIds.length === 0) {
        setError("יש לסמן מוצרים נבחרים מקטגוריית המתנה, או לבטל את הסימון");
        return;
      }
    }
    if (draft.type !== "ship" && draft.type !== "bxgy" && !(Number(draft.value) > 0)) {
      setError("יש להזין ערך הנחה גבוה מ-0");
      return;
    }
    if (draft.type === "product" && draft.applies === "prods" && draft.collections.length === 0) {
      setError("יש לבחור לפחות מוצר אחד");
      return;
    }
    setSaving(true);
    const id = existing?.id ?? nextDiscountId();
    const ready = bxgyReady(draft, buyLimited, getLimited);
    void saveDiscount({ ...ready, id })
      .then((next) => {
        setDraft(next);
        setSaved(next);
        setBuyLimited(next.bxMode === "cats" && next.bxBuyIds.length > 0);
        setGetLimited(next.bxMode === "cats" && next.bxGetIds.length > 0);
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
  const valueLabel = draft.type === "ship" ? "משלוח חינם" : draft.type === "bxgy" ? (draft.bxMode === "pair" ? "מוצר תמורת מוצר" : draft.bxMode === "cats" ? "קטגוריה תמורת קטגוריה" : `קנו ${draft.bxBuy || "0"} קבלו ${draft.bxGet || "0"}`) : draft.valueType === "pct" ? `${draft.value || "0"}%` : `${currencySymbol()}${draft.value || "0"}`;

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
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    {BXGY_MODES.map((mode) => (
                      <label key={mode.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 ${draft.bxMode === mode.id ? "bg-[#f6f6f6]" : "hover:bg-[#fafafa]"}`}>
                        <input type="radio" name="bxgy-mode" checked={draft.bxMode === mode.id} onChange={() => chooseBxgyMode(mode.id)} className="mt-1 accent-[#303030]" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{mode.title}</span>
                          <span className="mt-0.5 block text-[13px] leading-5 text-[#616161]">{mode.detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="border-t border-[#ebebeb] pt-3">
                    {draft.bxMode === "pair" ? (
                      <div className="grid gap-4">
                        <div>
                          <div className="mb-1.5 text-sm font-semibold">המוצר שקונים</div>
                          <ProductSearch products={uniqueProducts(products).filter((product) => product.sourceId !== draft.bxGetIds[0])} selected={draft.bxBuyIds} multiple={false} placeholder="חיפוש המוצר שקונים" onChange={(ids) => patch({ bxBuyIds: ids })} />
                        </div>
                        <div>
                          <div className="mb-1.5 text-sm font-semibold">המוצר במתנה</div>
                          <ProductSearch products={uniqueProducts(products).filter((product) => product.sourceId !== draft.bxBuyIds[0])} selected={draft.bxGetIds} multiple={false} placeholder="חיפוש מוצר המתנה" emptyLabel="אין מוצר אחר לבחירה" onChange={(ids) => patch({ bxGetIds: ids })} />
                        </div>
                        <p className="m-0 text-[13px] text-ink-secondary">הלקוח צריך את שני המוצרים בקופה, ומוצר המתנה יורד ל-{currencySymbol()}0. קוד קופון או הנחה אוטומטית נקבעים למעלה.</p>
                      </div>
                    ) : null}
                    {draft.bxMode === "qty" ? (
                      <div className="grid gap-4">
                        <div>
                          <div className="mb-1.5 text-sm font-semibold">המוצר</div>
                          <ProductSearch products={uniqueProducts(products)} selected={draft.bxBuyIds} multiple={false} placeholder="חיפוש מוצר" onChange={(ids) => patch({ bxBuyIds: ids, bxGetIds: ids })} />
                        </div>
                        <div className="grid gap-3 min-[700px]:grid-cols-2">
                          <label className="text-sm font-semibold">כמות לקנייה<input value={draft.bxBuy} onChange={(event) => patch({ bxBuy: event.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1.5 font-normal`} /></label>
                          <label className="text-sm font-semibold">כמות במתנה<input value={draft.bxGet} onChange={(event) => patch({ bxGet: event.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1.5 font-normal`} /></label>
                        </div>
                        <p className="m-0 text-[13px] text-ink-secondary">למשל קנו 2 וקבלו 1: שלוש יחידות בעגלה, ואחת מהן במתנה.</p>
                      </div>
                    ) : null}
                    {draft.bxMode === "cats" ? (
                      <div className="grid gap-4">
                        <div>
                          <div className="mb-1.5 text-sm font-semibold">קטגוריית הקנייה</div>
                          <CategorySearch names={collections} value={draft.bxColl} placeholder="חיפוש קטגוריה" onChange={(name) => { patch({ bxColl: name, bxBuyIds: keepCategoryProducts(draft.bxBuyIds, name) }); if (!name) setBuyLimited(false); }} />
                          {draft.bxColl.trim() ? <p className="m-0 mt-1.5 text-[13px] text-ink-secondary">{products.filter((product) => productInCategory(product, draft.bxColl)).length} מוצרים בקטגוריה</p> : null}
                          <label className={`mt-2 flex items-center gap-2 text-sm ${draft.bxColl.trim() ? "" : "text-[#8a8a8a]"}`}>
                            <input type="checkbox" checked={buyLimited} disabled={!draft.bxColl.trim()} onChange={(event) => { setBuyLimited(event.target.checked); if (!event.target.checked) patch({ bxBuyIds: [] }); }} className="size-4 accent-[#303030]" />
                            סימון מוצרים נבחרים מהקטגוריה
                          </label>
                          {buyLimited && draft.bxColl.trim() ? <div className="mt-2"><ProductSearch products={uniqueProducts(products.filter((product) => productInCategory(product, draft.bxColl)))} selected={draft.bxBuyIds} multiple placeholder="חיפוש מוצר בקטגוריה" onChange={(ids) => patch({ bxBuyIds: ids })} /></div> : null}
                        </div>
                        <div>
                          <div className="mb-1.5 text-sm font-semibold">קטגוריית המתנה</div>
                          <CategorySearch names={collections} value={draft.bxGetColl} placeholder="חיפוש קטגוריה" onChange={(name) => { patch({ bxGetColl: name, bxGetIds: keepCategoryProducts(draft.bxGetIds, name) }); if (!name) setGetLimited(false); }} />
                          {draft.bxGetColl.trim() ? <p className="m-0 mt-1.5 text-[13px] text-ink-secondary">{products.filter((product) => productInCategory(product, draft.bxGetColl)).length} מוצרים בקטגוריה</p> : null}
                          <label className={`mt-2 flex items-center gap-2 text-sm ${draft.bxGetColl.trim() ? "" : "text-[#8a8a8a]"}`}>
                            <input type="checkbox" checked={getLimited} disabled={!draft.bxGetColl.trim()} onChange={(event) => { setGetLimited(event.target.checked); if (!event.target.checked) patch({ bxGetIds: [] }); }} className="size-4 accent-[#303030]" />
                            סימון מוצרים נבחרים מהקטגוריה
                          </label>
                          {getLimited && draft.bxGetColl.trim() ? <div className="mt-2"><ProductSearch products={uniqueProducts(products.filter((product) => productInCategory(product, draft.bxGetColl)))} selected={draft.bxGetIds} multiple placeholder="חיפוש מוצר בקטגוריה" onChange={(ids) => patch({ bxGetIds: ids })} /></div> : null}
                        </div>
                        <p className="m-0 text-[13px] text-ink-secondary">מוצר אחד מקטגוריית המתנה יורד ל-{currencySymbol()}0 כשיש בעגלה מוצר מקטגוריית הקנייה.</p>
                      </div>
                    ) : null}
                  </div>
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
                      <select value={draft.applies} onChange={(event) => { const applies = event.target.value as Discount["applies"]; patch({ applies, collections: applies === draft.applies ? draft.collections : [] }); setCollectionQuery(""); setProductPickerOpen(false); }} className={`${field} mt-1.5 font-normal`}>
                        <option value="all">כל המוצרים</option>
                        <option value="prods">מוצרים ספציפיים</option>
                        <option value="colls">קטגוריות מסוימות</option>
                        <option value="subs">תתי קטגוריות</option>
                      </select>
                    </label>
                  ) : <p className="m-0 text-[13px] text-ink-secondary">האחוז או הסכום יורדים מכלל ההזמנה.</p>}
                  {draft.type === "product" && draft.applies === "prods" ? (
                    <div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {draft.collections.map((id) => {
                          const chosen = products.find((item) => item.sourceId === id);
                          const photo = chosen ? productPhoto(chosen) : "";
                          return (
                            <button key={id} type="button" onClick={() => patch({ collections: draft.collections.filter((item) => item !== id) })} className="inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[#f1f1f1] py-1 pr-1 pl-2.5 text-[13px] font-semibold">
                              {photo ? <img src={photo} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-[#e3e3e3]" />}
                              {productLabel(id)}
                              <Icon name="close" size={12} />
                            </button>
                          );
                        })}
                      </div>
                      <div ref={productPickerRef}>
                      <input value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} onFocus={() => setProductPickerOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setProductPickerOpen(false); return; } if (event.key === "Enter") { event.preventDefault(); const hit = productHits[0]; if (hit?.sourceId) addProduct(hit.sourceId); } }} placeholder="חיפוש מוצר" autoComplete="off" className={field} />
                      {productPickerOpen && productHits.length ? (
                        <div className="mt-1 max-h-80 overflow-auto rounded-lg border border-[#e3e3e3] bg-white">
                          {productHits.map((product) => {
                            const photo = productPhoto(product);
                            return (
                              <button key={product.sourceId} type="button" onClick={() => product.sourceId && addProduct(product.sourceId)} className="flex w-full items-center gap-3 border-0 border-b border-[#f1f1f1] bg-white px-2.5 py-2 text-start last:border-b-0 hover:bg-[#f7f7f7]">
                                {photo ? (
                                  <img src={photo} alt="" className="size-12 shrink-0 rounded-lg object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />
                                ) : (
                                  <span className="size-12 shrink-0 rounded-lg bg-[#f3f3f3] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-[#303030]">{product.title.trim() || "מוצר"}</span>
                                  {product.variant.trim() && product.variant.trim() !== "Default Title" && product.variant.trim() !== "ברירת מחדל" ? <span className="mt-0.5 block truncate text-[12px] text-[#616161]">{product.variant.trim()}</span> : null}
                                </span>
                                <span className="shrink-0 text-sm text-[#303030]">{formatMoney(product.price)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : productPickerOpen ? (
                        <p className="m-0 mt-2 text-[13px] text-ink-secondary">{products.length ? "אין מוצר בשם הזה" : "אין מוצרים בחנות"}</p>
                      ) : null}
                      </div>
                    </div>
                  ) : null}
                  {draft.type === "product" && (draft.applies === "colls" || draft.applies === "subs") ? (
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
                  {draft.blockGift ? " היא לא תחול אם יש כרטיס מתנה בקופה." : ""}
                  {draft.type === "bxgy" ? draft.combBundle ? " קנייה בבאנדל עדיין מזכה במתנה." : " קנייה בבאנדל לא מזכה במתנה." : ""}
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
                  {draft.type === "bxgy" ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={draft.combBundle} onChange={(event) => patch({ combBundle: event.target.checked })} className="mt-0.5 size-4 accent-[#303030]" />
                      <span>משתלבת עם באנדלים<span className="mt-0.5 block text-[12px] text-[#616161]">אם הלקוח קונה את המוצר במארז כמות, ההנחה עדיין חלה. בלי הסימון, קנייה בבאנדל לא מזכה במתנה.</span></span>
                    </label>
                  ) : null}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.blockGift} onChange={(event) => patch({ blockGift: event.target.checked })} className="mt-0.5 size-4 accent-[#303030]" />
                    <span>לא תשתלב עם כרטיסי מתנה<span className="mt-0.5 block text-[12px] text-[#616161]">אם יש כרטיס מתנה בקופה — קוד שמומש, או מוצר כרטיס מתנה בעגלה — ההנחה לא תחול.</span></span>
                  </label>
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
