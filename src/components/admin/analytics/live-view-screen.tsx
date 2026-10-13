"use client";

import { useState } from "react";
import { LiveGlobe } from "@/components/admin/analytics/live-globe";

const LOCATIONS = [
  ["ישראל · תל אביב · תל אביב-יפו", 201],
  ["ישראל · מחוז המרכז · ראשון לציון", 32],
  ["ישראל · מחוז חיפה · חיפה", 28],
  ["ישראל · מחוז ירושלים · ירושלים", 19],
  ["ישראל · לא ידוע", 12],
];

export function LiveViewScreen() {
  const [cities, setCities] = useState(false);
  return (
    <div className="grid min-h-full min-[1000px]:grid-cols-[500px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5 overflow-y-auto border-e border-[#ebebeb] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[15px] font-bold">צפייה חיה</h1>
          <span className="inline-flex items-center gap-1 text-[13px] text-ink-secondary"><span className="size-[7px] animate-pulse rounded-full bg-[#1fa7e8]" />ממש עכשיו</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[["מבקרים כעת", "8", ""], ["סך המכירות", "₪2,480", "↘ 31%"], ["ביקורים", "518", "↗ 8%"], ["הזמנות", "10", "↘ 9%"]].map(([label, value, delta]) => (
            <div key={label} className="flex min-h-[74px] flex-col justify-end gap-1 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">{label}</span>
              <span className="flex items-center gap-1.5"><b dir="ltr">{value}</b>{delta ? <span dir="ltr" className="text-xs font-semibold text-[#616161]">{delta}</span> : null}</span>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">התנהגות לקוחות</span>
          <div className="mt-2.5 grid grid-cols-3">
            {[["עגלות פעילות", "2", "100%"], ["בתהליך תשלום", "1", "50%"], ["רכשו", "0", "4%"]].map(([label, value, height], index) => (
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
          {LOCATIONS.map(([label, count]) => (
            <div key={String(label)} className="flex flex-col gap-1">
              <span className="text-xs text-ink-secondary">{label}</span>
              <div className="flex items-center gap-2"><div className="h-3 rounded-sm bg-[#1fa7e8]" style={{ width: `${Math.max(4, (Number(count) / 201) * 78)}%` }} /><span className="text-xs text-ink-secondary">{count}</span></div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="self-start text-sm font-semibold underline decoration-dotted underline-offset-[3px]">לקוחות חדשים מול חוזרים</span>
          <div className="flex h-3 overflow-hidden rounded-sm"><div className="w-[78%] bg-[#6b3fe0]" /><div className="w-[22%] bg-[#7fd0f2]" /></div>
          <div className="flex justify-between text-xs text-ink-secondary"><span>חדשים 8</span><span>חוזרים 2</span></div>
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
