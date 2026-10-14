"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { formatInteger, formatMoney, formatMoney0 } from "@/lib/formatting/money";
import type { BreakdownRow, Delta, FunnelStep, NamedValue } from "@/lib/analytics/overview";

const ChartClock = createContext(0);
const PanelDelay = createContext(0);

function easeOut(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
}

export function ChartMotion({ children }: { children: ReactNode }) {
  const [elapsed, setElapsed] = useState(0);

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setElapsed(20_000);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = now - start;
      setElapsed(next);
      if (next < 2200) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ChartClock.Provider value={elapsed}>
      <style>{`
        @keyframes analytics-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        .analytics-rise { animation: analytics-rise 680ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .analytics-rise { animation: none; }
        }
      `}</style>
      {children}
    </ChartClock.Provider>
  );
}

function useProgress(extra = 0) {
  const elapsed = useContext(ChartClock);
  const delay = useContext(PanelDelay);
  return easeOut((elapsed - delay - extra) / 980);
}

const card = "flex min-h-[300px] flex-col rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]";

export function Panel({ title, info, className, delay = 0, children }: { title: string; info?: string; className?: string; delay?: number; children: ReactNode }) {
  return (
    <section className={`${card} analytics-rise ${className ?? ""}`} style={{ animationDelay: `${delay}ms` }}>
      <PanelDelay.Provider value={delay}>
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="m-0 text-[13px] font-semibold text-[#303030]">{title}</h2>
        {info ? (
          <span title={info} className="grid size-4 place-items-center text-[#8a8a8a]">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="10" cy="10" r="7" />
              <path d="M10 9.2V14" strokeLinecap="round" />
              <circle cx="10" cy="6.6" r="0.7" fill="currentColor" stroke="none" />
            </svg>
          </span>
        ) : null}
      </div>
      {children}
      </PanelDelay.Provider>
    </section>
  );
}

