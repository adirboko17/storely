export const CORE_PERMISSIONS = [
  "products.read",
  "products.create",
  "products.update",
  "products.delete",
  "orders.read",
  "orders.create",
  "orders.update",
  "customers.read",
  "customers.create",
  "customers.update",
  "discounts.read",
  "discounts.create",
  "discounts.update",
  "discounts.delete",
  "content.read",
  "content.update",
  "analytics.read",
  "settings.manage",
] as const;

export type CorePermission = (typeof CORE_PERMISSIONS)[number];

/** A core permission, or a permission declared by a module (`loyalty.read`). */
export type Permission = CorePermission | `${string}.${string}`;

/** `*` is resolved only for the store owner on the server. Modules cannot declare it. */
export type PermissionGrant = Permission | "*";

export const BUILT_IN_ROLES = ["owner", "admin", "manager", "staff"] as const;

export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

export type CustomRoleId = `custom:${string}`;

export type RoleId = BuiltInRole | CustomRoleId;

export type CustomRole = {
  id: CustomRoleId;
  name: string;
  permissions: readonly Permission[];
};

export type MembershipStatus = "active" | "invited" | "disabled";

/**
 * One user, one role, inside one store.
 * The same user may hold a different membership in another store.
 * Permissions are loaded on the server from `role_permissions` for this store.
 * They are not read from `user_metadata`, and a store id supplied by the browser is not a membership.
 */
export type StoreMembership = {
  storeId: string;
  roleId: RoleId;
  status: MembershipStatus;
  permissions: readonly PermissionGrant[];
};

/**
 * Authentication identity. What the user may do is on `memberships`, per store.
 */
export type AdminActor = {
  id: string;
  email: string;
  displayName: string;
  memberships: readonly StoreMembership[];
};

export const ROLE_GRANTS: Record<Exclude<BuiltInRole, "owner">, readonly Permission[]> = {
  admin: CORE_PERMISSIONS,
  manager: [
    "products.read",
    "products.update",
    "orders.read",
    "orders.update",
    "customers.read",
    "analytics.read",
  ],
  staff: ["products.read", "orders.read", "orders.update", "customers.read"],
};

export function grantsForRole(roleId: RoleId, customRoles: readonly CustomRole[]): readonly PermissionGrant[] {
  if (roleId === "owner") return ["*"];
  if (roleId === "admin" || roleId === "manager" || roleId === "staff") return ROLE_GRANTS[roleId];
  return customRoles.find((role) => role.id === roleId)?.permissions ?? [];
}

export function membershipFor(actor: AdminActor, storeId: string): StoreMembership | undefined {
  return actor.memberships.find((membership) => membership.storeId === storeId && membership.status === "active");
}

export function hasPermission(actor: AdminActor, storeId: string, permission: Permission): boolean {
  const membership = membershipFor(actor, storeId);
  if (!membership) return false;
  return membership.permissions.includes("*") || membership.permissions.includes(permission);
}

export function hasEveryPermission(
  actor: AdminActor,
  storeId: string,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(actor, storeId, permission));
}
