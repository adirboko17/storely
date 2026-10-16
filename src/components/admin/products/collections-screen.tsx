"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { TermPicker } from "@/components/admin/products/term-picker";
import { addCategorySubcategory, getCatalogVersion, getCollectionDraft, listCatalogProducts, listExtraCollections, listHiddenCollections, removeCategorySubcategory, subscribeCatalog, type CollectionCondition } from "@/data/mock/catalog-session";
import { formatInteger } from "@/lib/formatting/money";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const FIELD: Record<CollectionCondition["field"], string> = { price: "מחיר", stock: "מלאי", vendor: "ספק", category: "קטגוריה", tag: "תגית" };
const OP: Record<string, string> = { gt: "גדול מ", lt: "קטן מ", eq: "שווה ל", has: "מכיל" };

function conditionLine(condition: CollectionCondition) {
  return `${FIELD[condition.field]} ${OP[condition.op] ?? condition.op} ${condition.value}`.trim();
}

export function CollectionsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const products = listCatalogProducts();
  const hidden = listHiddenCollections();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const fromProducts = products.map((product) => product.category.trim()).filter(Boolean);
  const keys = [...listExtraCollections(), ...fromProducts].filter((key, index, all) => all.indexOf(key) === index && !hidden.includes(key));
  const rows = keys
    .map((key) => {
      const draft = getCollectionDraft(key);
      const title = draft?.title || key;
      const count = draft?.conditions.length
        ? products.filter((product) => draft.conditions.every((condition) => matchesCategory(product, condition)) && (!draft.excludeOutOfStock || product.stock > 0)).length
        : products.filter((product) => product.category.trim() === key || product.collections.includes(key) || draft?.ids.includes(product.id)).length;
      const sample = products.find((product) => product.category.trim() === title);
      return { key, title, count, conditions: draft?.conditions.map(conditionLine) ?? [], tone: sample?.tone || "#f3f3f3" };
    })
    .filter((row) => !query.trim() || row.title.includes(query.trim()))
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="tag" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">קטגוריות</h1>
        <button type="button" className={darkButton} onClick={() => router.push("/admin/products/collections/new")}>הוספת קטגוריה</button>
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
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-8 w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))} className="size-4 accent-[#303030]" /></th>
              <th className="w-12 bg-[#f3f3f3]" />
              <th className="bg-[#f3f3f3] px-2.5 text-start font-semibold">כותרת</th>
              <th className="w-[280px] bg-[#f3f3f3] px-2.5 text-start font-semibold">תתי קטגוריה</th>
              <th className="w-[90px] bg-[#f3f3f3] px-2.5 text-end font-semibold">מוצרים</th>
              <th className="w-[28%] rounded-e-[10px] bg-[#f3f3f3] px-2.5 text-start font-semibold">תנאים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.includes(row.key);
              return (
                <tr key={row.key} className="min-h-[49px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }} onClick={() => router.push(`/admin/products/collections/${encodeURIComponent(row.key)}`)}>
                  <td className="px-2.5 align-top pt-3.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSelected((current) => (current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key]))} className="size-4 accent-[#303030]" /></td>
                  <td className="p-1 align-top pt-2"><span className="grid size-9 place-items-center rounded-lg text-[#8a8a8a] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: row.tone }}><Icon name="tag" size={14} strokeWidth={1.6} /></span></td>
                  <td className="px-2.5 py-3 align-top font-medium">{row.title}</td>
                  <td className="px-2.5 py-2 align-top" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1">
                      {(getCollectionDraft(row.key)?.subcategories ?? []).map((name) => {
                        const count = products.filter((product) => (product.subcategories ?? []).includes(name)).length;
                        return (
                          <button key={name} type="button" className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-start text-[13px] font-normal hover:bg-[#efefef]" onClick={() => router.push(`/admin/products/collections/${encodeURIComponent(row.key)}/${encodeURIComponent(name)}`)}>
                            <span className="min-w-0 flex-1 truncate">{name}</span>
                            <span className="text-[12px] text-[#616161]">{formatInteger(count)}</span>
                          </button>
                        );
                      })}
                      <TermPicker
                        appearance="button"
                        showSelected={false}
                        addLabel="הוספת תת קטגוריה"
                        searchPlaceholder="חיפוש או הוספת תת קטגוריה"
                        emptyLabel="אין תתי קטגוריה"
                        createLabel="הוספת תת קטגוריה חדשה"
                        options={getCollectionDraft(row.key)?.subcategories ?? []}
                        selected={getCollectionDraft(row.key)?.subcategories ?? []}
                        onChange={(names) => {
                          const current = getCollectionDraft(row.key)?.subcategories ?? [];
                          current.filter((name) => !names.includes(name)).forEach((name) => removeCategorySubcategory(row.key, name));
                          names.filter((name) => !current.includes(name)).forEach((name) => addCategorySubcategory(row.key, name));
                        }}
                        onCreate={(title) => {
                          if (!title) {
                            toast("הקלידו שם לתת קטגוריה בשדה החיפוש");
                            return false;
                          }
                          addCategorySubcategory(row.key, title);
                          return true;
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-2.5 py-3 align-top text-left">{formatInteger(row.count)}</td>
                  <td className="px-2.5 py-3 align-top leading-5 text-[#4a4a4a]">{row.conditions.map((condition) => <div key={condition}>{condition}</div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="mx-3 rounded-b-xl bg-white px-10 py-10 text-center text-ink-secondary">אין עדיין קטגוריות.</div> : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
    </div>
  );
}

function matchesCategory(product: { price: number; stock: number; vendor: string; category: string; tags: string[] }, condition: CollectionCondition) {
  const value = condition.value.trim();
  const number = Number(value);
  if (condition.field === "price") return condition.op === "lt" ? product.price < number : condition.op === "eq" ? product.price === number : product.price > number;
  if (condition.field === "stock") return condition.op === "lt" ? product.stock < number : condition.op === "eq" ? product.stock === number : product.stock > number;
  const text = condition.field === "vendor" ? product.vendor : condition.field === "category" ? product.category : product.tags.join(" ");
  return condition.op === "eq" ? text === value : text.includes(value);
}
