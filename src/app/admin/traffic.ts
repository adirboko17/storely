"use server";

import { cookies } from "next/headers";
import { parseMessaging, type StoreMessagingStatus } from "@/data/live/messaging";
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

export type AttributionChannel = {
  channel: string;
  type: string;
  visits: number;
  orders: number;
  sales: number;
  fresh: number;
  returning: number;
  days: number[];
};

export async function loadStoreAttribution(): Promise<AttributionChannel[]> {
  const storeId = await resolveAdminStoreId();
  if (!storeId) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("store_attribution_snapshot", { target_store: storeId });
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const channel = typeof row.channel === "string" ? row.channel : "";
    if (!channel) return [];
    const number = (value: unknown) => {
      const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const days = Array.isArray(row.days) ? row.days.map(number) : [];
    return [{
      channel,
      type: typeof row.type === "string" ? row.type : "",
      visits: number(row.visits),
      orders: number(row.orders),
      sales: number(row.sales),
      fresh: number(row.fresh),
      returning: number(row.returning),
      days,
    }];
  });
}

export async function loadStoreMessaging(): Promise<StoreMessagingStatus | null> {
  const storeId = await resolveAdminStoreId();
  if (!storeId) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("store_messaging_status", { target_store: storeId });
  if (error || data == null) return null;
  return parseMessaging(data);
}

export async function loadStoreTraffic(): Promise<StoreTraffic | null> {
  const storeId = await resolveAdminStoreId();
  if (!storeId) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("store_traffic_snapshot", { target_store: storeId });
  if (error || data == null) return null;
  return parseTraffic(data);
}
