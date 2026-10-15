"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { TermPicker } from "@/components/admin/products/term-picker";
import {
  addCategorySubcategory,
  getCatalogProduct,
  getCatalogVersion,
  listCatalogProducts,
  listCategorySubcategories,
  listExtraCollections,
  listHiddenCollections,
  nextProductId,
  saveCatalogProduct,
  saveCollectionDraft,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { getStoreIdentity } from "@/data/live/store-identity";
import { PRODUCT_STATUS, slugifyHandle } from "@/lib/catalog/present";
import { formatMoney } from "@/lib/formatting/money";
import type { Product, ProductStatus } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none";
const card = "rounded-xl border border-[#d9d9d9] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.06)]";
const OPTION_PRESETS = ["צבע", "מידה", "חומר", "סגנון"];

type OptionGroup = { name: string; values: string[] };

function cleanOptions(options: OptionGroup[]) {
  return options
    .map((option) => ({ name: option.name.trim(), values: option.values.map((value) => value.trim()).filter(Boolean) }))
    .filter((option) => option.name && option.values.length);
}

function optionLabels(options: OptionGroup[]) {
  const groups = cleanOptions(options);
  if (!groups.length) return [];
  return groups.reduce<string[]>((labels, option) => (labels.length ? labels.flatMap((label) => option.values.map((value) => `${label} / ${value}`)) : [...option.values]), []);
}

function alignVariantRows(previousLabels: string[], nextLabels: string[], prices: string[], qty: string[], fallbackPrice: string) {
  const known = new Map(previousLabels.map((label, index) => [label, { price: prices[index] ?? fallbackPrice, qty: qty[index] ?? "0" }]));
  return {
    variantPrices: nextLabels.map((label) => known.get(label)?.price ?? (fallbackPrice || "0.00")),
    variantQty: nextLabels.map((label) => known.get(label)?.qty ?? "0"),
  };
}

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
  subcategories: string[];
  tags: string[];
  seoTitle: string;
  seoDesc: string;
  handle: string;
  options: OptionGroup[];
  variantPrices: string[];
  variantQty: string[];
  media: string[];
};

function selectedCategories(product: Product | null) {
  if (!product) return [];
  return [...new Set([product.category.trim(), ...product.collections.map((item) => item.trim())].filter(Boolean))];
}

function fromProduct(product: Product | null): Draft {
  const options = product?.options?.length
    ? product.options.map((option) => ({ name: option.name, values: [...option.values] }))
    : product?.option?.values.length
      ? [{ name: product.option.name, values: [...product.option.values] }]
      : [];
  const labels = optionLabels(options);
  const quantities = product?.quantities ?? (product ? [product.stock] : []);
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    category: selectedCategories(product)[0] ?? "",
    price: product ? product.price.toFixed(2) : "",
    compare: product?.compareAt ? product.compareAt.toFixed(2) : "",
    cost: product ? product.cost.toFixed(2) : "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    qty: String(product?.stock ?? 0),
    tax: true,
    continueSelling: false,
    status: product?.status ?? "draft",
    vendor: product?.vendor || getStoreIdentity().name,
    collections: selectedCategories(product),
    subcategories: product?.subcategories ? [...product.subcategories] : [],
    tags: product ? [...product.tags] : [],
    seoTitle: product?.title ?? "",
    seoDesc: product?.description?.slice(0, 155) ?? "",
    handle: slugifyHandle(product?.title ?? ""),
    options,
    variantPrices: labels.map(() => (product ? product.price.toFixed(2) : "")),
    variantQty: labels.map((_, index) => String(quantities[index] ?? 0)),
    media: product?.media ? [...product.media] : [],
  };
}

