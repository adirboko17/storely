"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LiveGlobe, visitorCoordinates } from "@/components/admin/analytics/live-globe";
import { getStoreTraffic, subscribeStoreTraffic } from "@/data/live/traffic";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

const grow = "transition-[height,width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

function useCount(value: number) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = shownRef.current;
    if (reduce || from === value) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 720);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (value - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return shown;
}

function CountText({ value, format }: { value: number; format: (value: number) => string }) {
  const shown = useCount(value);
  return (
    <b dir="ltr" className="tabular-nums">
      {format(shown)}
    </b>
  );
}

export function LiveViewScreen() {
  const [cities, setCities] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const traffic = useSyncExternalStore(subscribeStoreTraffic, getStoreTraffic, getStoreTraffic);
  const settingsVersion = useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const now = traffic.now;
  const visitorTotal = now.newVisitors + now.returningVisitors;
  const newWidth = visitorTotal ? (now.newVisitors / visitorTotal) * 100 : 0;
  const funnelMax = Math.max(now.carts, now.checkouts, now.purchased, 1);
  const locationMax = Math.max(...now.locations.map((place) => place.count), 1);
  const visitors = useMemo(
    () =>
      now.locations.flatMap((place) => {
        const coordinates = visitorCoordinates(place.label);
        return coordinates && place.count > 0 ? [{ name: place.label, coordinates }] : [];
      }),
    [now.locations],
  );
  const store = useMemo(() => {
    const address = getSettings().profiles.map((profile) => `${profile.location?.name ?? ""} ${profile.location?.address ?? ""}`).join(" ");
    const coordinates = visitorCoordinates(address) ?? visitorCoordinates("תל אביב");
    return coordinates ? { name: "החנות", coordinates } : null;
  }, [settingsVersion]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="grid min-h-full min-[1000px]:h-[calc(100dvh-0.75rem)] min-[1000px]:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] min-[1000px]:overflow-hidden">
      <div className="flex flex-col gap-2.5 overflow-y-auto border-e border-[#ebebeb] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[15px] font-bold">צפייה חיה</h1>
          <span className="inline-flex items-center gap-1 text-[13px] text-ink-secondary">
            <span className="size-[7px] animate-pulse rounded-full bg-[#1fa7e8]" />
            ממש עכשיו
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              ["מבקרים כעת", now.visitors, formatInteger],
              ["סך המכירות", now.sales, formatMoney0],
              ["ביקורים", now.visits, formatInteger],
              ["הזמנות", now.orders, formatInteger],
            ] as const
          ).map(([label, value, format]) => (
            <div key={label} className="flex min-h-[74px] flex-col justify-end gap-1 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">{label}</span>
              <span className="flex items-center gap-1.5">
                <CountText value={value} format={format} />
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">התנהגות לקוחות</span>
          <div className="mt-2.5 grid grid-cols-3">
            {(
              [
                ["עגלות פעילות", now.carts],
                ["בתהליך תשלום", now.checkouts],
                ["רכשו", now.purchased],
              ] as const
            ).map(([label, value], index) => (
              <div key={label} className="flex flex-col gap-0.5 px-2.5" style={{ borderInlineStart: index ? "1px solid #ebebeb" : undefined }}>
                <span className="text-[13px] text-[#4a4a4a]">{label}</span>
                <CountText value={value} format={formatInteger} />
                <div className="mt-7 flex h-[110px] items-end">
                  <div className={`w-full rounded-t-sm bg-[#2a5bd7] ${grow}`} style={{ height: drawn ? `${(value / funnelMax) * 100}%` : "0%" }} />
                </div>
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
              <div className="flex items-center gap-2">
                <div className={`h-3 rounded-sm bg-[#1fa7e8] ${grow}`} style={{ width: drawn ? `${Math.max(4, (place.count / locationMax) * 78)}%` : "0%" }} />
                <span className="text-xs text-ink-secondary">
                  <CountText value={place.count} format={formatInteger} />
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="self-start text-sm font-semibold underline decoration-dotted underline-offset-[3px]">לקוחות חדשים מול חוזרים</span>
          <div className="flex h-3 overflow-hidden rounded-sm bg-[#f1f1f1]">
            <div className={`h-full bg-[#2a5bd7] ${grow}`} style={{ width: drawn ? `${newWidth}%` : "0%" }} />
            <div className={`h-full bg-[#8eb8f5] ${grow}`} style={{ width: drawn && visitorTotal ? `${100 - newWidth}%` : "0%" }} />
          </div>
          <div className="flex justify-between text-xs text-ink-secondary">
            <span className="inline-flex items-center gap-1">
              חדשים <CountText value={now.newVisitors} format={formatInteger} />
            </span>
            <span className="inline-flex items-center gap-1">
              חוזרים <CountText value={now.returningVisitors} format={formatInteger} />
            </span>
          </div>
        </div>
      </div>
      <div className="relative hidden min-h-[70vh] overflow-hidden bg-white min-[1000px]:block min-[1000px]:min-h-0">
        <LiveGlobe labels={cities} visitors={visitors} store={store} />
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
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 bg-[#2f9ed4]" style={{ clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }} />
            מבקרים כעת
          </span>
        </div>
      </div>
    </div>
  );
}
