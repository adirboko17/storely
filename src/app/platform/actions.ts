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
];

function readableError(message: string) {
  return KNOWN_ERRORS.find((item) => message.includes(item)) ?? "לא הצלחנו לפתוח את האתר";
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
  });
  if (error) return { error: readableError(error.message) };
  redirect("/platform");
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
