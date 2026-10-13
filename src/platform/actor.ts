import type { AdminActor } from "@/platform/permissions";
import { installation } from "@/store/installation";

/**
 * Local stand-in for the signed-in store owner while the admin screens are still being converted.
 * The membership covers only the store bound to this deployment.
 * This is not a login, not a public account, and not a platform operator.
 * Replace the membership list with `store_members` before any deployment.
 */
export function getAdminActor(): AdminActor {
  return {
    id: "dev-owner",
    email: "maya@lavana.co.il",
    displayName: "מאיה ברק",
    memberships: [
      {
        storeId: installation.storeId,
        roleId: "owner",
        status: "active",
        permissions: ["*"],
      },
    ],
  };
}
