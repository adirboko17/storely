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

export type FlowStep =
  | { type: "wait"; value: string; unit: string }
  | { type: "cond"; text?: string; match?: "all" | "any"; rules?: FlowRule[]; yes?: FlowStep[]; no?: FlowStep[] }
  | { type: "ab"; percent: number; a?: FlowStep[]; b?: FlowStep[] }
  | { type: "email"; subject: string; preview: string; body: string }
  | { type: "sms"; text: string }
  | { type: "end" };

export type Flow = {
  id: number;
  name: string;
  trigger: string;
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
  { id: "winback", group: "אירוע", label: "לא קנה 30 יום", detail: "לקוח שקט שכדאי להחזיר" },
  { id: "all", group: "קהל", label: "כל הלקוחות", detail: "מבצע, עדכון או הודעה לכל הרשימה" },
  { id: "subs", group: "קהל", label: "כל המנויים לדיוור", detail: "רק מי שאישר לקבל דיוור" },
  { id: "vip", group: "קהל", label: "פלח: לקוחות VIP", detail: "הפלח השמור של לקוחות VIP" },
  { id: "fresh", group: "קהל", label: "פלח: לקוחות חדשים", detail: "לקוחות מהתקופה האחרונה" },
  { id: "repeat", group: "קהל", label: "פלח: רכשו יותר מפעמיים", detail: "לקוחות שחזרו לקנות" },
] as const;

const TEMPLATES: Array<Omit<Flow, "id" | "on" | "stats"> & { key: string }> = [
  { key: "cart", name: "עגלה נטושה", trigger: "הלקוח נטש עגלה", steps: [{ type: "wait", value: "1", unit: "שעות" }, email("שכחתם משהו בעגלה?", "המוצרים שבחרתם עדיין מחכים", "היי {first_name}, שמרנו את העגלה."), { type: "wait", value: "1", unit: "ימים" }, sms("היי {first_name}, העגלה שלך עדיין מחכה. 10% הנחה: {checkout_url}")] },
  { key: "welcome", name: "סדרת ברוכים הבאים", trigger: "לקוח נרשם לדיוור", steps: [email("ברוכים הבאים ל-Storely", "10% הנחה לרכישה הראשונה", "שמחים שהצטרפתם."), { type: "wait", value: "3", unit: "ימים" }, email("הסיפור שמאחורי הסטודיו", "איך נולד כל ספל", "רצינו לשתף איך אנחנו עובדים.")] },
  { key: "thanks", name: "תודה על הרכישה", trigger: "הזמנה שולמה", steps: [{ type: "wait", value: "2", unit: "שעות" }, email("תודה על ההזמנה", "ההזמנה שלכם בדרך", "אנחנו כבר אורזים אותה."), { type: "wait", value: "7", unit: "ימים" }, email("איך היה?", "נשמח לביקורת", "נקדיש דקה לביקורת על המוצר.")] },
  { key: "campaign", name: "מבצע לקהל", trigger: "כל הלקוחות", steps: [email("מבצע חדש בחנות", "רק להשבוע", "היי {first_name}, יש לנו מבצע חדש.")] },
  { key: "winback", name: "החזרת לקוח", trigger: "לא קנה 30 יום", steps: [email("התגעגענו", "מתנה לחזרה", "היי {first_name}, עבר זמן מאז הקנייה האחרונה."), { type: "wait", value: "3", unit: "ימים" }, sms("היי {first_name}, מחכים לך עם הטבה.")] },
];

type Snapshot = {
  version: number;
  connected: Record<string, IntegrationState>;
  flows: Flow[];
};

let current: Snapshot = {
  version: 0,
  connected: {},
  flows: [],
};
const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  if (isHydrating()) return;
  void writeStore("save_store_sections", {
    sections: { marketing: { connected: current.connected, flows: current.flows } },
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

export function createFlow(template: "cart" | "welcome" | "thanks" | "campaign" | "winback" | "blank") {
  const source = TEMPLATES.find((item) => item.key === template);
  const id = Math.max(0, ...current.flows.map((flow) => flow.id)) + 1;
  const flow: Flow = {
    id,
    name: source?.name ?? "אוטומציה חדשה",
    trigger: source?.trigger ?? "בחרו טריגר",
    on: false,
    steps: source ? source.steps.map((step) => ({ ...step })) : [],
    stats: null,
  };
  publish({ ...current, flows: [flow, ...current.flows] });
  return flow;
}

export const EVENT_LABELS = ["צפייה בעמוד", "צפייה במוצר", "הוספה לעגלה", "התחלת תשלום", "רכישה"];
