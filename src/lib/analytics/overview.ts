import { listCatalogProducts } from "@/data/mock/catalog-session";
import type { LiveCheckout } from "@/data/mock/order-session";
import type { StoreTraffic } from "@/data/live/traffic";
import type { ResolvedOrder } from "@/lib/orders/present";

export type Delta = number | null;

export type NamedValue = {
  label: string;
  value: number;
  delta: Delta;
};

export type BreakdownRow = {
  label: string;
  value: number;
  delta: Delta;
  strong?: boolean;
};

export type FunnelStep = {
  label: string;
  count: number;
  rate: number;
  delta: Delta;
};

export type CohortRow = {
  label: string;
  customers: number;
  rates: Array<number | null>;
};

export type AnalyticsWindow = {
  start: Date;
  end: Date;
};

export type AnalyticsOverview = {
  refreshed: string;
  currentLabel: string;
  previousLabel: string;
  axis: string[];
  salesTotal: number;
  salesDelta: Delta;
  salesHours: { current: number[]; previous: number[] };
  breakdown: BreakdownRow[];
  channels: NamedValue[];
  aov: number;
  aovDelta: Delta;
  aovHours: { current: number[]; previous: number[] };
  products: NamedValue[];
  sessionsTotal: number;
  sessionsDelta: Delta;
  sessionHours: { current: number[]; previous: number[] };
  conversion: number;
  conversionDelta: Delta;
  conversionHours: { current: number[]; previous: number[] };
  funnel: FunnelStep[];
  locations: NamedValue[];
  socialSales: NamedValue[];
  socialSessions: NamedValue[];
  referrerSales: NamedValue[];
  referrerSessions: NamedValue[];
  marketing: Array<{ label: string; value: number; color: string }>;
  cohorts: CohortRow[];
  sellThrough: NamedValue[];
};

const HOURS = 24;

