"use client";

import { useActionState, useState } from "react";
import { checkStoreEmail, saveStoreMessaging } from "@/app/platform/actions";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { channelLabel, type StoreMessagingStatus } from "@/data/live/messaging";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none focus-visible:border-[#1a1a1a]";
const card = "rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.04)]";

function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-md px-2 text-[13px] font-semibold"
      style={on ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#4a4a4a" }}
    >
      {label}
    </span>
  );
}

export function StoreMessagingCard({ storeId, messaging }: { storeId: string; messaging: StoreMessagingStatus }) {
  const [state, action, pending] = useActionState(saveStoreMessaging, null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const emailOn = messaging.email.saved && messaging.email.marketing;
  const smsOn = messaging.sms.saved && messaging.sms.marketing;

  async function testEmail() {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await checkStoreEmail(storeId));
    } finally {
      setChecking(false);
    }
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="flex flex-wrap items-end gap-3 px-1 pt-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-semibold">הודעות</h2>
          <p className="m-0 mt-1 text-[13px] leading-5 text-ink-secondary">
            המפתחות נשמרים כאן לכל אתר, לא באתר עצמו. אוטומציות כמו עגלה נטושה נשלחות דרך Storely. כניסה עם קוד נשמרת כהעדפה, והמסך שלה יחובר אחר כך.
          </p>
        </div>
        <button type="submit" disabled={pending} className={darkButton}>
          {pending ? "שומרים…" : "שמירת חיבורים"}
        </button>
      </div>

      {state?.error ? (
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_#fdb5b0]">
          <div className="bg-[#fedad9] px-4 py-2.5 font-bold text-[#8e1f0b]">{state.error}</div>
        </div>
      ) : null}

      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">מייל · Resend</b>
          <Pill on={emailOn} label={channelLabel(messaging.email)} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">מפתח API</span>
          <input name="resendApiKey" type="password" dir="ltr" autoComplete="new-password" placeholder={messaging.email.hint ? `שמור · ••••${messaging.email.hint}` : "re_..."} className={`${field} text-left`} />
        </label>
        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">כתובת שולח</span>
            <input name="resendFromEmail" type="email" dir="ltr" defaultValue={messaging.email.fromEmail} placeholder="shop@domain.co.il" className={`${field} text-left`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">שם השולח</span>
            <input name="resendFromName" defaultValue={messaging.email.fromName} placeholder="שם החנות" className={field} />
          </label>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="emailMarketing" defaultChecked={messaging.email.marketing} className="size-4 accent-[#303030]" />
            שליחה באוטומציות, כמו עגלה נטושה
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="emailLogin" defaultChecked={messaging.email.login} className="size-4 accent-[#303030]" />
            כניסה עם קוד למייל
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={softButton} disabled={checking || !messaging.email.saved} onClick={() => void testEmail()}>
            {checking ? "בודקים…" : "בדיקת חיבור"}
          </button>
          <button type="submit" name="clearEmail" value="1" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]">
            ניתוק מייל
          </button>
          {check ? <span className="text-[13px]" style={{ color: check.ok ? "#0c5132" : "#8e1f0b" }}>{check.message}</span> : null}
        </div>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">SMS · Pulseem</b>
          <Pill on={smsOn} label={channelLabel(messaging.sms)} />
        </div>
        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">שם משתמש</span>
            <input name="pulseemUser" dir="ltr" defaultValue={messaging.sms.user} autoComplete="off" className={`${field} text-left`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">סיסמת Web Service</span>
            <input name="pulseemPassword" type="password" dir="ltr" autoComplete="new-password" placeholder={messaging.sms.saved ? "שמורה · להחלפה הדביקו סיסמה חדשה" : ""} className={`${field} text-left`} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">מספר שולח</span>
          <input name="pulseemFrom" dir="ltr" defaultValue={messaging.sms.from} placeholder="0500000000" className={`${field} text-left`} />
          <span className="mt-1.5 block text-[13px] text-ink-secondary">המספר הווירטואלי מפולסים, או מספר שאומת אצלם.</span>
        </label>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="smsMarketing" defaultChecked={messaging.sms.marketing} className="size-4 accent-[#303030]" />
            שליחה באוטומציות
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="smsLogin" defaultChecked={messaging.sms.login} className="size-4 accent-[#303030]" />
            כניסה עם קוד ב-SMS
          </label>
        </div>
        <button type="submit" name="clearSms" value="1" className="h-[30px] self-start rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]">
          ניתוק SMS
        </button>
      </div>
    </form>
  );
}
