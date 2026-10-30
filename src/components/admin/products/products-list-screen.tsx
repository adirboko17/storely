"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, darkButton, softButton } from "@/components/admin/orders/chrome";
import { DateRangePicker, defaultDashboardWindow, type DashboardWindow } from "@/components/admin/dashboard/date-range-picker";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useAdminSlice } from "@/components/admin/slice-pending";
import { Icon } from "@/components/ui/icon";
import {
  deleteCatalogProducts,
  getCatalogVersion,
  listCatalogProducts,
  nextProductId,
  saveCatalogProduct,
  setProductStatuses,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import { BulkEditor } from "@/components/admin/products/bulk-editor";
import { ProductArrangeScreen } from "@/components/admin/products/product-arrange-screen";
import { PRODUCT_STATUS, PRODUCT_TABS, inventoryLabel, type ProductTab } from "@/lib/catalog/present";
import { formatMoney0 } from "@/lib/formatting/money";
import type { Product, ProductStatus } from "@/types/commerce";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

function orderStamp(at: string | undefined, label: string) {
  if (at) {
    const time = Date.parse(at);
    if (!Number.isNaN(time)) return time;
  }
  if (label.startsWith("היום") || label.startsWith("לפני")) return Date.now();
  if (label.startsWith("אתמול")) return Date.now() - 86400000;
  const match = label.match(/(\d+)\s+ב([א-ת]+)/);
  if (!match) return null;
  const month = MONTHS.findIndex((name) => (match[2] ?? "").startsWith(name));
  if (month < 0) return null;
  const now = new Date();
  let year = now.getFullYear();
  const day = Number(match[1]);
  if (new Date(year, month, day).getTime() > now.getTime() + 86400000) year -= 1;
  return new Date(year, month, day).getTime();
}

function productInsight(products: Product[], range: DashboardWindow) {
  const start = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).getTime();
  const end = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() + 1).getTime();
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const sold = new Map<number, number>();
  const revenue = new Map<number, number>();
  listResolvedOrders().forEach((order) => {
    if (order.pay === "refunded") return;
    const time = orderStamp(order.at, order.date);
    if (time == null || time < start || time >= end) return;
    order.lines.forEach((line) => {
      sold.set(line.product.id, (sold.get(line.product.id) ?? 0) + line.quantity);
      revenue.set(line.product.id, (revenue.get(line.product.id) ?? 0) + line.product.price * line.quantity);
    });
  });
  const units = [...sold.values()].reduce((sum, value) => sum + value, 0);
  const stock = products.filter((product) => product.trackInventory !== false).reduce((sum, product) => sum + Math.max(0, product.stock), 0);
  const soldRate = units + stock === 0 ? 0 : Math.round((units / (units + stock)) * 100);
  let endingSoon = 0;
  let stocked = 0;
  products.forEach((product) => {
    if (product.trackInventory === false) return;
    const pace = (sold.get(product.id) ?? 0) / days;
    const cover = pace > 0 ? product.stock / pace : product.stock > 0 ? days + 1 : 0;
    if (product.stock <= 0 || cover < 7) endingSoon += 1;
    else stocked += 1;
  });
  const ranked = [...products].sort((a, b) => (revenue.get(b.id) ?? 0) - (revenue.get(a.id) ?? 0));
  const total = ranked.reduce((sum, product) => sum + (revenue.get(product.id) ?? 0), 0);
  const groups = { leaders: 0, middle: 0, rest: 0 };
  let running = 0;
  ranked.forEach((product) => {
    const value = revenue.get(product.id) ?? 0;
    const share = total ? running / total : 1;
    running += value;
    if (!value || share >= 0.95) groups.rest += value;
    else if (share < 0.7) groups.leaders += value;
    else groups.middle += value;
  });
  return { soldRate, endingSoon, stocked, leaders: formatMoney0(groups.leaders), middle: formatMoney0(groups.middle), rest: formatMoney0(groups.rest) };
}

