"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { IndexDock, darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getPeopleVersion, listPeople, profileOf, subscribePeople } from "@/data/mock/people-session";
import { customerOrderCount, getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import { formatMoney } from "@/lib/formatting/money";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

export function customerSpent(customerId: number, _orderCount: number) {
  return listResolvedOrders()
    .filter((order) => order.customer.id === customerId)
    .reduce((sum, order) => sum + order.total, 0);
}

export function CustomersListScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const people = listPeople();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const rows = useMemo(() => {
    return people
      .map((person) => {
        const profile = profileOf(person);
        const orders = customerOrderCount(person.id);
        const spent = customerSpent(person.id, orders);
        return { person, profile, spent, orders };
      })
      .filter((row) => {
        const needle = query.trim();
        if (needle && !`${row.person.name} ${row.person.email} ${row.person.city}`.includes(needle)) return false;
        if (applied.includes("יותר מפעמיים") && row.orders <= 2) return false;
        if (applied.includes("VIP") && row.spent < 1500 && !row.profile.tags.includes("VIP")) return false;
        if (applied.includes("דיוור") && !row.profile.subscribed) return false;
        return true;
      });
  }, [people, query, applied]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.person.id));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="user" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">לקוחות</h1>
        <button type="button" className={softButton} onClick={() => toast(`קובץ CSV יישלח אל ${getStoreIdentity().ownerEmail}`)}>ייצוא</button>
        <button type="button" className={softButton}>ייבוא</button>
        <button type="button" className={softButton}>פעולות נוספות</button>
        <Link href="/admin/customers/new" className={darkButton}>הוספת לקוח</Link>
      </div>
      <div className="mx-3 flex min-h-[46px] items-center gap-2 rounded-[14px] bg-white px-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <input value={segment} onChange={(event) => setSegment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setApplied(segment.trim()); }} placeholder="תארו את הפלח שאתם מחפשים, למשל: לקוחות שקנו יותר מפעמיים" className="h-9 min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
        <button type="button" aria-label="הצגה" className="grid size-7 place-items-center rounded-lg border-0 bg-[#f1f1f1]" onClick={() => setApplied(segment.trim())}>
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
        </button>
      </div>
      {applied ? (
        <div className="mx-3 mt-2 flex items-center gap-2 text-[13px] text-[#4a4a4a]">
          <span className="inline-flex h-5 items-center rounded-md bg-[#ede7fb] px-[7px] font-medium text-[#5b3fc4]">{applied}</span>
          <button type="button" className="border-0 bg-transparent p-0 text-[13px] text-[#005bd3]" onClick={() => { setApplied(""); setSegment(""); }}>ניקוי</button>
        </div>
      ) : null}
      <div className="mx-3 mt-2.5 flex min-h-[42px] flex-wrap items-center gap-2 rounded-[14px] bg-white px-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {selected.length === 0 ? (
          <>
            <Icon name="search" size={16} strokeWidth={1.8} className="text-ink-secondary" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לקוחות" className="h-[30px] min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
          </>
        ) : (
          <>
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.person.id))} className="size-4 accent-[#303030]" />
            <span className="font-semibold">{selected.length} נבחרו</span>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => toast("התגיות נוספו ללקוחות שנבחרו")}>הוספת תגיות</button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => { toast("הפלח נוצר מהבחירה"); router.push("/admin/customers/segments"); }}>יצירת פלח מהבחירה</button>
          </>
        )}
      </div>
      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-8 w-10 rounded-s-[10px] bg-[#f3f3f3] px-2.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.person.id))} className="size-4 accent-[#303030]" /></th>
              <th className="w-[32%] bg-[#f3f3f3] px-2.5 text-start font-semibold">שם הלקוח</th>
              <th className="bg-[#f3f3f3] px-2.5 text-start font-semibold">דיוור בדוא״ל</th>
              <th className="bg-[#f3f3f3] px-2.5 text-start font-semibold underline decoration-dotted underline-offset-[3px]">מיקום</th>
              <th className="bg-[#f3f3f3] px-2.5 text-center font-semibold">הזמנות</th>
              <th className="rounded-e-[10px] bg-[#f3f3f3] px-4 text-end font-semibold">סכום שהוצא</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.includes(row.person.id);
              return (
                <tr key={row.person.id} className="h-[33px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" style={{ background: on ? "#f1f1f1" : "#fff" }} onClick={() => router.push(`/admin/customers/${row.person.id}`)}>
                  <td className="px-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={on} onChange={() => setSelected((current) => current.includes(row.person.id) ? current.filter((id) => id !== row.person.id) : [...current, row.person.id])} className="size-4 accent-[#303030]" /></td>
                  <td dir="auto" className="px-2.5 text-right font-medium">{row.person.name}</td>
                  <td className="px-2.5"><span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium" style={{ background: row.profile.subscribed ? "#cdfee1" : "#e3e3e3", color: row.profile.subscribed ? "#0c5132" : "#616161" }}>{row.profile.subscribed ? "מנוי" : "לא מנוי"}</span></td>
                  <td className="px-2.5 whitespace-nowrap">{row.person.city ? `${row.person.city}, ישראל` : "ישראל"}</td>
                  <td className="px-2.5 text-center">{row.orders}</td>
                  <td dir="ltr" className="px-4 text-left whitespace-nowrap">{formatMoney(row.spent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="mx-3 flex flex-col items-center gap-2 rounded-b-xl bg-white px-4 py-12 text-center text-ink-secondary">
          לא נמצאו לקוחות.
          <button type="button" className={softButton} onClick={() => { setQuery(""); setApplied(""); setSegment(""); }}>ניקוי חיפוש</button>
        </div>
      ) : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
    </div>
  );
}
