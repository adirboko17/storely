"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ColumnsButton, darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import {
  KIND_LABEL,
  deactivateDiscounts,
  discountStatus,
  discountSummary,
  getDiscountVersion,
  listDiscounts,
  removeDiscounts,
  subscribeDiscounts,
  type DiscountKind,
} from "@/data/mock/discount-session";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const TABS = [
  { key: "all", label: "הכל" },
  { key: "active", label: "פעיל" },
  { key: "scheduled", label: "מתוזמן" },
  { key: "expired", label: "פג תוקף" },
] as const;
const STATUS = {
  active: { label: "פעיל", background: "#cdfee1", color: "#0c5132" },
  scheduled: { label: "מתוזמן", background: "#e0f0ff", color: "#00527c" },
  expired: { label: "פג תוקף", background: "#e3e3e3", color: "#616161" },
};
const TYPES: Array<{ key: DiscountKind; label: string; detail: string }> = [
  { key: "product", label: "הנחה על מוצרים", detail: "אחוז או סכום על מוצרים או אוספים" },
  { key: "order", label: "הנחה על ההזמנה", detail: "אחוז או סכום מכל ההזמנה" },
  { key: "bxgy", label: "קנה X קבל Y", detail: "מוצר במתנה בקנייה של כמות" },
  { key: "ship", label: "משלוח חינם", detail: "ביטול דמי משלוח לפי תנאי" },
];

export function DiscountsListScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeDiscounts, getDiscountVersion, () => 0);
  const discounts = listDiscounts();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [picker, setPicker] = useState(false);
  const rows = discounts.filter((discount) => {
    if (tab !== "all" && discountStatus(discount) !== tab) return false;
    const needle = query.trim();
    return !needle || discount.code.includes(needle) || discountSummary(discount).includes(needle);
  });
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="discount" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">הנחות</h1>
        <button type="button" className={softButton} onClick={() => toast("קובץ CSV יישלח אל maya@lavana.co.il")}>ייצוא</button>
        <button type="button" className={softButton}>פעולות נוספות</button>
        <button type="button" className={darkButton} onClick={() => setPicker(true)}>יצירת הנחה</button>
      </div>
      <div className="mx-3 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {selected.length === 0 ? (
          <>
            <div className="relative">
              <button type="button" className="h-[30px] rounded-lg border-0 bg-transparent px-2 text-sm font-semibold" onClick={() => setMenu((open) => !open)}>{TABS.find((item) => item.key === tab)?.label}</button>
              {menu ? (
                <div className="absolute top-9 right-0 z-50 w-[180px] rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                  {TABS.map((item) => <button key={item.key} type="button" className="flex w-full rounded-lg border-0 px-2 py-1.5 text-start text-sm" style={{ background: tab === item.key ? "#f1f1f1" : "transparent" }} onClick={() => { setTab(item.key); setMenu(false); }}>{item.label}</button>)}
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
          <div className="flex items-center gap-2 px-1.5">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} className="size-4 accent-[#303030]" />
            <span className="font-semibold">{selected.length} נבחרו</span>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => { deactivateDiscounts(selected); setSelected([]); toast("ההנחות הושבתו"); }}>השבתה</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]" onClick={() => { removeDiscounts(selected); setSelected([]); toast("ההנחות נמחקו"); }}>מחיקה</button>
          </div>
        )}
      </div>
      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-[34px] w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} className="size-4 accent-[#303030]" /></th>
              {["כותרת", "סטטוס", "אופן", "זכאות", "סוג", "שילובים", "שימושים"].map((label) => <th key={label} className="bg-[#f3f3f3] px-2.5 text-start font-semibold whitespace-nowrap">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((discount) => {
              const status = STATUS[discountStatus(discount)];
              const on = selected.includes(discount.id);
              return (
                <tr key={discount.id} className="cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }} onClick={() => router.push(`/admin/discounts/${discount.id}`)}>
                  <td className="px-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSelected((current) => current.includes(discount.id) ? current.filter((id) => id !== discount.id) : [...current, discount.id])} className="size-4 accent-[#303030]" /></td>
                  <td className="px-2.5 py-2 leading-5"><div className="font-medium">{discount.code}</div><div>{discountSummary(discount)}</div></td>
                  <td className="px-2.5"><span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-semibold whitespace-nowrap" style={{ background: status.background, color: status.color }}>{status.label}</span></td>
                  <td className="px-2.5 whitespace-nowrap">{discount.method === "code" ? "קוד" : "אוטומטי"}</td>
                  <td className="px-2.5 whitespace-nowrap">{discount.eligibility === "all" ? "כל הלקוחות" : discount.segment}</td>
                  <td className="px-2.5 whitespace-nowrap">{KIND_LABEL[discount.type]}</td>
                  <td className="px-2.5 text-[#616161]">{[discount.combProduct && "מוצר", discount.combOrder && "הזמנה", discount.combShip && "משלוח"].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 text-left">{discount.uses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="mx-3 flex flex-col items-center gap-2 rounded-b-xl bg-white px-4 py-14 text-center">
          <div className="text-base font-bold">אין הנחות בתצוגה הזו</div>
          <div className="text-ink-secondary">צרו קוד הנחה או הנחה אוטומטית כדי לעודד רכישות.</div>
          <button type="button" className={darkButton} onClick={() => setPicker(true)}>יצירת הנחה</button>
        </div>
      ) : null}
      <div className="min-h-[70px] flex-1" />
      {picker ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setPicker(false)}>
          <div role="dialog" aria-label="בחירת סוג הנחה" className="w-full max-w-[520px] rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">בחירת סוג הנחה</h2>
            <div className="mt-3 flex flex-col gap-2">
              {TYPES.map((type) => (
                <button key={type.key} type="button" className="rounded-xl border-0 bg-[#f7f7f7] px-3 py-3 text-start hover:bg-[#ebebeb]" onClick={() => router.push(`/admin/discounts/new?type=${type.key}`)}>
                  <div className="font-semibold">{type.label}</div>
                  <div className="text-sm text-[#4a4a4a]">{type.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
