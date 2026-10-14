"use client";

import { useActionState } from "react";
import { createPlatformStore } from "@/app/platform/actions";
import { darkButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";

const field = "h-9 w-full rounded-lg border border-[#8a8a8a] bg-white px-2.5 text-sm font-normal outline-none focus-visible:border-[#1a1a1a]";

export function NewStoreScreen() {
  const [state, action, pending] = useActionState(createPlatformStore, null);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <Icon name="plus" size={18} />
        <h1 className="m-0 text-[15px] leading-5 font-bold">אתר חדש</h1>
      </div>
      <p className="m-0 text-sm text-[#616161]">נפתחת חנות חדשה, ובעל החנות מקבל אימייל וסיסמה משלו לכניסה לניהול.</p>

      <form action={action} className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם החנות
          <input name="storeName" required minLength={2} className={field} placeholder="סטודיו לבנה" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          דומיין Vercel
          <input name="hostname" required dir="ltr" className={`${field} text-left`} placeholder="my-shop.vercel.app" />
          <span className="font-normal text-[#616161]">זה הדומיין בזמן הפיתוח. התנועה ממנו נספרת לחנות הזו.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          דומיין אמיתי
          <input name="primaryHost" dir="ltr" className={`${field} text-left`} placeholder="shop.co.il" />
          <span className="font-normal text-[#616161]">אפשר להשאיר ריק ולחבר אותו כשהאתר מוכן. שני הדומיינים נספרים יחד.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם הבעלים
          <input name="ownerName" required minLength={2} className={field} placeholder="מאיה ברק" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          אימייל לכניסה
          <input name="ownerEmail" type="email" required dir="ltr" autoComplete="off" className={`${field} text-left`} placeholder="owner@store.co.il" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          סיסמה לבעלים
          <input name="ownerPassword" type="text" required minLength={8} dir="ltr" autoComplete="new-password" className={`${field} text-left`} placeholder="לפחות 8 תווים" />
        </label>
        {state?.error ? (
          <p role="alert" className="m-0 text-sm text-[#8e1f0b]">
            {state.error}
          </p>
        ) : null}
        <div>
          <button type="submit" disabled={pending} className={darkButton}>
            {pending ? "פותחים את האתר…" : "יצירת אתר"}
          </button>
        </div>
      </form>
    </div>
  );
}
