"use client";

import { useState, useSyncExternalStore } from "react";
import { LiveGlobe } from "@/components/admin/analytics/live-globe";
import { getStoreTraffic, subscribeStoreTraffic } from "@/data/live/traffic";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

export function LiveViewScreen() {
  const [cities, setCities] = useState(false);
  const traffic = useSyncExternalStore(subscribeStoreTraffic, getStoreTraffic, getStoreTraffic);
  const now = traffic.now;
  const visitorTotal = now.newVisitors + now.returningVisitors;
  const newWidth = visitorTotal ? (now.newVisitors / visitorTotal) * 100 : 0;
  const funnelMax = Math.max(now.carts, now.checkouts, now.purchased, 1);
  const locationMax = Math.max(...now.locations.map((place) => place.count), 1);
  return (
    <div className="grid min-h-full min-[1000px]:grid-cols-[500px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5 overflow-y-auto border-e border-[#ebebeb] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[15px] font-bold">צפייה חיה</h1>
          <span className="inline-flex items-center gap-1 text-[13px] text-ink-secondary"><span className="size-[7px] animate-pulse rounded-full bg-[#1fa7e8]" />ממש עכשיו</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ["מבקרים כעת", formatInteger(now.visitors)],
            ["סך המכירות", formatMoney0(now.sales)],
            ["ביקורים", formatInteger(now.visits)],
            ["הזמנות", formatInteger(now.orders)],
          ].map(([label, value]) => (
            <div key={label} className="flex min-h-[74px] flex-col justify-end gap-1 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">{label}</span>
              <span className="flex items-center gap-1.5"><b dir="ltr">{value}</b></span>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">התנהגות לקוחות</span>
          <div className="mt-2.5 grid grid-cols-3">
            {[
              ["עגלות פעילות", formatInteger(now.carts), `${(now.carts / funnelMax) * 100}%`],
              ["בתהליך תשלום", formatInteger(now.checkouts), `${(now.checkouts / funnelMax) * 100}%`],
              ["רכשו", formatInteger(now.purchased), `${(now.purchased / funnelMax) * 100}%`],
            ].map(([label, value, height], index) => (
              <div key={label} className="flex flex-col gap-0.5 px-2.5" style={{ borderInlineStart: index ? "1px solid #ebebeb" : undefined }}>
                <span className="text-[13px] text-[#4a4a4a]">{label}</span>
                <b>{value}</b>
                <div className="mt-7 flex h-[110px] items-end"><div className="w-full rounded-t-sm bg-[#2a5bd7]" style={{ height }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="self-start text-sm font-semibold underline decoration-dotted underline-offset-[3px]">ביקורים לפי מיקום</span>
          {now.locations.length === 0 ? <p className="m-0 text-sm text-ink-secondary">אין ביקורים כרגע</p> : null}
          {now.locations.map((place) => (
            <div key={place.label} className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">{place.label}</span>
              <div className="flex items-center gap-2"><div className="h-3 rounded-sm bg-[#1fa7e8]" style={{ width: `${Math.max(4, (place.count / locationMax) * 78)}%` }} /><span className="text-xs text-ink-secondary">{formatInteger(place.count)}</span></div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="self-start text-sm font-semibold underline decoration-dotted underline-offset-[3px]">לקוחות חדשים מול חוזרים</span>
          <div className="flex h-3 overflow-hidden rounded-sm bg-[#f1f1f1]">
            <div className="h-full bg-[#2a5bd7]" style={{ width: `${newWidth}%` }} />
            <div className="h-full bg-[#8eb8f5]" style={{ width: `${visitorTotal ? 100 - newWidth : 0}%` }} />
          </div>
          <div className="flex justify-between text-xs text-ink-secondary"><span>חדשים {formatInteger(now.newVisitors)}</span><span>חוזרים {formatInteger(now.returningVisitors)}</span></div>
        </div>
      </div>
      <div className="relative hidden min-h-[640px] overflow-hidden bg-white min-[1000px]:block">
        <LiveGlobe labels={cities} />
        <div className="absolute top-3 left-3 z-20 flex gap-1.5">
          <div className="flex h-[34px] w-[280px] items-center gap-2 rounded-[10px] bg-white px-2.5 text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.12)]">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.5-3.5" />
            </svg>
            <input placeholder="חיפוש מיקום" className="min-w-0 flex-1 border-0 text-sm outline-none" style={{ backgroundColor: "transparent", color: "#303030" }} />
          </div>
          <button type="button" aria-label="הצגת ערים" aria-pressed={cities} className="grid size-[34px] place-items-center rounded-[10px] border-0 bg-[#f1f1f1] text-ink" onClick={() => setCities((value) => !value)}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z" />
              <circle cx="10" cy="10" r="2.2" />
            </svg>
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-14 z-20 flex gap-4 text-xs text-[#8a8a8a]">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#6b3fe0] opacity-60" />הזמנות</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#7fd0f2]" />מבקרים כעת</span>
        </div>
      </div>
    </div>
  );
}
