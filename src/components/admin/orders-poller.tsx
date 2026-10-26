"use client";

import { useEffect } from "react";
import { reloadAdminSlice } from "@/data/live/admin-slices";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function OrdersPoller({ storeId }: { storeId: string }) {
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let seen: string | null = null;
    const supabase = createSupabaseBrowserClient();
    async function pull() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { data: version, error } = await supabase.rpc("store_orders_version", { target_store: storeId });
        if (stopped || error || typeof version !== "string") return;
        const changed = seen !== null && version !== seen;
        seen = version;
        if (!changed) return;
        if (stopped) return;
        await reloadAdminSlice(storeId, "orders");
      } finally {
        busy = false;
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 15000);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [storeId]);
  return null;
}
