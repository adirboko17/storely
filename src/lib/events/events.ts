import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type EventStatus = "draft" | "open" | "full" | "ended" | "cancelled";
export type EventStage = "pregnant" | "gave_birth";
export type PaymentStatus = "pending" | "free" | "paid";

export type StoreEvent = {
  id: string;
  slug: string;
  title: string;
  short: string;
  body: string[];
  date: string;
  from: string;
  to: string;
  online: boolean;
  address: string;
  price: number;
  status: EventStatus;
  image: string | null;
  zoomUrl: string;
};

export type EventRegistration = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  stage: EventStage;
  dueDate: string | null;
  pregnancyWeek: number | null;
  babyBirthDate: string | null;
  marketingConsent: boolean;
  paymentStatus: PaymentStatus;
  source: "site" | "admin";
  createdAt: string;
};

export type CsvRegistration = {
  fullName: string;
  phone: string;
  email: string;
  stage: EventStage;
  dueDate: string | null;
  pregnancyWeek: number | null;
  babyBirthDate: string | null;
  marketingConsent: boolean;
};

const STATUSES: EventStatus[] = ["draft", "open", "full", "ended", "cancelled"];
const mediaBucket = "product-media";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  short: string;
  body: unknown;
  event_date: string;
  starts_at: string;
  ends_at: string;
  online: boolean;
  address: string | null;
  price: number;
  status: string;
  image: string | null;
  zoom_url: string | null;
};

type RegistrationRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  stage: string;
  due_date: string | null;
  pregnancy_week: number | null;
  baby_birth_date: string | null;
  marketing_consent: boolean;
  payment_status: string;
  source: string;
  created_at: string;
};

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

function client() {
  return createSupabaseBrowserClient();
}

function explain(error: { message: string; code?: string }) {
  if (error.code === "23505" && error.message.includes("slug")) return "הכתובת כבר בשימוש";
  if (error.code === "23505") return "כבר קיימת הרשמה עם המייל או הטלפון הזה";
  return error.message;
}

function asStatus(value: string): EventStatus {
  return STATUSES.includes(value as EventStatus) ? (value as EventStatus) : "draft";
}

function asBody(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function clock(value: string) {
  return value.slice(0, 5);
}

function asEvent(row: EventRow): StoreEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    short: row.short,
    body: asBody(row.body),
    date: row.event_date.slice(0, 10),
    from: clock(row.starts_at),
    to: clock(row.ends_at),
    online: row.online,
    address: row.address ?? "",
    price: row.price,
    status: asStatus(row.status),
    image: row.image,
    zoomUrl: row.zoom_url ?? "",
  };
}

function asRegistration(row: RegistrationRow): EventRegistration {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    stage: row.stage === "gave_birth" ? "gave_birth" : "pregnant",
    dueDate: row.due_date,
    pregnancyWeek: row.pregnancy_week,
    babyBirthDate: row.baby_birth_date,
    marketingConsent: row.marketing_consent,
    paymentStatus: row.payment_status === "paid" || row.payment_status === "free" ? row.payment_status : "pending",
    source: row.source === "admin" ? "admin" : "site",
    createdAt: row.created_at,
  };
}

export function blankEvent(): StoreEvent {
  return {
    id: crypto.randomUUID(),
    slug: "",
    title: "",
    short: "",
    body: [],
    date: "",
    from: "20:00",
    to: "21:30",
    online: true,
    address: "",
    price: 0,
    status: "draft",
    image: null,
    zoomUrl: "",
  };
}

export function eventProblem(event: StoreEvent) {
  const title = event.title.trim();
  const slug = event.slug.trim().toLowerCase();
  if (title.length < 1 || title.length > 120) return "השם צריך להיות עד 120 תווים";
  if (event.short.trim().length > 280) return "התיאור הקצר צריך להיות עד 280 תווים";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "הכתובת יכולה להכיל אותיות לטיניות, מספרים ומקף";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return "צריך תאריך";
  if (!/^\d{2}:\d{2}$/.test(event.from) || !/^\d{2}:\d{2}$/.test(event.to)) return "צריך שעת התחלה ושעת סיום";
  if (event.to <= event.from) return "שעת הסיום צריכה להיות אחרי שעת ההתחלה";
  if (!event.online && !event.address.trim()) return "למפגש פרונטלי צריך כתובת";
  if (event.online && event.zoomUrl.trim() && !event.zoomUrl.trim().startsWith("https://")) return "קישור הזום צריך להתחיל ב-https";
  if (!Number.isInteger(event.price) || event.price < 0 || event.price > 1000000) return "המחיר הוא מספר שלם";
  if (!STATUSES.includes(event.status)) return "סטטוס לא תקין";
  if (event.body.some((paragraph) => paragraph.includes("<") || paragraph.includes(">"))) return "התיאור המלא הוא טקסט בלי HTML";
  return null;
}

