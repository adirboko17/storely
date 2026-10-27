"use client";

import { useSyncExternalStore } from "react";
import { getAdminSliceVersion, getCustomerCatalog, getOrderCatalog, isAdminSliceReady, subscribeAdminSlices } from "@/data/live/admin-slices";
import type { AdminSlice } from "@/data/live/apply-store";

export function useAdminSlice(slice: AdminSlice) {
  const version = useSyncExternalStore(subscribeAdminSlices, getAdminSliceVersion, () => 0);
  return version > 0 && isAdminSliceReady(slice);
}

const emptyCatalog = { total: 0, pageSize: 50, complete: false, known: false };

export function useCustomerCatalog() {
  const version = useSyncExternalStore(subscribeAdminSlices, getAdminSliceVersion, () => 0);
  return version > 0 ? getCustomerCatalog() : emptyCatalog;
}

export function useOrderCatalog() {
  const version = useSyncExternalStore(subscribeAdminSlices, getAdminSliceVersion, () => 0);
  return version > 0 ? getOrderCatalog() : emptyCatalog;
}

export function SlicePending({ label }: { label: string }) {
  return <p className="px-5 py-8 text-sm text-[#616161]">{label}</p>;
}
