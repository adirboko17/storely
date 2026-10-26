"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { watchAdminStore } from "@/data/live/admin-slices";

export function StoreSliceLoader({ storeId }: { storeId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    watchAdminStore(storeId, pathname);
  }, [storeId, pathname]);
  return null;
}
