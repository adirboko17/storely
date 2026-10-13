"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { listPosts } from "@/data/mock/content-session";
import {
  getCollectionDraft,
  listCatalogProducts,
  listExtraCollections,
  listHiddenCollections,
} from "@/data/mock/catalog-session";
import { listDiscounts } from "@/data/mock/discount-session";
import { listResolvedOrders } from "@/data/mock/order-session";
import { listPeople } from "@/data/mock/people-session";
import { COLLECTION_SEEDS } from "@/lib/catalog/present";
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
      return [{ id: row.id, kind: row.kind, title: row.title, hint: row.hint ?? "", href: row.href, haystack: row.title }];
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

function buildHits(navItems: NavItem[]): SearchHit[] {
  const hits: SearchHit[] = [];

  for (const order of listResolvedOrders()) {
    hits.push({
      id: `order-${order.id}`,
      kind: "orders",
      title: `#${order.id}`,
      hint: order.customerName,
      href: `/admin/orders/${order.id}`,
      haystack: `${order.id} ${order.customerName} ${order.customer.email} ${order.customer.city}`,
    });
  }

  for (const product of listCatalogProducts()) {
    hits.push({
      id: `product-${product.id}`,
      kind: "products",
      title: product.title,
      hint: product.sku || product.variant,
      href: `/admin/products/${product.id}`,
      haystack: `${product.title} ${product.sku} ${product.variant} ${product.vendor} ${product.tags.join(" ")}`,
    });
  }

  const hidden = new Set(listHiddenCollections());
  const collectionKeys = [...listExtraCollections(), ...COLLECTION_SEEDS.map((seed) => seed.title)].filter(
    (key, index, all) => all.indexOf(key) === index && !hidden.has(key),
  );
  for (const key of collectionKeys) {
    const title = getCollectionDraft(key)?.title || key;
    hits.push({
      id: `collection-${key}`,
      kind: "products",
      title,
      hint: "אוסף",
      href: `/admin/products/collections/${encodeURIComponent(key)}`,
      haystack: `${title} אוסף`,
    });
  }

  for (const person of listPeople()) {
    hits.push({
      id: `customer-${person.id}`,
      kind: "customers",
      title: person.name,
      hint: person.email,
      href: `/admin/customers/${person.id}`,
      haystack: `${person.name} ${person.email} ${person.phone} ${person.city}`,
    });
  }

  for (const discount of listDiscounts()) {
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

  hits.push({
    id: "page-settings",
    kind: "pages",
    title: "הגדרות",
    hint: "עמוד",
    href: "/admin/settings",
    haystack: "הגדרות",
  });

  for (const post of listPosts()) {
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

export function SearchDialog({ navItems }: { navItems: NavItem[] }) {
  const router = useRouter();
  const { closeSearch } = useAdmin();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchKind | null>(null);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<SearchHit[]>(() => readRecents());
  const hits = useMemo(() => buildHits(navItems), [navItems]);

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
    document.getElementById("admin-command-search")?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [trimmed, filter]);

  useEffect(() => {
    document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  function openHit(hit: SearchHit) {
    setRecents(remember(hit));
    closeSearch();
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

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 px-4 pt-[11vh]" onMouseDown={closeSearch}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש"
        className="flex h-[min(520px,78vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white text-ink shadow-[0_24px_48px_rgba(0,0,0,.28),0_0_0_1px_rgba(0,0,0,.08)]"
        onMouseDown={(event) => event.stopPropagation()}
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
    </div>,
    document.body,
  );
}
