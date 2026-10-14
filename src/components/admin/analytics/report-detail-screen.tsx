"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AttributionChannel } from "@/app/admin/traffic";
import { DateRangePicker, type DashboardWindow } from "@/components/admin/dashboard/date-range-picker";
import { Bars, Change, ChartMotion, EmptyState, LineChart } from "@/components/admin/analytics/analytics-widgets";
import { softButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import { subscribeCatalog, getCatalogVersion, listCatalogProducts } from "@/data/mock/catalog-session";
import { getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import { getStoreTraffic, getStoreTrafficVersion, subscribeStoreTraffic } from "@/data/live/traffic";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";
import { buildReport, rememberReportSeen, reportById } from "@/lib/analytics/reports";

function lastSevenDays(today: Date): DashboardWindow {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { label: "7 הימים האחרונים", preset: "last-7", start, end };
}

function show(format: "integer" | "money" | "percent", value: number) {
  if (format === "money") return formatMoney0(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return formatInteger(value);
}

export function ReportDetailScreen({ reportId, channels }: { reportId: string; channels: AttributionChannel[] }) {
  const router = useRouter();
  const definition = reportById(reportId);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [range, setRange] = useState<DashboardWindow>(() => lastSevenDays(today));
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeButtonRef = useRef<HTMLButtonElement>(null);
  useSyncExternalStore(subscribeStoreTraffic, getStoreTrafficVersion, getStoreTrafficVersion);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, getOrderSessionVersion);
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, getCatalogVersion);
  const report = useMemo(
    () => definition ? buildReport(reportId, range, today, {
      traffic: getStoreTraffic(),
      orders: listResolvedOrders(),
      products: listCatalogProducts(),
      channels,
    }) : null,
    [channels, definition, range, reportId, today],
  );

  useEffect(() => {
    if (!definition) return;
    rememberReportSeen(definition.id);
    document.title = `${definition.name} · Storely`;
  }, [definition]);

  if (!definition || !report) {
    return (
      <div className="px-4 py-8">
        <p className="m-0 text-sm">הדוח לא נמצא.</p>
        <button type="button" className="mt-3 border-0 bg-transparent text-sm underline" onClick={() => router.push("/admin/analytics/reports")}>חזרה לדוחות</button>
      </div>
    );
  }

  const format = definition.format;
  const hasPoints = report.points.length > 0;

  return (
    <ChartMotion key={`${range.preset}-${range.start.getTime()}-${range.end.getTime()}`}>
      <div className="flex min-h-full flex-col gap-3 px-3.5 pt-2.5 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/analytics/reports" className="inline-flex items-center gap-1 text-sm font-medium text-[#303030] no-underline hover:underline">
            <Icon name="chevron" size={16} className="rotate-180" />
            דוחות
          </Link>
          <span className="text-ink-secondary">/</span>
          <h1 className="m-0 text-[15px] font-bold">{definition.name}</h1>
          <span className="flex-1 text-sm text-ink-secondary">רענון אחרון: {report.refreshed}</span>
          <button type="button" className={softButton} onClick={() => window.print()}>הדפסה</button>
          <div className="relative">
            <button
              ref={rangeButtonRef}
              type="button"
              aria-expanded={rangeOpen}
              onClick={() => setRangeOpen((open) => !open)}
              className="rounded-lg px-2 py-1 text-sm text-ink hover:bg-[#ebebeb]"
            >
              {range.label}
            </button>
            {rangeOpen && rangeButtonRef.current ? (
              <DateRangePicker
                anchor={rangeButtonRef.current}
                value={range}
                today={today}
                onClose={() => setRangeOpen(false)}
                onApply={(next) => {
                  setRange(next);
                  setRangeOpen(false);
                }}
              />
            ) : null}
          </div>
        </div>

        {report.note ? <p className="m-0 text-sm text-ink-secondary">{report.note}</p> : null}

        <section className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="mb-2 text-[13px] font-semibold">{definition.metric}</div>
          {definition.kind === "trend" && hasPoints ? (
            <LineChart
              format={format === "percent" ? "percent" : format === "money" ? "money" : "integer"}
              axis={report.axis}
              current={report.points.map((point) => point.current)}
              previous={report.points.map((point) => point.previous)}
              total={report.total}
              delta={report.delta}
              currentLabel={report.currentLabel}
              previousLabel={report.previousLabel}
            />
          ) : null}
          {definition.kind === "breakdown" && hasPoints ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <b className="text-[22px] leading-7 font-semibold" dir="ltr">{show(format, report.total)}</b>
                <Change value={report.delta} />
              </div>
              <Bars rows={report.points.map((point) => ({ label: point.label, value: point.current, delta: point.previous ? ((point.current - point.previous) / point.previous) * 100 : null }))} money={format === "money"} percent={format === "percent"} />
            </div>
          ) : null}
          {!hasPoints ? <EmptyState /> : null}
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[13px] text-[#4a4a4a]">
                <th className="h-10 border-b border-[#ebebeb] bg-[#f7f7f7] px-4 text-start font-semibold">{definition.kind === "trend" ? "יום" : definition.dimension}</th>
                <th className="border-b border-[#ebebeb] bg-[#f7f7f7] px-4 text-end font-semibold">{definition.metric}</th>
                {definition.kind === "breakdown" ? <th className="border-b border-[#ebebeb] bg-[#f7f7f7] px-4 text-end font-semibold">תקופה קודמת</th> : null}
                {definition.kind === "breakdown" ? <th className="border-b border-[#ebebeb] bg-[#f7f7f7] px-4 text-end font-semibold">שינוי</th> : null}
              </tr>
            </thead>
            <tbody>
              {definition.kind === "trend" ? (
                <>
                  <tr className="h-11 bg-[#fafafa]">
                    <td className="px-4">{report.currentLabel}</td>
                    <td className="px-4 text-end font-semibold" dir="ltr">{show(format, report.total)}</td>
                  </tr>
                  <tr className="h-11 bg-[#fafafa]">
                    <td className="px-4 text-ink-secondary">{report.previousLabel}</td>
                    <td className="px-4 text-end text-ink-secondary" dir="ltr">{show(format, report.previous)}</td>
                  </tr>
                  <tr className="h-11 border-b border-[#ebebeb] bg-[#fafafa]">
                    <td className="px-4">שינוי</td>
                    <td className="px-4 text-end"><Change value={report.delta} /></td>
                  </tr>
                  {report.points.map((point, index) => (
                    <tr key={`${point.label}-${index}`} className="h-11 border-b border-[#f1f1f1]">
                      <td className="px-4">{point.label}</td>
                      <td className="px-4 text-end" dir="ltr">{show(format, point.current)}</td>
                    </tr>
                  ))}
                </>
              ) : report.points.map((point) => (
                <tr key={point.label} className="h-11 border-b border-[#f1f1f1]">
                  <td className="px-4">{point.label}</td>
                  <td className="px-4 text-end font-semibold" dir="ltr">{show(format, point.current)}</td>
                  <td className="px-4 text-end text-ink-secondary" dir="ltr">{show(format, point.previous)}</td>
                  <td className="px-4 text-end"><Change value={point.previous ? ((point.current - point.previous) / point.previous) * 100 : null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.points.length ? <div className="px-4 py-8 text-center text-sm text-ink-secondary">אין נתונים בטווח הזה.</div> : null}
        </section>
      </div>
    </ChartMotion>
  );
}
