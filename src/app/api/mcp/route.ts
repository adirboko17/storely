import { createHash } from "node:crypto";
import { MCP_INSTRUCTIONS, MCP_TOOLS } from "@/lib/mcp/tools";
import { negotiatedProtocol, parseRpcMessage, rpcError, rpcResult, toolCallParams } from "@/lib/mcp/protocol";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const MAX_BODY = 1_000_000;

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return Response.json(body, { status, headers: { ...cors, ...extra } });
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

export function GET() {
  return json({ error: "This MCP endpoint accepts POST requests" }, 405);
}

export async function POST(request: Request) {
  const token = bearer(request);
  if (!token.startsWith("stly_") || token.length < 20 || token.length > 200) {
    return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  }

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
    return json(rpcResult(message.id, await callTool(tokenHash(token), call.name, call.arguments)), 200, headers);
  }

  return json(rpcError(message.id, -32601, "Method not found"), 200, headers);
}

async function callTool(hash: string, name: string, args: Record<string, unknown>) {
  if (!MCP_TOOLS.some((tool) => tool.name === name)) {
    return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  }
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("mcp_invoke", {
      token_hash: hash,
      tool_name: name,
      args,
    });
    if (error) {
      return { content: [{ type: "text", text: "The store could not complete that action" }], isError: true };
    }
    const result = data as { ok?: boolean; error?: string; data?: unknown; matches?: unknown } | null;
    if (!result || result.ok !== true) {
      const text = result?.error === "unauthorized" ? "This key is no longer valid" : result?.error || "The action failed";
      const extra = result?.matches ? `\n${JSON.stringify(result.matches)}` : "";
      return { content: [{ type: "text", text: text + extra }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }], isError: false };
  } catch {
    return { content: [{ type: "text", text: "The store could not complete that action" }], isError: true };
  }
}
