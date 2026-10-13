import { CUSTOMERS } from "@/data/mock/customers";
import { PRODUCTS } from "@/data/mock/products";
import type { Order, OrderView } from "@/types/commerce";

export const SHIPPING_RATES: Record<string, number> = {
  "שליח עד הבית": 29.9,
  "נקודת איסוף": 19.9,
  "איסוף עצמי": 0,
  "דואר ישראל": 14.9,
};

const HANDWRITTEN: Order[] = [
  {
    id: 1047,
    date: "היום ב-09:42",
    customerIndex: 0,
    channel: "חנות אונליין",
    items: [
      [0, 2],
      [6, 1],
      [3, 2],
    ],
    discount: ["SHANA10", 10],
    ship: "שליח עד הבית",
    pay: "paid",
    fulfillment: "unfulfilled",
    note: "אפשר לעטוף כמתנה? זה ליום הולדת של אמא שלי.",
    tags: ["מתנה", "לקוח חוזר"],
  },
  {
    id: 1046,
    date: "היום ב-08:17",
    customerIndex: 1,
    channel: "חנות אונליין",
    items: [[0, 1]],
    ship: "נקודת איסוף",
    pay: "paid",
    fulfillment: "unfulfilled",
  },
  {
    id: 1045,
    date: "היום ב-07:03",
    customerIndex: 2,
    channel: "אינסטגרם",
    items: [
      [5, 1],
      [3, 2],
    ],
    ship: "שליח עד הבית",
    pay: "pending",
    fulfillment: "onhold",
  },
  {
    id: 1044,
    date: "אתמול ב-22:48",
    customerIndex: 3,
    channel: "חנות אונליין",
    items: [
      [1, 2],
      [7, 1],
      [8, 1],
      [2, 2],
    ],
    ship: "שליח עד הבית",
    pay: "paid",
    fulfillment: "unfulfilled",
    tags: ["VIP"],
  },
  {
    id: 1043,
    date: "אתמול ב-19:21",
    customerIndex: 4,
    channel: "חנות אונליין",
    items: [[1, 1]],
    ship: "דואר ישראל",
    pay: "partially_refunded",
    fulfillment: "fulfilled",
    refunded: 80,
  },
  {
    id: 1042,
    date: "אתמול ב-14:05",
    customerIndex: 5,
    channel: "הזמנה ידנית",
    items: [
      [3, 1],
      [2, 1],
    ],
    ship: "איסוף עצמי",
    pay: "paid",
    fulfillment: "partial",
  },
  {
    id: 1041,
    date: "10 באוק׳ ב-21:36",
    customerIndex: 6,
    channel: "חנות אונליין",
    items: [[4, 1]],
    ship: "שליח עד הבית",
    pay: "paid",
    fulfillment: "fulfilled",
  },
  {
    id: 1040,
    date: "10 באוק׳ ב-16:12",
    customerIndex: 7,
    channel: "אינסטגרם",
    items: [[0, 1]],
    ship: "נקודת איסוף",
    pay: "refunded",
    fulfillment: "fulfilled",
  },
  {
    id: 1039,
    date: "10 באוק׳ ב-10:54",
    customerIndex: 8,
    channel: "חנות אונליין",
    items: [
      [6, 1],
      [11, 1],
      [3, 3],
    ],
    discount: ["WELCOME15", 15],
    ship: "שליח עד הבית",
    pay: "paid",
    fulfillment: "fulfilled",
  },
  {
    id: 1038,
    date: "9 באוק׳ ב-20:30",
    customerIndex: 9,
    channel: "חנות אונליין",
    items: [[6, 1]],
    ship: "דואר ישראל",
    pay: "pending",
    fulfillment: "unfulfilled",
  },
  {
    id: 1037,
    date: "9 באוק׳ ב-12:18",
    customerIndex: 10,
    channel: "חנות אונליין",
    items: [
      [7, 1],
      [0, 2],
    ],
    ship: "שליח עד הבית",
    pay: "paid",
    fulfillment: "fulfilled",
  },
  {
    id: 1036,
    date: "8 באוק׳ ב-18:44",
    customerIndex: 11,
    channel: "הזמנה ידנית",
    items: [
      [8, 1],
      [9, 2],
    ],
    ship: "איסוף עצמי",
    pay: "paid",
    fulfillment: "fulfilled",
  },
];

function generatedOrders(): Order[] {
  const ships = Object.keys(SHIPPING_RATES);
  const channels = ["חנות אונליין", "חנות אונליין", "אינסטגרם", "חנות אונליין", "הזמנה ידנית"];
  const orders: Order[] = [];
  for (let k = 0; k < 22; k += 1) {
    const day = 7 - Math.floor(k / 4);
    const hour = 21 - (k % 4) * 4 - (k % 3);
    const minute = String((k * 17 + 7) % 60).padStart(2, "0");
    const items: [number, number][] = [[(k * 5 + 2) % 12, 1 + (k % 3 === 0 ? 1 : 0)]];
    if (k % 2) items.push([(k * 7 + 3) % 12, 1]);
    orders.push({
      id: 1035 - k,
      date: `${day} באוק׳ ב-${String(hour).padStart(2, "0")}:${minute}`,
      customerIndex: (k * 7 + 3) % 12,
      channel: channels[k % 5] ?? "חנות אונליין",
      items,
      ship: ships[k % 4] ?? "שליח עד הבית",
      pay: "paid",
      fulfillment: k === 1 || k === 6 ? "unfulfilled" : "fulfilled",
      tags: k % 6 === 0 ? ["לקוח חוזר"] : undefined,
    });
  }
  return orders;
}

export const ORDERS: Order[] = [];

export function toOrderView(order: Order): OrderView {
  const subtotal = order.items.reduce((sum, [productIndex, quantity]) => {
    const product = PRODUCTS[productIndex];
    return sum + (product ? product.price * quantity : 0);
  }, 0);
  const discountAmount = order.discount ? Math.round(subtotal * order.discount[1]) / 100 : 0;
  const shipCost = SHIPPING_RATES[order.ship] ?? 0;
  const total = Math.round((subtotal - discountAmount + shipCost) * 100) / 100;
  const quantity = order.items.reduce((sum, [, qty]) => sum + qty, 0);
  return {
    ...order,
    customerName: CUSTOMERS[order.customerIndex]?.name ?? "",
    subtotal,
    discountAmount,
    shipCost,
    total,
    quantity,
  };
}

export function listOrderViews() {
  return ORDERS.map(toOrderView);
}

export function attentionCounts() {
  const orders = listOrderViews();
  return {
    unfulfilled: orders.filter((order) => order.fulfillment !== "fulfilled").length,
    pendingPayment: orders.filter((order) => order.pay === "pending").length,
    lowStock: PRODUCTS.filter((product) => product.status === "active" && product.stock < 5).length,
  };
}
