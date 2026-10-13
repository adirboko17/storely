import { PRODUCTS } from "@/data/mock/products";
import { COLLECTION_SEEDS } from "@/lib/catalog/present";
import type { Product, ProductStatus } from "@/types/commerce";

export type GiftCard = {
  code: string;
  value: number;
  customer: string;
};

export type CollectionCondition = {
  field: "price" | "stock" | "vendor" | "category" | "tag";
  op: string;
  value: string;
};

export type CollectionDraft = {
  title: string;
  description: string;
  ids: number[];
  conditions: CollectionCondition[];
  excludeOutOfStock: boolean;
  image: string;
};

type Snapshot = {
  version: number;
  products: Product[];
  giftCards: GiftCard[];
  collections: Record<string, CollectionDraft>;
  hiddenCollections: string[];
  extraCollections: string[];
};

function cloneProduct(product: Product): Product {
  return {
    ...product,
    tags: [...product.tags],
    collections: [...product.collections],
    option: product.option ? { name: product.option.name, values: [...product.option.values] } : undefined,
    quantities: product.quantities ? [...product.quantities] : undefined,
  };
}

let current: Snapshot = {
  version: 0,
  products: PRODUCTS.map(cloneProduct),
  giftCards: [],
  collections: {},
  hiddenCollections: [],
  extraCollections: [],
};

const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCatalogVersion() {
  return current.version;
}

export function listCatalogProducts() {
  return current.products.map(cloneProduct);
}

export function getCatalogProduct(id: number) {
  const product = current.products.find((item) => item.id === id);
  return product ? cloneProduct(product) : null;
}

export function setProductStatuses(ids: number[], status: ProductStatus) {
  publish({
    ...current,
    products: current.products.map((product) => (ids.includes(product.id) ? { ...product, status } : product)),
  });
}

export function deleteCatalogProducts(ids: number[]) {
  publish({ ...current, products: current.products.filter((product) => !ids.includes(product.id)) });
}

export function saveCatalogProduct(product: Product) {
  const exists = current.products.some((item) => item.id === product.id);
  publish({
    ...current,
    products: exists
      ? current.products.map((item) => (item.id === product.id ? cloneProduct(product) : item))
      : [cloneProduct(product), ...current.products],
  });
}

export function nextProductId() {
  return Math.max(0, ...current.products.map((product) => product.id)) + 1;
}

export function setVariantQuantity(productId: number, index: number, quantity: number) {
  publish({
    ...current,
    products: current.products.map((product) => {
      if (product.id !== productId) return product;
      const quantities = [...(product.quantities ?? [product.stock])];
      quantities[index] = Math.max(0, quantity);
      return { ...product, quantities, stock: quantities.reduce((sum, value) => sum + value, 0) };
    }),
  });
}

export function listGiftCards() {
  return current.giftCards.map((card) => ({ ...card }));
}

export function createGiftCard(card: GiftCard) {
  publish({ ...current, giftCards: [card, ...current.giftCards] });
}

export function listExtraCollections() {
  return [...current.extraCollections];
}

export function listHiddenCollections() {
  return [...current.hiddenCollections];
}

export function getCollectionDraft(key: string) {
  const draft = current.collections[key];
  return draft
    ? {
        ...draft,
        ids: [...draft.ids],
        conditions: draft.conditions.map((condition) => ({ ...condition })),
      }
    : null;
}

export function saveCollectionDraft(key: string, draft: CollectionDraft) {
  const known = COLLECTION_SEEDS.some((seed) => seed.title === key) || current.extraCollections.includes(key);
  const extra = known ? current.extraCollections : [key, ...current.extraCollections];
  publish({
    ...current,
    extraCollections: extra,
    collections: { ...current.collections, [key]: { ...draft, ids: [...draft.ids], conditions: draft.conditions.map((item) => ({ ...item })) } },
  });
}

export function hideCollection(key: string) {
  publish({ ...current, hiddenCollections: current.hiddenCollections.includes(key) ? current.hiddenCollections : [...current.hiddenCollections, key] });
}