function change(current: number, previous: number): Delta {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function hourOf(date: string, fallback: number) {
  const match = date.match(/(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return Math.min(23, Number(match[1]));
}

function bucket(date: string, day: string | undefined): "today" | "yesterday" | null {
  if (day === "היום" || date.startsWith("היום") || date.startsWith("לפני")) return "today";
  if (day === "אתמול" || date.startsWith("אתמול")) return "yesterday";
  return null;
}

function emptyHours() {
  return Array.from({ length: HOURS }, () => 0);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function moneyParts(order: ResolvedOrder) {
  const gross = order.lines.reduce((total, line) => total + line.product.price * line.quantity, 0);
  const discount = order.discountAmount;
  const reversal = order.pay === "refunded" ? Math.max(0, gross - discount) : Math.min(order.refundedAmount, gross);
  const shipping = order.pay === "refunded" ? 0 : order.shipCost;
  const net = gross - discount - reversal;
  return { gross, discount, reversal, shipping, net, total: net + shipping };
}

function dateLabel(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const months = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  return `${date.getDate()} ב${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function buildOverview(orders: ResolvedOrder[], checkouts: LiveCheckout[]): AnalyticsOverview {
  const nowHour = new Date().getHours();
  const salesCurrent = emptyHours();
  const salesPrevious = emptyHours();
  const ordersCurrent = emptyHours();
  const ordersPrevious = emptyHours();
  const visitsCurrent = emptyHours();
  const visitsPrevious = emptyHours();
  const tally = {
    today: { gross: 0, discount: 0, reversal: 0, shipping: 0, net: 0, total: 0, orders: 0 },
    yesterday: { gross: 0, discount: 0, reversal: 0, shipping: 0, net: 0, total: 0, orders: 0 },
  };
  const channelToday = new Map<string, number>();
  const channelYesterday = new Map<string, number>();
  const channelOrdersToday = new Map<string, number>();
  const channelOrdersYesterday = new Map<string, number>();
  const productToday = new Map<string, number>();
  const productYesterday = new Map<string, number>();
  const units = new Map<number, number>();
  const cityToday = new Map<string, number>();
  const cityYesterday = new Map<string, number>();
  const customers = new Map<number, number>();

  for (const order of orders) {
    const when = bucket(order.date, undefined);
    const parts = moneyParts(order);
    for (const line of order.lines) units.set(line.product.id, (units.get(line.product.id) ?? 0) + line.quantity);
    customers.set(order.customerIndex, (customers.get(order.customerIndex) ?? 0) + 1);
    if (!when) continue;
    const hour = hourOf(order.date, nowHour);
    const side = when === "today" ? tally.today : tally.yesterday;
    side.gross += parts.gross;
    side.discount += parts.discount;
    side.reversal += parts.reversal;
    side.shipping += parts.shipping;
    side.net += parts.net;
    side.total += parts.total;
    side.orders += 1;
    (when === "today" ? salesCurrent : salesPrevious)[hour] += parts.total;
    (when === "today" ? ordersCurrent : ordersPrevious)[hour] += 1;
    (when === "today" ? visitsCurrent : visitsPrevious)[hour] += 1;
    const channels = when === "today" ? channelToday : channelYesterday;
    const channelCounts = when === "today" ? channelOrdersToday : channelOrdersYesterday;
    channels.set(order.channel, (channels.get(order.channel) ?? 0) + parts.total);
    channelCounts.set(order.channel, (channelCounts.get(order.channel) ?? 0) + 1);
    const products = when === "today" ? productToday : productYesterday;
    for (const line of order.lines) {
      const name = line.product.variant ? `${line.product.title} — ${line.product.variant}` : line.product.title;
      products.set(name, (products.get(name) ?? 0) + line.product.price * line.quantity);
    }
    const cities = when === "today" ? cityToday : cityYesterday;
    cities.set(order.customer.city, (cities.get(order.customer.city) ?? 0) + 1);
  }

  for (const checkout of checkouts) {
    if (checkout.recovered) continue;
    const when = bucket(checkout.date, checkout.day);
    if (!when) continue;
    const hour = hourOf(checkout.date, nowHour);
    (when === "today" ? visitsCurrent : visitsPrevious)[hour] += 1;
    const cities = when === "today" ? cityToday : cityYesterday;
    cities.set(checkout.city, (cities.get(checkout.city) ?? 0) + 1);
    const channelCounts = when === "today" ? channelOrdersToday : channelOrdersYesterday;
    channelCounts.set(checkout.source, (channelCounts.get(checkout.source) ?? 0) + 1);
  }

  const visitsToday = sum(visitsCurrent);
  const visitsYesterday = sum(visitsPrevious);
  const rate = (ordersCount: number, visits: number) => (visits ? (ordersCount / visits) * 100 : 0);
  const conversionToday = rate(tally.today.orders, visitsToday);
  const conversionYesterday = rate(tally.yesterday.orders, visitsYesterday);

  const named = (current: Map<string, number>, previous: Map<string, number>) =>
    [...current.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, delta: change(value, previous.get(label) ?? 0) }));

  const social = (rows: NamedValue[]) => rows.filter((row) => row.label === "אינסטגרם");

  const marketingMap = new Map<string, { value: number; color: string }>();
  const paint = (channel: string, amount: number) => {
    const key = channel === "אינסטגרם" ? "חברתי" : channel === "הזמנה ידנית" ? "ידני" : "ישיר";
    const color = key === "חברתי" ? "#7c5cfc" : key === "ידני" ? "#9cc3ee" : "#2c6ecb";
    const current = marketingMap.get(key) ?? { value: 0, color };
    current.value += amount;
    marketingMap.set(key, current);
  };
  for (const [channel, amount] of channelToday) paint(channel, amount);

  const repeat = [...customers.values()].filter((count) => count > 1).length;
  const buyers = customers.size;
  const month = new Date();
  const monthNames = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  const cohorts: CohortRow[] = buyers
    ? [{ label: `${monthNames[month.getMonth()]} ${month.getFullYear()}`, customers: buyers, rates: [(repeat / buyers) * 100] }]
    : [];

  const sellThrough = listCatalogProducts().map((product) => {
    const sold = units.get(product.id) ?? 0;
    const rateValue = sold + product.stock > 0 ? (sold / (sold + product.stock)) * 100 : 0;
    return {
      label: product.variant ? `${product.title} — ${product.variant}` : product.title,
      value: rateValue,
      delta: null,
    };
  })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const funnelCount = (ordersCount: number, visits: number) => {
    const abandoned = Math.max(0, visits - ordersCount);
    return [
      { label: "הגיעו לתשלום", count: visits, rate: visits ? 100 : 0 },
      { label: "נטשו", count: abandoned, rate: visits ? (abandoned / visits) * 100 : 0 },
      { label: "השלימו רכישה", count: ordersCount, rate: visits ? (ordersCount / visits) * 100 : 0 },
    ];
  };
  const todayFunnel = funnelCount(tally.today.orders, visitsToday);
  const yesterdayFunnel = funnelCount(tally.yesterday.orders, visitsYesterday);

  const row = (label: string, key: keyof typeof tally.today, signed = false): BreakdownRow => ({
    label,
    value: signed ? -tally.today[key] : tally.today[key],
    delta: change(tally.today[key], tally.yesterday[key]),
  });

  return {
    refreshed: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    currentLabel: dateLabel(0),
    previousLabel: dateLabel(1),
    axis: ["00:00", "06:00", "12:00", "18:00"],
    salesTotal: tally.today.total,
    salesDelta: change(tally.today.total, tally.yesterday.total),
    salesHours: { current: salesCurrent, previous: salesPrevious },
    breakdown: [
      row("מכירות ברוטו", "gross"),
      row("הנחות", "discount", true),
      row("ביטולי מכירות", "reversal", true),
      row("מכירות נטו", "net"),
      row("דמי משלוח", "shipping"),
      { label: "עמלות החזרה", value: 0, delta: null },
      { label: "מסים", value: 0, delta: null },
      { label: "סך המכירות", value: tally.today.total, delta: change(tally.today.total, tally.yesterday.total), strong: true },
    ],
    channels: named(channelToday, channelYesterday),
    aov: tally.today.orders ? tally.today.total / tally.today.orders : 0,
    aovDelta: change(
      tally.today.orders ? tally.today.total / tally.today.orders : 0,
      tally.yesterday.orders ? tally.yesterday.total / tally.yesterday.orders : 0,
    ),
    aovHours: {
      current: salesCurrent.map((value, index) => (ordersCurrent[index] ? value / (ordersCurrent[index] ?? 1) : 0)),
      previous: salesPrevious.map((value, index) => (ordersPrevious[index] ? value / (ordersPrevious[index] ?? 1) : 0)),
    },
    products: named(productToday, productYesterday).slice(0, 6),
    sessionsTotal: visitsToday,
    sessionsDelta: change(visitsToday, visitsYesterday),
    sessionHours: { current: visitsCurrent, previous: visitsPrevious },
    conversion: conversionToday,
    conversionDelta: change(conversionToday, conversionYesterday),
    conversionHours: {
      current: visitsCurrent.map((visits, index) => (visits ? ((ordersCurrent[index] ?? 0) / visits) * 100 : 0)),
      previous: visitsPrevious.map((visits, index) => (visits ? ((ordersPrevious[index] ?? 0) / visits) * 100 : 0)),
    },
    funnel: todayFunnel.map((step, index) => ({
      ...step,
      delta: change(step.count, yesterdayFunnel[index]?.count ?? 0),
    })),
    locations: named(cityToday, cityYesterday).slice(0, 6),
    socialSales: social(named(channelToday, channelYesterday)),
    socialSessions: social(named(channelOrdersToday, channelOrdersYesterday)),
    referrerSales: named(channelToday, channelYesterday),
    referrerSessions: named(channelOrdersToday, channelOrdersYesterday),
    marketing: [...marketingMap.entries()].map(([label, item]) => ({ label, value: item.value, color: item.color })).sort((a, b) => b.value - a.value),
    cohorts,
    sellThrough,
  };
}

const AXIS_HOURS = ["00:00", "06:00", "12:00", "18:00"];
const DAY_MS = 86400000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shiftDays(date: Date, amount: number) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dayOffset(date: Date, today: Date) {
  return Math.round((startOfDay(today).getTime() - startOfDay(date).getTime()) / DAY_MS);
}

function atOffset(recent: number[], earlier: number[], offset: number) {
  if (offset < 0) return 0;
  const series = offset < recent.length ? recent : earlier;
  const index = (offset < recent.length ? recent.length - 1 - offset : earlier.length - 1 - (offset - recent.length));
  return index >= 0 && index < series.length ? series[index] ?? 0 : 0;
}

function spanPoints(recent: number[], earlier: number[], from: number, to: number) {
  const points: number[] = [];
  for (let offset = from; offset >= to; offset -= 1) points.push(atOffset(recent, earlier, offset));
  return points;
}

function per(numerator: number[], denominator: number[], scale = 1) {
  return numerator.map((value, index) => {
    const base = denominator[index] ?? 0;
    return base ? (value / base) * scale : 0;
  });
}

function formatDay(date: Date) {
  const months = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  return `${date.getDate()} ב${months[date.getMonth()]}`;
}

function formatSpan(start: Date, end: Date) {
  if (start.getTime() === end.getTime()) return `${formatDay(start)} ${start.getFullYear()}`;
  return `${formatDay(start)}–${formatDay(end)}`;
}

function axisFor(start: Date, end: Date, hourly: boolean) {
  if (hourly) return AXIS_HOURS;
  const span = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return [0, 1, 2, 3].map((step) => formatDay(shiftDays(start, Math.round((span * step) / 3))));
}

export function buildTrafficOverview(traffic: StoreTraffic, window: AnalyticsWindow, today = new Date()): AnalyticsOverview {
  const anchor = startOfDay(today);
  const start = startOfDay(window.start);
  const end = startOfDay(window.end);
  const from = dayOffset(start, anchor);
  const to = dayOffset(end, anchor);
  const length = from - to + 1;
  const hourlyToday = from === 0 && to === 0;
  const hourlyYesterday = from === 1 && to === 1;
  const hourly = hourlyToday || hourlyYesterday;
  const previousStart = shiftDays(start, -length);
  const previousEnd = shiftDays(start, -1);
  const salesCurrent = hourlyToday
    ? traffic.today.salesByHour
    : hourlyYesterday
      ? traffic.yesterday.salesByHour
      : spanPoints(traffic.days.sales, traffic.days.previousSales, from, to);
  const salesPrevious = hourlyToday
    ? traffic.yesterday.salesByHour
    : spanPoints(traffic.days.sales, traffic.days.previousSales, from + length, to + length);
  const ordersCurrent = hourlyToday
    ? traffic.today.ordersByHour
    : hourlyYesterday
      ? traffic.yesterday.ordersByHour
      : spanPoints(traffic.days.orders, traffic.days.previousOrders, from, to);
  const ordersPrevious = hourlyToday
    ? traffic.yesterday.ordersByHour
    : spanPoints(traffic.days.orders, traffic.days.previousOrders, from + length, to + length);
  const visitsCurrent = hourlyToday
    ? traffic.today.visitsByHour
    : hourlyYesterday
      ? traffic.yesterday.visitsByHour
      : spanPoints(traffic.days.visits, traffic.days.previousVisits, from, to);
  const visitsPrevious = hourlyToday
    ? traffic.yesterday.visitsByHour
    : spanPoints(traffic.days.visits, traffic.days.previousVisits, from + length, to + length);
  const salesTotal = sum(salesCurrent);
  const salesBefore = sum(salesPrevious);
  const ordersTotal = sum(ordersCurrent);
  const ordersBefore = sum(ordersPrevious);
  const visitsTotal = sum(visitsCurrent);
  const visitsBefore = sum(visitsPrevious);
  const aov = ordersTotal ? salesTotal / ordersTotal : 0;
  const aovBefore = ordersBefore ? salesBefore / ordersBefore : 0;
  const conversion = visitsTotal ? (ordersTotal / visitsTotal) * 100 : 0;
  const conversionBefore = visitsBefore ? (ordersBefore / visitsBefore) * 100 : 0;
  const carts = hourlyToday ? traffic.today.carts : 0;
  const checkouts = hourlyToday ? traffic.today.checkouts : 0;
  const steps = [
    { label: "ביקורים", count: visitsTotal },
    { label: "הוסיפו לעגלה", count: carts },
    { label: "הגיעו לתשלום", count: checkouts },
    { label: "רכשו", count: ordersTotal },
  ];
  return {
    refreshed: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    currentLabel: formatSpan(start, end),
    previousLabel: formatSpan(previousStart, previousEnd),
    axis: axisFor(start, end, hourly),
    salesTotal,
    salesDelta: change(salesTotal, salesBefore),
    salesHours: { current: salesCurrent, previous: hourlyYesterday ? salesCurrent.map(() => 0) : salesPrevious },
    breakdown: [
      { label: "מכירות ברוטו", value: salesTotal, delta: change(salesTotal, salesBefore) },
      { label: "הנחות", value: 0, delta: null },
      { label: "ביטולי מכירות", value: 0, delta: null },
      { label: "מכירות נטו", value: salesTotal, delta: change(salesTotal, salesBefore) },
      { label: "דמי משלוח", value: 0, delta: null },
      { label: "עמלות החזרה", value: 0, delta: null },
      { label: "מסים", value: 0, delta: null },
      { label: "סך המכירות", value: salesTotal, delta: change(salesTotal, salesBefore), strong: true },
    ],
    channels: [],
    aov,
    aovDelta: change(aov, aovBefore),
    aovHours: {
      current: per(salesCurrent, ordersCurrent),
      previous: per(hourlyYesterday ? salesCurrent.map(() => 0) : salesPrevious, hourlyYesterday ? ordersCurrent.map(() => 0) : ordersPrevious),
    },
    products: [],
    sessionsTotal: visitsTotal,
    sessionsDelta: change(visitsTotal, visitsBefore),
    sessionHours: { current: visitsCurrent, previous: hourlyYesterday ? visitsCurrent.map(() => 0) : visitsPrevious },
    conversion,
    conversionDelta: change(conversion, conversionBefore),
    conversionHours: {
      current: per(ordersCurrent, visitsCurrent, 100),
      previous: per(hourlyYesterday ? ordersCurrent.map(() => 0) : ordersPrevious, hourlyYesterday ? visitsCurrent.map(() => 0) : visitsPrevious, 100),
    },
    funnel: steps.map((step) => ({
      ...step,
      rate: visitsTotal ? (step.count / visitsTotal) * 100 : 0,
      delta: null,
    })),
    locations: hourlyToday ? traffic.today.locations.map((place) => ({ label: place.label, value: place.count, delta: null })) : [],
    socialSales: [],
    socialSessions: [],
    referrerSales: [],
    referrerSessions: [],
    marketing: [],
    cohorts: [],
    sellThrough: [],
  };
}
