"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { FulfillDialog } from "@/components/admin/orders/fulfill-dialog";
import { RefundDialog } from "@/components/admin/orders/refund-dialog";
import {
  addOrderComment,
  confirmFulfill,
  confirmRefund,
  getOrderSessionVersion,
  listResolvedOrders,
  markOrderPaid,
  orderEvents,
  resolveOrder,
  setCustomerOrderStatus,
  setOrderFulfillment,
  subscribeOrderSession,
} from "@/data/mock/order-session";
import { isVideoMedia } from "@/data/mock/catalog-session";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getSettings } from "@/data/mock/settings-session";
import { formatMoney } from "@/lib/formatting/money";
import {
  baseTimeline,
  fulfillmentBadge,
  fullOrderDate,
  itemsLabel,
  payBadge,
  refundAmount,
  type ResolvedOrder,
} from "@/lib/orders/present";
import type { CustomerOrderStatus } from "@/types/commerce";

const CUSTOMER_STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  received: "התקבלה",
  progress: "בטיפול",
  hold: "בהמתנה",
  sent: "נארזה ונשלחה",
  transit: "בדרך אלייך",
  delivered: "נמסרה",
};
const CUSTOMER_STATUS_ACTIONS: Array<{ status: CustomerOrderStatus; label: string; fulfillment?: "progress" | "onhold" }> = [
  { status: "progress", label: "סימון כבטיפול", fulfillment: "progress" },
  { status: "hold", label: "סימון כבהמתנה", fulfillment: "onhold" },
  { status: "sent", label: "סימון כנשלחה" },
  { status: "transit", label: "סימון כבדרך אלייך" },
  { status: "delivered", label: "סימון כנמסרה" },
];

const quietButton = "inline-flex h-8 items-center gap-1 rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-ink hover:bg-[#e3e3e3]";
const outlineButton =
  "inline-flex h-8 items-center rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4,inset_0_-1px_0_#e3e3e3] hover:bg-[#f7f7f7]";
const solidButton =
  "inline-flex h-8 items-center rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white shadow-[inset_0_-1px_0_#000] hover:bg-[#1a1a1a]";

function PayPill({ order, tall = false }: { order: ResolvedOrder; tall?: boolean }) {
  const badge = payBadge(order.pay);
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-lg px-2 text-[13px] font-medium"
      style={{ background: badge.background, color: badge.color, height: tall ? 24 : 22, fontWeight: tall ? 600 : 500, fontSize: tall ? 14 : 13 }}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {badge.label}
    </span>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6 7V3.5h8V7" />
      <path d="M6 14.5H4.5A1.5 1.5 0 0 1 3 13V8.5A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5V13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M6 11.5h8V17H6z" />
    </svg>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

const printCss = `
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1a1a; font-family: Arial, sans-serif; }
  .sheet { max-width: 720px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #1a1a1a; }
  .logo { height: 52px; width: auto; max-width: 180px; object-fit: contain; }
  .word { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  h1 { margin: 0; font-size: 26px; }
  .meta { margin: 6px 0 0; color: #555; font-size: 13px; }
  .cards { display: flex; gap: 16px; margin: 18px 0; }
  .card { flex: 1; border: 1px solid #e4e4e4; border-radius: 12px; padding: 12px 14px; }
  .card h2 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.04em; color: #666; }
  .card p { margin: 0 0 3px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: right; font-size: 12px; color: #666; font-weight: 600; padding: 8px 0; border-bottom: 1px solid #ddd; }
  td { padding: 10px 0; border-bottom: 1px solid #eee; vertical-align: middle; font-size: 14px; }
  .item { display: flex; align-items: center; gap: 10px; }
  .thumb { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: #f3f3f3; border: 1px solid #eee; }
  .name { font-weight: 600; }
  .sub { display: block; margin-top: 2px; color: #666; font-size: 12px; font-weight: 400; }
  .num { text-align: left; white-space: nowrap; }
  .totals { width: 260px; margin-right: auto; margin-top: 14px; }
  .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; font-size: 14px; }
  .totals .grand { border-top: 2px solid #1a1a1a; margin-top: 4px; padding-top: 8px; font-size: 16px; font-weight: 700; }
`;

function openPrint(title: string, body: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", title);
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  if (!doc || !view) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printCss}</style></head><body><div class="sheet">${body}</div></body></html>`);
  doc.close();
  const images = [...doc.images];
  const ready = images.length
    ? Promise.all(images.map((image) => (image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); }))))
    : Promise.resolve();
  const stop = new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
  void Promise.race([ready, stop]).then(() => {
    view.focus();
    view.print();
    window.setTimeout(() => frame.remove(), 1000);
  });
}

function linePhoto(order: ResolvedOrder, index: number) {
  const media = order.lines[index]?.product.media?.find((item) => item && !isVideoMedia(item));
  return media ? `<img class="thumb" src="${escapeHtml(media)}" alt="">` : `<span class="thumb"></span>`;
}

function printHeading(title: string, order: ResolvedOrder) {
  const logo = getSettings().logo.trim();
  const name = getStoreIdentity().name || "החנות";
  const mark = logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="${escapeHtml(name)}">` : `<div class="word">${escapeHtml(name)}</div>`;
  return `<header class="top"><div>${mark}</div><div><h1>${escapeHtml(title)} #${order.id}</h1><p class="meta">${escapeHtml(order.date)} · ${escapeHtml(order.channel)}</p></div></header>`;
}

