export type ProductStatus = "active" | "draft" | "archived";
export type PayStatus = "paid" | "pending" | "partially_refunded" | "refunded";
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "partial" | "onhold";

export type Product = {
  id: number;
  title: string;
  variant: string;
  price: number;
  compareAt?: number;
  cost: number;
  sku: string;
  barcode?: string;
  stock: number;
  status: ProductStatus;
  category: string;
  vendor: string;
  tone: string;
  tags: string[];
  collections: string[];
  option?: { name: string; values: string[] };
  quantities?: number[];
  description?: string;
};

export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  orders: number;
};

export type Order = {
  id: number;
  date: string;
  customerIndex: number;
  channel: string;
  items: [number, number][];
  discount?: [string, number];
  ship: string;
  pay: PayStatus;
  fulfillment: FulfillmentStatus;
  note?: string;
  tags?: string[];
  refunded?: number;
};

export type OrderView = Order & {
  customerName: string;
  subtotal: number;
  discountAmount: number;
  shipCost: number;
  total: number;
  quantity: number;
};
