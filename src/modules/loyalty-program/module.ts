import type { StorelyModule } from "@/platform/modules";

export const loyaltyProgram: StorelyModule = {
  id: "loyalty-program",
  name: "מועדון לקוחות",
  description: "נקודות, הטבות וחברי מועדון. המסך מופיע רק בחנות שבה המודול מותקן ומופעל.",
  version: "0.1.0",
  coreVersion: "0.1.0",
  permissions: ["loyalty.read", "loyalty.manage"],
  accessPermission: "loyalty.read",
  navigation: [
    {
      key: "loyalty",
      label: "מועדון לקוחות",
      href: "/admin/loyalty",
      match: "/admin/loyalty",
      icon: "card",
      permission: "loyalty.read",
    },
  ],
  suggestedGrants: {
    admin: ["loyalty.read", "loyalty.manage"],
    manager: ["loyalty.read"],
  },
  migrations: [{ id: "0001_members", description: "טבלת חברי מועדון ויתרת נקודות." }],
};
