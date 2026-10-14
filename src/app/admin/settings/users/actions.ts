"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StoreUser = {
  userId: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  status: string;
  primary: boolean;
  areas: string[];
};

const KNOWN_ERRORS = [
  "בחרו מה המשתמש יכול לראות",
  "הרשאה לא תקינה",
  "חסר שם",
  "השם ארוך מדי",
  "האימייל לא תקין",
  "הסיסמה צריכה 8 תווים לפחות",
  "האימייל כבר בשימוש",
  "אי אפשר לשנות את המשתמש הראשי",
  "אי אפשר לשנות את המשתמש שלך",
  "שם התפקיד ארוך מדי",
  "המשתמש לא נמצא",
  "סטטוס לא תקין",
];

function readableError(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לניהול המשתמשים";
  return KNOWN_ERRORS.find((item) => message.includes(item)) ?? "לא הצלחנו לשמור את המשתמש";
}

function storeId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

function parseUser(value: unknown): StoreUser | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.userId !== "string" || typeof row.name !== "string") return null;
  const areas = Array.isArray(row.areas) ? row.areas.filter((item): item is string => typeof item === "string") : [];
  return {
    userId: row.userId,
    name: row.name,
    email: typeof row.email === "string" ? row.email : "",
    roleKey: typeof row.roleKey === "string" ? row.roleKey : "",
    roleName: typeof row.roleName === "string" ? row.roleName : "",
    status: typeof row.status === "string" ? row.status : "active",
    primary: row.primary === true || row.roleKey === "owner",
    areas,
  };
}

export async function listStoreUsers(targetStore: string): Promise<{ users: StoreUser[] } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "העסק לא נמצא" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_store_users", { target_store: id });
  if (error) return { error: readableError(error.message) };
  const users = Array.isArray(data) ? data.flatMap((item) => {
    const user = parseUser(item);
    return user ? [user] : [];
  }) : [];
  return { users };
}

export async function addStoreUser(input: {
  storeId: string;
  name: string;
  email: string;
  password: string;
  roleTitle: string;
  areas: string[];
}): Promise<{ ok: true } | { error: string }> {
  const id = storeId(input.storeId);
  if (!id) return { error: "העסק לא נמצא" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_store_user", {
    target_store: id,
    member_name: input.name,
    member_email: input.email,
    member_password: input.password,
    role_title: input.roleTitle,
    access_areas: input.areas,
  });
  if (error) return { error: readableError(error.message) };
  return { ok: true };
}

export async function updateStoreUser(input: {
  storeId: string;
  userId: string;
  name: string;
  roleTitle: string;
  areas: string[];
  status: string;
  password: string;
}): Promise<{ ok: true } | { error: string }> {
  const id = storeId(input.storeId);
  const userId = storeId(input.userId);
  if (!id || !userId) return { error: "המשתמש לא נמצא" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_store_user", {
    target_store: id,
    member_user: userId,
    member_name: input.name,
    role_title: input.roleTitle,
    access_areas: input.areas,
    member_status: input.status,
    member_password: input.password,
  });
  if (error) return { error: readableError(error.message) };
  return { ok: true };
}
