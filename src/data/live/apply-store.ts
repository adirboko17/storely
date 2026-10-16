import { replaceCatalogProducts, type CollectionCondition, type CollectionDraft, type GiftCard } from "@/data/mock/catalog-session";
import { splitCollectionRules, splitProductTags } from "@/lib/catalog/subcategories";
import { replacePosts, type Post } from "@/data/mock/content-session";
import { blankDiscount, replaceDiscounts, type Discount, type DiscountKind } from "@/data/mock/discount-session";
import { absorbLegacyEmails, parseEmails, parseSms, replaceMarketing, type Flow, type IntegrationState } from "@/data/mock/marketing-session";
import { replaceAbandoned, replaceLiveOrders } from "@/data/mock/order-session";
import { replacePeople, type PersonProfile } from "@/data/mock/people-session";
import { normalizeBrandColors, normalizePolicies, replaceSettings, type ReturnRule, type ShipProfile } from "@/data/mock/settings-session";
import { beginHydration, endHydration } from "@/data/live/write";
import { setStoreCurrency } from "@/lib/formatting/currency";
import { claimStore, setStoreIdentity } from "@/data/live/store-identity";
import { enableLiveMetrics } from "@/lib/dashboard/chart";
import type { TimelineEvent } from "@/lib/orders/present";
import type { AbandonedCheckout } from "@/data/mock/abandoned";
import type { Customer, FulfillmentStatus, Order, PayStatus, Product, ProductStatus } from "@/types/commerce";

export type StoreSnapshot = {
  name?: unknown;
  hostname?: unknown;
  ownerName?: unknown;
  ownerEmail?: unknown;
  products?: unknown;
  customers?: unknown;
  discounts?: unknown;
  orders?: unknown;
  collections?: unknown;
  checkouts?: unknown;
  policies?: unknown;
  shipping?: unknown;
  marketing?: unknown;
  posts?: unknown;
  giftCards?: unknown;
  logoUrl?: unknown;
  brandColors?: unknown;
  currency?: unknown;
};

function row(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function amount(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function productStatus(value: unknown): ProductStatus {
  return value === "draft" || value === "archived" || value === "active" ? value : "active";
}

function mapProduct(value: unknown, index: number): Product {
  const item = row(value);
  const rawTags = Array.isArray(item?.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const { tags, subcategories } = splitProductTags(rawTags);
  const compareAt = item?.compareAt == null ? undefined : amount(item.compareAt);
  return {
    id: index,
    sourceId: text(item?.id),
    title: text(item?.title),
    variant: text(item?.variant),
    price: amount(item?.price),
    compareAt,
    cost: amount(item?.cost),
    sku: text(item?.sku),
    barcode: text(item?.barcode) || undefined,
    stock: amount(item?.stock),
    status: productStatus(item?.status),
    category: text(item?.category),
    vendor: text(item?.vendor),
    tone: "#e4e0d8",
    media: Array.isArray(item?.media) ? item.media.filter((value): value is string => typeof value === "string" && value.startsWith("http")) : undefined,
    tags,
    collections: [],
    subcategories,
    description: text(item?.description),
  };
}

function mapCustomer(value: unknown, index: number): Customer {
  const item = row(value);
  return {
    id: index,
    sourceId: text(item?.id),
    name: text(item?.name),
    email: text(item?.email),
    phone: text(item?.phone),
    street: text(item?.street),
    city: text(item?.city),
    zip: text(item?.zip),
    orders: amount(item?.orders),
  };
}

function discountKind(value: unknown): DiscountKind {
  return value === "product" || value === "ship" || value === "bxgy" || value === "order" ? value : "order";
}

function mapDiscount(value: unknown, index: number): Discount {
  const item = row(value);
  const discount = blankDiscount(discountKind(item?.kind), index + 1);
  const collections = Array.isArray(item?.collections) ? item.collections.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    ...discount,
    sourceId: text(item?.id) || undefined,
    code: text(item?.code) || text(item?.title),
    valueType: item?.valueType === "fixed" ? "fixed" : "pct",
    value: item && Object.prototype.hasOwnProperty.call(item, "value") ? String(amount(item.value)) : discount.value,
    method: item?.method === "auto" ? "auto" : "code",
    eligibility: item?.eligibility === "seg" ? "seg" : "all",
    segment: text(item?.segment),
    minType: item?.minType === "amount" || item?.minType === "qty" ? item.minType : "none",
    minValue: String(amount(item?.minValue) || ""),
    once: item?.once === true,
    limit: item?.limit === true,
    limitN: String(amount(item?.limitN) || ""),
    start: text(item?.start) || discount.start,
    hasEnd: item?.hasEnd === true,
    end: text(item?.end),
    uses: amount(item?.uses),
    combProduct: item?.combProduct === true,
    combOrder: item?.combOrder === true,
    combShip: item?.combShip === true,
    applies: item?.applies === "colls" || item?.applies === "subs" ? item.applies : "all",
    collections,
    bxBuy: text(item?.bxBuy) || discount.bxBuy,
    bxGet: text(item?.bxGet) || discount.bxGet,
    bxColl: text(item?.bxColl),
  };
}

function payStatus(value: unknown): PayStatus {
  return value === "paid" || value === "pending" || value === "partially_refunded" || value === "refunded" ? value : "pending";
}

function fulfillmentStatus(value: unknown): FulfillmentStatus {
  return value === "unfulfilled" || value === "fulfilled" || value === "partial" || value === "onhold" ? value : "unfulfilled";
}

function hebrewWhen(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  const time = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(date);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(date);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - 86400000));
  if (day === today) return `היום ב-${time}`;
  if (day === yesterday) return `אתמול ב-${time}`;
  const label = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" }).format(date);
  return `${label} ב-${time}`;
}

