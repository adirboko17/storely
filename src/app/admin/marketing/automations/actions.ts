"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const KNOWN = [
  "כתובת המייל לא תקינה",
  "Resend עדיין לא מחובר לחנות",
  "אפשר עד 20 שליחות בדיקה בשעה",
  "Resend לא שלח את המייל. ודאו שהדומיין מאומת.",
];

function readable(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לשלוח מייל";
  return KNOWN.find((item) => message.includes(item)) ?? "השליחה נכשלה";
}

export async function sendTestEmail(
  targetStore: string,
  recipient: string,
  recipientName: string,
): Promise<{ ok: true } | { error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(targetStore)) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("send_store_test_email", {
    target_store: targetStore,
    recipient,
    recipient_name: recipientName,
  });
  if (error) return { error: readable(error.message) };
  const row = data && typeof data === "object" ? (data as { ok?: unknown; reason?: unknown }) : {};
  if (row.ok === true) return { ok: true };
  return { error: typeof row.reason === "string" ? readable(row.reason) : "השליחה נכשלה" };
}
