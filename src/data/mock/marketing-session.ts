import { isHydrating, writeStore } from "@/data/live/write";

export type IntegrationState = {
  id: string;
  token: string;
  events: number[];
  consent: boolean;
  head: string;
  body: string;
};

export type FlowRule = { field: string; op: string; value: string };

export type EmailAlign = "start" | "center" | "end";

export const EMAIL_FONTS = [
  { id: "Heebo", label: "Heebo" },
  { id: "Rubik", label: "Rubik" },
  { id: "Assistant", label: "Assistant" },
  { id: "Alef", label: "Alef" },
  { id: "Noto Sans Hebrew", label: "Noto Sans Hebrew" },
  { id: "Noto Serif Hebrew", label: "Noto Serif Hebrew" },
  { id: "Frank Ruhl Libre", label: "Frank Ruhl Libre" },
  { id: "David Libre", label: "David Libre" },
  { id: "Miriam Libre", label: "Miriam Libre" },
  { id: "Secular One", label: "Secular One" },
  { id: "Fredoka", label: "Fredoka" },
] as const;

export const EMAIL_SIZES = [12, 14, 16, 18, 22, 28, 36] as const;
export type EmailWeight = 400 | 500 | 700;

export type EmailLook = {
  font: string;
  size: number;
  weight: EmailWeight;
  italic: boolean;
  underline: boolean;
  strike: boolean;
};

export type EmailBlock =
  | { id: string; type: "image"; src: string; alt: string; href: string }
  | { id: string; type: "logo" }
  | ({ id: string; type: "heading"; text: string; align: EmailAlign; color: string } & EmailLook)
  | ({ id: string; type: "text"; text: string; align: EmailAlign; color: string } & EmailLook)
  | ({ id: string; type: "button"; label: string; href: string; align: EmailAlign; color: string; textColor: string } & EmailLook)
  | ({ id: string; type: "columns"; left: string; right: string; color: string } & EmailLook)
  | { id: string; type: "spacer"; size: "s" | "m" | "l" }
  | { id: string; type: "divider"; color: string };

export const EMAIL_LINKS = [
  { token: "{store_url}", label: "האתר", detail: "דף הבית של החנות" },
  { token: "{checkout_url}", label: "העגלה הנטושה", detail: "העגלה של הלקוח שמקבל את המייל" },
  { token: "{account_url}", label: "החשבון", detail: "האזור האישי של אותו לקוח" },
] as const;

export const EMAIL_VARS = [
  { token: "{first_name}", label: "שם פרטי", detail: "השם הפרטי של הלקוח" },
  { token: "{full_name}", label: "שם מלא", detail: "השם המלא של הלקוח" },
  { token: "{email}", label: "אימייל", detail: "כתובת המייל של הלקוח" },
  { token: "{cart_items}", label: "המוצרים בעגלה", detail: "רשימת המוצרים בעגלה שלו" },
  { token: "{cart_total}", label: "סכום העגלה", detail: "הסכום לתשלום בעגלה שלו" },
  { token: "{store_name}", label: "שם החנות", detail: "שם החנות" },
  { token: "{checkout_url}", label: "קישור לעגלה", detail: "קישור ישיר לעגלה הנטושה שלו" },
  { token: "{store_url}", label: "קישור לאתר", detail: "דף הבית של החנות" },
] as const;

export type MarketingEmail = {
  id: string;
  name: string;
  subject: string;
  preview: string;
  blocks: EmailBlock[];
};

export const SMS_LIMIT = 250;

export type MarketingSms = {
  id: string;
  name: string;
  text: string;
};

export type FlowStep =
  | { type: "wait"; value: string; unit: string }
  | { type: "cond"; text?: string; match?: "all" | "any"; rules?: FlowRule[]; yes?: FlowStep[]; no?: FlowStep[] }
  | { type: "ab"; percent: number; a?: FlowStep[]; b?: FlowStep[] }
  | { type: "both"; mail?: FlowStep[]; phone?: FlowStep[] }
  | { type: "email"; emailId?: string; subject?: string; preview?: string; body?: string }
  | { type: "sms"; smsId?: string; text?: string }
  | { type: "end" };

