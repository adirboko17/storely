"use client";

import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import {
  getCatalogVersion,
  getCollectionDraft,
  isVideoMedia,
  listCatalogProducts,
  listExtraCollections,
  reorderCatalogProducts,
  reorderCategoryProducts,
  subscribeCatalog,
} from "@/data/mock/catalog-session";
import { moveItem, orderMatching } from "@/lib/catalog/arrange";
import { currencySymbol } from "@/lib/formatting/currency";
import type { Product } from "@/types/commerce";

const field = "h-[34px] min-w-[220px] rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm outline-none";

function productImage(product: Product) {
  return product.media?.find((item) => item && !isVideoMedia(item)) ?? "";
}

function productSubtitle(product: Product) {
  const subtitle = product.headline?.mode === "split" ? product.headline.subtitle.trim() : "";
  if (subtitle) return subtitle;
  return product.description?.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function cardPrice(value: number) {
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
  return `${currencySymbol()}${amount}`;
}

function productBadges(product: Product) {
  if (product.badgeHidden) return [];
  const labels: string[] = [];
  const custom = product.badge?.trim() ?? "";
  if (custom) labels.push(custom);
  if (product.compareAt != null && product.compareAt > product.price && !labels.includes("מבצע")) labels.push("מבצע");
  return labels;
}

function categoryNames(products: Product[]) {
  const names = new Set<string>();
  products.forEach((product) => {
    if (product.status !== "active") return;
    const title = product.category.trim();
    if (title) names.add(title);
  });
  listExtraCollections().forEach((title) => {
    if (title.trim()) names.add(title.trim());
  });
  return [...names].sort((a, b) => a.localeCompare(b, "he"));
}

function visibleProducts(products: Product[], scope: string) {
  const active = products.filter((product) => product.status === "active");
  if (scope === "all") return active;
  const draft = getCollectionDraft(scope);
  const ids = draft?.ids ?? [];
  const matched = active.filter((product) => product.category.trim() === scope || ids.includes(product.id));
  return draft?.manualSort ? orderMatching(matched, ids) : matched;
}

export function ProductArrangeScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const products = listCatalogProducts();
  const categories = categoryNames(products);
  const [scope, setScope] = useState("all");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [preview, setPreview] = useState<Product[] | null>(null);
  const [saving, setSaving] = useState(false);
  const items = preview ?? visibleProducts(products, categories.includes(scope) || scope === "all" ? scope : "all");

  async function commit(next: Product[]) {
    setSaving(true);
    try {
      const ids = next.map((product) => product.id);
      if (scope === "all") await reorderCatalogProducts(ids);
      else await reorderCategoryProducts(scope, ids);
      setPreview(null);
      toast("הסידור נשמר בחנות");
    } catch {
      setPreview(null);
      toast("לא הצלחנו לשמור את הסידור");
    } finally {
      setSaving(false);
      setDragFrom(null);
      setOver(null);
    }
  }

  function dropAt(index: number) {
    if (dragFrom == null || saving) return;
    const next = moveItem(items, dragFrom, index);
    setDragFrom(null);
    setOver(null);
    if (next === items) return;
    setPreview(next);
    setSaving(true);
    void commit(next);
  }

  return (
    <div className="mx-3 mt-2 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <label className="flex items-center gap-2 text-sm font-semibold">
          תצוגה
          <select
            value={categories.includes(scope) || scope === "all" ? scope : "all"}
            disabled={saving}
            onChange={(event) => {
              setPreview(null);
              setScope(event.target.value);
            }}
            className={field}
          >
            <option value="all">כל המוצרים</option>
            {categories.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <p className="m-0 text-[13px] text-[#616161]">ארבעה מוצרים בשורה, כמו בחנות. גררו כרטיס כדי לשנות את המקום.</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl bg-white px-4 py-16 text-center text-sm text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">אין מוצרים פעילים בתצוגה הזו</div>
      ) : (
        <div className="mx-auto w-full max-w-[1180px]">
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-7 min-[900px]:grid-cols-4">
          {items.map((product, index) => {
            const photo = productImage(product);
            const subtitle = productSubtitle(product);
            const badges = productBadges(product);
            const active = dragFrom === index;
            return (
              <article
                key={product.id}
                draggable={!saving}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  setDragFrom(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropAt(index);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setOver(null);
                }}
                className="flex min-w-0 cursor-grab flex-col gap-2.5 active:cursor-grabbing"
                style={{ opacity: active ? 0.45 : 1 }}
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#F6EEE8]" style={{ outline: over === index && dragFrom !== index ? "2px solid #3A2826" : undefined, outlineOffset: 3 }}>
                  {photo ? <img src={photo} alt="" className="absolute inset-0 size-full object-contain mix-blend-darken" draggable={false} /> : (
                    <span className="absolute inset-0 grid place-items-center px-4 text-center text-lg text-[#3A2826]">{product.title}</span>
                  )}
                  {badges.length ? (
                    <span className="absolute top-2.5 right-2.5 z-[1] flex flex-col items-end gap-1.5">
                      {badges.map((label) => (
                        <span key={label} className="rounded-full px-2 py-1 text-[12px] leading-none font-semibold text-white" style={{ background: label === "מבצע" ? "#A85A3A" : "#3A2826" }}>{label}</span>
                      ))}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5 px-0.5">
                  <span className="truncate text-[16px] leading-tight font-medium text-[#3A2826]">{product.title}</span>
                  {subtitle ? <span className="truncate text-[13px] leading-snug text-[#6E5650]">{subtitle}</span> : null}
                  <span className="mt-0.5 text-[15px] font-semibold text-[#3A2826]">{cardPrice(product.price)}</span>
                </div>
              </article>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
