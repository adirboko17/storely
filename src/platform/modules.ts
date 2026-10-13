import type { IconName } from "@/lib/icons";
import type { BuiltInRole, CustomRole, Permission } from "@/platform/permissions";
import type { StoreEnvironment } from "@/platform/tenant";

export const EXTENSION_POINTS = [
  "dashboard.cards",
  "product.tabs",
  "order.actions",
  "customer.sections",
  "settings.sections",
] as const;

export type ExtensionPoint = (typeof EXTENSION_POINTS)[number];

type ContributionBase = {
  id: string;
  permission?: Permission;
};

export type DashboardCardContribution = ContributionBase & {
  title: string;
  body: string;
};

export type ProductTabContribution = ContributionBase & {
  label: string;
};

export type OrderActionContribution = ContributionBase & {
  label: string;
};

export type CustomerSectionContribution = ContributionBase & {
  title: string;
  body: string;
};

export type SettingsSectionContribution = ContributionBase & {
  title: string;
  description: string;
};

export type ExtensionPointMap = {
  "dashboard.cards": DashboardCardContribution;
  "product.tabs": ProductTabContribution;
  "order.actions": OrderActionContribution;
  "customer.sections": CustomerSectionContribution;
  "settings.sections": SettingsSectionContribution;
};

export type ExtensionContributions = {
  [K in ExtensionPoint]?: readonly ExtensionPointMap[K][];
};

export type ModuleNavChild = {
  key: string;
  label: string;
  href: string;
  permission: Permission;
};

export type ModuleNavItem = {
  key: string;
  label: string;
  href: string;
  match: string;
  icon: IconName;
  permission: Permission;
  children?: readonly ModuleNavChild[];
};

export type ModuleMigration = {
  id: string;
  description: string;
};

/**
 * A shared add-on. The code may ship in every storefront, or only in some deployments.
 * A store turns it on with a `store_modules` row. Another store in the same database is unaffected.
 */
export type StorelyModule = {
  id: string;
  name: string;
  description: string;
  version: string;
  coreVersion: string;
  permissions: readonly Permission[];
  accessPermission: Permission;
  navigation: readonly ModuleNavItem[];
  contributions?: ExtensionContributions;
  /** Defaults the installer copies into the store's roles when the module is installed. */
  suggestedGrants?: Partial<Record<Exclude<BuiltInRole, "owner">, readonly Permission[]>>;
  migrations: readonly ModuleMigration[];
};

export type ModuleInstallState = {
  id: string;
  version: string;
  enabled: boolean;
};

/**
 * A customization that belongs to one store and is not part of the shared catalog.
 */
export type StoreExtension = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  enabled: boolean;
  contributions: ExtensionContributions;
};

/**
 * Server binding for this Next.js deployment.
 * It names the one store this site serves inside the shared database.
 * `modules` stands in for that store's `store_modules` rows until Supabase is connected.
 * It is not a separate database, and it is not read from the browser.
 */
export type StoreInstallation = {
  storeId: string;
  environment: StoreEnvironment;
  coreVersion: string;
  modules: readonly ModuleInstallState[];
  customRoles: readonly CustomRole[];
};
