"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import {
  getCatalogProduct,
  getCatalogVersion,
  listCatalogProducts,
  nextProductId,
  saveCatalogProduct,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { COLLECTIONS } from "@/data/mock/products";
import { PRODUCT_STATUS, slugifyHandle } from "@/lib/catalog/present";
import { formatMoney } from "@/lib/formatting/money";
import type { Product, ProductStatus } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none";
const card = "rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.04)]";

type Draft = {
  title: string;
  description: string;
  category: string;
  price: string;
  compare: string;
  cost: string;
  sku: string;
  barcode: string;
  qty: string;
  tax: boolean;
  continueSelling: boolean;
  status: ProductStatus;
  vendor: string;
  collections: string[];
  tags: string[];
  promo: string;
  care: string;
  seoTitle: string;
  seoDesc: string;
  handle: string;
  optionName: string;
  optionValues: string[];
  variantPrices: string[];
  variantQty: string[];
  media: string[];
};

function fromProduct(product: Product | null): Draft {
  const values = product?.option?.values ?? [];
  const quantities = product?.quantities ?? (product ? [product.stock] : []);
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    price: product ? product.price.toFixed(2) : "",
    compare: product?.compareAt ? product.compareAt.toFixed(2) : "",
    cost: product ? product.cost.toFixed(2) : "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    qty: String(product?.stock ?? 0),
    tax: true,
    continueSelling: false,
    status: product?.status ?? "draft",
    vendor: product?.vendor ?? "סטודיו לבנה",
    collections: product ? [...product.collections] : [],
    tags: product ? [...product.tags] : [],
    promo: "",
    care: "",
    seoTitle: product?.title ?? "",
    seoDesc: product?.description?.slice(0, 155) ?? "",
    handle: slugifyHandle(product?.title ?? ""),
    optionName: product?.option?.name ?? "",
    optionValues: [...values],
    variantPrices: values.map(() => (product ? product.price.toFixed(2) : "")),
    variantQty: values.map((_, index) => String(quantities[index] ?? 0)),
    media: product ? [product.tone] : [],
  };
}

