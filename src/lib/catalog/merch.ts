import { emptyProductPage, type ProductBundle, type ProductFaq, type ProductFaqTag, type ProductHeadline, type ProductInci, type ProductIngredient, type ProductPage, type ProductPanel, type ProductPanelLink, type ProductReview, type ProductStep, type ProductStory } from "@/types/commerce";

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
    headline: parseHeadline(row?.headline),
    seoTitle: text(record(row?.seo)?.title).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 70),
    seoDescription: text(record(row?.seo)?.description).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160),
  };
}

export function parseHeadline(value: unknown): ProductHeadline {
  const row = record(value);
  return {
    mode: row?.mode === "split" ? "split" : "single",
    subtitle: text(row?.subtitle).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120),
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
    const image = bundleImage(row?.image);
    bundles.push({ qty, price: Math.round(price * 100) / 100, label, ...(image ? { image } : {}) });
  }
  return bundles.sort((a, b) => a.qty - b.qty);
}

export function parsePage(value: unknown): ProductPage {
  const row = record(value);
  const page = emptyProductPage();
  if (!row) return page;
  page.highlights = highlightList(row.highlights);
  page.panels = list(row.panels, 8).flatMap((item) => {
    const title = text(item.title).slice(0, 80);
    const body = text(item.body).slice(0, 4000);
    const links = panelLinks(item);
    const align = item.align === "left" ? "left" : undefined;
    return title && body ? [{ title, body, ...(align ? { align } : {}), ...(links.length ? { links } : {}) } satisfies ProductPanel] : [];
  });
  page.stories = list(row.stories, 20).flatMap((item) => {
    const handle = text(item.handle).slice(0, 80);
    const url = storyUrl(text(item.url));
    return handle || url ? [{ handle, url } satisfies ProductStory] : [];
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
  page.inci = list(row.inci, 60).flatMap((item) => {
    const inci = text(item.inci).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
    const he = text(item.he).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
    if (!inci) return [];
    return [{ inci, he, ...(item.key === true ? { key: true } : {}) } satisfies ProductInci];
  });
  page.reviews = list(row.reviews, 80).flatMap((item) => {
    const name = text(item.name).slice(0, 80);
    const body = text(item.body).slice(0, 1000);
    if (!name || !body) return [];
    return [{
      name,
      title: text(item.title).slice(0, 120),
      body,
      date: text(item.date).slice(0, 40),
      rating: starRating(item.rating),
      verified: item.verified === true,
    } satisfies ProductReview];
  });
  page.faqs = list(row.faqs, 20).flatMap((item) => {
    const q = text(item.q).slice(0, 180);
    const a = text(item.a).slice(0, 1000);
    const tag = faqTag(text(item.tag));
    return q && a && tag ? [{ q, a, tag } satisfies ProductFaq] : [];
  });
  return page;
}

function starRating(value: unknown) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 5;
}

function faqTag(value: string): ProductFaqTag | null {
  return value === "use" || value === "ing" || value === "post" || value === "buy" ? value : null;
}

function highlightList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const highlights: string[] = [];
  for (const item of value) {
    const label = text(item).replace(/[\u0000-\u001f]/g, "").slice(0, 40);
    const key = label.toLocaleLowerCase("he");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    highlights.push(label);
    if (highlights.length === 4) break;
  }
  return highlights;
}

function list(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => {
    const row = record(item);
    return row ? [row] : [];
  });
}

function panelLinks(item: Record<string, unknown>): ProductPanelLink[] {
  const listed = Array.isArray(item.links) ? item.links.flatMap((entry) => {
    const link = panelLink(entry);
    return link ? [link] : [];
  }) : [];
  const legacy = panelLink(item.link);
  const source = listed.length ? listed : legacy ? [legacy] : [];
  const seen = new Set<string>();
  const links: ProductPanelLink[] = [];
  for (const link of source) {
    const key = `${link.kind}:${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
    if (links.length === 6) break;
  }
  return links;
}

function panelLink(value: unknown): ProductPanelLink | null {
  const row = record(value);
  if (!row) return null;
  const label = text(row.label).replace(/[\u0000-\u001f]/g, "").slice(0, 120);
  const href = text(row.href).replace(/[\u0000-\u001f]/g, "").slice(0, 300);
  if (!label || !href || href.includes("..")) return null;
  if (row.kind === "article" && /^\/articles\/[a-z0-9-]+$/.test(href)) return { kind: "article", label, href };
  if (row.kind === "url" && (/^https:\/\/\S+$/i.test(href) || /^\/[^/\s]/.test(href))) return { kind: "url", label, href };
  return null;
}

function bundleImage(value: unknown) {
  const url = text(value).slice(0, 500);
  if (!url || url.includes("..")) return "";
  const path = url.split("?")[0] ?? "";
  if (/^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/product-media\/[a-z0-9._/-]+\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return path;
  if (url.startsWith("blob:") || url.startsWith("data:image/")) return url;
  return "";
}

function storyUrl(value: string) {
  const url = value.trim().slice(0, 500);
  if (!url || url.includes("..")) return "";
  if (/^https:\/\/([a-z0-9-]+\.)*instagram\.com\/\S+$/i.test(url)) return url.slice(0, 300);
  if (/^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/product-media\/[a-z0-9._/-]+\.(mp4|webm|mov)$/i.test(url.split("?")[0] ?? "")) return (url.split("?")[0] ?? "").slice(0, 500);
  if (url.startsWith("blob:") || url.startsWith("data:video/")) return url;
  return "";
}
