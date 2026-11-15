"use server";

import { createHash, randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrderReadKey = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const KNOWN = ["השם צריך להיות בין תו אחד ל-80", "אפשר עד 4 מפתחות פעילים", "המפתח לא נמצא", "מפתח לא תקין"];

function readable(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לניהול המפתח";
  return KNOWN.find((item) => message.includes(item)) ?? "לא הצלחנו לשמור את המפתח";
}

function idOf(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

function parseKey(value: unknown): OrderReadKey | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.tokenPrefix !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    lastUsedAt: typeof row.lastUsedAt === "string" ? row.lastUsedAt : null,
  };
}

export async function listOrderReadKeys(targetStore: string): Promise<{ keys: OrderReadKey[] } | { error: string }> {
  const id = idOf(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_order_read_keys", { target_store: id });
  if (error) return { error: readable(error.message) };
  const keys = Array.isArray(data) ? data.map(parseKey).filter((item): item is OrderReadKey => item !== null) : [];
  return { keys };
}

export async function createOrderReadKey(
  targetStore: string,
  name: string,
): Promise<{ key: OrderReadKey; token: string } | { error: string }> {
  const id = idOf(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const token = `stly_read_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_my_order_read_key", {
    target_store: id,
    key_name: name,
    token_hash: tokenHash,
    token_prefix: token.slice(0, 12),
  });
  if (error) return { error: readable(error.message) };
  const key = parseKey(data);
  if (!key) return { error: "לא הצלחנו לשמור את המפתח" };
  return { key, token };
}

export async function revokeOrderReadKey(targetStore: string, keyId: string): Promise<{ ok: true } | { error: string }> {
  const id = idOf(targetStore);
  const key = idOf(keyId);
  if (!id || !key) return { error: "המפתח לא נמצא" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_my_order_read_key", { target_store: id, key_id: key });
  if (error) return { error: readable(error.message) };
  return { ok: true };
}