function isPickup(ship: string) {
  return ship.includes("איסוף");
}

function addressCard(order: ResolvedOrder) {
  const heading = isPickup(order.ship) ? "כתובת הלקוח" : "משלוח";
  return `<section class="cards"><div class="card"><h2>לקוח</h2><p>${escapeHtml(order.customer.name)}</p><p>${escapeHtml(order.customer.phone)}</p><p>${escapeHtml(order.customer.email)}</p></div><div class="card"><h2>${heading}</h2><p>${escapeHtml(order.ship || "לא נבחר")}</p><p>${escapeHtml(order.customer.street)}</p><p>${escapeHtml(order.customer.city)} ${escapeHtml(order.customer.zip)}</p><p>ישראל</p></div></section>`;
}

function printOrderPage(order: ResolvedOrder) {
  const rows = order.lines.map((line, index) => `<tr><td><div class="item">${linePhoto(order, index)}<span><span class="name">${escapeHtml(line.product.title)}</span>${line.product.variant ? `<span class="sub">${escapeHtml(line.product.variant)}</span>` : ""}</span></div></td><td class="num">${escapeHtml(formatMoney(line.product.price))}</td><td class="num">${line.quantity}</td><td class="num">${escapeHtml(formatMoney(line.product.price * line.quantity))}</td></tr>`).join("");
  openPrint(`הזמנה ${order.id}`, `${printHeading("הזמנה", order)}${addressCard(order)}<table><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות</th><th class="num">סה״כ</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>סכום ביניים</span><span>${escapeHtml(formatMoney(order.subtotal))}</span></div><div><span>משלוח</span><span>${escapeHtml(formatMoney(order.shipCost))}</span></div><div class="grand"><span>סה״כ</span><span>${escapeHtml(formatMoney(order.total))}</span></div></div>`);
}

function printPackingSlip(order: ResolvedOrder) {
  const rows = order.lines.map((line, index) => `<tr><td><div class="item">${linePhoto(order, index)}<span><span class="name">${escapeHtml(line.product.title)}</span>${line.product.variant ? `<span class="sub">${escapeHtml(line.product.variant)}</span>` : ""}</span></div></td><td class="num">${escapeHtml(formatMoney(line.product.price))}</td><td class="num">${line.quantity}</td><td class="num">${escapeHtml(formatMoney(line.product.price * line.quantity))}</td></tr>`).join("");
  openPrint(`תעודת אריזה ${order.id}`, `${printHeading("תעודת אריזה", order)}${addressCard(order)}<table><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות</th><th class="num">סה״כ</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="grand"><span>סה״כ</span><span>${escapeHtml(formatMoney(order.total))}</span></div></div>`);
}

function FulfillPill({ order, tall = false }: { order: ResolvedOrder; tall?: boolean }) {
  const badge = fulfillmentBadge(order.fulfillment);
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-lg px-2 font-medium"
      style={{ background: badge.background, color: badge.color, height: tall ? 24 : 22, fontWeight: tall ? 600 : 500, fontSize: tall ? 14 : 13 }}
    >
      <span className="box-border size-[7px] rounded-full border-[1.5px] border-current" />
      {badge.label}
      {tall ? ` (${order.quantity})` : ""}
    </span>
  );
}

