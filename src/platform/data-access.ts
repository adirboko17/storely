import type { AdminSession } from "@/platform/session";
import { membershipFor } from "@/platform/permissions";
import type { StoreEnvironment, StoreId } from "@/platform/tenant";

/**
 * The only store id a query is allowed to use.
 * Callers pass the session. A store id from the browser is not an argument, so it cannot be applied.
 */
export type StoreScope = {
  storeId: StoreId;
  environment: StoreEnvironment;
};

export function scopeFromSession(session: AdminSession): StoreScope {
  const membership = membershipFor(session.actor, session.store.storeId);
  if (!membership) {
    const error = new Error("forbidden");
    error.name = "StoreAccessError";
    throw error;
  }

  if (session.store.environment === "production" && session.store.resolution !== "verified-domain") {
    const error = new Error("production store resolution requires a verified domain");
    error.name = "StoreAccessError";
    throw error;
  }

  return {
    storeId: session.store.storeId,
    environment: session.store.environment,
  };
}
