"use client";

import { OrdersPoller } from "@/components/admin/orders-poller";
import { TrafficPoller } from "@/components/admin/traffic-poller";
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
  return (
    <>
      <TrafficPoller storeId={storeId} />
      <OrdersPoller storeId={storeId} />
      {children}
    </>
  );
}
