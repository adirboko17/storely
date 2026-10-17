import { emptyProductPage, type ProductBundle, type ProductIngredient, type ProductPage, type ProductPanel, type ProductReview, type ProductStep, type ProductStory } from "@/types/commerce";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseProductMerch(value: unknown) {
  const row = record(value);
  const badge = record(row?.badge);
  return {
    bundles: parseBundles(row?.bundles),
    page: parsePage(row?.page),
    badge: text(badge?.label).slice(0, 24),
    badgeHidden: badge?.hidden === true,
  };
}

export function parseBundles(value: unknown): ProductBundle[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const bundles: ProductBundle[] = [];
  for (const item of value) {
    const row = record(item);
    const qty = Number(row?.qty);
    const price = Number(row?.price);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || !Number.isFinite(price) || price < 0 || price > 1_000_000) continue;
    if (seen.has(qty)) continue;
    seen.add(qty);
    const label = text(row?.label).slice(0, 80) || `קנה ${qty}`;
    bundles.push({ qty, price: Math.round(price * 100) / 100, label });
  }
  return bundles.sort((a, b) => a.qty - b.qty);
}

export function parsePage(value: unknown): ProductPage {
  const row = record(value);
  const page = emptyProductPage();
  if (!row) return page;
  page.panels = list(row.panels, 8).flatMap((item) => {
    const title = text(item.title).slice(0, 80);
    const body = text(item.body).slice(0, 4000);
    return title && body ? [{ title, body } satisfies ProductPanel] : [];
  });
  page.stories = list(row.stories, 20).flatMap((item) => {
    const handle = text(item.handle).slice(0, 80);
    const url = instagramUrl(text(item.url));
    return handle ? [{ handle, url } satisfies ProductStory] : [];
  });
  page.steps = list(row.steps, 8).flatMap((item) => {
    const title = text(item.title).slice(0, 80);
    const body = text(item.body).slice(0, 500);
    return title && body ? [{ title, body } satisfies ProductStep] : [];
  });
  page.ingredientsIntro = text(row.ingredientsIntro).slice(0, 300);
  page.ingredients = list(row.ingredients, 12).flatMap((item) => {
    const en = text(item.en).slice(0, 40);
    const he = text(item.he).slice(0, 40);
    const body = text(item.body).slice(0, 500);
    return (en || he) && body ? [{ en, he, body } satisfies ProductIngredient] : [];
  });
  page.reviews = list(row.reviews, 30).flatMap((item) => {
    const name = text(item.name).slice(0, 80);
    const body = text(item.body).slice(0, 1000);
    if (!name || !body) return [];
    return [{
      name,
      title: text(item.title).slice(0, 120),
      body,
      date: text(item.date).slice(0, 40),
      verified: item.verified === true,
    } satisfies ProductReview];
  });
  return page;
}

function list(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => {
    const row = record(item);
    return row ? [row] : [];
  });
}

function instagramUrl(value: string) {
  return /^https:\/\/([a-z0-9-]+\.)*instagram\.com\/\S+$/i.test(value) ? value.slice(0, 300) : "";
}
