"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateRangePicker, type DashboardWindow } from "@/components/admin/dashboard/date-range-picker";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/formatting/money";
import { fulfillmentBadge, orderInRange, payBadge, type ResolvedOrder } from "@/lib/orders/present";
import type { FulfillmentStatus, PayStatus } from "@/types/commerce";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const PAY_STATUSES: PayStatus[] = ["paid", "pending", "partially_refunded", "refunded"];
const FULFILLMENT_STATUSES: FulfillmentStatus[] = ["unfulfilled", "partial", "fulfilled", "onhold"];

function formatFull(date: Date) {
  return `${date.getDate()} ב${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function ordersCsv(orders: ResolvedOrder[]) {
  const header = ["הזמנה", "תאריך", "לקוח", "אימייל", "טלפון", "ערוץ", "סה״כ", "סטטוס תשלום", "סטטוס משלוח", "פריטים", "משלוח", "תגיות"];
  const lines = orders.map((order) =>
    [
      String(order.id),
      order.date,
      order.customer.name,
      order.customer.email,
      order.customer.phone,
      order.channel,
      formatMoney(order.total),
      payBadge(order.pay).label,
      fulfillmentBadge(order.fulfillment).label,
      String(order.quantity),
      order.ship,
      (order.tags ?? []).join(" | "),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(name: string, body: string) {
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportOrdersDialog({
  orders,
  today,
  initialRange,
  onClose,
  onDone,
}: {
  orders: ResolvedOrder[];
  today: Date;
  initialRange: DashboardWindow;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [mode, setMode] = useState<"dates" | "status">("dates");
  const [range, setRange] = useState(initialRange);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [pay, setPay] = useState<PayStatus[]>(PAY_STATUSES);
  const [fulfillment, setFulfillment] = useState<FulfillmentStatus[]>(FULFILLMENT_STATUSES);
  const [visible, setVisible] = useState(false);
  const rangeButton = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const matched =
    mode === "dates"
      ? orders.filter((order) => orderInRange(order, range.start, range.end, today))
      : orders.filter((order) => pay.includes(order.pay) && fulfillment.includes(order.fulfillment));

  function close() {
    if (closing.current) return;
    closing.current = true;
    setRangeOpen(false);
    setVisible(false);
    window.setTimeout(() => closeRef.current(), 260);
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function togglePay(status: PayStatus) {
    setPay((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]));
  }

  function toggleFulfillment(status: FulfillmentStatus) {
    setFulfillment((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]));
  }

  function exportCsv() {
    if (!matched.length) return;
    downloadCsv("הזמנות.csv", ordersCsv(matched));
    onDone(matched.length);
    close();
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4"
      onMouseDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[aria-label='בחירת טווח תאריכים']")) return;
        close();
      }}
    >
      <div className="absolute inset-0 bg-[#1a1a1a]/35 backdrop-blur-[4px] transition-opacity duration-200" style={{ opacity: visible ? 1 : 0 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ייצוא הזמנות"
        onMouseDown={(event) => event.stopPropagation()}
        className="relative w-full max-w-[440px] rounded-[22px] bg-white p-5 transition-all duration-300 ease-[cubic-bezier(.16,1,.3,1)]"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(18px) scale(.96)",
          boxShadow: "0 30px 80px rgba(0,0,0,.22)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold">ייצוא הזמנות</div>
            <p className="m-0 mt-1 text-[13px] leading-5 text-[#616161]">בחרו טווח תאריכים או סטטוס, והקובץ ירד כ-CSV.</p>
          </div>
          <button type="button" aria-label="סגירה" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-[#f3f3f3]">
            <Icon name="close" size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="relative mt-4 grid grid-cols-2 rounded-2xl bg-[#f3f3f3] p-1">
          <span
            className="absolute inset-y-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)] transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
            style={{ right: 4, transform: mode === "status" ? "translateX(-100%)" : "none" }}
          />
          {(
            [
              { id: "dates", label: "טווח תאריכים" },
              { id: "status", label: "לפי סטטוס" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMode(item.id);
                setRangeOpen(false);
              }}
              className="relative z-[1] h-9 rounded-xl border-0 text-sm font-semibold text-[#1a1a1a]"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div key={mode} className="mt-4" style={{ animation: "storely-export-in 280ms cubic-bezier(.16,1,.3,1) both" }}>
          <style>{`@keyframes storely-export-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { @keyframes storely-export-in { from, to { opacity: 1; transform: none } } }`}</style>
          {mode === "dates" ? (
            <div ref={rangeButton} className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-[#616161]">{range.label}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={rangeOpen}
                  onClick={() => setRangeOpen((open) => !open)}
                  className="flex h-11 min-w-0 flex-1 items-center rounded-xl border-0 bg-[#f7f7f7] px-3 text-start text-sm font-semibold text-[#1a1a1a] hover:bg-[#f1f1f1]"
                >
                  <span className="truncate">{formatFull(range.start)}</span>
                </button>
                <span className="text-[#8a8a8a]">←</span>
                <button
                  type="button"
                  onClick={() => setRangeOpen((open) => !open)}
                  className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-0 bg-[#f7f7f7] px-3 text-start text-sm font-semibold text-[#1a1a1a] hover:bg-[#f1f1f1]"
                >
                  <span className="min-w-0 flex-1 truncate">{formatFull(range.end)}</span>
                  <Icon name="calendar" size={16} strokeWidth={1.6} className="shrink-0 text-[#616161]" />
                </button>
              </div>
              {rangeOpen && rangeButton.current
                ? createPortal(
                    <DateRangePicker
                      anchor={rangeButton.current}
                      value={range}
                      today={today}
                      onClose={() => setRangeOpen(false)}
                      onApply={(next) => {
                        setRange(next);
                        setRangeOpen(false);
                      }}
                    />,
                    document.body,
                  )
                : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-[#616161]">תשלום</div>
                <div className="flex flex-wrap gap-1.5">
                  {PAY_STATUSES.map((status) => {
                    const on = pay.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePay(status)}
                        className="h-8 rounded-full border-0 px-3 text-[13px] font-semibold transition-colors duration-200"
                        style={{ background: on ? "#1a1a1a" : "#f3f3f3", color: on ? "#fff" : "#1a1a1a" }}
                      >
                        {payBadge(status).label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-[#616161]">משלוח</div>
                <div className="flex flex-wrap gap-1.5">
                  {FULFILLMENT_STATUSES.map((status) => {
                    const on = fulfillment.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleFulfillment(status)}
                        className="h-8 rounded-full border-0 px-3 text-[13px] font-semibold transition-colors duration-200"
                        style={{ background: on ? "#1a1a1a" : "#f3f3f3", color: on ? "#fff" : "#1a1a1a" }}
                      >
                        {fulfillmentBadge(status).label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[#616161]">{matched.length === 1 ? "הזמנה אחת" : `${matched.length} הזמנות`}</span>
          <button
            type="button"
            disabled={!matched.length}
            onClick={exportCsv}
            className="h-10 rounded-2xl border-0 bg-[#1a1a1a] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            הורדת CSV
          </button>
        </div>
      </div>
    </div>
  );
}
