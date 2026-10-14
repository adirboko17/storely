export type StorefrontEventName = "page_view" | "product_view" | "add_to_cart" | "begin_checkout" | "purchase";

export type StorefrontEventInput = {
  supabaseUrl: string;
  publishableKey: string;
  trackingKey: string;
  hostname: string;
  visitorKey: string;
  event: StorefrontEventName;
  path: string;
  country?: string;
  city?: string;
  amount?: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

/**
 * Sends one storefront event into the shared store.
 * Call this from the storefront server, not from the browser.
 * The Vercel hostname and the real hostname use the same tracking key.
 * The hostname must be the host that served the request.
 */
export async function recordStorefrontEvent(input: StorefrontEventInput) {
  const response = await fetch(`${input.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/record_storefront_event`, {
    method: "POST",
    headers: {
      apikey: input.publishableKey,
      authorization: `Bearer ${input.publishableKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tracking_key: input.trackingKey,
      hostname: input.hostname,
      visitor_key: input.visitorKey,
      event_name: input.event,
      path: input.path,
      country: input.country ?? "",
      city: input.city ?? "",
      amount: input.amount ?? null,
      referrer: input.referrer ?? "",
      utm_source: input.utmSource ?? "",
      utm_medium: input.utmMedium ?? "",
      utm_campaign: input.utmCampaign ?? "",
    }),
  });
  if (!response.ok) return false;
  const payload = (await response.json()) as { ok?: boolean };
  return payload.ok === true;
}
