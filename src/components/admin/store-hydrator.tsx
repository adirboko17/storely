"use client";

import { applyStoreSnapshot, type StoreSnapshot } from "@/data/live/apply-store";

export function StoreHydrator({
  storeId,
  snapshot,
  children,
}: {
  storeId: string;
  snapshot: StoreSnapshot;
  children: React.ReactNode;
}) {
  applyStoreSnapshot(storeId, snapshot);
  return children;
}
