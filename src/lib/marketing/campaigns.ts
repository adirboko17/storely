import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AudienceKey = "subscribed" | "all" | "fresh" | "repeat";

export type CampaignStatus = "draft" | "scheduled" | "cancelled" | "sending" | "sent";

export type MarketingCampaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  messageId: string | null;
  segmentId: string | null;
  scheduledAt: string | null;
  audience: AudienceKey;
  lookbackDays: number | null;
};

export type AudienceMember = {
  customerId: string;
  name: string;
  email: string;
  consent: string;
  allowed: boolean;
  reason: string;
};

const AUDIENCE_LABELS: Record<AudienceKey, string> = {
  subscribed: "כל המנויים לדיוור",
  all: "כל הלקוחות עם אימייל",
  fresh: "לקוחות חדשים",
  repeat: "רכשו יותר מפעמיים",
};

export function audienceLabel(key: AudienceKey) {
  return AUDIENCE_LABELS[key];
}

export function campaignStatusLabel(status: CampaignStatus) {
  if (status === "scheduled") return "מתוזמן · ממתין לספק";
  if (status === "cancelled") return "בוטל";
  if (status === "sending" || status === "sent") return "שליחה חסומה";
  return "טיוטה";
}

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

function client() {
  return createSupabaseBrowserClient();
}

type SegmentRow = { id: string; definition: { key?: AudienceKey; lookbackDays?: number | null } | null };
type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  message_id: string | null;
  segment_id: string | null;
  scheduled_at: string | null;
};

function asCampaign(row: CampaignRow, segment?: SegmentRow): MarketingCampaign {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    messageId: row.message_id,
    segmentId: row.segment_id,
    scheduledAt: row.scheduled_at,
    audience: segment?.definition?.key ?? "subscribed",
    lookbackDays: segment?.definition?.lookbackDays ?? null,
  };
}

export async function listCampaigns(): Promise<MarketingCampaign[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status, message_id, segment_id, scheduled_at")
    .eq("store_id", storeId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CampaignRow[];
  const segmentIds = rows.map((row) => row.segment_id).filter((id): id is string => Boolean(id));
  const segments = new Map<string, SegmentRow>();
  if (segmentIds.length) {
    const loaded = await supabase.from("marketing_segments").select("id, definition").in("id", segmentIds);
    if (loaded.error) throw new Error(loaded.error.message);
    for (const segment of (loaded.data ?? []) as SegmentRow[]) segments.set(segment.id, segment);
  }
  return rows.map((row) => asCampaign(row, row.segment_id ? segments.get(row.segment_id) : undefined));
}

async function ensureMessage(messageId: string) {
  const supabase = client();
  const id = storeId();
  const existing = await supabase.from("marketing_messages").select("id").eq("store_id", id).eq("id", messageId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return;
  const imported = await supabase.rpc("import_store_marketing", { target_store: id });
  if (imported.error) throw new Error(imported.error.message);
}

async function saveAudience(campaignId: string, audience: AudienceKey, lookbackDays: number | null, currentSegmentId: string | null) {
  const supabase = client();
  const id = storeId();
  const definition = { key: audience, lookbackDays };
  const name = `קהל לקמפיין ${campaignId}`;
  if (currentSegmentId) {
    const updated = await supabase.from("marketing_segments").update({ definition, name, kind: "dynamic" }).eq("store_id", id).eq("id", currentSegmentId);
    if (updated.error) throw new Error(updated.error.message);
    return currentSegmentId;
  }
  const inserted = await supabase.from("marketing_segments").insert({ store_id: id, name, kind: "dynamic", definition }).select("id").single();
  if (inserted.error) throw new Error(inserted.error.message);
  return (inserted.data as { id: string }).id;
}

export async function saveCampaign(input: {
  id?: string;
  name: string;
  messageId: string | null;
  audience: AudienceKey;
  lookbackDays: number | null;
  status?: "draft" | "scheduled" | "cancelled";
  scheduledAt?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("חסר שם לקמפיין");
  if (input.messageId) await ensureMessage(input.messageId);
  const supabase = client();
  const id = storeId();
  const campaignId = input.id ?? crypto.randomUUID();
  const current = input.id
    ? await supabase.from("marketing_campaigns").select("segment_id").eq("store_id", id).eq("id", input.id).maybeSingle()
    : { data: null, error: null };
  if (current.error) throw new Error(current.error.message);
  const segmentId = await saveAudience(campaignId, input.audience, input.lookbackDays, (current.data as { segment_id: string | null } | null)?.segment_id ?? null);
  const row = {
    id: campaignId,
    store_id: id,
    name,
    status: input.status ?? "draft",
    purpose: "marketing",
    provider: "mock",
    message_id: input.messageId,
    segment_id: segmentId,
    scheduled_at: input.scheduledAt ?? null,
  };
  const saved = await supabase.from("marketing_campaigns").upsert(row).select("id, name, status, message_id, segment_id, scheduled_at").single();
  if (saved.error) throw new Error(saved.error.message);
  return asCampaign(saved.data as CampaignRow, { id: segmentId, definition: { key: input.audience, lookbackDays: input.lookbackDays } });
}

export async function duplicateCampaign(campaign: MarketingCampaign) {
  return saveCampaign({
    name: `עותק של ${campaign.name}`,
    messageId: campaign.messageId,
    audience: campaign.audience,
    lookbackDays: campaign.lookbackDays,
    status: "draft",
    scheduledAt: null,
  });
}

export async function loadAudience(audience: AudienceKey, lookbackDays: number | null): Promise<AudienceMember[]> {
  const supabase = client();
  const { data, error } = await supabase.rpc("marketing_audience", {
    target_store: storeId(),
    definition: { key: audience, lookbackDays: lookbackDays ?? 0 },
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ customer_id: string; name: string; email: string; consent: string; allowed: boolean; reason: string }>).map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    email: row.email,
    consent: row.consent,
    allowed: row.allowed,
    reason: row.reason,
  }));
}

export async function deliveryDecision(channel: "email" | "sms", address: string) {
  const supabase = client();
  const { data, error } = await supabase.rpc("marketing_delivery_decision", {
    target_store: storeId(),
    channel,
    address,
    purpose: "marketing",
  });
  if (error) throw new Error(error.message);
  const decision = data as { allowed?: boolean; reason?: string };
  return { allowed: Boolean(decision.allowed), reason: decision.reason || (decision.allowed ? "allowed" : "suppressed") };
}

export async function recordSimulation(input: {
  flowId?: number;
  campaignId?: string;
  eventName: string;
  recipient: string;
  dedupeKey: string;
  steps: Array<{ stepType: string; outcome: string; detail: Record<string, unknown> }>;
}) {
  const supabase = client();
  const { data, error } = await supabase.rpc("record_marketing_simulation", {
    target_store: storeId(),
    payload: {
      flowLegacyId: input.flowId ?? null,
      campaignId: input.campaignId ?? null,
      eventName: input.eventName,
      recipient: input.recipient,
      dedupeKey: input.dedupeKey,
      steps: input.steps.map((step) => ({ stepType: step.stepType, outcome: step.outcome, detail: step.detail })),
    },
  });
  if (error) throw new Error(error.message);
  return data as { runId: string; duplicate: boolean; wouldSend: boolean; suppressed: boolean };
}
