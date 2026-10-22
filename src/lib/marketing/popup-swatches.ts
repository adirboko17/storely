"use client";

import { getStoreIdentity } from "@/data/live/store-identity";
import { writeStore } from "@/data/live/write";

const listeners = new Set<() => void>();
let saved: string[] = [];

function storageKey() {
  const storeId = getStoreIdentity().storeId || "local";
  return `storely-popup-swatches:${storeId}`;
}

function clean(value: unknown) {
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !/^#[0-9a-fA-F]{6}$/.test(item)) continue;
    const color = item.toLowerCase();
    if (!colors.includes(color)) colors.push(color);
    if (colors.length >= 12) break;
  }
  return colors;
}

function readLocal() {
  if (typeof window === "undefined") return [];
  try {
    return clean(JSON.parse(window.localStorage.getItem(storageKey()) || "[]"));
  } catch {
    return [];
  }
}

function publish(next: string[]) {
  saved = next;
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey(), JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function subscribePopupSwatches(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPopupSwatches() {
  return saved;
}

export async function loadPopupSwatches() {
  publish(readLocal());
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("store_settings").select("popup_swatches").eq("store_id", storeId).maybeSingle();
    if (error || !data) return;
    publish(clean([...(Array.isArray(data.popup_swatches) ? data.popup_swatches : []), ...saved]));
  } catch {
    publish(readLocal());
  }
}

export async function rememberPopupSwatch(color: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  const next = clean([color.toLowerCase(), ...saved]);
  publish(next);
  try {
    await writeStore("save_popup_swatches", { swatches: next });
  } catch {
    publish(next);
  }
}
