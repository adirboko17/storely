"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { FulfillDialog } from "@/components/admin/orders/fulfill-dialog";
import { RefundDialog } from "@/components/admin/orders/refund-dialog";
import { Icon } from "@/components/ui/icon";
import {
  addOrderComment,
  confirmFulfill,
  confirmRefund,
  getOrderSessionVersion,
  listResolvedOrders,
  markOrderPaid,
  orderEvents,
  resolveOrder,
  subscribeOrderSession,
} from "@/data/mock/order-session";
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

  if (!order) return null;
  const index = orders.findIndex((item) => item.id === order.id);
  const previous = index > 0 ? orders[index - 1] : null;
  const next = index >= 0 && index < orders.length - 1 ? orders[index + 1] : null;
  const events = [...orderEvents(order.id), ...baseTimeline(order)];
  const amount = refundAmount(order, quantities, includeShip);
  const canRefund = order.pay !== "pending" && order.refundedAmount < order.total - 0.005;
  const customerOrders = order.customer.orders === 1 ? "הזמנה ראשונה" : `${order.customer.orders} הזמנות`;

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
          <button type="button" className={quietButton}>
            הדפסה
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>
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
            <div className="flex items-center gap-2 p-4">
              <FulfillPill order={order} tall />
              <div className="flex-1" />
              <button type="button" aria-label="פעולות" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                  <path d="M5 10h.01M10 10h.01M15 10h.01" />
                </svg>
              </button>
            </div>
            <div className="mx-4 overflow-hidden rounded-[10px] border border-[#e3e3e3]">
              <div className="flex flex-wrap gap-6 border-b border-[#e3e3e3] px-3 py-2.5 text-[13px]">
                <span>
                  <span className="text-ink-secondary">מיקום: </span>מחסן ראשי – חולון
                </span>
                <span>
                  <span className="text-ink-secondary">משלוח: </span>
                  {order.ship}
                </span>
              </div>
              {order.lines.map((line, lineIndex) => (
                <div key={`${line.product.id}-${lineIndex}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto_90px] items-center gap-3 border-t border-[#f1f1f1] px-3 py-2.5">
                  <span className="relative size-11 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]" style={{ background: line.product.tone }}>
                    <span className="absolute -top-1.5 -left-1.5 grid h-5 min-w-5 place-items-center rounded-[10px] bg-[#e3e3e3] px-[5px] text-xs font-semibold shadow-[0_0_0_2px_#fff]">
                      {line.quantity}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Link href={`/admin/products/${line.product.id}`} className="font-semibold text-ink no-underline hover:underline">
                      {line.product.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 items-center rounded-md bg-[#f1f1f1] px-1.5 text-xs">{line.product.variant}</span>
                      <span dir="ltr" className="text-xs text-ink-secondary">
                        {line.product.sku}
                      </span>
                    </span>
                  </span>
                  <span dir="ltr" className="whitespace-nowrap text-ink-secondary">
                    {formatMoney(line.product.price)} × {line.quantity}
                  </span>
                  <span dir="ltr" className="text-left whitespace-nowrap">
                    {formatMoney(line.product.price * line.quantity)}
                  </span>
                </div>
              ))}
            </div>
            {order.fulfillment === "fulfilled" ? (
              <div className="mx-4 mt-3 flex items-center gap-2 text-[13px] text-ink">
                <Icon name="check" size={18} strokeWidth={1.8} className="text-[#29845a]" />
                <span>
                  {order.carrier || "שליחויות צ׳יטה"} · מספר מעקב {order.tracking || `CH${order.id * 7919}`}
                </span>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 p-4">
              {order.fulfillment !== "fulfilled" ? (
                <>
                  <button type="button" className={outlineButton} onClick={() => toast("תווית משלוח נוצרה ונשמרה כקובץ PDF")}>
                    יצירת תווית משלוח
                  </button>
                  <button type="button" className={solidButton} onClick={openFulfill}>
                    סימון כנשלח
                  </button>
                </>
              ) : (
                <button type="button" className={outlineButton}>
                  עדכון מספר מעקב
                </button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div>
              <PayPill order={order} tall />
            </div>
            <div className="flex flex-col gap-2 rounded-[10px] border border-[#e3e3e3] p-3">
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
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2 font-bold">
                <span>סה״כ</span>
                <span className="text-[13px] font-normal text-ink-secondary">כולל מע״מ 18%: {formatMoney((order.total * 18) / 118)}</span>
                <span dir="ltr">{formatMoney(order.total)}</span>
              </div>
              <div className="my-1 border-t border-[#ebebeb]" />
              <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2">
                <span>שולם על ידי הלקוח</span>
                <span className="text-ink-secondary">{order.pay === "pending" ? "העברה בנקאית · ממתין לאישור" : "ויזה •••• 4821 · סליקה דרך קארדקום"}</span>
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
          <section className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 mb-1.5 text-[15px] font-bold">לקוח</h2>
              <Link href={`/admin/customers/${order.customer.id}`} className="storely-link">
                {order.customer.name}
              </Link>
              <span className="text-ink-secondary">{customerOrders}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="m-0 mb-1 text-sm font-semibold">פרטי קשר</h3>
              <a href={`mailto:${order.customer.email}`} dir="ltr" className="storely-link text-right">
                {order.customer.email}
              </a>
              <span dir="ltr" className="text-right">
                {order.customer.phone}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="m-0 mb-1 text-sm font-semibold">כתובת למשלוח</h3>
              <span>{order.customer.name}</span>
              <span>{order.customer.street}</span>
              <span>
                {order.customer.city} <span dir="ltr">{order.customer.zip}</span>
              </span>
              <span>ישראל</span>
              <a href="#map" className="storely-link mt-1" onClick={(event) => event.preventDefault()}>
                הצגה במפה
              </a>
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="m-0 mb-1 text-sm font-semibold">כתובת לחיוב</h3>
              <span className="text-ink-secondary">זהה לכתובת המשלוח</span>
            </div>
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
