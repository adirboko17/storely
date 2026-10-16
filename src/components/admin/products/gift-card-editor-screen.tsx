"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { currencySymbol } from "@/lib/formatting/currency";
import { createGiftCard, deleteGiftCard, getCatalogVersion, listGiftCards, subscribeCatalog, updateGiftCard } from "@/data/mock/catalog-session";
import { getPeopleVersion, listPeople, subscribePeople } from "@/data/mock/people-session";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function freshCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let index = 0; index < 16; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function yearsFromNow(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return isoDate(date);
}

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function GiftCardEditorScreen({ cardCode = null }: { cardCode?: string | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
  const catalogVersion = useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  const existing = cardCode ? listGiftCards().find((card) => card.code === cardCode) ?? null : null;
  const [code, setCode] = useState(() => (cardCode ? "" : freshCode()));
  const [value, setValue] = useState("10.00");
  const [expires, setExpires] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [loadedCode, setLoadedCode] = useState<string | null>(cardCode ? null : "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [picker, setPicker] = useState(false);

  if (existing && loadedCode !== existing.code) {
    setLoadedCode(existing.code);
    setCode(existing.code);
    setValue(existing.value.toFixed(2));
    setExpires(existing.expires || null);
    setCustomer(existing.customer);
    setNote(existing.note ?? "");
  }

  const settled = !existing || loadedCode === existing.code;
  const dirty = !settled
    ? false
    : existing
      ? code !== existing.code || value !== existing.value.toFixed(2) || (expires || "") !== (existing.expires || "") || customer !== existing.customer || note !== (existing.note ?? "")
      : true;

  function discard() {
    if (!existing) {
      router.push("/admin/products/gift-cards");
      return;
    }
    setCode(existing.code);
    setValue(existing.value.toFixed(2));
    setExpires(existing.expires || null);
    setCustomer(existing.customer);
    setNote(existing.note ?? "");
  }

  function save() {
    const amount = Number.parseFloat(value);
    const nextCode = code.trim();
    if (!nextCode) {
      toast("יש להזין קוד לכרטיס");
      return;
    }
    if (!(amount > 0)) {
      toast(`יש להזין ערך גבוה מ-${currencySymbol()}0`);
      return;
    }
    if (listGiftCards().some((card) => card.code === nextCode && card.code !== existing?.code)) {
      toast("הקוד הזה כבר בשימוש");
      return;
    }
    const next = { code: nextCode, value: amount, customer: customer.trim(), expires: expires ?? "", note: note.trim() };
    if (existing) {
      updateGiftCard(existing.code, next);
      toast("כרטיס המתנה עודכן");
    } else {
      createGiftCard(next);
      toast("כרטיס המתנה נוצר");
    }
    router.push("/admin/products/gift-cards");
  }

  function remove() {
    if (!existing) return;
    deleteGiftCard(existing.code);
    toast("כרטיס המתנה נמחק");
    router.push("/admin/products/gift-cards");
  }

  useUnsavedEditor(dirty, false, save, discard);
  if (cardCode && catalogVersion > 0 && !existing) notFound();

  const people = listPeople();
  const query = customerQuery.trim();
  const matches = people.filter((person) => !query || `${person.name} ${person.email}`.includes(query)).slice(0, 8);

  return (
    <div className="min-h-full px-4 py-4">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="mb-4 flex items-center gap-2">
          <Link href="/admin/products/gift-cards" aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
          </Link>
          <Link href="/admin/products/gift-cards" className="flex flex-1 items-center gap-1.5 text-sm font-medium text-ink no-underline">
            <Icon name="card" size={16} strokeWidth={1.6} />
            כרטיסי מתנה
          </Link>
          {existing ? <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={remove}>מחיקה</button> : null}
        </div>
        <h1 className="m-0 text-[22px] font-bold">{existing ? "עריכת כרטיס מתנה" : "יצירת כרטיס מתנה"}</h1>
        <div className="mt-5 grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="mb-2 text-sm font-semibold">פרטי כרטיס המתנה</div>
            <div className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <label className="block text-[13px] font-medium">קוד כרטיס המתנה
                <input dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-3 text-end text-sm outline-none focus:border-[#303030]" />
              </label>
              <div className="mt-3 grid items-start gap-3 min-[640px]:grid-cols-2">
                <label className="block text-[13px] font-medium">ערך התחלתי
                  <span className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-[#c9c9c9] bg-white px-3 focus-within:border-[#303030]">
                    <span className="text-sm text-[#616161]">{currencySymbol()}</span>
                    <input dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-end text-sm outline-none" />
                  </span>
                </label>
                <div className="relative">
                  <div className="text-[13px] font-medium">תאריך תפוגה</div>
                  <button type="button" className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[#f1f1f1] px-3 text-sm font-medium" onClick={() => setPicker((open) => !open)}>
                    <Icon name="calendar" size={15} strokeWidth={1.6} />
                    {expires ?? "ללא תפוגה"}
                  </button>
                  <p className="m-0 mt-1.5 text-[12px] text-[#616161]">תוקף כרטיסי מתנה יכול להשתנות לפי מדינה</p>
                  {picker ? <ExpiryPicker value={expires} onClose={() => setPicker(false)} onDone={(next) => { setExpires(next); setPicker(false); }} /> : null}
                </div>
              </div>
            </div>
          </div>
          <aside className="flex flex-col gap-3">
            <div className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <div className="mb-1.5 text-[13px] font-medium">לקוח</div>
              {customer ? (
                <div className="flex items-center gap-2 rounded-lg bg-[#f6f6f7] px-2.5 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{customer}</span>
                  <button type="button" className="border-0 bg-transparent text-[#616161]" onClick={() => setCustomer("")} aria-label="הסרת לקוח">×</button>
                </div>
              ) : (
                <div className="relative">
                  <Icon name="search" size={15} strokeWidth={1.8} className="pointer-events-none absolute top-2.5 right-2.5 text-[#8a8a8a]" />
                  <input
                    value={customerQuery}
                    placeholder="חיפוש או יצירת לקוח"
                    onFocus={() => setCustomerOpen(true)}
                    onBlur={() => setCustomerOpen(false)}
                    onChange={(event) => { setCustomerQuery(event.target.value); setCustomerOpen(true); }}
                    className="h-9 w-full rounded-lg border border-[#c9c9c9] bg-white pr-8 pl-3 text-sm outline-none focus:border-[#303030]"
                  />
                  {customerOpen ? (
                    <div className="absolute inset-x-0 top-10 z-20 max-h-64 overflow-auto rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]" onMouseDown={(event) => event.preventDefault()}>
                      {matches.map((person) => (
                        <button key={person.id} type="button" className="flex w-full flex-col rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { setCustomer(person.name); setCustomerQuery(""); setCustomerOpen(false); }}>
                          <span className="font-medium">{person.name}</span>
                          {person.email ? <span className="text-[12px] text-[#616161]">{person.email}</span> : null}
                        </button>
                      ))}
                      {query ? (
                        <button type="button" className="w-full rounded-lg border-0 bg-transparent px-2 py-2 text-start text-sm font-semibold hover:bg-[#f1f1f1]" onClick={() => { setCustomer(query); setCustomerQuery(""); setCustomerOpen(false); }}>
                          יצירת לקוח «{query}»
                        </button>
                      ) : null}
                      {matches.length === 0 && !query ? <div className="px-2 py-2 text-sm text-[#616161]">אין לקוחות עדיין</div> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-medium">הערות</span>
                <button type="button" aria-label="עריכת הערה" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#303030] hover:bg-[#f1f1f1]" onClick={() => setNoteOpen((open) => !open)}>
                  <Icon name="pencil" size={15} strokeWidth={1.6} />
                </button>
              </div>
              {noteOpen ? (
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="הוספת הערה" className="mt-2 w-full resize-none rounded-lg border border-[#c9c9c9] bg-white p-2 text-sm outline-none focus:border-[#303030]" />
              ) : (
                <p className="m-0 mt-1 text-sm text-[#8a8a8a]">{note.trim() || "אין הערות"}</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ExpiryPicker({ value, onClose, onDone }: { value: string | null; onClose: () => void; onDone: (next: string | null) => void }) {
  const today = useMemo(() => new Date(), []);
  const initial = value ? parseIso(value) : today;
  const [pending, setPending] = useState<string | null>(value);
  const [cursor, setCursor] = useState(() => new Date((initial ?? today).getFullYear(), (initial ?? today).getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array.from({ length: leading }, () => 0), ...Array.from({ length: count }, (_, index) => index + 1)];
  const todayIso = isoDate(today);
  const presets = [
    { label: "ללא תפוגה", date: null },
    { label: "שנה מעכשיו", date: yearsFromNow(1) },
    { label: "3 שנים מעכשיו", date: yearsFromNow(3) },
    { label: "5 שנים מעכשיו", date: yearsFromNow(5) },
  ];

  function choose(date: string | null) {
    setPending(date);
    const parsed = date ? parseIso(date) : null;
    if (parsed) setCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }

  return (
    <>
      <button type="button" aria-label="סגירה" className="fixed inset-0 z-20 cursor-default border-0 bg-transparent" onClick={onClose} />
      <div className="absolute top-14 z-30 w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_rgba(0,0,0,.16),0_0_0_1px_rgba(0,0,0,.08)]">
      <div className="grid min-[520px]:grid-cols-[180px_minmax(0,1fr)]">
        <div className="border-b border-[#ebebeb] p-2 min-[520px]:border-b-0 min-[520px]:border-l">
          {presets.map((preset) => {
            const on = preset.date === pending;
            return (
              <button key={preset.label} type="button" className="flex h-9 w-full items-center justify-between rounded-lg border-0 px-2 text-start text-sm" style={{ background: on ? "#f1f1f1" : "transparent" }} onClick={() => choose(preset.date)}>
                <span>{preset.label}</span>
                {on ? <Icon name="check" size={14} strokeWidth={1.8} /> : null}
              </button>
            );
          })}
        </div>
        <div className="p-3">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-lg bg-[#f3f3f3] px-3 text-sm text-[#616161]">
            <Icon name="calendar" size={15} strokeWidth={1.6} />
            <span dir="ltr">{pending ?? "YYYY-MM-DD"}</span>
          </div>
          <div className="mb-2 flex items-center justify-between px-1">
            <button type="button" aria-label="חודש קודם" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f1f1f1]" onClick={() => setCursor(new Date(year, month - 1, 1))}>›</button>
            <span className="text-sm font-semibold">{MONTHS[month]} {year}</span>
            <button type="button" aria-label="חודש הבא" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent hover:bg-[#f1f1f1]" onClick={() => setCursor(new Date(year, month + 1, 1))}>‹</button>
          </div>
          <div dir="rtl" className="grid grid-cols-7 text-center text-[12px] text-[#616161]">
            {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div dir="rtl" className="grid grid-cols-7 text-center text-sm">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} />;
              const date = isoDate(new Date(year, month, day));
              const selected = date === pending;
              const isToday = date === todayIso;
              return (
                <button key={date} type="button" className="mx-auto grid size-8 place-items-center rounded-full border-0 bg-transparent text-sm" style={{ background: selected ? "#303030" : "transparent", color: selected ? "#fff" : "#303030", boxShadow: isToday && !selected ? "inset 0 0 0 1px #303030" : "none" }} onClick={() => choose(date)}>{day}</button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#ebebeb] px-3 py-2.5">
        <button type="button" className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold" onClick={onClose}>ביטול</button>
        <button type="button" className="h-8 rounded-lg border-0 bg-[#e3e3e3] px-3 text-sm font-semibold" onClick={() => onDone(pending)}>אישור</button>
      </div>
      </div>
    </>
  );
}
