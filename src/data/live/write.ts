import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

let hydrating = false;

export function beginHydration() {
  hydrating = true;
}

export function endHydration() {
  hydrating = false;
}

export function isHydrating() {
  return hydrating;
}

export async function writeStore(fn: string, args: Record<string, unknown>) {
  if (hydrating || typeof window === "undefined") return null;
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(fn, { target_store: storeId, ...args });
  if (error) throw new Error(error.message);
  return data;
}
