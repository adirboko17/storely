import type { Product, ProductStatus } from "@/types/commerce";

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; background: string; color: string }> = {
  active: { label: "פעיל", background: "#cdfee1", color: "#0c5132" },
  draft: { label: "טיוטה", background: "#e0f0ff", color: "#00527c" },
  archived: { label: "בארכיון", background: "#e3e3e3", color: "#616161" },
};

export type ProductTab = "all" | ProductStatus;

export const PRODUCT_TABS: Array<{ key: ProductTab; label: string }> = [
  { key: "all", label: "הכל" },
  { key: "active", label: "פעיל" },
  { key: "draft", label: "טיוטה" },
  { key: "archived", label: "בארכיון" },
];

export type CollectionSeed = {
  title: string;
  conditions: string[];
  tone: string;
};

export const COLLECTION_SEEDS: CollectionSeed[] = [
  { title: "מוצרים מומלצים (דיוור)", conditions: ["מלאי גדול מ-0", "מחיר גדול מ-₪10.00"], tone: "#2c6ecb" },
  { title: "מטבח ואירוח", conditions: [], tone: "#fff" },
  { title: "טקסטיל לבית", conditions: [], tone: "#fff" },
  { title: "מתנות עד ₪150", conditions: ["מחיר קטן מ-₪150.00"], tone: "#fff" },
  { title: "מתנות לחג", conditions: [], tone: "#fff" },
  { title: "חדש בחנות", conditions: ["נוסף ב-30 הימים האחרונים"], tone: "#fff" },
  { title: "כלי שתייה", conditions: ['קטגוריה שווה ל"כלי שתייה"'], tone: "#fff" },
  { title: "כלי הגשה", conditions: ['קטגוריה שווה ל"כלי הגשה"'], tone: "#fff" },
  { title: "עיצוב הבית", conditions: [], tone: "#fff" },
  { title: "מוצרי פשתן", conditions: ['הכותרת מכילה "פשתן" ועוד 2', 'תגית כוללת "פשתן"'], tone: "#fff" },
  { title: "קרמיקה בעבודת יד", conditions: ['תגית כוללת "קרמיקה"'], tone: "#fff" },
  { title: "סטודיו לבנה", conditions: ['הספק שווה ל"סטודיו לבנה"'], tone: "#fff" },
  { title: "נגריית הכרמל", conditions: ['הספק שווה ל"נגריית הכרמל"'], tone: "#fff" },
  { title: "מבצעי סוף עונה", conditions: [], tone: "#fff" },
];

export function productInSeed(product: Product, title: string) {
  if (title.startsWith("מוצרים מומלצים")) return product.stock > 0 && product.price > 10;
  if (title === "מתנות עד ₪150") return product.price < 150;
  if (title === "חדש בחנות") return product.id > 8;
  if (title === "כלי שתייה" || title === "כלי הגשה" || title === "עיצוב הבית") return product.category === title;
  if (title === "מוצרי פשתן") return product.tags.includes("פשתן");
  if (title === "קרמיקה בעבודת יד") return product.tags.includes("קרמיקה");
  if (title === "סטודיו לבנה" || title === "נגריית הכרמל") return product.vendor === title;
  return product.collections.includes(title);
}

export function inventoryLabel(product: Product) {
  const variations = product.option?.values.length ?? 0;
  const stock = product.stock === 0 ? "אזל מהמלאי" : `${product.stock} במלאי`;
  const extra = variations > 1 ? ` · ${variations} וריאציות` : "";
  const color = product.stock === 0 ? "#8e1f0b" : product.stock < 5 ? "#8a6116" : "#303030";
  return { text: `${stock}${extra}`, color };
}

export function slugifyHandle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .slice(0, 60);
}
