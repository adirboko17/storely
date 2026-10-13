import type { StoreInstallation } from "@/platform/modules";

/**
 * Binds this Next.js deployment to one store in the shared Storely database.
 * Another customer site is another deployment bound to another `storeId`.
 * Both sites will use the same Supabase project. This file does not open a connection.
 *
 * `storeId` is `stores.id` for סטודיו לבנה in the shared development database.
 * `modules` is the local stand-in for this store's `store_modules` rows.
 * `loyalty-program` is installed and switched off, so the approved sidebar stays as designed.
 * `wholesale-orders` is in the shared catalog and has no row here, so this store has not installed it.
 */
export const installation: StoreInstallation = {
  storeId: "11111111-1111-4111-8111-111111111111",
  environment: "development",
  coreVersion: "0.1.0",
  modules: [{ id: "loyalty-program", version: "0.1.0", enabled: false }],
  customRoles: [],
};