export function Change({ value }: { value: Delta }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs font-semibold text-[#8a8a8a]">—</span>;
  const up = value > 0.5;
  const down = value < -0.5;
  const color = up ? "#1f7a4d" : down ? "#c4314b" : "#616161";
  return (
    <span dir="ltr" className="text-xs font-semibold" style={{ color }}>
      {up ? "↗" : down ? "↘" : ""} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Headline({ value, delta, format }: { value: number; delta: Delta; format: "money" | "percent" | "integer" }) {
  const shown = value * useProgress();
  const text = format === "money" ? formatMoney(shown) : format === "percent" ? `${shown.toFixed(1)}%` : formatInteger(shown);
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <b className="text-[22px] leading-7 font-semibold" dir="ltr">{text}</b>
      <Change value={delta} />
    </div>
  );
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * exponent;
}

function smooth(values: number[], max: number) {
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 96 - (Math.max(0, value) / max) * 88;
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LineChart({
  current,
  previous,
  total,
  delta,
  currentLabel,
  previousLabel,
  format,
  axis = ["00:00", "06:00", "12:00", "18:00"],
}: {
  current: number[];
  previous: number[];
  total: number;
  delta: Delta;
  currentLabel: string;
  previousLabel: string;
  format: "money" | "percent" | "integer";
  axis?: string[];
}) {
  const draw = useProgress();
  const previousDraw = useProgress(140);
  const max = niceMax(Math.max(...current, ...previous, 0));
  const ticks = [max, max / 2, 0];
  const showPrevious = previous.some((value) => value > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Headline value={total} delta={delta} format={format} />
      <div dir="ltr" className="grid min-h-[180px] flex-1 grid-cols-[44px_minmax(0,1fr)]">
        <div className="relative">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-1 -translate-y-1/2 text-[11px] text-[#8a8a8a]" style={{ top: `${tick === max ? 8 : tick === 0 ? 92 : 50}%` }}>
              {format === "percent" ? `${Math.round(tick)}%` : tick >= 1000 ? `${Math.round(tick / 1000)}K` : Math.round(tick)}
            </span>
          ))}
        </div>
        <div className="relative">
          {ticks.map((tick) => (
            <div key={tick} className="absolute inset-x-0 border-t border-[#f1f1f1]" style={{ top: `${tick === max ? 8 : tick === 0 ? 92 : 50}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {showPrevious ? <path d={smooth(previous, max)} fill="none" stroke="#9cc3ee" strokeWidth="1.6" pathLength={1} strokeDasharray={previousDraw > 0.98 ? "0.012 0.014" : "1"} strokeDashoffset={previousDraw > 0.98 ? 0 : 1 - previousDraw} vectorEffect="non-scaling-stroke" /> : null}
            <path d={smooth(current, max)} fill="none" stroke="#2c6ecb" strokeWidth="2" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
      <div dir="ltr" className="mt-1 grid ps-11 text-[11px] text-[#8a8a8a]" style={{ gridTemplateColumns: `repeat(${axis.length}, minmax(0, 1fr))` }}>
        {axis.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
      <div className="mt-2 flex justify-center gap-4 text-[12px] text-[#616161]">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 rounded bg-[#2c6ecb]" /><bdi>{currentLabel}</bdi></span>
        {showPrevious ? <span className="inline-flex items-center gap-1.5"><i className="w-3 border-t border-dotted border-[#9cc3ee]" /><bdi>{previousLabel}</bdi></span> : null}
      </div>
    </div>
  );
}

export function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  const progress = useProgress();
  return (
    <div className="-mx-4 -mb-4 mt-1">
      {rows.map((row, index) => (
        <div key={row.label} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={{ background: index % 2 ? "#f6f6f7" : "#fff", fontWeight: row.strong ? 700 : 400 }}>
          <span className="flex-1">{row.label}</span>
          <b dir="ltr" className="font-semibold">{formatMoney(row.value * progress)}</b>
          <span className="w-14 text-end"><Change value={row.delta} /></span>
        </div>
      ))}
    </div>
  );
}

const DONUT_COLORS = ["#2c6ecb", "#47c1bf", "#7c5cfc", "#9cc3ee"];

export function Donut({ rows, center }: { rows: NamedValue[]; center: string }) {
  const progress = useProgress();
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-1 items-center gap-4">
      <svg viewBox="0 0 120 120" className="size-[150px] shrink-0">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f1f1" strokeWidth="14" />
        {rows.map((row, index) => {
          const length = total ? (row.value / total) * circumference * progress : 0;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle key={row.label} cx="60" cy="60" r={radius} fill="none" stroke={DONUT_COLORS[index % DONUT_COLORS.length]} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += length;
          return element;
        })}
        <text x="60" y="64" textAnchor="middle" fill="#303030" fontSize="13" fontWeight="600">{center}</text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center gap-2 text-[13px]">
            <i className="size-2.5 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <b dir="ltr">{formatMoney0(row.value * progress)}</b>
            <Change value={row.delta} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bars({ rows, money = false, percent = false }: { rows: NamedValue[]; money?: boolean; percent?: boolean }) {
  const progress = useProgress();
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      {rows.map((row, index) => {
        const grown = easeOut((progress - index * 0.08) / 0.82);
        const value = row.value * grown;
        return (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[13px] text-[#303030]">{row.label}</span>
            <span className="flex items-center gap-2 text-[13px]">
              <b dir="ltr">{percent ? `${value.toFixed(1)}%` : money ? formatMoney0(value) : formatInteger(value)}</b>
              <Change value={row.delta} />
            </span>
            <div className="col-span-2 h-2.5 overflow-hidden rounded-sm bg-[#f3f3f3]">
              <div className="h-full rounded-sm bg-[#2c9bdb]" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const progress = useProgress();
  const max = steps[0]?.count || 1;
  return (
    <div className="grid flex-1 grid-cols-3 items-end gap-2">
      {steps.map((step, index) => {
        const grown = easeOut((progress - index * 0.12) / 0.7);
        const height = Math.max(8, (step.count / max) * 120) * grown;
        return (
          <div key={step.label} className="flex h-full flex-col" style={{ borderInlineStart: index ? "1px solid #ebebeb" : undefined, paddingInlineStart: index ? 8 : 0 }}>
            <span className="text-[13px] text-[#4a4a4a]">{step.label}</span>
            <span className="text-sm text-[#616161]" dir="ltr">{(step.rate * grown).toFixed(1)}%</span>
            <span className="mt-1 flex items-center gap-1"><b dir="ltr">{formatInteger(step.count * grown)}</b><Change value={step.delta} /></span>
            <div className="mt-3 flex flex-1 items-end">
              <div className="w-full rounded-t-sm bg-[#2a5bd7]" style={{ height: `${height}px`, opacity: 1 - index * 0.18 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Cohort({ label, customers, rate }: { label: string; customers: number; rate: number | null }) {
  const progress = useProgress();
  const shown = rate == null ? null : rate * progress;
  const tone = shown == null ? "#f3f3f3" : `rgba(44, 110, 203, ${(0.15 + Math.min(shown, 40) / 50) * Math.max(progress, 0.2)})`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-[#616161]">
            <th className="px-2 py-2 text-start font-medium">קבוצה</th>
            <th className="px-2 py-2 text-start font-medium">לקוחות</th>
            <th className="px-2 py-2 text-start font-medium">חודשים</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-2">{label}</td>
            <td className="px-2 py-2" dir="ltr">{formatInteger(customers * progress)}</td>
            <td className="px-2 py-2">
              <span className="inline-flex min-w-16 justify-center rounded px-2 py-1 font-semibold text-[#0b2545]" style={{ background: tone, transform: `scale(${0.86 + progress * 0.14})` }} dir="ltr">
                {shown == null ? "—" : `${shown.toFixed(1)}%`}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Marketing({ rows }: { rows: Array<{ label: string; value: number; color: string }> }) {
  const progress = useProgress();
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      {rows.map((row, index) => {
        const grown = easeOut((progress - index * 0.1) / 0.8);
        const value = row.value * grown;
        return (
          <div key={row.label} className="flex items-center gap-2 text-[13px]">
            <span className="w-16 shrink-0">{row.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-[#f3f3f3]">
              <div className="h-full rounded-sm" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: row.color }} />
            </div>
            <b dir="ltr">{formatMoney0(value)}</b>
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#616161]">
        {rows.map((row) => (
          <span key={row.label} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: row.color }} />{row.label}</span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState() {
  return <div className="grid flex-1 place-items-center text-sm text-[#616161]">אין נתונים לטווח התאריכים</div>;
}

export function hasValues(rows: Array<{ value: number }>) {
  return rows.some((row) => row.value > 0);
}
