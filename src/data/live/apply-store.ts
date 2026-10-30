import { listCatalogProducts, replaceCatalogProducts, type CollectionCondition, type CollectionDraft, type GiftCard } from "@/data/mock/catalog-session";
import { giftAmountsFromTags, splitCollectionRules, splitProductTags } from "@/lib/catalog/subcategories";
import { replacePosts, type Post } from "@/data/mock/content-session";
import { blankDiscount, replaceDiscounts, type BxgyMode, type Discount, type DiscountKind } from "@/data/mock/discount-session";
import { absorbLegacyEmails, parseEmails, parseSms, replaceMarketing, type Flow, type IntegrationState } from "@/data/mock/marketing-session";
import { replaceAbandoned, replaceLiveOrders, syncLiveOrders } from "@/data/mock/order-session";
import { listPeople, mergePeople, replacePeople, type PersonProfile } from "@/data/mock/people-session";
import { getSettings, normalizeBrandColors, normalizePolicies, replaceSettings, type ReturnRule, type ShipProfile } from "@/data/mock/settings-session";
import { beginHydration, endHydration } from "@/data/live/write";
import { setStoreCurrency } from "@/lib/formatting/currency";
import { claimStore, getStoreIdentity, setStoreIdentity } from "@/data/live/store-identity";
import { enableLiveMetrics } from "@/lib/dashboard/chart";
import type { TimelineEvent } from "@/lib/orders/present";
import type { AbandonedCheckout } from "@/data/mock/abandoned";
import { parseProductMerch } from "@/lib/catalog/merch";
import type { Customer, CustomerOrderStatus, FulfillmentStatus, Order, PayStatus, Product, ProductStatus } from "@/types/commerce";

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

function imageZoom(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 1;
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(3, Math.round(parsed * 100) / 100);
}

function focusPercent(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 50;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
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
  const merch = parseProductMerch(item?.merch);
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
    bundles: merch.bundles,
    page: merch.page,
    badge: merch.badge || undefined,
    badgeHidden: merch.badgeHidden || undefined,
    headline: merch.headline,
    seoTitle: merch.seoTitle || undefined,
    seoDescription: merch.seoDescription || undefined,
    handle: text(item?.handle) || undefined,
    giftOpen: rawTags.includes("\u0001gift:open") || undefined,
    giftAmounts: giftAmountsFromTags(rawTags),
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
    createdAt: text(item?.createdAt) || undefined,
  };
}

function discountKind(value: unknown): DiscountKind {
  return value === "product" || value === "ship" || value === "bxgy" || value === "order" ? value : "order";
}

function bxgyMode(value: unknown, category: string): BxgyMode {
  if (value === "pair" || value === "qty" || value === "cats") return value;
  return category.trim() ? "cats" : "qty";
}

function idList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "") : [];
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
    combBundle: item?.combBundle === true,
    blockGift: item?.blockGift === true,
    applies: item?.applies === "colls" || item?.applies === "subs" || item?.applies === "prods" ? item.applies : "all",
    collections,
    bxMode: bxgyMode(item?.bxMode, text(item?.bxColl)),
    bxBuy: text(item?.bxBuy) || discount.bxBuy,
    bxGet: text(item?.bxGet) || discount.bxGet,
    bxColl: text(item?.bxColl),
    bxGetColl: text(item?.bxGetColl),
    bxBuyIds: idList(item?.bxBuyIds),
    bxGetIds: idList(item?.bxGetIds),
  };
}

function payStatus(value: unknown): PayStatus {
  return value === "paid" || value === "pending" || value === "partially_refunded" || value === "refunded" ? value : "pending";
}

function customerOrderStatus(value: unknown, fulfillment: FulfillmentStatus): CustomerOrderStatus {
  if (value === "received" || value === "progress" || value === "hold" || value === "sent" || value === "transit" || value === "delivered") return value;
  if (fulfillment === "progress" || fulfillment === "partial") return "progress";
  if (fulfillment === "onhold") return "hold";
  if (fulfillment === "fulfilled") return "sent";
  return "received";
}

function fulfillmentStatus(value: unknown): FulfillmentStatus {
  return value === "unfulfilled" || value === "fulfilled" || value === "partial" || value === "onhold" || value === "progress" ? value : "unfulfilled";
}

const timeFormat = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });
const labelFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" });

function hebrewWhen(value: unknown) {
  const date = new Date(text(value));
  if (Number.isNaN(date.getTime())) return "";
  const time = timeFormat.format(date);
  const day = dayFormat.format(date);
  const today = dayFormat.format(new Date());
  const yesterday = dayFormat.format(new Date(Date.now() - 86400000));
  if (day === today) return `היום ב-${time}`;
  if (day === yesterday) return `אתמול ב-${time}`;
  return `${labelFormat.format(date)} ב-${time}`;
}

