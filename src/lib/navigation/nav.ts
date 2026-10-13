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
      { key: "drafts", label: "טיוטות", href: "/admin/orders/drafts" },
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
      { key: "collections", label: "אוספים", href: "/admin/products/collections" },
      { key: "inventory", label: "מלאי", href: "/admin/products/inventory" },
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
      { key: "companies", label: "חברות", href: "/admin/customers/companies" },
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
      { key: "automations", label: "אוטומציות", href: "/admin/marketing/automations" },
    ],
  },
  { key: "discounts", label: "הנחות", href: "/admin/discounts", match: "/admin/discounts", icon: "discount" },
  {
    key: "content",
    label: "תוכן",
    href: "/admin/content/posts",
    match: "/admin/content",
    icon: "content",
    children: [{ key: "blogs", label: "פוסטים בבלוג", href: "/admin/content/posts" }],
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
    children: [
      { key: "pages", label: "עמודים", href: "/admin/online-store/pages" },
      { key: "menus", label: "תפריטי ניווט", href: "/admin/online-store/menus" },
      { key: "homecontent", label: "תוכן דף הבית", href: "/admin/online-store/home" },
      { key: "banners", label: "באנרים", href: "/admin/online-store/banners" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/admin/orders": "הזמנות",
  "/admin/orders/drafts": "טיוטות",
  "/admin/orders/returns": "החזרות והחזרים כספיים",
  "/admin/orders/abandoned": "עגלות נטושות",
  "/admin/products": "מוצרים",
  "/admin/products/new": "מוצר חדש",
  "/admin/products/collections": "אוספים",
  "/admin/products/inventory": "מלאי",
  "/admin/products/gift-cards": "כרטיסי מתנה",
  "/admin/customers": "לקוחות",
  "/admin/customers/segments": "פלחים",
  "/admin/customers/companies": "חברות",
  "/admin/growth": "צמיחה",
  "/admin/growth/attribution": "ייחוס",
  "/admin/marketing/integrations": "אינטגרציות",
  "/admin/marketing/automations": "אוטומציות",
  "/admin/discounts": "הנחות",
  "/admin/discounts/new": "הנחה חדשה",
  "/admin/content/posts": "פוסטים בבלוג",
  "/admin/content/posts/new": "פוסט חדש",
  "/admin/analytics": "ניתוח נתונים",
  "/admin/analytics/reports": "דוחות",
  "/admin/analytics/live": "צפייה חיה",
  "/admin/online-store": "חנות אונליין",
  "/admin/online-store/pages": "עמודים",
  "/admin/online-store/menus": "תפריטי ניווט",
  "/admin/online-store/home": "תוכן דף הבית",
  "/admin/online-store/banners": "באנרים",
  "/admin/settings": "הגדרות",
  "/admin/design-system": "מערכת עיצוב ומפרט",
};

export function titleForPath(path: string) {
  if (TITLES[path]) return TITLES[path];
  if (/^\/admin\/orders\/abandoned\/[^/]+$/.test(path)) return "עגלה נטושה";
  if (/^\/admin\/orders\/\d+$/.test(path)) return "הזמנה";
  if (/^\/admin\/products\/collections\/[^/]+$/.test(path)) return "אוסף";
  if (/^\/admin\/products\/[^/]+$/.test(path)) return "מוצר";
  if (/^\/admin\/customers\/[^/]+$/.test(path)) return "לקוח";
  if (/^\/admin\/discounts\/[^/]+$/.test(path)) return "הנחה";
  if (/^\/admin\/content\/posts\/[^/]+$/.test(path)) return "פוסט";
  if (/^\/admin\/marketing\/automations\/[^/]+$/.test(path)) return "אוטומציה";
  return "מודול";
}

export function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ASSISTANT_ROUTES: Array<[string, string, string]> = [
  ["הזמנ", "/admin/orders", "ההזמנות"],
  ["משלוח", "/admin/orders", "ההזמנות"],
  ["מוצר", "/admin/products", "המוצרים"],
  ["מלאי", "/admin/products", "המוצרים"],
  ["לקוח", "/admin/customers", "הלקוחות"],
  ["פלח", "/admin/customers/segments", "פלחי הלקוחות"],
  ["הנח", "/admin/discounts", "ההנחות"],
  ["קופון", "/admin/discounts", "ההנחות"],
  ["קוד", "/admin/discounts", "ההנחות"],
];

export function assistantDestination(query: string) {
  const hit = ASSISTANT_ROUTES.find(([needle]) => query.includes(needle));
  if (!hit) return null;
  return { href: hit[1], toast: `פתחתי את ${hit[2]}` };
}
