import { loyaltyProgram } from "@/modules/loyalty-program/module";
import { wholesaleOrders } from "@/modules/wholesale-orders/module";
import type { StorelyModule } from "@/platform/modules";

/** Shared catalog. Presence here does not install the module in a store. */
export const moduleCatalog: readonly StorelyModule[] = [loyaltyProgram, wholesaleOrders];
