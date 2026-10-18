import { getStoreIdentity } from "@/data/live/store-identity";
import { isHydrating, writeStore } from "@/data/live/write";

export type PolicyKind = "return" | "privacy" | "terms" | "shipping" | "contact" | "legal" | "purchase";

export type PolicySurfaceMode = "hidden" | "link" | "checkbox";

export type StorePolicy = {
  id: string;
  kind: PolicyKind | "custom";
  title: string;
  body: string;
  footer: boolean;
  cart: PolicySurfaceMode;
  checkout: PolicySurfaceMode;
};

export const BUILTIN_POLICIES: Array<{ kind: PolicyKind; title: string; required?: boolean }> = [
  { kind: "return", title: "מדיניות החזרות והחזרים" },
  { kind: "privacy", title: "מדיניות פרטיות" },
  { kind: "terms", title: "תנאי שימוש" },
  { kind: "shipping", title: "מדיניות משלוחים" },
  { kind: "contact", title: "פרטי יצירת קשר" },
  { kind: "legal", title: "הודעה משפטית" },
  { kind: "purchase", title: "מדיניות ביטול אפשרויות רכישה", required: true },
];

export type ReturnRule = {
  id: string;
  name: string;
  days: string;
  fee: string;
};

export type ShipRate = {
  id: string;
  name: string;
  price: string;
};

export type ShipZone = {
  id: string;
  name: string;
  country: string;
  rates: ShipRate[];
};

export type ShipLocation = {
  name: string;
  address: string;
};

export type StoreContact = {
  email: string;
  phone: string;
  addressMode: "none" | "physical";
  company: string;
  country: string;
  street: string;
  apartment: string;
  zip: string;
  city: string;
};

export function emptyStoreContact(): StoreContact {
  return { email: "", phone: "", addressMode: "none", company: "", country: "ישראל", street: "", apartment: "", zip: "", city: "" };
}

export type ShipProfile = {
  id: string;
  name: string;
  location: ShipLocation | null;
  zones: ShipZone[];
};

type State = {
  version: number;
  policies: StorePolicy[];
  rules: ReturnRule[];
  profiles: ShipProfile[];
  estimates: boolean;
  localDelivery: boolean;
  pickup: boolean;
  contact: StoreContact;
  logo: string;
  colors: string[];
};

export const DEFAULT_BRAND_COLORS = ["#1a1a1a", "#303030", "#ffffff", "#8e1f0b", "#0c5132", "#005bd3", "#5b3fc4"];

export function normalizeBrandColors(value: unknown) {
  const saved = Array.isArray(value) ? value : [];
  return DEFAULT_BRAND_COLORS.map((fallback, index) => {
    const color = saved[index];
    return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback;
  });
}

export function defaultPolicyList(): Array<StorePolicy & { kind: PolicyKind }> {
  return BUILTIN_POLICIES.map((item) => ({
    id: item.kind,
    kind: item.kind,
    title: item.title,
    body: "",
    footer: true,
    cart: "hidden",
    checkout: "link",
  }));
}

function isSurfaceMode(value: unknown): value is PolicySurfaceMode {
  return value === "hidden" || value === "link" || value === "checkbox";
}

function builtinKind(value: unknown): PolicyKind | null {
  return BUILTIN_POLICIES.some((item) => item.kind === value) ? (value as PolicyKind) : null;
}

export function normalizePolicies(value: unknown): StorePolicy[] {
  const root = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const defaults = defaultPolicyList();
  const legacyBody = (kind: PolicyKind) => (typeof root[kind] === "string" ? root[kind] : "");

  if (!Array.isArray(root.items)) {
    return defaults.map((item) => ({ ...item, body: legacyBody(item.kind) }));
  }

  const byKind = new Map<PolicyKind, StorePolicy>();
  const custom: StorePolicy[] = [];
  root.items.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as Record<string, unknown>;
    const kind = item.kind === "custom" ? "custom" : builtinKind(item.kind);
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!kind || !id) return;
    const fallback = kind === "custom" ? null : defaults.find((policy) => policy.kind === kind);
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : fallback?.title ?? "תקנון";
    const policy: StorePolicy = {
      id,
      kind,
      title,
      body: typeof item.body === "string" ? item.body : fallback?.body ?? "",
      footer: typeof item.footer === "boolean" ? item.footer : fallback?.footer ?? false,
      cart: isSurfaceMode(item.cart) ? item.cart : fallback?.cart ?? "hidden",
      checkout: isSurfaceMode(item.checkout) ? item.checkout : fallback?.checkout ?? "hidden",
    };
    if (kind === "custom") custom.push(policy);
    else byKind.set(kind, policy);
  });

  return [
    ...defaults.map((item) => byKind.get(item.kind) ?? { ...item, body: legacyBody(item.kind) }),
    ...custom,
  ];
}

