import type { EmailDocument } from "./email-document";

export type DeliveryPurpose = "marketing" | "transactional";

export type DeliveryPlan = {
  storeId: string;
  channel: "email" | "sms";
  purpose: DeliveryPurpose;
  to: string;
  document: EmailDocument | null;
  bodyText: string;
  consentAllowed: boolean;
  consentReason: string;
};

export type ProviderDelivery = {
  provider: "mock";
  dispatched: false;
  simulated: true;
  reason: "suppressed" | "provider_not_connected" | "missing_content";
};

export interface EmailProvider {
  readonly id: "mock";
  deliver(plan: DeliveryPlan): Promise<ProviderDelivery>;
}

export function planDelivery(input: {
  storeId: string;
  channel: "email" | "sms";
  purpose?: DeliveryPurpose;
  to: string;
  document?: EmailDocument | null;
  bodyText?: string;
  consentAllowed: boolean;
  consentReason: string;
}): DeliveryPlan {
  return {
    storeId: input.storeId,
    channel: input.channel,
    purpose: input.purpose ?? "marketing",
    to: input.to.trim(),
    document: input.document ?? null,
    bodyText: input.bodyText ?? input.document?.text ?? "",
    consentAllowed: input.consentAllowed,
    consentReason: input.consentReason,
  };
}

/** Local stand-in for a future Resend adapter. It never calls the network. */
export const mockEmailProvider: EmailProvider = {
  id: "mock",
  async deliver(plan) {
    if (!plan.consentAllowed) return { provider: "mock", dispatched: false, simulated: true, reason: "suppressed" };
    if (plan.channel === "email" && !plan.document?.html) return { provider: "mock", dispatched: false, simulated: true, reason: "missing_content" };
    if (plan.channel === "sms" && !plan.bodyText.trim()) return { provider: "mock", dispatched: false, simulated: true, reason: "missing_content" };
    return { provider: "mock", dispatched: false, simulated: true, reason: "provider_not_connected" };
  },
};
