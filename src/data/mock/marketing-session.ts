export type IntegrationState = {
  id: string;
  token: string;
  events: number[];
  consent: boolean;
  head: string;
  body: string;
};

export type FlowStep =
  | { type: "wait"; value: string; unit: string }
  | { type: "cond"; text: string }
  | { type: "email"; subject: string; preview: string; body: string }
  | { type: "sms"; text: string };

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

const TEMPLATES: Array<Omit<Flow, "id" | "on" | "stats"> & { key: string }> = [
  { key: "cart", name: "עגלה נטושה", trigger: "הלקוח נטש עגלה", steps: [{ type: "wait", value: "1", unit: "שעות" }, email("שכחתם משהו בעגלה?", "המוצרים שבחרתם עדיין מחכים", "היי {first_name}, שמרנו את העגלה."), { type: "wait", value: "1", unit: "ימים" }, sms("היי {first_name}, העגלה שלך עדיין מחכה. 10% הנחה: {checkout_url}")] },
  { key: "welcome", name: "סדרת ברוכים הבאים", trigger: "לקוח נרשם לדיוור", steps: [email("ברוכים הבאים ל-Storely", "10% הנחה לרכישה הראשונה", "שמחים שהצטרפתם."), { type: "wait", value: "3", unit: "ימים" }, email("הסיפור שמאחורי הסטודיו", "איך נולד כל ספל", "רצינו לשתף איך אנחנו עובדים.")] },
  { key: "thanks", name: "תודה על הרכישה", trigger: "הזמנה שולמה", steps: [{ type: "wait", value: "2", unit: "שעות" }, email("תודה על ההזמנה", "ההזמנה שלכם בדרך", "אנחנו כבר אורזים אותה."), { type: "wait", value: "7", unit: "ימים" }, email("איך היה?", "נשמח לביקורת", "נקדיש דקה לביקורת על המוצר.")] },
];

type Snapshot = {
  version: number;
  connected: Record<string, IntegrationState>;
  flows: Flow[];
};

let current: Snapshot = {
  version: 0,
  connected: {
    meta: { id: "418273645091822", token: "", events: [0, 1, 2, 3, 4], consent: true, head: "", body: "" },
    ga4: { id: "G-8KX2LPQ4MZ", token: "", events: [0, 1, 2, 3, 4], consent: true, head: "", body: "" },
  },
  flows: [
    { id: 1, name: "עגלה נטושה", trigger: "הלקוח נטש עגלה", on: true, steps: TEMPLATES[0].steps, stats: [1284, "48.2%", "9.1%", 18420] },
    { id: 2, name: "סדרת ברוכים הבאים", trigger: "לקוח נרשם לדיוור", on: true, steps: TEMPLATES[1].steps, stats: [612, "61.5%", "14.3%", 7230] },
    { id: 3, name: "תודה על הרכישה", trigger: "הזמנה שולמה", on: false, steps: TEMPLATES[2].steps, stats: [947, "71.0%", "6.2%", 2110] },
  ],
};
const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
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
  return current.flows.map((flow) => ({ ...flow, steps: flow.steps.map((step) => ({ ...step })) }));
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

export function createFlow(template: "cart" | "welcome" | "thanks" | "blank") {
  const source = TEMPLATES.find((item) => item.key === template);
  const id = Math.max(0, ...current.flows.map((flow) => flow.id)) + 1;
  const flow: Flow = {
    id,
    name: source?.name ?? "אוטומציה חדשה",
    trigger: source?.trigger ?? "הלקוח נטש עגלה",
    on: false,
    steps: source ? source.steps.map((step) => ({ ...step })) : [],
    stats: null,
  };
  publish({ ...current, flows: [flow, ...current.flows] });
  return flow;
}

export const EVENT_LABELS = ["צפייה בעמוד", "צפייה במוצר", "הוספה לעגלה", "התחלת תשלום", "רכישה"];
