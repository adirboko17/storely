import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { apiKeysMatch, photosProConfig, type PhotosProConfig } from "./apply-product-update";

export function photosProResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function storeIdForKey(apiKey: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("photospro_links").select("store_id").eq("api_key", apiKey).maybeSingle();
  if (error || !data?.store_id) return null;
  return data.store_id;
}

export async function authorizedPhotosPro(request: Request): Promise<{ config: PhotosProConfig } | { response: NextResponse }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return { response: photosProResponse({ error: "חיבור PhotosPro אינו מוגדר בשרת" }, 503) };

  const provided = request.headers.get("x-api-key");
  if (!provided) return { response: photosProResponse({ error: "Unauthorized" }, 401) };

  const linkedStore = await storeIdForKey(provided);
  if (linkedStore) return { config: { url, secret, apiKey: provided, storeId: linkedStore } };

  const legacy = photosProConfig();
  if (legacy && apiKeysMatch(provided, legacy.apiKey)) return { config: legacy };
  return { response: photosProResponse({ error: "Unauthorized" }, 401) };
}
