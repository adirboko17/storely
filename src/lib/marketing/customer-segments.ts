import { customerSpentAmount } from "@/data/mock/order-session";
import { listPeople, profileOf, type PersonProfile } from "@/data/mock/people-session";
import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer } from "@/types/commerce";

export type QuizAnswer = {
  questionId: string;
  choiceId: string;
  question?: string;
  choice?: string;
};

export type CustomerSegment = {
  id: string;
  name: string;
  source: "customers" | "quiz";
  minSpent: number;
  minOrders: number;
  subscribedOnly: boolean;
  answers: QuizAnswer[];
};

type SegmentDefinition = {
  source?: string;
  minSpent?: number;
  minOrders?: number;
  subscribedOnly?: boolean;
  answers?: QuizAnswer[];
};

let cached: CustomerSegment[] | null = null;

function storeId() {
  const id = getStoreIdentity().storeId;
  if (!id) throw new Error("לא נבחרה חנות");
  return id;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function quizAnswers(value: QuizAnswer[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter((answer) => answer?.questionId && answer?.choiceId);
}

function asSegment(row: { id: string; name: string; definition: SegmentDefinition | null }): CustomerSegment | null {
  if (row.definition?.source === "quiz") {
    const answers = quizAnswers(row.definition.answers);
    if (!answers.length) return null;
    return { id: row.id, name: row.name, source: "quiz", minSpent: 0, minOrders: 0, subscribedOnly: false, answers };
  }
  if (row.definition?.source !== "customers") return null;
  return {
    id: row.id,
    name: row.name,
    source: "customers",
    minSpent: numberValue(row.definition.minSpent),
    minOrders: numberValue(row.definition.minOrders),
    subscribedOnly: row.definition.subscribedOnly === true,
    answers: [],
  };
}

export function matchesCustomerSegment(person: Customer, profile: PersonProfile, segment: Pick<CustomerSegment, "minSpent" | "minOrders" | "subscribedOnly">) {
  if (person.orders < segment.minOrders) return false;
  if (customerSpentAmount(person.id) < segment.minSpent) return false;
  if (segment.subscribedOnly && !profile.subscribed) return false;
  return true;
}

export function countCustomerSegment(segment: Pick<CustomerSegment, "source" | "minSpent" | "minOrders" | "subscribedOnly">) {
  if (segment.source === "quiz") return 0;
  return listPeople().filter((person) => matchesCustomerSegment(person, profileOf(person), segment)).length;
}

export function customerSegmentDetail(segment: Pick<CustomerSegment, "source" | "minSpent" | "minOrders" | "subscribedOnly" | "answers">) {
  if (segment.source === "quiz") {
    const groups: string[][] = [];
    const index = new Map<string, number>();
    for (const answer of segment.answers) {
      const label = answer.choice || answer.choiceId;
      const at = index.get(answer.questionId);
      if (at === undefined) {
        index.set(answer.questionId, groups.length);
        groups.push([label]);
      } else groups[at].push(label);
    }
    const text = groups.map((labels) => labels.join(" או ")).join(" · ");
    return text || "תשובות מהשאלון";
  }
  const parts = [
    segment.minOrders > 0 ? `לפחות ${segment.minOrders} הזמנות` : "",
    segment.minSpent > 0 ? `הוציאו לפחות ${segment.minSpent}` : "",
    segment.subscribedOnly ? "מנויים לדיוור" : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "כל הלקוחות שעומדים בלי תנאי נוסף.";
}

export async function listCustomerSegments() {
  if (cached) return cached;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("marketing_segments").select("id, name, definition").eq("store_id", storeId()).order("name");
  if (error) throw new Error(error.message);
  cached = ((data ?? []) as Array<{ id: string; name: string; definition: SegmentDefinition | null }>).flatMap((row) => {
    const segment = asSegment(row);
    return segment ? [segment] : [];
  });
  return cached;
}

export async function saveCustomerSegment(input: { id?: string | null; name: string; minSpent: number; minOrders: number; subscribedOnly: boolean }) {
  const name = input.name.trim();
  if (!name) throw new Error("יש להזין שם לפלח");
  const supabase = createSupabaseBrowserClient();
  const id = storeId();
  const definition = {
    source: "customers",
    minSpent: numberValue(input.minSpent),
    minOrders: Math.round(numberValue(input.minOrders)),
    subscribedOnly: input.subscribedOnly,
  };
  const existing = await supabase.from("marketing_segments").select("id, definition").eq("store_id", id).eq("name", name).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const sameName = existing.data as { id: string; definition: SegmentDefinition | null } | null;
  if (sameName && sameName.id !== input.id && sameName.definition?.source !== "customers") throw new Error("השם הזה כבר בשימוש");
  const targetId = input.id || (sameName?.definition?.source === "customers" ? sameName.id : null);
  if (targetId && cached?.find((item) => item.id === targetId)?.source === "quiz") throw new Error("השם הזה כבר בשימוש");
  const saved = targetId
    ? await supabase.from("marketing_segments").update({ name, kind: "dynamic", definition }).eq("store_id", id).eq("id", targetId).select("id, name, definition").single()
    : await supabase.from("marketing_segments").insert({ store_id: id, name, kind: "dynamic", definition }).select("id, name, definition").single();
  if (saved.error) throw new Error(saved.error.code === "23505" ? "כבר יש פלח בשם הזה" : saved.error.message);
  const segment = asSegment(saved.data as { id: string; name: string; definition: SegmentDefinition | null });
  if (!segment) throw new Error("לא הצלחנו לשמור את הפלח");
  cached = [segment, ...(cached ?? []).filter((item) => item.id !== segment.id)].sort((left, right) => left.name.localeCompare(right.name, "he"));
  return segment;
}

export type QuizResponse = {
  email: string;
  name: string;
  marketingConsent: boolean;
  answers: { questionId: string; choiceId: string }[];
};

export async function listQuizResponses(): Promise<QuizResponse[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("store_quiz_responses").select("email, name, answers, marketing_consent").eq("store_id", storeId());
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ email: string; name: string; answers: unknown; marketing_consent: boolean }>).map((row) => ({
    email: row.email,
    name: row.name,
    marketingConsent: row.marketing_consent === true,
    answers: quizAnswers(Array.isArray(row.answers) ? row.answers as QuizAnswer[] : []),
  }));
}

export async function saveQuizSegment(input: { id?: string | null; name: string; answers: QuizAnswer[] }) {
  const name = input.name.trim();
  const answers = input.answers.filter((answer) => answer.questionId && answer.choiceId);
  if (!name) throw new Error("יש להזין שם לפלח");
  if (!answers.length) throw new Error("יש לבחור לפחות תשובה אחת");
  const supabase = createSupabaseBrowserClient();
  const id = storeId();
  const definition = { source: "quiz", answers };
  const existing = await supabase.from("marketing_segments").select("id, definition").eq("store_id", id).eq("name", name).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const sameName = existing.data as { id: string; definition: SegmentDefinition | null } | null;
  if (sameName && sameName.id !== input.id && sameName.definition?.source !== "quiz") throw new Error("השם הזה כבר בשימוש");
  const targetId = input.id || (sameName?.definition?.source === "quiz" ? sameName.id : null);
  if (targetId && cached?.find((item) => item.id === targetId)?.source === "customers") throw new Error("השם הזה כבר בשימוש");
  const saved = targetId
    ? await supabase.from("marketing_segments").update({ name, kind: "dynamic", definition }).eq("store_id", id).eq("id", targetId).select("id, name, definition").single()
    : await supabase.from("marketing_segments").insert({ store_id: id, name, kind: "dynamic", definition }).select("id, name, definition").single();
  if (saved.error) throw new Error(saved.error.code === "23505" ? "כבר יש פלח בשם הזה" : saved.error.message);
  const segment = asSegment(saved.data as { id: string; name: string; definition: SegmentDefinition | null });
  if (!segment) throw new Error("לא הצלחנו לשמור את הפלח");
  cached = [segment, ...(cached ?? []).filter((item) => item.id !== segment.id)].sort((left, right) => left.name.localeCompare(right.name, "he"));
  return segment;
}
