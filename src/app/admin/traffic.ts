"use server";

import { cookies } from "next/headers";
import { parseTraffic, type StoreTraffic } from "@/data/live/traffic";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function resolveAdminStoreId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: allowed } = await supabase.rpc("has_platform_access");
  if (allowed === true) {
    const selected = (await cookies()).get("storely-platform-store")?.value;
    return selected && /^[0-9a-f-]{36}$/i.test(selected) ? selected : null;
  }

  const { data: membership } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = membership as { store_id?: string } | null;
  return row?.store_id ?? null;
}

export async function loadStoreTraffic(): Promise<StoreTraffic | null> {
  const storeId = await resolveAdminStoreId();
  if (!storeId) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("store_traffic_snapshot", { target_store: storeId });
  if (error || data == null) return null;
  return parseTraffic(data);
}
