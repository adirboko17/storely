import { PRODUCTS } from "@/data/mock/products";
import { getStoreIdentity } from "@/data/live/store-identity";
import { isHydrating, writeStore } from "@/data/live/write";
import { placeByIds } from "@/lib/catalog/arrange";
import { COLLECTION_SEEDS } from "@/lib/catalog/present";
import { GIFT_AMOUNT_PREFIX, OPEN_GIFT_TAG, packProductTags, subcategoryRules } from "@/lib/catalog/subcategories";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { emptyProductPage, type Product, type ProductStatus, type ProductStory } from "@/types/commerce";

export type GiftCard = {
  code: string;
  value: number;
  customer: string;
  balance?: number;
  expires?: string;
  note?: string;
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
  subcategories: string[];
  manualSort?: boolean;
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
    subcategories: [...(product.subcategories ?? [])],
    media: product.media ? [...product.media] : undefined,
    option: product.option ? { name: product.option.name, values: [...product.option.values] } : undefined,
    options: product.options?.map((option) => ({ name: option.name, values: [...option.values] })),
    quantities: product.quantities ? [...product.quantities] : undefined,
    bundles: product.bundles?.map((bundle) => ({ ...bundle })),
    headline: product.headline ? { ...product.headline } : undefined,
    giftAmounts: product.giftAmounts ? [...product.giftAmounts] : undefined,
    page: product.page
      ? {
          highlights: [...(product.page.highlights ?? [])],
          panels: product.page.panels.map((item) => ({ ...item, links: item.links?.map((link) => ({ ...link })) })),
          stories: product.page.stories.map((item) => ({ ...item })),
          steps: product.page.steps.map((item) => ({ ...item })),
          ingredientsIntro: product.page.ingredientsIntro,
          ingredients: product.page.ingredients.map((item) => ({ ...item })),
          inci: (product.page.inci ?? []).map((item) => ({ ...item })),
          reviews: product.page.reviews.map((item) => ({ ...item })),
          faqs: (product.page.faqs ?? []).map((item) => ({ ...item })),
        }
      : undefined,
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

export function assignProductSubcategory(productId: number, parent: string, subcategory: string, assigned: boolean) {
  const product = current.products.find((item) => item.id === productId);
  if (!product) return;
  const subcategories = new Set((product.subcategories ?? []).map((name) => name.trim()).filter(Boolean));
  if (assigned) subcategories.add(subcategory);
  else subcategories.delete(subcategory);
  const collections = [...product.collections];
  let category = product.category;
  if (assigned && category.trim() !== parent && !collections.includes(parent)) {
    if (!category.trim()) category = parent;
    else collections.push(parent);
  }
  void saveCatalogProduct({ ...cloneProduct(product), category, collections, subcategories: [...subcategories] });
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
    conditions: [...draft.conditions, ...subcategoryRules(draft.subcategories)],
    excludeOutOfStock: draft.excludeOutOfStock,
    image: draft.image,
    hidden,
    ...(draft.manualSort ? { manualSort: true } : {}),
  };
}

function rememberProductSource(localId: number, sourceId: string) {
  publish({
    ...current,
    products: current.products.map((item) => (item.id === localId ? { ...item, sourceId } : item)),
  });
}

const mediaBucket = "product-media";
const pendingMedia = new Map<string, Blob>();
const videoExtensions = new Set(["mp4", "webm", "mov"]);

export function stageProductMedia(key: string, file: Blob) {
  pendingMedia.set(key, file);
}

export function releaseProductMedia(key: string) {
  const file = pendingMedia.get(key);
  pendingMedia.delete(key);
  if (key.startsWith("blob:")) URL.revokeObjectURL(key);
  return file;
}

export function isVideoMedia(value: string) {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(value)) return true;
  return pendingMedia.get(value)?.type.startsWith("video/") ?? false;
}

