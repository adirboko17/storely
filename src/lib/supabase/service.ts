import { createClient } from "@supabase/supabase-js";

/** Service-role client for server handlers that already checked their own credential. */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are required");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
