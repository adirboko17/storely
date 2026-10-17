"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity } from "@/data/live/store-identity";
import { Icon } from "@/components/ui/icon";
import { getCatalogVersion, isVideoMedia, listCatalogProducts, setVariantQuantity, subscribeCatalog } from "@/data/mock/catalog-session";
import { getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import type { Product } from "@/types/commerce";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

function variantIndex(product: Product, line: Product) {
  const values = product.option?.values ?? [];
  if (values.length <= 1) return 0;
  const sku = line.sku.trim();
  if (sku && product.sku) {
    if (sku === product.sku) return 0;
    const prefix = `${product.sku}-`;
    if (sku.startsWith(prefix)) {
      const index = Number(sku.slice(prefix.length)) - 1;
      if (Number.isInteger(index) && index >= 0 && index < values.length) return index;
    }
  }
  if (line.variant) {
    const found = values.findIndex((value) => value === line.variant);
    if (found >= 0) return found;
  }
  return 0;
}

function reservedByRow(products: Product[]) {
  const reserved = new Map<string, number>();
  listResolvedOrders().forEach((order) => {
    if (order.pay === "refunded" || order.fulfillment === "fulfilled") return;
    order.lines.forEach((line) => {
      const product = products.find((item) => item.id === line.product.id);
      if (!product || line.quantity <= 0) return;
      const key = `${product.id}:${variantIndex(product, line.product)}`;
      reserved.set(key, (reserved.get(key) ?? 0) + line.quantity);
    });
  });
  return reserved;
}

export function InventoryScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const products = listCatalogProducts();
  const reserved = reservedByRow(products);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const rows = products.flatMap((product) => {
    const values = product.option?.values ?? [null];
    const quantities = product.quantities ?? [product.stock];
    return values.map((value, index) => ({
      key: `${product.id}:${index}`,
      product,
      value,
      index,
      quantity: quantities[index] ?? 0,
    }));
  }).filter((row) => {
    const needle = query.trim();
    return !needle || row.product.title.includes(needle) || row.product.sku.toLowerCase().includes(needle.toLowerCase());
  });
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));

  function commit(key: string, productId: number, index: number, onHand: number, committed: number) {
    if (edits[key] == null) return;
    const available = Number.parseInt(edits[key], 10);
    setEdits((state) => {
      const copy = { ...state };
      delete copy[key];
      return copy;
    });
    if (!Number.isFinite(available)) return;
    const nextOnHand = Math.max(0, available + committed);
    if (nextOnHand !== onHand) {
      setVariantQuantity(productId, index, nextOnHand);
      toast(`הכמות הזמינה עודכנה ל-${available}`);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="store" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">מלאי</h1>
        <button type="button" className={softButton} onClick={() => toast(`קובץ CSV יישלח אל ${getStoreIdentity().ownerEmail}`)}>ייצוא</button>
        <button type="button" className={softButton}>ייבוא</button>
      </div>
      <div className="mx-3 flex min-h-[42px] items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <button type="button" className="h-[30px] rounded-lg border-0 bg-transparent px-2 text-sm font-semibold">הכל</button>
        <div className="flex flex-1 items-center gap-2 px-1.5 text-ink-secondary">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש וסינון" className="h-[30px] min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
        </div>
        <ColumnsButton onClick={() => toast("בחירת עמודות תתווסף בשלב הבא")} />
      </div>
      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-8 w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))} className="size-4 accent-[#303030]" /></th>
              <th className="w-12 bg-[#f3f3f3]" />
              {["מוצר", "מק״ט", "לא זמין", "שמור להזמנות", "זמין", "במחסן", "בדרך"].map((label, index) => (
                <th key={label} className={`bg-[#f3f3f3] px-2.5 font-semibold whitespace-nowrap underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px] ${index === 0 || index === 1 ? "text-start no-underline" : "text-end"} ${index === 6 ? "rounded-e-[10px]" : ""}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const committed = reserved.get(row.key) ?? 0;
              const available = row.quantity - committed;
              const draft = edits[row.key];
              const on = selected.includes(row.key);
              const photo = row.product.media?.find((item) => item && !isVideoMedia(item));
              return (
                <tr key={row.key} className="h-[49px] border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }}>
                  <td className="px-2.5"><input type="checkbox" checked={on} onChange={() => setSelected((current) => (current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key]))} className="size-4 accent-[#303030]" /></td>
                  <td className="p-1">
                    {photo ? (
                      <img src={photo} alt="" className="block size-9 rounded-lg object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />
                    ) : (
                      <span className="block size-9 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: row.product.tone }} />
                    )}
                  </td>
                  <td className="px-2.5">
                    <Link href={`/admin/products/${row.product.id}`} className="font-medium text-ink no-underline">{row.product.title}</Link>
                    {row.value ? <div className="mt-0.5"><span className="inline-flex h-[18px] items-center rounded-md bg-[#ebebeb] px-1.5 text-xs">{row.value}</span></div> : null}
                  </td>
                  <td dir="ltr" className="px-2.5 text-right" style={{ color: row.product.sku ? "#303030" : "#616161" }}>{row.product.sku ? `${row.product.sku}${row.value ? `-${row.index + 1}` : ""}` : "ללא מק״ט"}</td>
                  <td className="px-2.5 text-left">0</td>
                  <td className="px-2.5 text-left">{committed}</td>
                  <td className="px-1.5 text-left">
                    <input dir="ltr" type="number" value={draft ?? String(available)} onChange={(event) => setEdits((state) => ({ ...state, [row.key]: event.target.value }))} onBlur={() => commit(row.key, row.product.id, row.index, row.quantity, committed)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-[30px] w-[84px] rounded-lg border bg-white px-2 text-left text-sm outline-none" style={{ borderColor: draft != null && draft !== String(available) ? "#005bd3" : "#c4c4c4" }} />
                  </td>
                  <td className="px-2.5 text-left">{row.quantity}</td>
                  <td className="px-2.5 text-left">0</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
    </div>
  );
}
