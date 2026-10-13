export type {
  AdminActor,
  CustomRole,
  MembershipStatus,
  Permission,
  PermissionGrant,
  RoleId,
  StoreMembership,
} from "@/platform/permissions";
export {
  CORE_PERMISSIONS,
  ROLE_GRANTS,
  grantsForRole,
  hasEveryPermission,
  hasPermission,
  membershipFor,
} from "@/platform/permissions";
export type {
  ExtensionPoint,
  ModuleInstallState,
  ModuleNavItem,
  StoreExtension,
  StoreInstallation,
  StorelyModule,
} from "@/platform/modules";
export { EXTENSION_POINTS } from "@/platform/modules";
export type { StoreContext, StoreEnvironment, StoreId, StoreResolution } from "@/platform/tenant";
export type { PlatformOperator, PlatformPermission } from "@/platform/platform-access";
export { PLATFORM_PERMISSIONS, hasPlatformPermission } from "@/platform/platform-access";
export type { StoreScope } from "@/platform/data-access";
export { scopeFromSession } from "@/platform/data-access";
export type { AdminSession } from "@/platform/session";
export { getAdminSession } from "@/platform/session";
export { contributions, moduleAccess, requireModule, requirePermission } from "@/platform/registry";
export { modulePathStatus, resolveAdminNavigation, titleForAdminPath } from "@/platform/navigation";
