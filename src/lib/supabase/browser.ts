import { createBrowserClient } from "@supabase/ssr";

/** Browser client using the publishable key. Row access still comes from the signed-in user. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase URL and publishable key are required");
  }
  return createBrowserClient(url, key);
}