export function statusLabel(status: EventStatus) {
  if (status === "open") return "פתוח";
  if (status === "full") return "מלא";
  if (status === "ended") return "הסתיים";
  if (status === "cancelled") return "בוטל";
  return "טיוטה";
}

export function paymentLabel(status: PaymentStatus) {
  if (status === "paid") return "שולם";
  if (status === "free") return "חינם";
  return "ממתינה לתשלום";
}

export function stageLabel(stage: EventStage) {
  return stage === "pregnant" ? "בהריון" : "ילדתי";
}

export function paragraphs(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function listEvents() {
  const supabase = client();
  const { data, error } = await supabase
    .from("store_events")
    .select("id, slug, title, short, body, event_date, starts_at, ends_at, online, address, price, status, image, zoom_url")
    .eq("store_id", storeId())
    .order("event_date", { ascending: true })
    .order("starts_at", { ascending: true });
  if (error) throw new Error(explain(error));
  return ((data ?? []) as EventRow[]).map(asEvent);
}

export async function getEvent(eventId: string) {
  const supabase = client();
  const { data, error } = await supabase
    .from("store_events")
    .select("id, slug, title, short, body, event_date, starts_at, ends_at, online, address, price, status, image, zoom_url")
    .eq("store_id", storeId())
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(explain(error));
  return data ? asEvent(data as EventRow) : null;
}

export async function saveEvent(input: StoreEvent) {
  const problem = eventProblem(input);
  if (problem) throw new Error(problem);
  const id = storeId();
  const online = input.online;
  const row = {
    id: input.id,
    store_id: id,
    slug: input.slug.trim().toLowerCase(),
    title: input.title.trim(),
    short: input.short.trim(),
    body: input.body.map((paragraph) => paragraph.trim()).filter(Boolean),
    event_date: input.date,
    starts_at: input.from,
    ends_at: input.to,
    online,
    address: online ? null : input.address.trim(),
    price: input.price,
    status: input.status,
    image: input.image,
    zoom_url: online && input.zoomUrl.trim() ? input.zoomUrl.trim() : null,
  };
  const { error } = await client().from("store_events").upsert(row, { onConflict: "id" });
  if (error) throw new Error(explain(error));
  return { ...input, slug: row.slug, title: row.title, short: row.short, body: row.body, address: row.address ?? "", zoomUrl: row.zoom_url ?? "", image: row.image };
}

export async function duplicateEvent(event: StoreEvent) {
  const taken = new Set((await listEvents()).map((item) => item.slug));
  let slug = `${event.slug}-copy`;
  let index = 2;
  while (taken.has(slug)) {
    slug = `${event.slug}-copy-${index}`;
    index += 1;
    if (index > 40) throw new Error("לא הצלחנו ליצור כתובת חדשה");
  }
  return saveEvent({ ...event, id: crypto.randomUUID(), slug, status: "draft" });
}

function imagePath(url: string, id: string) {
  const marker = `/storage/v1/object/public/${mediaBucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0] ?? "");
  return path.startsWith(`${id}/events/`) ? path : null;
}

export async function deleteEvent(event: StoreEvent) {
  const id = storeId();
  const path = event.image ? imagePath(event.image, id) : null;
  if (path) await client().storage.from(mediaBucket).remove([path]);
  const { error } = await client().from("store_events").delete().eq("store_id", id).eq("id", event.id);
  if (error) throw new Error(explain(error));
}

export async function uploadEventImage(file: File) {
  const id = storeId();
  if (!file.type.startsWith("image/")) throw new Error("אפשר להעלות רק תמונה");
  if (file.size > 5 * 1024 * 1024) throw new Error("התמונה גדולה מ-5MB");
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const kinds = ["jpg", "png", "webp", "gif", "avif"];
  if (!extension || !kinds.includes(extension)) throw new Error("אפשר לשמור רק תמונות jpg, png, webp, gif או avif");
  const path = `${id}/events/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(mediaBucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("העלאת התמונה נכשלה");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${mediaBucket}/${path}`;
}

export async function removeEventImage(url: string) {
  const path = imagePath(url, storeId());
  if (!path) return;
  await client().storage.from(mediaBucket).remove([path]);
}

export async function listRegistrations(eventId: string) {
  const { data, error } = await client()
    .from("store_event_registrations")
    .select("id, full_name, phone, email, stage, due_date, pregnancy_week, baby_birth_date, marketing_consent, payment_status, source, created_at")
    .eq("store_id", storeId())
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(explain(error));
  return ((data ?? []) as RegistrationRow[]).map(asRegistration);
}

export async function importRegistrations(eventId: string, rows: CsvRegistration[]) {
  const id = storeId();
  const failures: { line: number; reason: string }[] = [];
  let added = 0;
  for (const [index, row] of rows.entries()) {
    const { error } = await client().from("store_event_registrations").insert({
      store_id: id,
      event_id: eventId,
      full_name: row.fullName,
      phone: row.phone,
      email: row.email,
      stage: row.stage,
      due_date: row.dueDate,
      pregnancy_week: row.pregnancyWeek,
      baby_birth_date: row.babyBirthDate,
      terms_accepted: true,
      marketing_consent: row.marketingConsent,
      payment_status: "pending",
      source: "admin",
    });
    if (error) failures.push({ line: index + 2, reason: explain(error) });
    else added += 1;
  }
  return { added, failures };
}

const CSV_FIELDS: Record<string, "name" | "phone" | "email" | "stage" | "due" | "week" | "baby" | "marketing"> = {
  "שם מלא": "name",
  "שם": "name",
  name: "name",
  "טלפון": "phone",
  phone: "phone",
  "מייל": "email",
  "אימייל": "email",
  email: "email",
  "מצב": "stage",
  stage: "stage",
  "תאריך לידה משוער": "due",
  due: "due",
  "שבוע": "week",
  week: "week",
  "תאריך לידה": "baby",
  baby: "baby",
  "דיוור": "marketing",
  marketing: "marketing",
};

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

function csvDate(value: string) {
  const text = value.trim();
  if (!text) return { value: null as string | null, invalid: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { value: text, invalid: false };
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  if (!local) return { value: null, invalid: true };
  return { value: `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`, invalid: false };
}

function csvStage(value: string): EventStage | null {
  const text = value.trim();
  if (text === "בהריון" || text === "pregnant") return "pregnant";
  if (text === "ילדתי" || text === "gave_birth" || text === "אחרי לידה") return "gave_birth";
  return null;
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function registrationCsv(rows: EventRegistration[]) {
  const header = ["שם מלא", "טלפון", "מייל", "מצב", "תאריך לידה משוער", "שבוע", "תאריך לידה", "דיוור", "תשלום"];
  const lines = rows.map((row) => [
    row.fullName,
    row.phone,
    row.email,
    stageLabel(row.stage),
    row.dueDate ?? "",
    row.pregnancyWeek?.toString() ?? "",
    row.babyBirthDate ?? "",
    row.marketingConsent ? "כן" : "לא",
    paymentLabel(row.paymentStatus),
  ].map(csvCell).join(","));
  return `\uFEFF${header.join(",")}\n${lines.join("\n")}`;
}

export const sampleRegistrationCsv = "\uFEFFשם מלא,טלפון,מייל,מצב,תאריך לידה משוער,שבוע,תאריך לידה,דיוור\nנועה כהן,0501234567,noa@example.com,בהריון,2026-12-01,20,,כן\n";

export function parseRegistrationCsv(text: string) {
  const table = csvRows(text);
  if (table.length < 2) throw new Error("הקובץ צריך שורת כותרת ולפחות שורה אחת");
  const columns = table[0].map((header) => CSV_FIELDS[header.trim().toLowerCase()] ?? CSV_FIELDS[header.trim()]);
  if (!columns.includes("name") || !columns.includes("phone") || !columns.includes("email") || !columns.includes("stage")) {
    throw new Error("חסרות עמודות: שם מלא, טלפון, מייל ומצב");
  }
  const rows: CsvRegistration[] = [];
  const failures: { line: number; reason: string }[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const value = (field: (typeof columns)[number]) => {
      const at = columns.indexOf(field);
      return at < 0 ? "" : (cells[at] ?? "").trim();
    };
    const stage = csvStage(value("stage"));
    const due = csvDate(value("due"));
    const baby = csvDate(value("baby"));
    const weekText = value("week");
    const week = weekText ? Number(weekText) : null;
    if (!stage) {
      failures.push({ line, reason: "צריך לבחור בהריון או ילדתי" });
      return;
    }
    if (due.invalid || baby.invalid) {
      failures.push({ line, reason: "תאריך צריך להיות YYYY-MM-DD" });
      return;
    }
    if (weekText && (!Number.isInteger(week) || (week ?? 0) < 4 || (week ?? 0) > 42)) {
      failures.push({ line, reason: "שבוע ההריון צריך להיות בין 4 ל-42" });
      return;
    }
    const marketing = ["כן", "true", "1", "yes"].includes(value("marketing").toLowerCase());
    rows.push({
      fullName: value("name"),
      phone: value("phone"),
      email: value("email"),
      stage,
      dueDate: stage === "pregnant" ? due.value : null,
      pregnancyWeek: stage === "pregnant" ? week : null,
      babyBirthDate: stage === "gave_birth" ? baby.value : null,
      marketingConsent: marketing,
    });
  });
  return { rows, failures };
}
