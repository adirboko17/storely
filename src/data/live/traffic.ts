import { setLiveTrafficSeries } from "@/lib/dashboard/chart";

export type TrafficPlace = {
  label: string;
  count: number;
};

export type TrafficNow = {
  visitors: number;
  visits: number;
  orders: number;
  sales: number;
  carts: number;
  checkouts: number;
  purchased: number;
  newVisitors: number;
  returningVisitors: number;
  locations: TrafficPlace[];
};

export type TrafficDay = {
  visits: number;
  orders: number;
  sales: number;
  carts: number;
  checkouts: number;
  visitsByHour: number[];
  ordersByHour: number[];
  salesByHour: number[];
  locations: TrafficPlace[];
};

export type TrafficYesterday = {
  visits: number;
  orders: number;
  sales: number;
  visitsByHour: number[];
  ordersByHour: number[];
  salesByHour: number[];
};

export type StoreTraffic = {
  now: TrafficNow;
  today: TrafficDay;
  yesterday: TrafficYesterday;
  days: {
    sales: number[];
    orders: number[];
    visits: number[];
    previousSales: number[];
    previousOrders: number[];
    previousVisits: number[];
  };
};

const HOURS = 24;
const DAYS = 30;

function numberList(value: unknown, length: number) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => {
    const item = source[index];
    const parsed = typeof item === "number" ? item : typeof item === "string" ? Number(item) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function count(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function places(value: unknown): TrafficPlace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.label !== "string" || !row.label.trim()) return [];
    return [{ label: row.label, count: count(row.count) }];
  });
}

function row(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function emptyTraffic(): StoreTraffic {
  return {
    now: {
      visitors: 0,
      visits: 0,
      orders: 0,
      sales: 0,
      carts: 0,
      checkouts: 0,
      purchased: 0,
      newVisitors: 0,
      returningVisitors: 0,
      locations: [],
    },
    today: {
      visits: 0,
      orders: 0,
      sales: 0,
      carts: 0,
      checkouts: 0,
      visitsByHour: numberList([], HOURS),
      ordersByHour: numberList([], HOURS),
      salesByHour: numberList([], HOURS),
      locations: [],
    },
    yesterday: {
      visits: 0,
      orders: 0,
      sales: 0,
      visitsByHour: numberList([], HOURS),
      ordersByHour: numberList([], HOURS),
      salesByHour: numberList([], HOURS),
    },
    days: {
      sales: numberList([], DAYS),
      orders: numberList([], DAYS),
      visits: numberList([], DAYS),
      previousSales: numberList([], DAYS),
      previousOrders: numberList([], DAYS),
      previousVisits: numberList([], DAYS),
    },
  };
}

export function parseTraffic(value: unknown): StoreTraffic {
  const payload = row(value);
  const now = row(payload.now);
  const today = row(payload.today);
  const yesterday = row(payload.yesterday);
  const days = row(payload.days);
  return {
    now: {
      visitors: count(now.visitors),
      visits: count(now.visits),
      orders: count(now.orders),
      sales: count(now.sales),
      carts: count(now.carts),
      checkouts: count(now.checkouts),
      purchased: count(now.purchased),
      newVisitors: count(now.newVisitors),
      returningVisitors: count(now.returningVisitors),
      locations: places(now.locations),
    },
    today: {
      visits: count(today.visits),
      orders: count(today.orders),
      sales: count(today.sales),
      carts: count(today.carts),
      checkouts: count(today.checkouts),
      visitsByHour: numberList(today.visitsByHour, HOURS),
      ordersByHour: numberList(today.ordersByHour, HOURS),
      salesByHour: numberList(today.salesByHour, HOURS),
      locations: places(today.locations),
    },
    yesterday: {
      visits: count(yesterday.visits),
      orders: count(yesterday.orders),
      sales: count(yesterday.sales),
      visitsByHour: numberList(yesterday.visitsByHour, HOURS),
      ordersByHour: numberList(yesterday.ordersByHour, HOURS),
      salesByHour: numberList(yesterday.salesByHour, HOURS),
    },
    days: {
      sales: numberList(days.sales, DAYS),
      orders: numberList(days.orders, DAYS),
      visits: numberList(days.visits, DAYS),
      previousSales: numberList(days.previousSales, DAYS),
      previousOrders: numberList(days.previousOrders, DAYS),
      previousVisits: numberList(days.previousVisits, DAYS),
    },
  };
}

let current = emptyTraffic();
let serialized = "";
let version = 0;
const listeners = new Set<() => void>();

export function subscribeStoreTraffic(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreTrafficVersion() {
  return version;
}

export function getStoreTraffic() {
  return current;
}

export function setStoreTraffic(next: StoreTraffic) {
  const mark = JSON.stringify(next);
  if (mark === serialized) return;
  serialized = mark;
  current = next;
  version += 1;
  setLiveTrafficSeries({
    salesHours: next.today.salesByHour,
    ordersHours: next.today.ordersByHour,
    sessionsHours: next.today.visitsByHour,
    previousSalesHours: next.yesterday.salesByHour,
    previousOrdersHours: next.yesterday.ordersByHour,
    previousSessionsHours: next.yesterday.visitsByHour,
    salesDays: next.days.sales,
    ordersDays: next.days.orders,
    sessionsDays: next.days.visits,
    previousSalesDays: next.days.previousSales,
    previousOrdersDays: next.days.previousOrders,
    previousSessionsDays: next.days.previousVisits,
  });
  listeners.forEach((listener) => listener());
}
