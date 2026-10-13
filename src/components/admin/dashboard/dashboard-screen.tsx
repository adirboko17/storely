"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LowStock, QuickActions, RecentOrders, TipCards, TopProducts } from "@/components/admin/dashboard/dashboard-widgets";
import { MetricPreview } from "@/components/admin/dashboard/metric-preview";
import { SalesChart } from "@/components/admin/dashboard/sales-chart";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { attentionCounts } from "@/data/mock/orders";
import {
  DEFAULT_METRIC_SLOTS,
  RANGES,
  buildMetricChart,
  dashboardMetrics,
  greeting,
  isMetricId,
  type MetricId,
  type RangeId,
} from "@/lib/dashboard/chart";
import Link from "next/link";

function subscribeToClock() {
  return () => undefined;
}

function readGreeting() {
  return greeting(new Date());
}

function serverGreeting() {
  return "צהריים טובים, מאיה!";
}

const CHIPS: Array<{ key: "unfulfilled" | "pendingPayment" | "lowStock"; label: string; href: string }> = [
  { key: "unfulfilled", label: "משלוח הזמנות", href: "/admin/orders?tab=unfulfilled" },
  { key: "pendingPayment", label: "תשלומים ממתינים", href: "/admin/orders?tab=unpaid" },
  { key: "lowStock", label: "מלאי נמוך", href: "/admin/products" },
];

