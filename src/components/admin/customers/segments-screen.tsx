"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { customerSpent } from "@/components/admin/customers/customers-list-screen";
import { getPeopleVersion, listPeople, profileOf, subscribePeople } from "@/data/mock/people-session";
import { getOrderSessionVersion, subscribeOrderSession } from "@/data/mock/order-session";
import { formatMoney } from "@/lib/formatting/money";

const SAVED = [
  { name: "לקוחות VIP", minSpent: "1500", minOrders: "5", subOnly: false },
  { name: "מנויים לדיוור", minSpent: "0", minOrders: "0", subOnly: true },
  { name: "לקוחות חדשים", minSpent: "0", minOrders: "1", subOnly: false },
  { name: "רכשו יותר מפעמיים", minSpent: "0", minOrders: "3", subOnly: false },
];

export function SegmentsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const people = listPeople();
  const [name, setName] = useState("לקוחות VIP");
  const [minSpent, setMinSpent] = useState("1500");
  const [minOrders, setMinOrders] = useState("5");
  const [subOnly, setSubOnly] = useState(false);
  const [savedName, setSavedName] = useState("לקוחות VIP");

  const rows = people
    .map((person) => ({ person, profile: profileOf(person), spent: customerSpent(person.id, person.orders) }))
    .filter((row) => row.spent >= Number(minSpent || 0) && row.person.orders >= Number(minOrders || 0) && (!subOnly || row.profile.subscribed));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">פלחי לקוחות</h1>
        <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={() => { setName("פלח חדש"); setMinSpent("0"); setMinOrders("0"); setSubOnly(false); }}>יצירת פלח</button>
      </div>
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07),0_1px_0_rgba(26,26,26,.07)]">
          <div className="bg-[#f7f7f7] px-4 py-3 text-[13px] font-semibold text-ink-secondary">פלחים שמורים</div>
          {SAVED.map((item) => (
            <button key={item.name} type="button" className="flex w-full items-center gap-2 border-0 border-t border-[#ebebeb] px-4 py-3 text-start text-sm" style={{ background: savedName === item.name ? "#f1f1f1" : "#fff", fontWeight: savedName === item.name ? 600 : 400 }} onClick={() => { setName(item.name); setMinSpent(item.minSpent); setMinOrders(item.minOrders); setSubOnly(item.subOnly); setSavedName(item.name); }}>
              <span className="flex-1">{item.name}</span>
            </button>
          ))}
          {savedName && !SAVED.some((item) => item.name === savedName) ? <div className="border-t border-[#ebebeb] px-4 py-3 text-sm font-semibold">{savedName}</div> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
            <label className="block font-medium">שם הפלח<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-sm font-normal outline-none" /></label>
            <div className="font-semibold">תנאים</div>
            <div className="grid items-center gap-2 rounded-[10px] border border-[#e3e3e3] px-3 py-2 min-[700px]:grid-cols-[minmax(0,1fr)_auto_140px]">
              <span>סכום שהוצא</span><span className="text-[13px] text-ink-secondary">לפחות</span>
              <input dir="ltr" value={minSpent} onChange={(event) => setMinSpent(event.target.value)} className="h-8 rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-end text-sm outline-none" />
            </div>
            <div className="grid items-center gap-2 rounded-[10px] border border-[#e3e3e3] px-3 py-2 min-[700px]:grid-cols-[minmax(0,1fr)_auto_140px]">
              <span>מספר הזמנות</span><span className="text-[13px] text-ink-secondary">לפחות</span>
              <input dir="ltr" type="number" min={0} value={minOrders} onChange={(event) => setMinOrders(event.target.value)} className="h-8 rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-end text-sm outline-none" />
            </div>
            <label className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] p-3"><input type="checkbox" checked={subOnly} onChange={(event) => setSubOnly(event.target.checked)} className="size-4 accent-[#303030]" />רק לקוחות שמנויים לדיוור בדוא״ל</label>
            <code dir="ltr" className="block rounded-lg bg-[#f7f7f7] p-2 text-left text-xs">{`spent >= ${minSpent || 0} AND orders >= ${minOrders || 0}${subOnly ? " AND subscribed" : ""}`}</code>
            <div className="flex justify-end gap-2">
              <button type="button" className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_#d4d4d4]" onClick={() => toast("שליחת קמפיין לפלח תתווסף בהמשך")}>שליחת קמפיין לפלח</button>
              <button type="button" className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white" onClick={() => { if (!name.trim()) { toast("יש להזין שם לפלח"); return; } setSavedName(name.trim()); toast("הפלח נשמר"); }}>שמירת פלח</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(26,26,26,.07)]">
            <div className="flex items-baseline gap-2 px-4 pt-4 pb-3"><h2 className="m-0 text-[15px] font-bold">{rows.length} לקוחות</h2><span className="text-[13px] text-ink-secondary">{people.length ? Math.round((rows.length / people.length) * 100) : 0}% מכלל הלקוחות</span></div>
            {rows.length === 0 ? <div className="border-t border-[#ebebeb] px-4 py-8 text-center text-ink-secondary">אף לקוח לא עונה על התנאים. נסו להרחיב אותם.</div> : rows.map((row) => (
              <button key={row.person.id} type="button" className="grid h-11 w-full grid-cols-[minmax(0,1fr)_110px_90px_100px] items-center gap-2 border-0 border-t border-[#ebebeb] bg-white px-4 text-start text-sm hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/customers/${row.person.id}`)}>
                <span className="font-semibold">{row.person.name}</span>
                <span className="text-ink-secondary">{row.person.city}</span>
                <span>{row.person.orders}</span>
                <span dir="ltr" className="text-left">{formatMoney(row.spent)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