function mediaExtension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "video/quicktime") return "mov";
  const extension = type.split("/")[1]?.split(";")[0] ?? "";
  return ["png", "webp", "gif", "avif", "mp4", "webm", "mov"].includes(extension) || videoExtensions.has(extension) ? extension : "";
}

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
    const staged = pendingMedia.get(item);
    const blob = staged ?? (item.startsWith("data:image/") || item.startsWith("data:video/") ? await fetch(item).then((response) => response.blob()) : null);
    if (!blob) continue;
    const extension = mediaExtension(blob.type);
    if (!extension) throw new Error("אפשר לשמור תמונות jpg, png, webp, gif, avif או סרטוני mp4, webm ו-mov");
    const path = `${storeId}/${productId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(mediaBucket).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(blob.type.startsWith("video/") ? "העלאת הסרטון נכשלה" : "העלאת התמונה נכשלה");
    pendingMedia.delete(item);
    if (item.startsWith("blob:")) URL.revokeObjectURL(item);
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

async function uploadStoryVideos(storeId: string, productId: string, stories: ProductStory[]) {
  const supabase = createSupabaseBrowserClient();
  const next: ProductStory[] = [];
  const uploaded: { local: string; path: string }[] = [];
  try {
    for (const story of stories) {
      const url = story.url;
      if (!url || /^https:\/\//i.test(url)) {
        next.push(story);
        continue;
      }
      const staged = pendingMedia.get(url);
      const blob = staged ?? (url.startsWith("data:video/") ? await fetch(url).then((response) => response.blob()) : null);
      if (!blob?.type.startsWith("video/")) continue;
      const extension = mediaExtension(blob.type);
      if (!extension || !videoExtensions.has(extension)) throw new Error("אפשר לשמור סרטוני mp4, webm ו-mov");
      const path = `${storeId}/${productId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(mediaBucket).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw new Error("העלאת הסרטון נכשלה");
      uploaded.push({ local: url, path });
      next.push({ ...story, url: publicMediaUrl(path) });
    }
  } catch (error) {
    if (uploaded.length > 0) await supabase.storage.from(mediaBucket).remove(uploaded.map((item) => item.path));
    throw error;
  }
  return { stories: next, uploaded };
}

async function removeStoryVideos(storeId: string, productId: string, previous: ProductStory[], next: ProductStory[]) {
  const kept = new Set(next.map((story) => story.url));
  const stale = previous.flatMap((story) => {
    if (!story.url || kept.has(story.url)) return [];
    const path = storedMediaPath(story.url, storeId, productId);
    return path ? [path] : [];
  });
  if (stale.length === 0) return;
  const supabase = createSupabaseBrowserClient();
  await supabase.storage.from(mediaBucket).remove(stale);
}

async function persistProduct(product: Product, previousStories: ProductStory[] = []) {
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
    product_tags: [
      ...packProductTags(product.tags, product.subcategories ?? []),
      ...(product.giftOpen ? [OPEN_GIFT_TAG] : []),
      ...(product.giftAmounts ?? []).map((amount) => `${GIFT_AMOUNT_PREFIX}${amount}`),
    ],
    product_sku: product.sku,
    product_barcode: product.barcode ?? null,
    product_stock: product.stock,
    variant_title: product.variant,
  });
  if (error || typeof data !== "string" || !data) throw new Error("שמירת המוצר נכשלה");
  const page = product.page ?? emptyProductPage();
  const uploadedStories = await uploadStoryVideos(storeId, data, page.stories ?? []);
  const stories = uploadedStories.stories;
  const nextPage = { ...page, stories };
  const { error: merchError } = await supabase.rpc("save_store_product_merch", {
    target_store: storeId,
    product_id: data,
    merch: {
      bundles: product.bundles ?? [],
      page: nextPage,
      badge: { label: (product.badge ?? "").trim().slice(0, 24), hidden: product.badgeHidden === true },
      headline: product.headline ?? { mode: "single", subtitle: "" },
      seo: {
        title: (product.seoTitle ?? "").trim().slice(0, 70),
        description: (product.seoDescription ?? "").trim().slice(0, 160),
      },
      ...(product.handle ? { handle: product.handle.trim().slice(0, 80) } : {}),
    },
  });
  if (merchError) {
    if (uploadedStories.uploaded.length > 0) await supabase.storage.from(mediaBucket).remove(uploadedStories.uploaded.map((item) => item.path));
    throw new Error(merchError.message?.includes("הכתובת כבר בשימוש") ? "הכתובת כבר בשימוש" : "שמירת הבאנדלים והתוכן לעמוד המוצר נכשלה");
  }
  for (const item of uploadedStories.uploaded) {
    pendingMedia.delete(item.local);
    if (item.local.startsWith("blob:")) URL.revokeObjectURL(item.local);
  }
  await removeStoryVideos(storeId, data, previousStories, stories);
  if (data !== product.sourceId) rememberProductSource(product.id, data);
  const stored = { ...product, sourceId: data, page: nextPage };
  if (product.media) {
    const media = await uploadProductMedia(storeId, data, product.media);
    return { ...stored, media };
  }
  return stored;
}

export function setProductStatuses(ids: number[], status: ProductStatus) {
  const products = current.products.map((product) => (ids.includes(product.id) ? { ...product, status } : product));
  publish({ ...current, products });
  products.filter((product) => ids.includes(product.id)).forEach((product) => {
    void persistProduct(product).catch(() => undefined);
  });
}

export async function deleteCatalogProducts(ids: number[]) {
  const targets = current.products.filter((product) => ids.includes(product.id));
  const sourceIds = targets.flatMap((product) => (product.sourceId ? [product.sourceId] : []));
  if (targets.length === 0) return;
  if (sourceIds.length !== targets.length || !getStoreIdentity().storeId) {
    throw new Error("המחיקה לא נשמרה. רעננו את העמוד ונסו שוב");
  }
  await writeStore("delete_store_products", { product_ids: sourceIds });
  publish({ ...current, products: current.products.filter((product) => !ids.includes(product.id)) });
}

