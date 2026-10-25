import type { StorefrontEventInput } from "@/tracking/storefront";

type ShopCall = Pick<StorefrontEventInput, "supabaseUrl" | "publishableKey" | "trackingKey" | "hostname">;

export type StorefrontLine = {
  variantId: string;
  quantity: number;
  bundle?: boolean;
  bundleQty?: number;
};

export type StorefrontCustomer = {
  name: string;
  email: string;
  phone?: string;
  street?: string;
  city?: string;
  zip?: string;
};

async function storefrontRpc(input: ShopCall, fn: string, body: Record<string, unknown>) {
  const response = await fetch(`${input.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: input.publishableKey,
      authorization: `Bearer ${input.publishableKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tracking_key: input.trackingKey, hostname: input.hostname, ...body }),
  });
  const payload = (await response.json().catch(() => null)) as ({ ok?: boolean; reason?: string } & Record<string, unknown>) | null;
  if (!response.ok || !payload || payload.ok !== true) {
    return { ok: false as const, reason: payload?.reason || "הפעולה נכשלה" };
  }
  return payload;
}

/** Products, collections, shipping rates, policies, and visible posts for the hostname that served the request. */
export function loadStorefront(input: ShopCall) {
  return storefrontRpc(input, "storefront_shop", {});
}

/** Prices the cart on the server. A coupon code is checked here, not in the browser. */
export function quoteStorefront(
  input: ShopCall & {
    lines: StorefrontLine[];
    code?: string;
    shippingName?: string;
    email?: string;
    giftCode?: string;
  },
) {
  return storefrontRpc(input, "quote_storefront", {
    code: input.code ?? "",
    lines: input.lines,
    shipping_name: input.shippingName ?? "",
    customer_email: input.email ?? "",
    gift_code: input.giftCode ?? "",
  });
}

/** Keeps an open checkout so the admin can see an abandoned cart. */
export function saveStorefrontCheckout(
  input: ShopCall & {
    visitorKey: string;
    lines: StorefrontLine[];
    customer?: Partial<StorefrontCustomer>;
    shippingName?: string;
  },
) {
  const customer = input.customer ?? {};
  return storefrontRpc(input, "save_storefront_checkout", {
    visitor_key: input.visitorKey,
    lines: input.lines,
    customer_name: customer.name ?? "",
    customer_email: customer.email ?? "",
    customer_phone: customer.phone ?? "",
    customer_street: customer.street ?? "",
    customer_city: customer.city ?? "",
    customer_zip: customer.zip ?? "",
    shipping_name: input.shippingName ?? "",
  });
}

/**
 * Creates the order, reserves stock, and consumes the coupon.
 * Call this from the storefront server after payment is accepted.
 */
export function placeStorefrontOrder(
  input: ShopCall & {
    visitorKey: string;
    lines: StorefrontLine[];
    customer: StorefrontCustomer;
    shippingName?: string;
    code?: string;
    giftCode?: string;
    paymentStatus?: "paid" | "pending";
  },
) {
  return storefrontRpc(input, "place_storefront_order", {
    visitor_key: input.visitorKey,
    lines: input.lines,
    customer_name: input.customer.name,
    customer_email: input.customer.email,
    customer_phone: input.customer.phone ?? "",
    customer_street: input.customer.street ?? "",
    customer_city: input.customer.city ?? "",
    customer_zip: input.customer.zip ?? "",
    shipping_name: input.shippingName ?? "",
    code: input.code ?? "",
    gift_code: input.giftCode ?? "",
    payment_status: input.paymentStatus ?? "paid",
  });
}
