import { listCatalogProducts } from "@/data/mock/catalog-session";
import type { LiveCheckout } from "@/data/mock/order-session";
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

export type AnalyticsOverview = {
  refreshed: string;
  currentLabel: string;
  previousLabel: string;
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
