import { moduleCatalog } from "@/modules/catalog";
import type { Permission } from "@/platform/permissions";
import { hasPermission } from "@/platform/permissions";
import type { ExtensionPoint, ExtensionPointMap, StorelyModule } from "@/platform/modules";
import type { AdminSession } from "@/platform/session";
import { installation } from "@/store/installation";
import { storeExtensions } from "@/store/extensions";

export type ModuleAccess =
  | { ok: true; module: StorelyModule }
  | { ok: false; reason: "not_installed" | "disabled" | "forbidden" };

export function findModule(moduleId: string): StorelyModule | undefined {
  return moduleCatalog.find((entry) => entry.id === moduleId);
}

function deploymentServes(session: AdminSession): boolean {
  return session.store.storeId === installation.storeId && session.store.environment === installation.environment;
}

export function moduleAccess(session: AdminSession, moduleId: string): ModuleAccess {
  const entry = findModule(moduleId);
  const state = installation.modules.find((item) => item.id === moduleId);
  if (!deploymentServes(session) || !entry || !state) return { ok: false, reason: "not_installed" };
  if (!state.enabled) return { ok: false, reason: "disabled" };
  if (!hasPermission(session.actor, session.store.storeId, entry.accessPermission)) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, module: entry };
}

export function requireModule(session: AdminSession, moduleId: string): StorelyModule {
  const access = moduleAccess(session, moduleId);
  if (!access.ok) {
    const error = new Error(access.reason);
    error.name = "ModuleAccessError";
    throw error;
  }
  return access.module;
}

export function requirePermission(session: AdminSession, permission: Permission): void {
  if (!hasPermission(session.actor, session.store.storeId, permission)) {
    const error = new Error("forbidden");
    error.name = "ModuleAccessError";
    throw error;
  }
}

function contributionAllowed(session: AdminSession, permission: Permission | undefined): boolean {
  return permission === undefined || hasPermission(session.actor, session.store.storeId, permission);
}

export function contributions<K extends ExtensionPoint>(
  session: AdminSession,
  point: K,
): ExtensionPointMap[K][] {
  const items: ExtensionPointMap[K][] = [];

  for (const entry of moduleCatalog) {
    if (!moduleAccess(session, entry.id).ok) continue;
    for (const item of entry.contributions?.[point] ?? []) {
      if (contributionAllowed(session, item.permission)) items.push(item);
    }
  }

  for (const extension of storeExtensions) {
    if (!extension.enabled || extension.storeId !== session.store.storeId) continue;
    for (const item of extension.contributions[point] ?? []) {
      if (contributionAllowed(session, item.permission)) items.push(item);
    }
  }

  return items;
}
