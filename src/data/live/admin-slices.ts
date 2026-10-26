import { applyAdminSlice, applyCustomerPage, linkAdminOrders, resetAdminData, type AdminSlice, type StoreSnapshot } from "@/data/live/apply-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const ADMIN_SLICES: AdminSlice[] = ["catalog", "discounts", "checkouts", "content", "desk", "orders", "customers"];
export const CUSTOMER_PAGE_SIZE = 50;

const listeners = new Set<() => void>();
let version = 0;
let generation = 0;
let pumping = false;
let activeStore = "";
let inflight: AdminSlice | null = null;
let queued: AdminSlice[] = [];
const ready = new Set<AdminSlice>();
const attempts = new Map<AdminSlice, number>();

let customerTotal = 0;
let customerTotalKnown = false;
let customersComplete = false;
let customerPaging = false;
let pagingRun = 0;
const loadedCustomerPages = new Set<number>();
const abandonedCustomerPages = new Set<number>();
const customerPageAttempts = new Map<number, number>();
let priorityPages: number[] = [];

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

export function getCustomerCatalog() {
  return {
    total: customerTotalKnown ? customerTotal : 0,
    pageSize: CUSTOMER_PAGE_SIZE,
    complete: customersComplete,
    known: customerTotalKnown,
  };
}

export function isCustomerPageReady(page: number) {
  return loadedCustomerPages.has(page);
}

export function focusCustomerPage(page: number) {
  if (page < 0 || loadedCustomerPages.has(page) || !activeStore) return;
  abandonedCustomerPages.delete(page);
  customerPageAttempts.delete(page);
  priorityPages = [page, ...priorityPages.filter((item) => item !== page)];
  void fillCustomerPages(activeStore, generation);
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

function resetCustomerPages() {
  pagingRun += 1;
  customerPaging = false;
  customerTotal = 0;
  customerTotalKnown = false;
  customersComplete = false;
  loadedCustomerPages.clear();
  abandonedCustomerPages.clear();
  customerPageAttempts.clear();
  priorityPages = [];
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
    resetCustomerPages();
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

async function fetchCustomerPage(storeId: string, pageIndex: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("store_admin_customers_page", { target_store: storeId, page_index: pageIndex });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as { total?: unknown; customers?: unknown };
  const total = typeof record.total === "number" ? record.total : Number(record.total);
  if (!Number.isFinite(total) || !Array.isArray(record.customers)) return null;
  return { total, customers: record.customers };
}

function refreshCustomerComplete() {
  if (!customerTotalKnown) {
    customersComplete = false;
    return;
  }
  const pages = Math.ceil(customerTotal / CUSTOMER_PAGE_SIZE);
  for (let page = 0; page < pages; page += 1) {
    if (!loadedCustomerPages.has(page) && !abandonedCustomerPages.has(page)) {
      customersComplete = false;
      return;
    }
  }
  customersComplete = true;
}

async function loadCustomerPage(storeId: string, page: number, gen: number) {
  if (loadedCustomerPages.has(page)) return true;
  const snapshot = await fetchCustomerPage(storeId, page);
  if (generation !== gen || activeStore !== storeId) return false;
  if (!snapshot) return false;
  if (loadedCustomerPages.has(page)) return true;
  customerTotal = snapshot.total;
  customerTotalKnown = true;
  applyCustomerPage(snapshot.customers, page, CUSTOMER_PAGE_SIZE);
  loadedCustomerPages.add(page);
  customerPageAttempts.delete(page);
  refreshCustomerComplete();
  if (page === 0 || customersComplete) linkAdminOrders();
  return true;
}

function nextCustomerPage() {
  if (!customerTotalKnown) return loadedCustomerPages.has(0) ? null : 0;
  const pages = Math.ceil(customerTotal / CUSTOMER_PAGE_SIZE);
  for (let page = 0; page < pages; page += 1) {
    if (!loadedCustomerPages.has(page) && !abandonedCustomerPages.has(page)) return page;
  }
  return null;
}

async function fillCustomerPages(storeId: string, gen: number) {
  if (customerPaging || generation !== gen || activeStore !== storeId) return;
  customerPaging = true;
  const run = ++pagingRun;
  try {
    while (generation === gen && activeStore === storeId && run === pagingRun) {
      let page: number | null = null;
      while (priorityPages.length) {
        const next = priorityPages.shift();
        if (next != null && next >= 0 && !loadedCustomerPages.has(next)) {
          page = next;
          break;
        }
      }
      if (page == null) page = nextCustomerPage();
      if (page == null) {
        refreshCustomerComplete();
        return;
      }
      const loaded = await loadCustomerPage(storeId, page, gen);
      if (generation !== gen || activeStore !== storeId || run !== pagingRun) return;
      if (!loaded) {
        const count = (customerPageAttempts.get(page) ?? 0) + 1;
        customerPageAttempts.set(page, count);
        if (count >= 3) {
          abandonedCustomerPages.add(page);
          refreshCustomerComplete();
          continue;
        }
        priorityPages.unshift(page);
        continue;
      }
      notify();
      if (customersComplete && priorityPages.length === 0) return;
    }
  } finally {
    if (run === pagingRun) customerPaging = false;
  }
}

async function pump(storeId: string, gen: number) {
  if (pumping) return;
  pumping = true;
  try {
    while (queued.length && generation === gen && activeStore === storeId) {
      const slice = queued.shift();
      if (!slice || ready.has(slice)) continue;
      if (slice === "customers") {
        inflight = slice;
        const loaded = await loadCustomerPage(storeId, 0, gen);
        inflight = null;
        if (generation !== gen || activeStore !== storeId) return;
        if (!loaded) {
          const count = (attempts.get(slice) ?? 0) + 1;
          attempts.set(slice, count);
          if (count < 3) queued.push(slice);
          continue;
        }
        ready.add(slice);
        notify();
        if (!customersComplete) void fillCustomerPages(storeId, gen);
        continue;
      }
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
