import { applyAdminSlice, resetAdminData, type AdminSlice, type StoreSnapshot } from "@/data/live/apply-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const ADMIN_SLICES: AdminSlice[] = ["catalog", "discounts", "checkouts", "content", "desk", "orders", "customers"];

const listeners = new Set<() => void>();
let version = 0;
let generation = 0;
let pumping = false;
let activeStore = "";
let inflight: AdminSlice | null = null;
let queued: AdminSlice[] = [];
const ready = new Set<AdminSlice>();
const attempts = new Map<AdminSlice, number>();

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeAdminSlices(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAdminSliceVersion() {
  return version;
}

export function isAdminSliceReady(slice: AdminSlice) {
  return ready.has(slice);
}

export function slicesForPath(path: string): AdminSlice[] {
  const preferred: AdminSlice[] = [];
  if (path.startsWith("/admin/customers")) preferred.push("customers", "orders");
  else if (path.startsWith("/admin/orders/abandoned")) preferred.push("checkouts", "catalog");
  else if (path.startsWith("/admin/orders")) preferred.push("orders", "customers", "catalog");
  else if (path.startsWith("/admin/products")) preferred.push("catalog", "orders");
  else if (path.startsWith("/admin/discounts")) preferred.push("discounts", "catalog");
  else if (path.startsWith("/admin/content/posts")) preferred.push("content", "catalog");
  else if (path.startsWith("/admin/content")) preferred.push("content", "desk");
  else if (path.startsWith("/admin/settings")) preferred.push("desk", "catalog");
  else if (path.startsWith("/admin/marketing")) preferred.push("desk", "customers", "orders");
  else if (path.startsWith("/admin/analytics")) preferred.push("orders", "catalog");
  else preferred.push("orders", "catalog", "customers");
  return [...preferred, ...ADMIN_SLICES.filter((slice) => !preferred.includes(slice))];
}

export function watchAdminStore(storeId: string, path: string) {
  if (!storeId) return;
  if (activeStore !== storeId) {
    generation += 1;
    activeStore = storeId;
    ready.clear();
    attempts.clear();
    queued = [];
    inflight = null;
    resetAdminData();
    notify();
  }
  queued = slicesForPath(path).filter((slice) => !ready.has(slice) && slice !== inflight);
  void pump(storeId, generation);
}

export async function reloadAdminSlice(storeId: string, slice: AdminSlice) {
  if (!storeId || activeStore !== storeId) return;
  const snapshot = await fetchSlice(storeId, slice);
  if (!snapshot || activeStore !== storeId) return;
  applyAdminSlice(slice, snapshot);
  ready.add(slice);
  attempts.delete(slice);
  notify();
}

async function fetchSlice(storeId: string, slice: AdminSlice) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("store_admin_slice", { target_store: storeId, slice });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as StoreSnapshot;
}

async function pump(storeId: string, gen: number) {
  if (pumping) return;
  pumping = true;
  try {
    while (queued.length && generation === gen && activeStore === storeId) {
      const slice = queued.shift();
      if (!slice || ready.has(slice)) continue;
      inflight = slice;
      const snapshot = await fetchSlice(storeId, slice);
      inflight = null;
      if (generation !== gen || activeStore !== storeId) return;
      if (!snapshot) {
        const count = (attempts.get(slice) ?? 0) + 1;
        attempts.set(slice, count);
        if (count < 3) queued.push(slice);
        continue;
      }
      applyAdminSlice(slice, snapshot);
      ready.add(slice);
      notify();
    }
  } finally {
    pumping = false;
    inflight = null;
    if (queued.length && generation === gen && activeStore === storeId) void pump(storeId, gen);
  }
}
