import { ABANDONED, type AbandonedCheckout } from "@/data/mock/abandoned";
import { CUSTOMERS } from "@/data/mock/customers";
import { ORDERS, toOrderView } from "@/data/mock/orders";
import { PRODUCTS } from "@/data/mock/products";
import { writeStore } from "@/data/live/write";
import type { ResolvedOrder, TimelineEvent } from "@/lib/orders/present";
import type { FulfillmentStatus, Order, PayStatus, Product } from "@/types/commerce";

type OrderOverride = {
  pay?: PayStatus;
  fulfillment?: FulfillmentStatus;
  refunded?: number;
  tracking?: string;
  carrier?: string;
};

export type AbandonedOverride = {
  sent?: boolean;
  note?: string;
  noteDraft?: string | null;
  log?: string[];
};

export type LiveCheckout = AbandonedCheckout & AbandonedOverride;

type Snapshot = {
  version: number;
  overrides: Record<number, OrderOverride>;
  events: Record<number, TimelineEvent[]>;
  abandoned: Record<string, AbandonedOverride>;
};

let current: Snapshot = { version: 0, overrides: {}, events: {}, abandoned: {} };
const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
}

export function subscribeOrderSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOrderSessionVersion() {
  return current.version;
}

function productFor(order: Order, productIndex: number): Product {
  const catalog = PRODUCTS.find((item) => item.id === productIndex) ?? PRODUCTS[productIndex];
  const fallback = order.lineFallbacks?.find((line) => line.id === productIndex);
  const base: Product = catalog ?? {
    id: productIndex,
    title: fallback?.title || "מוצר",
    variant: fallback?.variant || "",
    price: fallback?.price || 0,
    cost: 0,
    sku: fallback?.sku || "",
    stock: 0,
    status: "active",
    category: "",
    vendor: "",
    tone: "#e4e0d8",
    tags: [],
    collections: [],
  };
  if (!fallback) return base;
  return { ...base, title: fallback.title, price: fallback.price, variant: fallback.variant, sku: fallback.sku };
}

function persistOrder(orderId: number, patch: Record<string, unknown>) {
  void writeStore("update_store_order", { order_number: orderId, patch });
}

export function replaceLiveOrders(orders: Order[], events: Record<number, TimelineEvent[]> = {}) {
  ORDERS.splice(0, ORDERS.length, ...orders);
  publish({ overrides: {}, events, abandoned: current.abandoned });
}

export function replaceAbandoned(checkouts: AbandonedCheckout[]) {
  ABANDONED.splice(0, ABANDONED.length, ...checkouts);
  publish({ ...current, abandoned: {} });
}

function resolve(orderId: number): ResolvedOrder {
  const order = ORDERS.find((item) => item.id === orderId);
  if (!order) throw new Error(`Missing order ${orderId}`);
  const view = toOrderView(order);
  const override = current.overrides[order.id];
  const customer = CUSTOMERS.find((person) => person.id === order.customerIndex) ?? CUSTOMERS[order.customerIndex] ?? {
    id: order.customerIndex,
    name: order.customerName || "",
    email: "",
    phone: "",
    street: "",
    city: "",
    zip: "",
    orders: 0,
  };
  const lines = order.items.map(([productIndex, quantity]) => ({ product: productFor(order, productIndex), quantity }));
  const refundedAmount =
    override?.refunded != null ? override.refunded : order.pay === "refunded" ? view.total : (order.refunded ?? 0);
  return {
    ...view,
    pay: override?.pay ?? order.pay,
    fulfillment: override?.fulfillment ?? order.fulfillment,
    customer,
    lines,
    refundedAmount,
    refunded: refundedAmount,
    tracking: override?.tracking,
    carrier: override?.carrier,
    sourcePay: order.pay,
    sourceFulfillment: order.fulfillment,
  };
}

export function listResolvedOrders() {
  return ORDERS.map((order) => resolve(order.id));
}

