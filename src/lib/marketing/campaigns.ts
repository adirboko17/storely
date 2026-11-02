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
  savedSegmentId: string | null;
  savedSegmentName: string | null;
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

const BLOCK_REASONS: Record<string, string> = {
  unsubscribe: "הוסר מהדיוור",
  bounce: "הכתובת חזרה",
  complaint: "סומן כספאם",
  manual: "נחסם ידנית",
  no_address: "אין אימייל",
  suppressed: "חסום",
};

export function blockReasonLabel(reason: string) {
  return BLOCK_REASONS[reason] ?? "חסום";
}

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

function client() {
  return createSupabaseBrowserClient();
}

type SegmentDefinition = { key?: AudienceKey; lookbackDays?: number | null; source?: string; minSpent?: number; minOrders?: number; subscribedOnly?: boolean };
type SegmentRow = { id: string; name?: string; definition: SegmentDefinition | null };
type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  message_id: string | null;
  segment_id: string | null;
  scheduled_at: string | null;
};

function asCampaign(row: CampaignRow, segment?: SegmentRow): MarketingCampaign {
  const saved = segment?.definition?.source === "customers" || segment?.definition?.source === "quiz";
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    messageId: row.message_id,
    segmentId: row.segment_id,
    scheduledAt: row.scheduled_at,
    audience: saved ? "subscribed" : segment?.definition?.key ?? "subscribed",
    lookbackDays: saved ? null : segment?.definition?.lookbackDays ?? null,
    savedSegmentId: saved ? segment.id : null,
    savedSegmentName: saved ? segment.name ?? null : null,
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
    const loaded = await supabase.from("marketing_segments").select("id, name, definition").in("id", segmentIds);
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

async function campaignOwnedSegment(currentSegmentId: string | null) {
  if (!currentSegmentId) return null;
  const supabase = client();
  const current = await supabase.from("marketing_segments").select("definition").eq("store_id", storeId()).eq("id", currentSegmentId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const source = (current.data as { definition: SegmentDefinition | null } | null)?.definition?.source;
  if (source === "customers" || source === "quiz") return null;
  return currentSegmentId;
}

async function saveAudience(campaignId: string, audience: AudienceKey, lookbackDays: number | null, currentSegmentId: string | null) {
  const supabase = client();
  const id = storeId();
  const definition = { key: audience, lookbackDays };
  const name = `קהל לקמפיין ${campaignId}`;
  const ownedSegmentId = await campaignOwnedSegment(currentSegmentId);
  if (ownedSegmentId) {
    const updated = await supabase.from("marketing_segments").update({ definition, name, kind: "dynamic" }).eq("store_id", id).eq("id", ownedSegmentId);
    if (updated.error) throw new Error(updated.error.message);
    return ownedSegmentId;
  }
  const named = await supabase.from("marketing_segments").select("id, definition").eq("store_id", id).eq("name", name).maybeSingle();
  if (named.error) throw new Error(named.error.message);
  const existing = named.data as { id: string; definition: SegmentDefinition | null } | null;
  if (existing && existing.definition?.source !== "customers") {
    const updated = await supabase.from("marketing_segments").update({ definition, kind: "dynamic" }).eq("store_id", id).eq("id", existing.id);
    if (updated.error) throw new Error(updated.error.message);
    return existing.id;
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
  savedSegmentId?: string | null;
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
  const currentSegmentId = (current.data as { segment_id: string | null } | null)?.segment_id ?? null;
  let linked: SegmentRow | undefined;
  let segmentId = currentSegmentId;
  if (input.savedSegmentId) {
    const savedSegment = await supabase.from("marketing_segments").select("id, name, definition").eq("store_id", id).eq("id", input.savedSegmentId).maybeSingle();
    if (savedSegment.error) throw new Error(savedSegment.error.message);
    const row = savedSegment.data as SegmentRow | null;
    if (!row || (row.definition?.source !== "customers" && row.definition?.source !== "quiz")) throw new Error("הפלח לא נמצא");
    segmentId = row.id;
    linked = row;
  } else {
    segmentId = await saveAudience(campaignId, input.audience, input.lookbackDays, currentSegmentId);
    linked = { id: segmentId, definition: { key: input.audience, lookbackDays: input.lookbackDays } };
  }
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
  return asCampaign(saved.data as CampaignRow, linked);
}

export async function duplicateCampaign(campaign: MarketingCampaign) {
  return saveCampaign({
    name: `עותק של ${campaign.name}`,
    messageId: campaign.messageId,
    audience: campaign.audience,
    lookbackDays: campaign.lookbackDays,
    savedSegmentId: campaign.savedSegmentId,
    status: "draft",
    scheduledAt: null,
  });
}

export async function loadAudience(
  audience: AudienceKey,
  lookbackDays: number | null,
  segment?: { source?: string; minSpent: number; minOrders: number; subscribedOnly: boolean; answers?: { questionId: string; choiceId: string }[] } | null,
): Promise<AudienceMember[]> {
  const supabase = client();
  const definition = segment?.source === "quiz"
    ? { source: "quiz", answers: (segment.answers ?? []).map((answer) => ({ questionId: answer.questionId, choiceId: answer.choiceId })) }
    : segment
      ? { source: "customers", minSpent: segment.minSpent, minOrders: segment.minOrders, subscribedOnly: segment.subscribedOnly }
      : { key: audience, lookbackDays: lookbackDays ?? 0 };
  const { data, error } = await supabase.rpc("marketing_audience", {
    target_store: storeId(),
    definition,
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
