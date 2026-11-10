"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { loadStoreRefunds, refundStoreOrder, type RefundOrder } from "@/app/admin/orders/returns/actions";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { formatMoney } from "@/lib/formatting/money";

const whenFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : whenFormat.format(date);
}

function statusLabel(order: RefundOrder) {
  if (order.remaining <= 0.009) return { label: "זוכה במלואו", background: "#cdfee1", color: "#0c5132" };
  if (order.refunded > 0) return { label: "זוכה חלקית", background: "#ffd6a4", color: "#5e4200" };
  return { label: "שולם", background: "#eaf4ff", color: "#0b3b4b" };
}

export function ReturnsScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const store = getStoreIdentity();
  const [orders, setOrders] = useState<RefundOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RefundOrder | null>(null);
  const [full, setFull] = useState(true);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store.storeId) return;
    let active = true;
    setLoading(true);
    void loadStoreRefunds(store.storeId).then((result) => {
      if (!active) return;
      if ("error" in result) {
        toast(result.error);
        setOrders([]);
      } else {
        setOrders(result.orders);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [store.storeId, toast]);

  function open(order: RefundOrder) {
    setSelected(order);
    setFull(true);
    setPartial(order.remaining.toFixed(2));
    setError("");
  }

  const credit = selected
    ? full
      ? selected.remaining
      : Math.round((Number(partial.replace(",", ".")) || 0) * 100) / 100
    : 0;

  async function confirm() {
    if (!selected || !store.storeId || saving) return;
    if (!(credit > 0) || credit > selected.remaining + 0.009) {
      setError("הסכום צריך להיות בין אגורה אחת ליתרה שנותרה");
      return;
    }
    setSaving(true);
    try {
      const result = await refundStoreOrder(store.storeId, selected.orderNumber, credit);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOrders((current) => current.map((order) => (
        order.orderNumber === selected.orderNumber
          ? { ...order, refunded: result.refunded, remaining: result.remaining, status: result.status }
          : order
      )));
      setSelected(null);
      toast(`זוכו ${formatMoney(credit)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-screen-label="Refunds" className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="card" size={18} className="text-ink" />
        <h1 className="m-0 text-[15px] font-bold">החזרות והחזרים כספיים</h1>
      </div>
      <p className="m-0 px-3.5 pb-2 text-[13px] text-ink-secondary">זיכוי מלא או חלקי יוצא לכרטיס ששילם דרך Hyp, ו-Hyp שולח חשבונית זיכוי למייל.</p>
      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              {["הזמנה", "תאריך", "לקוח", "סטטוס", "שולם", "זוכה", "נותר"].map((label) => (
                <th key={label} className="h-8 bg-[#f3f3f3] px-2.5 text-start font-semibold whitespace-nowrap">{label}</th>
              ))}
              <th className="h-8 bg-[#f3f3f3] px-2.5" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const status = statusLabel(order);
              return (
                <tr key={order.orderNumber} className="h-11 border-b border-[#ebebeb] bg-white">
                  <td dir="ltr" className="px-2.5 text-right font-semibold">#{order.orderNumber}</td>
                  <td className="px-2.5 whitespace-nowrap">{when(order.createdAt)}</td>
                  <td className="px-2.5">
                    <span className="block">{order.name || "לקוח"}</span>
                    <span dir="ltr" className="block text-right text-[12px] text-ink-secondary">{order.email}</span>
                  </td>
                  <td className="px-2.5">
                    <span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: status.background, color: status.color }}>{status.label}</span>
                  </td>
                  <td dir="ltr" className="px-2.5 text-left">{formatMoney(order.total)}</td>
                  <td dir="ltr" className="px-2.5 text-left">{formatMoney(order.refunded)}</td>
                  <td dir="ltr" className="px-2.5 text-left">{formatMoney(order.remaining)}</td>
                  <td className="px-2.5 text-end">
                    <button type="button" className={softButton} disabled={order.remaining <= 0.009} onClick={() => open(order)}>זיכוי</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? <div className="mx-3 rounded-b-xl bg-white px-4 py-12 text-center text-ink-secondary">{loading ? "טוען חיובים…" : "אין עדיין חיובים שאפשר לזכות."}</div> : null}

      {selected ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="credit-title" className="w-full max-w-[420px] rounded-2xl bg-white p-4 shadow-[0_20px_40px_rgba(0,0,0,.25)]" onClick={(event) => event.stopPropagation()}>
            <h2 id="credit-title" className="m-0 text-[15px] font-bold">זיכוי הזמנה <span dir="ltr">#{selected.orderNumber}</span></h2>
            <p className="mt-1 mb-3 text-[13px] text-ink-secondary">היתרה לזיכוי היא {formatMoney(selected.remaining)}. הסכום חוזר לכרטיס ששילם.</p>
            <label className="mb-2 flex items-center gap-2">
              <input type="radio" name="credit" checked={full} onChange={() => { setFull(true); setError(""); }} className="m-0 size-4 accent-[#303030]" />
              זיכוי מלא, {formatMoney(selected.remaining)}
            </label>
            <label className="mb-3 flex items-center gap-2">
              <input type="radio" name="credit" checked={!full} onChange={() => { setFull(false); setError(""); }} className="m-0 size-4 accent-[#303030]" />
              זיכוי חלקי
              <input
                dir="ltr"
                inputMode="decimal"
                value={partial}
                onChange={(event) => { setPartial(event.target.value); setFull(false); setError(""); }}
                className="h-8 w-28 rounded-lg border border-[#8a8a8a] px-2 text-left text-sm outline-none"
              />
            </label>
            {error ? <div className="mb-3 text-[13px] text-[#8e1f0b]">{error}</div> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={softButton} onClick={() => setSelected(null)}>ביטול</button>
              <button type="button" className={darkButton} disabled={saving} onClick={() => void confirm()}>{saving ? "מזכה…" : `זיכוי ${formatMoney(credit)}`}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