export type Flow = {
  id: number;
  name: string;
  trigger: string;
  lookback?: number;
  on: boolean;
  steps: FlowStep[];
  stats: [number, string, string, number] | null;
};

export const INTEGRATIONS = [
  { key: "meta", name: "Meta Pixel", sub: "כולל Conversions API", cat: "פרסום", mark: "f", color: "#1877f2", detail: "מעקב אחר צפיות, הוספות לעגלה ורכישות לפייסבוק ואינסטגרם.", idLabel: "מזהה פיקסל", placeholder: "123456789012345", pattern: /^\d{15,16}$/, error: "מזהה פיקסל מכיל 15–16 ספרות", events: true },
  { key: "gtm", name: "Google Tag Manager", sub: "קונטיינר תגים", cat: "ניתוח", mark: "G", color: "#4285f4", detail: "טעינת כל התגים שלכם ממקום אחד.", idLabel: "מזהה קונטיינר", placeholder: "GTM-XXXXXXX", pattern: /^GTM-[A-Z0-9]{4,10}$/, error: "המזהה צריך להתחיל ב-GTM-", events: false },
  { key: "ga4", name: "Google Analytics 4", sub: "מדידת תנועה ומסחר", cat: "ניתוח", mark: "GA", color: "#e37400", detail: "ניתוח תנועה והתנהגות גולשים, כולל אירועי מסחר.", idLabel: "מזהה מדידה", placeholder: "G-XXXXXXXXXX", pattern: /^G-[A-Z0-9]{6,12}$/, error: "מזהה מדידה מתחיל ב-G-", events: true },
  { key: "gads", name: "Google Ads", sub: "מעקב המרות", cat: "פרסום", mark: "Ads", color: "#34a853", detail: "שליחת רכישות כהמרות לקמפיינים בגוגל.", idLabel: "מזהה המרה", placeholder: "AW-123456789", pattern: /^AW-\d{6,12}$/, error: "מזהה ההמרה מתחיל ב-AW-", events: false },
  { key: "tiktok", name: "TikTok Pixel", sub: "אירועים וקהלים", cat: "פרסום", mark: "♪", color: "#111111", detail: "מעקב אחר אירועים מקמפיינים בטיקטוק.", idLabel: "מזהה פיקסל", placeholder: "C1A2B3C4D5E6F7G8H9I0", pattern: /^[A-Z0-9]{16,24}$/, error: "מזהה לא תקין", events: true },
  { key: "clarity", name: "Microsoft Clarity", sub: "הקלטות ומפות חום", cat: "ניתוח", mark: "C", color: "#5c2d91", detail: "הקלטות גלישה ומפות חום, בחינם.", idLabel: "מזהה פרויקט", placeholder: "abcd1234ef", pattern: /^[a-z0-9]{8,12}$/, error: "מזהה לא תקין", events: false },
  { key: "code", name: "קוד מותאם אישית", sub: "סקריפטים ל-head ול-body", cat: "קוד", mark: "</>", color: "#303030", detail: "הוספת סקריפטים לכל עמודי החנות.", idLabel: "קוד", placeholder: "", pattern: /./, error: "", events: false },
] as const;

const email = (subject: string, preview: string, body: string): FlowStep => ({ type: "email", subject, preview, body });
const sms = (text: string): FlowStep => ({ type: "sms", text });

export const FLOW_TRIGGERS = [
  { id: "cart", group: "אירוע", label: "הלקוח נטש עגלה", detail: "עגלה מלאה שלא הפכה להזמנה" },
  { id: "checkout", group: "אירוע", label: "התחיל תשלום ולא סיים", detail: "הגיע לקופה ולא שילם" },
  { id: "paid", group: "אירוע", label: "הזמנה שולמה", detail: "אחרי תשלום שהתקבל" },
  { id: "fulfilled", group: "אירוע", label: "הזמנה סופקה", detail: "אחרי שהמשלוח יצא" },
  { id: "subscribed", group: "אירוע", label: "לקוח נרשם לדיוור", detail: "הצטרפות לרשימת התפוצה" },
  { id: "created", group: "אירוע", label: "לקוח חדש נוצר", detail: "הרשמה או הזמנה ראשונה" },
  { id: "browse", group: "אירוע", label: "צפה במוצר ולא קנה", detail: "עניין במוצר בלי רכישה" },
  { id: "winback", group: "אירוע", label: "לא קנה X ימים", detail: "לקוח שקט שכדאי להחזיר" },
  { id: "all", group: "קהל", label: "כל הלקוחות", detail: "מבצע, עדכון או הודעה לכל הרשימה" },
  { id: "subs", group: "קהל", label: "כל המנויים לדיוור", detail: "רק מי שאישר לקבל דיוור" },
  { id: "fresh", group: "קהל", label: "פלח: לקוחות חדשים", detail: "לקוחות שהצטרפו בתקופה שתבחרו" },
  { id: "repeat", group: "קהל", label: "פלח: רכשו יותר מפעמיים", detail: "לקוחות שחזרו לקנות" },
] as const;

