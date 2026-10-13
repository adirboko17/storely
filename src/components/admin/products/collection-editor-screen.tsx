"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import {
  getCatalogVersion,
  getCollectionDraft,
  hideCollection,
  listCatalogProducts,
  saveCollectionDraft,
  subscribeCatalog,
  type CollectionCondition,
  type CollectionDraft,
} from "@/data/mock/catalog-session";
import { COLLECTION_SEEDS, PRODUCT_STATUS, productInSeed } from "@/lib/catalog/present";
import { formatMoney } from "@/lib/formatting/money";
import type { Product } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm outline-none";

function baseDraft(key: string | null, products: Product[]): CollectionDraft {
  if (!key) return { title: "", description: "", ids: [], conditions: [], excludeOutOfStock: false, image: "" };
  const stored = getCollectionDraft(key);
  if (stored) return stored;
  const seed = COLLECTION_SEEDS.find((item) => item.title === key);
  return {
    title: seed?.title ?? key,
    description: "",
    ids: products.filter((product) => productInSeed(product, key)).map((product) => product.id),
    conditions: [],
    excludeOutOfStock: false,
    image: seed?.tone && seed.tone !== "#fff" ? seed.tone : "",
  };
}

function matches(product: Product, condition: CollectionCondition) {
  const value = condition.value.trim();
  const number = Number(value);
  if (condition.field === "price") return condition.op === "lt" ? product.price < number : condition.op === "eq" ? product.price === number : product.price > number;
  if (condition.field === "stock") return condition.op === "lt" ? product.stock < number : condition.op === "eq" ? product.stock === number : product.stock > number;
  const text = condition.field === "vendor" ? product.vendor : condition.field === "category" ? product.category : product.tags.join(" ");
  return condition.op === "eq" ? text === value : text.includes(value);
}

