import { getStoreIdentity } from "@/data/live/store-identity";

export type PolicyKind = "return" | "privacy" | "terms" | "shipping" | "contact" | "legal" | "purchase";

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

export type ShipProfile = {
  id: string;
  name: string;
  location: ShipLocation | null;
  zones: ShipZone[];
};

type State = {
  version: number;
  policies: Record<PolicyKind, string>;
  rules: ReturnRule[];
  profiles: ShipProfile[];
  estimates: boolean;
  localDelivery: boolean;
  pickup: boolean;
};

const emptyPolicies = (): Record<PolicyKind, string> => ({
  return: "",
  privacy: "",
  terms: "",
  shipping: "",
  contact: "",
  legal: "",
  purchase: "",
});

let current: State = {
  version: 0,
  policies: emptyPolicies(),
  rules: [],
  profiles: [{ id: "general", name: "פרופיל כללי", location: null, zones: [] }],
  estimates: false,
  localDelivery: false,
  pickup: false,
};

const listeners = new Set<() => void>();

function publish(next: Omit<State, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
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

export function policyTemplate(kind: PolicyKind) {
  const store = getStoreIdentity();
  const name = store.name.trim() || "החנות";
  const contact = [store.hostname.trim(), store.ownerEmail.trim()].filter(Boolean).join(" · ");
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

export function savePolicy(kind: PolicyKind, body: string) {
  publish({ ...current, policies: { ...current.policies, [kind]: body } });
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
                rates: price ? [{ id: `${zone.id}-rate`, name: zone.name || "משלוח", price }] : [],
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
            return next ? { ...zone, rates: [{ id: `${zone.id}-rate`, name: zone.name || "משלוח", price: next }] } : zone;
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

export function setShippingFlag(key: "estimates" | "localDelivery" | "pickup", value: boolean) {
  publish({ ...current, [key]: value });
}
