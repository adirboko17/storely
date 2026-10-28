"use client";

import { useState, useTransition } from "react";
import { deletePlatformStore } from "@/app/platform/actions";
import { softButton } from "@/components/admin/orders/chrome";

export function DeleteStoreButton({
  storeId,
  storeName,
  label = "מחיקה",
  className = "h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]",
}: {
  storeId: string;
  storeName: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
  }

  function confirm() {
    setError("");
    startTransition(async () => {
      const result = await deletePlatformStore(storeId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4"
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="מחיקת חנות"
            className="w-full max-w-[440px] rounded-2xl bg-white p-5 text-start shadow-[0_16px_40px_rgba(0,0,0,.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="m-0 text-base font-bold">למחוק את {storeName}?</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              המוצרים, ההזמנות, הלקוחות והתמונות של החנות יימחקו. גם הכניסה של מי ששייך רק לחנות הזו תימחק.
            </p>
            {error ? <p className="mt-3 text-sm font-semibold text-[#8e1f0b]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={softButton} onClick={close} disabled={pending}>
                ביטול
              </button>
              <button
                type="button"
                className="h-[30px] rounded-[10px] border-0 bg-[#8e1f0b] px-3 text-sm font-semibold text-white disabled:opacity-60"
                onClick={confirm}
                disabled={pending}
              >
                {pending ? "מוחקים…" : "מחיקה"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
