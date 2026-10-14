"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
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
  hasValues,
} from "@/components/admin/analytics/analytics-widgets";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { getStoreTraffic, subscribeStoreTraffic } from "@/data/live/traffic";
import { buildTrafficOverview } from "@/lib/analytics/overview";
import { formatMoney0 } from "@/lib/formatting/money";

export function AnalyticsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const traffic = useSyncExternalStore(subscribeStoreTraffic, getStoreTraffic, getStoreTraffic);
  const overview = useMemo(() => buildTrafficOverview(traffic), [traffic]);

  return (
    <div className="flex min-h-full flex-col gap-3 px-3.5 pt-2.5 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="bars" size={18} strokeWidth={1.7} />
        <h1 className="m-0 text-[15px] font-bold">ניתוח נתונים</h1>
        <span className="flex-1 text-sm text-ink-secondary">רענון אחרון: {overview.refreshed}</span>
        <button type="button" className={softButton} onClick={() => toast("הגדרת יעדים חודשיים תתווסף בהמשך")}>הגדרת יעדים</button>
        <button type="button" className={darkButton} onClick={() => router.push("/admin/analytics/reports")}>ניתוח חדש</button>
      </div>

      <div className="grid items-stretch gap-3 min-[1100px]:grid-cols-3">
        <Panel title="סך המכירות לאורך זמן" className="min-[1100px]:col-span-2">
          <LineChart format="money" current={overview.salesHours.current} previous={overview.salesHours.previous} total={overview.salesTotal} delta={overview.salesDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel title="פירוט סך המכירות">
          <Breakdown rows={overview.breakdown} />
        </Panel>

        <Panel title="סך המכירות לפי ערוץ מכירה">
          {hasValues(overview.channels) ? <Donut rows={overview.channels} center={formatMoney0(overview.salesTotal)} /> : <EmptyState />}
        </Panel>
        <Panel title="ערך הזמנה ממוצע לאורך זמן">
          <LineChart format="money" current={overview.aovHours.current} previous={overview.aovHours.previous} total={overview.aov} delta={overview.aovDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel title="סך המכירות לפי מוצר">
          {hasValues(overview.products) ? <Bars rows={overview.products} money /> : <EmptyState />}
        </Panel>

        <Panel title="ביקורים לאורך זמן" info="צפיות בעמודים מהאתר המחובר, גם מדומיין Vercel וגם מהדומיין האמיתי.">
          <LineChart format="integer" current={overview.sessionHours.current} previous={overview.sessionHours.previous} total={overview.sessionsTotal} delta={overview.sessionsDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel title="שיעור המרה לאורך זמן" info="אחוז הביקורים שהסתיימו ברכישה. שני הדומיינים של החנות נספרים יחד.">
          <LineChart format="percent" current={overview.conversionHours.current} previous={overview.conversionHours.previous} total={overview.conversion} delta={overview.conversionDelta} currentLabel={overview.currentLabel} previousLabel={overview.previousLabel} />
        </Panel>
        <Panel title="פירוט שיעור המרה" info="השלבים של היום: ביקור, הוספה לעגלה, תשלום, רכישה.">
          <Funnel steps={overview.funnel} />
        </Panel>

        <Panel title="ביקורים לפי סוג מכשיר">
          <EmptyState />
        </Panel>
        <Panel title="ביקורים לפי מיקום">
          {hasValues(overview.locations) ? <Bars rows={overview.locations} /> : <EmptyState />}
        </Panel>
        <Panel title="סך המכירות לפי מפנה חברתי">
          {hasValues(overview.socialSales) ? <Bars rows={overview.socialSales} money /> : <EmptyState />}
        </Panel>

        <Panel title="ניתוח קבוצות לקוחות" className="min-[1100px]:col-span-2">
          {overview.cohorts[0] ? <Cohort label={overview.cohorts[0].label} customers={overview.cohorts[0].customers} rate={overview.cohorts[0].rates[0] ?? null} /> : <EmptyState />}
        </Panel>
        <Panel title="ביקורים לפי דף נחיתה">
          <EmptyState />
        </Panel>

        <Panel title="ביקורים לפי מפנה חברתי">
          {hasValues(overview.socialSessions) ? <Bars rows={overview.socialSessions} /> : <EmptyState />}
        </Panel>
        <Panel title="סך המכירות לפי מפנה">
          {hasValues(overview.referrerSales) ? <Bars rows={overview.referrerSales} money /> : <EmptyState />}
        </Panel>
        <Panel title="ביצועים לפי ערוץ שיווק">
          {hasValues(overview.marketing) ? <Marketing rows={overview.marketing} /> : <EmptyState />}
        </Panel>

        <Panel title="ביקורים לפי מפנה">
          {hasValues(overview.referrerSessions) ? <Bars rows={overview.referrerSessions} /> : <EmptyState />}
        </Panel>
        <Panel title="סך המכירות לפי מיקום קופה">
          <EmptyState />
        </Panel>
        <Panel title="מוצרים לפי שיעור מיצוי מלאי">
          {hasValues(overview.sellThrough) ? <Bars rows={overview.sellThrough} percent /> : <EmptyState />}
        </Panel>

        <Panel title="סך מכירות צוות קופה">
          <EmptyState />
        </Panel>
      </div>
    </div>
  );
}
