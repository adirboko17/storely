export type StoreId = string;

/** Production and development use separate Supabase projects for the platform, not a project per store. */
export type StoreEnvironment = "production" | "development";

/**
 * `deployment-binding` is the local stand-in: this Next.js app serves one store from server config.
 * `verified-domain` is the production rule: the host was found in `store_domains`.
 * A query parameter or a store id typed in the browser is not a resolution source.
 */
export type StoreResolution = "deployment-binding" | "verified-domain";

export type StoreContext = {
  storeId: StoreId;
  environment: StoreEnvironment;
  resolution: StoreResolution;
};
