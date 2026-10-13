import { replaceCatalogProducts } from "@/data/mock/catalog-session";
import { blankDiscount, replaceDiscounts, type Discount } from "@/data/mock/discount-session";
import { replacePeople } from "@/data/mock/people-session";
import { claimStore, setStoreIdentity } from "@/data/live/store-identity";
import { enableLiveMetrics } from "@/lib/dashboard/chart";
import type { Customer, Product, ProductStatus } from "@/types/commerce";

export type StoreSnapshot = {
  name?: unknown;
  hostname?: unknown;
  ownerName?: unknown;
  ownerEmail?: unknown;
  products?: unknown;
  customers?: unknown;
  discounts?: unknown;
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
  const tags = Array.isArray(item?.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];
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

function mapDiscount(value: unknown, index: number): Discount {
  const item = row(value);
  const discount = blankDiscount("order", index + 1);
  return { ...discount, code: text(item?.code) || text(item?.title), value: "0" };
}

export function applyStoreSnapshot(storeId: string, snapshot: StoreSnapshot) {
  const mark = [snapshot.name, snapshot.ownerName, snapshot.ownerEmail, snapshot.hostname].map(text).join("|");
  if (!claimStore(storeId, mark)) return;
  const products = Array.isArray(snapshot.products) ? snapshot.products.map(mapProduct) : [];
  const customers = Array.isArray(snapshot.customers) ? snapshot.customers.map(mapCustomer) : [];
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts.map(mapDiscount) : [];
  replaceCatalogProducts(products);
  replacePeople(customers);
  replaceDiscounts(discounts);
  enableLiveMetrics();
  setStoreIdentity({
    storeId,
    name: text(snapshot.name),
    hostname: text(snapshot.hostname),
    ownerName: text(snapshot.ownerName),
    ownerEmail: text(snapshot.ownerEmail),
  });
}