export function ProductEditorScreen({ productId }: { productId: number | null }) {
  const router = useRouter();
  const { toast, menu, toggleMenu } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const product = productId == null ? null : getCatalogProduct(productId);
  const missing = productId != null && !product;
  const baseline = useMemo(() => fromProduct(product), [product]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [boundId, setBoundId] = useState(productId);
  if (boundId !== productId) {
    setBoundId(productId);
    setDraft(baseline);
    setSaved(baseline);
  }
  const [tagInput, setTagInput] = useState("");
  const [seoEdit, setSeoEdit] = useState(false);
  const [suggest, setSuggest] = useState(productId === 0);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setErrors([]);
  }

  function discard() {
    setDraft(saved);
    setErrors([]);
  }

  function save() {
    const nextErrors: string[] = [];
    const price = Number(draft.price);
    if (!draft.title.trim()) nextErrors.push("יש להזין כותרת למוצר");
    if (!(price >= 0) || draft.price.trim() === "") nextErrors.push("יש להזין מחיר תקין");
    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      const id = product?.id ?? nextProductId();
      const quantities = draft.optionValues.length
        ? draft.variantQty.map((value) => Math.max(0, Number(value) || 0))
        : [Math.max(0, Number(draft.qty) || 0)];
      const savedProduct: Product = {
        id,
        title: draft.title.trim(),
        variant: draft.optionValues[0] ?? product?.variant ?? "",
        price,
        compareAt: draft.compare.trim() ? Number(draft.compare) : undefined,
        cost: Number(draft.cost) || 0,
        sku: draft.sku.trim(),
        barcode: draft.barcode.trim() || undefined,
        stock: quantities.reduce((sum, value) => sum + value, 0),
        status: draft.status,
        category: draft.category,
        vendor: draft.vendor,
        tone: draft.media[0] ?? product?.tone ?? "#e7e2d9",
        tags: draft.tags,
        collections: draft.collections,
        option: draft.optionValues.length ? { name: draft.optionName || "אפשרות", values: draft.optionValues } : undefined,
        quantities: draft.optionValues.length ? quantities : undefined,
        description: draft.description,
      };
      saveCatalogProduct(savedProduct);
      const next = fromProduct(savedProduct);
      setDraft(next);
      setSaved(next);
      setSaving(false);
      toast("המוצר נשמר");
      if (productId == null) router.replace(`/admin/products/${id}`);
    }, 600);
  }

  useUnsavedEditor(dirty, saving, save, discard);
  if (missing) notFound();

  const priceNumber = Number(draft.price) || 0;
  const costNumber = Number(draft.cost) || 0;
  const profit = priceNumber - costNumber;
  const margin = priceNumber > 0 ? `${Math.round((profit / priceNumber) * 100)}%` : "—";
  const status = PRODUCT_STATUS[draft.status];
  const vendors = [...new Set(listCatalogProducts().map((item) => item.vendor))];
  const categories = [...new Set(listCatalogProducts().map((item) => item.category))];
  const titleError = errors.some((item) => item.includes("כותרת"));
  const priceError = errors.some((item) => item.includes("מחיר"));
  const hasVariants = draft.optionValues.length > 0;

  function addMedia() {
    if (uploading) return;
    setUploading(true);
    window.setTimeout(() => {
      patch({ media: [...draft.media, "#e7e2d9"] });
      setUploading(false);
      toast("התמונה נוספה");
    }, 1400);
  }

  return (
    <div className="min-h-full bg-white">
      <div className="sticky top-0 z-[15] flex flex-wrap items-center gap-2 border-b border-[#ebebeb] bg-white px-3 py-2">
        <Link href="/admin/products" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.12)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <Link href="/admin/products" className="text-sm text-ink-secondary no-underline">מוצרים</Link>
        <span className="text-[#b5b5b5]">/</span>
        <span className="max-w-[340px] truncate text-sm font-semibold">{draft.title || "מוצר חדש"}</span>
        <div className="flex-1" />
        {product ? (
          <button type="button" className="inline-flex h-[30px] items-center rounded-[10px] border-0 bg-white px-3 text-sm font-medium shadow-[0_0_0_1px_rgba(0,0,0,.12)]" onClick={() => toast("תצוגת החנות כלקוח תיפתח בלשונית חדשה")}>
            צפייה כלקוח
          </button>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-[1120px] items-start gap-10 px-4 py-4 min-[1000px]:grid-cols-[minmax(0,1fr)_280px] min-[1000px]:px-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5 py-2">
            <h1 className="m-0 text-[26px] leading-8 font-bold text-[#1a1a1a]">{draft.title || "מוצר חדש"}</h1>
            {product ? <span className="inline-flex h-[22px] items-center rounded-md px-2 text-[13px] font-semibold" style={{ background: status.background, color: status.color }}>{status.label}</span> : null}
          </div>

          {errors.length ? (
            <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_#fdb5b0]">
              <div className="bg-[#fedad9] px-4 py-2.5 font-bold text-[#8e1f0b]">יש לתקן {errors.length === 1 ? "שגיאה אחת" : `${errors.length} שגיאות`}</div>
              <ul className="m-0 px-9 py-2.5">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}

          <div className={`${card} flex flex-col gap-[18px]`}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">כותרת</span>
              <input value={draft.title} onChange={(event) => patch({ title: event.target.value, seoTitle: draft.seoTitle === saved.seoTitle || draft.seoTitle === draft.title ? event.target.value : draft.seoTitle, handle: slugifyHandle(event.target.value) })} placeholder="לדוגמה: ספל קרמיקה עבודת יד" className={field} style={{ borderColor: titleError ? "#e51c00" : "#c9c9c9", background: titleError ? "#fff4f4" : "#fff" }} />
              {titleError ? <div className="mt-1.5 text-[13px] text-[#8e1f0b]">יש להזין כותרת למוצר</div> : null}
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">תיאור</span>
              <div className="overflow-hidden rounded-[10px] border border-[#c9c9c9]">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-[#ebebeb] bg-[#f7f7f7] px-1.5 py-1">
                  <button type="button" aria-label="כתיבה בעזרת העוזר" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#5b3fc4]" onClick={() => patch({ description: draft.description || "ספל קרמיקה שנזרק על האובניים בסטודיו שלנו בפרדס חנה. כל ספל מזוגג ביד." })}>✦</button>
                  <span className="mx-1 h-[18px] w-px bg-[#d4d4d4]" />
                  {["B", "I", "U"].map((mark) => (
                    <button key={mark} type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-sm font-bold">{mark}</button>
                  ))}
                </div>
                <textarea value={draft.description} onChange={(event) => patch({ description: event.target.value })} rows={6} className="block w-full resize-y border-0 bg-white p-3 text-sm leading-[22px] outline-none" />
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">מדיה</span>
              <div className="flex flex-wrap gap-2">
                {draft.media.map((tone, index) => (
                  <span key={`${tone}-${index}`} className="grid size-[116px] place-items-center rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,.1)]" style={{ background: tone }} />
                ))}
                {uploading ? <span className="grid size-[116px] place-items-center rounded-xl bg-[#f1f1f1]"><span className="size-5 animate-spin rounded-full border-2 border-black/15 border-t-[#303030]" /></span> : null}
                <button type="button" aria-label="הוספת מדיה" onClick={addMedia} className="grid size-[116px] place-items-center rounded-xl border-[1.5px] border-dashed border-[#c9c9c9] bg-[#fafafa]">+</button>
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">קטגוריה</span>
              <input value={draft.category} onChange={(event) => patch({ category: event.target.value })} placeholder="בחירת קטגוריית מוצר" className={field} />
              {suggest ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-[#efeafd] px-3 py-1.5 text-[13px] text-[#3d2a8a]">
                  <button type="button" className="flex-1 border-0 bg-transparent p-0 text-start text-[13px] text-[#3d2a8a]" onClick={() => { patch({ category: "כלי שתייה" }); setSuggest(false); }}><b>כלי שתייה</b> בבית וגינה</button>
                  <span>הצעה</span>
                  <button type="button" aria-label="סגירת הצעה" className="border-0 bg-transparent text-[#5b3fc4]" onClick={() => setSuggest(false)}>×</button>
                </div>
              ) : null}
              <div className="mt-1.5 text-[13px] text-ink-secondary">קובעת את שיעורי המס ומוסיפה שדות מידע שמשפרים חיפוש, סינון ומכירה בערוצים נוספים.</div>
            </div>
          </div>

          {!hasVariants ? (
            <>
              <h2 className="m-0 px-1 pt-4 text-[15px] font-semibold">תמחור</h2>
              <div className={`${card} flex flex-col gap-3.5`}>
                <div className="grid gap-3 min-[700px]:grid-cols-3">
                  <label>
                    <span className="mb-1.5 block text-sm font-semibold">מחיר</span>
                    <input dir="ltr" inputMode="decimal" value={draft.price} onChange={(event) => patch({ price: event.target.value })} placeholder="0.00" className={`${field} text-end`} style={{ borderColor: priceError ? "#e51c00" : "#c9c9c9", background: priceError ? "#fff4f4" : "#fff" }} />
                    {priceError ? <div className="mt-1.5 text-[13px] text-[#8e1f0b]">יש להזין מחיר תקין</div> : null}
                  </label>
                  <label>
                    <span className="mb-1.5 block text-sm font-semibold">מחיר לפני הנחה</span>
                    <input dir="ltr" inputMode="decimal" value={draft.compare} onChange={(event) => patch({ compare: event.target.value })} placeholder="0.00" className={`${field} text-end`} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-sm font-semibold">עלות לפריט</span>
                    <input dir="ltr" inputMode="decimal" value={draft.cost} onChange={(event) => patch({ cost: event.target.value })} placeholder="0.00" className={`${field} text-end`} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-6 text-[13px] text-ink-secondary">
                  <span>רווח: <b dir="ltr" className="text-ink">{formatMoney(profit)}</b></span>
                  <span>שיעור רווח: <b dir="ltr" className="text-ink">{margin}</b></span>
                  <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" checked={draft.tax} onChange={(event) => patch({ tax: event.target.checked })} className="size-[15px] accent-[#303030]" />המחיר כולל מע״מ (18%)</label>
                </div>
              </div>
              <h2 className="m-0 px-1 pt-4 text-[15px] font-semibold">מלאי</h2>
              <div className={`${card} flex flex-col gap-3`}>
                <div className="grid gap-3 min-[700px]:grid-cols-3">
                  <label><span className="mb-1.5 block text-sm font-semibold">מק״ט (SKU)</span><input dir="ltr" value={draft.sku} onChange={(event) => patch({ sku: event.target.value })} className={`${field} text-end`} /></label>
                  <label><span className="mb-1.5 block text-sm font-semibold">ברקוד</span><input dir="ltr" value={draft.barcode} onChange={(event) => patch({ barcode: event.target.value })} className={`${field} text-end`} /></label>
                  <label><span className="mb-1.5 block text-sm font-semibold">כמות במחסן הראשי</span><input dir="ltr" type="number" value={draft.qty} onChange={(event) => patch({ qty: event.target.value })} className={`${field} text-end`} /></label>
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={draft.continueSelling} onChange={(event) => patch({ continueSelling: event.target.checked })} className="size-4 accent-[#303030]" />המשך מכירה גם כשהמלאי אוזל</label>
              </div>
            </>
          ) : null}

          <div className="flex items-center px-1 pt-4">
            <h2 className="m-0 flex-1 text-[15px] font-semibold">וריאציות</h2>
            <button type="button" className="h-7 rounded-lg border-0 bg-[#ebebeb] px-2.5 text-[13px] font-semibold" onClick={() => patch({ optionName: draft.optionName || "צבע", optionValues: [...draft.optionValues, "חדש"], variantPrices: [...draft.variantPrices, draft.price || "0.00"], variantQty: [...draft.variantQty, "0"] })}>הוספת וריאציה</button>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.04)]">
            {!hasVariants ? (
              <button type="button" className="w-full border-0 bg-white p-4 text-start text-sm" onClick={() => patch({ optionName: "צבע", optionValues: ["אפשרות 1"], variantPrices: [draft.price || "0.00"], variantQty: [draft.qty || "0"] })}>
                הוספת אפשרויות כמו גודל או צבע
              </button>
            ) : (
              <>
                <div className="p-4">
                  <div className="rounded-xl border border-[#e3e3e3] p-3">
                    <div className="font-semibold">{draft.optionName}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {draft.optionValues.map((value, index) => (
                        <span key={`${value}-${index}`} className="inline-flex h-6 items-center rounded-md bg-[#e3e3e3] px-2 text-[13px]">{value}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-[#ebebeb] px-2">
                  <table className="w-full min-w-[460px] border-collapse text-sm">
                    <thead>
                      <tr className="h-[34px] text-[13px] text-[#4a4a4a]">
                        <th className="bg-[#f3f3f3] px-2 text-start font-semibold">וריאציה</th>
                        <th className="w-[200px] bg-[#f3f3f3] px-2 text-start font-semibold">מחיר</th>
                        <th className="w-[110px] bg-[#f3f3f3] px-2 text-start font-semibold">זמין</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.optionValues.map((value, index) => (
                        <tr key={`${value}-${index}`} className="h-[72px] border-b border-[#ebebeb]">
                          <td className="px-2 font-medium">{value}</td>
                          <td className="px-2"><input dir="ltr" value={draft.variantPrices[index] ?? ""} onChange={(event) => patch({ variantPrices: draft.variantPrices.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)) })} className={field} /></td>
                          <td className="px-2"><input dir="ltr" type="number" value={draft.variantQty[index] ?? "0"} onChange={(event) => patch({ variantQty: draft.variantQty.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)) })} className={`${field} text-end`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 text-sm">סך המלאי: {draft.variantQty.reduce((sum, value) => sum + (Number(value) || 0), 0)}</div>
              </>
            )}
          </div>

          <h2 className="m-0 px-1 pt-4 text-[15px] font-semibold">שדות מידע נוספים</h2>
          <div className={card}>
            <label className="grid items-center gap-3 py-1 min-[700px]:grid-cols-[200px_minmax(0,1fr)]"><span>מבצעים</span><input value={draft.promo} onChange={(event) => patch({ promo: event.target.value })} className={field} /></label>
            <label className="mt-3 grid items-center gap-3 min-[700px]:grid-cols-[200px_minmax(0,1fr)]"><span>הוראות שימוש</span><input value={draft.care} onChange={(event) => patch({ care: event.target.value })} placeholder="לדוגמה: מתאים למדיח כלים" className={field} /></label>
          </div>

          <div className="flex items-center px-1 pt-4">
            <h2 className="m-0 flex-1 text-[15px] font-semibold">תצוגה במנועי חיפוש</h2>
            <button type="button" aria-label="עריכה" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent" onClick={() => setSeoEdit((open) => !open)}>✎</button>
          </div>
          <div className={`${card} flex flex-col gap-0.5`}>
            <span>סטודיו לבנה</span>
            <span dir="ltr" className="text-[13px] text-[#4a4a4a]">lavana.co.il/products/{draft.handle || "product"}</span>
            <span className="mt-1 text-[22px] leading-[30px] text-[#1a4fd6]">{draft.seoTitle || draft.title || "כותרת המוצר"}</span>
            <span className="text-sm text-[#4a4a4a]">{draft.seoDesc || draft.description.slice(0, 155) || "תיאור המוצר יופיע כאן."}</span>
            <span dir="ltr" className="mt-1 text-sm text-[#4a4a4a]">{formatMoney(priceNumber)}</span>
            {seoEdit ? (
              <div className="mt-3 flex flex-col gap-3 border-t border-[#ebebeb] pt-3">
                <label><span className="mb-1.5 block text-sm font-semibold">כותרת העמוד</span><input value={draft.seoTitle} onChange={(event) => patch({ seoTitle: event.target.value })} className={field} /><div className="mt-1 text-[13px] text-ink-secondary">{draft.seoTitle.length} מתוך 70</div></label>
                <label><span className="mb-1.5 block text-sm font-semibold">תיאור מטא</span><textarea value={draft.seoDesc} onChange={(event) => patch({ seoDesc: event.target.value })} rows={3} className="w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm outline-none" /><div className="mt-1 text-[13px] text-ink-secondary">{draft.seoDesc.length} מתוך 160</div></label>
                <label><span className="mb-1.5 block text-sm font-semibold">כתובת URL</span><input dir="ltr" value={draft.handle} onChange={(event) => patch({ handle: event.target.value })} className={`${field} text-end`} /></label>
              </div>
            ) : null}
          </div>
          <div className="h-[72px]" />
        </div>

        <aside className="flex min-w-0 flex-col pt-3 text-sm">
          <div className="border-b border-[#ebebeb] pb-4">
            <span className="mb-1.5 block font-semibold">סטטוס</span>
            <select value={draft.status} onChange={(event) => patch({ status: event.target.value as ProductStatus })} className={field}>
              <option value="active">פעיל</option>
              <option value="draft">טיוטה</option>
              <option value="archived">בארכיון</option>
            </select>
          </div>
          <div className="flex flex-col gap-2 border-b border-[#ebebeb] py-4">
            <span className="text-[#4a4a4a]">פרסום</span>
            <div className="flex items-center gap-2"><span className="flex-1 font-medium">כל הערוצים</span><span className="inline-flex h-5 items-center rounded-md px-1.5 text-xs font-semibold" style={{ background: draft.status === "active" ? "#cdfee1" : "#ebebeb", color: draft.status === "active" ? "#0c5132" : "#4a4a4a" }}>{draft.status === "active" ? "פעיל" : "לא פעיל"}</span></div>
            <span className="font-medium">כל הקטלוגים</span>
          </div>
          <div className="flex flex-col gap-2 border-b border-[#ebebeb] py-4">
            <span className="text-[#4a4a4a]">מכירות</span>
            <span>{product ? "נמכר ב-30 הימים האחרונים" : "עדיין אין מכירות"}</span>
          </div>
          <div className="flex flex-col gap-3.5 border-b border-[#ebebeb] py-4">
            <span className="text-[#4a4a4a]">ארגון המוצר</span>
            <label><span className="mb-1.5 block font-semibold">סוג</span>
              <select value={draft.category} onChange={(event) => patch({ category: event.target.value })} className={field}>
                <option value="">ללא</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label><span className="mb-1.5 block font-semibold">ספק</span>
              <select value={draft.vendor} onChange={(event) => patch({ vendor: event.target.value })} className={field}>
                {vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
              </select>
            </label>
            <div className="relative">
              <div className="mb-1.5 flex items-center"><span className="flex-1 font-semibold">אוספים</span><button type="button" aria-label="הוספה לאוסף" className="grid size-6 place-items-center border-0 bg-transparent" onClick={() => toggleMenu("coll")}>+</button></div>
              {menu === "coll" ? (
                <div className="absolute inset-x-0 top-8 z-50 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_8px_24px_rgba(0,0,0,.16)]">
                  {COLLECTIONS.filter((name) => !draft.collections.includes(name)).map((name) => (
                    <button key={name} type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { patch({ collections: [...draft.collections, name] }); toggleMenu("coll"); }}>{name}</button>
                  ))}
                </div>
              ) : null}
              <div className="flex min-h-9 flex-wrap gap-1.5 rounded-[10px] border border-[#c9c9c9] p-1.5">
                {draft.collections.map((name) => (
                  <span key={name} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-[#ebebeb] ps-2 pe-1 text-[13px]">
                    {name}
                    <button type="button" aria-label="הסרה" className="border-0 bg-transparent text-ink-secondary" onClick={() => patch({ collections: draft.collections.filter((item) => item !== name) })}>×</button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block font-semibold">תגיות</span>
              <div className="flex flex-col items-start gap-1.5 rounded-[10px] border border-[#c9c9c9] p-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {draft.tags.map((tag) => (
                    <span key={tag} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-[#ebebeb] ps-2 pe-1 text-[13px]">
                      {tag}
                      <button type="button" aria-label="הסרת תגית" className="border-0 bg-transparent" onClick={() => patch({ tags: draft.tags.filter((item) => item !== tag) })}>×</button>
                    </span>
                  ))}
                </div>
                <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const value = tagInput.trim(); if (value && !draft.tags.includes(value)) patch({ tags: [...draft.tags, value] }); setTagInput(""); } }} placeholder="הוספת תגית ו-Enter" className="h-[26px] w-full border-0 bg-transparent px-1 text-sm outline-none" style={{ backgroundColor: "transparent" }} />
              </div>
            </div>
          </div>
          <div className="py-4">
            <span className="mb-1.5 block font-semibold">תבנית עיצוב</span>
            <select className={field}><option>מוצר ברירת מחדל</option><option>מוצר עם גלריה</option></select>
          </div>
        </aside>
      </div>
    </div>
  );
}
