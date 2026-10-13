/**
 * Platform administration is a separate authority from store membership.
 * A store owner does not receive these permissions.
 */
export const PLATFORM_PERMISSIONS = [
  "platform.stores.read",
  "platform.stores.create",
  "platform.domains.manage",
  "platform.members.invite",
  "platform.modules.manage",
  "platform.system.manage",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export type PlatformOperator = {
  userId: string;
  permissions: readonly PlatformPermission[];
};

export function hasPlatformPermission(
  operator: PlatformOperator | null,
  permission: PlatformPermission,
): boolean {
  return operator?.permissions.includes(permission) ?? false;
}
