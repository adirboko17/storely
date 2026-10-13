import { getAdminActor } from "@/platform/actor";
import type { AdminActor } from "@/platform/permissions";
import { getStoreContext } from "@/platform/store-context";
import type { StoreContext } from "@/platform/tenant";
import { scopeFromSession } from "@/platform/data-access";

/** The verified store plus the signed-in identity. Admin screens take this, not a bare user. */
export type AdminSession = {
  store: StoreContext;
  actor: AdminActor;
};

export function getAdminSession(): AdminSession {
  const session = {
    store: getStoreContext(),
    actor: getAdminActor(),
  };
  scopeFromSession(session);
  return session;
}
