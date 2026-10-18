import { discoveryCors, protectedResourceMetadata, publicOrigin } from "@/lib/mcp/resource";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: discoveryCors });
}

export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(publicOrigin(request)), { headers: discoveryCors });
}