export function OrderDetailScreen({ orderId }: { orderId: number }) {
  const router = useRouter();
  const { toast, narrow } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const order = resolveOrder(orderId);
  const orders = listResolvedOrders();
  const [comment, setComment] = useState("");
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [carrier, setCarrier] = useState("שליחויות צ׳יטה");
  const [tracking, setTracking] = useState("");
  const [notify, setNotify] = useState(true);
  const [fulfillError, setFulfillError] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [includeShip, setIncludeShip] = useState(false);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [refundError, setRefundError] = useState("");
  const [fulfillMenu, setFulfillMenu] = useState(false);
  const [printMenu, setPrintMenu] = useState(false);

  if (!order) return null;
  const index = orders.findIndex((item) => item.id === order.id);
  const previous = index > 0 ? orders[index - 1] : null;
  const next = index >= 0 && index < orders.length - 1 ? orders[index + 1] : null;
  const events = [...orderEvents(order.id), ...baseTimeline(order)];
  const amount = refundAmount(order, quantities, includeShip);
  const canRefund = order.pay !== "pending" && order.refundedAmount < order.total - 0.005;
  const customerHistory = orders.filter((item) => order.customer.id >= 0 && item.customer.id === order.customer.id);
  const customerTotal = customerHistory.length || Math.max(order.customer.orders, 1);
  const customerRank = customerHistory.filter((item) => item.id <= order.id).length || 1;
  const customerPlace = customerRank === 1 ? "ראשונה" : customerRank === 2 ? "שנייה" : customerRank === 3 ? "שלישית" : String(customerRank);
  const customerOrders = customerTotal <= 1 ? "לקוח חדש · הזמנה ראשונה" : `לקוח חוזר · הזמנה ${customerPlace} מתוך ${customerTotal}`;

  function openFulfill() {
    setCarrier("שליחויות צ׳יטה");
    setTracking("");
    setNotify(true);
    setFulfillError("");
    setFulfillOpen(true);
  }

  function openRefund() {
    setQuantities({});
    setIncludeShip(false);
    setRestock(true);
    setReason("");
    setRefundError("");
    setRefundOpen(true);
  }

  return (
    <div data-screen-label="Order details" className="mx-auto flex max-w-[1040px] flex-col gap-4" style={{ padding: narrow ? 16 : 24 }}>
      <div className="flex flex-wrap items-start gap-2.5">
        <button type="button" aria-label="חזרה להזמנות" onClick={() => router.push("/admin/orders")} className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#e3e3e3]">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10h12M11 5l5 5-5 5" />
          </svg>
        </button>
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 dir="ltr" className="m-0 text-[22px] leading-7 font-bold">
              #{order.id}
            </h1>
            <PayPill order={order} />
            <FulfillPill order={order} />
          </div>
          <div className="mt-0.5 text-[13px] text-ink-secondary">
            {fullOrderDate(order.date)} · דרך {order.channel}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {canRefund ? (
            <button type="button" className={quietButton} onClick={openRefund}>
              החזר כספי
            </button>
          ) : null}
          <button type="button" className={quietButton}>
            החזרה
          </button>
          <button type="button" className={quietButton}>
            עריכה
          </button>
          <div className="relative">
            <button type="button" className={quietButton} aria-expanded={printMenu} onClick={() => setPrintMenu((open) => !open)}>
              הדפסה
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 8l4 4 4-4" />
              </svg>
            </button>
            {printMenu ? (
              <>
                <button type="button" aria-label="סגירה" className="fixed inset-0 z-10 cursor-default border-0 bg-transparent" onClick={() => setPrintMenu(false)} />
                <div className="absolute end-0 top-9 z-20 w-56 overflow-hidden rounded-xl bg-white py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16),0_0_0_1px_rgba(0,0,0,.08)]">
                  <div className="px-3 pt-1 pb-1.5 text-[13px] text-ink-secondary">הדפסה</div>
                  <button type="button" className="flex w-full items-center gap-2 border-0 bg-white px-3 py-2 text-start text-sm hover:bg-[#f6f6f6]" onClick={() => { setPrintMenu(false); printOrderPage(order); }}>
                    <PrintIcon />
                    הדפסת עמוד ההזמנה
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 border-0 bg-white px-3 py-2 text-start text-sm hover:bg-[#f6f6f6]" onClick={() => { setPrintMenu(false); printPackingSlip(order); }}>
                    <PrintIcon />
                    הדפסת תעודת אריזה
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <div className="ms-1 flex overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_#d4d4d4]">
            <button
              type="button"
              aria-label="ההזמנה הקודמת"
              disabled={!previous}
              onClick={() => previous && router.push(`/admin/orders/${previous.id}`)}
              className="grid size-8 place-items-center border-0 border-e border-[#e3e3e3] bg-white"
              style={{ color: previous ? "#4a4a4a" : "#cccccc" }}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 6l4 4-4 4" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="ההזמנה הבאה"
              disabled={!next}
              onClick={() => next && router.push(`/admin/orders/${next.id}`)}
              className="grid size-8 place-items-center border-0 bg-white"
              style={{ color: next ? "#4a4a4a" : "#cccccc" }}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 6l-4 4 4 4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 320px" }}>
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-xl bg-white shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 px-4 pt-4">
              <span className="grid size-5 place-items-center text-[#8a6a00]" aria-hidden>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5z" />
                  <path d="M3.5 6.5 10 10l6.5-3.5M10 10v7" />
                </svg>
              </span>
              <h2 className="m-0 text-[15px] font-semibold">{fulfillmentBadge(order.fulfillment).label}</h2>
            </div>
            <div className="flex items-center gap-2 px-4 pt-2 pb-3 text-[13px] text-ink-secondary">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3 13V7h9v6" />
                <path d="M12 9h3l2 2.5V13h-5" />
                <circle cx="6.5" cy="14.5" r="1.4" />
                <circle cx="14.5" cy="14.5" r="1.4" />
              </svg>
              <span>{order.ship || "לא נבחר משלוח"}</span>
            </div>
            <div className="mx-4 overflow-hidden rounded-[10px] border border-[#e3e3e3]">
              {order.lines.map((line, lineIndex) => {
                const photo = line.product.media?.find((item) => item && !isVideoMedia(item));
                return (
                  <div key={`${line.product.id}-${lineIndex}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto_88px] items-center gap-3 border-t border-[#f1f1f1] px-3 py-3 first:border-t-0">
                    <span className="size-10 rounded-lg bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: photo ? `#f6f6f6 url("${photo}") center/cover no-repeat` : line.product.tone }} />
                    <span className="min-w-0">
                      <Link href={`/admin/products/${line.product.id}`} className="font-medium text-ink no-underline hover:underline">
                        {line.product.title}
                      </Link>
                      {line.product.variant ? <span className="mt-0.5 block text-[13px] text-ink-secondary">{line.product.variant}</span> : null}
                    </span>
                    <span dir="ltr" className="whitespace-nowrap text-ink-secondary">
                      {formatMoney(line.product.price)} × {line.quantity}
                    </span>
                    <span dir="ltr" className="text-left whitespace-nowrap">
                      {formatMoney(line.product.price * line.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>
            {order.fulfillment === "fulfilled" && order.tracking ? (
              <div className="mx-4 mt-3 text-[13px] text-ink-secondary">
                {order.carrier || "משלוח"} · {order.tracking}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3 p-4">
              <span className="me-auto text-[13px] text-ink-secondary">בחשבון הלקוח: {CUSTOMER_STATUS_LABEL[order.customerStatus ?? "received"]}</span>
              <div className="relative flex">
                {order.fulfillment === "fulfilled" ? (
                  <button type="button" className="h-8 rounded-s-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4] hover:bg-[#f7f7f7]" onClick={openFulfill}>
                    עדכון מספר מעקב
                  </button>
                ) : (
                  <button type="button" className="h-8 rounded-s-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white hover:bg-[#1a1a1a]" onClick={openFulfill}>
                    סימון כנשלח
                  </button>
                )}
                <button type="button" aria-label="אפשרויות סימון" aria-expanded={fulfillMenu} className="grid h-8 w-8 place-items-center rounded-e-lg border-0 border-s border-white/20 bg-[#303030] text-white hover:bg-[#1a1a1a]" onClick={() => setFulfillMenu((open) => !open)}>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </button>
                {fulfillMenu ? (
                  <>
                    <button type="button" aria-label="סגירה" className="fixed inset-0 z-10 cursor-default border-0 bg-transparent" onClick={() => setFulfillMenu(false)} />
                    <div className="absolute end-0 top-10 z-20 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.16),0_0_0_1px_rgba(0,0,0,.08)]">
                      {CUSTOMER_STATUS_ACTIONS.map((action) => (
                        <button key={action.status} type="button" className="block w-full border-0 bg-white px-3 py-2 text-start text-sm hover:bg-[#f6f6f6]" onClick={() => {
                          const label = CUSTOMER_STATUS_LABEL[action.status];
                          const text = `הסטטוס בחשבון הלקוח עודכן ל${label}.`;
                          if (action.fulfillment) setOrderFulfillment(order.id, action.fulfillment, text, action.status);
                          else setCustomerOrderStatus(order.id, action.status, text);
                          setFulfillMenu(false);
                          toast(`בחשבון הלקוח: ${label}`);
                        }}>
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <span className="grid size-5 place-items-center text-ink-secondary" aria-hidden>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M5 3.5h10v13l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z" />
                  <path d="M7.5 8h5M7.5 11h5" />
                </svg>
              </span>
              <h2 className="m-0 text-[15px] font-semibold">{payBadge(order.pay).label}</h2>
            </div>
            <div className="flex flex-col gap-2.5 rounded-[10px] border border-[#e3e3e3] p-3">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                <span>סכום ביניים</span>
                <span className="text-ink-secondary">{itemsLabel(order.quantity)}</span>
                <span dir="ltr">{formatMoney(order.subtotal)}</span>
              </div>
              {order.discount ? (
                <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                  <span>הנחה</span>
                  <span dir="ltr" className="text-right text-ink-secondary">
                    {order.discount[0]} ({order.discount[1]}%)
                  </span>
                  <span dir="ltr">{formatMoney(-order.discountAmount)}</span>
                </div>
              ) : null}
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                <span>משלוח</span>
                <span className="text-ink-secondary">{order.ship}</span>
                <span dir="ltr">{formatMoney(order.shipCost)}</span>
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2 font-semibold">
                <span>סה״כ</span>
                <span />
                <span dir="ltr">{formatMoney(order.total)}</span>
              </div>
              <div className="my-0.5 border-t border-[#ebebeb]" />
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                <span>{order.pay === "pending" ? "ממתין לתשלום" : "שולם"}</span>
                <span />
                <span dir="ltr">{formatMoney(order.pay === "pending" ? 0 : order.total)}</span>
              </div>
              {order.refundedAmount > 0 ? (
                <>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                    <span>הוחזר</span>
                    <span />
                    <span dir="ltr">{formatMoney(-order.refundedAmount)}</span>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2 font-bold">
                    <span>נטו</span>
                    <span />
                    <span dir="ltr">{formatMoney(order.total - order.refundedAmount)}</span>
                  </div>
                </>
              ) : null}
            </div>
            {order.pay === "pending" ? (
              <div className="flex justify-end gap-2">
                <button type="button" className={outlineButton}>
                  שליחת חשבונית
                </button>
                <button
                  type="button"
                  className={solidButton}
                  onClick={() => {
                    markOrderPaid(order.id, formatMoney(order.total));
                    toast("ההזמנה סומנה כשולמה");
                  }}
                >
                  סימון כשולם
                </button>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="m-0 px-1 text-[15px] font-bold">ציר זמן</h2>
            <div className="flex items-center gap-2.5 rounded-xl bg-white p-3 shadow-[var(--shadow-card)]">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e0f0ff] text-xs font-bold text-[#00527c]">מב</span>
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="הוספת הערה פנימית…"
                className="h-8 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const text = comment.trim();
                  if (!text) return;
                  addOrderComment(order.id, text);
                  setComment("");
                }}
                className="h-7 rounded-lg border-0 px-3 text-[13px] font-semibold"
                style={{ background: comment.trim() ? "#303030" : "#e3e3e3", color: comment.trim() ? "#fff" : "#b5b5b5" }}
              >
                פרסום
              </button>
            </div>
            <div className="relative flex flex-col pe-0 ps-0" style={{ paddingRight: 0, paddingLeft: 0 }}>
              <div className="absolute top-2 right-[25px] bottom-2 w-0.5 bg-[#e3e3e3]" />
              {events.map((event, eventIndex) => (
                <div key={`${event.time}-${eventIndex}`} className="relative flex gap-3.5 py-2">
                  <span className="mt-1 size-3 shrink-0 rounded-full bg-[#8a8a8a] shadow-[0_0_0_3px_#f1f1f1]" />
                  <div className="flex flex-1 flex-col gap-0.5">
                    {event.who ? <span className="text-[13px] font-semibold">{event.who}</span> : null}
                    <span>{event.text}</span>
                  </div>
                  <span dir="ltr" className="text-xs whitespace-nowrap text-ink-secondary">
                    {event.time}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center">
              <h2 className="m-0 flex-1 text-[15px] font-bold">הערות</h2>
              <button type="button" aria-label="עריכת הערות" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                  <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
                </svg>
              </button>
            </div>
            <span style={{ color: order.note ? "#303030" : "#616161" }}>{order.note || "אין הערות מהלקוח"}</span>
          </section>
          <section className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <h2 className="m-0 text-sm font-semibold">ערוץ</h2>
            <span>{order.channel}</span>
          </section>
          <section className="flex flex-col gap-1 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <h2 className="m-0 mb-1 text-sm font-semibold">לקוח</h2>
            <Link href={`/admin/customers/${order.customer.id}`} className="storely-link">
              {order.customer.name}
            </Link>
            <span className="text-[13px] text-ink-secondary">{customerOrders}</span>
            <a href={`mailto:${order.customer.email}`} dir="ltr" className="storely-link mt-2 text-right text-[13px]">
              {order.customer.email}
            </a>
            {order.customer.phone ? <span dir="ltr" className="text-right text-[13px]">{order.customer.phone}</span> : null}
          </section>
          <section className="flex flex-col gap-1 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <h2 className="m-0 mb-1 text-sm font-semibold">{isPickup(order.ship) ? "כתובת הלקוח" : "כתובת למשלוח"}</h2>
            <span>{order.customer.name}</span>
            <span>{order.customer.street}</span>
            <span>{order.customer.city} <span dir="ltr">{order.customer.zip}</span></span>
            <span>ישראל</span>
            <a href="#map" className="storely-link mt-1 text-[13px]" onClick={(event) => event.preventDefault()}>הצגה במפה</a>
          </section>
          <section className="flex flex-col gap-1 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <h2 className="m-0 mb-1 text-sm font-semibold">כתובת לחיוב</h2>
            <span className="text-ink-secondary">{isPickup(order.ship) ? "זהה לכתובת הלקוח" : "זהה לכתובת המשלוח"}</span>
          </section>
          <section className="flex flex-col gap-2.5 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center">
              <h2 className="m-0 flex-1 text-[15px] font-bold">תגיות</h2>
              <a href="#tags" className="storely-link text-sm" onClick={(event) => event.preventDefault()}>
                ניהול
              </a>
            </div>
            <input placeholder="חיפוש או יצירת תגית" className="h-8 w-full rounded-lg border border-[#8a8a8a] px-3 text-sm outline-none" />
            {order.tags?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {order.tags.map((tag) => (
                  <span key={tag} className="inline-flex h-6 items-center rounded-lg bg-[#ebebeb] px-2 text-[13px]">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {fulfillOpen ? (
        <FulfillDialog
          order={order}
          carrier={carrier}
          tracking={tracking}
          notify={notify}
          error={fulfillError}
          onCarrier={setCarrier}
          onTracking={(value) => {
            setTracking(value);
            setFulfillError("");
          }}
          onNotify={setNotify}
          onClose={() => setFulfillOpen(false)}
          onConfirm={() => {
            const value = tracking.trim();
            if (!value) {
              setFulfillError("יש להזין מספר מעקב");
              return;
            }
            confirmFulfill(order.id, { carrier, tracking: value, notify, quantity: order.quantity });
            setFulfillOpen(false);
            toast("ההזמנה סומנה כנשלחה");
          }}
        />
      ) : null}
      {refundOpen ? (
        <RefundDialog
          order={order}
          quantities={quantities}
          includeShip={includeShip}
          restock={restock}
          reason={reason}
          error={refundError}
          amount={amount}
          onQuantity={(lineIndex, value, max) => {
            setQuantities((current) => ({ ...current, [lineIndex]: Math.max(0, Math.min(max, value)) }));
            setRefundError("");
          }}
          onIncludeShip={(value) => {
            setIncludeShip(value);
            setRefundError("");
          }}
          onRestock={setRestock}
          onReason={setReason}
          onClose={() => setRefundOpen(false)}
          onConfirm={() => {
            if (amount <= 0) {
              setRefundError("יש לבחור לפחות פריט אחד או את דמי המשלוח");
              return;
            }
            const totalRefunded = order.refundedAmount + amount;
            confirmRefund(order.id, {
              totalRefunded,
              pay: totalRefunded >= order.total - 0.01 ? "refunded" : "partially_refunded",
              text: `הוחזר ללקוח ${formatMoney(amount)} לכרטיס ויזה •••• 4821.${restock ? " הפריטים הוחזרו למלאי." : ""}`,
            });
            setRefundOpen(false);
            toast(`הוחזרו ${formatMoney(amount)} ללקוח`);
          }}
        />
      ) : null}
    </div>
  );
}
