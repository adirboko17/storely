const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,200}$/;

export function consentPath(authorizationId: string) {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

/** Only the OAuth consent screen may be used as a post-login return path. */
export function consentReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/oauth/consent?") || value.includes("\\") || value.startsWith("//")) return "";
  let url: URL;
  try {
    url = new URL(value, "https://storely.local");
  } catch {
    return "";
  }
  if (url.origin !== "https://storely.local" || url.pathname !== "/oauth/consent") return "";
  const authorizationId = url.searchParams.get("authorization_id") ?? "";
  if (!AUTHORIZATION_ID.test(authorizationId)) return "";
  return consentPath(authorizationId);
}
