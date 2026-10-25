"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { currencySymbol } from "@/lib/formatting/currency";
import { formatMoney0 } from "@/lib/formatting/money";
import {
  blankEvent,
  deleteEvent,
  duplicateEvent,
  getEvent,
  importRegistrations,
  listRegistrations,
  paragraphs,
  parseRegistrationCsv,
  paymentLabel,
  registrationCsv,
  removeEventImage,
  sampleRegistrationCsv,
  saveEvent,
  stageLabel,
  statusLabel,
  uploadEventImage,
  type EventRegistration,
  type EventStatus,
  type StoreEvent,
} from "@/lib/events/events";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-[#303030] outline-none placeholder:text-[#8a8a8a] focus:border-[#303030]";
const area = "w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm leading-6 text-[#303030] outline-none placeholder:text-[#8a8a8a] focus:border-[#303030]";
const card = "flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]";
const invalid = "!border-[#e51c00] !bg-[#fff4f4]";

const STATUS_OPTIONS: { value: EventStatus; hint: string }[] = [
  { value: "draft", hint: "לא מופיע באתר" },
  { value: "open", hint: "מופיע באתר ופתוח להרשמה" },
  { value: "full", hint: "מופיע באתר, ההרשמה סגורה" },
  { value: "ended", hint: "מופיע באתר כאירוע שעבר" },
  { value: "cancelled", hint: "מופיע באתר כמבוטל" },
];

const statusTone: Record<EventStatus, string> = {
  open: "bg-[#e3f1df] text-[#0c5132]",
  full: "bg-[#fff1e3] text-[#5e4200]",
  ended: "bg-[#f1f1f1] text-[#4a4a4a]",
  cancelled: "bg-[#fde8e6] text-[#8a1f11]",
  draft: "bg-[#f1f1f1] text-[#4a4a4a]",
};

type FieldKey = "title" | "short" | "body" | "slug" | "date" | "time" | "address" | "zoom" | "price";
type Form = { event: StoreEvent; body: string; paid: boolean };

function autoSlug(title: string, date: string) {
  const latin = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return latin || (date ? `event-${date}` : "");
}

function problems({ event, body, paid }: Form) {
  const found: Partial<Record<FieldKey, string>> = {};
  if (!event.title.trim()) found.title = "צריך שם לאירוע";
  else if (event.title.trim().length > 120) found.title = "עד 120 תווים";
  if (event.short.trim().length > 280) found.short = "עד 280 תווים";
  if (/[<>]/.test(body)) found.body = "בלי HTML. כותבים טקסט רגיל";
  if (!event.slug.trim()) found.slug = "צריך כתובת לעמוד";
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(event.slug.trim())) found.slug = "רק אותיות באנגלית, מספרים ומקף";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) found.date = "צריך תאריך";
  if (!event.from || !event.to) found.time = "צריך שעת התחלה ושעת סיום";
  else if (event.to <= event.from) found.time = "שעת הסיום צריכה להיות אחרי שעת ההתחלה";
  if (!event.online && !event.address.trim()) found.address = "צריך כתובת למפגש";
  if (event.online && event.zoomUrl.trim() && !event.zoomUrl.trim().startsWith("https://")) found.zoom = "הקישור צריך להתחיל ב-https://";
  if (paid && (!Number.isInteger(event.price) || event.price < 1)) found.price = "צריך מחיר";
  return found;
}

function longDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function shortDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function duration(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const minutes = th * 60 + tm - (fh * 60 + fm);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = hours === 0 ? "" : hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
  if (!rest) return hourText;
  if (rest === 30 && hours) return `${hourText} וחצי`;
  return hourText ? `${hourText} ו-${rest} דקות` : `${rest} דקות`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Field({ label, hint, error, counter, children }: { label: string; hint?: ReactNode; error?: string; counter?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        {counter ? <span className="text-xs text-[#616161]" dir="ltr">{counter}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-[13px] text-[#8e1f0b]">{error}</span> : hint ? <span className="mt-1.5 block text-[12px] leading-5 text-[#616161]">{hint}</span> : null}
    </label>
  );
}

function Choice({ selected, title, hint, onClick }: { selected: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex flex-1 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-start ${selected ? "border-[#303030] bg-[#f7f7f7] shadow-[inset_0_0_0_1px_#303030]" : "border-[#d9d9d9] bg-white hover:bg-[#fafafa]"}`}
    >
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${selected ? "border-[#303030]" : "border-[#8a8a8a]"}`}>
        {selected ? <span className="size-2 rounded-full bg-[#303030]" /> : null}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[12px] text-[#616161]">{hint}</span>
      </span>
    </button>
  );
}

export function EventEditorScreen({ eventId }: { eventId: string | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<StoreEvent | null>(eventId ? null : blankEvent());
  const [body, setBody] = useState("");
  const [paid, setPaid] = useState(false);
  const [baseline, setBaseline] = useState<Form | null>(eventId ? null : { event: blankEvent(), body: "", paid: false });
  const [stored, setStored] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(eventId));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [registrations, setRegistrations] = useState<EventRegistration[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    getEvent(eventId)
      .then((event) => {
        if (!alive) return;
        if (!event) {
          setMissing(true);
          return;
        }
        const form = { event, body: event.body.join("\n\n"), paid: event.price > 0 };
        setDraft(form.event);
        setBody(form.body);
        setPaid(form.paid);
        setBaseline(form);
        setStored(true);
      })
      .catch((error: Error) => {
        if (!alive) return;
        setLoadError(error.message);
      });
    listRegistrations(eventId)
      .then((rows) => { if (alive) setRegistrations(rows); })
      .catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [eventId, toast]);

  const form: Form | null = draft ? { event: draft, body, paid } : null;
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify({ ...baseline, event: { ...baseline.event, id: form.event.id } }));
  const errors = form && tried ? problems(form) : {};

  useUnsavedEditor(dirty, saving, () => void save(), discard);

  function patch(next: Partial<StoreEvent>) {
    setDraft((current) => {
      if (!current) return current;
      const merged = { ...current, ...next };
      if (!slugTouched && ("title" in next || "date" in next)) merged.slug = autoSlug(merged.title, merged.date);
      return merged;
    });
  }

  function discard() {
    if (!baseline) return;
    setDraft({ ...baseline.event, id: draft?.id ?? baseline.event.id });
    setBody(baseline.body);
    setPaid(baseline.paid);
    setTried(false);
    if (!stored) setSlugTouched(false);
  }

  async function save() {
    if (!form || saving) return;
    const found = problems(form);
    const first = Object.values(found)[0];
    if (first) {
      setTried(true);
      toast(first);
      return;
    }
    setSaving(true);
    try {
      const next = await saveEvent({ ...form.event, price: paid ? form.event.price : 0, body: paragraphs(body) });
      const saved = { event: next, body: next.body.join("\n\n"), paid: next.price > 0 };
      setDraft(saved.event);
      setBody(saved.body);
      setPaid(saved.paid);
      setBaseline(saved);
      setTried(false);
      setSlugTouched(true);
      toast("האירוע נשמר");
      if (!stored) {
        setStored(true);
        router.replace(`/admin/content/events/${next.id}`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  async function chooseImage(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const url = await uploadEventImage(file);
      patch({ image: url });
    } catch (error) {
      toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  function dropImage() {
    if (!draft?.image) return;
    if (draft.image !== baseline?.event.image) void removeEventImage(draft.image);
    patch({ image: null });
  }

  async function copy() {
    if (!draft) return;
    try {
      const next = await duplicateEvent({ ...draft, body: paragraphs(body), price: paid ? draft.price : 0 });
      toast("האירוע שוכפל כטיוטה");
      router.push(`/admin/content/events/${next.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשכפל");
    }
  }

  async function remove() {
    if (!draft || !baseline) return;
    if (!window.confirm(`למחוק את "${baseline.event.title}"? גם ההרשמות לאירוע יימחקו.`)) return;
    try {
      await deleteEvent(baseline.event);
      toast("האירוע נמחק");
      router.push("/admin/content/events");
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו למחוק");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file || !draft || !stored) return;
    setImporting(true);
    try {
      const parsed = parseRegistrationCsv(await file.text());
      const result = await importRegistrations(draft.id, parsed.rows);
      const failures = [...parsed.failures, ...result.failures];
      setRegistrations(await listRegistrations(draft.id));
      toast(failures.length ? `נוספו ${result.added}. ${failures.length} שורות לא נכנסו` : `נוספו ${result.added} נרשמות`);
      if (failures.length) toast(failures.slice(0, 3).map((item) => `שורה ${item.line}: ${item.reason}`).join(" · "));
    } catch (error) {
      toast(error instanceof Error ? error.message : "העלאת הקובץ נכשלה");
    } finally {
      setImporting(false);
    }
  }

  if (loadError || missing) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 text-sm">
        {loadError || "האירוע לא נמצא."} <Link href="/admin/content/events">חזרה לאירועים</Link>
      </div>
    );
  }
  if (!draft) return <div className="mx-auto w-full max-w-[1080px] px-4 py-8 text-sm text-[#616161]">טוען אירוע…</div>;

  const when = longDate(draft.date);
  const length = duration(draft.from, draft.to);
  const shortText = draft.short.trim();
  const title = draft.title.trim();

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-4 min-[1000px]:px-6">
      <div className="mb-4 flex items-center gap-1.5">
        <Link href="/admin/content/events" aria-label="חזרה לאירועים" className="grid size-7 place-items-center rounded-lg text-[#4a4a4a] no-underline hover:bg-[#f1f1f1]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <Link href="/admin/content/events" className="text-[13px] text-[#616161] no-underline hover:underline">אירועים</Link>
      </div>

      <div className="grid items-start gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 min-w-0 flex-1 truncate text-xl leading-6 font-semibold text-[#1a1a1a]">{stored ? baseline?.event.title || "אירוע" : "אירוע חדש"}</h1>
            {stored ? (
              <>
                <button type="button" className={softButton} onClick={() => void copy()}>שכפול</button>
                <button type="button" className={`${softButton} !text-[#8e1f0b]`} onClick={() => void remove()}>מחיקה</button>
              </>
            ) : null}
          </div>

          <section className={card}>
            <Field label="שם האירוע" counter={`${draft.title.length} / 120`} error={errors.title}>
              <input value={draft.title} maxLength={120} onChange={(event) => patch({ title: event.target.value })} placeholder="לדוגמה: סדנת הכנה ללידה" className={`${field} ${errors.title ? invalid : ""}`} />
            </Field>
            <Field label="תיאור קצר" counter={`${draft.short.length} / 280`} error={errors.short} hint="מופיע בכרטיס האירוע ברשימה באתר">
              <textarea value={draft.short} maxLength={280} rows={2} onChange={(event) => patch({ short: event.target.value })} placeholder="משפט או שניים על האירוע" className={`${area} resize-none ${errors.short ? invalid : ""}`} />
            </Field>
            <Field label="תיאור מלא" error={errors.body} hint="מופיע בעמוד האירוע. שורה ריקה מתחילה פסקה חדשה">
              <textarea value={body} rows={7} onChange={(event) => setBody(event.target.value)} placeholder={"מה עושים במפגש, למי הוא מתאים ומה כדאי להביא.\n\nפסקה נוספת אחרי שורה ריקה."} className={`${area} resize-y ${errors.body ? invalid : ""}`} />
            </Field>
          </section>

          <section className={card}>
            <div>
              <h2 className="m-0 text-[15px] font-semibold">תמונה</h2>
              <p className="m-0 mt-0.5 text-[13px] text-[#616161]">מופיעה בכרטיס ובראש עמוד האירוע. JPG, PNG או WEBP עד 5MB.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = ""; }} />
            {draft.image ? (
              <div className="relative overflow-hidden rounded-xl bg-[#f1f1f1] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]">
                <img src={draft.image} alt="" className="aspect-[16/9] w-full object-cover" />
                <div className="absolute end-2 top-2 flex gap-2">
                  <button type="button" disabled={uploading} className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => fileRef.current?.click()}>{uploading ? "מעלה…" : "החלפה"}</button>
                  <button type="button" disabled={uploading} className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={dropImage}>הסרה</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseImage(event.dataTransfer.files?.[0]); }}
                className={`flex aspect-[16/6] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed text-center ${dragging ? "border-[#303030] bg-[#f1f1f1]" : "border-[#c9c9c9] bg-[#fafafa] hover:bg-[#f6f6f6]"}`}
              >
                {uploading ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-black/15 border-t-[#303030]" />
                ) : (
                  <>
                    <span className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.12)]">העלאת תמונה</span>
                    <span className="text-[12px] text-[#616161]">או גוררים תמונה לכאן</span>
                  </>
                )}
              </button>
            )}
          </section>

          <section className={card}>
            <h2 className="m-0 text-[15px] font-semibold">מתי</h2>
            <div className="grid gap-3 min-[700px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Field label="תאריך" error={errors.date}>
                <input type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} className={`${field} ${errors.date ? invalid : ""}`} />
              </Field>
              <Field label="שעת התחלה">
                <input type="time" dir="ltr" value={draft.from} onChange={(event) => patch({ from: event.target.value })} className={`${field} text-right ${errors.time ? invalid : ""}`} />
              </Field>
              <Field label="שעת סיום">
                <input type="time" dir="ltr" value={draft.to} onChange={(event) => patch({ to: event.target.value })} className={`${field} text-right ${errors.time ? invalid : ""}`} />
              </Field>
            </div>
            {errors.time ? <span className="-mt-2 text-[13px] text-[#8e1f0b]">{errors.time}</span> : null}
            {when ? (
              <div className="rounded-xl bg-[#f6f6f6] px-3 py-2.5 text-sm">
                <b>{when}</b>
                <span className="text-[#616161]"> · {draft.from}–{draft.to}{length ? ` · ${length}` : ""} · שעון ישראל</span>
              </div>
            ) : null}
          </section>

          <section className={card}>
            <h2 className="m-0 text-[15px] font-semibold">איפה</h2>
            <div role="radiogroup" aria-label="סוג המפגש" className="flex flex-col gap-2 min-[600px]:flex-row">
              <Choice selected={draft.online} title="אונליין בזום" hint="הקישור נשלח במייל לנרשמות" onClick={() => patch({ online: true })} />
              <Choice selected={!draft.online} title="מפגש פרונטלי" hint="הכתובת מופיעה באתר ובמייל" onClick={() => patch({ online: false })} />
            </div>
            {draft.online ? (
              <Field
                label="קישור זום"
                error={errors.zoom}
                hint={<span className="inline-flex items-center gap-1"><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>לא מוצג באתר. נשלח רק במייל האישור ובתזכורות</span>}
              >
                <input dir="ltr" value={draft.zoomUrl} onChange={(event) => patch({ zoomUrl: event.target.value })} placeholder="https://zoom.us/j/…" className={`${field} text-left ${errors.zoom ? invalid : ""}`} />
              </Field>
            ) : (
              <Field label="כתובת" error={errors.address} hint="רחוב, מספר ועיר. אפשר להוסיף קומה או הסבר הגעה">
                <input value={draft.address} onChange={(event) => patch({ address: event.target.value })} placeholder="לדוגמה: הרצל 12, תל אביב" className={`${field} ${errors.address ? invalid : ""}`} />
              </Field>
            )}
          </section>

          <section className={card}>
            <h2 className="m-0 text-[15px] font-semibold">מחיר</h2>
            <div role="radiogroup" aria-label="מחיר" className="flex flex-col gap-2 min-[600px]:flex-row">
              <Choice selected={!paid} title="חינם" hint="ההרשמה נסגרת מיד ונשלח מייל אישור" onClick={() => setPaid(false)} />
              <Choice selected={paid} title="בתשלום" hint="ההרשמה נסגרת רק אחרי תשלום שהצליח" onClick={() => { setPaid(true); if (draft.price < 1) patch({ price: 0 }); }} />
            </div>
            {paid ? (
              <Field label="מחיר להשתתפות" error={errors.price} hint="מספר שלם. התשלום והחשבונית עוברים דרך הסליקה של החנות">
                <span className={`flex h-[34px] max-w-[220px] items-center gap-1 rounded-[10px] border border-[#c9c9c9] bg-white px-3 focus-within:border-[#303030] ${errors.price ? invalid : ""}`}>
                  <span className="text-sm text-[#616161]">{currencySymbol()}</span>
                  <input dir="ltr" inputMode="numeric" value={draft.price ? String(draft.price) : ""} onChange={(event) => patch({ price: Number(event.target.value.replace(/\D/g, "").slice(0, 7)) || 0 })} placeholder="0" className="h-full min-w-0 flex-1 border-0 bg-transparent text-left text-sm outline-none" />
                </span>
              </Field>
            ) : null}
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 flex-1 text-[15px] font-semibold">
                נרשמות
                {registrations?.length ? <span className="ms-2 rounded-full bg-[#f1f1f1] px-2 py-0.5 text-xs font-semibold text-[#4a4a4a]">{registrations.length}</span> : null}
              </h2>
              {stored ? (
                <>
                  <button type="button" className={softButton} disabled={!registrations?.length} onClick={() => download(`${draft.slug || "event"}-registrations.csv`, registrationCsv(registrations ?? []))}>ייצוא CSV</button>
                  <button type="button" className={softButton} disabled={importing} onClick={() => csvRef.current?.click()}>{importing ? "מעלה…" : "העלאת CSV"}</button>
                  <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
                </>
              ) : null}
            </div>
            {!stored ? (
              <p className="m-0 rounded-xl bg-[#f6f6f6] px-4 py-6 text-center text-sm text-[#616161]">אחרי השמירה הראשונה הנרשמות יופיעו כאן, ואפשר יהיה לייצא ולהעלות CSV.</p>
            ) : registrations === null ? (
              <p className="m-0 text-sm text-[#616161]">טוען נרשמות…</p>
            ) : registrations.length === 0 ? (
              <div className="rounded-xl bg-[#f6f6f6] px-4 py-6 text-center text-sm text-[#616161]">
                עדיין אין נרשמות. הרשמה מהאתר תופיע כאן.
                <span className="mt-1 block text-[12px]">יש רשימה קיימת? <button type="button" className="border-0 bg-transparent p-0 text-[12px] text-[#1a4fd6] underline" onClick={() => download("registrations-sample.csv", sampleRegistrationCsv)}>הורדת קובץ לדוגמה</button></span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                <div className="grid min-w-[720px] grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.3fr)_minmax(0,1fr)_100px] items-center gap-2 bg-[#f7f7f7] px-3 py-2 text-[13px] font-semibold text-[#4a4a4a]">
                  <span>שם</span><span>טלפון</span><span>מייל</span><span>מצב</span><span>תשלום</span>
                </div>
                {registrations.map((row) => (
                  <div key={row.id} className="grid min-w-[720px] grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.3fr)_minmax(0,1fr)_100px] items-center gap-2 border-t border-[#f1f1f1] px-3 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <b className="truncate">{row.fullName}</b>
                      {row.marketingConsent ? <span className="text-[12px] text-[#616161]">אישרה דיוור</span> : null}
                    </span>
                    <span dir="ltr" className="truncate text-right">{row.phone}</span>
                    <span dir="ltr" className="truncate text-right">{row.email}</span>
                    <span className="truncate">
                      {stageLabel(row.stage)}
                      <span className="text-[#616161]">
                        {row.stage === "pregnant"
                          ? row.pregnancyWeek ? ` · שבוע ${row.pregnancyWeek}` : row.dueDate ? ` · ${shortDate(row.dueDate)}` : ""
                          : row.babyBirthDate ? ` · ${shortDate(row.babyBirthDate)}` : ""}
                      </span>
                    </span>
                    <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${row.paymentStatus === "pending" ? "bg-[#fff1e3] text-[#5e4200]" : "bg-[#e3f1df] text-[#0c5132]"}`}>{paymentLabel(row.paymentStatus)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 text-sm min-[1000px]:sticky min-[1000px]:top-4">
          <section className={card}>
            <h2 className="m-0 text-[13px] font-semibold">סטטוס</h2>
            <div role="radiogroup" aria-label="סטטוס" className="-mt-1 flex flex-col">
              {STATUS_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-[#f7f7f7]">
                  <input type="radio" name="event-status" checked={draft.status === option.value} onChange={() => patch({ status: option.value })} className="mt-0.5 size-4 accent-[#303030]" />
                  <span className="flex flex-col">
                    <span className={draft.status === option.value ? "font-semibold" : ""}>{statusLabel(option.value)}</span>
                    <span className="text-[12px] text-[#616161]">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className={card}>
            <Field label="כתובת העמוד באתר" error={errors.slug} hint={slugTouched ? "אותיות באנגלית, מספרים ומקף" : "נוצרת לבד. אפשר לשנות"}>
              <span dir="ltr" className={`flex h-[34px] items-center rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm focus-within:border-[#303030] ${errors.slug ? invalid : ""}`}>
                <span className="shrink-0 text-[#616161]">/events/</span>
                <input dir="ltr" value={draft.slug} onChange={(event) => { setSlugTouched(true); patch({ slug: event.target.value.toLowerCase().replace(/\s+/g, "-") }); }} placeholder="birth-prep" className="h-full min-w-0 flex-1 border-0 bg-transparent text-left outline-none" />
              </span>
            </Field>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[13px] font-medium text-[#616161]">כך זה ייראה באתר</h2>
            <div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <div className="relative aspect-[16/10] bg-[#f1f1f1]">
                {draft.image ? <img src={draft.image} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[12px] text-[#8a8a8a]">בלי תמונה</span>}
                {draft.date ? <span className="absolute start-2 top-2 rounded-lg bg-white px-2 py-1 text-[12px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]">{shortDate(draft.date)}</span> : null}
              </div>
              <div className="flex flex-col gap-1.5 p-3">
                <b className="text-[15px] leading-5">{title || "שם האירוע"}</b>
                <span className="text-[12px] text-[#616161]">{draft.from}–{draft.to} · {draft.online ? "בזום" : draft.address.trim() || "מפגש פרונטלי"}</span>
                {shortText ? <p className="m-0 line-clamp-2 text-[13px] leading-5 text-[#4a4a4a]">{shortText}</p> : null}
                <div className="mt-1 flex items-center gap-2">
                  <b className="flex-1">{paid && draft.price > 0 ? formatMoney0(draft.price) : "חינם"}</b>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[draft.status]}`}>{statusLabel(draft.status)}</span>
                </div>
              </div>
            </div>
            {draft.status === "draft" ? <p className="m-0 text-[12px] text-[#616161]">טיוטה לא מופיעה באתר. כדי לפרסם, בוחרים «פתוח».</p> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
