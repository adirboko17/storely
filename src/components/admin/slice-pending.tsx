"use client";

import { useSyncExternalStore } from "react";
import { getAdminSliceVersion, isAdminSliceReady, subscribeAdminSlices } from "@/data/live/admin-slices";
import type { AdminSlice } from "@/data/live/apply-store";

export function useAdminSlice(slice: AdminSlice) {
  const version = useSyncExternalStore(subscribeAdminSlices, getAdminSliceVersion, () => 0);
  return version > 0 && isAdminSliceReady(slice);
}

export function SlicePending({ label }: { label: string }) {
  return <p className="px-5 py-8 text-sm text-[#616161]">{label}</p>;
}
