import { PRODUCTS } from "@/data/mock/products";
import { getStoreIdentity } from "@/data/live/store-identity";
import { isHydrating, writeStore } from "@/data/live/write";
import { COLLECTION_SEEDS } from "@/lib/catalog/present";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Product, ProductStatus } from "@/types/commerce";

export type GiftCard = {
  code: string;
  value: number;
  customer: string;
  balance?: number;
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
    media: product.media ? [...product.media] : undefined,
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
  PRODUCTS.splice(0, PRODUCTS.length, ...current.products.map(cloneProduct));
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

export function replaceCatalogProducts(
  products: Product[],
  extras?: {
    giftCards?: GiftCard[];
    collections?: Record<string, CollectionDraft>;
    hiddenCollections?: string[];
    extraCollections?: string[];
  },
) {
  const next = products.map(cloneProduct);
  publish({
    ...current,
    products: next,
    giftCards: extras?.giftCards ?? [],
    collections: extras?.collections ?? {},
    hiddenCollections: extras?.hiddenCollections ?? [],
    extraCollections: extras?.extraCollections ?? [],
  });
}

function collectionPayload(key: string, draft: CollectionDraft, hidden: boolean) {
  const productIds = draft.ids.flatMap((id) => {
    const product = current.products.find((item) => item.id === id);
    return product?.sourceId ? [product.sourceId] : [];
  });
  return {
    title: draft.title || key,
    description: draft.description,
    productIds,
    conditions: draft.conditions,
    excludeOutOfStock: draft.excludeOutOfStock,
    image: draft.image,
    hidden,
  };
}

function rememberProductSource(localId: number, sourceId: string) {
  publish({
    ...current,
    products: current.products.map((item) => (item.id === localId ? { ...item, sourceId } : item)),
  });
}

const mediaBucket = "product-media";

function publicMediaUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${mediaBucket}/${path}`;
}

function storedMediaPath(value: string, storeId: string, productId: string) {
  const marker = `/storage/v1/object/public/${mediaBucket}/`;
  const index = value.indexOf(marker);
  const path = index >= 0 ? decodeURIComponent(value.slice(index + marker.length).split("?")[0] ?? "") : value;
  const prefix = `${storeId}/${productId}/`;
  return path.startsWith(prefix) ? path : null;
}

async function uploadProductMedia(storeId: string, productId: string, media: string[]) {
  const supabase = createSupabaseBrowserClient();
  const paths: string[] = [];
  for (const item of media) {
    const existing = storedMediaPath(item, storeId, productId);
    if (existing) {
      paths.push(existing);
      continue;
    }
    if (/^https:\/\//i.test(item)) {
      paths.push(item);
      continue;
    }
    if (!item.startsWith("data:image/")) continue;
    const blob = await fetch(item).then((response) => response.blob());
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
    if (!extension || !["jpg", "png", "webp", "gif", "avif"].includes(extension)) {
      throw new Error("אפשר לשמור רק תמונות jpg, png, webp, gif או avif");
    }
    const path = `${storeId}/${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(mediaBucket).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error("העלאת התמונה נכשלה");
    paths.push(path);
  }
  const { data: removed, error } = await supabase.rpc("save_store_product_media", {
    target_store: storeId,
    product_id: productId,
    media_paths: paths,
  });
  if (error) throw new Error("שמירת התמונות נכשלה");
  const stale = Array.isArray(removed) ? removed.filter((path): path is string => typeof path === "string" && !path.startsWith("http")) : [];
  if (stale.length > 0) await supabase.storage.from(mediaBucket).remove(stale);
  return paths.map(publicMediaUrl);
}