export const TRIGGER_WINDOWS = [
  { days: 7, label: "שבוע" },
  { days: 30, label: "חודש" },
  { days: 60, label: "חודשיים" },
  { days: 90, label: "3 חודשים" },
] as const;

export const TIMED_TRIGGERS = new Set(["cart", "checkout", "paid", "fulfilled", "browse", "winback", "fresh"]);

export function triggerByLabel(label: string) {
  if (label === "לא קנה 30 יום") return FLOW_TRIGGERS.find((item) => item.id === "winback") ?? null;
  return FLOW_TRIGGERS.find((item) => item.label === label) ?? null;
}

export function triggerTitle(label: string, lookback?: number) {
  const trigger = triggerByLabel(label);
  if (trigger?.id === "winback") return lookback ? `לא קנה ${lookback === 1 ? "יום" : `${lookback} ימים`}` : "לא קנה X ימים";
  if (trigger && TIMED_TRIGGERS.has(trigger.id)) return `${trigger.label} · ${lookbackLabel(lookback)}`;
  return trigger?.label ?? label;
}

export function lookbackLabel(days?: number) {
  if (!days) return "כל הזמנים";
  return TRIGGER_WINDOWS.find((item) => item.days === days)?.label ?? `${days} ימים`;
}

export function lookbackPhrase(days?: number) {
  if (!days) return "בכל הזמנים";
  const label = lookbackLabel(days);
  if (label === "שבוע") return "בשבוע האחרון";
  if (label === "חודש") return "בחודש האחרון";
  if (label === "חודשיים") return "בחודשיים האחרונים";
  if (label === "3 חודשים") return "ב-3 החודשים האחרונים";
  return `ב-${label} האחרונים`;
}

const TEMPLATES: Array<Omit<Flow, "id" | "on" | "stats"> & { key: string }> = [
  { key: "cart", name: "עגלה נטושה", trigger: "הלקוח נטש עגלה", steps: [{ type: "wait", value: "1", unit: "שעות" }, email("שכחתם משהו בעגלה?", "המוצרים שבחרתם עדיין מחכים", "היי {first_name}, שמרנו את העגלה."), { type: "wait", value: "1", unit: "ימים" }, sms("היי {first_name}, העגלה שלך עדיין מחכה. 10% הנחה: {checkout_url}")] },
  { key: "welcome", name: "סדרת ברוכים הבאים", trigger: "לקוח נרשם לדיוור", steps: [email("ברוכים הבאים ל-Storely", "10% הנחה לרכישה הראשונה", "שמחים שהצטרפתם."), { type: "wait", value: "3", unit: "ימים" }, email("הסיפור שמאחורי הסטודיו", "איך נולד כל ספל", "רצינו לשתף איך אנחנו עובדים.")] },
  { key: "thanks", name: "תודה על הרכישה", trigger: "הזמנה שולמה", steps: [{ type: "wait", value: "2", unit: "שעות" }, email("תודה על ההזמנה", "ההזמנה שלכם בדרך", "אנחנו כבר אורזים אותה."), { type: "wait", value: "7", unit: "ימים" }, email("איך היה?", "נשמח לביקורת", "נקדיש דקה לביקורת על המוצר.")] },
  { key: "campaign", name: "מבצע לקהל", trigger: "כל הלקוחות", steps: [email("מבצע חדש בחנות", "רק להשבוע", "היי {first_name}, יש לנו מבצע חדש.")] },
  { key: "winback", name: "החזרת לקוח", trigger: "לא קנה X ימים", steps: [email("התגעגענו", "מתנה לחזרה", "היי {first_name}, עבר זמן מאז הקנייה האחרונה."), { type: "wait", value: "3", unit: "ימים" }, sms("היי {first_name}, מחכים לך עם הטבה.")] },
];

