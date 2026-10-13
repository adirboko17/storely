import type { Customer, FulfillmentStatus, OrderView, PayStatus, Product } from "@/types/commerce";
import { formatMoney } from "@/lib/formatting/money";

export type OrderLine = {
  product: Product;
  quantity: number;
};

export type ResolvedOrder = OrderView & {
  customer: Customer;
  lines: OrderLine[];
  refundedAmount: number;
  tracking?: string;
  carrier?: string;
  sourcePay: PayStatus;
  sourceFulfillment: FulfillmentStatus;
};

export type OrderTab = "all" | "unfulfilled" | "unpaid" | "open" | "closed";
export type PayFilter = "paid" | "pending" | "refunded" | null;

const PAY: Record<PayStatus, [string, string, string]> = {
  paid: ["שולם", "#ebebeb", "#303030"],
  pending: ["ממתין לתשלום", "#ffd6a4", "#5e4200"],
  partially_refunded: ["הוחזר חלקית", "#e3e3e3", "#303030"],
  refunded: ["הוחזר", "#e3e3e3", "#303030"],
};

const FUL: Record<FulfillmentStatus, [string, string, string]> = {
  unfulfilled: ["לא נשלח", "#ffeb78", "#4f4700"],
  fulfilled: ["נשלח", "#ebebeb", "#303030"],
  partial: ["נשלח חלקית", "#ffeb78", "#4f4700"],
  onhold: ["בהמתנה", "#ffeb78", "#4f4700"],
};

const RISK = new Set([1045, 1040, 1033, 1027]);

export const ORDER_TABS: Array<{ id: OrderTab; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "unfulfilled", label: "לא נשלחו" },
  { id: "unpaid", label: "לא שולמו" },
  { id: "open", label: "פתוחות" },
  { id: "closed", label: "סגורות" },
];

export const PAY_FILTERS: Array<{ id: PayFilter; label: string }> = [
  { id: null, label: "כל הסטטוסים" },
  { id: "paid", label: "שולם" },
  { id: "pending", label: "ממתין לתשלום" },
  { id: "refunded", label: "הוחזר / הוחזר חלקית" },
];

export function parseOrderTab(value: string | null): OrderTab {
  return ORDER_TABS.some((tab) => tab.id === value) ? (value as OrderTab) : "all";
}

export function payBadge(status: PayStatus) {
  const [label, background, color] = PAY[status];
  return { label, background, color };
}

export function fulfillmentBadge(status: FulfillmentStatus) {
  const [label, background, color] = FUL[status];
  return { label, background, color };
}

export function itemsLabel(count: number) {
  return count === 1 ? "פריט 1" : `${count} פריטים`;
}

export function fullOrderDate(date: string) {
  const [day, time] = date.split(" ב-");
  const expanded =
    day === "היום" ? "12 באוקטובר 2026" : day === "אתמול" ? "11 באוקטובר 2026" : `${day?.replace("אוק׳", "אוקטובר")} 2026`;
  return `${expanded} בשעה ${time ?? ""}`;
}

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

export function sparkPath(seed: number) {
  const random = rng(seed);
  return Array.from({ length: 24 }, (_, index) => {
    const weight = index < 6 ? 0.15 : index < 10 ? 0.6 : index < 20 ? 0.9 : 0.4;
    const y = 22 - Math.min(1, weight * (0.5 + random() * 0.7)) * 19;
    return `${index ? "L" : "M"}${((index * 76) / 23).toFixed(1)},${y.toFixed(1)}`;
  }).join("");
}

export type OrderStat = {
  label: string;
  value: string;
  delta: string;
  deltaColor: string;
  spark: string;
  sparkCompare: string;
};

