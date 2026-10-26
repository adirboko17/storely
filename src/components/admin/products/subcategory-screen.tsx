"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { SlicePending, useAdminSlice } from "@/components/admin/slice-pending";
import { assignProductSubcategory, deleteCategorySubcategory, getCatalogVersion, getCollectionDraft, listCatalogProducts, subscribeCatalog } from "@/data/mock/catalog-session";
import { PRODUCT_STATUS } from "@/lib/catalog/present";
import { formatMoney } from "@/lib/formatting/money";

export function SubcategoryScreen({ categoryKey, subcategory }: { categoryKey: string; subcategory: string }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const catalogReady = useAdminSlice("catalog");
  const products = listCatalogProducts();
  const draft = getCollectionDraft(categoryKey);
  const known = (draft?.subcategories ?? []).includes(subcategory) || products.some((product) => (product.subcategories ?? []).includes(subcategory) && (product.category.trim() === categoryKey || product.collections.includes(categoryKey)));
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState(false);
  const [removed, setRemoved] = useState(false);
  const removedRef = useRef(false);
  const parentTitle = draft?.title || categoryKey;
  const assigned = products.filter((product) => (product.subcategories ?? []).includes(subcategory));
  const pool = useMemo(() => {
    const text = query.trim();
    return products
      .filter((product) => !(product.subcategories ?? []).includes(subcategory))
      .filter((product) => !text || product.title.includes(text) || product.sku.includes(text))
      .sort((a, b) => {
        const aParent = a.category.trim() === categoryKey || a.collections.includes(categoryKey) ? 0 : 1;
        const bParent = b.category.trim() === categoryKey || b.collections.includes(categoryKey) ? 0 : 1;
        return aParent - bParent || a.title.localeCompare(b.title, "he");
      });
  }, [products, query, subcategory, categoryKey]);

  if (!known && !removed && !removedRef.current && !catalogReady) return <SlicePending label="טוען קטגוריה…" />;
  if (!known && !removed && !removedRef.current) notFound();

  function removeSubcategory() {
    removedRef.current = true;
    setRemoved(true);
    deleteCategorySubcategory(categoryKey, subcategory);
    toast("התת קטגוריה נמחקה");
    router.push("/admin/products/collections");
  }

  function assign(productId: number, on: boolean) {
    assignProductSubcategory(productId, categoryKey, subcategory, on);
    toast(on ? "המוצר שויך לתת הקטגוריה ונשאר גם בקטגוריה הראשית" : "המוצר הוסר מתת הקטגוריה");
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[6] flex items-center gap-2 bg-[#fafafa] px-3.5 py-2.5">
        <Link href={`/admin/products/collections/${encodeURIComponent(categoryKey)}`} aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="flex-1 text-sm">
          <Link href="/admin/products/collections" className="text-ink no-underline">קטגוריות</Link>
          <span className="text-[#b5b5b5]"> / </span>
          <Link href={`/admin/products/collections/${encodeURIComponent(categoryKey)}`} className="text-ink no-underline">{parentTitle}</Link>
          <span className="text-[#b5b5b5]"> / </span>
          <b>{subcategory}</b>
        </span>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={removeSubcategory}>מחיקה</button>
      </div>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-5 py-4">
        <div className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="text-[13px] text-ink-secondary">תת קטגוריה של {parentTitle}</div>
          <h1 className="m-0 mt-1 text-lg font-bold">{subcategory}</h1>
          <p className="mb-0 mt-2 text-sm text-[#4a4a4a]">מוצר שמשויך לכאן נשאר גם בקטגוריה הראשית.</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="m-0 flex-1 text-sm font-semibold">מוצרים · {assigned.length}</h2>
            <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3 text-[13px] font-semibold text-white" onClick={() => setPicker((open) => !open)}>{picker ? "סגירה" : "שיוך מוצרים"}</button>
          </div>
          {picker ? (
            <div className="mb-3 overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש מוצר לשיוך" className="h-10 w-full border-0 border-b border-[#ebebeb] bg-transparent px-3 text-sm outline-none" style={{ backgroundColor: "transparent" }} />
              <div className="max-h-64 overflow-auto p-1.5">
                {pool.map((product) => {
                  const inParent = product.category.trim() === categoryKey || product.collections.includes(categoryKey);
                  return (
                    <button key={product.id} type="button" className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => assign(product.id, true)}>
                      <span className="size-8 shrink-0 rounded-md" style={{ background: product.tone }} />
                      <span className="min-w-0 flex-1 truncate">{product.title}</span>
                      <span className="text-[12px] text-[#616161]">{inParent ? parentTitle : "יצורף גם לקטגוריה"}</span>
                    </button>
                  );
                })}
                {pool.length === 0 ? <div className="px-2 py-3 text-sm text-[#616161]">אין מוצרים נוספים לשיוך</div> : null}
              </div>
            </div>
          ) : null}
          {assigned.length === 0 ? <div className="rounded-lg bg-[#fafafa] px-3 py-6 text-center text-sm text-ink-secondary">אין עדיין מוצרים בתת הקטגוריה.</div> : (
            <div className="flex flex-col">
              {assigned.map((product) => {
                const status = PRODUCT_STATUS[product.status];
                return (
                  <div key={product.id} className="flex items-center gap-3 border-b border-[#f1f1f1] py-2 last:border-0">
                    <span className="size-10 shrink-0 rounded-lg" style={{ background: product.tone }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{product.title}</div>
                      <div className="text-[13px] text-[#616161]">{parentTitle}</div>
                    </div>
                    <span dir="ltr" className="text-sm">{formatMoney(product.price)}</span>
                    <span className="inline-flex h-5 items-center rounded-md px-1.5 text-xs font-semibold" style={{ background: status.background, color: status.color }}>{status.label}</span>
                    <button type="button" className="border-0 bg-transparent text-[13px] text-[#8e1f0b]" onClick={() => assign(product.id, false)}>הסרה</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
