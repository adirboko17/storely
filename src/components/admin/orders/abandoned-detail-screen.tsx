"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { AssistantDock, CopyIcon, softButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import { abandonedSlug } from "@/data/mock/abandoned";
import { getOrderSessionVersion, listLiveCheckouts, patchCheckout, subscribeOrderSession } from "@/data/mock/order-session";
import { formatMoney } from "@/lib/formatting/money";
import { itemsLabel } from "@/lib/orders/present";

export function AbandonedDetailScreen({ checkoutId }: { checkoutId: string }) {
  const router = useRouter();
  const { toast, narrow } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const checkouts = listLiveCheckouts();
  const index = Math.max(0, checkouts.findIndex((item) => item.id === checkoutId));
  const checkout = checkouts[index];
  if (!checkout || checkout.id !== checkoutId) return null;

  const previous = index > 0 ? checkouts[index - 1] : null;
  const next = index < checkouts.length - 1 ? checkouts[index + 1] : null;
  const recovery = checkout.recovered
    ? { label: "שוחזרה", background: "#cdfee1", color: "#0c5132" }
    : { label: "לא שוחזרה", background: "#ffd6a4", color: "#5e4200" };
  const email = checkout.sent
    ? { label: "נשלח", background: "#cdfee1", color: "#0c5132" }
    : { label: "לא נשלח", background: "#ffd6a4", color: "#5e4200" };
  const quantity = checkout.lines.reduce((sum, line) => sum + line.quantity, 0);
  const noteValue = checkout.noteDraft != null ? checkout.noteDraft : (checkout.note ?? "");
  const noteDirty = checkout.noteDraft != null && checkout.noteDraft !== (checkout.note ?? "");
  const fullDate =
    (checkout.day === "היום" ? "13 באוקטובר 2026" : checkout.day === "אתמול" ? "12 באוקטובר 2026" : "אוקטובר 2026") +
    ", " +
    (checkout.date.split(" ב-").pop() ?? checkout.date);
  const link = `https://lavana.co.il/checkouts/${checkout.id.slice(1, 9)}/recover?key=9ce024fe1a`;

  return (
    <div data-screen-label="Abandoned checkout detail" className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button type="button" aria-label="חזרה" onClick={() => router.push("/admin/orders/abandoned")} className="grid size-[30px] place-items-center rounded-full border-0 bg-white text-ink shadow-[0_0_0_1px_rgba(0,0,0,.1)] hover:bg-[#f7f7f7]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 6l4 4-4 4" />
          </svg>
        </button>
        <Icon name="cart" size={18} className="text-ink" />
        <span className="flex-1 text-sm">עגלות נטושות</span>
        <button type="button" className={softButton} onClick={() => toast("העגלה נשלחה להדפסה")}>
          הדפסה
        </button>
        <button type="button" className={softButton}>
          פעולות נוספות
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>
        <div className="flex overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <button
            type="button"
            aria-label="הקודם"
            disabled={!previous}
            onClick={() => previous && router.push(`/admin/orders/abandoned/${abandonedSlug(previous.id)}`)}
            className="grid size-[30px] place-items-center border-0 bg-white"
            style={{ color: previous ? "#303030" : "#cccccc" }}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 12l4-4 4 4" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="הבא"
            disabled={!next}
            onClick={() => next && router.push(`/admin/orders/abandoned/${abandonedSlug(next.id)}`)}
            className="grid size-[30px] place-items-center border-0 bg-white"
            style={{ color: next ? "#303030" : "#cccccc" }}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1100px] items-start gap-10 px-5 py-4" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 300px" }}>
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 dir="ltr" className="m-0 text-2xl leading-[30px] font-bold">
                {checkout.id}
              </h1>
              <span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: recovery.background, color: recovery.color }}>
                {recovery.label}
              </span>
              <span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: email.background, color: email.color }}>
                {email.label}
              </span>
            </div>
            <div className="mt-0.5 text-sm text-[#4a4a4a]">ישראל, {fullDate}</div>
          </div>

          {!checkout.recovered ? (
            <div className="flex flex-col gap-3 rounded-[14px] bg-[#d8f3fb] p-4">
              <div className="flex items-center gap-2 text-[#0b3b4b]">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                  <circle cx="10" cy="10" r="8" fill="#0094d5" />
                  <path d="M10 9v5M10 6.2h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
                שלחו ללקוח את הקישור הזה כדי לשחזר את העגלה
              </div>
              <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-white/55 py-0 pr-3 pl-1.5">
                <span dir="ltr" className="min-w-0 flex-1 overflow-hidden text-left text-[13px] text-ellipsis whitespace-nowrap text-[#0b3b4b]">
                  {link}
                </span>
                <button type="button" aria-label="העתקה" onClick={() => toast("הקישור הועתק")} className="grid size-[26px] place-items-center rounded-lg border-0 bg-transparent text-[#0b3b4b] hover:bg-black/[.06]">
                  <CopyIcon />
                </button>
              </div>
              <button
                type="button"
                className="self-start h-[30px] rounded-[10px] border-0 bg-[#a8e4f5] px-3 text-sm font-semibold text-[#0b3b4b] hover:bg-[#93dbf0]"
                onClick={() => {
                  patchCheckout(checkout.id, {
                    sent: true,
                    log: [...(checkout.log ?? []), `דוא״ל שחזור נשלח אל ${checkout.email || checkout.phone} · עכשיו`],
                  });
                  toast("דוא״ל השחזור נשלח");
                }}
              >
                {checkout.sent ? "שליחה חוזרת של דוא״ל שחזור" : "שליחת דוא״ל לשחזור העגלה"}
              </button>
            </div>
          ) : null}

          <div className="mt-2 flex items-center">
            <h2 className="m-0 flex-1 text-base font-semibold">פרטי העגלה</h2>
            <span className="text-sm text-ink">מתוך {checkout.source}</span>
          </div>
          <section className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="rounded-xl border border-[#ebebeb]">
              {checkout.lines.map((line, lineIndex) => (
                <div key={`${line.product.id}-${lineIndex}`} className="grid grid-cols-[40px_minmax(0,1fr)_100px_90px] items-start gap-3.5 border-b border-[#f1f1f1] p-3.5">
                  <span className="size-10 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: line.product.tone }} />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Link href={`/admin/products/${line.product.id}`} className="text-pretty text-ink underline">
                      {line.product.title}
                    </Link>
                    <span className="inline-flex h-5 items-center self-start rounded-md bg-[#ebebeb] px-1.5 text-xs">{line.product.variant}</span>
                  </div>
                  <span dir="ltr" className="text-right whitespace-nowrap">
                    {formatMoney(line.product.price)} × {line.quantity}
                  </span>
                  <span dir="ltr" className="text-left whitespace-nowrap">
                    {formatMoney(line.product.price * line.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 py-1">
              <span>סכום ביניים</span>
              <span>{itemsLabel(quantity)}</span>
              <span dir="ltr">{formatMoney(checkout.subtotal)}</span>
              <span>משלוח</span>
              <span>{checkout.shipCost ? "שליח עד הבית" : "משלוח חינם עד הבית"}</span>
              <span dir="ltr">{formatMoney(checkout.shipCost)}</span>
              <span>מע״מ משוער</span>
              <span>כלול במחיר</span>
              <span dir="ltr">{formatMoney((checkout.total * 18) / 118)}</span>
              <b>סה״כ</b>
              <span />
              <b dir="ltr">{formatMoney(checkout.total)}</b>
            </div>
            <div className="flex justify-between border-t border-[#ebebeb] pt-3">
              <span>לתשלום על ידי הלקוח</span>
              <span dir="ltr">{formatMoney(checkout.total)}</span>
            </div>
          </section>
          <section className="flex flex-col gap-2.5 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <span className="font-semibold">הערות</span>
            <input
              value={noteValue}
              onChange={(event) => patchCheckout(checkout.id, { noteDraft: event.target.value })}
              placeholder="הוספת הערה לעגלה הזו"
              className="h-[34px] w-full rounded-[10px] border border-[#c4c4c4] px-3 text-sm outline-none"
            />
            <button
              type="button"
              className="self-end h-[30px] rounded-[10px] border-0 px-3.5 text-sm font-semibold"
              style={{ background: noteDirty ? "#1a1a1a" : "#ebebeb", color: noteDirty ? "#fff" : "#b5b5b5" }}
              onClick={() => {
                if (checkout.noteDraft == null) return;
                patchCheckout(checkout.id, { note: checkout.noteDraft, noteDraft: null });
                toast("ההערה נשמרה");
              }}
            >
              שמירה
            </button>
          </section>
          {checkout.log?.length ? (
            <div className="flex flex-col gap-1.5 text-[13px] text-ink-secondary">
              {checkout.log.map((entry) => (
                <span key={entry}>{entry}</span>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="flex flex-col gap-[22px] pt-1.5 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[#4a4a4a]">לקוח</span>
            <a
              href="#customer"
              dir="auto"
              className="text-right text-ink underline"
              onClick={(event) => {
                event.preventDefault();
                toast("ללקוח הזה אין עדיין פרופיל, כי לא השלים הזמנה");
              }}
            >
              {checkout.name}
            </a>
            <span>אין הזמנות</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[#4a4a4a]">פרטי קשר</span>
            <div className="flex items-center gap-2">
              <a href="#email" dir="ltr" className="storely-link flex-1 text-right" onClick={(event) => event.preventDefault()}>
                {checkout.email || "—"}
              </a>
              <button type="button" aria-label="העתקה" onClick={() => toast("כתובת הדוא״ל הועתקה")} className="grid size-6 place-items-center border-0 bg-transparent text-[#4a4a4a]">
                <CopyIcon />
              </button>
            </div>
            <span>אין חשבון</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center">
              <span className="flex-1 text-[#4a4a4a]">כתובת למשלוח</span>
              <button type="button" aria-label="העתקה" onClick={() => toast("הכתובת הועתקה")} className="grid size-6 place-items-center border-0 bg-transparent text-[#4a4a4a]">
                <CopyIcon />
              </button>
            </div>
            <span>{checkout.name}</span>
            <span>{checkout.street}</span>
            <span>
              {checkout.city} <span dir="ltr">{checkout.zip}</span>
            </span>
            <span>ישראל</span>
            <span dir="ltr" className="text-right">
              {checkout.phone}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[#4a4a4a]">כתובת לחיוב</span>
            <span>זהה לכתובת המשלוח</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[#4a4a4a]">הרשמה לדיוור</span>
            <span>{checkout.subscribed ? "מנוי לדיוור בדוא״ל" : "לא רשום לאף ערוץ"}</span>
          </div>
        </aside>
      </div>
      <div className="flex-1" />
      <AssistantDock />
    </div>
  );
}
