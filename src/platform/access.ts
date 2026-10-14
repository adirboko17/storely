import type { NavItem } from "@/lib/navigation/nav";

export const ACCESS_AREAS = [
  { id: "orders", label: "הזמנות" },
  { id: "products", label: "מוצרים" },
  { id: "customers", label: "לקוחות" },
  { id: "marketing", label: "שיווק" },
  { id: "discounts", label: "הנחות" },
  { id: "content", label: "תוכן" },
  { id: "reports", label: "ניתוח נתונים" },
  { id: "live", label: "צפייה חיה" },
  { id: "settings", label: "הגדרות" },
] as const;

export type AccessAreaId = (typeof ACCESS_AREAS)[number]["id"];

export type StoreAccess = {
  full: boolean;
  settings: boolean;
  permissions: string[];
  name: string;
  email: string;
};

const OPEN_ACCESS: StoreAccess = {
  full: true,
  settings: true,
  permissions: ["*"],
  name: "",
  email: "",
};

const ITEM_ACCESS: Record<string, readonly string[]> = {
  dashboard: ["analytics.read"],
  orders: ["orders.read"],
  products: ["products.read"],
  customers: ["customers.read"],
  growth: ["analytics.read"],
  marketing: ["marketing.read"],
  discounts: ["discounts.read"],
  content: ["content.read"],
};

export function parseStoreAccess(value: unknown): StoreAccess {
  if (!value || typeof value !== "object") return OPEN_ACCESS;
  const row = value as Record<string, unknown>;
  const permissions = Array.isArray(row.permissions)
    ? row.permissions.filter((item): item is string => typeof item === "string")
    : [];
  const full = row.full === true || permissions.includes("*");
  return {
    full,
    settings: full || row.settings === true || permissions.includes("settings.manage"),
    permissions,
    name: typeof row.name === "string" ? row.name : "",
    email: typeof row.email === "string" ? row.email : "",
  };
}

export function allowsAccess(access: StoreAccess, keys: readonly string[]) {
  if (access.full || access.permissions.includes("*")) return true;
  return keys.some((key) => access.permissions.includes(key));
}

export function visibleAdminNavigation(items: NavItem[], access: StoreAccess): NavItem[] {
  if (access.full) return items;
  return items.flatMap((item) => {
    const next = shapeNavItem(item, access);
    return next ? [next] : [];
  });
}

function shapeNavItem(item: NavItem, access: StoreAccess): NavItem | null {
  if (item.viewStore) return item;
  if (item.key === "analytics") return shapeAnalytics(item, access);
  const keys = ITEM_ACCESS[item.key];
  if (!keys || !allowsAccess(access, keys)) return null;
  return item;
}

function shapeAnalytics(item: NavItem, access: StoreAccess): NavItem | null {
  const reports = allowsAccess(access, ["analytics.read"]);
  const live = allowsAccess(access, ["analytics.live"]);
  if (live && !reports) {
    return {
      ...item,
      label: "צפייה חיה",
      href: "/admin/analytics/live",
      match: "/admin/analytics/live",
      children: undefined,
    };
  }
  if (!reports) return null;
  const children = live ? item.children : item.children?.filter((child) => child.key !== "live");
  return { ...item, children: children?.length ? children : undefined };
}

export function canOpenAdminPath(pathname: string, access: StoreAccess) {
  if (access.full) return true;
  if (pathname === "/admin") return allowsAccess(access, ["analytics.read"]);
  if (pathname.startsWith("/admin/settings")) return access.settings;
  if (pathname.startsWith("/admin/analytics/live")) return allowsAccess(access, ["analytics.live"]);
  if (pathname.startsWith("/admin/analytics")) return allowsAccess(access, ["analytics.read"]);
  if (pathname.startsWith("/admin/orders")) return allowsAccess(access, ["orders.read"]);
  if (pathname.startsWith("/admin/products")) return allowsAccess(access, ["products.read"]);
  if (pathname.startsWith("/admin/customers")) return allowsAccess(access, ["customers.read"]);
  if (pathname.startsWith("/admin/growth")) return allowsAccess(access, ["analytics.read"]);
  if (pathname.startsWith("/admin/marketing")) return allowsAccess(access, ["marketing.read"]);
  if (pathname.startsWith("/admin/discounts")) return allowsAccess(access, ["discounts.read"]);
  if (pathname.startsWith("/admin/content")) return allowsAccess(access, ["content.read"]);
  if (pathname.startsWith("/admin/design-system")) return access.settings;
  return false;
}