async function persistProduct(product: Product) {
  if (typeof window === "undefined") return null;
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_store_product", {
    target_store: storeId,
    product_id: product.sourceId ?? null,
    product_title: product.title,
    product_status: product.status,
    product_price: product.price,
    product_compare: product.compareAt ?? null,
    product_cost: product.cost,
    product_vendor: product.vendor,
    product_category: product.category,
    product_description: product.description ?? "",
    product_tags: product.tags,
    product_sku: product.sku,
    product_barcode: product.barcode ?? null,
    product_stock: product.stock,
    variant_title: product.variant,
  });
  if (error || typeof data !== "string" || !data) throw new Error("שמירת המוצר נכשלה");
  if (data !== product.sourceId) rememberProductSource(product.id, data);
  if (product.media) {
    const media = await uploadProductMedia(storeId, data, product.media);
    return { ...product, sourceId: data, media };
  }
  return { ...product, sourceId: data };
}

export function setProductStatuses(ids: number[], status: ProductStatus) {
  const products = current.products.map((product) => (ids.includes(product.id) ? { ...product, status } : product));
  publish({ ...current, products });
  products.filter((product) => ids.includes(product.id)).forEach((product) => {
    void persistProduct(product).catch(() => undefined);
  });
}

export function deleteCatalogProducts(ids: number[]) {
  const sourceIds = current.products.flatMap((product) => (ids.includes(product.id) && product.sourceId ? [product.sourceId] : []));
  publish({ ...current, products: current.products.filter((product) => !ids.includes(product.id)) });
  if (typeof window === "undefined" || sourceIds.length === 0) return;
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return;
  const supabase = createSupabaseBrowserClient();
  void supabase.rpc("delete_store_products", { target_store: storeId, product_ids: sourceIds });
}

export async function saveCatalogProduct(product: Product) {
  const exists = current.products.some((item) => item.id === product.id);
  const saved = cloneProduct(product);
  publish({
    ...current,
    products: exists ? current.products.map((item) => (item.id === product.id ? saved : item)) : [saved, ...current.products],
  });
  const stored = await persistProduct(saved);
  if (!stored) return saved;
  publish({
    ...current,
    products: current.products.map((item) => (item.id === stored.id ? cloneProduct(stored) : item)),
  });
  return stored;
}

export function nextProductId() {
  return Math.max(0, ...current.products.map((product) => product.id)) + 1;
}

export function setVariantQuantity(productId: number, index: number, quantity: number) {
  const products = current.products.map((product) => {
    if (product.id !== productId) return product;
    const quantities = [...(product.quantities ?? [product.stock])];
    quantities[index] = Math.max(0, quantity);
    return { ...product, quantities, stock: quantities.reduce((sum, value) => sum + value, 0) };
  });
  publish({ ...current, products });
  const product = products.find((item) => item.id === productId);
  if (product) void persistProduct(product).catch(() => undefined);
}

export function listGiftCards() {
  return current.giftCards.map((card) => ({ ...card }));
}

export function createGiftCard(card: GiftCard) {
  const giftCards = [{ ...card, balance: card.value }, ...current.giftCards];
  publish({ ...current, giftCards });
  if (!isHydrating()) void writeStore("save_store_sections", { sections: { gift_cards: giftCards } });
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
  const saved = { ...draft, ids: [...draft.ids], conditions: draft.conditions.map((item) => ({ ...item })) };
  publish({
    ...current,
    extraCollections: extra,
    hiddenCollections: current.hiddenCollections.filter((item) => item !== key),
    collections: { ...current.collections, [key]: saved },
  });
  if (!isHydrating()) void writeStore("save_store_collection", { collection: collectionPayload(key, saved, false) });
}

export function hideCollection(key: string) {
  const hiddenCollections = current.hiddenCollections.includes(key) ? current.hiddenCollections : [...current.hiddenCollections, key];
  publish({ ...current, hiddenCollections });
  const draft = current.collections[key] ?? {
    title: key,
    description: "",
    ids: [],
    conditions: [],
    excludeOutOfStock: false,
    image: "",
  };
  if (!isHydrating()) void writeStore("save_store_collection", { collection: collectionPayload(key, draft, true) });
}