const mediaDragType = "application/x-storely-media";

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function ProductEditorScreen({ productId }: { productId: number | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
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
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [optionDraft, setOptionDraft] = useState({ name: "", values: [] as string[], pending: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setErrors([]);
  }

  function discard() {
    setDraft(saved);
    setPickerOpen(false);
    setEditing(null);
    setOptionDraft({ name: "", values: [], pending: "" });
    setErrors([]);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function close(event: MouseEvent) {
      if (pickerRef.current?.contains(event.target as Node)) return;
      setPickerOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function commitOptions(nextOptions: OptionGroup[]) {
    setDraft((current) => {
      const previous = optionLabels(current.options);
      const next = optionLabels(nextOptions);
      return { ...current, options: nextOptions, ...alignVariantRows(previous, next, current.variantPrices, current.variantQty, current.price || "0.00") };
    });
    setErrors([]);
  }

  function openOptionEditor(index: number, seed?: OptionGroup) {
    setPickerOpen(false);
    setOptionQuery("");
    setEditing(index);
    setOptionDraft({ name: seed?.name ?? "", values: seed ? [...seed.values] : [], pending: "" });
  }

  function takePending(current: { name: string; values: string[]; pending: string }) {
    const pending = current.pending.trim().replace(/,$/, "");
    if (!pending || current.values.some((value) => value.trim() === pending)) return { ...current, pending: "" };
    return { ...current, values: [...current.values, pending], pending: "" };
  }

  function finishOption() {
    const next = takePending(optionDraft);
    const name = next.name.trim();
    const values = next.values.map((value) => value.trim()).filter(Boolean);
    if (!name) {
      toast("הזינו שם לאפשרות");
      return false;
    }
    if (!values.length) {
      toast("הוסיפו לפחות ערך אחד");
      return false;
    }
    if (draft.options.some((item, index) => item.name.trim() === name && index !== editing)) {
      toast("האפשרות הזו כבר קיימת");
      return false;
    }
    const group = { name, values };
    const nextOptions = editing != null && editing >= 0 ? draft.options.map((item, index) => (index === editing ? group : item)) : [...draft.options, group];
    commitOptions(nextOptions);
    setEditing(null);
    setOptionDraft({ name: "", values: [], pending: "" });
    return true;
  }

  function deleteOption() {
    if (editing != null && editing >= 0) commitOptions(draft.options.filter((_, index) => index !== editing));
    setEditing(null);
    setOptionDraft({ name: "", values: [], pending: "" });
  }

  function requestAdd() {
    if (editing != null && !finishOption()) return;
    const count = draft.options.length + (editing === -1 ? 1 : 0);
    if (count >= 3) {
      toast("אפשר להוסיף עד 3 אפשרויות");
      return;
    }
    setOptionQuery("");
    setPickerOpen(true);
  }

  function updateVariantRow(index: number, partial: { price?: string; qty?: string }) {
    setDraft((current) => ({
      ...current,
      variantPrices: partial.price == null ? current.variantPrices : current.variantPrices.map((item, itemIndex) => (itemIndex === index ? partial.price ?? item : item)),
      variantQty: partial.qty == null ? current.variantQty : current.variantQty.map((item, itemIndex) => (itemIndex === index ? partial.qty ?? item : item)),
    }));
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
    const id = product?.id ?? nextProductId();
    const options = cleanOptions(draft.options);
    const labels = optionLabels(options);
    const quantities = labels.length ? labels.map((_, index) => Math.max(0, Number(draft.variantQty[index]) || 0)) : [Math.max(0, Number(draft.qty) || 0)];
    const savedProduct: Product = {
      id,
      sourceId: product?.sourceId,
      title: draft.title.trim(),
      variant: labels[0] ?? product?.variant ?? "",
      price,
      compareAt: draft.compare.trim() ? Number(draft.compare) : undefined,
      cost: Number(draft.cost) || 0,
      sku: draft.sku.trim(),
      barcode: draft.barcode.trim() || undefined,
      stock: quantities.reduce((sum, value) => sum + value, 0),
      status: draft.status,
      category: draft.collections[0] ?? "",
      vendor: draft.vendor,
      tone: product?.tone ?? "#e7e2d9",
      media: [...draft.media],
      tags: draft.tags,
      collections: draft.collections,
      subcategories: draft.subcategories,
      option: labels.length ? { name: options.map((option) => option.name).join(" / "), values: labels } : undefined,
      options: options.length ? options : undefined,
      quantities: labels.length ? quantities : undefined,
      description: draft.description,
    };
    void saveCatalogProduct(savedProduct)
      .then((stored) => {
        const next = fromProduct(stored);
        setDraft(next);
        setSaved(next);
        toast(stored.status === "active" ? "המוצר נשמר ויופיע באתר" : "המוצר נשמר. רק מוצר בסטטוס פעיל מופיע באתר");
        if (productId == null) router.replace(`/admin/products/${id}`);
      })
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : "שמירת המוצר נכשלה");
      })
      .finally(() => setSaving(false));
  }

  useUnsavedEditor(dirty, saving, save, discard);
  if (missing) notFound();

  const priceNumber = Number(draft.price) || 0;
  const compareNumber = Number(draft.compare) || 0;
  const showsDiscount = compareNumber > priceNumber && priceNumber > 0;
  const costNumber = Number(draft.cost) || 0;
  const profit = priceNumber - costNumber;
  const margin = priceNumber > 0 ? `${Math.round((profit / priceNumber) * 100)}%` : "—";
  const status = PRODUCT_STATUS[draft.status];
  const vendors = [...new Set(listCatalogProducts().map((item) => item.vendor))];
  const hiddenCategories = new Set(listHiddenCollections());
  const categoryNames = [
    ...listExtraCollections(),
    ...listCatalogProducts().flatMap((item) => [item.category.trim(), ...item.collections.map((name) => name.trim())]),
    ...draft.collections,
  ].filter((name) => name && !hiddenCategories.has(name));
  const categories = [...new Set(categoryNames)].sort((a, b) => a.localeCompare(b, "he"));
  const subcategoryOptions = [...new Set([...draft.collections.flatMap((name) => listCategorySubcategories(name)), ...draft.subcategories])].sort((a, b) => a.localeCompare(b, "he"));

  function chooseCategories(names: string[]) {
    const allowed = new Set(names.flatMap((name) => listCategorySubcategories(name)));
    patch({ collections: names, category: names[0] ?? "", subcategories: draft.subcategories.filter((name) => allowed.has(name)) });
  }

  function createCategory(title: string) {
    if (!title) {
      toast("הקלידו שם לקטגוריה בשדה החיפוש");
      return false;
    }
    const existing = categories.find((name) => name.localeCompare(title, "he", { sensitivity: "accent" }) === 0);
    const value = existing ?? title;
    if (!existing) {
      saveCollectionDraft(value, { title: value, description: "", ids: [], conditions: [], excludeOutOfStock: false, image: "", subcategories: [] });
    }
    if (!draft.collections.includes(value)) chooseCategories([...draft.collections, value]);
    return true;
  }

  function createSubcategory(title: string) {
    if (!title) {
      toast("הקלידו שם לתת קטגוריה בשדה החיפוש");
      return false;
    }
    const parent = draft.collections[0];
    if (!parent) {
      toast("בחרו קטגוריה לפני הוספת תת קטגוריה");
      return false;
    }
    const existing = subcategoryOptions.find((name) => name.localeCompare(title, "he", { sensitivity: "accent" }) === 0);
    const value = existing ?? title;
    if (!existing) addCategorySubcategory(parent, value);
    if (!draft.subcategories.includes(value)) patch({ subcategories: [...draft.subcategories, value] });
    if (!existing && draft.collections.length > 1) toast(`התת קטגוריה נוספה לקטגוריה ${parent}`);
    return true;
  }
  const titleError = errors.some((item) => item.includes("כותרת"));
  const priceError = errors.some((item) => item.includes("מחיר"));
  const variantLabels = optionLabels(draft.options);
  const hasVariants = variantLabels.length > 0;
  const presetOptions = OPTION_PRESETS.filter((name) => !optionQuery.trim() || name.includes(optionQuery.trim()));

  async function addMedia(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      if (files && Array.from(files).length) toast("אפשר להעלות רק קובץ תמונה");
      return;
    }
    setUploading(true);
    try {
      const urls = (await Promise.all(images.map(readImageFile))).filter(Boolean);
      setDraft((current) => ({ ...current, media: [...current.media, ...urls] }));
      setErrors([]);
      toast(urls.length === 1 ? "התמונה נוספה" : `${urls.length} תמונות נוספו`);
    } catch {
      toast("העלאת התמונה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  function moveMedia(from: number, to: number) {
    setDraft((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.media.length || to >= current.media.length) return current;
      const media = [...current.media];
      const [item] = media.splice(from, 1);
      media.splice(to, 0, item);
      return { ...current, media };
    });
    setErrors([]);
  }

  function removeMedia(index: number) {
    setDraft((current) => ({ ...current, media: current.media.filter((_, item) => item !== index) }));
    setErrors([]);
  }

  return (
    <div className="min-h-full bg-[#f7f7f7]">
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

      <div className="mx-auto grid max-w-[1120px] items-start gap-4 px-4 py-5 min-[1000px]:grid-cols-[minmax(0,1fr)_280px] min-[1000px]:px-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5 py-2">
            <h1 className="m-0 text-[26px] leading-8 font-bold text-[#1a1a1a]">{draft.title || "מוצר חדש"}</h1>
            {product ? <span className="inline-flex h-[22px] items-center rounded-md px-2 text-[13px] font-semibold" style={{ background: status.background, color: status.color }}>{status.label}</span> : null}
          </div>

          {errors.length ? (
            <div className="overflow-hidden rounded-xl border border-[#fdb5b0] bg-white shadow-[0_1px_2px_rgba(0,0,0,.04)]">
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
          </div>

          <div className={card}>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">מדיה</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  void addMedia(event.target.files);
                  event.target.value = "";
                }}
              />
              <div
                className="flex flex-wrap gap-2 rounded-xl"
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(mediaDragType) || !event.dataTransfer.types.includes("Files")) return;
                  event.preventDefault();
                  setFileDrag(true);
                }}
                onDragLeave={() => setFileDrag(false)}
                onDrop={(event) => {
                  if (event.dataTransfer.types.includes(mediaDragType) || !event.dataTransfer.files?.length) return;
                  event.preventDefault();
                  setFileDrag(false);
                  void addMedia(event.dataTransfer.files);
                }}
                style={{ outline: fileDrag ? "2px dashed #303030" : undefined, outlineOffset: 4 }}
              >
                {draft.media.map((src, index) => (
                  <div
                    key={`${index}-${src.slice(0, 32)}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(mediaDragType, String(index));
                      event.dataTransfer.setData("text/plain", String(index));
                      setDragIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(mediaDragType)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setDropIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.dataTransfer.types.includes(mediaDragType)) {
                        const from = dragIndex ?? Number(event.dataTransfer.getData(mediaDragType));
                        if (!Number.isNaN(from)) moveMedia(from, index);
                        setDragIndex(null);
                        setDropIndex(null);
                        return;
                      }
                      if (event.dataTransfer.files?.length) {
                        setFileDrag(false);
                        void addMedia(event.dataTransfer.files);
                      }
                    }}
                    className="group relative size-[116px] cursor-grab overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,.1)] active:cursor-grabbing"
                    style={{ opacity: dragIndex === index ? 0.45 : 1, outline: dropIndex === index && dragIndex !== index ? "2px solid #303030" : undefined, outlineOffset: 2 }}
                  >
                    <img src={src} alt="" className="size-full object-cover" />
                    {index === 0 ? <span className="absolute start-1.5 top-1.5 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]">ראשית</span> : null}
                    <button type="button" aria-label="הסרת תמונה" className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-md border-0 bg-white text-sm opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,.08)] group-hover:opacity-100" onClick={() => removeMedia(index)}>×</button>
                  </div>
                ))}
                {uploading ? <span className="grid size-[116px] place-items-center rounded-xl bg-[#f1f1f1]"><span className="size-5 animate-spin rounded-full border-2 border-black/15 border-t-[#303030]" /></span> : null}
                <button type="button" aria-label="הוספת מדיה" onClick={() => fileRef.current?.click()} className="grid size-[116px] place-items-center rounded-xl border-[1.5px] border-dashed border-[#c9c9c9] bg-[#fafafa] text-2xl text-[#616161]">+</button>
              </div>
              <div className="mt-1.5 text-[13px] text-ink-secondary">{draft.media.length > 1 ? "גררו תמונה למקום הראשון כדי להפוך אותה לראשית." : "אפשר לבחור כמה תמונות, או לגרור אותן לכאן."}</div>
            </div>
          </div>

          {!hasVariants ? (
            <>
              <div className={`${card} flex flex-col gap-4`}>
                <h2 className="m-0 text-[15px] font-semibold">תמחור</h2>
                <div className="grid gap-4 min-[700px]:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-sm font-semibold">מחיר ללקוח</span>
                    <input dir="ltr" inputMode="decimal" value={draft.price} onChange={(event) => patch({ price: event.target.value })} placeholder="0.00" className={`${field} text-end`} style={{ borderColor: priceError ? "#e51c00" : "#c9c9c9", background: priceError ? "#fff4f4" : "#fff" }} />
                    <span className="mt-1.5 block text-[13px] text-ink-secondary">הסכום שהלקוח משלם עכשיו</span>
                    {priceError ? <div className="mt-1.5 text-[13px] text-[#8e1f0b]">יש להזין מחיר תקין</div> : null}
                  </label>
                  <label>
                    <span className="mb-1.5 block text-sm font-semibold">מחיר מקורי</span>
                    <input dir="ltr" inputMode="decimal" value={draft.compare} onChange={(event) => patch({ compare: event.target.value })} placeholder="לא חובה" className={`${field} text-end`} />
                    <span className="mt-1.5 block text-[13px] text-ink-secondary">לא חובה. אם הוא גבוה יותר, הוא יופיע מחוק ליד המחיר</span>
                  </label>
                </div>
                {draft.compare.trim() ? (
                  <div className="rounded-xl bg-[#f6f6f6] px-3 py-2.5 text-sm">
                    <span className="text-ink-secondary">כך הלקוח רואה בחנות: </span>
                    {showsDiscount ? (
                      <>
                        <span dir="ltr" className="text-ink-secondary line-through">{formatMoney(compareNumber)}</span>
                        {" "}
                        <b dir="ltr">{formatMoney(priceNumber)}</b>
                      </>
                    ) : (
                      <span>המחיר המקורי צריך להיות גבוה מהמחיר ללקוח כדי שתוצג הנחה</span>
                    )}
                  </div>
                ) : null}
                <label className="max-w-[280px]">
                  <span className="mb-1.5 block text-sm font-semibold">עלות לפריט</span>
                  <input dir="ltr" inputMode="decimal" value={draft.cost} onChange={(event) => patch({ cost: event.target.value })} placeholder="0.00" className={`${field} text-end`} />
                  <span className="mt-1.5 block text-[13px] text-ink-secondary">לא מוצג ללקוח. משמש רק לחישוב הרווח</span>
                </label>
                <div className="flex flex-wrap gap-6 text-[13px] text-ink-secondary">
                  <span>רווח: <b dir="ltr" className="text-ink">{formatMoney(profit)}</b></span>
                  <span>שיעור רווח: <b dir="ltr" className="text-ink">{margin}</b></span>
                  <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" checked={draft.tax} onChange={(event) => patch({ tax: event.target.checked })} className="size-[15px] accent-[#303030]" />המחיר כולל מע״מ (18%)</label>
                </div>
              </div>
              <div className={`${card} flex flex-col gap-3`}>
                <h2 className="m-0 text-[15px] font-semibold">מלאי</h2>
                <div className="grid gap-3 min-[700px]:grid-cols-3">
                  <label><span className="mb-1.5 block text-sm font-semibold">מק״ט (SKU)</span><input dir="ltr" value={draft.sku} onChange={(event) => patch({ sku: event.target.value })} className={`${field} text-end`} /></label>
                  <label><span className="mb-1.5 block text-sm font-semibold">ברקוד</span><input dir="ltr" value={draft.barcode} onChange={(event) => patch({ barcode: event.target.value })} className={`${field} text-end`} /></label>
                  <label><span className="mb-1.5 block text-sm font-semibold">כמות במחסן הראשי</span><input dir="ltr" type="number" value={draft.qty} onChange={(event) => patch({ qty: event.target.value })} className={`${field} text-end`} /></label>
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" checked={draft.continueSelling} onChange={(event) => patch({ continueSelling: event.target.checked })} className="size-4 accent-[#303030]" />המשך מכירה גם כשהמלאי אוזל</label>
              </div>
            </>
          ) : null}

          <div className="rounded-xl border border-[#d9d9d9] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)]">
            <style>{`@keyframes variant-pop { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } } @keyframes variant-panel { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { @keyframes variant-pop { from, to { opacity: 1; transform: none } } @keyframes variant-panel { from, to { opacity: 1; transform: none } } }`}</style>
            <div className="px-5 pt-4">
              <h2 className="m-0 text-[15px] font-semibold">וריאציות</h2>
            </div>
            <div className="flex flex-col gap-3 p-4">
              {draft.options.map((option, index) => (
                editing === index ? null : (
                  <button key={`${option.name}-${index}`} type="button" className="rounded-xl border border-[#e3e3e3] bg-white px-3 py-2.5 text-start" onClick={() => openOptionEditor(index, option)}>
                    <span className="block text-sm font-semibold">{option.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-secondary">{option.values.join(" · ")}</span>
                  </button>
                )
              ))}
              {editing != null ? (
                <div key={editing} className="rounded-xl border border-[#e3e3e3] bg-white p-4" style={{ animation: "variant-panel .28s cubic-bezier(.16,1,.3,1)" }}>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">שם האפשרות</span>
                    <input autoFocus value={optionDraft.name} onChange={(event) => setOptionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="לדוגמה: מידה" className={field} />
                  </label>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-sm font-medium">ערכי האפשרות</span>
                    <div className="flex min-h-[36px] flex-wrap items-center gap-1 rounded-[10px] border border-[#c9c9c9] bg-white px-2 py-1">
                      {optionDraft.values.map((value, index) => (
                        <span key={`${value}-${index}`} className="inline-flex h-6 items-center gap-1 rounded-md bg-[#e3e3e3] ps-2 pe-1 text-[13px]">
                          {value}
                          <button type="button" aria-label="הסרת ערך" className="border-0 bg-transparent text-[#616161]" onClick={() => setOptionDraft((current) => ({ ...current, values: current.values.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>
                        </span>
                      ))}
                      <input
                        value={optionDraft.pending}
                        onChange={(event) => setOptionDraft((current) => ({ ...current, pending: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            setOptionDraft((current) => takePending(current));
                          }
                          if (event.key === "Backspace" && !optionDraft.pending) setOptionDraft((current) => ({ ...current, values: current.values.slice(0, -1) }));
                        }}
                        placeholder={optionDraft.values.length ? "" : "לדוגמה: בינוני"}
                        className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 text-sm outline-none"
                      />
                    </div>
                  </label>
                  <div className="mt-4 flex items-center">
                    <button type="button" className="h-8 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-[#d72c0d]" onClick={deleteOption}>מחיקה</button>
                    <div className="flex-1" />
                    <button type="button" className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3.5 text-sm font-semibold text-white" onClick={finishOption}>סיום</button>
                  </div>
                </div>
              ) : null}
              <div ref={pickerRef} className={pickerOpen ? "relative z-20" : "relative"}>
                {draft.options.length === 0 && editing == null ? (
                  <button type="button" className="inline-flex h-9 items-center gap-2 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm shadow-[0_1px_0_rgba(0,0,0,.04)]" onClick={() => { setOptionQuery(""); setPickerOpen((open) => !open); }}>
                    <span className="grid size-5 place-items-center rounded-full border border-[#8a8a8a] text-[#303030]">+</span>
                    הוספת אפשרויות כמו גודל או צבע
                  </button>
                ) : draft.options.length + (editing === -1 ? 1 : 0) < 3 ? (
                  <button type="button" className="flex w-full items-center gap-2 border-0 border-t border-[#ebebeb] bg-transparent px-1 pt-3 text-sm font-medium" onClick={requestAdd}>
                    <span className="grid size-5 place-items-center rounded-full border border-[#8a8a8a]">+</span>
                    הוספת אפשרות נוספת
                  </button>
                ) : null}
                {pickerOpen ? (
                  <div className="absolute start-0 top-[calc(100%+8px)] z-30 w-[min(100%,320px)] rounded-xl bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_16px_40px_rgba(0,0,0,.16)]" style={{ animation: "variant-pop .24s cubic-bezier(.16,1,.3,1)" }}>
                    <label className="flex h-9 items-center gap-2 rounded-lg border border-[#c9c9c9] px-2 focus-within:border-[#005bd3] focus-within:shadow-[0_0_0_1px_#005bd3]">
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#616161" strokeWidth="1.7" aria-hidden><circle cx="8.5" cy="8.5" r="5.2" /><path d="M12.4 12.4 16 16" strokeLinecap="round" /></svg>
                      <input autoFocus value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} placeholder="חיפוש" className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
                    </label>
                    {presetOptions.length ? (
                      <div className="flex flex-col py-1">
                        {presetOptions.map((name) => (
                          <button key={name} type="button" className="flex h-8 w-full items-center rounded-lg border-0 bg-transparent px-2 text-start text-sm hover:bg-[#f6f6f6]" onClick={() => openOptionEditor(-1, { name, values: [] })}>{name}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-ink-secondary">אין אפשרויות תואמות</div>
                    )}
                    <button type="button" className="flex h-9 w-full items-center gap-2 rounded-lg border-0 border-t border-[#ebebeb] bg-transparent px-2 text-sm font-medium" onClick={() => openOptionEditor(-1, { name: optionQuery.trim(), values: [] })}>
                      <span className="text-base leading-none">+</span>
                      יצירת אפשרות מותאמת
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {hasVariants ? (
              <>
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
                      {variantLabels.map((value, index) => (
                        <tr key={value} className="h-[72px] border-b border-[#ebebeb]">
                          <td className="px-2 font-medium">{value}</td>
                          <td className="px-2"><input dir="ltr" value={draft.variantPrices[index] ?? ""} onChange={(event) => updateVariantRow(index, { price: event.target.value })} className={field} /></td>
                          <td className="px-2"><input dir="ltr" type="number" value={draft.variantQty[index] ?? "0"} onChange={(event) => updateVariantRow(index, { qty: event.target.value })} className={`${field} text-end`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 text-sm">סך המלאי: {draft.variantQty.reduce((sum, value) => sum + (Number(value) || 0), 0)}</div>
              </>
            ) : null}
          </div>

          <div className={`${card} flex flex-col gap-0.5`}>
            <div className="mb-2 flex items-center">
              <h2 className="m-0 flex-1 text-[15px] font-semibold">תצוגה במנועי חיפוש</h2>
              <button type="button" aria-label="עריכה" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent" onClick={() => setSeoEdit((open) => !open)}>✎</button>
            </div>
            <span>{getStoreIdentity().name}</span>
            <span dir="ltr" className="text-[13px] text-[#4a4a4a]">{getStoreIdentity().hostname}/products/{draft.handle || "product"}</span>
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

        <aside className="flex min-w-0 flex-col gap-3 text-sm">
          <div className={card}>
            <span className="mb-1.5 block font-semibold">סטטוס</span>
            <select value={draft.status} onChange={(event) => patch({ status: event.target.value as ProductStatus })} className={field}>
              <option value="active">פעיל</option>
              <option value="draft">טיוטה</option>
              <option value="archived">בארכיון</option>
            </select>
          </div>
          <div className={`${card} flex flex-col gap-2`}>
            <span className="font-semibold">פרסום</span>
            <div className="flex items-center gap-2"><span className="flex-1 font-medium">כל הערוצים</span><span className="inline-flex h-5 items-center rounded-md px-1.5 text-xs font-semibold" style={{ background: draft.status === "active" ? "#cdfee1" : "#ebebeb", color: draft.status === "active" ? "#0c5132" : "#4a4a4a" }}>{draft.status === "active" ? "פעיל" : "לא פעיל"}</span></div>
            <span className="font-medium">כל הקטלוגים</span>
          </div>
          <div className={`${card} flex flex-col gap-2`}>
            <span className="font-semibold">מכירות</span>
            <span>{product ? "נמכר ב-30 הימים האחרונים" : "עדיין אין מכירות"}</span>
          </div>
          <div className={`${card} flex flex-col gap-3.5`}>
            <span className="font-semibold">ארגון המוצר</span>
            <TermPicker label="קטגוריות" addLabel="הוספת קטגוריות" searchPlaceholder="חיפוש או הוספת קטגוריה" emptyLabel="אין קטגוריות תואמות" createLabel="הוספת קטגוריה חדשה" options={categories} selected={draft.collections} onChange={chooseCategories} onCreate={createCategory} />
            <TermPicker label="תת קטגוריה" addLabel="הוספת תת קטגוריה" searchPlaceholder="חיפוש או הוספת תת קטגוריה" emptyLabel="אין תתי קטגוריה תואמות" createLabel="הוספת תת קטגוריה חדשה" options={subcategoryOptions} selected={draft.subcategories} onChange={(names) => patch({ subcategories: names })} onCreate={createSubcategory} disabled={draft.collections.length === 0} disabledHint="בחרו קטגוריה כדי להוסיף תת קטגוריה" />
            <label><span className="mb-1.5 block font-semibold">ספק</span>
              <select value={draft.vendor} onChange={(event) => patch({ vendor: event.target.value })} className={field}>
                {vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
              </select>
            </label>
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
          <div className={card}>
            <span className="mb-1.5 block font-semibold">תבנית עיצוב</span>
            <select className={field}><option>מוצר ברירת מחדל</option><option>מוצר עם גלריה</option></select>
          </div>
        </aside>
      </div>
    </div>
  );
}
