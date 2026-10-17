"use client";

import { useEffect } from "react";
import { applyOrderRefresh, type StoreSnapshot } from "@/data/live/apply-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function OrdersPoller({ storeId }: { storeId: string }) {
  useEffect(() => {
    let stopped = false;
    const supabase = createSupabaseBrowserClient();
    async function pull() {
      const { data } = await supabase.rpc("store_admin_snapshot", { target_store: storeId });
      if (stopped || !data || typeof data !== "object" || Array.isArray(data)) return;
      applyOrderRefresh(data as StoreSnapshot);
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 5000);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [storeId]);
  return null;
}
