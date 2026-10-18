"use server";

import { randomBytes, createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type McpConnection = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const KNOWN = ["השם צריך להיות בין תו אחד ל-80", "אפשר עד 8 חיבורים פעילים", "החיבור לא נמצא", "מפתח לא תקין"];

function readable(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לניהול החיבורים";
  return KNOWN.find((item) => message.includes(item)) ?? "לא הצלחנו לשמור את החיבור";
}

function storeId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

function parseConnection(value: unknown): McpConnection | null {
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

export async function listMcpConnections(targetStore: string): Promise<{ connections: McpConnection[] } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_mcp_connections", { target_store: id });
  if (error) return { error: readable(error.message) };
  const connections = Array.isArray(data) ? data.map(parseConnection).filter((item): item is McpConnection => item !== null) : [];
  return { connections };
}

export async function createMcpConnection(
  targetStore: string,
  name: string,
): Promise<{ connection: McpConnection; token: string } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const token = `stly_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_my_mcp_connection", {
    target_store: id,
    connection_name: name,
    token_hash: tokenHash,
    token_prefix: token.slice(0, 12),
  });
  if (error) return { error: readable(error.message) };
  const connection = parseConnection(data);
  if (!connection) return { error: "לא הצלחנו לשמור את החיבור" };
  return { connection, token };
}

export async function revokeMcpConnection(targetStore: string, connectionId: string): Promise<{ ok: true } | { error: string }> {
  const id = storeId(targetStore);
  const connection = storeId(connectionId);
  if (!id || !connection) return { error: "החיבור לא נמצא" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_my_mcp_connection", {
    target_store: id,
    connection_id: connection,
  });
  if (error) return { error: readable(error.message) };
  return { ok: true };
}
