"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DateRangePicker, type DashboardWindow } from "@/components/admin/dashboard/date-range-picker";
import {
  Bars,
  Breakdown,
  Cohort,
  Donut,
  EmptyState,
  Funnel,
  LineChart,
  Marketing,
  Panel,
  ChartMotion,
  hasValues,
} from "@/components/admin/analytics/analytics-widgets";
import { Icon } from "@/components/ui/icon";
import { getStoreTraffic, subscribeStoreTraffic } from "@/data/live/traffic";
import { buildTrafficOverview } from "@/lib/analytics/overview";
import { formatMoney0 } from "@/lib/formatting/money";

function todayWindow(today: Date): DashboardWindow {
  return { label: "היום", preset: "today", start: today, end: today };
}

export function AnalyticsScreen() {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [range, setRange] = useState<DashboardWindow>(() => todayWindow(today));
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeButtonRef = useRef<HTMLButtonElement>(null);
  const traffic = useSyncExternalStore(subscribeStoreTraffic, getStoreTraffic, getStoreTraffic);
  const overview = useMemo(() => buildTrafficOverview(traffic, range, today), [traffic, range, today]);
  let step = 0;
  const rise = () => step++ * 45;

  return (
    <ChartMotion key={`${range.preset}-${range.start.getTime()}-${range.end.getTime()}`}>
    <div className="flex min-h-full flex-col gap-3 px-3.5 pt-2.5 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="bars" size={18} strokeWidth={1.7} />
        <h1 className="m-0 text-[15px] font-bold">ניתוח נתונים</h1>
        <span className="flex-1 text-sm text-ink-secondary">רענון אחרון: {overview.refreshed}</span>
        <div className="relative">
          <button
            ref={rangeButtonRef}
            type="button"
            aria-expanded={rangeOpen}
            onClick={() => setRangeOpen((open) => !open)}
            className="rounded-lg px-2 py-1 text-sm text-ink hover:bg-[#ebebeb]"
          >
            {range.label} · כל הערוצים
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

      <div className="grid items-stretch gap-3 min-[1100px]:grid-cols-3">
        <Panel delay={rise()} title="סך המכירות לאורך זמן" className="min-[1100px]:col-span-2">
          <LineChart format="money" axis={overview.axis} current={overview.salesHours.current} previous={overview.salesHours.previous} total={overview.salesTotal} delta={overview.salesDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel delay={rise()} title="פירוט סך המכירות">
          <Breakdown rows={overview.breakdown} />
        </Panel>

        <Panel delay={rise()} title="סך המכירות לפי ערוץ מכירה">
          {hasValues(overview.channels) ? <Donut rows={overview.channels} center={formatMoney0(overview.salesTotal)} /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="ערך הזמנה ממוצע לאורך זמן">
          <LineChart format="money" axis={overview.axis} current={overview.aovHours.current} previous={overview.aovHours.previous} total={overview.aov} delta={overview.aovDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel delay={rise()} title="סך המכירות לפי מוצר">
          {hasValues(overview.products) ? <Bars rows={overview.products} money /> : <EmptyState />}
        </Panel>

        <Panel delay={rise()} title="ביקורים לאורך זמן" info="צפיות בעמודים מהאתר המחובר, גם מדומיין Vercel וגם מהדומיין האמיתי.">
          <LineChart format="integer" axis={overview.axis} current={overview.sessionHours.current} previous={overview.sessionHours.previous} total={overview.sessionsTotal} delta={overview.sessionsDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel delay={rise()} title="שיעור המרה לאורך זמן" info="אחוז הביקורים שהסתיימו ברכישה. שני הדומיינים של החנות נספרים יחד.">
          <LineChart format="percent" axis={overview.axis} current={overview.conversionHours.current} previous={overview.conversionHours.previous} total={overview.conversion} delta={overview.conversionDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel delay={rise()} title="פירוט שיעור המרה" info={range.preset === "today" ? "השלבים של היום: ביקור, הוספה לעגלה, תשלום, רכישה." : "ביקורים ורכישות בטווח שנבחר. הוספה לעגלה ותשלום נספרים רק ביום הנוכחי."}>
          <Funnel steps={overview.funnel} />
        </Panel>

        <Panel delay={rise()} title="ביקורים לפי סוג מכשיר">
          <EmptyState />
        </Panel>
        <Panel delay={rise()} title="ביקורים לפי מיקום">
          {hasValues(overview.locations) ? <Bars rows={overview.locations} /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="סך המכירות לפי מפנה חברתי">
          {hasValues(overview.socialSales) ? <Bars rows={overview.socialSales} money /> : <EmptyState />}
        </Panel>

        <Panel delay={rise()} title="ניתוח קבוצות לקוחות" className="min-[1100px]:col-span-2">
          {overview.cohorts[0] ? <Cohort label={overview.cohorts[0].label} customers={overview.cohorts[0].customers} rate={overview.cohorts[0].rates[0] ?? null} /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="ביקורים לפי דף נחיתה">
          <EmptyState />
        </Panel>

        <Panel delay={rise()} title="ביקורים לפי מפנה חברתי">
          {hasValues(overview.socialSessions) ? <Bars rows={overview.socialSessions} /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="סך המכירות לפי מפנה">
          {hasValues(overview.referrerSales) ? <Bars rows={overview.referrerSales} money /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="ביצועים לפי ערוץ שיווק">
          {hasValues(overview.marketing) ? <Marketing rows={overview.marketing} /> : <EmptyState />}
        </Panel>

        <Panel delay={rise()} title="ביקורים לפי מפנה">
          {hasValues(overview.referrerSessions) ? <Bars rows={overview.referrerSessions} /> : <EmptyState />}
        </Panel>
        <Panel delay={rise()} title="סך המכירות לפי מיקום קופה">
          <EmptyState />
        </Panel>
        <Panel delay={rise()} title="מוצרים לפי שיעור מיצוי מלאי">
          {hasValues(overview.sellThrough) ? <Bars rows={overview.sellThrough} percent /> : <EmptyState />}
        </Panel>

        <Panel delay={rise()} title="סך מכירות צוות קופה">
          <EmptyState />
        </Panel>
      </div>
    </div>
    </ChartMotion>
  );
}
