export type ProductStatus = "active" | "draft" | "archived";

export type ProductBundle = { qty: number; price: number; label: string; image?: string; tag?: string };
export type ProductPanelLink = { kind: "url" | "article"; label: string; href: string };
export type ProductPanelAlign = "right" | "left";
export type ProductPanel = { title: string; body: string; align?: ProductPanelAlign; links?: ProductPanelLink[] };
export type ProductStory = { handle: string; url: string };
export type ProductStep = { title: string; body: string };
export type ProductIngredient = { en: string; he: string; body: string };
export type ProductInci = { inci: string; he: string; key?: boolean };
export type ProductReview = { name: string; title: string; body: string; date: string; rating: number; verified: boolean };
export type ProductFaqTag = "use" | "ing" | "post" | "buy";
export type ProductFaq = { q: string; a: string; tag: ProductFaqTag };
export type ProductHeadlineMode = "single" | "split";
export type ProductHeadline = { mode: ProductHeadlineMode; subtitle: string };

export type ProductPage = {
  highlights: string[];
  panels: ProductPanel[];
  stories: ProductStory[];
  steps: ProductStep[];
  ingredientsIntro: string;
  ingredients: ProductIngredient[];
  inci: ProductInci[];
  reviews: ProductReview[];
  faqs: ProductFaq[];
};

export const OLI_STORE_OWNER = "itsfrontale@gmail.com";

export function emptyProductPage(): ProductPage {
  return { highlights: [], panels: [], stories: [], steps: [], ingredientsIntro: "", ingredients: [], inci: [], reviews: [], faqs: [] };
}
export type PayStatus = "paid" | "pending" | "partially_refunded" | "refunded";
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "partial" | "onhold" | "progress";
export type CustomerOrderStatus = "received" | "progress" | "hold" | "sent" | "transit" | "delivered";

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
  trackInventory?: boolean;
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
  badge?: string;
  badgeHidden?: boolean;
  headline?: ProductHeadline;
  seoTitle?: string;
  seoDescription?: string;
  handle?: string;
  giftOpen?: boolean;
  giftAmounts?: number[];
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
  createdAt?: string;
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
  customerStatus?: CustomerOrderStatus;
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
