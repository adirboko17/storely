export type ProductStatus = "active" | "draft" | "archived";

export type ProductBundle = { qty: number; price: number; label: string };
export type ProductPanel = { title: string; body: string };
export type ProductStory = { handle: string; url: string };
export type ProductStep = { title: string; body: string };
export type ProductIngredient = { en: string; he: string; body: string };
export type ProductReview = { name: string; title: string; body: string; date: string; verified: boolean };

export type ProductPage = {
  panels: ProductPanel[];
  stories: ProductStory[];
  steps: ProductStep[];
  ingredientsIntro: string;
  ingredients: ProductIngredient[];
  reviews: ProductReview[];
};

export const OLI_STORE_OWNER = "itsfrontale@gmail.com";

export function emptyProductPage(): ProductPage {
  return { panels: [], stories: [], steps: [], ingredientsIntro: "", ingredients: [], reviews: [] };
}
export type PayStatus = "paid" | "pending" | "partially_refunded" | "refunded";
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "partial" | "onhold";

export type Product = {
  id: number;
  sourceId?: string;
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
  media?: string[];
  tags: string[];
  collections: string[];
  subcategories?: string[];
  option?: { name: string; values: string[] };
  options?: { name: string; values: string[] }[];
  quantities?: number[];
  description?: string;
  bundles?: ProductBundle[];
  page?: ProductPage;
};

export type Customer = {
  id: number;
  sourceId?: string;
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
  at?: string;
  customerIndex: number;
  customerName?: string;
  channel: string;
  items: [number, number][];
  lineFallbacks?: Array<{ id: number; title: string; price: number; variant: string; sku: string }>;
  discount?: [string, number];
  discountAmount?: number;
  ship: string;
  shipCost?: number;
  totalAmount?: number;
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