export function ProductsListScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const catalogReady = useAdminSlice("catalog");
  const products = listCatalogProducts();
  const [tab, setTab] = useState<ProductTab>("all");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [arrange, setArrange] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [range, setRange] = useState<DashboardWindow>(defaultDashboardWindow);
  const rangeButton = useRef<HTMLButtonElement>(null);
  const insight = useMemo(() => productInsight(products, range), [products, range]);

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
        <button type="button" className={softButton} onClick={() => setArrange((open) => !open)}>
          {arrange ? "חזרה לרשימה" : "סידור בחנות"}
        </button>
        <button type="button" className={softButton} onClick={() => setTransfer(true)}>
          ייבוא / ייצוא
        </button>
        <Link href="/admin/products/new" className={darkButton}>
          הוספת מוצר
        </Link>
      </div>

      {arrange ? <ProductArrangeScreen /> : (
      <>
      <div className="mx-3 flex overflow-x-auto rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="relative flex shrink-0 items-center border-e border-[#ebebeb] px-3">
          <button ref={rangeButton} type="button" aria-expanded={rangeOpen} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-sm font-medium text-ink hover:bg-[#f6f6f6]" onClick={() => setRangeOpen((open) => !open)}>
            {range.label}
          </button>
          {rangeOpen && rangeButton.current ? (
            <DateRangePicker anchor={rangeButton.current} value={range} onClose={() => setRangeOpen(false)} onApply={(next) => { setRange(next); setRangeOpen(false); }} />
          ) : null}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 border-e border-[#ebebeb] px-[18px] py-3">
          <span className="text-sm font-semibold">כמה מהמלאי נמכר</span>
          <span className="text-[12px] text-[#616161]">אחוז היחידות שנמכרו מתוך המלאי</span>
          <b className="text-sm">{insight.soldRate}%</b>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5 border-e border-[#ebebeb] px-[18px] py-3">
          <span className="text-sm font-semibold">מתי המלאי נגמר</span>
          <span className="text-[12px] text-[#616161]">לפי קצב המכירה בטווח שנבחר</span>
          <div className="flex flex-wrap gap-3.5">
            <span>
              <b className="text-sm text-[#8a6116]">{insight.endingSoon}</b> נגמרים השבוע
            </span>
            <span>
              <b className="text-sm">{insight.stocked}</b> יש מלאי להמשך
            </span>
          </div>
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-0.5 px-[18px] py-3">
          <span className="text-sm font-semibold">אילו מוצרים מביאים כסף</span>
          <span className="text-[12px] text-[#616161]">מובילים, בינוניים, והשאר</span>
          <div className="flex flex-wrap gap-3.5 text-sm">
            <span className="border-b-2 border-[#2c6ecb]"><b dir="ltr">{insight.leaders}</b> מובילים</span>
            <span className="border-b-2 border-[#7b61d6]"><b dir="ltr">{insight.middle}</b> בינוניים</span>
            <span className="border-b-2 border-[#9cc3ee]"><b dir="ltr">{insight.rest}</b> השאר</span>
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
            {selected.length > 2 ? <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => setBulkOpen(true)}>עריכה קבוצתית</button> : null}
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
            {loading || !catalogReady
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
      {catalogReady && !loading && rows.length === 0 ? (
        <div className="mx-3 flex flex-col items-center gap-2 rounded-b-xl bg-white px-4 py-12 text-center text-ink-secondary">
          לא נמצאו מוצרים.
          <button type="button" className={softButton} onClick={() => { setQuery(""); setTab("all"); }}>ניקוי חיפוש</button>
        </div>
      ) : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
      </>
      )}

      {transfer ? <TransferDialog count={products.length} onClose={() => setTransfer(false)} onExport={(fields) => { if (!products.length) { toast("אין מוצרים לייצוא"); return; } if (!fields.length) { toast("בחרו לפחות שדה אחד"); return; } downloadCsv("מוצרים.csv", productCsv(products, fields)); toast("קובץ המוצרים ירד"); }} onTemplate={() => { downloadCsv("תבנית-ייבוא-מוצרים.csv", templateCsv()); toast("קובץ הדוגמה ירד"); }} onFile={(file) => { void importProducts(file, toast, () => setTransfer(false)); }} /> : null}

      {bulkOpen ? <BulkEditor products={products.filter((product) => selected.includes(product.id))} onClose={() => setBulkOpen(false)} /> : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setConfirmDelete(false)}>
          <div role="dialog" aria-label="מחיקת מוצרים" className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,.24)]" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">למחוק {selected.length} מוצרים?</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">המוצרים יימחקו מהחנות.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={softButton} onClick={() => setConfirmDelete(false)}>ביטול</button>
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#8e1f0b] px-3 text-sm font-semibold text-white" onClick={() => { void deleteCatalogProducts(selected).then(() => { setSelected([]); setConfirmDelete(false); toast("המוצרים נמחקו"); }).catch((error: unknown) => toast(error instanceof Error ? error.message : "המחיקה לא נשמרה")); }}>מחיקה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const CSV_FIELDS: Array<{ id: string; label: string; sample: string; value: (product: Product) => string }> = [
  { id: "title", label: "שם", sample: "ספל קרמיקה", value: (product) => product.title },
  { id: "variant", label: "וריאנט", sample: "לבן", value: (product) => product.variant },
  { id: "price", label: "מחיר", sample: "89", value: (product) => String(product.price) },
  { id: "compare", label: "מחיר להשוואה", sample: "120", value: (product) => product.compareAt == null ? "" : String(product.compareAt) },
  { id: "cost", label: "עלות", sample: "30", value: (product) => String(product.cost) },
  { id: "sku", label: "מק״ט", sample: "MUG-01", value: (product) => product.sku },
  { id: "barcode", label: "ברקוד", sample: "7290000000000", value: (product) => product.barcode ?? "" },
  { id: "stock", label: "מלאי", sample: "12", value: (product) => String(product.stock) },
  { id: "status", label: "סטטוס", sample: "פעיל", value: (product) => PRODUCT_STATUS[product.status].label },
  { id: "category", label: "קטגוריה", sample: "כלי בית", value: (product) => product.category },
  { id: "vendor", label: "ספק", sample: "הסטודיו", value: (product) => product.vendor },
  { id: "tags", label: "תגיות", sample: "חדש | מתנה", value: (product) => product.tags.join(" | ") },
  { id: "collections", label: "קטגוריות", sample: "מובילים", value: (product) => product.collections.join(" | ") },
  { id: "description", label: "תיאור", sample: "ספל בעבודת יד.", value: (product) => product.description ?? "" },
  { id: "media", label: "תמונות", sample: "https://example.com/mug.jpg", value: (product) => (product.media ?? []).join(" | ") },
];

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function chosenFields(ids: string[]) {
  const picked = new Set(ids);
  return CSV_FIELDS.filter((field) => picked.has(field.id));
}

function productCsv(products: Product[], ids: string[]) {
  const fields = chosenFields(ids);
  const lines = products.map((product) => fields.map((field) => csvCell(field.value(product))).join(","));
  return [fields.map((field) => field.label).join(","), ...lines].join("\n");
}

function templateCsv() {
  return [CSV_FIELDS.map((field) => field.label).join(","), CSV_FIELDS.map((field) => csvCell(field.sample)).join(",")].join("\n");
}

function downloadCsv(name: string, body: string) {
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function splitList(value: string) {
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

function amount(value: string) {
  const number = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function statusOf(value: string): ProductStatus {
  if (value === "טיוטה" || value === "draft") return "draft";
  if (value === "בארכיון" || value === "archived") return "archived";
  return "active";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((item) => item.trim()));
}

async function importProducts(file: File, toast: (message: string) => void, done: () => void) {
  const rows = parseCsv(await file.text());
  const header = rows[0]?.map((item) => item.trim()) ?? [];
  if (!header.includes("שם")) {
    toast("הקובץ לא תואם את קובץ הדוגמה");
    return;
  }
  const value = (cells: string[], name: string) => cells[header.indexOf(name)]?.trim() ?? "";
  let added = 0;
  for (const cells of rows.slice(1)) {
    const title = value(cells, "שם");
    if (!title) continue;
    const compare = value(cells, "מחיר להשוואה");
    const media = splitList(value(cells, "תמונות"));
    try {
      await saveCatalogProduct({
        id: nextProductId(),
        title,
        variant: value(cells, "וריאנט"),
        price: amount(value(cells, "מחיר")),
        compareAt: compare ? amount(compare) : undefined,
        cost: amount(value(cells, "עלות")),
        sku: value(cells, "מק״ט"),
        barcode: value(cells, "ברקוד") || undefined,
        stock: Math.max(0, Math.round(amount(value(cells, "מלאי")))),
        status: statusOf(value(cells, "סטטוס")),
        category: value(cells, "קטגוריה"),
        vendor: value(cells, "ספק"),
        tone: "#e7e2d9",
        tags: splitList(value(cells, "תגיות")),
        collections: splitList(value(cells, "קטגוריות") || value(cells, "אוספים")),
        description: value(cells, "תיאור"),
        media: media.length ? media : undefined,
      });
      added += 1;
    } catch {
      toast("חלק מהמוצרים לא נשמרו");
      break;
    }
  }
  toast(added ? `יובאו ${added} מוצרים` : "לא נמצאו מוצרים בקובץ");
  if (added) done();
}

function TransferDialog({ count, onClose, onExport, onTemplate, onFile }: { count: number; onClose: () => void; onExport: (fields: string[]) => void; onTemplate: () => void; onFile: (file: File) => void }) {
  const [mode, setMode] = useState<"import" | "export">("export");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fields, setFields] = useState(CSV_FIELDS.map((field) => field.id));
  const allFields = fields.length === CSV_FIELDS.length;
  const [visible, setVisible] = useState(false);
  const closing = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  function close() {
    if (closing.current) return;
    closing.current = true;
    setVisible(false);
    window.setTimeout(() => closeRef.current(), 260);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" onMouseDown={close}>
      <div className="absolute inset-0 bg-[#1a1a1a]/30 backdrop-blur-[3px] transition-opacity duration-200" style={{ opacity: visible ? 1 : 0 }} />
      <div role="dialog" aria-modal="true" aria-label="ייבוא וייצוא" onMouseDown={(event) => event.stopPropagation()} className="relative w-full max-w-[460px] rounded-[22px] bg-white p-5 transition-all duration-300 ease-[cubic-bezier(.16,1,.3,1)]" style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(18px) scale(.96)", boxShadow: "0 30px 80px rgba(0,0,0,.22)" }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold">ייבוא וייצוא</div>
            <p className="m-0 mt-1 text-[13px] leading-5 text-[#616161]">קובץ CSV אחד לכל המוצרים.</p>
          </div>
          <button type="button" aria-label="סגירה" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-[#f3f3f3]">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#f3f3f3] p-1">
          {([{ id: "export", label: "ייצוא" }, { id: "import", label: "ייבוא" }] as const).map((item) => (
            <button key={item.id} type="button" onClick={() => setMode(item.id)} className="h-9 rounded-xl border-0 text-sm font-semibold transition-all duration-300" style={{ background: mode === item.id ? "#fff" : "transparent", color: "#1a1a1a", boxShadow: mode === item.id ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{item.label}</button>
          ))}
        </div>
        <div key={mode} className="mt-4 flex flex-col gap-3" style={{ animation: "storely-transfer 280ms cubic-bezier(.16,1,.3,1) both" }}>
          <style>{`@keyframes storely-transfer { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { @keyframes storely-transfer { from, to { opacity: 1; transform: none } } }`}</style>
          {mode === "export" ? (
            <>
              <p className="m-0 text-sm leading-6 text-[#4a4a4a]">יורד קובץ עם {count} מוצרים. ברירת המחדל היא כל השדות.</p>
              <button type="button" aria-expanded={fieldsOpen} onClick={() => setFieldsOpen((open) => !open)} className="flex h-9 w-full items-center justify-between rounded-xl border-0 bg-[#f7f7f7] px-3 text-sm font-semibold text-[#1a1a1a]">
                {allFields ? "כל השדות" : `${fields.length} שדות`}
                <Icon name="chevron" size={14} strokeWidth={1.8} className={`transition-transform duration-300 ease-out ${fieldsOpen ? "-rotate-90" : "rotate-90"}`} />
              </button>
              <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: fieldsOpen ? "1fr" : "0fr" }}>
                <div className={`overflow-hidden ${fieldsOpen ? "" : "pointer-events-none"}`}>
                  <div className={`flex max-h-[220px] flex-col gap-1 overflow-auto pt-1 transition-all duration-300 ease-out ${fieldsOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}>
                    <label className="flex items-center gap-2 px-1 py-1 text-sm font-semibold">
                      <input type="checkbox" checked={allFields} onChange={() => setFields(allFields ? [] : CSV_FIELDS.map((field) => field.id))} />
                      הכל
                    </label>
                    {CSV_FIELDS.map((field) => (
                      <label key={field.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                        <input type="checkbox" checked={fields.includes(field.id)} onChange={() => setFields((current) => current.includes(field.id) ? current.filter((id) => id !== field.id) : [...current, field.id])} />
                        {field.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => onExport(fields)} className="h-11 rounded-2xl border-0 bg-[#1a1a1a] text-sm font-semibold text-white">הורדת CSV</button>
            </>
          ) : (
            <>
              <p className="m-0 text-sm leading-6 text-[#4a4a4a]">הסטטוס הוא פעיל, טיוטה או בארכיון. כמה תגיות מפרידים ב-|.</p>
              <button type="button" onClick={onTemplate} className="inline-flex h-7 w-fit items-center rounded-full border-0 bg-[#f3f3f3] px-3 text-[13px] font-semibold text-[#1a1a1a]">הורדת קובץ לדוגמה</button>
              <label className="flex h-11 cursor-pointer items-center justify-center rounded-2xl bg-[#1a1a1a] text-sm font-semibold text-white">
                העלאת קובץ ייבוא
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
