import { reportById } from "@/lib/analytics/reports";
import type { IconName } from "@/lib/icons";

export type NavChild = {
  key: string;
  label: string;
  href: string;
};

export type NavItem = {
  key: string;
  label: string;
  href: string;
  match: string;
  exact?: boolean;
  icon: IconName;
  section?: string;
  children?: NavChild[];
  viewStore?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "בית", href: "/admin", match: "/admin", exact: true, icon: "home" },
  {
    key: "orders",
    label: "הזמנות",
    href: "/admin/orders",
    match: "/admin/orders",
    icon: "orders",
    children: [
      { key: "returns", label: "החזרות והחזרים כספיים", href: "/admin/orders/returns" },
      { key: "abandoned", label: "עגלות נטושות", href: "/admin/orders/abandoned" },
    ],
  },
  {
    key: "products",
    label: "מוצרים",
    href: "/admin/products",
    match: "/admin/products",
    icon: "tag",
    children: [
      { key: "collections", label: "קטגוריות", href: "/admin/products/collections" },
      { key: "inventory", label: "מלאי", href: "/admin/products/inventory" },
      { key: "reviews", label: "ביקורות", href: "/admin/products/reviews" },
      { key: "giftcards", label: "כרטיסי מתנה", href: "/admin/products/gift-cards" },
    ],
  },
  {
    key: "customers",
    label: "לקוחות",
    href: "/admin/customers",
    match: "/admin/customers",
    icon: "user",
    children: [
      { key: "segments", label: "פלחים", href: "/admin/customers/segments" },
    ],
  },
  {
    key: "growth",
    label: "צמיחה",
    href: "/admin/growth",
    match: "/admin/growth",
    icon: "growth",
    children: [{ key: "attribution", label: "ייחוס", href: "/admin/growth/attribution" }],
  },
  {
    key: "marketing",
    label: "שיווק",
    href: "/admin/marketing/integrations",
    match: "/admin/marketing",
    icon: "megaphone",
    children: [
      { key: "integrations", label: "אינטגרציות", href: "/admin/marketing/integrations" },
      { key: "emails", label: "מיילים ו-SMS", href: "/admin/marketing/emails" },
      { key: "automations", label: "אוטומציות", href: "/admin/marketing/automations" },
      { key: "campaigns", label: "קמפיינים", href: "/admin/marketing/campaigns" },
      { key: "popups", label: "פופאפים", href: "/admin/marketing/popups" },
    ],
  },
  { key: "discounts", label: "הנחות", href: "/admin/discounts", match: "/admin/discounts", icon: "discount" },
  {
    key: "content",
    label: "תוכן",
    href: "/admin/content/posts",
    match: "/admin/content",
    icon: "content",
    children: [
      { key: "blogs", label: "פוסטים בבלוג", href: "/admin/content/posts" },
      { key: "events", label: "אירועים", href: "/admin/content/events" },
    ],
  },
  {
    key: "analytics",
    label: "ניתוח נתונים",
    href: "/admin/analytics",
    match: "/admin/analytics",
    icon: "bars",
    section: "ערוץ מכירה",
    children: [
      { key: "reports", label: "דוחות", href: "/admin/analytics/reports" },
      { key: "live", label: "צפייה חיה", href: "/admin/analytics/live" },
    ],
  },
  {
    key: "store",
    label: "חנות אונליין",
    href: "/admin/online-store",
    match: "/admin/online-store",
    icon: "store",
    viewStore: true,
  },
];

const TITLES: Record<string, string> = {
  "/admin/orders": "הזמנות",
  "/admin/orders/returns": "החזרות והחזרים כספיים",
  "/admin/orders/abandoned": "עגלות נטושות",
  "/admin/products": "מוצרים",
  "/admin/products/new": "מוצר חדש",
  "/admin/products/collections": "קטגוריות",
  "/admin/products/inventory": "מלאי",
  "/admin/products/reviews": "ביקורות",
  "/admin/products/gift-cards": "כרטיסי מתנה",
  "/admin/products/gift-cards/new": "יצירת כרטיס מתנה",
  "/admin/products/gift-cards/product": "יצירת מוצר כרטיס מתנה",
  "/admin/customers": "לקוחות",
  "/admin/customers/new": "לקוח חדש",
  "/admin/customers/segments": "פלחים",
  "/admin/growth": "צמיחה",
  "/admin/growth/attribution": "ייחוס",
  "/admin/marketing/integrations": "אינטגרציות",
  "/admin/marketing/emails": "מיילים ו-SMS",
  "/admin/marketing/automations": "אוטומציות",
  "/admin/marketing/campaigns": "קמפיינים",
  "/admin/marketing/popups": "פופאפים",
  "/admin/discounts": "הנחות",
  "/admin/discounts/new": "הנחה חדשה",
  "/admin/content/posts": "פוסטים בבלוג",
  "/admin/content/posts/new": "פוסט חדש",
  "/admin/content/events": "אירועים",
  "/admin/content/events/new": "אירוע חדש",
  "/admin/analytics": "ניתוח נתונים",
  "/admin/analytics/reports": "דוחות",
  "/admin/analytics/live": "צפייה חיה",
  "/admin/settings": "הגדרות",
  "/admin/settings/ai": "חיבור AI",
  "/admin/settings/users": "משתמשים",
  "/admin/settings/users/new": "הוספת משתמש",
  "/admin/settings/policies": "פוליסות",
  "/admin/settings/shipping": "משלוחים",
  "/admin/design-system": "מערכת עיצוב ומפרט",
};

export function titleForPath(path: string) {
  if (TITLES[path]) return TITLES[path];
  if (/^\/admin\/orders\/abandoned\/[^/]+$/.test(path)) return "עגלה נטושה";
  if (/^\/admin\/orders\/\d+$/.test(path)) return "הזמנה";
  if (/^\/admin\/products\/gift-cards\/(?!new$|product$)[^/]+$/.test(path)) return "כרטיס מתנה";
  if (/^\/admin\/products\/collections\/[^/]+$/.test(path)) return "קטגוריה";
  if (/^\/admin\/products\/[^/]+$/.test(path)) return "מוצר";
  if (/^\/admin\/customers\/[^/]+$/.test(path)) return "לקוח";
  if (/^\/admin\/discounts\/[^/]+$/.test(path)) return "הנחה";
  if (/^\/admin\/content\/posts\/[^/]+$/.test(path)) return "פוסט";
  if (/^\/admin\/content\/events\/[^/]+$/.test(path)) return "אירוע";
  if (/^\/admin\/marketing\/automations\/[^/]+$/.test(path)) return "אוטומציה";
  if (/^\/admin\/marketing\/campaigns\/[^/]+$/.test(path)) return "קמפיין";
  if (path === "/admin/marketing/popups/quiz") return "שאלון";
  if (/^\/admin\/marketing\/popups\/[^/]+$/.test(path)) return "פופאפ";
  if (/^\/admin\/marketing\/emails\/[^/]+$/.test(path)) return "מייל";
  if (/^\/admin\/marketing\/sms\/[^/]+$/.test(path)) return "SMS";
  if (/^\/admin\/settings\/users\/[^/]+$/.test(path)) return "עריכת משתמש";
  if (/^\/admin\/analytics\/reports\/[^/]+$/.test(path)) {
    const report = reportById(path.slice("/admin/analytics/reports/".length));
    return report?.name ?? "דוח";
  }
  return "מודול";
}

export function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
