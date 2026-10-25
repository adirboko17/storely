import { listCatalogProducts } from "@/data/mock/catalog-session";
import { isHydrating, writeStore } from "@/data/live/write";
import { currencySymbol } from "@/lib/formatting/currency";

export type DiscountKind = "order" | "product" | "ship" | "bxgy";
export type BxgyMode = "pair" | "qty" | "cats";

export type Discount = {
  id: number;
  sourceId?: string;
  code: string;
  type: DiscountKind;
  valueType: "pct" | "fixed";
  value: string;
  method: "code" | "auto";
  eligibility: "all" | "seg";
  segment: string;
  minType: "none" | "amount" | "qty";
  minValue: string;
  once: boolean;
  limit: boolean;
  limitN: string;
  start: string;
  hasEnd: boolean;
  end: string;
  uses: number;
  combProduct: boolean;
  combOrder: boolean;
  combShip: boolean;
  combBundle: boolean;
  blockGift: boolean;
  applies: "all" | "colls" | "subs" | "prods";
  collections: string[];
  bxMode: BxgyMode;
  bxBuy: string;
  bxGet: string;
  bxColl: string;
  bxGetColl: string;
  bxBuyIds: string[];
  bxGetIds: string[];
};

export const TODAY = "2026-10-13";

type Snapshot = { version: number; discounts: Discount[] };
let current: Snapshot = { version: 0, discounts: [] };
const listeners = new Set<() => void>();

function copyDiscount(discount: Discount): Discount {
  return {
    ...discount,
    collections: [...discount.collections],
    bxBuyIds: [...(discount.bxBuyIds ?? [])],
    bxGetIds: [...(discount.bxGetIds ?? [])],
  };
}

function publish(discounts: Discount[]) {
  current = { version: current.version + 1, discounts };
  listeners.forEach((listener) => listener());
}

export function subscribeDiscounts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDiscountVersion() {
  return current.version;
}

export function replaceDiscounts(discounts: Discount[]) {
  publish(discounts.map(copyDiscount));
}

export function listDiscounts() {
  return current.discounts.map(copyDiscount);
}

export function getDiscount(id: number) {
  const item = current.discounts.find((discount) => discount.id === id);
  return item ? copyDiscount(item) : null;
}

export function discountStatus(discount: Discount): "active" | "scheduled" | "expired" {
  if (discount.start > TODAY) return "scheduled";
  if (discount.hasEnd && discount.end && discount.end < TODAY) return "expired";
  return "active";
}

function productScopeName(id: string) {
  const matches = listCatalogProducts().filter((item) => item.sourceId === id);
  const product = matches[0];
  if (!product) return "מוצר";
  const title = product.title.trim() || "מוצר";
  const shared = listCatalogProducts().filter((item) => item.title.trim() === product.title.trim()).length > 1;
  return shared && product.variant.trim() ? `${title} · ${product.variant.trim()}` : title;
}

export function discountProductScope(discount: Pick<Discount, "applies" | "collections">) {
  if (discount.applies === "prods") {
    return discount.collections.length ? `המוצרים: ${discount.collections.map(productScopeName).join(", ")}` : "מוצרים ספציפיים";
  }
  if (discount.applies === "subs" && discount.collections.length) return `תתי הקטגוריות: ${discount.collections.join(", ")}`;
  if (discount.applies === "colls" && discount.collections.length) return `הקטגוריות: ${discount.collections.join(", ")}`;
  return "כל המוצרים";
}

export function bxgyDetail(discount: Pick<Discount, "bxMode" | "bxBuy" | "bxGet" | "bxColl" | "bxGetColl" | "bxBuyIds" | "bxGetIds">) {
  const buyIds = discount.bxBuyIds ?? [];
  const getIds = discount.bxGetIds ?? [];
  if (discount.bxMode === "pair") {
    const buy = buyIds[0] ? productScopeName(buyIds[0]) : "מוצר לקנייה";
    const gift = getIds[0] ? productScopeName(getIds[0]) : "מוצר מתנה";
    return [`קונים את ${buy}`, `מקבלים את ${gift} במתנה`];
  }
  if (discount.bxMode === "cats") {
    const lines = [
      `קונים מהקטגוריה ${discount.bxColl.trim() || "—"}`,
      `מתנה מהקטגוריה ${discount.bxGetColl.trim() || "—"}`,
    ];
    if (buyIds.length) lines.push(`מוצרי קנייה: ${buyIds.map(productScopeName).join(", ")}`);
    if (getIds.length) lines.push(`מוצרי מתנה: ${getIds.map(productScopeName).join(", ")}`);
    return lines;
  }
  const name = buyIds[0] ? productScopeName(buyIds[0]) : "המוצר";
  return [`קונים ${discount.bxBuy || "0"} יחידות של ${name}`, `מקבלים ${discount.bxGet || "0"} במתנה`];
}