type Snapshot = {
  version: number;
  connected: Record<string, IntegrationState>;
  flows: Flow[];
  emails: MarketingEmail[];
  sms: MarketingSms[];
};

let current: Snapshot = {
  version: 0,
  connected: {},
  flows: [],
  emails: [],
  sms: [],
};
const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  if (isHydrating()) return;
  void writeStore("save_store_sections", {
    sections: { marketing: { connected: current.connected, flows: current.flows, emails: current.emails, sms: current.sms } },
  });
}

export function replaceMarketing(next: Omit<Snapshot, "version">) {
  publish(next);
}

export function subscribeMarketing(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMarketingVersion() {
  return current.version;
}

export function connectedIntegrations() {
  return { ...current.connected };
}

export function saveIntegration(key: string, state: IntegrationState) {
  publish({ ...current, connected: { ...current.connected, [key]: state } });
}

export function disconnectIntegration(key: string) {
  const connected = { ...current.connected };
  delete connected[key];
  publish({ ...current, connected });
}

export function listFlows() {
  return current.flows.map((flow) => ({ ...flow, steps: flow.steps.map((step) => structuredClone(step)) }));
}

export function getFlow(id: number) {
  return listFlows().find((flow) => flow.id === id) ?? null;
}

export function saveFlow(flow: Flow) {
  const exists = current.flows.some((item) => item.id === flow.id);
  publish({ ...current, flows: exists ? current.flows.map((item) => (item.id === flow.id ? flow : item)) : [flow, ...current.flows] });
}

export function toggleFlow(id: number) {
  publish({ ...current, flows: current.flows.map((flow) => (flow.id === id ? { ...flow, on: !flow.on } : flow)) });
}

export function deleteFlow(id: number) {
  publish({ ...current, flows: current.flows.filter((flow) => flow.id !== id) });
}

export function createFlow(template: "cart" | "welcome" | "thanks" | "campaign" | "winback" | "blank") {
  const source = TEMPLATES.find((item) => item.key === template);
  const id = Math.max(0, ...current.flows.map((flow) => flow.id)) + 1;
  const seeded = absorbLegacyEmails(
    [{
      id,
      name: source?.name ?? "אוטומציה חדשה",
      trigger: source?.trigger ?? "בחרו טריגר",
      on: false,
      steps: source ? source.steps.map((step) => structuredClone(step)) : [],
      stats: null,
    }],
    current.emails.map((email) => structuredClone(email)),
    current.sms.map((message) => structuredClone(message)),
  );
  const flow = seeded.flows[0] ?? {
    id,
    name: "אוטומציה חדשה",
    trigger: "בחרו טריגר",
    on: false,
    steps: [],
    stats: null,
  };
  publish({ ...current, emails: seeded.emails, sms: seeded.sms, flows: [flow, ...current.flows] });
  return flow;
}

function newId() {
  return crypto.randomUUID();
}

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asBlock(value: unknown): EmailBlock | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  const id = typeof block.id === "string" && block.id ? block.id : newId();
  const align = block.align === "center" || block.align === "end" ? block.align : "start";
  const paint = (fallback: string) => (typeof block.color === "string" && /^#[0-9a-fA-F]{6}$/.test(block.color) ? block.color : fallback);
  const ink = typeof block.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(block.textColor) ? block.textColor : "#ffffff";
  const look = (size: number, weight: EmailWeight): EmailLook => ({
    font: EMAIL_FONTS.some((item) => item.id === block.font) ? textOf(block.font) : "",
    size: EMAIL_SIZES.some((item) => item === block.size) ? Number(block.size) : size,
    weight: block.weight === 400 || block.weight === 500 || block.weight === 700 ? block.weight : weight,
    italic: block.italic === true,
    underline: block.underline === true,
    strike: block.strike === true,
  });
  if (block.type === "image") return { id, type: "image", src: textOf(block.src), alt: textOf(block.alt), href: textOf(block.href) };
  if (block.type === "logo") return { id, type: "logo" };
  if (block.type === "heading") return { id, type: "heading", text: textOf(block.text), align, color: paint("#1a1a1a"), ...look(28, 700) };
  if (block.type === "text") return { id, type: "text", text: textOf(block.text), align, color: paint("#303030"), ...look(14, 400) };
  if (block.type === "button") return { id, type: "button", label: textOf(block.label), href: textOf(block.href), align, color: paint("#1a1a1a"), textColor: ink, ...look(14, 500) };
  if (block.type === "columns") return { id, type: "columns", left: textOf(block.left), right: textOf(block.right), color: paint("#303030"), ...look(14, 400) };
  if (block.type === "spacer") return { id, type: "spacer", size: block.size === "s" || block.size === "l" ? block.size : "m" };
  if (block.type === "divider") return { id, type: "divider", color: paint("#e6e6e6") };
  return null;
}

export function parseEmails(value: unknown): MarketingEmail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const email = entry as Partial<MarketingEmail>;
    if (typeof email.id !== "string" || !email.id || typeof email.name !== "string") return [];
    const blocks = Array.isArray(email.blocks) ? email.blocks.flatMap((block) => { const next = asBlock(block); return next ? [next] : []; }) : [];
    return [{ id: email.id, name: email.name, subject: typeof email.subject === "string" ? email.subject : "", preview: typeof email.preview === "string" ? email.preview : "", blocks }];
  });
}

