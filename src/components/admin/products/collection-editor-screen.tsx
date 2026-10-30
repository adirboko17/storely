"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { SlicePending, useAdminSlice } from "@/components/admin/slice-pending";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import {
  getCatalogVersion,
  getCollectionDraft,
  hideCollection,
  isVideoMedia,
  listCatalogProducts,
  saveCollectionDraft,
  subscribeCatalog,
  type CollectionCondition,
  type CollectionDraft,
} from "@/data/mock/catalog-session";
import { TermPicker } from "@/components/admin/products/term-picker";
import { COLLECTION_SEEDS, PRODUCT_STATUS, productInSeed } from "@/lib/catalog/present";
import { formatMoney } from "@/lib/formatting/money";
import type { Product } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm outline-none";

function baseDraft(key: string | null, products: Product[]): CollectionDraft {
  if (!key) return { title: "", description: "", ids: [], conditions: [], excludeOutOfStock: false, image: "", subcategories: [] };
  const stored = getCollectionDraft(key);
  const fromCategory = products.filter((product) => product.category.trim() === key || product.collections.includes(key)).map((product) => product.id);
  if (stored) {
    if (stored.conditions.length) return stored;
    return { ...stored, ids: [...new Set([...stored.ids, ...fromCategory])] };
  }
  const seed = COLLECTION_SEEDS.find((item) => item.title === key);
  return {
    title: seed?.title ?? key,
    description: "",
    ids: fromCategory.length ? fromCategory : products.filter((product) => productInSeed(product, key)).map((product) => product.id),
    conditions: [],
    excludeOutOfStock: false,
    image: seed?.tone && seed.tone !== "#fff" ? seed.tone : "",
    subcategories: [],
  };
}

function productImage(product: Product) {
  return product.media?.find((item) => item && !isVideoMedia(item)) ?? "";
}