export function resolveOrder(orderId: number) {
  return ORDERS.some((order) => order.id === orderId) ? resolve(orderId) : null;
}

export function orderEvents(orderId: number) {
  return current.events[orderId] ?? [];
}

export function unfulfilledCount() {
  return ORDERS.filter((order) => (current.overrides[order.id]?.fulfillment ?? order.fulfillment) !== "fulfilled").length;
}

function remember(orderId: number, text: string, events: Snapshot["events"]) {
  return {
    ...events,
    [orderId]: [{ text, time: "עכשיו", who: "צוות החנות" }, ...(events[orderId] ?? [])],
  };
}

export function bulkFulfill(ids: number[]) {
  const overrides = { ...current.overrides };
  ids.forEach((id) => {
    overrides[id] = {
      ...overrides[id],
      fulfillment: "fulfilled",
      carrier: "שליחויות צ׳יטה",
      tracking: `CH${id * 7919}`,
    };
    persistOrder(id, { fulfillment: "fulfilled", carrier: "שליחויות צ׳יטה", tracking: `CH${id * 7919}` });
  });
  publish({ ...current, overrides });
}

export function markOrderPaid(orderId: number, totalLabel: string) {
  const text = `ההזמנה סומנה כשולמה (${totalLabel}).`;
  publish({
    ...current,
    overrides: { ...current.overrides, [orderId]: { ...current.overrides[orderId], pay: "paid" } },
    events: remember(orderId, text, current.events),
  });
  persistOrder(orderId, { pay: "paid", comment: text });
}

export function confirmFulfill(
  orderId: number,
  input: { carrier: string; tracking: string; notify: boolean; quantity: number },
) {
  const text = `${input.quantity} פריטים סומנו כנשלחו עם ${input.carrier}. מספר מעקב: ${input.tracking}.${input.notify ? " הלקוח קיבל הודעה בדוא״ל." : ""}`;
  publish({
    ...current,
    overrides: {
      ...current.overrides,
      [orderId]: {
        ...current.overrides[orderId],
        fulfillment: "fulfilled",
        carrier: input.carrier,
        tracking: input.tracking,
      },
    },
    events: remember(orderId, text, current.events),
  });
  persistOrder(orderId, { fulfillment: "fulfilled", carrier: input.carrier, tracking: input.tracking, comment: text });
}

export function confirmRefund(orderId: number, input: { totalRefunded: number; pay: PayStatus; text: string }) {
  publish({
    ...current,
    overrides: {
      ...current.overrides,
      [orderId]: { ...current.overrides[orderId], refunded: input.totalRefunded, pay: input.pay },
    },
    events: remember(orderId, input.text, current.events),
  });
  persistOrder(orderId, { pay: input.pay, refunded: input.totalRefunded, comment: input.text });
}

export function addOrderComment(orderId: number, text: string) {
  publish({ ...current, events: remember(orderId, text, current.events) });
  persistOrder(orderId, { comment: text });
}

export function listLiveCheckouts(): LiveCheckout[] {
  return ABANDONED.map((checkout) => ({ ...checkout, ...current.abandoned[checkout.id] }));
}

export function patchCheckout(id: string, patch: AbandonedOverride) {
  const next = { ...current.abandoned[id], ...patch };
  publish({
    ...current,
    abandoned: { ...current.abandoned, [id]: next },
  });
  if (typeof next.sent === "boolean" && /^[0-9a-f-]{36}$/i.test(id)) {
    void writeStore("update_store_checkout", { checkout_id: id, reminded: next.sent });
  }
}

export function markCheckoutsSent(ids: string[]) {
  const abandoned = { ...current.abandoned };
  ids.forEach((id) => {
    abandoned[id] = { ...abandoned[id], sent: true };
    if (/^[0-9a-f-]{36}$/i.test(id)) void writeStore("update_store_checkout", { checkout_id: id, reminded: true });
  });
  publish({ ...current, abandoned });
}
