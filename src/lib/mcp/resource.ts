const HOST = /^[a-z0-9.-]+(?::\d+)?$/i;

export function supabaseAuthUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url) throw new Error("Supabase URL is required");
  return `${url}/auth/v1`;
}

export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host = HOST.test(forwardedHost) ? forwardedHost : request.headers.get("host") ?? "";
  if (!HOST.test(host)) return new URL(request.url).origin;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  return `${proto}://${host}`;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [supabaseAuthUrl()],
    bearer_methods_supported: ["header"],
  };
}

export function wwwAuthenticate(origin: string) {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

export const discoveryCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
  "Cache-Control": "no-store",
};
