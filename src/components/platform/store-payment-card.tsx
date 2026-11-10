"use client";

import { useActionState, useEffect, useState } from "react";
import { savePlatformPayment } from "@/app/platform/actions";
import { darkButton } from "@/components/admin/orders/chrome";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none focus-visible:border-[#1a1a1a]";

export type StorePaymentStatus = {
  terminal: string;
  connected: boolean;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 text-[#616161] transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

export function StorePaymentCard({ storeId, payment }: { storeId: string; payment: StorePaymentStatus }) {
  const [state, action, pending] = useActionState(savePlatformPayment, null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.error) setOpen(true);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3 pt-6">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="px-1">
        <h2 className="m-0 text-[15px] font-semibold">סליקה</h2>
        <p className="m-0 mt-1 text-[13px] leading-5 text-ink-secondary">המסוף של Hyp נשמר לחנות הזו. המפתחות לא מוצגים שוב אחרי השמירה.</p>
      </div>

      {state?.error ? (
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_#fdb5b0]">
          <div className="bg-[#fedad9] px-4 py-2.5 font-bold text-[#8e1f0b]">{state.error}</div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.04)]">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] text-sm font-bold" style={payment.connected ? { background: "#cdfee1", color: "#0c5132" } : { background: "#f3f3f3", color: "#1a1a1a" }}>H</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">סליקה · Hyp</span>
            <span dir={payment.terminal ? "ltr" : undefined} className={`block truncate text-[13px] text-ink-secondary ${payment.terminal ? "text-right" : ""}`}>{payment.terminal || "דף תשלום, חשבונית וזיכוי"}</span>
          </span>
          <span
            className="inline-flex h-[22px] items-center rounded-md px-2 text-[13px] font-semibold"
            style={payment.connected ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#4a4a4a" }}
          >
            {payment.connected ? "מחובר" : "לא מחובר"}
          </span>
          <Chevron open={open} />
        </button>
        <div hidden={!open} className="flex flex-col gap-4 border-t border-[#ebebeb] px-4 py-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">מספר מסוף</span>
            <input name="terminal" required={open} inputMode="numeric" dir="ltr" autoComplete="off" defaultValue={payment.terminal} className={`${field} text-left`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">API Key</span>
            <input name="apiKey" type="password" dir="ltr" autoComplete="new-password" spellCheck={false} placeholder={payment.connected ? "שמור · להחלפה הדביקו מפתח חדש" : ""} className={`${field} text-left`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">PassP</span>
            <input name="apiPassword" type="password" dir="ltr" autoComplete="new-password" spellCheck={false} placeholder={payment.connected ? "שמור · להחלפה הדביקו ערך חדש" : ""} className={`${field} text-left`} />
            <span className="mt-1.5 block text-[13px] text-ink-secondary">סיסמת ה-API מהפורטל, לא הסיסמה שבה נכנסים אליו.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending} className={darkButton}>{pending ? "שומרים…" : "שמירה"}</button>
            {payment.connected ? (
              <button type="submit" name="clearPayment" value="1" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]">
                מחיקת המפתחות
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </form>
  );
}
