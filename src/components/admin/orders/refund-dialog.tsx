"use client";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/formatting/money";
import type { ResolvedOrder } from "@/lib/orders/present";

export function RefundDialog({
  order,
  quantities,
  includeShip,
  restock,
  reason,
  error,
  amount,
  onQuantity,
  onIncludeShip,
  onRestock,
  onReason,
  onClose,
  onConfirm,
}: {
  order: ResolvedOrder;
  quantities: Record<number, number>;
  includeShip: boolean;
  restock: boolean;
  reason: string;
  error: string;
  amount: number;
  onQuantity: (index: number, value: number, max: number) => void;
  onIncludeShip: (value: boolean) => void;
  onRestock: (value: boolean) => void;
  onReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-title"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(0,0,0,.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center border-b border-[#e3e3e3] bg-[#f3f3f3] px-4 py-3">
          <h2 id="refund-title" className="m-0 flex-1 text-[15px] font-bold">
            החזר כספי · <span dir="ltr">#{order.id}</span>
          </h2>
          <button type="button" aria-label="סגירה" onClick={onClose} className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#e3e3e3]">
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          {order.lines.map((line, index) => (
            <div key={`${line.product.id}-${index}`} className="grid grid-cols-[40px_minmax(0,1fr)_88px] items-center gap-3">
              <span className="size-10 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]" style={{ background: line.product.tone }} />
              <span className="flex min-w-0 flex-col leading-[18px]">
                <span className="font-semibold">{line.product.title}</span>
                <span dir="ltr" className="text-right text-xs text-ink-secondary">
                  {formatMoney(line.product.price)}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <input
                  dir="ltr"
                  type="number"
                  min={0}
                  max={line.quantity}
                  value={quantities[index] ?? 0}
                  onChange={(event) => onQuantity(index, Number.parseInt(event.target.value, 10) || 0, line.quantity)}
                  className="h-8 w-14 rounded-lg border border-[#8a8a8a] px-2 text-right text-sm outline-none"
                />
                <span className="text-[13px] text-ink-secondary">/ {line.quantity}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-[#ebebeb]" />
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={includeShip} onChange={(event) => onIncludeShip(event.target.checked)} className="m-0 size-4 accent-[#303030]" />
            החזר דמי משלוח ({formatMoney(order.shipCost)})
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={restock} onChange={(event) => onRestock(event.target.checked)} className="m-0 size-4 accent-[#303030]" />
            החזרת הפריטים למלאי
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">סיבת ההחזר</span>
            <input
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              placeholder="לדוגמה: פריט הגיע פגום"
              className="h-8 w-full rounded-lg border border-[#8a8a8a] px-3 text-sm outline-none"
            />
            <div className="mt-1 text-[13px] text-ink-secondary">גלוי רק לצוות</div>
          </label>
          <div className="flex flex-col gap-1 rounded-[10px] bg-[#f7f7f7] p-3">
            <div className="flex justify-between font-bold">
              <span>סכום ההחזר</span>
              <span dir="ltr">{formatMoney(amount)}</span>
            </div>
            <div className="text-[13px] text-ink-secondary">
              ניתן להחזיר עד {formatMoney(order.total - order.refundedAmount)} · יוחזר לכרטיס ויזה •••• 4821
            </div>
          </div>
          {error ? <div className="text-[13px] text-[#8e1f0b]">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e3e3e3] px-4 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border-0 bg-white px-3 text-sm font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4,inset_0_-1px_0_#e3e3e3]">
            ביטול
          </button>
          <button type="button" onClick={onConfirm} className="h-8 rounded-lg border-0 bg-[#303030] px-3.5 text-sm font-semibold text-white shadow-[inset_0_-1px_0_#000] hover:bg-[#1a1a1a]">
            <span dir="ltr">החזר {formatMoney(amount)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