function mapOrder(value: unknown, products: Product[], customers: Customer[]): Order | null {
  const item = row(value);
  const number = amount(item?.number);
  if (!number) return null;
  const lines = Array.isArray(item?.lines) ? item.lines : [];
  const items: [number, number][] = [];
  const lineFallbacks: NonNullable<Order["lineFallbacks"]> = [];
  lines.forEach((line) => {
    const entry = row(line);
    const productId = text(entry?.productId);
    const product = products.find((candidate) => candidate.sourceId === productId);
    const localId = product?.id ?? -1 - items.length;
    items.push([localId, Math.max(1, amount(entry?.quantity))]);
    lineFallbacks.push({
      id: localId,
      title: text(entry?.title) || product?.title || "מוצר",
      price: amount(entry?.unitPrice),
      variant: text(entry?.variant),
      sku: text(entry?.sku),
    });
  });
  const customer = customers.find((person) => person.sourceId === text(item?.customerId));
  const tags = Array.isArray(item?.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const code = text(item?.discountCode);
  return {
    id: number,
    date: hebrewWhen(item?.createdAt),
    at: text(item?.createdAt),
    customerIndex: customer?.id ?? -1,
    customerName: text(item?.customerName) || customer?.name || "",
    channel: text(item?.channel) || "חנות אונליין",
    items,
    lineFallbacks,
    discount: code ? [code, 0] : undefined,
    discountAmount: amount(item?.discountAmount),
    ship: text(item?.shippingName),
    shipCost: amount(item?.shippingAmount),
    totalAmount: amount(item?.total),
    pay: payStatus(item?.pay),
    fulfillment: fulfillmentStatus(item?.fulfillment),
    note: text(item?.note) || undefined,
    tags,
    refunded: amount(item?.refunded),
  };
}

function mapTimeline(value: unknown): TimelineEvent[] {
  const item = row(value);
  const timeline = Array.isArray(item?.timeline) ? item.timeline : [];
  return timeline.flatMap((entry) => {
    const event = row(entry);
    const body = text(event?.text);
    if (!body) return [];
    return [{ text: body, time: hebrewWhen(event?.at) || "עכשיו", who: "צוות החנות" }];
  });
}

function mapCheckout(value: unknown): AbandonedCheckout | null {
  const item = row(value);
  const id = text(item?.id);
  if (!id) return null;
  const lines = Array.isArray(item?.lines) ? item.lines : [];
  return {
    id,
    day: hebrewWhen(item?.updatedAt).startsWith("היום") ? "היום" : hebrewWhen(item?.updatedAt).startsWith("אתמול") ? "אתמול" : "לפני כן",
    date: hebrewWhen(item?.updatedAt),
    at: text(item?.updatedAt),
    name: text(item?.name),
    email: text(item?.email),
    phone: text(item?.phone),
    street: text(item?.street),
    city: text(item?.city),
    zip: text(item?.zip),
    lines: lines.flatMap((line) => {
      const entry = row(line);
      const quantity = Math.max(1, amount(entry?.quantity));
      const product: Product = {
        id: -1,
        title: text(entry?.title) || "מוצר",
        variant: text(entry?.variant),
        price: amount(entry?.unitPrice),
        cost: 0,
        sku: text(entry?.sku),
        stock: 0,
        status: "active",
        category: "",
        vendor: "",
        tone: "#e4e0d8",
        tags: [],
        collections: [],
      };
      return [{ product, quantity }];
    }),
    subtotal: amount(item?.subtotal),
    shipCost: amount(item?.shippingAmount),
    total: amount(item?.total),
    sent: item?.reminded === true,
    recovered: item?.recovered === true,
    source: "חנות אונליין",
    subscribed: false,
  };
}

function mapCollections(value: unknown, products: Product[]) {
  const collections: Record<string, CollectionDraft> = {};
  const extra: string[] = [];
  const hidden: string[] = [];
  if (!Array.isArray(value)) return { collections, extra, hidden };
  value.forEach((entry) => {
    const item = row(entry);
    const title = text(item?.title);
    if (!title) return;
    const ids = Array.isArray(item?.productIds)
      ? item.productIds.flatMap((productId) => {
          const product = products.find((candidate) => candidate.sourceId === productId);
          return product ? [product.id] : [];
        })
      : [];
    const parsed = splitCollectionRules(Array.isArray(item?.conditions) ? item.conditions.flatMap((condition) => {
      const rule = row(condition);
      if (!rule) return [];
      return [{ field: text(rule.field), op: text(rule.op), value: text(rule.value) }];
    }) : []);
    const listed = Array.isArray(item?.subcategories) ? item.subcategories.filter((entry): entry is string => typeof entry === "string") : [];
    const conditions: CollectionCondition[] = parsed.conditions;
    collections[title] = {
      title,
      description: text(item?.description),
      ids,
      conditions,
      excludeOutOfStock: item?.excludeOutOfStock === true,
      image: text(item?.image),
      subcategories: [...new Set([...listed.map((name) => name.trim()).filter(Boolean), ...parsed.subcategories])],
    };
    if (item?.hidden === true) hidden.push(title);
    else extra.push(title);
    products.forEach((product) => {
      if (ids.includes(product.id) && !product.collections.includes(title)) product.collections.push(title);
    });
  });
  return { collections, extra, hidden };
}

function mapProfiles(customers: Customer[], values: unknown[]) {
  const profiles: Record<number, PersonProfile> = {};
  values.forEach((value, index) => {
    const item = row(value);
    const customer = customers[index];
    if (!customer) return;
    const tags = Array.isArray(item?.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];
    profiles[customer.id] = {
      subscribed: item?.subscribed === true,
      note: text(item?.note),
      tags,
      credit: amount(item?.credit),
      comments: [],
      blocks: [],
      language: item?.language === "en" ? "en" : "he",
      sms: item?.sms === true,
      whatsapp: item?.whatsapp === true,
    };
  });
  return profiles;
}

function mapShipping(value: unknown) {
  const item = row(value);
  const rules = Array.isArray(item?.rules)
    ? item.rules.flatMap((entry) => {
        const rule = row(entry);
        const id = text(rule?.id);
        if (!id) return [];
        return [{ id, name: text(rule?.name), days: text(rule?.days), fee: text(rule?.fee) } satisfies ReturnRule];
      })
    : [];
  const profiles = Array.isArray(item?.profiles)
    ? item.profiles.flatMap((entry) => {
        const profile = row(entry);
        const id = text(profile?.id);
        if (!id) return [];
        return [profile as unknown as ShipProfile];
      })
    : [{ id: "general", name: "פרופיל כללי", location: null, zones: [] } satisfies ShipProfile];
  return {
    rules,
    profiles,
    estimates: item?.estimates === true,
    localDelivery: item?.localDelivery === true,
    pickup: item?.pickup === true,
    contact: mapStoreContact(item?.contact),
  };
}

function mapStoreContact(value: unknown) {
  const item = row(value);
  return {
    email: text(item?.email),
    phone: text(item?.phone),
    addressMode: item?.addressMode === "physical" ? "physical" as const : "none" as const,
    company: text(item?.company),
    country: text(item?.country) || "ישראל",
    street: text(item?.street),
    apartment: text(item?.apartment),
    zip: text(item?.zip),
    city: text(item?.city),
  };
}

function mapPosts(value: unknown): Post[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const item = row(entry);
    if (!item) return [];
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];
    return [{
      id: amount(item.id) || index + 1,
      title: text(item.title),
      excerpt: text(item.excerpt),
      body: text(item.body),
      author: text(item.author),
      blog: text(item.blog),
      visible: item.visible !== false,
      tags,
      tone: text(item.tone) || "#e4e0d8",
      image: text(item.image),
      seoTitle: text(item.seoTitle),
      seoDescription: text(item.seoDescription),
      handle: text(item.handle),
      template: text(item.template),
    }];
  });
}

