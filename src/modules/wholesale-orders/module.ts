import type { StorelyModule } from "@/platform/modules";

/** Catalog entry only. Lavana's installation record does not install this module. */
export const wholesaleOrders: StorelyModule = {
  id: "wholesale-orders",
  name: "ניהול סיטונאי",
  description: "הזמנות ומחירונים ללקוחות סיטונאיים.",
  version: "0.1.0",
  coreVersion: "0.1.0",
  permissions: ["wholesale.read", "wholesale.manage"],
  accessPermission: "wholesale.read",
  navigation: [
    {
      key: "wholesale",
      label: "סיטונאות",
      href: "/admin/wholesale",
      match: "/admin/wholesale",
      icon: "orders",
      permission: "wholesale.read",
    },
  ],
  suggestedGrants: {
    admin: ["wholesale.read", "wholesale.manage"],
  },
  migrations: [{ id: "0001_price_lists", description: "מחירונים והזמנות סיטונאיות." }],
};
