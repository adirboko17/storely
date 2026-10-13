"use client";

import type { ChartModel } from "@/lib/dashboard/chart";

export function SalesChart({
  chart,
  rangeLabel,
  onMove,
  onLeave,
}: {
  chart: ChartModel;
  rangeLabel: string;
  onMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
}) {
  return (
    <div className="rounded-xl bg-white px-2 pt-2 pb-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 px-2 pt-2">
        <h2 className="m-0 flex-1 text-[15px] font-bold">{chart.title}</h2>
        <span className="text-[13px] text-ink-secondary">{rangeLabel}</span>
      </div>
      <div dir="ltr" className="grid grid-cols-[56px_minmax(0,1fr)] px-0 pt-5 pr-3">
        <div className="relative h-[200px]">
          {chart.yTicks.map((tick, index) => (
            <div
              key={`${index}-${tick.top}`}
              className="absolute right-2.5 -translate-y-1/2 text-xs whitespace-nowrap text-ink-secondary"
              style={{ top: tick.top }}
            >
              {tick.label}
            </div>
          ))}
        </div>
        <div className="relative h-[200px] cursor-crosshair" onMouseMove={onMove} onMouseLeave={onLeave}>
          {chart.yTicks.map((tick, index) => (
            <div key={`${index}-${tick.top}`} className="absolute inset-x-0 border-t border-[#ebebeb]" style={{ top: tick.top }} />
          ))}
          <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <path d={chart.area} fill="rgba(44,110,203,.07)" />
            <path
              d={chart.previous}
              fill="none"
              stroke="#9cc3ee"
              strokeWidth="2"
              strokeDasharray="2 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={chart.current}
              fill="none"
              stroke="#2c6ecb"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {chart.hasHover ? (
            <>
              <div className="absolute top-0 bottom-0 w-px bg-[#b5b5b5]" style={{ left: chart.hx }} />
              <div
                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2c6ecb] shadow-[0_0_0_1px_#2c6ecb]"
                style={{ left: chart.hx, top: chart.hy }}
              />
              <div
                dir="rtl"
                className="pointer-events-none absolute top-1 flex min-w-[170px] flex-col gap-1 rounded-[10px] bg-white px-3 py-2 text-[13px] shadow-[var(--shadow-popover)]"
                style={{ left: chart.hx, transform: chart.tipTransform }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-3 bg-[#2c6ecb]" />
                  <span className="flex-1 text-ink-secondary">{chart.tipDate}</span>
                  <b dir="ltr">{chart.tipCurrent}</b>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 border-t-2 border-dotted border-[#9cc3ee]" />
                  <span className="flex-1 text-ink-secondary">{chart.tipPrevDate}</span>
                  <b dir="ltr" className="font-semibold text-ink-secondary">
                    {chart.tipPrevious}
                  </b>
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div />
        <div className="flex justify-between pt-2.5 text-xs text-ink-secondary">
          {chart.xTicks.map((tick, index) => (
            <span key={`${index}-${tick}`} dir="rtl">
              {tick}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-6 pt-3.5 text-[13px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 bg-[#2c6ecb]" />
          {chart.currentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dotted border-[#9cc3ee]" />
          {chart.previousLabel}
        </span>
      </div>
    </div>
  );
}
