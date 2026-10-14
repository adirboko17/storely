"use client";

import { useEffect } from "react";
import { loadStoreTraffic } from "@/app/admin/traffic";
import { setStoreTraffic } from "@/data/live/traffic";

export function TrafficPoller({ storeId }: { storeId: string }) {
  useEffect(() => {
    let stopped = false;
    async function pull() {
      const next = await loadStoreTraffic();
      if (!stopped && next) setStoreTraffic(next);
    }
    const timer = window.setInterval(() => void pull(), 20000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [storeId]);
  return null;
}
