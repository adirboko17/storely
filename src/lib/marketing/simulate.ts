import type { Flow, FlowRule, FlowStep } from "@/data/mock/marketing-session";
import type { EmailDocument } from "./email-document";
import { mockEmailProvider, planDelivery, type ProviderDelivery } from "./provider";

export type SimulationProfile = {
  email: string;
  phone: string;
  name: string;
  subscribed: boolean;
  opened: boolean;
  clicked: boolean;
  inCart: boolean;
  paid: boolean;
  orders: number;
  spent: number;
  segment: string;
};

export type ConsentDecision = { allowed: boolean; reason: string };

export type SimulationStepLog = {
  stepType: string;
  outcome: "yes" | "no" | "a" | "b" | "mail" | "phone" | "wait" | "would_send" | "suppressed" | "skipped" | "end";
  detail: Record<string, unknown>;
};

export type SimulationResult = {
  flowId: number;
  flowName: string;
  trigger: string;
  matched: boolean;
  steps: SimulationStepLog[];
  wouldSend: boolean;
  suppressed: boolean;
  deliveries: ProviderDelivery[];
};

function waitMinutes(step: Extract<FlowStep, { type: "wait" }>) {
  const amount = Math.max(0, Number(step.value) || 0);
  if (step.unit === "דקות") return amount;
  if (step.unit === "ימים") return amount * 1440;
  return amount * 60;
}

function ruleValue(profile: SimulationProfile, field: string) {
  if (field === "subscribed") return profile.subscribed;
  if (field === "opened") return profile.opened;
  if (field === "clicked") return profile.clicked;
  if (field === "in_cart") return profile.inCart;
  if (field === "paid") return profile.paid;
  if (field === "orders") return profile.orders;
  if (field === "spent") return profile.spent;
  return profile.segment;
}

function ruleMatches(rule: FlowRule, profile: SimulationProfile) {
  const actual = ruleValue(profile, rule.field);
  if (typeof actual === "boolean") return actual === (rule.value !== "no");
  if (typeof actual === "number") {
    const expected = Number(rule.value);
    if (rule.op === "lt") return actual < expected;
    return actual >= expected;
  }
  if (rule.op === "is_not") return String(actual) !== rule.value;
  return String(actual) === rule.value;
}

function conditionMatches(step: Extract<FlowStep, { type: "cond" }>, profile: SimulationProfile) {
  const rules = step.rules ?? [];
  if (!rules.length) return Boolean(step.text?.trim());
  const checks = rules.map((rule) => ruleMatches(rule, profile));
  return step.match === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

function branchOf(percent: number, email: string) {
  const seed = [...email].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % 100 < Math.min(100, Math.max(0, percent)) ? "a" : "b";
}

async function sendStep(
  step: Extract<FlowStep, { type: "email" | "sms" }>,
  profile: SimulationProfile,
  consent: (channel: "email" | "sms", address: string) => ConsentDecision | Promise<ConsentDecision>,
  messages: SimulationMessages,
): Promise<{ log: SimulationStepLog; delivery: ProviderDelivery | null }> {
  const channel = step.type === "email" ? "email" : "sms";
  const address = channel === "email" ? profile.email : profile.phone;
  const decision = address.trim() ? await consent(channel, address) : { allowed: false, reason: "no_address" };
  const document = step.type === "email" && step.emailId ? messages.email(step.emailId) : null;
  const smsText = step.type === "sms" ? (step.smsId ? messages.sms(step.smsId) : step.text ?? "") : "";
  const delivery = await mockEmailProvider.deliver(planDelivery({
    storeId: "",
    channel,
    to: address,
    bodyText: smsText,
    document,
    consentAllowed: decision.allowed,
    consentReason: decision.reason,
  }));
  return {
    log: {
      stepType: step.type,
      outcome: decision.allowed ? "would_send" : "suppressed",
      detail: {
        address,
        messageId: step.type === "email" ? step.emailId ?? "" : step.smsId ?? "",
        reason: decision.allowed ? delivery.reason : decision.reason,
        dispatched: false,
      },
    },
    delivery,
  };
}

export type SimulationMessages = {
  email: (id: string) => EmailDocument | null;
  sms: (id: string) => string;
};

async function walk(
  steps: FlowStep[],
  profile: SimulationProfile,
  consent: (channel: "email" | "sms", address: string) => ConsentDecision | Promise<ConsentDecision>,
  messages: SimulationMessages,
  logs: SimulationStepLog[],
  deliveries: ProviderDelivery[],
) {
  for (const step of steps) {
    if (step.type === "wait") {
      logs.push({ stepType: "wait", outcome: "wait", detail: { minutes: waitMinutes(step), simulatedElapsed: 0 } });
      continue;
    }
    if (step.type === "end") {
      logs.push({ stepType: "end", outcome: "end", detail: {} });
      return;
    }
    if (step.type === "cond") {
      const yes = conditionMatches(step, profile);
      logs.push({ stepType: "cond", outcome: yes ? "yes" : "no", detail: { match: step.match ?? "all" } });
      await walk(yes ? step.yes ?? [] : step.no ?? [], profile, consent, messages, logs, deliveries);
      continue;
    }
    if (step.type === "ab") {
      const branch = branchOf(step.percent, profile.email || profile.phone);
      logs.push({ stepType: "ab", outcome: branch, detail: { percent: step.percent } });
      await walk(branch === "a" ? step.a ?? [] : step.b ?? [], profile, consent, messages, logs, deliveries);
      continue;
    }
    if (step.type === "both") {
      logs.push({ stepType: "both", outcome: "mail", detail: {} });
      await walk(step.mail ?? [], profile, consent, messages, logs, deliveries);
      logs.push({ stepType: "both", outcome: "phone", detail: {} });
      await walk(step.phone ?? [], profile, consent, messages, logs, deliveries);
      continue;
    }
    if (step.type === "email" || step.type === "sms") {
      const result = await sendStep(step, profile, consent, messages);
      logs.push(result.log);
      if (result.delivery) deliveries.push(result.delivery);
    }
  }
}

export async function simulateFlow(
  flow: Flow,
  eventLabel: string,
  profile: SimulationProfile,
  consent: (channel: "email" | "sms", address: string) => ConsentDecision | Promise<ConsentDecision>,
  messages: SimulationMessages = { email: () => null, sms: () => "" },
): Promise<SimulationResult> {
  const matched = flow.trigger === eventLabel;
  const steps: SimulationStepLog[] = [];
  const deliveries: ProviderDelivery[] = [];
  if (matched) await walk(flow.steps, profile, consent, messages, steps, deliveries);
  else steps.push({ stepType: "trigger", outcome: "skipped", detail: { trigger: flow.trigger, event: eventLabel } });
  return {
    flowId: flow.id,
    flowName: flow.name,
    trigger: flow.trigger,
    matched,
    steps,
    wouldSend: steps.some((step) => step.outcome === "would_send"),
    suppressed: steps.some((step) => step.outcome === "suppressed"),
    deliveries,
  };
}

export function simulationDedupeKey(flowId: number, eventLabel: string, address: string) {
  return `${flowId}:${eventLabel}:${address.trim().toLowerCase()}`;
}