export function DashboardScreen({
  cards = [],
}: {
  cards?: Array<{ id: string; title: string; body: string }>;
}) {
  const { menu, toggleMenu, closeMenu } = useAdmin();
  const [range, setRange] = useState<RangeId>("30");
  const [slots, setSlots] = useState<MetricId[]>(DEFAULT_METRIC_SLOTS);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slotRefCallbacks = useRef<Array<(node: HTMLButtonElement | null) => void>>([]);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const metric = slots[active] ?? "sales";
  const metricCards = useMemo(() => dashboardMetrics(range, slots), [range, slots]);
  const chart = useMemo(() => buildMetricChart(range, metric, hover), [range, metric, hover]);
  const rangeLabel = RANGES.find((item) => item.id === range)?.label ?? "";
  const counts = attentionCounts();
  const hello = useSyncExternalStore(subscribeToClock, readGreeting, serverGreeting);
  const openCard = openSlot == null ? null : metricCards[openSlot];
  const openAnchor = openSlot == null ? null : slotRefs.current[openSlot];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("storely-home-metrics");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const next = parsed.filter((item): item is MetricId => typeof item === "string" && isMetricId(item)).slice(0, 4);
      if (next.length === 4 && new Set(next).size === 4) setSlots(next);
    } catch {
      /* keep the default metrics */
    }
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (openTimer.current) window.clearTimeout(openTimer.current);
    },
    [],
  );

  function showSlot(index: number) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (picker && openSlot !== index) return;
    if (openSlot != null) {
      setOpenSlot(index);
      return;
    }
    openTimer.current = window.setTimeout(() => setOpenSlot(index), 70);
  }

  function hideSlot() {
    if (picker) return;
    if (openTimer.current) window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpenSlot(null);
      setPicker(false);
    }, 220);
  }

  function closePreview() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (openTimer.current) window.clearTimeout(openTimer.current);
    setPicker(false);
    setOpenSlot(null);
  }

  function pickMetric(id: MetricId) {
    if (openSlot == null) return;
    const next = slots.map((item, index) => (index === openSlot ? id : item));
    setSlots(next);
    try {
      localStorage.setItem("storely-home-metrics", JSON.stringify(next));
    } catch {
      /* the choice still applies for this visit */
    }
    setPicker(false);
  }

  return (
    <div data-screen-label="Dashboard" className="flex flex-col pb-10">
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div className="relative z-30 min-w-[180px] flex-1">
          <button
            type="button"
            onClick={() => toggleMenu("range")}
            className="rounded-lg px-2 py-1 text-sm text-ink hover:bg-[#ebebeb]"
          >
            {rangeLabel} · כל הערוצים
          </button>
          {menu === "range" ? (
            <div className="absolute top-[34px] right-0 z-50 w-[220px] rounded-xl bg-white p-1.5 shadow-[var(--shadow-popover)]">
              {RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setRange(item.id);
                    setHover(null);
                    closeMenu();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-sm text-ink hover:bg-[#f1f1f1]"
                  style={{ background: item.id === range ? "#f1f1f1" : "transparent" }}
                >
                  {item.label}
                  {item.id === range ? <Icon name="check" strokeWidth={1.8} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {metricCards.map((item, index) => (
            <button
              key={index}
              ref={
                slotRefCallbacks.current[index] ??
                (slotRefCallbacks.current[index] = (node) => {
                  slotRefs.current[index] = node;
                })
              }
              type="button"
              aria-expanded={openSlot === index}
              onMouseEnter={() => showSlot(index)}
              onMouseLeave={hideSlot}
              onFocus={() => showSlot(index)}
              onClick={() => setActive(index)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-ink transition-[opacity,filter] duration-150"
              style={
                openSlot != null && openSlot !== index
                  ? { opacity: 0.4, filter: "blur(0.7px)" }
                  : undefined
              }
            >
              <span className="text-[13px] text-ink-soft">{item.label}</span>
              <span className="flex items-center gap-1.5 text-sm">
                <b dir="ltr" className="font-bold">
                  {item.value}
                </b>
                <span dir="ltr" className="inline-flex">
                <svg viewBox="0 0 28 14" width="28" height="14" aria-hidden>
                  <path
                    d={item.spark}
                    fill="none"
                    stroke={item.deltaColor}
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                </span>
                <span dir="ltr" className="text-[13px] font-semibold" style={{ color: item.deltaColor }}>
                  {item.delta}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex min-w-[120px] flex-1 items-center justify-end gap-1.5 text-sm text-ink">
          מבקרים כעת <b>9</b>
          <span className="size-[9px] animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full border-2 border-[#29845a]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 px-4 pt-10 pb-8 min-[1000px]:px-5 min-[1000px]:pt-[84px] min-[1000px]:pb-12">
        <div className="flex flex-col gap-0.5 text-center">
          <span className="text-[26px] leading-[34px] font-semibold text-ink-soft" suppressHydrationWarning>
            {hello}
          </span>
          <span className="text-balance text-[28px] leading-9 font-bold text-ink-strong">בואו נמשיך להצמיח את העסק.</span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {CHIPS.filter((chip) => counts[chip.key] > 0).map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              className="inline-flex h-8 items-center gap-2 rounded-[10px] bg-white py-0 pr-3 pl-1.5 text-sm font-medium text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#f7f7f7] hover:no-underline"
            >
              {chip.label}
              <span className="inline-flex h-5 items-center rounded-md bg-[#f1f1f1] px-1.5 text-xs font-bold">
                {counts[chip.key]}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <TipCards />

      <div className="mx-auto mt-8 flex w-full max-w-[1000px] flex-col gap-4 px-4">
        {openCard && openAnchor ? (
          <MetricPreview
            anchor={openAnchor}
            card={openCard}
            range={range}
            picker={picker}
            used={slots}
            onOpenPicker={() => setPicker(true)}
            onPick={pickMetric}
            onClose={closePreview}
            onPointerEnter={() => {
              if (closeTimer.current) window.clearTimeout(closeTimer.current);
            }}
            onPointerLeave={hideSlot}
          />
        ) : null}
        <SalesChart
          chart={chart}
          rangeLabel={rangeLabel}
          onMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const index = Math.round(ratio * (chart.pointCount - 1));
            setHover((current) => (current === index ? current : index));
          }}
          onLeave={() => setHover(null)}
        />
        <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <RecentOrders />
            <TopProducts rangeLabel={rangeLabel} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <QuickActions />
            <LowStock />
          </div>
        </div>
        {cards.length > 0 ? (
          <div className="flex flex-col gap-4">
            {cards.map((card) => (
              <Card key={card.id} className="px-4 py-4">
                <h2 className="m-0 text-sm font-bold text-ink">{card.title}</h2>
                <p className="m-0 mt-1 text-sm text-ink-secondary">{card.body}</p>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