function ProductTile({ product, view, member, onAdd, onRemove, subcategories, unmarked }: { product: Product; view: "grid" | "list"; member?: boolean; onAdd?: () => void; onRemove?: () => void; subcategories?: string[]; unmarked?: boolean }) {
  const photo = productImage(product);
  const status = PRODUCT_STATUS[product.status];
  const image = (
    <span className={`relative block overflow-hidden ${view === "grid" ? "aspect-square" : "size-16 shrink-0 rounded-lg"}`} style={{ background: product.tone }}>
      {photo ? <img src={photo} alt="" className="absolute inset-0 size-full object-cover" /> : null}
      {member ? (
        <span className="absolute top-2 right-2 inline-flex h-6 items-center gap-1 rounded-full bg-[#303030] px-2 text-[11px] font-semibold text-white">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M2.2 6.2 4.7 8.6 9.8 3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          בקטגוריה
        </span>
      ) : null}
      {onAdd ? <span className="absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-white text-sm shadow-[0_0_0_1px_rgba(0,0,0,.08)]">+</span> : null}
      {onRemove ? <button type="button" aria-label="הסרה מהקטגוריה" className="absolute top-2 left-2 grid size-6 place-items-center rounded-full border-0 bg-white text-sm shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={onRemove}>×</button> : null}
    </span>
  );
  const copy = (
    <span className={`block min-w-0 ${view === "grid" ? "p-3" : "flex-1"}`}>
      <span className="block truncate text-sm font-medium">{product.title}</span>
      <span dir="ltr" className="block text-start text-[13px] text-[#4a4a4a]">{formatMoney(product.price)}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="inline-flex h-5 items-center rounded-md px-1.5 text-xs font-semibold" style={{ background: status.background, color: status.color }}>{status.label}</span>
        {(subcategories ?? []).map((name) => (
          <span key={name} className="inline-flex h-5 max-w-full items-center truncate rounded-md bg-[#e3e3e3] px-1.5 text-xs font-medium text-[#303030]">{name}</span>
        ))}
        {member && unmarked ? <span className="inline-flex h-5 items-center rounded-md bg-[#fff1e3] px-1.5 text-xs font-medium text-[#5e4200]">בלי תת קטגוריה</span> : null}
      </span>
    </span>
  );
  const className = `w-full overflow-hidden rounded-xl text-start ${view === "list" ? "flex items-center gap-3 p-2" : ""} ${member ? "border-2 border-[#303030] bg-white" : onAdd ? "cursor-pointer border border-dashed border-[#c9c9c9] bg-[#fafafa]" : "border border-transparent bg-[#fafafa]"}`;
  if (onAdd) {
    return (
      <button type="button" className={className} onClick={onAdd}>
        {image}
        {copy}
      </button>
    );
  }
  return <div className={className}>{image}{copy}</div>;
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
  const catalogReady = useAdminSlice("catalog");
  const products = listCatalogProducts();
  const known = collectionKey == null || COLLECTION_SEEDS.some((seed) => seed.title === collectionKey) || Boolean(getCollectionDraft(collectionKey)) || products.some((product) => product.category.trim() === collectionKey);
  const initial = useMemo(() => baseDraft(collectionKey, products), [collectionKey, products]);
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [boundKey, setBoundKey] = useState(collectionKey);
  const [productQuery, setProductQuery] = useState("");
  if (boundKey !== collectionKey) {
    setBoundKey(collectionKey);
    setDraft(initial);
    setSaved(initial);
    setProductQuery("");
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState("rel");
  const [view, setView] = useState<"grid" | "list">("grid");
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
      toast("הקטגוריה נשמרה");
      if (!collectionKey) router.replace(`/admin/products/collections/${encodeURIComponent(key)}`);
    }, 500);
  }

  useUnsavedEditor(dirty, saving, save, () => { setDraft(saved); setError(false); });
  if (collectionKey && !known && !catalogReady) return <SlicePending label="טוען קטגוריה…" />;
  if (collectionKey && !known) notFound();

  let items = draft.conditions.length ? products.filter((product) => draft.conditions.every((condition) => matches(product, condition))) : products.filter((product) => draft.ids.includes(product.id));
  if (draft.excludeOutOfStock) items = items.filter((product) => product.trackInventory === false || product.stock > 0);
  if (sort === "az") items = [...items].sort((a, b) => a.title.localeCompare(b.title, "he"));
  if (sort === "pu") items = [...items].sort((a, b) => a.price - b.price);
  if (sort === "pd") items = [...items].sort((a, b) => b.price - a.price);
  const needle = productQuery.trim().toLowerCase();
  const matchesQuery = (product: Product) => !needle || product.title.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle);
  const visibleItems = items.filter(matchesQuery);
  const available = draft.conditions.length === 0 ? products.filter((product) => !draft.ids.includes(product.id) && matchesQuery(product)) : [];

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[6] flex items-center gap-2 bg-[#fafafa] px-3.5 py-2.5">
        <Link href="/admin/products/collections" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="flex-1 text-sm"><Link href="/admin/products/collections" className="text-ink no-underline">קטגוריות</Link> <span className="text-[#b5b5b5]">/</span> <b>{draft.title || "הוספת קטגוריה"}</b></span>
        {collectionKey ? <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => { hideCollection(collectionKey); toast("הקטגוריה נמחקה"); router.push("/admin/products/collections"); }}>מחיקה</button> : null}
      </div>
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <button type="button" aria-label="תמונת קטגוריה" className="grid size-24 shrink-0 place-items-center rounded-xl border border-dashed border-[#c9c9c9] text-2xl text-[#8a8a8a]" style={{ background: draft.image || "#fff" }} onClick={() => setDraft({ ...draft, image: draft.image ? "" : "#e7e2d9" })}>{draft.image ? "" : "ת"}</button>
            <div className="min-w-0 flex-1">
              <input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setError(false); }} placeholder="הוספת כותרת" className="h-8 w-full border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-[#8a8a8a]" style={{ boxShadow: error ? "inset 0 -2px 0 #e51c00" : "none" }} />
              {error ? <div className="text-[13px] text-[#8e1f0b]">יש להזין שם לקטגוריה</div> : null}
              <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} placeholder="הוספת תיאור" className="mt-1 w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-[#8a8a8a]" />
            </div>
            <button type="button" className="h-7 shrink-0 rounded-lg border-0 bg-[#f3f3f3] px-2 text-[12px] font-semibold" onClick={() => toast("הקטגוריה מוצגת בחנות")}>ערוצי מכירה</button>
          </div>
          <aside className="flex flex-col gap-3 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="text-sm font-semibold">מוצרים</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="h-7 rounded-lg border-0 bg-[#f3f3f3] px-2 text-[12px] font-semibold" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: "tag", op: "has", value: "" }] })}>+ תנאי</button>
            </div>
            <button type="button" className="self-start border-0 bg-transparent p-0 text-[13px] font-semibold" onClick={() => setDraft({ ...draft, excludeOutOfStock: !draft.excludeOutOfStock })}>{draft.excludeOutOfStock ? "ההחרגה פעילה" : "+ החרגה"}</button>
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
          </aside>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <TermPicker
            label="תתי קטגוריה"
            addLabel="הוספת תת קטגוריה"
            searchPlaceholder="חיפוש או הוספת תת קטגוריה"
            emptyLabel="אין תתי קטגוריה"
            createLabel="הוספת תת קטגוריה חדשה"
            options={draft.subcategories}
            selected={draft.subcategories}
            onChange={(names) => setDraft({ ...draft, subcategories: names })}
            onCreate={(title) => {
              if (!title) {
                toast("הקלידו שם לתת קטגוריה בשדה החיפוש");
                return false;
              }
              if (draft.subcategories.some((name) => name.localeCompare(title, "he", { sensitivity: "accent" }) === 0)) return true;
              setDraft({ ...draft, subcategories: [...draft.subcategories, title] });
              return true;
            }}
          />
        </div>
        <div>
          <div className="mt-2 rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <label className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-[#c9c9c9] bg-white px-2.5 focus-within:border-[#005bd3] focus-within:shadow-[0_0_0_1px_#005bd3]">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#616161" strokeWidth="1.7" aria-hidden><circle cx="8.5" cy="8.5" r="5.2" /><path d="M12.4 12.4 16 16" strokeLinecap="round" /></svg>
              <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="חיפוש מוצרים" className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
            </label>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" className="h-7 rounded-lg border-0 px-2 text-[13px] font-semibold" style={{ background: view === "grid" ? "#ebebeb" : "transparent" }} onClick={() => setView("grid")}>רשת</button>
              <button type="button" className="h-7 rounded-lg border-0 px-2 text-[13px] font-semibold" style={{ background: view === "list" ? "#ebebeb" : "transparent" }} onClick={() => setView("list")}>רשימה</button>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-7 rounded-lg border-0 bg-[#f3f3f3] px-2 text-[13px]">
                <option value="rel">רלוונטיות</option>
                <option value="az">א-ת</option>
                <option value="pu">מחיר עולה</option>
                <option value="pd">מחיר יורד</option>
              </select>
              <span className="inline-flex h-7 items-center rounded-full bg-[#f3f3f3] px-2.5 text-[12px]">סטטוס: פעיל, טיוטה ובארכיון</span>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <b className="text-sm">בקטגוריה</b>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#303030] px-1.5 text-[11px] font-semibold text-white">{visibleItems.length}</span>
            </div>
            {visibleItems.length === 0 ? (
              <p className="m-0 rounded-lg bg-[#fafafa] px-3 py-6 text-center text-sm text-[#616161]">{needle ? "אין בקטגוריה מוצרים תואמים" : draft.conditions.length > 0 ? "אין מוצרים שעונים על התנאים" : "אין עדיין מוצרים בקטגוריה"}</p>
            ) : (
              <div className={view === "grid" ? "grid grid-cols-2 gap-3 min-[800px]:grid-cols-4" : "flex flex-col gap-2"}>
                {visibleItems.map((product) => {
                  const subcategories = (product.subcategories ?? []).map((name) => name.trim()).filter((name) => name && draft.subcategories.includes(name));
                  return (
                    <ProductTile
                      key={product.id}
                      product={product}
                      view={view}
                      member
                      subcategories={subcategories}
                      unmarked={draft.subcategories.length > 0 && subcategories.length === 0}
                      onRemove={draft.conditions.length === 0 ? () => setDraft({ ...draft, ids: draft.ids.filter((id) => id !== product.id) }) : undefined}
                    />
                  );
                })}
              </div>
            )}
            {available.length > 0 ? (
              <div className="mt-5 border-t border-[#f1f1f1] pt-4">
                <b className="text-sm">לא בקטגוריה</b>
                <p className="m-0 mt-1 mb-3 text-[13px] text-[#616161]">לחצו על מוצר כדי להוסיף אותו לקטגוריה</p>
                <div className={view === "grid" ? "grid grid-cols-2 gap-3 min-[800px]:grid-cols-4" : "flex flex-col gap-2"}>
                  {available.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      view={view}
                      onAdd={() => setDraft({ ...draft, ids: [...draft.ids, product.id] })}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}