function indexProducts(products: Product[]) {
  const map = new Map<string, Product>();
  products.forEach((product) => {
    if (product.sourceId) map.set(product.sourceId, product);
  });
  return map;
}

function indexCustomers(customers: Customer[]) {
  const map = new Map<string, Customer>();
  customers.forEach((customer) => {
    if (customer.sourceId) map.set(customer.sourceId, customer);
  });
  return map;
}

function mapOrder(value: unknown, products: Map<string, Product>, customers: Map<string, Customer>): Order | null {
  const item = row(value);
  const number = amount(item?.number);
  if (!number) return null;
  const lines = Array.isArray(item?.lines) ? item.lines : [];
  const items: [number, number][] = [];
  const lineFallbacks: NonNullable<Order["lineFallbacks"]> = [];
  lines.forEach((line) => {
    const entry = row(line);
    const productId = text(entry?.productId);
    const product = productId ? products.get(productId) : undefined;
    const gift = Boolean(product?.giftOpen || product?.giftAmounts?.length);
    const localId = product?.id ?? -1 - items.length;
    items.push([localId, Math.max(1, amount(entry?.quantity))]);
    lineFallbacks.push({
      id: localId,
      title: text(entry?.title) || product?.title || "מוצר",
      price: amount(entry?.unitPrice),
      variant: gift ? "" : text(entry?.variant),
      sku: gift ? "" : text(entry?.sku),
    });
  });
  const customer = customers.get(text(item?.customerId));
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
    customerStatus: customerOrderStatus(item?.customerStatus, fulfillmentStatus(item?.fulfillment)),
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
      manualSort: item?.manualSort === true,
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
      updated: text(item.updated),
      productId: text(item.productId),
      productNote: text(item.productNote),
      blog: text(item.blog),
      visible: item.visible !== false,
      tags,
      tone: text(item.tone) || "#e4e0d8",
      image: text(item.image),
      imageX: focusPercent(item.imageX),
      imageY: focusPercent(item.imageY),
      imageScale: imageZoom(item.imageScale),
      video: text(item.video),
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

export function applyOrderRefresh(snapshot: StoreSnapshot) {
  const products = indexProducts(listCatalogProducts());
  const customers = indexCustomers(listPeople());
  const orders = Array.isArray(snapshot.orders)
    ? snapshot.orders.flatMap((entry) => {
        const order = mapOrder(entry, products, customers);
        return order ? [order] : [];
      })
    : [];
  const events: Record<number, TimelineEvent[]> = {};
  if (Array.isArray(snapshot.orders)) {
    snapshot.orders.forEach((entry) => {
      const number = amount(row(entry)?.number);
      if (number) events[number] = mapTimeline(entry);
    });
  }
  syncLiveOrders(orders, events);
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
  const productIndex = indexProducts(products);
  const customerIndex = indexCustomers(customers);
  const orders = Array.isArray(snapshot.orders) ? snapshot.orders.flatMap((entry) => {
    const order = mapOrder(entry, productIndex, customerIndex);
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

export type AdminSlice = "catalog" | "customers" | "orders" | "discounts" | "checkouts" | "content" | "desk";

export type StoreShell = {
  storeId: string;
  name: string;
  hostname: string;
  ownerName: string;
  ownerEmail: string;
  logoUrl: string;
  brandColors: unknown;
  currency: string;
};

export const ORDER_PAGE_SIZE = 50;

const orderPageRaw = new Map<number, unknown[]>();
const orderPageIds = new Map<number, number[]>();

function publishMappedOrders() {
  if (orderPageRaw.size === 0) return;
  const productIndex = indexProducts(listCatalogProducts());
  const customerIndex = indexCustomers(listPeople());
  const orders: Order[] = [];
  const events: Record<number, TimelineEvent[]> = {};
  const pages = [...orderPageRaw.keys()].sort((left, right) => left - right);
  orderPageIds.clear();
  pages.forEach((page) => {
    const ids: number[] = [];
    (orderPageRaw.get(page) ?? []).forEach((entry) => {
      const order = mapOrder(entry, productIndex, customerIndex);
      if (!order) return;
      orders.push(order);
      ids.push(order.id);
      events[order.id] = mapTimeline(entry);
    });
    orderPageIds.set(page, ids);
  });
  beginHydration();
  try {
    syncLiveOrders(orders, events);
  } finally {
    endHydration();
  }
}

export function orderIdsForPage(page: number) {
  return orderPageIds.get(page) ?? [];
}

export function applyOrderPage(values: unknown[], pageIndex: number, replace = false) {
  if (replace) orderPageRaw.clear();
  orderPageRaw.set(pageIndex, values);
  publishMappedOrders();
}

function applyCatalog(snapshot: StoreSnapshot) {
  const products = Array.isArray(snapshot.products) ? snapshot.products.map(mapProduct) : [];
  const collectionState = mapCollections(snapshot.collections, products);
  replaceCatalogProducts(products, {
    giftCards: mapGiftCards(snapshot.giftCards),
    collections: collectionState.collections,
    hiddenCollections: collectionState.hidden,
    extraCollections: collectionState.extra,
  });
}

function applyCustomers(snapshot: StoreSnapshot) {
  const customers = Array.isArray(snapshot.customers) ? snapshot.customers.map(mapCustomer) : [];
  replacePeople(customers, Array.isArray(snapshot.customers) ? mapProfiles(customers, snapshot.customers) : {});
}

export function applyCustomerPage(values: unknown[], pageIndex: number, pageSize: number) {
  const customers = values.map((value, index) => mapCustomer(value, pageIndex * pageSize + index));
  beginHydration();
  try {
    mergePeople(customers, mapProfiles(customers, values));
  } finally {
    endHydration();
  }
}

export function linkAdminOrders() {
  publishMappedOrders();
}

function applyDesk(snapshot: StoreSnapshot) {
  const current = getSettings();
  replaceSettings({ policies: normalizePolicies(snapshot.policies), ...mapShipping(snapshot.shipping), logo: current.logo, colors: current.colors });
  const marketing = row(snapshot.marketing);
  const flows = Array.isArray(marketing?.flows) ? marketing.flows.filter((flow): flow is Flow => Boolean(row(flow)?.name)) : [];
  const library = absorbLegacyEmails(flows, parseEmails(marketing?.emails), parseSms(marketing?.sms));
  replaceMarketing({ connected: (row(marketing?.connected) ?? {}) as Record<string, IntegrationState>, flows: library.flows, emails: library.emails, sms: library.sms });
}

export function resetAdminData() {
  orderPageRaw.clear();
  orderPageIds.clear();
  beginHydration();
  try {
    replaceCatalogProducts([]);
    replacePeople([]);
    replaceDiscounts([]);
    syncLiveOrders([], {});
    replaceAbandoned([]);
    replacePosts([]);
    replaceMarketing({ connected: {}, flows: [], emails: [], sms: [] });
  } finally {
    endHydration();
  }
}

export function applyStoreShell(shell: StoreShell) {
  const identity = getStoreIdentity();
  if (identity.storeId !== shell.storeId || identity.name !== shell.name || identity.hostname !== shell.hostname || identity.ownerName !== shell.ownerName || identity.ownerEmail !== shell.ownerEmail) {
    setStoreIdentity({
      storeId: shell.storeId,
      name: shell.name,
      hostname: shell.hostname,
      ownerName: shell.ownerName,
      ownerEmail: shell.ownerEmail,
    });
  }
  setStoreCurrency(shell.currency);
  enableLiveMetrics();
  const current = getSettings();
  const logo = shell.logoUrl || current.logo;
  const colors = shell.brandColors == null ? current.colors : normalizeBrandColors(shell.brandColors);
  if (current.logo === logo && current.colors.length === colors.length && current.colors.every((color, index) => color === colors[index])) return;
  beginHydration();
  try {
    replaceSettings({
      policies: current.policies,
      rules: current.rules,
      profiles: current.profiles,
      estimates: current.estimates,
      localDelivery: current.localDelivery,
      pickup: current.pickup,
      contact: current.contact,
      logo,
      colors,
    });
  } finally {
    endHydration();
  }
}

export function applyAdminSlice(slice: AdminSlice, snapshot: StoreSnapshot) {
  beginHydration();
  try {
    if (slice === "catalog") applyCatalog(snapshot);
    else if (slice === "customers") applyCustomers(snapshot);
    else if (slice === "discounts") replaceDiscounts(Array.isArray(snapshot.discounts) ? snapshot.discounts.map(mapDiscount) : []);
    else if (slice === "checkouts") {
      const checkouts = Array.isArray(snapshot.checkouts) ? snapshot.checkouts.flatMap((entry) => {
        const checkout = mapCheckout(entry);
        return checkout ? [checkout] : [];
      }) : [];
      replaceAbandoned(checkouts);
    } else if (slice === "content") replacePosts(mapPosts(snapshot.posts));
    else if (slice === "desk") applyDesk(snapshot);
    else rememberOrders(snapshot.orders);
  } finally {
    endHydration();
  }
  if (slice === "orders" || slice === "catalog" || slice === "customers") publishMappedOrders();
}

function rememberOrders(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  orderPageRaw.clear();
  for (let index = 0; index < values.length; index += ORDER_PAGE_SIZE) {
    orderPageRaw.set(index / ORDER_PAGE_SIZE, values.slice(index, index + ORDER_PAGE_SIZE));
  }
}
