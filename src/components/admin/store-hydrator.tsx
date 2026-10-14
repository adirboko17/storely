"use client";

import { TrafficPoller } from "@/components/admin/traffic-poller";
import { applyStoreSnapshot, type StoreSnapshot } from "@/data/live/apply-store";
import { setStoreTraffic, type StoreTraffic } from "@/data/live/traffic";

export function StoreHydrator({
  storeId,
  snapshot,
  traffic,
  children,
}: {
  storeId: string;
  snapshot: StoreSnapshot;
  traffic: StoreTraffic;
  children: React.ReactNode;
}) {
  applyStoreSnapshot(storeId, snapshot);
  setStoreTraffic(traffic);
  return (
    <>
      <TrafficPoller storeId={storeId} />
      {children}
    </>
  );
}
