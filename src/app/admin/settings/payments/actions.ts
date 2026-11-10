"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StorePaymentAccount = {
  provider: "hyp";
  terminal: string;
  connected: boolean;
  updatedAt: string | null;
};

const KNOWN = [
  "מספר המסוף צריך להיות 7 עד 12 ספרות",
  "מפתח ה-API לא תקין",
  "PassP לא תקין",
  "הדביקו את מפתח ה-API ואת PassP",
  "שמירת מפתח ה-API נכשלה",
  "שמירת PassP נכשלה",
];

function readable(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לעדכן את הסליקה";
  return KNOWN.find((item) => message.includes(item)) ?? "שמירת הסליקה נכשלה";
}

function storeId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

function parseAccount(value: unknown): StorePaymentAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.provider !== "hyp" || typeof row.terminal !== "string" || typeof row.connected !== "boolean") return null;
  return {
    provider: "hyp",
    terminal: row.terminal,
    connected: row.connected,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

export async function loadStorePayment(targetStore: string): Promise<{ account: StorePaymentAccount } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("store_payment_account", { target_store: id });
  if (error) return { error: readable(error.message) };
  const account = parseAccount(data);
  if (!account) return { error: "שמירת הסליקה נכשלה" };
  return { account };
}

export async function saveStorePayment(
  targetStore: string,
  input: { terminal: string; apiKey: string; apiPassword: string },
): Promise<{ account: StorePaymentAccount } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_store_payment_account", {
    target_store: id,
    terminal: input.terminal,
    api_key: input.apiKey,
    api_password: input.apiPassword,
  });
  if (error) return { error: readable(error.message) };
  const account = parseAccount(data);
  if (!account) return { error: "שמירת הסליקה נכשלה" };
  return { account };
}

export async function clearStorePayment(targetStore: string): Promise<{ account: StorePaymentAccount } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("clear_store_payment_account", { target_store: id });
  if (error) return { error: readable(error.message) };
  const account = parseAccount(data);
  if (!account) return { error: "שמירת הסליקה נכשלה" };
  return { account };
}
