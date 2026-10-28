import { applyAdminSlice, applyCustomerPage, applyOrderPage, linkAdminOrders, ORDER_PAGE_SIZE, resetAdminData, type AdminSlice, type StoreSnapshot } from "@/data/live/apply-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const ADMIN_SLICES: AdminSlice[] = ["catalog", "discounts", "checkouts", "content", "desk", "orders", "customers"];
export const CUSTOMER_PAGE_SIZE = 50;
export { ORDER_PAGE_SIZE };

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

let orderTotal = 0;
let orderTotalKnown = false;
let ordersComplete = false;
let orderPaging = false;
let orderPagingRun = 0;
const loadedOrderPages = new Set<number>();
const abandonedOrderPages = new Set<number>();
const orderPageAttempts = new Map<number, number>();
let priorityOrderPages: number[] = [];

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

export function getOrderCatalog() {
  return {
    total: orderTotalKnown ? orderTotal : 0,
    pageSize: ORDER_PAGE_SIZE,
    complete: ordersComplete,
    known: orderTotalKnown,
  };
}

export function isOrderPageReady(page: number) {
  return loadedOrderPages.has(page);
}

export function focusOrderPage(page: number) {
  if (page < 0 || loadedOrderPages.has(page) || !activeStore) return;
  abandonedOrderPages.delete(page);
  orderPageAttempts.delete(page);
  priorityOrderPages = [page, ...priorityOrderPages.filter((item) => item !== page)];
  void fillOrderPages(activeStore, generation);
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

function resetOrderPages() {
  orderPagingRun += 1;
  orderPaging = false;
  orderTotal = 0;
  orderTotalKnown = false;
  ordersComplete = false;
  loadedOrderPages.clear();
  abandonedOrderPages.clear();
  orderPageAttempts.clear();
  priorityOrderPages = [];
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
    resetOrderPages();
    resetAdminData();
    notify();
  }
  queued = slicesForPath(path).filter((slice) => !ready.has(slice) && slice !== inflight);
  void pump(storeId, generation);
}

export async function reloadAdminSlice(storeId: string, slice: AdminSlice) {
  if (!storeId || activeStore !== storeId) return;
  if (slice === "orders") {
    await reloadOrderPages(storeId);
    return;
  }
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

async function fetchOrderPage(storeId: string, pageIndex: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("store_admin_orders_page", { target_store: storeId, page_index: pageIndex });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as { total?: unknown; orders?: unknown };
  const total = typeof record.total === "number" ? record.total : Number(record.total);
  if (!Number.isFinite(total) || !Array.isArray(record.orders)) return null;
  return { total, orders: record.orders };
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

function refreshOrderComplete() {
  if (!orderTotalKnown) {
    ordersComplete = false;
    return;
  }
  const pages = Math.ceil(orderTotal / ORDER_PAGE_SIZE);
  for (let page = 0; page < pages; page += 1) {
    if (!loadedOrderPages.has(page) && !abandonedOrderPages.has(page)) {
      ordersComplete = false;
      return;
    }
  }
  ordersComplete = true;
}

async function loadOrderPage(storeId: string, page: number, gen: number) {
  if (loadedOrderPages.has(page)) return true;
  const snapshot = await fetchOrderPage(storeId, page);
  if (generation !== gen || activeStore !== storeId) return false;
  if (!snapshot) return false;
  if (loadedOrderPages.has(page)) return true;
  orderTotal = snapshot.total;
  orderTotalKnown = true;
  loadedOrderPages.add(page);
  applyOrderPage(snapshot.orders, page);
  orderPageAttempts.delete(page);
  refreshOrderComplete();
  return true;
}

function nextOrderPage() {
  if (!orderTotalKnown) return loadedOrderPages.has(0) ? null : 0;
  const pages = Math.ceil(orderTotal / ORDER_PAGE_SIZE);
  for (let page = 0; page < pages; page += 1) {
    if (!loadedOrderPages.has(page) && !abandonedOrderPages.has(page)) return page;
  }
  return null;
}

async function fillOrderPages(storeId: string, gen: number) {
  if (orderPaging || generation !== gen || activeStore !== storeId) return;
  orderPaging = true;
  const run = ++orderPagingRun;
  try {
    while (generation === gen && activeStore === storeId && run === orderPagingRun) {
      let page: number | null = null;
      while (priorityOrderPages.length) {
        const next = priorityOrderPages.shift();
        if (next != null && next >= 0 && !loadedOrderPages.has(next)) {
          page = next;
          break;
        }
      }
      if (page == null) page = nextOrderPage();
      if (page == null) {
        refreshOrderComplete();
        return;
      }
      const loaded = await loadOrderPage(storeId, page, gen);
      if (generation !== gen || activeStore !== storeId || run !== orderPagingRun) return;
      if (!loaded) {
        const count = (orderPageAttempts.get(page) ?? 0) + 1;
        orderPageAttempts.set(page, count);
        if (count >= 3) {
          abandonedOrderPages.add(page);
          refreshOrderComplete();
          continue;
        }
        priorityOrderPages.unshift(page);
        continue;
      }
      notify();
      if (ordersComplete && priorityOrderPages.length === 0) return;
    }
  } finally {
    if (run === orderPagingRun) orderPaging = false;
  }
}

async function reloadOrderPages(storeId: string) {
  const gen = generation;
  const run = ++orderPagingRun;
  orderPaging = false;
  const snapshot = await fetchOrderPage(storeId, 0);
  if (generation !== gen || activeStore !== storeId || !snapshot) return;
  orderTotal = snapshot.total;
  orderTotalKnown = true;
  loadedOrderPages.clear();
  abandonedOrderPages.clear();
  orderPageAttempts.clear();
  priorityOrderPages = [];
  loadedOrderPages.add(0);
  applyOrderPage(snapshot.orders, 0, true);
  refreshOrderComplete();
  ready.add("orders");
  attempts.delete("orders");
  notify();
  if (!ordersComplete) void fillOrderPages(storeId, gen);
}

async function pump(storeId: string, gen: number) {
  if (pumping) return;
  pumping = true;
  try {
    while (queued.length && generation === gen && activeStore === storeId) {
      const slice = queued.shift();
      if (!slice || ready.has(slice)) continue;
      if (slice === "customers" || slice === "orders") {
        inflight = slice;
        const loaded = slice === "customers"
          ? await loadCustomerPage(storeId, 0, gen)
          : await loadOrderPage(storeId, 0, gen);
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
        if (slice === "customers" && !customersComplete) void fillCustomerPages(storeId, gen);
        if (slice === "orders" && !ordersComplete) void fillOrderPages(storeId, gen);
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