export async function saveCatalogProduct(product: Product) {
  const exists = current.products.some((item) => item.id === product.id);
  const previousStories = current.products.find((item) => item.id === product.id)?.page?.stories ?? [];
  const saved = cloneProduct(product);
  publish({
    ...current,
    products: exists ? current.products.map((item) => (item.id === product.id ? saved : item)) : [saved, ...current.products],
  });
  const stored = await persistProduct(saved, previousStories);
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

export function updateGiftCard(code: string, card: GiftCard) {
  const giftCards = current.giftCards.map((item) => {
    if (item.code !== code) return item;
    const untouched = item.balance == null || item.balance === item.value;
    return { ...item, ...card, balance: untouched ? card.value : Math.min(item.balance ?? card.value, card.value) };
  });
  publish({ ...current, giftCards });
  if (!isHydrating()) void writeStore("save_store_sections", { sections: { gift_cards: giftCards } });
}

export function deleteGiftCard(code: string) {
  const giftCards = current.giftCards.filter((item) => item.code !== code);
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
        subcategories: [...draft.subcategories],
      }
    : null;
}

export async function reorderCatalogProducts(orderedIds: number[]) {
  const sourceIds = orderedIds.flatMap((id) => {
    const product = current.products.find((item) => item.id === id);
    return product?.sourceId ? [product.sourceId] : [];
  });
  if (sourceIds.length !== orderedIds.length) throw new Error("חסר מזהה מוצר");
  await writeStore("reorder_store_products", { product_ids: sourceIds });
  publish({ ...current, products: placeByIds(current.products, orderedIds).map(cloneProduct) });
}

export async function reorderCategoryProducts(key: string, orderedIds: number[]) {
  const existing = current.collections[key];
  const rest = (existing?.ids ?? []).filter((id) => !orderedIds.includes(id));
  const draft: CollectionDraft = {
    title: existing?.title || key,
    description: existing?.description ?? "",
    ids: [...orderedIds, ...rest],
    conditions: existing?.conditions.map((item) => ({ ...item })) ?? [],
    excludeOutOfStock: existing?.excludeOutOfStock ?? false,
    image: existing?.image ?? "",
    subcategories: [...(existing?.subcategories ?? [])],
    manualSort: true,
  };
  const hidden = current.hiddenCollections.includes(key);
  const known = COLLECTION_SEEDS.some((seed) => seed.title === key) || current.extraCollections.includes(key) || Boolean(existing);
  await writeStore("save_store_collection", { collection: collectionPayload(key, draft, hidden) });
  publish({
    ...current,
    extraCollections: hidden || known ? current.extraCollections : [key, ...current.extraCollections],
    collections: { ...current.collections, [key]: draft },
  });
}

export function saveCollectionDraft(key: string, draft: CollectionDraft) {
  const known = COLLECTION_SEEDS.some((seed) => seed.title === key) || current.extraCollections.includes(key);
  const extra = known ? current.extraCollections : [key, ...current.extraCollections];
  const saved = { ...draft, ids: [...draft.ids], conditions: draft.conditions.map((item) => ({ ...item })), subcategories: [...draft.subcategories] };
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
    subcategories: [],
  };
  if (!isHydrating()) void writeStore("save_store_collection", { collection: collectionPayload(key, draft, true) });
}

export function listCategorySubcategories(category: string) {
  return [...(current.collections[category]?.subcategories ?? [])];
}

export function addCategorySubcategory(category: string, name: string) {
  const parent = category.trim();
  const title = name.trim();
  if (!parent || !title) return;
  const existing = getCollectionDraft(parent);
  const currentNames = existing?.subcategories ?? [];
  if (currentNames.some((item) => item.localeCompare(title, "he", { sensitivity: "accent" }) === 0)) return;
  saveCollectionDraft(parent, {
    title: existing?.title || parent,
    description: existing?.description ?? "",
    ids: existing?.ids ?? [],
    conditions: existing?.conditions ?? [],
    excludeOutOfStock: existing?.excludeOutOfStock ?? false,
    image: existing?.image ?? "",
    subcategories: [...currentNames, title],
  });
}

export function removeCategorySubcategory(category: string, name: string) {
  const existing = getCollectionDraft(category);
  if (!existing) return;
  saveCollectionDraft(category, { ...existing, subcategories: existing.subcategories.filter((item) => item !== name) });
}

export function deleteCategorySubcategory(category: string, name: string) {
  const ids = current.products.filter((product) => (product.subcategories ?? []).includes(name)).map((product) => product.id);
  removeCategorySubcategory(category, name);
  ids.forEach((id) => assignProductSubcategory(id, category, name, false));
}
