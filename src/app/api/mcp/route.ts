import { createHash } from "node:crypto";
import { publicOrigin, supabaseAuthUrl, wwwAuthenticate } from "@/lib/mcp/resource";
import { MCP_INSTRUCTIONS, MCP_TOOLS } from "@/lib/mcp/tools";
import { negotiatedProtocol, parseRpcMessage, rpcError, rpcResult, toolCallParams } from "@/lib/mcp/protocol";
import { cleanFileName, decodeBase64Image, decodeImage, extensionFor, mediaContent, ownStorageObject } from "@/lib/mcp/images";
import { createSupabaseAuthClient, createSupabaseServiceClient, createSupabaseUserClient } from "@/lib/supabase/service";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
  "Cache-Control": "no-store",
};

const MAX_BODY = 7_000_000;

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return Response.json(body, { status, headers: { ...cors, ...extra } });
}

function unauthorized(request: Request) {
  return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": wwwAuthenticate(publicOrigin(request)) });
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const actor = await identify(request);
  if (!actor) return unauthorized(request);
  return json({ error: "This MCP endpoint accepts POST requests" }, 405, { Allow: "POST" });
}

export async function POST(request: Request) {
  const actor = await identify(request);
  if (!actor) return unauthorized(request);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY) return json(rpcError(null, -32600, "Request is too large"), 413);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  const parsed = parseRpcMessage(payload);
  if (!parsed.ok) return json(parsed.body, parsed.status);

  const message = parsed.message;
  if (message.id === undefined) return new Response(null, { status: 202, headers: cors });

  const protocol = request.headers.get("mcp-protocol-version") ?? negotiatedProtocol(message.params);
  const headers = { "MCP-Protocol-Version": protocol };

  if (message.method === "ping") return json(rpcResult(message.id, {}), 200, headers);

  if (message.method === "initialize") {
    return json(
      rpcResult(message.id, {
        protocolVersion: negotiatedProtocol(message.params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "storely", version: "1.0.0" },
        instructions: MCP_INSTRUCTIONS,
      }),
      200,
      headers,
    );
  }

  if (message.method === "tools/list") {
    return json(rpcResult(message.id, { tools: MCP_TOOLS }), 200, headers);
  }

  if (message.method === "tools/call") {
    const call = toolCallParams(message.params);
    if (!call) return json(rpcError(message.id, -32602, "Invalid params"), 200, headers);
    return json(rpcResult(message.id, await callTool(actor, call.name, call.arguments)), 200, headers);
  }

  return json(rpcError(message.id, -32601, "Method not found"), 200, headers);
}

type Actor = { kind: "key"; hash: string } | { kind: "user"; token: string };

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function identify(request: Request): Promise<Actor | null> {
  try {
    const token = bearer(request);
    if (token.startsWith("stly_") && token.length >= 20 && token.length <= 200) {
      return { kind: "key", hash: tokenHash(token) };
    }
    if (token.split(".").length !== 3) return null;
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;
    const subject = typeof claims?.sub === "string" ? claims.sub : "";
    if (error || !claims || claims.role !== "authenticated" || !USER_ID.test(subject)) return null;
    if (claims.iss !== supabaseAuthUrl()) return null;
    return { kind: "user", token };
  } catch (error) {
    console.error("MCP authentication failed", error);
    return null;
  }
}

function safeDetail(value: string) {
  if (/password|secret|bearer|api[_ ]?key|authorization/i.test(value)) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function failedAction(result: { error?: string; code?: string; matches?: unknown } | null) {
  const message = result?.error === "unauthorized" ? "This key is no longer valid" : result?.error || "The action failed";
  const detail = safeDetail(message) || "The action failed";
  const code = result?.code || "INVALID_ARGUMENT";
  const extra = result?.matches ? `\n${JSON.stringify(result.matches)}` : "";
  return `${code}: ${detail}${extra}`;
}

const IMAGE_TOOLS = new Set(["get_product_image", "get_product_images", "get_brand_assets"]);

type ToolResult = { ok?: boolean; error?: string; code?: string; data?: Record<string, unknown>; matches?: unknown };

async function callTool(actor: Actor, name: string, args: Record<string, unknown>) {
  if (!MCP_TOOLS.some((tool) => tool.name === name)) {
    return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  }
  try {
    if (name === "upload_design_asset") return await uploadDesignAsset(actor, args);
    const result = await invoke(actor, name, args);
    if (!result.ok) return result.body;
    if (IMAGE_TOOLS.has(name) && result.data?.deliver === "images") {
      return await mediaContent(createSupabaseServiceClient(), result.data);
    }
    return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }], isError: false };
  } catch (error) {
    console.error("MCP tool failed", name, error instanceof Error ? safeDetail(error.message) : "unknown");
    return { content: [{ type: "text", text: "The store could not complete that action" }], isError: true };
  }
}

