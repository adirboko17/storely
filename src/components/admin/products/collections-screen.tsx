"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, IndexDock, darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import {
  getCatalogVersion,
  getCollectionDraft,
  listCatalogProducts,
  listExtraCollections,
  listHiddenCollections,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { COLLECTION_SEEDS, productInSeed } from "@/lib/catalog/present";
import { formatInteger } from "@/lib/formatting/money";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

export function CollectionsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const products = listCatalogProducts();
  const hidden = listHiddenCollections();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const keys = [...listExtraCollections(), ...COLLECTION_SEEDS.map((seed) => seed.title)].filter((key, index, all) => all.indexOf(key) === index && !hidden.includes(key));
  const rows = keys
    .map((key) => {
      const seed = COLLECTION_SEEDS.find((item) => item.title === key);
      const draft = getCollectionDraft(key);
      const title = draft?.title || seed?.title || key;
      const count = draft
        ? products.filter((product) => (draft.conditions.length ? false : draft.ids.includes(product.id)) || (!draft.conditions.length && !draft.ids.length && seed ? productInSeed(product, seed.title) : draft.ids.includes(product.id))).length
        : products.filter((product) => productInSeed(product, key)).length;
      return { key, title, count, conditions: draft?.conditions.length ? draft.conditions.map((condition) => `${condition.field} ${condition.op} ${condition.value}`) : (seed?.conditions ?? []), tone: seed?.tone ?? "#fff" };
    })
    .filter((row) => !query.trim() || row.title.includes(query.trim()));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="tag" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">אוספים</h1>
        <button type="button" className={softButton}>פעולות נוספות</button>
        <button type="button" className={darkButton} onClick={() => router.push("/admin/products/collections/new")}>הוספת אוסף</button>
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
              <th className="w-[90px] bg-[#f3f3f3] px-2.5 text-end font-semibold">מוצרים</th>
              <th className="w-[38%] rounded-e-[10px] bg-[#f3f3f3] px-2.5 text-start font-semibold">תנאים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.includes(row.key);
              return (
                <tr key={row.key} className="h-[49px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }} onClick={() => router.push(`/admin/products/collections/${encodeURIComponent(row.key)}`)}>
                  <td className="px-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSelected((current) => (current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key]))} className="size-4 accent-[#303030]" /></td>
                  <td className="p-1"><span className="grid size-9 place-items-center rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,.1)]" style={{ background: row.tone }} /></td>
                  <td className="px-2.5 font-medium">{row.title}</td>
                  <td className="px-2.5 text-left">{formatInteger(row.count)}</td>
                  <td className="px-2.5 py-1.5 leading-5">{row.conditions.map((condition) => <div key={condition}>{condition}</div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="mx-3 rounded-b-xl bg-white px-10 py-10 text-center text-ink-secondary">לא נמצאו אוספים.</div> : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
    </div>
  );
}
