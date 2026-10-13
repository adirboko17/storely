export type DiscountKind = "order" | "product" | "ship" | "bxgy";

export type Discount = {
  id: number;
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
  applies: "all" | "colls";
  collections: string[];
  bxBuy: string;
  bxGet: string;
  bxColl: string;
};

export const TODAY = "2026-10-13";

type Snapshot = { version: number; discounts: Discount[] };
let current: Snapshot = { version: 0, discounts: [] };
const listeners = new Set<() => void>();

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
  publish(discounts.map((item) => ({ ...item, collections: [...item.collections] })));
}

export function listDiscounts() {
  return current.discounts.map((item) => ({ ...item, collections: [...item.collections] }));
}

export function getDiscount(id: number) {
  const item = current.discounts.find((discount) => discount.id === id);
  return item ? { ...item, collections: [...item.collections] } : null;
}

export function discountStatus(discount: Discount): "active" | "scheduled" | "expired" {
  if (discount.start > TODAY) return "scheduled";
  if (discount.hasEnd && discount.end && discount.end < TODAY) return "expired";
  return "active";
}

export function discountSummary(discount: Discount) {
  const value = discount.valueType === "pct" ? `${discount.value || "0"}%` : `₪${discount.value || "0"}`;
  const head = discount.type === "order"
    ? `${value} הנחה על כל ההזמנה`
    : discount.type === "product"
      ? `${value} הנחה על ${discount.applies === "colls" && discount.collections.length ? `האוספים: ${discount.collections.join(", ")}` : "כל המוצרים"}`
      : discount.type === "ship"
        ? "משלוח חינם לכל הארץ"
        : `קנו ${discount.bxBuy} מ"${discount.bxColl}", קבלו ${discount.bxGet} בחינם`;
  const min = discount.minType === "amount" ? `בקנייה מעל ₪${discount.minValue || "0"}` : discount.minType === "qty" ? `בקנייה של ${discount.minValue || "0"} פריטים לפחות` : "ללא דרישת מינימום";
  return `${head}. ${min}.`;
}

export function saveDiscount(discount: Discount) {
  const exists = current.discounts.some((item) => item.id === discount.id);
  publish(exists ? current.discounts.map((item) => (item.id === discount.id ? discount : item)) : [discount, ...current.discounts]);
}

export function nextDiscountId() {
  return Math.max(0, ...current.discounts.map((item) => item.id)) + 1;
}

export function removeDiscounts(ids: number[]) {
  publish(current.discounts.filter((item) => !ids.includes(item.id)));
}

export function deactivateDiscounts(ids: number[]) {
  publish(current.discounts.map((item) => (ids.includes(item.id) ? { ...item, hasEnd: true, end: "2026-10-12" } : item)));
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
    start: TODAY, hasEnd: false, end: "", uses: 0, combProduct: false, combOrder: false, combShip: false, applies: "all", collections: [],
    bxBuy: "2", bxGet: "1", bxColl: "",
  };
}
