import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scopeFromSession } from "@/platform/data-access";
import type { AdminSession } from "@/platform/session";

export type StoreProductRow = {
  id: string;
  title: string;
  status: string;
  price: number;
};

/**
 * Reads products for the store bound to this deployment.
 * The store id comes from the server session, then RLS checks membership again.
 */
export async function listStoreProducts(session: AdminSession): Promise<StoreProductRow[]> {
  const scope = scopeFromSession(session);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, title, status, price")
    .eq("store_id", scope.storeId)
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreProductRow[];
}
