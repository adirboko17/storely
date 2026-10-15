"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { getStoreIdentity } from "@/data/live/store-identity";
import {
  getCatalogVersion,
  listCatalogProducts,
  listExtraCollections,
  nextProductId,
  saveCatalogProduct,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { slugifyHandle } from "@/lib/catalog/present";
import { currencyLabel, currencySymbol } from "@/lib/formatting/currency";
import { formatMoney } from "@/lib/formatting/money";
import type { Product, ProductStatus } from "@/types/commerce";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm outline-none focus:border-[#303030]";
const card = "rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]";

const START = {
  title: "",
  description: "",
  status: "active" as ProductStatus,
  vendor: "",
  type: "",
  collections: [] as string[],
  tags: [] as string[],
  amounts: ["10.00", "25.00", "50.00", "100.00"],
  promo: "",
  disclosure: "",
  seoTitle: "",
  seoDesc: "",
  handle: "",
  media: [] as string[],
  template: "default",
  cardTemplate: "gift_card",
};

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function GiftCardProductScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const store = getStoreIdentity();
  const [draft, setDraft] = useState({ ...START, vendor: store.name });
  const [saved, setSaved] = useState(draft);
  const [tagInput, setTagInput] = useState("");
  const [seoEdit, setSeoEdit] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [library, setLibrary] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function patch(partial: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function save() {
    const title = draft.title.trim();
    const amounts = draft.amounts.map((value) => Number(value)).filter((value) => value > 0);
    if (!title) {
      toast("יש להזין כותרת למוצר");
      return;
    }
    if (!amounts.length) {
      toast("יש להזין לפחות סכום אחד");
      return;
    }
    setSaving(true);
    const labels = amounts.map((value) => formatMoney(value));
    const product: Product = {
      id: nextProductId(),
      title,
      variant: labels[0] ?? "",
      price: amounts[0] ?? 0,
      cost: 0,
      sku: "",
      stock: amounts.length * 9999,
      status: draft.status,
      category: "כרטיסי מתנה",
      vendor: draft.vendor || store.name,
      tone: "#e7e2d9",
      media: [...draft.media],
      tags: draft.tags,
      collections: draft.collections,
      option: { name: "סכום", values: labels },
      quantities: amounts.map(() => 9999),
      description: draft.description,
    };
    void saveCatalogProduct(product)
      .then(() => {
        toast("מוצר כרטיס המתנה נשמר");
        router.replace(`/admin/products/${product.id}`);
      })
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : "שמירת המוצר נכשלה");
      })
      .finally(() => setSaving(false));
  }

  useUnsavedEditor(dirty, saving, save, () => {
    setDraft(saved);
    setSeoEdit(false);
  });

  const products = listCatalogProducts();
  const libraryImages = useMemo(
    () => [...new Set(products.flatMap((product) => product.media ?? []).filter(Boolean))].slice(0, 24),
    [products],
  );
  const collectionNames = [...new Set([...listExtraCollections(), ...products.map((product) => product.category.trim()).filter(Boolean)])];
  const vendors = [...new Set([store.name, ...products.map((product) => product.vendor)].filter(Boolean))];

  function wrap(mark: string) {
    const element = descRef.current;
    const value = draft.description;
    if (!element) {
      patch({ description: `${value}${mark}טקסט${mark}` });
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || "טקסט";
    patch({ description: `${value.slice(0, start)}${mark}${selected}${mark}${value.slice(end)}` });
  }

  async function addFiles(files: FileList | File[] | null | undefined) {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      if (files && Array.from(files).length) toast("אפשר להעלות רק קובץ תמונה");
      return;
    }
    try {
      const urls = (await Promise.all(images.map(readImageFile))).filter(Boolean);
      patch({ media: [...draft.media, ...urls] });
    } catch {
      toast("העלאת התמונה נכשלה");
    }
  }

  return (
    <div className="min-h-full px-4 py-4">
      <div className="mx-auto grid w-full max-w-[1080px] items-start gap-5 min-[960px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2">
            <Link href="/admin/products/gift-cards" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
            </Link>
            <Link href="/admin/products/gift-cards" className="flex items-center gap-1.5 text-sm text-ink no-underline">
              <Icon name="card" size={16} strokeWidth={1.6} />
              כרטיסי מתנה
            </Link>
          </div>
          <h1 className="m-0 text-[22px] font-bold">יצירת מוצר כרטיס מתנה</h1>

          <div className={`${card} flex flex-col gap-4`}>
            <label className="block text-[13px] font-medium">כותרת
              <input value={draft.title} onChange={(event) => patch({ title: event.target.value, handle: slugifyHandle(event.target.value), seoTitle: draft.seoTitle === saved.seoTitle || draft.seoTitle === draft.title ? event.target.value : draft.seoTitle })} placeholder="לדוגמה: כרטיס מתנה" className={`${field} mt-1`} />
            </label>
            <div>
              <div className="mb-1 text-[13px] font-medium">תיאור</div>
              <div className="overflow-hidden rounded-lg border border-[#c9c9c9]">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-[#ebebeb] bg-[#f6f6f7] px-1.5 py-1 text-[13px]">
                  <span className="px-1.5 font-medium">פסקה</span>
                  <span className="mx-1 h-4 w-px bg-[#d4d4d4]" />
                  <button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent font-bold" onClick={() => wrap("**")}>B</button>
                  <button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent italic" onClick={() => wrap("*")}>I</button>
                  <button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent underline" onClick={() => wrap("_")}>U</button>
                </div>
                <textarea ref={descRef} value={draft.description} onChange={(event) => patch({ description: event.target.value })} rows={6} className="block w-full resize-y border-0 bg-white p-3 text-sm outline-none" />
              </div>
            </div>
            <div>
              <div className="mb-1 text-[13px] font-medium">מדיה</div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
              {draft.media.length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.media.map((src, index) => (
                    <div key={`${index}-${src.slice(0, 24)}`} className="group relative size-24 overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]">
                      <img src={src} alt="" className="size-full object-cover" />
                      <button type="button" aria-label="הסרת תמונה" className="absolute top-1 left-1 grid size-6 place-items-center rounded-md border-0 bg-white text-sm opacity-0 group-hover:opacity-100" onClick={() => patch({ media: draft.media.filter((_, item) => item !== index) })}>×</button>
                    </div>
                  ))}
                  <button type="button" className="grid size-24 place-items-center rounded-xl border border-dashed border-[#c9c9c9] bg-[#fafafa] text-xl text-[#616161]" onClick={() => fileRef.current?.click()}>+</button>
                </div>
              ) : (
                <div className="grid min-h-[148px] place-items-center rounded-xl border border-dashed border-[#c9c9c9] bg-[#fafafa] px-4 text-center">
                  <div>
                    <div className="flex justify-center gap-2">
                      <button type="button" className="h-7 rounded-lg border-0 bg-[#e3e3e3] px-2.5 text-[13px] font-semibold" onClick={() => fileRef.current?.click()}>העלאה חדשה</button>
                      <button type="button" className="h-7 rounded-lg border-0 bg-transparent px-2.5 text-[13px] font-semibold" onClick={() => setLibrary((open) => !open)}>בחירה קיימת</button>
                    </div>
                    <p className="m-0 mt-2 text-[13px] text-[#616161]">אפשר להעלות תמונות</p>
                  </div>
                </div>
              )}
              {library ? (
                <div className="mt-2 grid grid-cols-6 gap-2 rounded-xl bg-[#fafafa] p-2">
                  {libraryImages.length === 0 ? <p className="col-span-6 m-0 text-sm text-[#616161]">אין עדיין תמונות שמורות.</p> : libraryImages.map((src) => (
                    <button key={src} type="button" className="aspect-square overflow-hidden rounded-lg border-0 p-0" onClick={() => { patch({ media: draft.media.includes(src) ? draft.media : [...draft.media, src] }); setLibrary(false); }}>
                      <img src={src} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <label className="block text-[13px] font-medium">קטגוריה
              <input value="כרטיסי מתנה" readOnly className={`${field} mt-1 bg-[#f6f6f7] text-[#303030]`} />
              <span className="mt-1 block text-[12px] font-normal text-[#616161]">קובעת את שיעורי המס ומוסיפה שדות מידע שמשפרים חיפוש, סינון ומכירה בערוצים נוספים.</span>
            </label>
          </div>

          <div className={card}>
            <div className="grid gap-3 min-[640px]:grid-cols-2">
              <label className="block text-[13px] font-medium">מטבע
                <input value={`מטבע החנות (${currencyLabel()})`} readOnly className={`${field} mt-1 bg-[#f3f3f3] text-[#616161]`} />
              </label>
              <label className="block text-[13px] font-medium">מימוש ב
                <input value="כל המטבעות" readOnly className={`${field} mt-1 bg-[#f3f3f3] text-[#616161]`} />
              </label>
            </div>
            <p className="m-0 mt-3 rounded-lg bg-[#f6f6f7] px-3 py-2 text-[13px] text-[#4a4a4a]">כרטיסי מתנה מונפקים במטבע החנות, וניתן לממש אותם בכל מטבע. שערי ההמרה ייקבעו בקופה.</p>
            <div className="mt-4 text-[13px] font-medium">סכומים</div>
            <div className="mt-2 flex flex-col gap-2">
              {draft.amounts.map((amount, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#c9c9c9] bg-white px-3">
                    <span className="text-sm text-[#616161]">{currencySymbol()}</span>
                    <input dir="ltr" inputMode="decimal" value={amount} onChange={(event) => patch({ amounts: draft.amounts.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)) })} className="h-full min-w-0 flex-1 border-0 bg-transparent text-end text-sm outline-none" />
                  </span>
                  <button type="button" aria-label="הסרת סכום" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-[#616161] hover:bg-[#f1f1f1]" onClick={() => {
                    if (draft.amounts.length === 1) {
                      toast("צריך להישאר לפחות סכום אחד");
                      return;
                    }
                    patch({ amounts: draft.amounts.filter((_, itemIndex) => itemIndex !== index) });
                  }}>
                    <Icon name="trash" size={16} strokeWidth={1.6} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="mt-3 h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[13px] font-semibold" onClick={() => patch({ amounts: [...draft.amounts, "0.00"] })}>הוספת סכום</button>
          </div>

          <div>
            <div className="mb-2 flex items-center">
              <b className="flex-1 text-sm">שדות מידע למוצר</b>
              <button type="button" className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={() => toast("הגדרת שדה חדש תתווסף בהמשך")}>הוספת הגדרה</button>
            </div>
            <div className={`${card} flex flex-col gap-2`}>
              <div className="flex items-center gap-3">
                <span className="w-28 text-sm">מבצעים</span>
                {promoOpen ? <input value={draft.promo} onChange={(event) => patch({ promo: event.target.value })} className={field} /> : <button type="button" className="border-0 bg-transparent text-sm font-semibold" onClick={() => setPromoOpen(true)}>+ הוספה</button>}
              </div>
              {disclosureOpen ? (
                <label className="text-sm">גילוי נאות
                  <textarea value={draft.disclosure} onChange={(event) => patch({ disclosure: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-[#c9c9c9] p-2 text-sm outline-none" />
                </label>
              ) : (
                <button type="button" className="self-start rounded-lg border-0 bg-[#f1f1f1] px-2.5 py-1 text-[13px] font-semibold" onClick={() => setDisclosureOpen(true)}>+ גילוי נאות</button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center">
              <b className="flex-1 text-sm">תצוגה במנועי חיפוש</b>
              <button type="button" aria-label="עריכה" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent" onClick={() => setSeoEdit((open) => !open)}>
                <Icon name="pencil" size={15} strokeWidth={1.6} />
              </button>
            </div>
            <div className={card}>
              {draft.title || draft.description || seoEdit ? (
                <div className="flex flex-col gap-0.5">
                  <span>{store.name}</span>
                  <span dir="ltr" className="text-[13px] text-[#4a4a4a]">{store.hostname}/products/{draft.handle || "gift-card"}</span>
                  <span className="mt-1 text-lg text-[#1a4fd6]">{draft.seoTitle || draft.title || "כותרת המוצר"}</span>
                  <span className="text-sm text-[#4a4a4a]">{draft.seoDesc || draft.description.slice(0, 155) || "תיאור המוצר יופיע כאן."}</span>
                </div>
              ) : (
                <p className="m-0 text-sm text-[#616161]">הוסיפו כותרת ותיאור כדי לראות איך המוצר יופיע בתוצאות חיפוש.</p>
              )}
              {seoEdit ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-[#ebebeb] pt-3">
                  <label className="text-[13px] font-medium">כותרת העמוד<input value={draft.seoTitle} onChange={(event) => patch({ seoTitle: event.target.value })} className={`${field} mt-1`} /></label>
                  <label className="text-[13px] font-medium">תיאור<textarea value={draft.seoDesc} onChange={(event) => patch({ seoDesc: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-[#c9c9c9] p-2 text-sm outline-none" /></label>
                  <label className="text-[13px] font-medium">כתובת<input dir="ltr" value={draft.handle} onChange={(event) => patch({ handle: event.target.value })} className={`${field} mt-1 text-end`} /></label>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-4 text-sm">
          <label className="block font-medium">סטטוס
            <select value={draft.status} onChange={(event) => patch({ status: event.target.value as ProductStatus })} className={`${field} mt-1`}>
              <option value="active">פעיל</option>
              <option value="draft">טיוטה</option>
              <option value="archived">בארכיון</option>
            </select>
          </label>
          <div>
            <div className="mb-2 font-medium text-[#4a4a4a]">פרסום</div>
            <div className="flex items-center gap-2"><span className="flex-1">כל הערוצים</span><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f1f1f1] px-1.5 text-[12px]">2</span></div>
            <div className="mt-1.5">כל הקטלוגים</div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-medium text-[#4a4a4a]">ארגון המוצר</div>
            <label className="font-medium">סוג
              <select value={draft.type} onChange={(event) => patch({ type: event.target.value })} className={`${field} mt-1`}>
                <option value="">ללא</option>
                <option value="gift">כרטיס מתנה</option>
              </select>
            </label>
            <label className="font-medium">ספק
              <select value={draft.vendor} onChange={(event) => patch({ vendor: event.target.value })} className={`${field} mt-1`}>
                <option value="">ללא</option>
                {vendors.map((vendor) => <option key={vendor} value={vendor}>{vendor}</option>)}
              </select>
            </label>
            <div className="relative">
              <div className="mb-1 font-medium">קטגוריות</div>
              <button type="button" className="flex h-9 w-full items-center rounded-lg border border-[#c9c9c9] bg-white px-3 text-start" onClick={() => setCollectionsOpen((open) => !open)}>+ הוספת קטגוריות</button>
              {collectionsOpen ? (
                <div className="absolute inset-x-0 top-16 z-20 max-h-48 overflow-auto rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                  {collectionNames.filter((name) => !draft.collections.includes(name)).map((name) => (
                    <button key={name} type="button" className="block w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start hover:bg-[#f1f1f1]" onClick={() => { patch({ collections: [...draft.collections, name] }); setCollectionsOpen(false); }}>{name}</button>
                  ))}
                  {collectionNames.filter((name) => !draft.collections.includes(name)).length === 0 ? <div className="px-2 py-2 text-[#616161]">אין קטגוריות נוספות</div> : null}
                </div>
              ) : null}
              {draft.collections.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {draft.collections.map((name) => (
                    <span key={name} className="inline-flex h-6 items-center gap-1 rounded-md bg-[#ebebeb] px-2 text-[13px]">{name}<button type="button" className="border-0 bg-transparent" onClick={() => patch({ collections: draft.collections.filter((item) => item !== name) })}>×</button></span>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <div className="mb-1 font-medium">תגיות</div>
              <div className="rounded-lg border border-[#c9c9c9] p-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {draft.tags.map((tag) => (
                    <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-md bg-[#ebebeb] px-2 text-[13px]">{tag}<button type="button" className="border-0 bg-transparent" onClick={() => patch({ tags: draft.tags.filter((item) => item !== tag) })}>×</button></span>
                  ))}
                </div>
                <input value={tagInput} placeholder="+ הוספת תגיות" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); const value = tagInput.trim(); if (value && !draft.tags.includes(value)) patch({ tags: [...draft.tags, value] }); setTagInput(""); }} className="mt-1 h-7 w-full border-0 bg-transparent px-1 text-sm outline-none" />
              </div>
            </div>
          </div>
          <label className="font-medium">תבנית עיצוב
            <select value={draft.template} onChange={(event) => patch({ template: event.target.value })} className={`${field} mt-1`}>
              <option value="default">מוצר ברירת מחדל</option>
              <option value="gallery">מוצר עם גלריה</option>
            </select>
          </label>
          <label className="font-medium">תבנית כרטיס מתנה
            <select value={draft.cardTemplate} onChange={(event) => patch({ cardTemplate: event.target.value })} className={`${field} mt-1`}>
              <option value="gift_card">gift_card</option>
            </select>
            <span className="mt-1 block text-[12px] font-normal text-[#616161]">זה מה שהלקוחות רואים כשהם מממשים כרטיס מתנה.</span>
          </label>
        </aside>
      </div>
    </div>
  );
}