function linkLegacyEmails(steps: FlowStep[], flowId: number, path: Array<string | number>, emails: MarketingEmail[], messages: MarketingSms[]): FlowStep[] {
  return steps.map((step, index) => {
    const here = [...path, index];
    if (step.type === "cond") return { ...step, yes: linkLegacyEmails(step.yes ?? [], flowId, [...here, "yes"], emails, messages), no: linkLegacyEmails(step.no ?? [], flowId, [...here, "no"], emails, messages) };
    if (step.type === "ab") return { ...step, a: linkLegacyEmails(step.a ?? [], flowId, [...here, "a"], emails, messages), b: linkLegacyEmails(step.b ?? [], flowId, [...here, "b"], emails, messages) };
    if (step.type === "both") return { ...step, mail: linkLegacyEmails(step.mail ?? [], flowId, [...here, "mail"], emails, messages), phone: linkLegacyEmails(step.phone ?? [], flowId, [...here, "phone"], emails, messages) };
    if (step.type === "sms") {
      if (step.smsId) return { type: "sms", smsId: step.smsId };
      const text = (step.text ?? "").slice(0, SMS_LIMIT);
      if (!text.trim()) return { type: "sms", smsId: "" };
      const id = `sms-${flowId}-${here.join("-")}`;
      if (!messages.some((message) => message.id === id)) messages.push({ id, name: text.replace(/\{[a-z_]+\}/g, "").trim().slice(0, 24) || "SMS", text });
      return { type: "sms", smsId: id };
    }
    if (step.type !== "email") return step;
    if (step.emailId) return { type: "email", emailId: step.emailId };
    if (!step.subject?.trim() && !step.preview?.trim() && !step.body?.trim()) return { type: "email", emailId: "" };
    const id = `mail-${flowId}-${here.join("-")}`;
    if (!emails.some((email) => email.id === id)) {
      const blocks: EmailBlock[] = [];
      if (step.body?.trim()) blocks.push({ id: `${id}-text`, type: "text", text: step.body, align: "start", color: "#303030", font: "", size: 14, weight: 400, italic: false, underline: false, strike: false });
      emails.push({ id, name: step.subject?.trim() || "מייל", subject: step.subject ?? "", preview: step.preview ?? "", blocks });
    }
    return { type: "email", emailId: id };
  });
}

export function absorbLegacyEmails(flows: Flow[], emails: MarketingEmail[], messages: MarketingSms[] = []) {
  const library = emails.map((email) => structuredClone(email));
  const sms = messages.map((message) => structuredClone(message));
  return {
    emails: library,
    sms,
    flows: flows.map((flow) => ({ ...flow, steps: linkLegacyEmails(flow.steps, flow.id, [], library, sms) })),
  };
}