export function policiesPayload(policies: StorePolicy[]) {
  const legacy = Object.fromEntries(
    BUILTIN_POLICIES.map((item) => [item.kind, policies.find((policy) => policy.kind === item.kind)?.body ?? ""]),
  );
  return { version: 2, items: policies, ...legacy };
}

export function policyPlacementLabel(policy: StorePolicy) {
  const parts: string[] = [];
  if (policy.footer) parts.push("פוטר");
  if (policy.cart === "link") parts.push("עגלה · קישור");
  if (policy.cart === "checkbox") parts.push("עגלה · קראתי");
  if (policy.checkout === "link") parts.push("תשלום · קישור");
  if (policy.checkout === "checkbox") parts.push("תשלום · קראתי");
  return parts.length ? parts.join(" · ") : "לא מוצג באתר";
}

export function blankPolicy(): StorePolicy {
  return {
    id: `policy-${Date.now()}`,
    kind: "custom",
    title: "",
    body: "",
    footer: true,
    cart: "hidden",
    checkout: "hidden",
  };
}

let current: State = {
  version: 0,
  policies: defaultPolicyList(),
  rules: [],
  profiles: [{ id: "general", name: "פרופיל כללי", location: null, zones: [] }],
  estimates: false,
  localDelivery: false,
  pickup: false,
  contact: emptyStoreContact(),
  logo: "",
  colors: [...DEFAULT_BRAND_COLORS],
};

const listeners = new Set<() => void>();

function publish(next: Omit<State, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  if (isHydrating()) return;
  void writeStore("save_store_sections", {
    sections: {
      policies: policiesPayload(current.policies),
      shipping: {
        rules: current.rules,
        profiles: current.profiles,
        estimates: current.estimates,
        localDelivery: current.localDelivery,
        pickup: current.pickup,
        contact: current.contact,
      },
    },
  });
}

export function replaceSettings(next: Omit<State, "version">) {
  publish(next);
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSettingsVersion() {
  return current.version;
}

export function getSettings() {
  return current;
}

export function policyText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
}

export function policyTemplate(kind: PolicyKind | "custom") {
  const store = getStoreIdentity();
  const name = store.name.trim() || "החנות";
  const contact = [store.hostname.trim(), store.ownerEmail.trim()].filter(Boolean).join(" · ");
  if (kind === "custom") {
    return `<p><strong>תקנון</strong></p><p>התקנון הזה של ${name} מסביר את הכללים שחלים על השימוש באתר ועל הרכישה.</p>`;
  }
  const pages: Record<PolicyKind, string> = {
    return: `<p><strong>החזרות</strong></p><p>אפשר לבקש החזרה מ${name} לפי חלון ההחזרה שמוגדר בחנות. המוצר צריך לחזור במצב שאפשר למכור אותו מחדש.</p>`,
    privacy: `<p><strong>פרטיות</strong></p><p>${name} שומרת פרטי הזמנה ופרטי קשר כדי לטפל בהזמנה ולשלוח עדכונים. הפרטים לא נמכרים.</p>`,
    terms: `<p><strong>תנאי שימוש</strong></p><p>השימוש באתר של ${name} מהווה הסכמה לתנאים האלה. המחירים והמלאי המוצגים באתר הם אלה שבתוקף בזמן ההזמנה.</p>`,
    shipping: `<p><strong>משלוחים</strong></p><p>${name} מחשבת משלוח לפי אזור היעד ואפשרויות המשלוח שמוגדרות בחנות. זמן האספקה מופיע בקופה כשהוא ידוע.</p>`,
    contact: `<p><strong>יצירת קשר</strong></p><p>${name}${contact ? ` · ${contact}` : ""}</p>`,
    legal: `<p><strong>הודעה משפטית</strong></p><p>התכנים באתר של ${name} מוצגים כפי שהם, והחנות יכולה לעדכן אותם.</p>`,
    purchase: `<p><strong>ביטול רכישה</strong></p><p>אפשר לבטל רכישה מ${name} כל עוד ההזמנה לא נשלחה, לפי הכללים שמופיעים כאן.</p>`,
  };
  return pages[kind];
}

