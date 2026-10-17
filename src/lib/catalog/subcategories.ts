import type { CollectionCondition } from "@/data/mock/catalog-session";

const subcategoryTagPrefix = "\u0001sub:";
export const OPEN_GIFT_TAG = "\u0001gift:open";
export const GIFT_AMOUNT_PREFIX = "\u0001gift:amt:";
export const OPEN_GIFT_MAX = 2500;

export function giftAmountsFromTags(tags: string[]) {
  const amounts: number[] = [];
  tags.forEach((tag) => {
    if (!tag.startsWith(GIFT_AMOUNT_PREFIX)) return;
    const value = Number(tag.slice(GIFT_AMOUNT_PREFIX.length));
    if (value > 0 && value <= 1_000_000) amounts.push(Math.round(value * 100) / 100);
  });
  return [...new Set(amounts)].sort((a, b) => a - b);
}

export function splitProductTags(tags: string[]) {
  const subcategories: string[] = [];
  const visible: string[] = [];
  tags.forEach((tag) => {
    if (tag.startsWith("\u0001") && !tag.startsWith(subcategoryTagPrefix)) return;
    if (!tag.startsWith(subcategoryTagPrefix)) {
      visible.push(tag);
      return;
    }
    const name = tag.slice(subcategoryTagPrefix.length).trim();
    if (name) subcategories.push(name);
  });
  return { tags: visible, subcategories };
}

export function packProductTags(tags: string[], subcategories: string[]) {
  const visible = tags.filter((tag) => !tag.startsWith(subcategoryTagPrefix));
  const encoded = subcategories.map((name) => name.trim()).filter(Boolean).map((name) => `${subcategoryTagPrefix}${name}`);
  return [...visible, ...encoded];
}

export function splitCollectionRules(rules: Array<{ field?: string; op?: string; value?: string }>) {
  const subcategories: string[] = [];
  const conditions: CollectionCondition[] = [];
  rules.forEach((rule) => {
    if (rule.field === "subcategory") {
      const name = rule.value?.trim() ?? "";
      if (name) subcategories.push(name);
      return;
    }
    if (rule.field !== "price" && rule.field !== "stock" && rule.field !== "vendor" && rule.field !== "category" && rule.field !== "tag") return;
    conditions.push({ field: rule.field, op: rule.op ?? "", value: rule.value ?? "" });
  });
  return { conditions, subcategories };
}

export function subcategoryRules(names: string[]) {
  return names.map((name) => ({ field: "subcategory", op: "is", value: name }));
}
