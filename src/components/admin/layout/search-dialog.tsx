"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { listPosts } from "@/data/mock/content-session";
import { listCatalogProducts } from "@/data/mock/catalog-session";
import { listDiscounts } from "@/data/mock/discount-session";
import { listResolvedOrders } from "@/data/mock/order-session";
import { listPeople } from "@/data/mock/people-session";
import { getStoreIdentity, storefrontHref } from "@/data/live/store-identity";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation/nav";

const RECENT_KEY = "storely.admin.recent-searches";

const FILTERS = [
  { id: "orders", label: "הזמנות" },
  { id: "products", label: "מוצרים" },
  { id: "customers", label: "לקוחות" },
  { id: "discounts", label: "הנחות" },
  { id: "pages", label: "עמודים" },
] as const;

type SearchKind = (typeof FILTERS)[number]["id"];

type SearchHit = {
  id: string;
  kind: SearchKind;
  title: string;
  hint: string;
  href: string;
  haystack: string;
  external?: boolean;
};

const KIND_LABEL: Record<SearchKind, string> = {
  orders: "הזמנות",
  products: "מוצרים",
  customers: "לקוחות",
  discounts: "הנחות",
  pages: "עמודים",
};

function isKind(value: string): value is SearchKind {
  return FILTERS.some((filter) => filter.id === value);
}

function readRecents(): SearchHit[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<SearchHit>;
      if (!row.id || !row.kind || !isKind(row.kind) || !row.title || !row.href) return [];
      return [{ id: row.id, kind: row.kind, title: row.title, hint: row.hint ?? "", href: row.href, haystack: row.title, external: row.external === true }];
    });
  } catch {
    return [];
  }
}

