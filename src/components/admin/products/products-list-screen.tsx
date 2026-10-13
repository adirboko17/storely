"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity } from "@/data/live/store-identity";
import { Icon } from "@/components/ui/icon";
import {
  deleteCatalogProducts,
  getCatalogVersion,
  listCatalogProducts,
  setProductStatuses,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { PRODUCT_STATUS, PRODUCT_TABS, inventoryLabel, type ProductTab } from "@/lib/catalog/present";
import type { ProductStatus } from "@/types/commerce";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

export function ProductsListScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const products = listCatalogProducts();
  const [tab, setTab] = useState<ProductTab>("all");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const needle = query.trim();
  const rows = products.filter((product) => {
    if (tab !== "all" && product.status !== tab) return false;
    if (!needle) return true;
    return product.title.includes(needle) || product.sku.toLowerCase().includes(needle.toLowerCase());
  });
  const allSelected = rows.length > 0 && rows.every((product) => selected.includes(product.id));

  function chooseTab(next: ProductTab) {
    setMenu(false);
    setLoading(true);
    setTab(next);
    window.setTimeout(() => setLoading(false), 500);
  }

  function applyStatus(status: ProductStatus) {
    setProductStatuses(selected, status);
    setSelected([]);
    toast(status === "active" ? "המוצרים הוגדרו כפעילים" : status === "draft" ? "המוצרים הוגדרו כטיוטה" : "המוצרים הועברו לארכיון");
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="tag" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] leading-5 font-bold">מוצרים</h1>
        <button type="button" className={softButton} onClick={() => toast("תצוגת החנות כלקוח תיפתח בלשונית חדשה")}>
          צפייה כלקוח
        </button>
        <button type="button" className={softButton}>
          ייבוא
        </button>
        <button type="button" className={softButton} onClick={() => toast(`קובץ CSV יישלח אל ${getStoreIdentity().ownerEmail}`)}>
          ייצוא
        </button>
        <button type="button" className={softButton}>
          פעולות נוספות
        </button>
        <Link href="/admin/products/new" className={darkButton}>
          הוספת מוצר
        </Link>
      </div>

      <div className="mx-3 flex overflow-x-auto rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="flex shrink-0 items-center border-e border-[#ebebeb] px-4">
          <button type="button" className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-sm font-medium text-ink">
            30 יום
          </button>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 border-e border-[#ebebeb] px-[18px] py-3">
          <span className="text-sm font-semibold underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px]">שיעור מכירה ממוצע</span>
          <b className="text-sm">0%</b>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 border-e border-[#ebebeb] px-[18px] py-3">
          <span className="text-sm font-semibold underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px]">מוצרים לפי ימי מלאי שנותרו</span>
          <div className="flex flex-wrap gap-3.5">
            <span>
              <b className="text-sm text-[#8a6116]">0</b> בפחות מ-7 ימים
            </span>
            <span>
              <b className="text-sm">0</b> מעל 7 ימים
            </span>
          </div>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 px-[18px] py-3">
          <span className="text-sm font-semibold underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px]">ניתוח ABC</span>
          <div className="flex flex-wrap gap-3.5 text-sm">
            <span className="border-b-2 border-[#2c6ecb]"><b dir="ltr">₪0</b> A</span>
            <span className="border-b-2 border-[#7b61d6]"><b dir="ltr">₪0</b> B</span>
            <span className="border-b-2 border-[#9cc3ee]"><b dir="ltr">₪0</b> C</span>
          </div>
        </div>
      </div>

      <div className="mx-3 mt-2.5 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {selected.length === 0 ? (
          <>
            <div className="relative">
              <button type="button" className="inline-flex h-[30px] items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold" onClick={() => setMenu((open) => !open)}>
                {PRODUCT_TABS.find((item) => item.key === tab)?.label}
              </button>
              {menu ? (
                <div className="absolute top-9 right-0 z-50 w-[200px] rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_8px_24px_rgba(0,0,0,.16)]">
                  {PRODUCT_TABS.map((item) => (
                    <button key={item.key} type="button" className="flex w-full rounded-lg border-0 px-2 py-1.5 text-start text-sm" style={{ background: tab === item.key ? "#f1f1f1" : "transparent", fontWeight: tab === item.key ? 600 : 400 }} onClick={() => chooseTab(item.key)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex min-w-[200px] flex-1 items-center gap-2 px-1.5 text-ink-secondary">
              <Icon name="search" size={16} strokeWidth={1.8} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש וסינון" className="h-[30px] min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
            </div>
            <ColumnsButton onClick={() => toast("בחירת עמודות תתווסף בשלב הבא")} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((product) => product.id))} className="size-4 accent-[#303030]" />
            <span className="font-semibold">{selected.length} נבחרו</span>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => toast("עריכה קבוצתית תתווסף בשלב הבא")}>עריכה קבוצתית</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => applyStatus("active")}>הגדרה כפעיל</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => applyStatus("draft")}>הגדרה כטיוטה</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => applyStatus("archived")}>העברה לארכיון</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]" onClick={() => setConfirmDelete(true)}>מחיקה</button>
          </div>
        )}
      </div>

      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="h-[34px] text-[13px] text-[#4a4a4a]">
              <th className="w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((product) => product.id))} className="size-4 accent-[#303030]" />
              </th>
              <th className="w-[52px] bg-[#f3f3f3]" />
              {["מוצר", "סטטוס", "מלאי", "קטגוריה"].map((label) => (
                <th key={label} className="bg-[#f3f3f3] px-2 text-start font-semibold whitespace-nowrap">{label}</th>
              ))}
              <th className="bg-[#f3f3f3] px-2 text-center font-semibold">ערוצים</th>
              <th className="bg-[#f3f3f3] px-2 text-center font-semibold">קטלוגים</th>
              <th className="bg-[#f3f3f3] px-2 text-start font-semibold">סוג מוצר</th>
              <th className="rounded-e-[10px] bg-[#f3f3f3] px-2 text-start font-semibold">ספק</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={index} className="h-[49px] border-b border-[#ebebeb] bg-white">
                    <td className="px-2.5"><span className="block size-4 rounded bg-[#ebebeb]" /></td>
                    <td className="p-1"><span className="block size-9 rounded-lg bg-[#ebebeb]" /></td>
                    <td className="px-2"><span className="block h-[9px] w-[200px] animate-pulse rounded-full bg-[#e3e3e3]" /></td>
                    <td className="px-2"><span className="block h-[18px] w-11 rounded-md bg-[#ebebeb]" /></td>
                    <td className="px-2"><span className="block h-[9px] w-[110px] rounded-full bg-[#e3e3e3]" /></td>
                    <td colSpan={5} />
                  </tr>
                ))
              : rows.map((product) => {
                  const status = PRODUCT_STATUS[product.status];
                  const inventory = inventoryLabel(product);
                  const on = selected.includes(product.id);
                  return (
                    <tr key={product.id} className="h-[49px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }} onClick={() => router.push(`/admin/products/${product.id}`)}>
                      <td className="px-2.5" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={on} onChange={() => setSelected((current) => (current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id]))} className="size-4 accent-[#303030]" />
                      </td>
                      <td className="p-1">
                        {product.media?.[0] ? (
                          <img src={product.media[0]} alt="" className="block size-9 rounded-lg object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />
                        ) : (
                          <span className="block size-9 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: product.tone }} />
                        )}
                      </td>
                      <td className="max-w-[300px] px-2 font-medium">{product.title}</td>
                      <td className="px-2"><span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-semibold whitespace-nowrap" style={{ background: status.background, color: status.color }}>{status.label}</span></td>
                      <td className="px-2 whitespace-nowrap" style={{ color: inventory.color }}>{inventory.text}</td>
                      <td className="px-2 whitespace-nowrap">{product.category}</td>
                      <td className="px-2 text-center">0</td>
                      <td className="px-2 text-center">0</td>
                      <td className="px-2 whitespace-nowrap text-ink-secondary">{product.category}</td>
                      <td className="px-2 whitespace-nowrap">{product.vendor}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <div className="mx-3 flex flex-col items-center gap-2 rounded-b-xl bg-white px-4 py-12 text-center text-ink-secondary">
          לא נמצאו מוצרים.
          <button type="button" className={softButton} onClick={() => { setQuery(""); setTab("all"); }}>ניקוי חיפוש</button>
        </div>
      ) : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />

      {confirmDelete ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setConfirmDelete(false)}>
          <div role="dialog" aria-label="מחיקת מוצרים" className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,.24)]" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">למחוק {selected.length} מוצרים?</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">המוצרים יימחקו מהחנות.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={softButton} onClick={() => setConfirmDelete(false)}>ביטול</button>
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#8e1f0b] px-3 text-sm font-semibold text-white" onClick={() => { deleteCatalogProducts(selected); setSelected([]); setConfirmDelete(false); toast("המוצרים נמחקו"); }}>מחיקה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
