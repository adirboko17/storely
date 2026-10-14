"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformStore } from "@/components/platform/types";

const STORE_COOKIE = "storely-platform-store";

const KNOWN_ERRORS = [
  "חסר שם חנות",
  "חסר שם הבעלים",
  "האימייל לא תקין",
  "הסיסמה צריכה 8 תווים לפחות",
  "האימייל כבר בשימוש",
  "חסר דומיין",
  "הדומיין לא תקין",
  "הדומיין כבר תפוס",
  "סוג דומיין לא תקין",
  "החנות לא נמצאה",
  "מפתח Resend לא תקין",
  "כתובת השולח לא תקינה",
  "חסרה כתובת שולח",
  "חסרים פרטי Resend",
  "חסרים פרטי Pulseem",
  "סיסמת Pulseem קצרה מדי",
  "מספר השולח לא תקין",
];

function readableError(message: string, fallback = "לא הצלחנו לפתוח את האתר") {
  return KNOWN_ERRORS.find((item) => message.includes(item)) ?? fallback;
}

async function requireOperator() {
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_platform_access");
  if (allowed !== true) redirect("/login");
  return supabase;
}

export async function createPlatformStore(_previous: { error: string } | null, formData: FormData) {
  const supabase = await requireOperator();
  const { error } = await supabase.rpc("create_platform_store", {
    store_name: String(formData.get("storeName") ?? ""),
    owner_name: String(formData.get("ownerName") ?? ""),
    owner_email: String(formData.get("ownerEmail") ?? ""),
    owner_password: String(formData.get("ownerPassword") ?? ""),
    site_host: String(formData.get("hostname") ?? ""),
    primary_host: String(formData.get("primaryHost") ?? ""),
  });
  if (error) return { error: readableError(error.message) };
  redirect("/platform");
}

export async function updatePlatformStore(_previous: { error: string } | null, formData: FormData) {
  const supabase = await requireOperator();
  const storeId = String(formData.get("storeId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || (status !== "active" && status !== "disabled")) {
    return { error: "לא הצלחנו לשמור את הפרטים" };
  }
  const { error } = await supabase.rpc("update_platform_store", {
    target_store: storeId,
    store_name: String(formData.get("storeName") ?? ""),
    owner_name: String(formData.get("ownerName") ?? ""),
    owner_email: String(formData.get("ownerEmail") ?? ""),
    owner_password: String(formData.get("ownerPassword") ?? ""),
    site_host: String(formData.get("hostname") ?? ""),
    primary_host: String(formData.get("primaryHost") ?? ""),
    store_status: status,
  });
  if (error) return { error: readableError(error.message, "לא הצלחנו לשמור את הפרטים") };
  redirect(`/platform/${storeId}`);
}

function checked(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

export async function saveStoreMessaging(_previous: { error: string } | null, formData: FormData) {
  const supabase = await requireOperator();
  const storeId = String(formData.get("storeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return { error: "לא הצלחנו לשמור את החיבור" };
  const { error } = await supabase.rpc("save_store_messaging", {
    target_store: storeId,
    resend_api_key: String(formData.get("resendApiKey") ?? ""),
    resend_from_email: String(formData.get("resendFromEmail") ?? ""),
    resend_from_name: String(formData.get("resendFromName") ?? ""),
    email_marketing: checked(formData, "emailMarketing"),
    email_login: checked(formData, "emailLogin"),
    clear_email: checked(formData, "clearEmail"),
    pulseem_user: String(formData.get("pulseemUser") ?? ""),
    pulseem_password: String(formData.get("pulseemPassword") ?? ""),
    pulseem_from: String(formData.get("pulseemFrom") ?? ""),
    sms_marketing: checked(formData, "smsMarketing"),
    sms_login: checked(formData, "smsLogin"),
    clear_sms: checked(formData, "clearSms"),
  });
  if (error) return { error: readableError(error.message, "לא הצלחנו לשמור את החיבור") };
  redirect(`/platform/${storeId}`);
}

export async function checkStoreEmail(storeId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return { ok: false, message: "החנות לא נמצאה" };
  const supabase = await requireOperator();
  const { data, error } = await supabase.rpc("platform_messaging_secrets", { target_store: storeId });
  if (error) return { ok: false, message: error.message.includes("forbidden") ? "אין הרשאה לבדוק את החיבור" : "לא הצלחנו לבדוק את החיבור" };
  const secrets = data && typeof data === "object" ? (data as { resendApiKey?: unknown; resendFromEmail?: unknown }) : {};
  const apiKey = typeof secrets.resendApiKey === "string" ? secrets.resendApiKey : "";
  const fromEmail = typeof secrets.resendFromEmail === "string" ? secrets.resendFromEmail : "";
  if (!apiKey || !fromEmail) return { ok: false, message: "שמרו קודם מפתח Resend וכתובת שולח" };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "לא הצלחנו להגיע ל-Resend" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, message: "Resend דחה את המפתח" };
  if (!response.ok) return { ok: false, message: "Resend לא אישר את החיבור" };

  const body = (await response.json().catch(() => null)) as { data?: Array<{ name?: string; status?: string }> } | null;
  const domain = fromEmail.split("@")[1]?.toLowerCase() ?? "";
  const match = (body?.data ?? []).find((item) => item.name?.toLowerCase() === domain);
  if (!match) return { ok: false, message: "המפתח תקין, והדומיין של כתובת השולח לא מופיע ב-Resend" };
  if (match.status !== "verified") return { ok: false, message: "המפתח תקין, והדומיין עדיין לא מאומת ב-Resend" };
  return { ok: true, message: "המייל מחובר והדומיין מאומת" };
}

export async function enterClientStore(formData: FormData) {
  const supabase = await requireOperator();
  const storeId = String(formData.get("storeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) redirect("/platform");

  const { data, error } = await supabase.rpc("list_platform_overview");
  const stores = Array.isArray(data) ? (data as PlatformStore[]) : [];
  if (error || !stores.some((store) => store.id === storeId)) redirect("/platform");

  const jar = await cookies();
  jar.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/admin");
}

export async function leaveClientStore() {
  const jar = await cookies();
  jar.delete(STORE_COOKIE);
  redirect("/platform");
}

export async function signOutPlatform() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete(STORE_COOKIE);
  redirect("/login");
}
