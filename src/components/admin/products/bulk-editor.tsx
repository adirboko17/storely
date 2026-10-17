"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { saveCatalogProduct } from "@/data/mock/catalog-session";
import { PRODUCT_STATUS } from "@/lib/catalog/present";
import type { Product, ProductStatus } from "@/types/commerce";

type ColumnId = "title" | "status" | "category" | "vendor" | "price" | "compare" | "cost" | "sku" | "barcode" | "stock" | "description" | "tags" | "badge" | "badgeHidden";

const COLUMNS: Array<{ id: ColumnId; label: string; width: number; locked?: boolean }> = [
  { id: "title", label: "שם המוצר", width: 240, locked: true },
  { id: "status", label: "סטטוס", width: 130 },
  { id: "category", label: "קטגוריה", width: 160 },
  { id: "vendor", label: "ספק", width: 140 },
  { id: "price", label: "מחיר", width: 110 },
  { id: "compare", label: "מחיר מקורי", width: 120 },
  { id: "stock", label: "כמות זמינה", width: 120 },
  { id: "cost", label: "עלות", width: 110 },
  { id: "sku", label: "מק״ט", width: 140 },
  { id: "barcode", label: "ברקוד", width: 160 },
  { id: "description", label: "תיאור", width: 260 },
  { id: "tags", label: "תגיות", width: 180 },
  { id: "badge", label: "תגית על הכרטיס", width: 150 },
  { id: "badgeHidden", label: "הסתרת תגית", width: 120 },
];

const DEFAULT_COLUMNS: ColumnId[] = ["title", "status", "category", "vendor", "price", "compare", "stock"];

type Row = {
  id: number;
  title: string;
  status: ProductStatus;
  category: string;
  vendor: string;
  price: string;
  compare: string;
  cost: string;
  sku: string;
  barcode: string;
  stock: string;
  description: string;
  tags: string;
  badge: string;
  badgeHidden: boolean;
};

function toRow(product: Product): Row {
  return {
    id: product.id,
    title: product.title,
    status: product.status,
    category: product.category,
    vendor: product.vendor,
    price: String(product.price),
    compare: product.compareAt == null ? "" : String(product.compareAt),
    cost: String(product.cost),
    sku: product.sku,
    barcode: product.barcode ?? "",
    stock: String(product.stock),
    description: product.description ?? "",
    tags: product.tags.join(", "),
    badge: product.badge ?? "",
    badgeHidden: product.badgeHidden === true,
  };
}

function money(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

export function BulkEditor({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const { toast } = useAdmin();
  const [rows, setRows] = useState(() => products.map(toRow));
  const [visible, setVisible] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const shown = COLUMNS.filter((column) => column.locked || visible.includes(column.id));

  function patch(id: number, partial: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...partial } : row)));
  }

  async function save() {
    const invalid = rows.find((row) => !row.title.trim() || money(row.price) == null);
    if (invalid) {
      toast("לכל מוצר צריך שם ומחיר תקין");
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
        const product = products.find((item) => item.id === row.id);
        if (!product) continue;
        const price = money(row.price) ?? product.price;
        const compare = row.compare.trim() ? money(row.compare) : null;
        const category = row.category.trim();
        const collections = product.collections.map((name) => (name === product.category ? category : name)).filter(Boolean);
        if (category && !collections.includes(category)) collections.unshift(category);
        await saveCatalogProduct({
          ...product,
          title: row.title.trim(),
          status: row.status,
          category,
          collections,
          vendor: row.vendor.trim(),
          price,
          compareAt: compare == null ? undefined : compare,
          cost: money(row.cost) ?? 0,
          sku: row.sku.trim(),
          barcode: row.barcode.trim() || undefined,
          stock: Math.max(0, Number.parseInt(row.stock, 10) || 0),
          description: row.description,
          tags: row.tags.split(/[,|]/).map((tag) => tag.trim()).filter(Boolean),
          badge: row.badge.trim().slice(0, 24),
          badgeHidden: row.badgeHidden,
        });
      }
      toast("המוצרים נשמרו");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#f6f6f6]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e3e3e3] bg-white px-4">
        <button type="button" className="h-8 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold hover:bg-[#f1f1f1]" onClick={onClose} disabled={saving}>חזרה</button>
        <h1 className="m-0 text-[15px] font-semibold">עריכת {products.length} מוצרים</h1>
        <div className="flex-1" />
        <div className="relative">
          <button type="button" className="h-8 rounded-lg border border-[#c9c9c9] bg-white px-3 text-sm font-semibold" onClick={() => setColumnsOpen((open) => !open)}>עמודות</button>
          {columnsOpen ? (
            <div className="absolute top-10 left-0 z-10 w-[220px] rounded-xl bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_12px_28px_rgba(0,0,0,.16)]">
              {COLUMNS.filter((column) => !column.locked).map((column) => (
                <label key={column.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f6f6f6]">
                  <input
                    type="checkbox"
                    checked={visible.includes(column.id)}
                    onChange={() => setVisible((current) => (current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id]))}
                    className="size-4 accent-[#303030]"
                  />
                  {column.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void save()} disabled={saving}>{saving ? "שומר…" : "שמירה"}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: shown.reduce((sum, column) => sum + column.width, 0) }}>
          <thead>
            <tr>
              {shown.map((column) => (
                <th key={column.id} className="sticky top-0 z-[1] border-b border-e border-[#e3e3e3] bg-[#f3f3f3] px-3 py-2 text-start text-[13px] font-semibold whitespace-nowrap" style={{ width: column.width, minWidth: column.width }}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="bg-white">
                {shown.map((column) => (
                  <td key={column.id} className="border-b border-e border-[#ebebeb] p-0 align-middle" style={{ width: column.width, minWidth: column.width }}>
                    <Cell row={row} column={column.id} onChange={(partial) => patch(row.id, partial)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ row, column, onChange }: { row: Row; column: ColumnId; onChange: (partial: Partial<Row>) => void }) {
  const input = "h-10 w-full border-0 bg-transparent px-3 text-sm outline-none focus:bg-[#f3f7ff]";
  if (column === "status") {
    return (
      <select value={row.status} onChange={(event) => onChange({ status: event.target.value as ProductStatus })} className={input}>
        {(Object.keys(PRODUCT_STATUS) as ProductStatus[]).map((status) => (
          <option key={status} value={status}>{PRODUCT_STATUS[status].label}</option>
        ))}
      </select>
    );
  }
  if (column === "badgeHidden") {
    return (
      <label className="flex h-10 items-center gap-2 px-3">
        <input type="checkbox" checked={row.badgeHidden} onChange={(event) => onChange({ badgeHidden: event.target.checked })} className="size-4 accent-[#303030]" />
        <span className="text-[13px]">{row.badgeHidden ? "מוסתר" : "מוצג"}</span>
      </label>
    );
  }
  if (column === "description") {
    return <textarea value={row.description} rows={1} onChange={(event) => onChange({ description: event.target.value })} className="block w-full resize-y border-0 bg-transparent px-3 py-2 text-sm leading-5 outline-none focus:bg-[#f3f7ff]" />;
  }
  const numeric = column === "price" || column === "compare" || column === "cost" || column === "stock";
  const value = row[column];
  return (
    <input
      dir={numeric || column === "sku" || column === "barcode" ? "ltr" : undefined}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange({ [column]: event.target.value })}
      className={`${input} ${numeric ? "text-end" : ""}`}
    />
  );
}
