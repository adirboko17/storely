"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { AssistantCard } from "@/components/admin/dashboard/assistant-card";
import { LowStock, QuickActions, RecentOrders, TipCards, TopProducts } from "@/components/admin/dashboard/dashboard-widgets";
import { SalesChart } from "@/components/admin/dashboard/sales-chart";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { attentionCounts } from "@/data/mock/orders";
import { RANGES, buildDashboardChart, greeting, type MetricId, type RangeId } from "@/lib/dashboard/chart";
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
  const [metric, setMetric] = useState<MetricId>("sales");
  const [hover, setHover] = useState<number | null>(null);
  const model = useMemo(() => buildDashboardChart(range, metric, hover), [range, metric, hover]);
  const rangeLabel = RANGES.find((item) => item.id === range)?.label ?? "";
  const counts = attentionCounts();
  const hello = useSyncExternalStore(subscribeToClock, readGreeting, serverGreeting);

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
          {model.metrics.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-ink hover:bg-[#ebebeb]"
              style={{ background: item.id === metric ? "#ebebeb" : "transparent" }}
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
        <AssistantCard />
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
        <SalesChart
          chart={model.chart}
          rangeLabel={rangeLabel}
          onMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const index = Math.round(ratio * (model.chart.pointCount - 1));
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
