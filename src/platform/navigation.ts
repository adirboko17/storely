import type { NavItem } from "@/lib/navigation/nav";
import { titleForPath } from "@/lib/navigation/nav";
import { NAV_ITEMS } from "@/lib/navigation/nav";
import { moduleCatalog } from "@/modules/catalog";
import { hasPermission } from "@/platform/permissions";
import type { ModuleNavItem } from "@/platform/modules";
import { moduleAccess } from "@/platform/registry";
import type { AdminSession } from "@/platform/session";

function ownsPath(path: string, item: ModuleNavItem): boolean {
  if (path === item.href || path.startsWith(`${item.href}/`)) return true;
  return item.children?.some((child) => path === child.href || path.startsWith(`${child.href}/`)) ?? false;
}

export function modulePathStatus(path: string, session: AdminSession): "core" | "available" | "unavailable" {
  for (const entry of moduleCatalog) {
    if (!entry.navigation.some((item) => ownsPath(path, item))) continue;
    return moduleAccess(session, entry.id).ok ? "available" : "unavailable";
  }
  return "core";
}

export function resolveAdminNavigation(session: AdminSession): NavItem[] {
  const extra: NavItem[] = [];

  for (const entry of moduleCatalog) {
    if (!moduleAccess(session, entry.id).ok) continue;
    for (const item of entry.navigation) {
      if (!hasPermission(session.actor, session.store.storeId, item.permission)) continue;
      const children = item.children
        ?.filter((child) => hasPermission(session.actor, session.store.storeId, child.permission))
        .map((child) => ({ key: child.key, label: child.label, href: child.href }));
      extra.push({
        key: item.key,
        label: item.label,
        href: item.href,
        match: item.match,
        icon: item.icon,
        children: children?.length ? children : undefined,
      });
    }
  }

  return [...NAV_ITEMS, ...extra];
}

export function titleForAdminPath(path: string, session: AdminSession): string {
  const coreTitle = titleForPath(path);
  if (coreTitle !== "מודול") return coreTitle;

  for (const entry of moduleCatalog) {
    if (!moduleAccess(session, entry.id).ok) continue;
    const item = entry.navigation.find((navItem) => ownsPath(path, navItem));
    if (item) return item.label;
  }

  return coreTitle;
}
