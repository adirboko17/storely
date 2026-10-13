import type { StoreContext } from "@/platform/tenant";
import { installation } from "@/store/installation";

/**
 * The store this request is allowed to serve.
 * The value comes from server configuration. It is not read from the query string,
 * from a request body, or from `user_metadata`.
 * When Supabase is connected, replace the body with a lookup of the Host header in
 * `store_domains` and reject a host that is missing, unverified, or in the wrong environment.
 */
export function getStoreContext(): StoreContext {
  return {
    storeId: installation.storeId,
    environment: installation.environment,
    resolution: "deployment-binding",
  };
}
