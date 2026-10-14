"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import type { AttributionChannel } from "@/app/admin/traffic";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

const TYPE_COLORS: Record<string, string> = {
  ישיר: "#1fa7e8",
  ממומן: "#6b3fe0",
  אורגני: "#4f7fe8",
  "לא ידוע": "#d63fb0",
};

function spark(days: number[]) {
  const max = Math.max(...days, 1);
  return days
    .map((value, index) => {
      const x = days.length === 1 ? 0 : (index / (days.length - 1)) * 196;
      const y = 42 - (value / max) * 34;
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function GrowthScreen({ channels }: { channels: AttributionChannel[] }) {
  const router = useRouter();
  const [hero, setHero] = useState(true);
  const sales = channels.reduce((sum, row) => sum + row.sales, 0);
  const orders = channels.reduce((sum, row) => sum + row.orders, 0);
  const visits = channels.reduce((sum, row) => sum + row.visits, 0);
  const byType = ["ישיר", "ממומן", "אורגני", "לא ידוע"].map((label) => ({
    label,
    value: channels.filter((row) => row.type === label).reduce((sum, row) => sum + row.visits, 0),
    color: TYPE_COLORS[label] ?? "#8a8a8a",
  }));
  const knownVisits = byType.reduce((sum, type) => sum + type.value, 0);
  const otherVisits = Math.max(0, visits - knownVisits);
  const types = otherVisits ? [...byType, { label: "אחר", value: otherVisits, color: "#8a8a8a" }] : byType;
  const ranked = [...channels].sort((a, b) => b.sales - a.sales || b.orders - a.orders);
  const days = Array.from({ length: 30 }, (_, index) => channels.reduce((sum, row) => sum + (row.days[index] ?? 0), 0));
  const leader = ranked[0];

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-5 pt-11 pb-24">
      <h1 className="m-0 mb-2.5 text-[26px] leading-8 font-semibold text-[#1a1a1a]">צמיחה</h1>
      {hero ? (
        <div className="relative grid items-center gap-6 pb-7 min-[1000px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start gap-2.5">
            <h2 className="m-0 text-[26px] leading-[34px] font-semibold text-balance text-[#1a1a1a]">מאיפה מגיעות המכירות</h2>
            <p className="m-0 max-w-[470px] leading-[22px] text-pretty">הערוצים ששלחו קונים לחנות ב-30 הימים האחרונים. ישיר, ממומן, אורגני, וכל מקור אחר שנרשם בכניסה.</p>
            <div className="mt-1 flex gap-2">
              <Link href="/admin/growth/attribution" className={darkButton}>לפרטים</Link>
            </div>
          </div>
          <div className="grid place-items-center">
            <div className="flex w-[220px] -rotate-3 flex-col gap-1.5 rounded-xl bg-[#2a2a2a] p-3 shadow-[0_12px_30px_rgba(0,0,0,.18)]">
              <span className="text-[11px] text-[#b5b5b5]">מכירות לפי ערוץ</span>
              <span className="flex items-baseline gap-1.5"><b dir="ltr" className="text-sm text-white">{formatMoney0(sales)}</b></span>
              <svg viewBox="0 0 196 44" width="196" height="44" aria-hidden><path d={spark(days) || "M0,38 L196,38"} fill="none" stroke="#36d399" strokeWidth="2" /></svg>
              <span className="self-start rounded-[10px] bg-[#3a3a3a] px-2 py-0.5 text-[10px] text-[#e3e3e3]">{leader ? leader.channel : "30 הימים האחרונים"}</span>
            </div>
          </div>
          <button type="button" className="absolute top-[-6px] left-0 inline-flex h-7 items-center gap-1.5 rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-[13px] font-semibold" onClick={() => setHero(false)}>הסתרה</button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[15px] font-semibold">ביצועים</h2>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-sm font-semibold">30 הימים האחרונים</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-transparent px-2.5 text-sm font-semibold" onClick={() => router.push("/admin/growth/attribution")}>לפרטים</button>
      </div>
      <div className="grid gap-3.5 min-[1000px]:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="flex items-center"><span className="flex-1 text-sm font-semibold underline decoration-dotted underline-offset-[3px]">מכירות שיוחסו לשיווק</span></div>
          <div className="flex flex-wrap items-baseline gap-1.5"><b dir="ltr" className="text-[22px]">{formatMoney0(sales)}</b><span className="text-sm">מתוך <b>{formatInteger(orders)}</b> הזמנות שיוחסו</span></div>
          <svg viewBox="0 0 400 70" className="mt-2 h-20 w-full" aria-hidden><path d="M0,40 C40,42 80,30 120,34 C160,38 200,22 240,26 C280,30 320,18 360,16 L400,14" fill="none" stroke="#7fd0f2" strokeWidth="1.3" strokeDasharray="2 3" /><path d="M0,48 C40,44 80,36 120,32 C160,28 200,24 240,18 C280,20 320,12 360,10 L400,8" fill="none" stroke="#1fa7e8" strokeWidth="1.6" /></svg>
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">ביקורים לפי סוג תנועה</span>
          <div className="flex flex-wrap gap-5">
            {types.map((type) => (
              <div key={type.label} className="flex flex-col text-xs">
                <span className="flex items-center gap-1.5 text-[#4a4a4a]"><span className="size-2 rounded-full" style={{ background: type.color }} />{type.label}</span>
                <b className="text-[13px]">{formatInteger(type.value)}</b>
              </div>
            ))}
          </div>
          <div className="flex h-14 gap-[3px]">{types.map((type) => <div key={type.label} style={{ width: visits ? `${(type.value / visits) * 100}%` : "0%", background: type.color }} />)}</div>
        </div>
      </div>
      <div className="mt-3.5 flex items-center"><h2 className="m-0 flex-1 text-[15px] font-semibold">מכירות לפי ערוץ שיווק</h2><button type="button" className="border-0 bg-transparent text-sm" onClick={() => router.push("/admin/growth/attribution")}>הצגת הכל</button></div>
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="grid h-[34px] grid-cols-[minmax(0,1.4fr)_110px_90px_110px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]"><span>ערוץ</span><span>סוג</span><span className="text-left">הזמנות</span><span className="text-left">מכירות</span></div>
        {ranked.length === 0 ? <p className="m-0 px-4 py-6 text-sm text-ink-secondary">אין עדיין מכירות מערוצי שיווק</p> : ranked.map((row) => (
          <div key={`${row.channel}-${row.type}`} className="grid grid-cols-[minmax(0,1.4fr)_110px_90px_110px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-3">
            <span className="truncate font-medium">{row.channel}</span>
            <span className="text-[13px] text-[#4a4a4a]">{row.type || "לא ידוע"}</span>
            <span className="text-left">{formatInteger(row.orders)}</span>
            <b dir="ltr" className="text-left">{formatMoney0(row.sales)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
