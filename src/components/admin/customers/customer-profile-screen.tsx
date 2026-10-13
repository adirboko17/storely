"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { customerSpent } from "@/components/admin/customers/customers-list-screen";
import { getPeopleVersion, getPerson, listPeople, patchProfile, profileOf, subscribePeople } from "@/data/mock/people-session";
import { getOrderSessionVersion, listResolvedOrders, subscribeOrderSession } from "@/data/mock/order-session";
import { formatMoney } from "@/lib/formatting/money";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const SINCE = ["מרץ 2024", "יוני 2024", "אוגוסט 2024", "ינואר 2025", "פברואר 2025", "אפריל 2025", "מאי 2025", "יולי 2025", "ספטמבר 2025", "נובמבר 2025", "דצמבר 2025", "פברואר 2026"];

export function CustomerProfileScreen({ customerId }: { customerId: number }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const person = getPerson(customerId);
  const people = listPeople();
  const index = people.findIndex((item) => item.id === customerId);
  const [comment, setComment] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [noteEdit, setNoteEdit] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [street, setStreet] = useState("");
  const [more, setMore] = useState(false);
  const [blockMenu, setBlockMenu] = useState(false);
  if (!person) notFound();
  const profile = profileOf(person);
  const orders = listResolvedOrders().filter((order) => order.customer.id === person.id);
  const last = orders[0];
  const spent = customerSpent(person.id, person.orders);
  const rfm = person.orders >= 8 ? "אלופים" : person.orders >= 4 ? "נאמנים" : person.orders >= 2 ? "מבטיחים" : "חדשים";

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[6] flex items-center gap-2 border-b border-[#ebebeb] bg-[#fafafa] px-3.5 py-2.5">
        <Link href="/admin/customers" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="flex flex-1 gap-1.5 text-sm"><Link href="/admin/customers" className="text-ink no-underline">לקוחות</Link><span className="text-[#b5b5b5]">/</span><b>{person.name}</b></span>
        <button type="button" className={softButton}>פעולות נוספות</button>
        <div className="flex overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <button type="button" aria-label="הקודם" disabled={index <= 0} className="grid size-[30px] place-items-center border-0 bg-white disabled:text-[#ccc]" onClick={() => index > 0 && router.push(`/admin/customers/${people[index - 1]?.id}`)}>↑</button>
          <button type="button" aria-label="הבא" disabled={index < 0 || index >= people.length - 1} className="grid size-[30px] place-items-center border-0 bg-white disabled:text-[#ccc]" onClick={() => index < people.length - 1 && router.push(`/admin/customers/${people[index + 1]?.id}`)}>↓</button>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1100px] items-start gap-10 px-5 py-4 min-[1000px]:grid-cols-[minmax(0,1fr)_290px]">
        <div className="flex min-w-0 flex-col gap-4">
          <h1 dir="auto" className="m-0 text-right text-2xl leading-[30px] font-bold">{person.name}</h1>
          <div className="grid overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)] min-[800px]:grid-cols-4">
            {[["סכום שהוצא", formatMoney(spent)], ["הזמנות", String(person.orders)], ["לקוח מאז", SINCE[person.id] ?? "אוקטובר 2026"], ["פלח RFM", rfm]].map(([label, value], itemIndex) => (
              <div key={label} className="flex flex-col gap-1 px-[18px] py-3.5" style={{ borderInlineStart: itemIndex ? "1px solid #ebebeb" : undefined }}>
                <span className="self-start text-sm font-semibold underline decoration-dotted decoration-[#8a8a8a] underline-offset-[3px]">{label}</span>
                <b dir={label === "סכום שהוצא" ? "ltr" : undefined}>{value}</b>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <h2 className="m-0 flex-1 text-base font-semibold">ההזמנה האחרונה</h2>
            <button type="button" className="rounded-lg border-0 bg-transparent px-1.5 py-1 text-sm font-medium" onClick={() => router.push("/admin/orders")}>לכל ההזמנות</button>
            <button type="button" className={darkButton} onClick={() => router.push("/admin/orders/drafts")}>יצירת הזמנה</button>
          </div>
          <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            {last ? (
              <>
                <div className="border-b border-[#ebebeb] px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/orders/${last.id}`} dir="ltr" className="text-[15px] font-bold text-ink no-underline">#{last.id}</Link>
                    <b dir="ltr" className="ms-auto text-[15px]">{formatMoney(last.total)}</b>
                  </div>
                  <span className="text-sm text-[#4a4a4a]">{last.date} · דרך {last.channel}</span>
                </div>
                {(more ? last.lines : last.lines.slice(0, 3)).map((line) => (
                  <div key={line.product.id} className="grid grid-cols-[40px_minmax(0,1fr)_50px_90px] items-center gap-3.5 border-b border-[#f1f1f1] px-4 py-3.5">
                    <span className="size-10 rounded-lg" style={{ background: line.product.tone }} />
                    <span className="font-medium">{line.product.title}</span>
                    <span dir="ltr">× {line.quantity}</span>
                    <span dir="ltr" className="text-left">{formatMoney(line.product.price * line.quantity)}</span>
                  </div>
                ))}
                {last.lines.length > 3 ? <button type="button" className="h-11 w-full border-0 bg-white text-sm font-medium" onClick={() => setMore((value) => !value)}>{more ? "הצגת פחות" : "הצגת כל הפריטים"}</button> : null}
              </>
            ) : <div className="p-6 text-ink-secondary">עדיין אין הזמנות ללקוח הזה.</div>}
          </div>
          <h2 className="m-0 mt-4 text-base font-semibold">בלוקים</h2>
          <div className="flex flex-col items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[#d4d4d4] p-4">
            {profile.blocks.map((block) => (
              <div key={block.title} className="flex w-full items-center gap-2 rounded-[14px] bg-white px-3.5 py-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                <span className="flex-1 font-semibold">{block.title}</span>
                <span className="text-[#4a4a4a]">{block.value}</span>
                <button type="button" aria-label="הסרה" className="border-0 bg-transparent text-ink-secondary" onClick={() => patchProfile(person.id, { blocks: profile.blocks.filter((item) => item.title !== block.title) })}>×</button>
              </div>
            ))}
            <div className="relative">
              <button type="button" className="inline-flex h-[30px] items-center rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => setBlockMenu((open) => !open)}>בלוק</button>
              {blockMenu ? (
                <div className="absolute top-9 z-50 w-[220px] -translate-x-1/2 rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)] left-1/2">
                  {[["נקודות נאמנות", "120"], ["הזמנה פתוחה", "אין"], ["העדפת משלוח", "שליח"]].map(([title, value]) => (
                    <button key={title} type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { patchProfile(person.id, { blocks: [...profile.blocks.filter((item) => item.title !== title), { title, value }] }); setBlockMenu(false); }}>{title}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <h2 className="m-0 mt-4 text-base font-semibold">ציר זמן</h2>
          <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="flex items-center gap-3 p-3">
              <span className="grid size-10 place-items-center rounded-[10px] bg-[#e0f0ff] text-[13px] font-bold text-[#00527c]">מב</span>
              <input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && comment.trim()) { patchProfile(person.id, { comments: [{ text: comment.trim(), time: "עכשיו" }, ...profile.comments] }); setComment(""); } }} placeholder="הוספת הערה…" className="h-[34px] min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
            </div>
            <div className="flex items-center bg-[#f7f7f7] px-3 py-2">
              <button type="button" className="ms-auto h-7 rounded-[10px] border-0 px-3.5 text-[13px] font-semibold" style={{ background: comment.trim() ? "#303030" : "#e3e3e3", color: comment.trim() ? "#fff" : "#8a8a8a" }} onClick={() => { if (!comment.trim()) return; patchProfile(person.id, { comments: [{ text: comment.trim(), time: "עכשיו" }, ...profile.comments] }); setComment(""); }}>פרסום</button>
            </div>
          </div>
          <span className="self-end text-[13px] text-[#4a4a4a]">רק אתם ושאר הצוות יכולים לראות הערות</span>
          <div className="relative flex flex-col pe-8">
            <div className="absolute inset-y-3 right-2 w-0.5 bg-[#d4d4d4]" />
            {profile.comments.map((item) => (
              <div key={item.text} className="relative py-2">
                <span className="absolute top-3 -right-[21px] size-3 rounded-[3px] bg-[#303030] shadow-[0_0_0_3px_#fafafa]" />
                <div className="flex gap-3"><b className="flex-1 font-normal"><b>מאיה ברק: </b>{item.text}</b><span className="text-[13px] text-[#4a4a4a]">{item.time}</span></div>
              </div>
            ))}
            <div className="relative py-2">
              <span className="absolute top-3 -right-[21px] size-3 rounded-[3px] bg-[#303030] shadow-[0_0_0_3px_#fafafa]" />
              <div>הלקוח נוסף לחנות · {SINCE[person.id] ?? "אוקטובר 2026"}</div>
            </div>
          </div>
        </div>
        <aside className="flex flex-col gap-5 pt-1 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[#4a4a4a]">פרטי קשר</span>
            <div className="flex items-center gap-2">
              <a dir="ltr" href={`mailto:${person.email}`} className="flex-1 text-right">{person.email}</a>
              <button type="button" aria-label="העתקה" className="border-0 bg-transparent" onClick={() => { void navigator.clipboard?.writeText(person.email); toast("הדוא״ל הועתק"); }}>העתק</button>
            </div>
            <span>יקבל הודעות בעברית</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center"><span className="flex-1 text-[#4a4a4a]">כתובת ברירת מחדל</span><button type="button" aria-label="הוספת כתובת" className="border-0 bg-transparent" onClick={() => setAddressOpen(true)}>עריכה</button></div>
            <span>{person.name}</span>
            <span>{person.street || "אין רחוב"}</span>
            <span>{person.city} <span dir="ltr">{person.zip}</span></span>
            <span>ישראל</span>
            <span dir="ltr" className="text-right">{person.phone}</span>
          </div>
          <button type="button" className="flex items-center gap-2 border-0 bg-transparent p-0 text-start text-sm" onClick={() => { patchProfile(person.id, { subscribed: !profile.subscribed }); toast(profile.subscribed ? "הלקוח הוסר מדיוור" : "הלקוח נרשם לדיוור"); }}>
            <span className="relative h-4 w-7 rounded-full" style={{ background: profile.subscribed ? "#303030" : "#d4d4d4" }}><span className="absolute top-0.5 size-3 rounded-full bg-white" style={{ left: profile.subscribed ? 14 : 2 }} /></span>
            {profile.subscribed ? "מנוי לדיוור" : "לא מנוי לדיוור"}
          </button>
          <span className="text-[#4a4a4a]">פרטי מס · גביית מע״מ</span>
          <div className="h-px bg-[#e3e3e3]" />
          <div className="flex items-center"><span className="flex-1 text-[#4a4a4a]">קרדיט בחנות</span><button type="button" className="border-0 bg-transparent" onClick={() => { patchProfile(person.id, { credit: profile.credit + 50 }); toast("נוסף קרדיט של ₪50"); }}>עריכה</button></div>
          <span>{formatMoney(profile.credit)}</span>
          <div className="h-px bg-[#e3e3e3]" />
          <div className="flex flex-col gap-2">
            <span className="font-semibold">תגיות</span>
            <div className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-[10px] border border-[#c4c4c4] bg-white p-1">
              {profile.tags.map((tag) => (
                <span key={tag} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-[#ebebeb] ps-2 pe-1 text-[13px]">{tag}<button type="button" aria-label="הסרה" className="border-0 bg-transparent" onClick={() => patchProfile(person.id, { tags: profile.tags.filter((item) => item !== tag) })}>×</button></span>
              ))}
              <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && tagInput.trim()) { patchProfile(person.id, { tags: profile.tags.includes(tagInput.trim()) ? profile.tags : [...profile.tags, tagInput.trim()] }); setTagInput(""); } }} placeholder="+ הוספת תגיות" className="h-[26px] min-w-[90px] flex-1 border-0 text-[13px] outline-none" style={clearInput} />
            </div>
          </div>
          <div className="h-px bg-[#e3e3e3]" />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center"><span className="flex-1 text-[#4a4a4a]">הערות</span><button type="button" aria-label="עריכה" className="border-0 bg-transparent" onClick={() => { setNoteDraft(profile.note); setNoteEdit(true); }}>עריכה</button></div>
            {noteEdit ? (
              <>
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={3} className="rounded-[10px] border border-[#c4c4c4] bg-white p-2 text-sm outline-none" />
                <div className="flex justify-end gap-1.5">
                  <button type="button" className={softButton} onClick={() => setNoteEdit(false)}>ביטול</button>
                  <button type="button" className="h-7 rounded-[10px] border-0 bg-[#1a1a1a] px-3 text-[13px] font-semibold text-white" onClick={() => { patchProfile(person.id, { note: noteDraft }); setNoteEdit(false); toast("ההערה נשמרה"); }}>שמירה</button>
                </div>
              </>
            ) : <span className="text-pretty">{profile.note || "אין הערות"}</span>}
          </div>
        </aside>
      </div>
      <div className="flex-1" />
      {addressOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setAddressOpen(false)}>
          <div role="dialog" aria-label="כתובת" className="w-full max-w-[440px] rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">עדכון כתובת</h2>
            <p className="text-sm text-[#4a4a4a]">{person.street || "אין כתובת"} · {person.city}</p>
            <label className="mt-2 block text-sm font-semibold">רחוב<input value={street} onChange={(event) => setStreet(event.target.value)} className="mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal" /></label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={softButton} onClick={() => setAddressOpen(false)}>ביטול</button>
              <button type="button" className={darkButton} onClick={() => { toast(street.trim() ? "הכתובת נשמרה בהערות הצוות" : "לא הוזן רחוב"); if (street.trim()) patchProfile(person.id, { note: `${profile.note}\nכתובת נוספת: ${street.trim()}`.trim() }); setAddressOpen(false); }}>שמירה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
