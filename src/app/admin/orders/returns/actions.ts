"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RefundOrder = {
  orderNumber: number;
  createdAt: string;
  name: string;
  email: string;
  total: number;
  refunded: number;
  remaining: number;
  status: string;
};

function storeId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function readable(message: string) {
  if (message.includes("forbidden") || message.includes("42501")) return "אין הרשאה לזכות את ההזמנה";
  return "הזיכוי נכשל";
}

export async function loadStoreRefunds(targetStore: string): Promise<{ orders: RefundOrder[] } | { error: string }> {
  const id = storeId(targetStore);
  if (!id) return { error: "החנות לא נמצאה" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_store_refunds", { target_store: id });
  if (error) return { error: readable(error.message) };
  const rows = data && typeof data === "object" && Array.isArray((data as { orders?: unknown }).orders)
    ? (data as { orders: unknown[] }).orders
    : [];
  const orders = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const orderNumber = Number(row.orderNumber);
    if (!Number.isInteger(orderNumber)) return [];
    return [{
      orderNumber,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      name: typeof row.name === "string" ? row.name : "",
      email: typeof row.email === "string" ? row.email : "",
      total: money(row.total),
      refunded: money(row.refunded),
      remaining: money(row.remaining),
      status: typeof row.status === "string" ? row.status : "paid",
    }];
  });
  return { orders };
}

export async function refundStoreOrder(
  targetStore: string,
  orderNumber: number,
  amount: number,
): Promise<{ refunded: number; remaining: number; status: string } | { error: string }> {
  const id = storeId(targetStore);
  if (!id || !Number.isInteger(orderNumber) || !(amount > 0)) return { error: "הסכום לזיכוי לא תקין" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("refund_store_order", {
    target_store: id,
    order_number: orderNumber,
    amount,
  });
  if (error) return { error: readable(error.message) };
  const row = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!row || row.ok !== true) {
    return { error: typeof row?.reason === "string" ? row.reason : "Hyp לא אישר את הזיכוי" };
  }
  return { refunded: money(row.refunded), remaining: money(row.remaining), status: typeof row.status === "string" ? row.status : "refunded" };
}