export function parseSms(value: unknown): MarketingSms[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const message = entry as Partial<MarketingSms>;
    if (typeof message.id !== "string" || !message.id || typeof message.name !== "string") return [];
    return [{ id: message.id, name: message.name, text: typeof message.text === "string" ? message.text.slice(0, SMS_LIMIT) : "" }];
  });
}

export function listEmails() {
  return current.emails.map((email) => structuredClone(email));
}

export function getEmail(id: string) {
  return listEmails().find((email) => email.id === id) ?? null;
}

export function emailReady(id: string | undefined) {
  const email = id ? current.emails.find((item) => item.id === id) : undefined;
  if (!email || !email.subject.trim()) return false;
  return email.blocks.some((block) => {
    if (block.type === "image") return block.src.trim().length > 0;
    if (block.type === "logo") return true;
    if (block.type === "heading" || block.type === "text") return block.text.trim().length > 0;
    if (block.type === "button") return block.label.trim().length > 0;
    if (block.type === "columns") return block.left.trim().length > 0 || block.right.trim().length > 0;
    return false;
  });
}

export function createEmail(seed?: Partial<Pick<MarketingEmail, "name" | "subject" | "preview">>) {
  const email: MarketingEmail = {
    id: newId(),
    name: seed?.name?.trim() || "מייל חדש",
    subject: seed?.subject ?? "",
    preview: seed?.preview ?? "",
    blocks: [],
  };
  publish({ ...current, emails: [email, ...current.emails] });
  return email;
}

export function saveEmail(email: MarketingEmail) {
  const exists = current.emails.some((item) => item.id === email.id);
  publish({ ...current, emails: exists ? current.emails.map((item) => (item.id === email.id ? email : item)) : [email, ...current.emails] });
}

export function deleteEmail(id: string) {
  publish({ ...current, emails: current.emails.filter((email) => email.id !== id) });
}

export function listSms() {
  return current.sms.map((message) => ({ ...message }));
}

export function getSms(id: string) {
  return listSms().find((message) => message.id === id) ?? null;
}

export function smsReady(id: string | undefined) {
  const message = id ? current.sms.find((item) => item.id === id) : undefined;
  return Boolean(message && message.text.trim() && message.text.length <= SMS_LIMIT);
}

export function createSms(seed?: Partial<Pick<MarketingSms, "name" | "text">>) {
  const message: MarketingSms = {
    id: newId(),
    name: seed?.name?.trim() || "SMS חדש",
    text: (seed?.text ?? "").slice(0, SMS_LIMIT),
  };
  publish({ ...current, sms: [message, ...current.sms] });
  return message;
}

export function saveSms(message: MarketingSms) {
  const next = { ...message, text: message.text.slice(0, SMS_LIMIT) };
  const exists = current.sms.some((item) => item.id === next.id);
  publish({ ...current, sms: exists ? current.sms.map((item) => (item.id === next.id ? next : item)) : [next, ...current.sms] });
}

export function deleteSms(id: string) {
  publish({ ...current, sms: current.sms.filter((message) => message.id !== id) });
}

export function blankBlock(type: EmailBlock["type"]): EmailBlock {
  const id = newId();
  if (type === "image") return { id, type, src: "", alt: "", href: "" };
  if (type === "logo") return { id, type };
  if (type === "heading") return { id, type, text: "", align: "start", color: "#1a1a1a", font: "", size: 28, weight: 700, italic: false, underline: false, strike: false };
  if (type === "text") return { id, type, text: "", align: "start", color: "#303030", font: "", size: 14, weight: 400, italic: false, underline: false, strike: false };
  if (type === "button") return { id, type, label: "לחנות", href: "{store_url}", align: "center", color: "#1a1a1a", textColor: "#ffffff", font: "", size: 14, weight: 500, italic: false, underline: false, strike: false };
  if (type === "columns") return { id, type, left: "", right: "", color: "#303030", font: "", size: 14, weight: 400, italic: false, underline: false, strike: false };
  if (type === "spacer") return { id, type, size: "m" };
  return { id, type: "divider", color: "#e6e6e6" };
}

export const EVENT_LABELS = ["צפייה בעמוד", "צפייה במוצר", "הוספה לעגלה", "התחלת תשלום", "רכישה"];
