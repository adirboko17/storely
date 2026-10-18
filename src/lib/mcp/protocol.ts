export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type RpcId = string | number | null;

export type RpcMessage = {
  jsonrpc: "2.0";
  id?: RpcId;
  method: string;
  params?: unknown;
};

export function parseRpcMessage(body: unknown): { ok: true; message: RpcMessage } | { ok: false; status: number; body: unknown } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, body: rpcError(null, -32600, "Invalid Request") };
  }
  const record = body as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string" || !record.method) {
    return { ok: false, status: 400, body: rpcError(rpcId(record.id), -32600, "Invalid Request") };
  }
  return {
    ok: true,
    message: {
      jsonrpc: "2.0",
      id: record.id === undefined ? undefined : rpcId(record.id),
      method: record.method,
      params: record.params,
    },
  };
}

export function rpcId(value: unknown): RpcId {
  return typeof value === "string" || typeof value === "number" || value === null ? value : null;
}

export function rpcResult(id: RpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export function negotiatedProtocol(params: unknown) {
  const requested =
    params && typeof params === "object" && typeof (params as { protocolVersion?: unknown }).protocolVersion === "string"
      ? (params as { protocolVersion: string }).protocolVersion
      : "";
  return (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : MCP_PROTOCOL_VERSIONS[0];
}

export function toolCallParams(params: unknown): { name: string; arguments: Record<string, unknown> } | null {
  if (!params || typeof params !== "object") return null;
  const record = params as { name?: unknown; arguments?: unknown };
  if (typeof record.name !== "string" || !record.name) return null;
  const args = record.arguments;
  if (args == null) return { name: record.name, arguments: {} };
  if (typeof args !== "object" || Array.isArray(args)) return null;
  return { name: record.name, arguments: args as Record<string, unknown> };
}
