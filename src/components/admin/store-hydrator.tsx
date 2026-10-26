"use client";

import { OrdersPoller } from "@/components/admin/orders-poller";
import { StoreSliceLoader } from "@/components/admin/store-slice-loader";
import { TrafficPoller } from "@/components/admin/traffic-poller";
import { applyStoreShell, type StoreShell } from "@/data/live/apply-store";

export function StoreHydrator({
  shell,
  children,
}: {
  shell: StoreShell;
  children: React.ReactNode;
}) {
  applyStoreShell(shell);
  return (
    <>
      <StoreSliceLoader storeId={shell.storeId} />
      <TrafficPoller storeId={shell.storeId} />
      <OrdersPoller storeId={shell.storeId} />
      {children}
    </>
  );
}
