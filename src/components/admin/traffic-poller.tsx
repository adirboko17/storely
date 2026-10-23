"use client";

import { useEffect } from "react";
import { parseTraffic, setStoreTraffic } from "@/data/live/traffic";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function TrafficPoller({ storeId }: { storeId: string }) {
  useEffect(() => {
    let stopped = false;
    let busy = false;
    const supabase = createSupabaseBrowserClient();
    async function pull() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { data, error } = await supabase.rpc("store_traffic_snapshot", { target_store: storeId });
        if (!stopped && !error && data != null) setStoreTraffic(parseTraffic(data));
      } finally {
        busy = false;
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 30000);
    const onVisible = () => void pull();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [storeId]);
  return null;
}