export function orderStats(orders: ResolvedOrder[]): OrderStat[] {
  const today = orders.filter((order) => order.date.startsWith("היום"));
  const returned = orders.reduce((sum, order) => sum + (order.date.startsWith("היום") ? order.refundedAmount : 0), 0);
  const rows: Array<[string, string]> = [
    ["הזמנות", String(today.length)],
    ["פריטים שהוזמנו", String(today.reduce((sum, order) => sum + order.quantity, 0))],
    ["החזרות", formatMoney(-returned)],
    ["הזמנות שנשלחו", String(today.filter((order) => order.fulfillment === "fulfilled").length)],
    ["הזמנות שנמסרו", "0"],
    ["זמן עד משלוח", "—"],
  ];
  const flat = "M0,22 L76,22";
  return rows.map(([label, value]) => ({
    label,
    value,
    delta: "",
    deltaColor: "#1f7a4d",
    spark: flat,
    sparkCompare: flat,
  }));
}

export function filterOrders(orders: ResolvedOrder[], tab: OrderTab, query: string, pay: PayFilter) {
  const needle = query.trim().replaceAll("#", "");
  return orders.filter((order) => {
    if (tab === "unfulfilled" && order.fulfillment === "fulfilled") return false;
    if (tab === "unpaid" && order.pay !== "pending") return false;
    if (tab === "open" && order.fulfillment === "fulfilled" && order.pay !== "pending") return false;
    if (tab === "closed" && (order.fulfillment !== "fulfilled" || order.pay === "pending")) return false;
    if (needle && !String(order.id).includes(needle) && !order.customer.name.includes(needle)) return false;
    if (pay === "refunded" && !order.pay.includes("refunded")) return false;
    if (pay && pay !== "refunded" && order.pay !== pay) return false;
    return true;
  });
}

export function orderRowPresentation(order: ResolvedOrder) {
  const pay = payBadge(order.pay);
  const fulfillment = fulfillmentBadge(order.fulfillment);
  const fulfilled = order.fulfillment === "fulfilled";
  const day = order.date.split(" ב-")[0] ?? "";
  const fulfillBy = fulfilled ? "" : day === "היום" ? "מחר" : day === "אתמול" ? "היום" : "באיחור";
  return {
    risk: RISK.has(order.id),
    muted: fulfilled ? "#616161" : "#303030",
    fulfillBy,
    fulfillByColor: fulfillBy === "באיחור" ? "#8e1f0b" : fulfillBy === "היום" ? "#8a6116" : "#303030",
    delivery: fulfilled ? (order.id % 3 === 0 ? "בדרך" : "נמסר") : "",
    tags: (order.tags ?? []).join(", "),
    pay,
    fulfillment,
    fulfilled,
    items: itemsLabel(order.quantity),
  };
}

export type TimelineEvent = {
  text: string;
  time: string;
  who?: string;
};

export function baseTimeline(order: ResolvedOrder): TimelineEvent[] {
  const time = order.date.split(" ב-")[1] ?? "";
  const events: TimelineEvent[] = [
    { text: `ההזמנה התקבלה דרך ${order.channel}.`, time },
    order.pay === "pending" || order.sourcePay === "pending"
      ? { text: "ממתין לקבלת העברה בנקאית.", time }
      : { text: `תשלום בסך ${formatMoney(order.total)} אושר בכרטיס ויזה •••• 4821.`, time },
    { text: `אישור הזמנה נשלח אל ${order.customer.name} (${order.customer.email}).`, time },
  ];
  if (order.sourceFulfillment === "fulfilled") {
    events.push({ text: "ההזמנה נשלחה עם שליחויות צ׳יטה.", time: "למחרת" });
  }
  return events.reverse();
}

export function refundAmount(order: ResolvedOrder, quantities: Record<number, number>, includeShip: boolean) {
  const percent = order.discount?.[1] ?? 0;
  const goods = order.lines.reduce((sum, line, index) => sum + (quantities[index] ?? 0) * line.product.price, 0);
  const raw = goods * (1 - percent / 100) + (includeShip ? order.shipCost : 0);
  return Math.min(Math.max(0, order.total - order.refundedAmount), raw);
}