async function invoke(actor: Actor, name: string, args: Record<string, unknown>) {
  const supabase = actor.kind === "key" ? createSupabaseServiceClient() : createSupabaseUserClient(actor.token);
  const { data, error } =
    actor.kind === "key"
      ? await supabase.rpc("mcp_invoke", { token_hash: actor.hash, tool_name: name, args })
      : await supabase.rpc("mcp_call", { tool_name: name, args });
  if (error) {
    console.error("MCP tool failed", name, error.code, safeDetail(error.message));
    const detail = safeDetail(error.message);
    return { ok: false as const, body: { content: [{ type: "text" as const, text: detail ? `DATABASE: ${detail}` : "The store could not complete that action" }], isError: true } };
  }
  const result = data as ToolResult | null;
  if (!result || result.ok !== true) {
    return { ok: false as const, body: { content: [{ type: "text" as const, text: failedAction(result) }], isError: true } };
  }
  return { ok: true as const, data: result.data ?? {} };
}

async function uploadDesignAsset(actor: Actor, args: Record<string, unknown>) {
  const fileName = typeof args.fileName === "string" ? cleanFileName(args.fileName) : "";
  const mimeType = args.mimeType;
  const category = args.category;
  const hasBytes = typeof args.contentBase64 === "string" && args.contentBase64.trim() !== "";
  const hasSource = typeof args.sourceUrl === "string" && args.sourceUrl.trim() !== "";
  if (!fileName || (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp")) {
    return { content: [{ type: "text", text: "VALIDATION: חסר שם קובץ או סוג תמונה" }], isError: true };
  }
  if (category !== "popup" && category !== "banner" && category !== "product" && category !== "general") {
    return { content: [{ type: "text", text: "VALIDATION: קטגוריית הקובץ לא תקינה" }], isError: true };
  }
  if (hasBytes === hasSource) {
    return { content: [{ type: "text", text: "VALIDATION: צריך contentBase64 או sourceUrl, לא את שניהם" }], isError: true };
  }

  const reserved = await invoke(actor, "reserve_design_upload", { fileName, mimeType, category });
  if (!reserved.ok) return reserved.body;
  const storeId = typeof reserved.data.storeId === "string" ? reserved.data.storeId : "";
  const assetId = typeof reserved.data.assetId === "string" ? reserved.data.assetId : "";
  if (!storeId || !assetId) {
    return { content: [{ type: "text", text: "DATABASE: שמירת הקובץ נכשלה" }], isError: true };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const decoded = hasBytes
    ? decodeBase64Image(args.contentBase64 as string)
    : await readOwnObject(storeId, args.sourceUrl as string, supabaseUrl);
  if (!decoded || decoded.mimeType !== mimeType) {
    await invoke(actor, "discard_design_upload", { assetId });
    return { content: [{ type: "text", text: "VALIDATION: הקובץ אינו JPEG, PNG או WebP תואם לסוג שנשלח" }], isError: true };
  }

  const stored = await invoke(actor, "reserve_design_upload", {
    assetId,
    fileName,
    mimeType,
    category,
    width: decoded.width,
    height: decoded.height,
    byteSize: decoded.bytes.byteLength,
    extension: extensionFor(decoded.mimeType),
  });
  if (!stored.ok) {
    await invoke(actor, "discard_design_upload", { assetId });
    return stored.body;
  }
  const bucket = stored.data.bucket === "email-media" ? "email-media" : "";
  const finalPath = typeof stored.data.path === "string" ? stored.data.path : "";
  if (!bucket || !finalPath.startsWith(`${storeId}/`) || finalPath.includes("..")) {
    await invoke(actor, "discard_design_upload", { assetId });
    return { content: [{ type: "text", text: "DATABASE: שמירת הקובץ נכשלה" }], isError: true };
  }
  const service = createSupabaseServiceClient();
  const { error } = await service.storage.from(bucket).upload(finalPath, Buffer.from(decoded.bytes), {
    contentType: decoded.mimeType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) {
    console.error("MCP upload failed", safeDetail(error.message));
    await invoke(actor, "discard_design_upload", { assetId });
    return { content: [{ type: "text", text: "DATABASE: העלאת הקובץ נכשלה" }], isError: true };
  }
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        assetId,
        publicUrl: stored.data.publicUrl,
        width: decoded.width,
        height: decoded.height,
        mimeType: decoded.mimeType,
        byteSize: decoded.bytes.byteLength,
      }, null, 2),
    }],
    isError: false,
  };
}

async function readOwnObject(storeId: string, sourceUrl: string, supabaseUrl: string) {
  const object = ownStorageObject(sourceUrl, storeId, supabaseUrl);
  if (!object) return null;
  const { data, error } = await createSupabaseServiceClient().storage.from(object.bucket).download(object.path);
  if (error || !data) return null;
  return decodeImage(new Uint8Array(await data.arrayBuffer()));
}
