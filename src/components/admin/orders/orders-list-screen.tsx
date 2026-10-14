"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { DateRangePicker, windowForPreset, type DashboardWindow } from "@/components/admin/dashboard/date-range-picker";
import { ColumnsButton, IndexDock, SearchField, darkButton, menuItem, menuPanel, softButton } from "@/components/admin/orders/chrome";
import { ExportOrdersDialog } from "@/components/admin/orders/export-orders-dialog";
import { Icon } from "@/components/ui/icon";
import { bulkFulfill, getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import { formatMoney } from "@/lib/formatting/money";
import {
  ORDER_TABS,
  PAY_FILTERS,
  filterOrders,
  orderRowPresentation,
  orderStats,
  parseOrderTab,
  type OrderTab,
  type PayFilter,
} from "@/lib/orders/present";

function todayWindow(today: Date): DashboardWindow {
  const range = windowForPreset("today", today) ?? { start: today, end: today };
  return { label: "היום", preset: "today", ...range };
}

export function OrdersListScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { menu, toggleMenu, closeMenu, toast } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const orders = listResolvedOrders();
  const urlTab = searchParams.get("tab");
  const [tabOverride, setTabOverride] = useState<{ url: string | null; tab: OrderTab } | null>(null);
  const tab = tabOverride && tabOverride.url === urlTab ? tabOverride.tab : parseOrderTab(urlTab);
  const [query, setQuery] = useState("");
  const [pay, setPay] = useState<PayFilter>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const today = useRef(new Date()).current;
  const [range, setRange] = useState<DashboardWindow>(() => todayWindow(new Date()));
  const rangeButton = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function latency() {
    if (timer.current) window.clearTimeout(timer.current);
    setLoading(true);
    timer.current = window.setTimeout(() => setLoading(false), 500);
  }

  const rows = filterOrders(orders, tab, query, pay);
  const stats = orderStats(orders, range, today);
  const visibleIds = rows.map((order) => order.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const viewLabel = ORDER_TABS.find((item) => item.id === tab)?.label ?? "הכל";
  const payLabel = PAY_FILTERS.find((item) => item.id === pay)?.label ?? "כל הסטטוסים";

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  function toggleOne(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div data-screen-label="Orders list" className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="orders" size={18} className="text-ink" />
        <h1 className="m-0 flex-1 text-[15px] leading-5 font-bold">הזמנות</h1>
        <button type="button" className={softButton} onClick={() => setExportOpen(true)}>
          ייצוא
        </button>
        <Link href="/admin/orders/drafts" className={darkButton}>
          יצירת הזמנה
        </Link>
      </div>

      <div className="mx-3 flex overflow-x-auto rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="flex shrink-0 items-center border-e border-[#ebebeb] px-4">
          <button
            ref={rangeButton}
            type="button"
            aria-expanded={rangeOpen}
            onClick={() => setRangeOpen((open) => !open)}
            className="inline-flex h-[30px] max-w-[220px] items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-sm font-medium text-ink hover:bg-[#f1f1f1]"
          >
            <Icon name="calendar" size={16} strokeWidth={1.6} className="shrink-0" />
            <span className="truncate">{range.label}</span>
          </button>
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
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-[180px] flex-1 items-end justify-between gap-2.5 border-e border-[#ebebeb] px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold whitespace-nowrap text-ink underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px]">
                {stat.label}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <b dir="ltr" className="text-sm font-bold">
                  {stat.value}
                </b>
                <span dir="ltr" className="text-xs font-semibold" style={{ color: stat.deltaColor }}>
                  {stat.delta}
                </span>
              </span>
            </div>
            <span dir="ltr" className="shrink-0">
              <svg viewBox="0 0 76 24" width="76" height="24">
                <path d={stat.sparkCompare} fill="none" stroke="#9cc3ee" strokeWidth="1.2" strokeDasharray="2 2" />
                <path d={stat.spark} fill="none" stroke="#2c6ecb" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ))}
      </div>

      <div className="mx-3 mt-2.5 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {selected.length === 0 ? (
          <>
            <div className="relative z-30">
              <button type="button" className="inline-flex h-[30px] items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-ink hover:bg-[#f1f1f1]" onClick={() => toggleMenu("oView")}>
                {viewLabel}
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 8l3-3 3 3M7 12l3 3 3-3" />
                </svg>
              </button>
              {menu === "oView" ? (
                <div className={`${menuPanel("start")} w-[200px]`}>
                  {ORDER_TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={menuItem}
                      style={{ background: tab === item.id ? "#ebebeb" : "transparent", fontWeight: tab === item.id ? 600 : 500 }}
                      onClick={() => {
                        setTabOverride({ url: urlTab, tab: item.id });
                        setSelected([]);
                        closeMenu();
                        latency();
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`${menuItem} mt-1 border-t border-[#ebebeb] text-[#005bd3]`}
                    onClick={() => {
                      closeMenu();
                      toast("ניהול תצוגות שמורות יתווסף בשלב 4");
                    }}
                  >
                    יצירת תצוגה חדשה
                  </button>
                </div>
              ) : null}
            </div>
            <SearchField value={query} onChange={setQuery} />
            <div className="relative z-30">
              <button
                type="button"
                onClick={() => toggleMenu("payF")}
                className="inline-flex h-[26px] items-center gap-1 rounded-lg border border-dashed border-[#b5b5b5] bg-white px-2 text-[13px] font-medium text-ink"
              >
                {pay ? `סטטוס תשלום: ${payLabel}` : "סטטוס תשלום"}
                {pay ? (
                  <span
                    role="button"
                    aria-label="הסרת מסנן תשלום"
                    className="grid place-items-center"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPay(null);
                    }}
                  >
                    <Icon name="close" size={12} strokeWidth={2.2} />
                  </span>
                ) : null}
              </button>
              {menu === "payF" ? (
                <div className={`${menuPanel("end")} w-[230px]`}>
                  {PAY_FILTERS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]"
                      onClick={() => {
                        setPay(item.id);
                        closeMenu();
                        latency();
                      }}
                    >
                      <input type="radio" readOnly checked={pay === item.id} className="pointer-events-none m-0 accent-[#303030]" />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ColumnsButton onClick={() => toast("בחירת עמודות תתווסף בשלב הבא")} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="m-0 size-4 cursor-pointer accent-[#303030]" />
            <span className="me-2 font-semibold">{selected.length} נבחרו</span>
            <button
              type="button"
              className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4] hover:bg-[#f7f7f7]"
              onClick={() => {
                const ids = selected;
                bulkFulfill(ids);
                setSelected([]);
                toast(ids.length === 1 ? "הזמנה אחת סומנה כנשלחה" : `${ids.length} הזמנות סומנו כנשלחו`);
              }}
            >
              סימון כנשלחו
            </button>
            <button
              type="button"
              className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4] hover:bg-[#f7f7f7]"
              onClick={() => toast(`קובץ PDF עם ${selected.length} תוויות משלוח מוכן להורדה`)}
            >
              יצירת תוויות משלוח
            </button>
            <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4]">
              הוספת תגיות
            </button>
          </div>
        )}
      </div>

      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[1320px] border-collapse text-sm">
          <thead>
            <tr className="h-[34px] text-[13px] text-[#4a4a4a]">
              <th className="w-10 bg-[#f3f3f3] px-2.5" style={{ borderRadius: "0 10px 10px 0" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="m-0 size-4 cursor-pointer accent-[#303030] align-middle" />
              </th>
              {["הזמנה", "", "תאריך ↓", "לקוח", "לשלוח עד", "ערוץ"].map((label) => (
                <th key={label || "risk"} className="bg-[#f3f3f3] px-2 text-start font-semibold whitespace-nowrap" style={label === "" ? { width: 28, padding: 0 } : undefined}>
                  {label}
                </th>
              ))}
              <th className="bg-[#f3f3f3] px-2 text-end font-semibold whitespace-nowrap">סה״כ</th>
              {["סטטוס תשלום", "סטטוס משלוח", "פריטים", "סטטוס מסירה", "שיטת משלוח"].map((label) => (
                <th key={label} className="bg-[#f3f3f3] px-2 text-start font-semibold whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="bg-[#f3f3f3] px-2 text-start font-semibold whitespace-nowrap" style={{ borderRadius: "10px 0 0 10px" }}>
                תגיות
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading
              ? rows.map((order) => {
                  const row = orderRowPresentation(order);
                  const chosen = selected.includes(order.id);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                      className="h-[33px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]"
                      style={{ background: chosen ? "#f1f1f1" : "#fff" }}
                    >
                      <td className="px-2.5" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={chosen} onChange={() => toggleOne(order.id)} className="m-0 size-4 cursor-pointer accent-[#303030] align-middle" />
                      </td>
                      <td dir="ltr" className="px-2 text-right font-bold whitespace-nowrap">
                        #{order.id}
                      </td>
                      <td className="px-0.5">
                        {row.risk ? (
                          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#e86b00" strokeWidth="1.8" strokeLinecap="round" className="block" aria-label="סיכון">
                            <path d="M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4zM10 6.5v4M10 13.5h.01" />
                          </svg>
                        ) : null}
                      </td>
                      <td className="px-2 whitespace-nowrap" style={{ color: row.muted }}>
                        {order.date}
                      </td>
                      <td className="px-2 whitespace-nowrap">{order.customer.name}</td>
                      <td className="px-2 font-medium whitespace-nowrap" style={{ color: row.fulfillByColor }}>
                        {row.fulfillBy}
                      </td>
                      <td className="px-2 whitespace-nowrap">{order.channel}</td>
                      <td dir="ltr" className="px-2 text-left whitespace-nowrap">
                        {formatMoney(order.total)}
                      </td>
                      <td className="px-2">
                        <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: row.pay.background, color: row.pay.color }}>
                          <span className="size-[7px] rounded-[2px] bg-current opacity-75" />
                          {row.pay.label}
                        </span>
                      </td>
                      <td className="px-2">
                        <span className="inline-flex h-5 items-center gap-1.5 rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: row.fulfillment.background, color: row.fulfillment.color }}>
                          <span
                            className="box-border size-[7px]"
                            style={{
                              borderRadius: row.fulfilled ? 2 : "50%",
                              border: row.fulfilled ? "none" : "1.5px solid currentColor",
                              background: row.fulfilled ? "currentColor" : "transparent",
                            }}
                          />
                          {row.fulfillment.label}
                        </span>
                      </td>
                      <td className="px-2 whitespace-nowrap" style={{ color: row.muted }}>
                        {row.items}
                      </td>
                      <td className="px-2 whitespace-nowrap text-ink-secondary">{row.delivery}</td>
                      <td className="px-2 whitespace-nowrap" style={{ color: row.muted }}>
                        {order.ship}
                      </td>
                      <td className="px-2 whitespace-nowrap text-ink-secondary">{row.tags}</td>
                    </tr>
                  );
                })
              : Array.from({ length: 8 }, (_, index) => (
                  <tr key={index} className="h-[33px] border-b border-[#ebebeb] bg-white">
                    <td className="px-2.5">
                      <span className="block size-4 rounded bg-[#ebebeb]" />
                    </td>
                    <td className="px-2">
                      <span className="block h-[9px] w-11 animate-pulse rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td />
                    <td className="px-2">
                      <span className="block h-[9px] w-[110px] animate-pulse rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td className="px-2">
                      <span className="block h-[9px] w-20 animate-pulse rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td />
                    <td className="px-2">
                      <span className="block h-[9px] w-[70px] rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td className="px-2">
                      <span className="mr-auto block h-[9px] w-14 rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td className="px-2">
                      <span className="block h-[18px] w-12 rounded-md bg-[#ebebeb]" />
                    </td>
                    <td className="px-2">
                      <span className="block h-[18px] w-16 rounded-md bg-[#ebebeb]" />
                    </td>
                    <td className="px-2">
                      <span className="block h-[9px] w-11 rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td />
                    <td className="px-2">
                      <span className="block h-[9px] w-[90px] animate-pulse rounded-full bg-[#e3e3e3]" />
                    </td>
                    <td />
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="mx-3 flex flex-col items-center gap-2 rounded-b-xl bg-white px-4 py-14 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-[#f1f1f1] text-[#8a8a8a]">
            <Icon name="search" size={26} strokeWidth={1.5} />
          </div>
          <div className="text-base font-bold">לא נמצאו הזמנות</div>
          <div className="max-w-[360px] text-ink-secondary">נסו לשנות את מונחי החיפוש או להסיר מסננים.</div>
          <button
            type="button"
            className={`${softButton} mt-1`}
            onClick={() => {
              setQuery("");
              setPay(null);
              setTabOverride({ url: urlTab, tab: "all" });
            }}
          >
            ניקוי מסננים
          </button>
        </div>
      ) : null}

      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
      {exportOpen ? (
        <ExportOrdersDialog
          orders={orders}
          today={today}
          initialRange={range}
          onClose={() => setExportOpen(false)}
          onDone={(count) => toast(count === 1 ? "הזמנה אחת ירדה לקובץ" : `${count} הזמנות ירדו לקובץ`)}
        />
      ) : null}
    </div>
  );
}
