"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { TermPicker } from "@/components/admin/products/term-picker";
import { addCategorySubcategory, deleteCategorySubcategory, getCatalogVersion, getCollectionDraft, hideCollection, listCatalogProducts, listExtraCollections, listHiddenCollections, removeCategorySubcategory, reorderCollections, subscribeCatalog, type CollectionCondition } from "@/data/mock/catalog-session";
import { moveItem } from "@/lib/catalog/arrange";
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
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
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
    .filter((row) => !query.trim() || row.title.includes(query.trim()));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));
  const picked = selected.filter((key) => rows.some((row) => row.key === key));

  const canDrag = !query.trim() && !savingOrder && rows.length > 1;

  async function dropAt(index: number) {
    if (dragFrom == null || !canDrag) return;
    const next = moveItem(rows, dragFrom, index);
    setDragFrom(null);
    setOver(null);
    if (next === rows) return;
    setSavingOrder(true);
    try {
      await reorderCollections(next.map((row) => row.key));
      toast("הסדר נשמר ויופיע באתר");
    } catch {
      toast("לא הצלחנו לשמור את הסדר");
    } finally {
      setSavingOrder(false);
    }
  }

  function removeSelected() {
    picked.forEach((key) => hideCollection(key));
    setSelected([]);
    toast(picked.length === 1 ? "הקטגוריה נמחקה" : `${picked.length} קטגוריות נמחקו`);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="tag" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">קטגוריות</h1>
        <button type="button" className={darkButton} onClick={() => router.push("/admin/products/collections/new")}>הוספת קטגוריה</button>
      </div>
      <div className="mx-3 flex min-h-[42px] items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {picked.length === 0 ? (
          <>
            <button type="button" className="h-[30px] rounded-lg border-0 bg-transparent px-2 text-sm font-semibold">הכל</button>
            <div className="flex flex-1 items-center gap-2 px-1.5 text-ink-secondary">
              <Icon name="search" size={16} strokeWidth={1.8} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש וסינון" className="h-[30px] min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
            </div>
            <ColumnsButton onClick={() => toast("בחירת עמודות תתווסף בשלב הבא")} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))} className="size-4 accent-[#303030]" />
            <span className="font-semibold">{picked.length} נבחרו</span>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]" onClick={removeSelected}>מחיקה</button>
          </div>
        )}
      </div>
      <p className="mx-3 mt-2 mb-0 text-[13px] text-[#616161]">{query.trim() ? "נקו את החיפוש כדי לשנות את סדר הקטגוריות." : "גררו את הידית כדי לקבוע את סדר הקטגוריות באתר."}</p>
      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-8 w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.key))} className="size-4 accent-[#303030]" /></th>
              <th className="w-8 bg-[#f3f3f3]" />
              <th className="w-12 bg-[#f3f3f3]" />
              <th className="bg-[#f3f3f3] px-2.5 text-start font-semibold">כותרת</th>
              <th className="w-[280px] bg-[#f3f3f3] px-2.5 text-start font-semibold">תתי קטגוריה</th>
              <th className="w-[90px] bg-[#f3f3f3] px-2.5 text-end font-semibold">מוצרים</th>
              <th className="w-[28%] rounded-e-[10px] bg-[#f3f3f3] px-2.5 text-start font-semibold">תנאים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const on = selected.includes(row.key);
              return (
                <tr
                  key={row.key}
                  className="min-h-[49px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]"
                  style={{ background: on ? "#f1f1f1" : "#fff", outline: over === index && dragFrom !== index ? "2px solid #303030" : undefined, opacity: dragFrom === index ? 0.45 : 1 }}
                  onDragOver={(event) => {
                    if (!canDrag || dragFrom == null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOver(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void dropAt(index);
                  }}
                  onClick={() => router.push(`/admin/products/collections/${encodeURIComponent(row.key)}`)}
                >
                  <td className="px-2.5 align-top pt-3.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSelected((current) => (current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key]))} className="size-4 accent-[#303030]" /></td>
                  <td className="px-1 align-top pt-3" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      draggable={canDrag}
                      aria-label={`גרירת ${row.title}`}
                      title="גרירה לשינוי הסדר"
                      className="grid size-7 cursor-grab place-items-center rounded-md border-0 bg-transparent text-[#8a8a8a] active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
                      disabled={!canDrag}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));
                        setDragFrom(index);
                      }}
                      onDragEnd={() => {
                        setDragFrom(null);
                        setOver(null);
                      }}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden>
                        <circle cx="7" cy="5" r="1.2" />
                        <circle cx="13" cy="5" r="1.2" />
                        <circle cx="7" cy="10" r="1.2" />
                        <circle cx="13" cy="10" r="1.2" />
                        <circle cx="7" cy="15" r="1.2" />
                        <circle cx="13" cy="15" r="1.2" />
                      </svg>
                    </button>
                  </td>
                  <td className="p-1 align-top pt-2"><span className="grid size-9 place-items-center rounded-lg text-[#8a8a8a] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: row.tone }}><Icon name="tag" size={14} strokeWidth={1.6} /></span></td>
                  <td className="px-2.5 py-3 align-top font-medium">{row.title}</td>
                  <td className="px-2.5 py-2 align-top" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1">
                      {(getCollectionDraft(row.key)?.subcategories ?? []).map((name) => {
                        const count = products.filter((product) => (product.subcategories ?? []).includes(name)).length;
                        return (
                          <div key={name} className="group flex h-8 w-full items-center gap-1 rounded-lg px-2 hover:bg-[#efefef]">
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-start text-[13px] font-normal" onClick={() => router.push(`/admin/products/collections/${encodeURIComponent(row.key)}/${encodeURIComponent(name)}`)}>
                              <span className="min-w-0 flex-1 truncate">{name}</span>
                              <span className="text-[12px] text-[#616161]">{formatInteger(count)}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`מחיקת ${name}`}
                              className="grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent text-[#8e1f0b] opacity-0 group-hover:opacity-100 focus:opacity-100"
                              onClick={() => { deleteCategorySubcategory(row.key, name); toast("התת קטגוריה נמחקה"); }}
                            >
                              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l8 8M14 6l-8 8" /></svg>
                            </button>
                          </div>
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