function remember(hit: SearchHit) {
  const next = [hit, ...readRecents().filter((item) => item.href !== hit.href)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

function rank(hit: SearchHit, query: string) {
  const title = hit.title.toLowerCase();
  const extra = hit.haystack.toLowerCase();
  if (title === query || title === `#${query}`) return 0;
  if (title.startsWith(query) || title.startsWith(`#${query}`)) return 1;
  if (title.includes(query)) return 2;
  if (extra.includes(query)) return 3;
  return 9;
}

function buildHits(navItems: NavItem[], storefront: string, showSettings: boolean): SearchHit[] {
  const hits: SearchHit[] = [];
  const keys = new Set(navItems.map((item) => item.key));

  if (keys.has("orders")) for (const order of listResolvedOrders()) {
    hits.push({
      id: `order-${order.id}`,
      kind: "orders",
      title: `#${order.id}`,
      hint: order.customerName,
      href: `/admin/orders/${order.id}`,
      haystack: `${order.id} ${order.customerName} ${order.customer.email} ${order.customer.city}`,
    });
  }

  if (keys.has("products")) for (const product of listCatalogProducts()) {
    hits.push({
      id: `product-${product.id}`,
      kind: "products",
      title: product.title,
      hint: product.sku || product.variant,
      href: `/admin/products/${product.id}`,
      haystack: `${product.title} ${product.sku} ${product.variant} ${product.vendor} ${product.tags.join(" ")}`,
    });
  }

  if (keys.has("products")) {
    const categories = [...new Set(listCatalogProducts().map((product) => product.category.trim()).filter(Boolean))];
    for (const title of categories) {
      hits.push({
        id: `category-${title}`,
        kind: "products",
        title,
        hint: "קטגוריה",
        href: "/admin/products/collections",
        haystack: `${title} קטגוריה`,
      });
    }
  }

  if (keys.has("customers")) for (const person of listPeople()) {
    hits.push({
      id: `customer-${person.id}`,
      kind: "customers",
      title: person.name,
      hint: person.email,
      href: `/admin/customers/${person.id}`,
      haystack: `${person.name} ${person.email} ${person.phone} ${person.city}`,
    });
  }

  if (keys.has("discounts")) for (const discount of listDiscounts()) {
    hits.push({
      id: `discount-${discount.id}`,
      kind: "discounts",
      title: discount.code,
      hint: discount.method === "code" ? "קוד קופון" : "הנחה אוטומטית",
      href: `/admin/discounts/${discount.id}`,
      haystack: `${discount.code} ${discount.segment}`,
    });
  }

  for (const item of navItems) {
    if (item.viewStore) {
      if (!storefront) continue;
      hits.push({
        id: `page-${item.key}`,
        kind: "pages",
        title: item.label,
        hint: "האתר",
        href: storefront,
        haystack: item.label,
        external: true,
      });
      continue;
    }
    hits.push({
      id: `page-${item.key}`,
      kind: "pages",
      title: item.label,
      hint: "עמוד",
      href: item.href,
      haystack: item.label,
    });
    for (const child of item.children ?? []) {
      hits.push({
        id: `page-${child.key}`,
        kind: "pages",
        title: child.label,
        hint: item.label,
        href: child.href,
        haystack: `${child.label} ${item.label}`,
      });
    }
  }

  if (showSettings) hits.push({
    id: "page-settings",
    kind: "pages",
    title: "הגדרות",
    hint: "עמוד",
    href: "/admin/settings",
    haystack: "הגדרות משתמשים",
  });

  if (keys.has("content")) for (const post of listPosts()) {
    hits.push({
      id: `post-${post.id}`,
      kind: "pages",
      title: post.title,
      hint: "פוסט",
      href: `/admin/content/posts/${post.id}`,
      haystack: `${post.title} ${post.excerpt} ${post.tags.join(" ")}`,
    });
  }

  return hits;
}

const searchMotion = `
.search-veil { opacity: 0; transition: opacity 180ms ease; }
.search-panel {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transform-origin: top center;
  transition: opacity 180ms ease, transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.search-veil[data-open="true"] { opacity: 1; }
.search-panel[data-open="true"] { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .search-veil, .search-panel { transition: none; }
}
`;

export function SearchDialog({ navItems, showSettings }: { navItems: NavItem[]; showSettings: boolean }) {
  const router = useRouter();
  const { searchOpen, closeSearch } = useAdmin();
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchKind | null>(null);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<SearchHit[]>(() => readRecents());
  const hits = useMemo(() => buildHits(navItems, storefrontHref(getStoreIdentity().hostname), showSettings), [navItems, showSettings]);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    const pool = filter ? hits.filter((hit) => hit.kind === filter) : hits;
    if (!trimmed) return filter ? pool.slice(0, 8) : [];
    return pool
      .map((hit) => ({ hit, score: rank(hit, trimmed) }))
      .filter((item) => item.score < 9)
      .sort((a, b) => a.score - b.score || a.hit.title.localeCompare(b.hit.title, "he"))
      .slice(0, 8)
      .map((item) => item.hit);
  }, [hits, filter, trimmed]);

  const showingRecents = !trimmed && !filter;
  const rows = showingRecents ? recents : results;

  useEffect(() => {
    if (!searchOpen) return;
    setPresent(true);
    setQuery("");
    setFilter(null);
    setActive(0);
    setRecents(readRecents());
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen || !present) return;
    setShown(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPresent(false), reduce ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [searchOpen, present]);

  useEffect(() => {
    if (!searchOpen || !present) return;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [searchOpen, present]);

  useEffect(() => {
    if (!shown) return;
    document.getElementById("admin-command-search")?.focus();
  }, [shown]);

  useEffect(() => {
    setActive(0);
  }, [trimmed, filter]);

  useEffect(() => {
    document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  function openHit(hit: SearchHit) {
    setRecents(remember(hit));
    closeSearch();
    if (hit.external) {
      window.open(hit.href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = rows[active];
      if (hit) openHit(hit);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  }

  if (!present) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <style>{searchMotion}</style>
      <div data-open={shown} className="search-veil absolute inset-0 bg-black/45" onMouseDown={closeSearch} />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[11vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש"
        data-open={shown}
        className="search-panel pointer-events-auto flex h-[min(520px,78vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-[0_24px_48px_rgba(0,0,0,.28),0_0_0_1px_rgba(0,0,0,.08)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[#ebebeb] px-4">
          <Icon name="search" size={18} strokeWidth={1.8} className="shrink-0 text-[#616161]" />
          <input
            id="admin-command-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש"
            autoComplete="off"
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-[#303030] shadow-none outline-none placeholder:text-[#8a8a8a]"
            style={{ outline: "none", boxShadow: "none", backgroundColor: "transparent", color: "#303030" }}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[#ebebeb] px-4 py-3">
          {FILTERS.map((item) => {
            const selected = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(selected ? null : item.id)}
                className={cn(
                  "h-7 rounded-full border px-2.5 text-[13px]",
                  selected ? "border-[#303030] bg-[#f1f1f1] font-semibold" : "border-[#c9c9c9] bg-white hover:bg-[#f7f7f7]",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {showingRecents && recents.length ? (
            <div className="flex items-center px-2 pt-1 pb-1.5">
              <span className="flex-1 text-[13px] font-semibold text-[#616161]">חיפושים אחרונים</span>
              <button
                type="button"
                className="text-[13px] font-medium text-[#005bd3] hover:underline"
                onClick={() => {
                  localStorage.removeItem(RECENT_KEY);
                  setRecents([]);
                }}
              >
                ניקוי היסטוריה
              </button>
            </div>
          ) : null}

          {rows.length ? (
            rows.map((hit, index) => (
              <button
                key={`${hit.kind}-${hit.href}`}
                id={`search-hit-${index}`}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => openHit(hit)}
                className={cn(
                  "flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-start",
                  index === active ? "bg-[#f1f1f1]" : "hover:bg-[#f6f6f6]",
                )}
              >
                <Icon name={showingRecents ? "clock" : "search"} size={16} strokeWidth={1.8} className="shrink-0 text-[#8a8a8a]" />
                <span className="shrink-0 rounded-md border border-[#e3e3e3] bg-white px-1.5 py-0.5 text-xs text-[#616161]">
                  {KIND_LABEL[hit.kind]}
                </span>
                <span className="min-w-0 truncate text-sm">{hit.title}</span>
                {hit.hint ? <span className="ms-auto max-w-[42%] truncate text-[13px] text-[#8a8a8a]">{hit.hint}</span> : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-[#8a8a8a]">
              {trimmed ? "אין תוצאות לחיפוש הזה" : filter ? "אין פריטים בקטגוריה הזו" : "הקלידו כדי לחפש הזמנות, מוצרים ולקוחות"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ebebeb] px-4 py-2.5 text-[13px] text-[#616161]">
          <span>פתיחה</span>
          <kbd className="grid h-5 min-w-5 place-items-center rounded-md border border-[#e3e3e3] bg-[#f7f7f7] px-1 text-xs text-[#303030]">↵</kbd>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
