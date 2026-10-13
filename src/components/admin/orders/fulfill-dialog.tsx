"use client";

import { Icon } from "@/components/ui/icon";
import type { ResolvedOrder } from "@/lib/orders/present";

const CARRIERS = ["שליחויות צ׳יטה", "HFD", "באלדר", "דואר ישראל", "אחר"];

export function FulfillDialog({
  order,
  carrier,
  tracking,
  notify,
  error,
  onCarrier,
  onTracking,
  onNotify,
  onClose,
  onConfirm,
}: {
  order: ResolvedOrder;
  carrier: string;
  tracking: string;
  notify: boolean;
  error: string;
  onCarrier: (value: string) => void;
  onTracking: (value: string) => void;
  onNotify: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fulfill-title"
        className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(0,0,0,.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center border-b border-[#e3e3e3] bg-[#f3f3f3] px-4 py-3">
          <h2 id="fulfill-title" className="m-0 flex-1 text-[15px] font-bold">
            סימון הזמנה <span dir="ltr">#{order.id}</span> כנשלחה
          </h2>
          <button type="button" aria-label="סגירה" onClick={onClose} className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#e3e3e3]">
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 p-4">
          <div className="text-[13px] text-ink-secondary">
            {order.quantity} פריטים · {order.ship} · מחסן ראשי – חולון
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">חברת משלוחים</span>
            <select
              value={carrier}
              onChange={(event) => onCarrier(event.target.value)}
              className="h-8 w-full rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-sm"
            >
              {CARRIERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label htmlFor="tracking" className="mb-1 block font-medium">
              מספר מעקב
            </label>
            <input
              id="tracking"
              dir="ltr"
              value={tracking}
              onChange={(event) => onTracking(event.target.value)}
              placeholder="CH000000000"
              className="h-8 w-full rounded-lg border px-3 text-right text-sm outline-none"
              style={{ borderColor: error ? "#e51c00" : "#8a8a8a", background: error ? "#fff4f4" : "#fff" }}
            />
            {error ? <div className="mt-1.5 text-[13px] text-[#8e1f0b]">{error}</div> : null}
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={notify} onChange={(event) => onNotify(event.target.checked)} className="m-0 size-4 accent-[#303030]" />
            שליחת הודעת משלוח ללקוח בדוא״ל וב-SMS
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e3e3e3] px-4 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4,inset_0_-1px_0_#e3e3e3]">
            ביטול
          </button>
          <button type="button" onClick={onConfirm} className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white shadow-[inset_0_-1px_0_#000] hover:bg-[#1a1a1a]">
            סימון כנשלח
          </button>
        </div>
      </div>
    </div>
  );
}