export function discountSummary(discount: Discount) {
  const value = discount.valueType === "pct" ? `${discount.value || "0"}%` : `${currencySymbol()}${discount.value || "0"}`;
  const head = discount.type === "order"
    ? `${value} הנחה על כל ההזמנה`
    : discount.type === "product"
      ? `${value} הנחה על ${discountProductScope(discount)}`
      : discount.type === "ship"
        ? "משלוח חינם לכל הארץ"
        : bxgyDetail(discount).join(". ");
  const min = discount.minType === "amount" ? `בקנייה מעל ${currencySymbol()}${discount.minValue || "0"}` : discount.minType === "qty" ? `בקנייה של ${discount.minValue || "0"} פריטים לפחות` : "ללא דרישת מינימום";
  return `${head}. ${min}.`;
}

function discountPayload(discount: Discount) {
  return {
    id: discount.sourceId ?? null,
    code: discount.code,
    kind: discount.type,
    valueType: discount.valueType,
    value: Number(discount.value) || 0,
    method: discount.method,
    eligibility: discount.eligibility,
    segment: discount.segment,
    minType: discount.minType,
    minValue: Number(discount.minValue) || 0,
    once: discount.once,
    limit: discount.limit,
    limitN: Number(discount.limitN) || 0,
    start: discount.start,
    hasEnd: discount.hasEnd,
    end: discount.end,
    combProduct: discount.combProduct,
    combOrder: discount.combOrder,
    combShip: discount.combShip,
    combBundle: discount.combBundle,
    blockGift: discount.blockGift,
    applies: discount.applies,
    collections: discount.collections,
    bxMode: discount.bxMode,
    bxBuy: discount.bxBuy,
    bxGet: discount.bxGet,
    bxColl: discount.bxColl,
    bxGetColl: discount.bxGetColl,
    bxBuyIds: discount.bxBuyIds,
    bxGetIds: discount.bxGetIds,
  };
}

function rememberDiscountSource(localId: number, sourceId: string) {
  publish(current.discounts.map((item) => (item.id === localId ? { ...item, sourceId } : item)));
}

export async function saveDiscount(discount: Discount) {
  const next = copyDiscount(discount);
  const exists = current.discounts.some((item) => item.id === next.id);
  publish(exists ? current.discounts.map((item) => (item.id === next.id ? next : item)) : [next, ...current.discounts]);
  if (isHydrating()) return next;
  const saved = await writeStore("save_store_discount", { discount: discountPayload(next) });
  if (typeof saved === "string" && saved !== next.sourceId) rememberDiscountSource(next.id, saved);
  return { ...next, sourceId: typeof saved === "string" ? saved : next.sourceId };
}

export function nextDiscountId() {
  return Math.max(0, ...current.discounts.map((item) => item.id)) + 1;
}

export function removeDiscounts(ids: number[]) {
  const sourceIds = current.discounts.flatMap((item) => (ids.includes(item.id) && item.sourceId ? [item.sourceId] : []));
  publish(current.discounts.filter((item) => !ids.includes(item.id)));
  if (sourceIds.length > 0) void writeStore("delete_store_discounts", { discount_ids: sourceIds });
}

export function deactivateDiscounts(ids: number[]) {
  const next = current.discounts.map((item) => (ids.includes(item.id) ? { ...item, hasEnd: true, end: "2026-10-12" } : item));
  publish(next);
  next.filter((item) => ids.includes(item.id)).forEach((item) => {
    void writeStore("save_store_discount", { discount: discountPayload(item) });
  });
}

export const KIND_LABEL: Record<DiscountKind, string> = {
  order: "הנחה על ההזמנה",
  product: "הנחה על מוצרים",
  ship: "משלוח חינם",
  bxgy: "קנה X קבל Y",
};

export function blankDiscount(type: DiscountKind, id: number): Discount {
  return {
    id, code: "", type, valueType: type === "ship" || type === "bxgy" ? "pct" : "pct", value: type === "ship" ? "100" : "10",
    method: "code", eligibility: "all", segment: "", minType: "none", minValue: "", once: false, limit: false, limitN: "",
    start: TODAY, hasEnd: false, end: "", uses: 0, combProduct: false, combOrder: false, combShip: false, combBundle: false, blockGift: false, applies: "all", collections: [],
    bxMode: "pair", bxBuy: "2", bxGet: "1", bxColl: "", bxGetColl: "", bxBuyIds: [], bxGetIds: [],
  };
}
