"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  METRIC_CATALOG,
  buildMetricChart,
  type MetricCard,
  type MetricId,
  type RangeId,
} from "@/lib/dashboard/chart";

const CURRENT = "#14b4dc";
const PREVIOUS = "#9ed4ea";

function placeBox(anchor: HTMLElement, height: number) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(560, window.innerWidth - 24);
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  let top = rect.bottom + 2;
  if (top + height > window.innerHeight - 12 && rect.top > height + 16) {
    top = rect.top - height - 2;
  }
  return { top, left, width };
}

function MetricGlyph({ kind }: { kind: "line" | "bars" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0 text-ink-secondary" aria-hidden>
      {kind === "bars" ? (
        <path d="M3.5 12.5v-4M8 12.5v-8M12.5 12.5V6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M2 11.2 5.6 7.4 8.4 10l5.6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function MetricPreview({
  anchor,
  card,
  range,
  picker,
  used,
  onOpenPicker,
  onPick,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: {
  anchor: HTMLElement;
  card: MetricCard;
  range: RangeId;
  picker: boolean;
  used: MetricId[];
  onOpenPicker: () => void;
  onPick: (id: MetricId) => void;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [box, setBox] = useState(() => placeBox(anchor, picker ? 500 : 430));

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  const chart = useMemo(
    () =>
      buildMetricChart(range, card.id, hover, {
        cutoff: range === "1" && hour != null ? hour : null,
        smooth: true,
        tickCount: range === "1" ? 8 : 5,
        ySteps: 3,
      }),
    [range, card.id, hover, hour],
  );

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => setBox(placeBox(anchor, panel.offsetHeight));
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, picker, card.id, query, range]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const filtered = METRIC_CATALOG.filter((item) => {
    const text = query.trim();
    if (!text) return true;
    return item.label.includes(text) || item.description.includes(text);
  });
  const rows = Math.max(1, Math.ceil(filtered.length / 2));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={picker ? "בחירת מדד" : card.title}
      dir="rtl"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className="fixed z-[70] rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08),0_18px_50px_rgba(0,0,0,.16)]"
      style={{ top: box.top, left: box.left, width: box.width, animation: "metric-pop 160ms ease-out" }}
    >
      {picker ? (
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="m-0 flex-1 text-[15px] font-semibold text-ink-strong">בחירת מדד</h2>
            <button
              type="button"
              aria-label="סגירה"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1] hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg px-2.5 shadow-[inset_0_0_0_1px_#8a8a8a]">
            <Icon name="search" size={16} className="text-ink-secondary" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש מדדים"
              className="h-full w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-secondary"
            />
          </label>
          {filtered.length === 0 ? (
            <p className="m-0 py-10 text-center text-sm text-ink-secondary">אין מדדים שמתאימים לחיפוש</p>
          ) : (
            <div
              className="mt-2 grid max-h-[360px] grid-cols-2 gap-x-2 overflow-y-auto"
              style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, minmax(0, auto))` }}
            >
              {filtered.map((item) => {
                const selected = item.id === card.id;
                const taken = used.includes(item.id) && !selected;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={taken}
                    title={taken ? "המדד כבר מוצג למעלה" : item.description}
                    onClick={() => onPick(item.id)}
                    className="flex h-9 items-center gap-2 rounded-lg px-2 text-start text-[13px] text-ink enabled:hover:bg-[#f1f1f1] disabled:cursor-default disabled:text-ink-secondary"
                    style={{ background: selected ? "#f1f1f1" : "transparent" }}
                  >
                    <MetricGlyph kind={item.icon} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected ? <Icon name="check" size={16} strokeWidth={1.8} /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span dir="ltr" className="text-[28px] leading-8 font-bold tracking-tight text-ink-strong">
                  {card.value}
                </span>
                <span
                  dir="ltr"
                  className="text-xl leading-7 font-semibold"
                  style={{ color: card.positive ? "#1f7a4d" : "#d72c0d" }}
                >
                  {card.delta}
                </span>
              </div>
              <h2 className="m-0 mt-3 text-[13px] font-bold text-ink-strong">{card.title}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">{card.description}</p>
            </div>
            <button
              type="button"
              aria-label="החלפת מדד"
              onClick={onOpenPicker}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1] hover:text-ink"
            >
              <Icon name="pencil" size={16} strokeWidth={1.6} />
            </button>
          </div>

          <div dir="ltr" className="mt-4 grid grid-cols-[52px_minmax(0,1fr)]">
            <div className="relative h-[200px]">
              {chart.yTicks.map((tick) => (
                <div
                  key={`${tick.top}-${tick.label}`}
                  className="absolute right-1 -translate-y-1/2 text-[11px] whitespace-nowrap text-[#8a8a8a]"
                  style={{ top: tick.top }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
            <div
              className="relative h-[200px]"
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                const limit = range === "1" && hour != null ? hour : chart.pointCount - 1;
                const index = Math.min(limit, Math.round(ratio * (chart.pointCount - 1)));
                setHover((current) => (current === index ? current : index));
              }}
              onMouseLeave={() => setHover(null)}
            >
              {chart.yTicks.map((tick) => (
                <div key={`${tick.top}-${tick.label}`} className="absolute inset-x-0 border-t border-[#f1f1f1]" style={{ top: tick.top }} />
              ))}
              <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                <path d={chart.area} fill="rgba(20,180,220,.08)" />
                <path
                  d={chart.previous}
                  fill="none"
                  stroke={PREVIOUS}
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={chart.current}
                  fill="none"
                  stroke={CURRENT}
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span title={card.description} className="absolute top-0 right-0 text-[#b5b5b5]">
                <Icon name="info" size={16} strokeWidth={1.6} />
              </span>
              {chart.hasHover ? (
                <>
                  <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#c9c9c9]" style={{ left: chart.hx }} />
                  <div
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#14b4dc] shadow-[0_0_0_1px_#14b4dc]"
                    style={{ left: chart.hx, top: chart.hy }}
                  />
                  <div
                    dir="rtl"
                    className="pointer-events-none absolute top-1 z-10 flex min-w-[168px] flex-col gap-1 rounded-[10px] bg-white px-3 py-2 text-[13px] shadow-[var(--shadow-popover)]"
                    style={{ left: chart.hx, transform: chart.tipTransform }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: CURRENT }} />
                      <span className="flex-1 text-ink-secondary">{chart.tipDate}</span>
                      <b dir="ltr">{chart.tipCurrent}</b>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: PREVIOUS }} />
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
            <div className="flex justify-between pt-2 text-[11px] text-[#8a8a8a]">
              {chart.xTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-[13px] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: CURRENT }} />
              {chart.currentLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: PREVIOUS }} />
              {chart.previousLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
