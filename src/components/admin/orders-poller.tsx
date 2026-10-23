"use client";

import { useEffect } from "react";
import { applyOrderRefresh, type StoreSnapshot } from "@/data/live/apply-store";
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
        const { data } = await supabase.rpc("store_admin_snapshot", { target_store: storeId });
        if (stopped || !data || typeof data !== "object" || Array.isArray(data)) return;
        applyOrderRefresh(data as StoreSnapshot);
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
