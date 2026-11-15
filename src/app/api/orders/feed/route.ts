import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const NIL_ID = "00000000-0000-0000-0000-000000000000";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

export async function GET(request: Request) {
  const token = bearer(request);
  if (!token.startsWith("stly_read_")) return json({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const updatedSince = url.searchParams.get("updated_since") ?? "";
  const after = url.searchParams.get("after") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  if (updatedSince && Number.isNaN(Date.parse(updatedSince))) return json({ ok: false, error: "updated_since" }, 400);
  if (after && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)) {
    return json({ ok: false, error: "after" }, 400);
  }

  const { data, error } = await createSupabaseServiceClient().rpc("read_store_orders", {
    token_hash: createHash("sha256").update(token).digest("hex"),
    updated_since: updatedSince || null,
    after_id: after || NIL_ID,
    page_limit: Number.isInteger(limit) ? limit : 50,
  });
  if (error) return json({ ok: false, error: "unavailable" }, 503);
  const record = data && typeof data === "object" ? data as { ok?: boolean; error?: string } : null;
  if (!record?.ok) return json({ ok: false, error: record?.error || "unauthorized" }, record?.error === "unauthorized" ? 401 : 503);
  return json(data);
}