function mapGiftCards(value: unknown): GiftCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = row(entry);
    const code = text(item?.code);
    if (!code) return [];
    return [{
      code,
      value: amount(item?.value),
      balance: amount(item?.balance ?? item?.value),
      customer: text(item?.customer),
      expires: text(item?.expires),
      note: text(item?.note),
    }];
  });
}

export function applyStoreSnapshot(storeId: string, snapshot: StoreSnapshot) {
  const mark = [snapshot.name, snapshot.ownerName, snapshot.ownerEmail, snapshot.hostname, snapshot.logoUrl, JSON.stringify(snapshot.brandColors ?? ""), Array.isArray(snapshot.orders) ? snapshot.orders.length : 0, Array.isArray(snapshot.products) ? snapshot.products.length : 0].map(String).join("|");
  if (!claimStore(storeId, mark)) return;
  setStoreIdentity({
    storeId,
    name: text(snapshot.name),
    hostname: text(snapshot.hostname),
    ownerName: text(snapshot.ownerName),
    ownerEmail: text(snapshot.ownerEmail),
  });
  const products = Array.isArray(snapshot.products) ? snapshot.products.map(mapProduct) : [];
  const customers = Array.isArray(snapshot.customers) ? snapshot.customers.map(mapCustomer) : [];
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts.map(mapDiscount) : [];
  const orders = Array.isArray(snapshot.orders) ? snapshot.orders.flatMap((entry) => {
    const order = mapOrder(entry, products, customers);
    return order ? [order] : [];
  }) : [];
  const events: Record<number, TimelineEvent[]> = {};
  if (Array.isArray(snapshot.orders)) {
    snapshot.orders.forEach((entry) => {
      const number = amount(row(entry)?.number);
      if (number) events[number] = mapTimeline(entry);
    });
  }
  const checkouts = Array.isArray(snapshot.checkouts) ? snapshot.checkouts.flatMap((entry) => {
    const checkout = mapCheckout(entry);
    return checkout ? [checkout] : [];
  }) : [];
  const collectionState = mapCollections(snapshot.collections, products);
  const shipping = mapShipping(snapshot.shipping);
  const marketing = row(snapshot.marketing);
  const flows = Array.isArray(marketing?.flows) ? marketing.flows.filter((flow): flow is Flow => Boolean(row(flow)?.name)) : [];
  const library = absorbLegacyEmails(flows, parseEmails(marketing?.emails), parseSms(marketing?.sms));
  const connected = row(marketing?.connected) ?? {};
  beginHydration();
  try {
    replaceCatalogProducts(products, {
      giftCards: mapGiftCards(snapshot.giftCards),
      collections: collectionState.collections,
      hiddenCollections: collectionState.hidden,
      extraCollections: collectionState.extra,
    });
    replacePeople(customers, Array.isArray(snapshot.customers) ? mapProfiles(customers, snapshot.customers) : {});
    replaceDiscounts(discounts);
    replaceLiveOrders(orders, events);
    replaceAbandoned(checkouts);
    replaceSettings({ policies: normalizePolicies(snapshot.policies), ...shipping, logo: text(snapshot.logoUrl), colors: normalizeBrandColors(snapshot.brandColors) });
    replacePosts(mapPosts(snapshot.posts));
    replaceMarketing({ connected: connected as Record<string, IntegrationState>, flows: library.flows, emails: library.emails, sms: library.sms });
    enableLiveMetrics();
    setStoreCurrency(snapshot.currency);
  } finally {
    endHydration();
  }
}
