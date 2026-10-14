"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ChartSpan } from "@/lib/dashboard/chart";

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

export const STORE_TODAY = new Date(2026, 9, 13);

export type DashboardWindow = {
  label: string;
  preset: string;
  start: Date;
  end: Date;
};

type Preset = { id: string; label: string; children?: Preset[] };

const PRESETS: Preset[] = [
  { id: "today", label: "היום" },
  { id: "yesterday", label: "אתמול" },
  {
    id: "last",
    label: "אחרונים",
    children: [
      { id: "last-7", label: "7 הימים האחרונים" },
      { id: "last-30", label: "30 הימים האחרונים" },
      { id: "last-90", label: "90 הימים האחרונים" },
      { id: "last-365", label: "365 הימים האחרונים" },
      { id: "last-12m", label: "12 החודשים האחרונים" },
    ],
  },
  {
    id: "to-date",
    label: "מתחילת התקופה",
    children: [
      { id: "wtd", label: "מתחילת השבוע" },
      { id: "mtd", label: "מתחילת החודש" },
      { id: "qtd", label: "מתחילת הרבעון" },
      { id: "ytd", label: "מתחילת השנה" },
    ],
  },
  { id: "black-friday", label: "בלאק פריידי" },
  { id: "cyber-monday", label: "סייבר מאנדיי" },
  {
    id: "quarters",
    label: "רבעונים",
    children: quarterPresets(),
  },
  { id: "custom", label: "טווח מותאם" },
];

function quarterPresets(): Preset[] {
  const items: Preset[] = [];
  for (const year of [2026, 2025]) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      items.push({ id: `q-${year}-${quarter}`, label: `רבעון ${quarter} ${year}` });
    }
  }
  return items;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function compareDay(a: Date, b: Date) {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

function daysInclusive(start: Date, end: Date) {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000) + 1;
}

