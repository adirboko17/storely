"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { enterClientStore, updatePlatformStore } from "@/app/platform/actions";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { StoreMessagingCard } from "@/components/platform/store-messaging-card";
import type { PlatformStore } from "@/components/platform/types";
import type { StoreMessagingStatus } from "@/data/live/messaging";
import { storeConnectionPrompt } from "@/tracking/connection-prompt";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none focus-visible:border-[#1a1a1a]";
const card = "rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.04)]";

export function StoreDetailScreen({
  store,
  messaging,
  supabaseUrl,
  publishableKey,
  photosProKey,
  photosProOrigin,
}: {
  store: PlatformStore;
  messaging: StoreMessagingStatus;
  supabaseUrl: string;
  publishableKey: string;
  photosProKey: string;
  photosProOrigin: string;
}) {
  const owner = store.members.find((member) => member.roleKey === "owner") ?? store.members[0];
  const name = store.displayName || store.name;
  const [state, action, pending] = useActionState(updatePlatformStore, null);
  const [status, setStatus] = useState(store.status === "disabled" ? "disabled" : "active");
  const [copied, setCopied] = useState<"key" | "prompt" | "photos" | "photos-key" | null>(null);
  const active = status === "active";

  async function copyText(value: string, kind: "key" | "prompt" | "photos" | "photos-key") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="sticky top-0 z-[6] flex flex-wrap items-center gap-2 border-b border-[#ebebeb] bg-white px-3 py-2">
        <Link href="/platform" aria-label="חזרה לחנויות" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.12)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 6l4 4-4 4" />
          </svg>
        </Link>
        <Link href="/platform" className="text-sm text-ink-secondary no-underline">
          חנויות
        </Link>
        <span className="text-[#b5b5b5]">/</span>
        <span className="max-w-[280px] truncate text-sm font-semibold">{name}</span>
        <div className="min-w-2 flex-1" />
        <form action={enterClientStore}>
          <input type="hidden" name="storeId" value={store.id} />
          <button type="submit" className={softButton}>
            כניסה לניהול
          </button>
        </form>
        <button type="submit" form="store-details" disabled={pending} className={darkButton}>
          {pending ? "שומרים…" : "שמירה"}
        </button>
      </div>

      <form id="store-details" action={action} className="mx-auto grid w-full max-w-[1120px] items-start gap-10 px-4 py-4 min-[1000px]:grid-cols-[minmax(0,1fr)_280px] min-[1000px]:px-6">
        <input type="hidden" name="storeId" value={store.id} />
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5 py-2">
            <h1 className="m-0 text-[26px] leading-8 font-bold text-[#1a1a1a]">{name}</h1>
            <span
              className="inline-flex h-[22px] items-center rounded-md px-2 text-[13px] font-semibold"
              style={active ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#4a4a4a" }}
            >
              {active ? "פעילה" : "כבויה"}
            </span>
          </div>

          {state?.error ? (
            <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_#fdb5b0]">
              <div className="bg-[#fedad9] px-4 py-2.5 font-bold text-[#8e1f0b]">{state.error}</div>
            </div>
          ) : null}

          <div className={card}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">שם החנות</span>
              <input name="storeName" required minLength={2} defaultValue={name} className={field} />
            </label>
          </div>

          <h2 className="m-0 px-1 pt-4 text-[15px] font-semibold">דומיינים</h2>
          <div className={`${card} flex flex-col gap-4`}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">דומיין Vercel</span>
              <input name="hostname" required dir="ltr" defaultValue={store.previewHost || store.hostname || ""} placeholder="my-shop.vercel.app" className={`${field} text-left`} />
              <span className="mt-1.5 block text-[13px] text-ink-secondary">הדומיין בזמן הפיתוח. התנועה ממנו נספרת לחנות הזו.</span>
            </label>
            <label className="block border-t border-[#ebebeb] pt-4">
              <span className="mb-1.5 block text-sm font-semibold">דומיין אמיתי</span>
              <input name="primaryHost" dir="ltr" defaultValue={store.primaryHost ?? ""} placeholder="shop.co.il" className={`${field} text-left`} />
              <span className="mt-1.5 block text-[13px] text-ink-secondary">אפשר להשאיר ריק עד שהאתר מוכן. שני הדומיינים נספרים יחד.</span>
            </label>
          </div>

          <h2 className="m-0 px-1 pt-4 text-[15px] font-semibold">בעלים</h2>
          <div className={`${card} flex flex-col gap-4`}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">שם הבעלים</span>
              <input name="ownerName" required minLength={2} defaultValue={owner?.name ?? ""} className={field} />
            </label>
            <div className="grid gap-4 min-[700px]:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">אימייל לכניסה</span>
                <input name="ownerEmail" type="email" required dir="ltr" autoComplete="off" defaultValue={owner?.email ?? ""} className={`${field} text-left`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">סיסמה לבעלים</span>
                <input name="ownerPassword" type="text" minLength={8} dir="ltr" autoComplete="new-password" placeholder="השאר ריק כדי לא לשנות" className={`${field} text-left`} />
              </label>
            </div>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col pt-3 text-sm">
          <div className="border-b border-[#ebebeb] pb-4">
            <span className="mb-1.5 block font-semibold">סטטוס</span>
            <select name="status" value={status} onChange={(event) => setStatus(event.target.value)} className={field}>
              <option value="active">פעילה</option>
              <option value="disabled">כבויה</option>
            </select>
          </div>
          {store.trackingKey ? (
            <div className="flex flex-col gap-2 border-b border-[#ebebeb] py-4">
              <span className="font-semibold">מפתח מעקב</span>
              <div dir="ltr" className="truncate rounded-[10px] bg-[#f6f6f6] px-3 py-2 text-left text-[13px] text-ink">
                {store.trackingKey}
              </div>
              <button type="button" onClick={() => void copyText(store.trackingKey!, "key")} className={`${softButton} self-start`}>
                {copied === "key" ? "הועתק" : "העתקת מפתח"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    storeConnectionPrompt({
                      storeName: name,
                      trackingKey: store.trackingKey!,
                      hosts: [store.previewHost || store.hostname || "", store.primaryHost || ""],
                      supabaseUrl,
                      publishableKey,
                    }),
                    "prompt",
                  )
                }
                className={`${softButton} self-start`}
              >
                {copied === "prompt" ? "הועתק" : "העתקת חיבור לאתר"}
              </button>
              <span className="text-[13px] text-ink-secondary">מדביקים את החיבור בקורסור של האתר החדש. המפתח נשמר בשרת שלו.</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 border-b border-[#ebebeb] py-4">
            <span className="font-semibold">חיבור PhotosPro</span>
            {photosProKey ? (
              <>
                <span className="text-[13px] text-ink-secondary">
                  המפתח קבוע לחנות הזו. ב-PhotosPro בוחרים Storely ומדביקים את הכתובת ואת המפתח.
                </span>
                {photosProOrigin ? (
                  <div dir="ltr" className="truncate rounded-[10px] bg-[#f6f6f6] px-3 py-2 text-left text-[13px] text-ink">
                    {photosProOrigin}
                  </div>
                ) : (
                  <span className="text-[13px] text-ink-secondary">הכתובת היא כתובת ה-Storely עצמו, לא דומיין האתר של הלקוחה.</span>
                )}
                <div dir="ltr" className="truncate rounded-[10px] bg-[#f6f6f6] px-3 py-2 text-left text-[13px] text-ink">
                  {photosProKey}
                </div>
                {photosProOrigin ? (
                  <button type="button" onClick={() => void copyText(photosProOrigin, "photos")} className={`${softButton} self-start`}>
                    {copied === "photos" ? "הועתק" : "העתקת כתובת"}
                  </button>
                ) : null}
                <button type="button" onClick={() => void copyText(photosProKey, "photos-key")} className={`${softButton} self-start`}>
                  {copied === "photos-key" ? "הועתק" : "העתקת מפתח PhotosPro"}
                </button>
              </>
            ) : (
              <span className="text-[13px] text-ink-secondary">המפתח יופיע כאן אחרי שמעדכנים את מסד הנתונים של Storely.</span>
            )}
          </div>
          {owner ? (
            <div className="flex flex-col gap-1 py-4">
              <span className="text-[#4a4a4a]">פרטי קשר</span>
              <span className="font-medium">{owner.name}</span>
              <span dir="ltr" className="text-right text-[13px] text-ink-secondary">
                {owner.email}
              </span>
            </div>
          ) : null}
        </aside>
      </form>
      <div className="mx-auto w-full max-w-[1120px] px-4 pb-12 min-[1000px]:px-6">
        <StoreMessagingCard storeId={store.id} messaging={messaging} />
      </div>
    </div>
  );
}