export function saveStoreContact(contact: StoreContact) {
  publish({ ...current, contact });
}

export function savePolicy(policy: StorePolicy) {
  const builtin = BUILTIN_POLICIES.find((item) => item.kind === policy.kind);
  const next = { ...policy, title: policy.title.trim() || builtin?.title || "תקנון חדש" };
  const policies = current.policies.some((item) => item.id === next.id)
    ? current.policies.map((item) => (item.id === next.id ? next : item))
    : [...current.policies, next];
  publish({ ...current, policies });
}

export function deletePolicy(id: string) {
  const target = current.policies.find((item) => item.id === id);
  if (!target || target.kind !== "custom") return;
  publish({ ...current, policies: current.policies.filter((item) => item.id !== id) });
}

export function saveReturnRule(rule: ReturnRule) {
  const rules = current.rules.some((item) => item.id === rule.id)
    ? current.rules.map((item) => (item.id === rule.id ? rule : item))
    : [...current.rules, rule];
  publish({ ...current, rules });
}

export function deleteReturnRule(id: string) {
  publish({ ...current, rules: current.rules.filter((rule) => rule.id !== id) });
}

export function deleteShipProfile(id: string) {
  publish({ ...current, profiles: current.profiles.filter((profile) => profile.id !== id) });
}

export function addShipProfile(name: string) {
  const id = `profile-${current.profiles.length + 1}`;
  publish({
    ...current,
    profiles: [...current.profiles, { id, name: name.trim() || "פרופיל חדש", location: null, zones: [] }],
  });
  return id;
}

export function saveShipLocation(profileId: string, location: ShipLocation) {
  publish({
    ...current,
    profiles: current.profiles.map((profile) => (profile.id === profileId ? { ...profile, location } : profile)),
  });
}

export function addShipZone(profileId: string, zone: Omit<ShipZone, "rates"> & { price?: string }) {
  const price = zone.price?.trim() ?? "";
  publish({
    ...current,
    profiles: current.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            zones: [
              ...profile.zones,
              {
                id: zone.id,
                name: zone.name,
                country: zone.country,
                rates: price ? [{ id: `${zone.id}-rate`, name: profile.name.trim() || zone.name || "משלוח", price }] : [],
              },
            ],
          }
        : profile,
    ),
  });
}

export function setZonePrice(profileId: string, zoneId: string, price: string) {
  publish({
    ...current,
    profiles: current.profiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      return {
        ...profile,
        zones: profile.zones.map((zone) => {
          if (zone.id !== zoneId) return zone;
          const next = price.trim();
          const first = zone.rates[0];
          if (!first) {
            return next ? { ...zone, rates: [{ id: `${zone.id}-rate`, name: profile.name.trim() || zone.name || "משלוח", price: next }] } : zone;
          }
          return { ...zone, rates: zone.rates.map((rate, index) => (index === 0 ? { ...rate, price: next } : rate)) };
        }),
      };
    }),
  });
}

export function addShipRate(profileId: string, zoneId: string, rate: ShipRate) {
  publish({
    ...current,
    profiles: current.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            zones: profile.zones.map((zone) => (zone.id === zoneId ? { ...zone, rates: [...zone.rates, rate] } : zone)),
          }
        : profile,
    ),
  });
}

export function deleteShipRate(profileId: string, zoneId: string, rateId: string) {
  publish({
    ...current,
    profiles: current.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            zones: profile.zones.map((zone) =>
              zone.id === zoneId ? { ...zone, rates: zone.rates.filter((rate) => rate.id !== rateId) } : zone,
            ),
          }
        : profile,
    ),
  });
}

export function brandPalette() {
  return normalizeBrandColors(current.colors);
}

export function setBrandColor(index: number, color: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  const colors = brandPalette();
  if (index < 0 || index >= colors.length) return;
  colors[index] = color.toLowerCase();
  current = { ...current, colors, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  if (isHydrating()) return;
  void writeStore("save_store_brand_colors", { colors });
}

export function setStoreLogo(logo: string) {
  current = { ...current, logo, version: current.version + 1 };
  listeners.forEach((listener) => listener());
  if (isHydrating()) return;
  void writeStore("save_store_logo", { logo_url: logo });
}

export function setShippingFlag(key: "estimates" | "localDelivery" | "pickup", value: boolean) {
  publish({ ...current, [key]: value });
}