function formatFull(date: Date) {
  return `${date.getDate()} ב${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatShort(date: Date) {
  return `${date.getDate()} ב${MONTHS_SHORT[date.getMonth()]}`;
}

function blackFriday(year: number) {
  const november = new Date(year, 10, 1);
  const thursday = (11 - november.getDay() + 7) % 7;
  return new Date(year, 10, 1 + thursday + 22);
}

function latestShoppingDay(today: Date, kind: "black-friday" | "cyber-monday") {
  const years = [today.getFullYear(), today.getFullYear() - 1];
  for (const year of years) {
    const friday = blackFriday(year);
    const day = kind === "black-friday" ? friday : addDays(friday, 3);
    if (compareDay(day, today) <= 0) return day;
  }
  const friday = blackFriday(today.getFullYear() - 1);
  return kind === "black-friday" ? friday : addDays(friday, 3);
}

function quarterBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 0),
  };
}

export function windowForPreset(id: string, today = STORE_TODAY): { start: Date; end: Date } | null {
  const end = startOfDay(today);
  if (id === "today") return { start: end, end };
  if (id === "yesterday") {
    const day = addDays(end, -1);
    return { start: day, end: day };
  }
  if (id === "last-7") return { start: addDays(end, -6), end };
  if (id === "last-30") return { start: addDays(end, -29), end };
  if (id === "last-90") return { start: addDays(end, -89), end };
  if (id === "last-365") return { start: addDays(end, -364), end };
  if (id === "last-12m") return { start: addDays(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()), 1), end };
  if (id === "wtd") return { start: addDays(end, -end.getDay()), end };
  if (id === "mtd") return { start: new Date(end.getFullYear(), end.getMonth(), 1), end };
  if (id === "qtd") return { start: new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1), end };
  if (id === "ytd") return { start: new Date(end.getFullYear(), 0, 1), end };
  if (id === "black-friday" || id === "cyber-monday") {
    const day = latestShoppingDay(end, id);
    return { start: day, end: day };
  }
  const quarter = /^q-(\d{4})-([1-4])$/.exec(id);
  if (quarter) return quarterBounds(Number(quarter[1]), Number(quarter[2]));
  return null;
}

export function defaultDashboardWindow(): DashboardWindow {
  const range = windowForPreset("last-30") ?? { start: STORE_TODAY, end: STORE_TODAY };
  return { label: "30 הימים האחרונים", preset: "last-30", ...range };
}

export function spanFromWindow(window: DashboardWindow): ChartSpan {
  const start = startOfDay(window.start);
  const end = startOfDay(window.end);
  const days = Math.max(1, daysInclusive(start, end));
  return { days, hourly: days === 1, end };
}

function presetLabel(id: string) {
  for (const preset of PRESETS) {
    if (preset.id === id) return preset.label;
    const child = preset.children?.find((item) => item.id === id);
    if (child) return child.label;
  }
  return "טווח מותאם";
}

function MonthCalendar({
  cursor,
  start,
  end,
  onCursor,
  onPick,
}: {
  cursor: Date;
  start: Date;
  end: Date;
  onCursor: (next: Date) => void;
  onPick: (day: Date) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: count }, (_, index) => index + 1)];

  return (
    <div className="w-[248px]">
      <div className="mb-2 grid grid-cols-[28px_minmax(0,1fr)_28px] items-center">
        <button
          type="button"
          aria-label="חודש קודם"
          onClick={() => onCursor(addMonths(cursor, -1))}
          className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
        >
          <Icon name="chevron" size={16} className="rotate-180" />
        </button>
        <div className="text-center text-sm font-semibold text-ink-strong">
          {MONTHS[month]} {year}
        </div>
        <button
          type="button"
          aria-label="חודש הבא"
          onClick={() => onCursor(addMonths(cursor, 1))}
          className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
        >
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] text-ink-secondary">
        {WEEKDAYS.map((day) => (
          <div key={day} className="flex h-8 items-center justify-center">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const date = new Date(year, month, day);
          const selected = sameDay(date, start) || sameDay(date, end);
          const inside = compareDay(date, start) > 0 && compareDay(date, end) < 0;
          const rangeStart = sameDay(date, start) && compareDay(start, end) !== 0;
          const rangeEnd = sameDay(date, end) && compareDay(start, end) !== 0;
          return (
            <div key={day} className="relative flex h-8 items-center justify-center">
              {inside || rangeStart || rangeEnd ? (
                <span
                  className="absolute inset-y-0.5 bg-[#f1f1f1]"
                  style={{
                    right: rangeStart ? "50%" : 0,
                    left: rangeEnd ? "50%" : 0,
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onPick(date)}
                className="relative z-[1] grid size-7 place-items-center rounded-full text-[13px] text-ink"
                style={selected ? { background: "#1a1a1a", color: "#fff" } : undefined}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  anchor,
  value,
  onApply,
  onClose,
  today = STORE_TODAY,
}: {
  anchor: HTMLElement;
  value: DashboardWindow;
  onApply: (next: DashboardWindow) => void;
  onClose: () => void;
  today?: Date;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState(value.preset);
  const [start, setStart] = useState(() => startOfDay(value.start));
  const [end, setEnd] = useState(() => startOfDay(value.end));
  const [anchorDay, setAnchorDay] = useState<Date | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState(() => addMonths(value.start, 0));
  const [rightMonth, setRightMonth] = useState(() => {
    const startMonth = value.start.getFullYear() * 12 + value.start.getMonth();
    const endMonth = value.end.getFullYear() * 12 + value.end.getMonth();
    return addMonths(value.end, endMonth === startMonth ? 1 : 0);
  });
  const [box, setBox] = useState({ top: 0, left: 0, width: 780 });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(780, window.innerWidth - 24);
      let left = rect.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      let top = rect.bottom + 8;
      const height = panel.offsetHeight;
      if (top + height > window.innerHeight - 12 && rect.top > height + 16) top = rect.top - height - 8;
      setBox({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, openGroup]);

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

  function showRange(nextStart: Date, nextEnd: Date) {
    const from = compareDay(nextStart, nextEnd) <= 0 ? nextStart : nextEnd;
    const to = compareDay(nextStart, nextEnd) <= 0 ? nextEnd : nextStart;
    setStart(from);
    setEnd(to);
    setLeftMonth(new Date(from.getFullYear(), from.getMonth(), 1));
    const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
    setRightMonth(sameMonth ? addMonths(from, 1) : new Date(to.getFullYear(), to.getMonth(), 1));
  }

  function choosePreset(id: string) {
    const range = windowForPreset(id, today);
    setPreset(id);
    setAnchorDay(null);
    setOpenGroup(null);
    if (range) showRange(range.start, range.end);
  }

  function pickDay(day: Date) {
    setPreset("custom");
    if (!anchorDay) {
      setAnchorDay(day);
      setStart(day);
      setEnd(day);
      return;
    }
    const from = compareDay(anchorDay, day) <= 0 ? anchorDay : day;
    const to = compareDay(anchorDay, day) <= 0 ? day : anchorDay;
    setAnchorDay(null);
    showRange(from, to);
  }

  function apply() {
    const label = preset === "custom" ? `${formatShort(start)}–${formatShort(end)} ${end.getFullYear()}` : presetLabel(preset);
    onApply({ label, preset, start, end });
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="בחירת טווח תאריכים"
      dir="rtl"
      className="fixed z-[90] rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08),0_18px_50px_rgba(0,0,0,.16)]"
      style={{ top: box.top, left: box.left, width: box.width }}
    >
      <div className="flex items-stretch">
        <div className="w-[196px] shrink-0 border-l border-[#ebebeb] py-2">
          {PRESETS.map((item) => {
            const selected = item.id === preset || item.children?.some((child) => child.id === preset);
            return (
              <div key={item.id} className="relative px-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (item.children) {
                      setOpenGroup((current) => (current === item.id ? null : item.id));
                      return;
                    }
                    choosePreset(item.id);
                  }}
                  onMouseEnter={() => setOpenGroup(item.children ? item.id : null)}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-start text-[13px] text-ink hover:bg-[#f6f6f6]"
                  style={{ background: selected ? "#f1f1f1" : undefined }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.children ? <Icon name="chevron" size={14} className="text-ink-secondary" /> : null}
                </button>
                {item.children && openGroup === item.id ? (
                  <div className="absolute top-0 right-full z-10 mr-1 max-h-[320px] w-[210px] overflow-y-auto rounded-xl bg-white p-1.5 shadow-[var(--shadow-popover)]">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => choosePreset(child.id)}
                        className="flex h-8 w-full items-center rounded-lg px-2.5 text-start text-[13px] text-ink hover:bg-[#f6f6f6]"
                        style={{ background: child.id === preset ? "#f1f1f1" : undefined }}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 px-4 pt-4 pb-3">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg px-3 text-sm text-ink shadow-[inset_0_0_0_1px_#c9cccf]">
              <span className="truncate">{formatFull(start)}</span>
            </div>
            <span className="text-ink-secondary">←</span>
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-sm text-ink shadow-[inset_0_0_0_1px_#c9cccf]">
              <span className="min-w-0 flex-1 truncate">{formatFull(end)}</span>
              <Icon name="clock" size={16} className="shrink-0 text-ink-secondary" />
            </div>
          </div>
          <div dir="rtl" className="flex justify-center gap-6">
            <MonthCalendar cursor={leftMonth} start={start} end={end} onCursor={setLeftMonth} onPick={pickDay} />
            <MonthCalendar cursor={rightMonth} start={start} end={end} onCursor={setRightMonth} onPick={pickDay} />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-[#f1f1f1]"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-8 rounded-lg bg-[#1a1a1a] px-3 text-sm font-semibold text-white hover:bg-[#303030]"
            >
              החלה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