export function CollectionEditorScreen({ collectionKey }: { collectionKey: string | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const products = listCatalogProducts();
  const known = collectionKey == null || COLLECTION_SEEDS.some((seed) => seed.title === collectionKey) || getCollectionDraft(collectionKey);
  const initial = useMemo(() => baseDraft(collectionKey, products), [collectionKey, products]);
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [boundKey, setBoundKey] = useState(collectionKey);
  if (boundKey !== collectionKey) {
    setBoundKey(collectionKey);
    setDraft(initial);
    setSaved(initial);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState("rel");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [picker, setPicker] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    if (!draft.title.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    const key = collectionKey ?? draft.title.trim();
    window.setTimeout(() => {
      saveCollectionDraft(key, draft);
      setSaved(draft);
      setSaving(false);
      toast("האוסף נשמר");
      if (!collectionKey) router.replace(`/admin/products/collections/${encodeURIComponent(key)}`);
    }, 500);
  }

  useUnsavedEditor(dirty, saving, save, () => { setDraft(saved); setError(false); });
  if (collectionKey && !known) notFound();

  let items = draft.conditions.length ? products.filter((product) => draft.conditions.every((condition) => matches(product, condition))) : products.filter((product) => draft.ids.includes(product.id));
  if (draft.excludeOutOfStock) items = items.filter((product) => product.stock > 0);
  if (sort === "az") items = [...items].sort((a, b) => a.title.localeCompare(b.title, "he"));
  if (sort === "pu") items = [...items].sort((a, b) => a.price - b.price);
  if (sort === "pd") items = [...items].sort((a, b) => b.price - a.price);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[6] flex items-center gap-2 bg-[#fafafa] px-3.5 py-2.5">
        <Link href="/admin/products/collections" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="flex-1 text-sm"><Link href="/admin/products/collections" className="text-ink no-underline">אוספים</Link> <span className="text-[#b5b5b5]">/</span> <b>{draft.title || "הוספת אוסף"}</b></span>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => toast("תצוגה מקדימה של האוסף נפתחה בלשונית חדשה")}>תצוגה מקדימה</button>
        {collectionKey ? <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => { hideCollection(collectionKey); toast("האוסף נמחק"); router.push("/admin/products/collections"); }}>מחיקה</button> : null}
      </div>
      <div className="mx-auto grid w-full max-w-[1100px] items-start gap-8 px-5 py-4 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-3">
          <input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setError(false); }} placeholder="שם האוסף" className="h-10 border-0 bg-transparent text-[26px] font-bold outline-none" style={{ backgroundColor: "transparent", boxShadow: error ? "inset 0 -2px 0 #e51c00" : "none" }} />
          {error ? <div className="text-[13px] text-[#8e1f0b]">יש להזין שם לאוסף</div> : null}
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} placeholder="תיאור" className="rounded-[10px] border border-[#c9c9c9] bg-white p-3 text-sm outline-none" />
          <button type="button" className="grid h-[140px] place-items-center rounded-2xl border border-dashed border-[#c9c9c9] bg-white text-sm" style={{ background: draft.image || "#fff" }} onClick={() => setDraft({ ...draft, image: draft.image ? "" : "#e7e2d9" })}>
            {draft.image ? "הסרת תמונה" : "הוספת תמונה"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <b className="flex-1">{items.length} מוצרים</b>
            <button type="button" className="h-7 rounded-lg border-0 px-2 text-[13px] font-semibold" style={{ background: view === "grid" ? "#ebebeb" : "transparent" }} onClick={() => setView("grid")}>רשת</button>
            <button type="button" className="h-7 rounded-lg border-0 px-2 text-[13px] font-semibold" style={{ background: view === "list" ? "#ebebeb" : "transparent" }} onClick={() => setView("list")}>רשימה</button>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-[30px] rounded-lg border border-[#c9c9c9] bg-white px-2 text-sm">
              <option value="rel">רלוונטיות</option>
              <option value="az">א-ת</option>
              <option value="pu">מחיר עולה</option>
              <option value="pd">מחיר יורד</option>
            </select>
          </div>
          {items.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-ink-secondary shadow-[0_0_0_1px_rgba(0,0,0,.08)]">אין מוצרים באוסף. הוסיפו מוצרים או תנאי סינון.</div> : null}
          <div className={view === "grid" ? "grid grid-cols-2 gap-3 min-[800px]:grid-cols-3" : "flex flex-col gap-2"}>
            {items.map((product) => {
              const status = PRODUCT_STATUS[product.status];
              return (
                <div key={product.id} className="flex gap-3 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                  <span className="size-12 shrink-0 rounded-lg" style={{ background: product.tone }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{product.title}</div>
                    <div dir="ltr" className="text-sm">{formatMoney(product.price)}</div>
                    <span className="mt-1 inline-flex h-5 items-center rounded-md px-1.5 text-xs font-semibold" style={{ background: status.background, color: status.color }}>{status.label}</span>
                  </div>
                  {draft.conditions.length === 0 ? <button type="button" className="border-0 bg-transparent text-ink-secondary" onClick={() => setDraft({ ...draft, ids: draft.ids.filter((id) => id !== product.id) })}>×</button> : null}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="font-semibold">תנאים</div>
          {draft.conditions.map((condition, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <select value={condition.field} onChange={(event) => setDraft({ ...draft, conditions: draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value as CollectionCondition["field"] } : item) })} className={field}>
                <option value="price">מחיר</option>
                <option value="stock">מלאי</option>
                <option value="vendor">ספק</option>
                <option value="category">קטגוריה</option>
                <option value="tag">תגית</option>
              </select>
              <select value={condition.op} onChange={(event) => setDraft({ ...draft, conditions: draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, op: event.target.value } : item) })} className={field}>
                <option value="gt">גדול מ</option>
                <option value="lt">קטן מ</option>
                <option value="eq">שווה ל</option>
                <option value="has">מכיל</option>
              </select>
              <input value={condition.value} onChange={(event) => setDraft({ ...draft, conditions: draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} className={field} />
              <button type="button" className="self-start border-0 bg-transparent text-[13px] text-[#8e1f0b]" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, itemIndex) => itemIndex !== index) })}>הסרה</button>
            </div>
          ))}
          <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] text-sm font-semibold" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "price", op: "gt", value: "" }] })}>הוספת תנאי</button>
          {draft.conditions.length === 0 ? (
            <div className="relative">
              <button type="button" className="h-[30px] w-full rounded-[10px] border-0 bg-[#1a1a1a] text-sm font-semibold text-white" onClick={() => setPicker((open) => !open)}>{draft.ids.length ? `עריכת מוצרים (${draft.ids.length})` : "הוספת מוצרים"}</button>
              {picker ? (
                <div className="absolute inset-x-0 top-9 z-20 max-h-64 overflow-auto rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                  {products.map((product) => (
                    <button key={product.id} type="button" className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => setDraft({ ...draft, ids: draft.ids.includes(product.id) ? draft.ids.filter((id) => id !== product.id) : [...draft.ids, product.id] })}>
                      <span className="size-6 rounded" style={{ background: product.tone }} />
                      <span className="flex-1">{product.title}</span>
                      {draft.ids.includes(product.id) ? "✓" : ""}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.excludeOutOfStock} onChange={(event) => setDraft({ ...draft, excludeOutOfStock: event.target.checked })} className="size-4 accent-[#303030]" />החרגת מוצרים שאזלו מהמלאי</label>
        </aside>
      </div>
      <div className="flex-1" />
    </div>
  );
}
