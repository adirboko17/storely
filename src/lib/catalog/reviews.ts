import { getStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type ReviewStatus = "pending" | "published" | "rejected";

export type StoreProductReview = {
  id: string;
  productId: string;
  productTitle: string;
  orderNumber: number;
  name: string;
  body: string;
  rating: number;
  status: ReviewStatus;
  createdAt: string;
};

function asReview(value: unknown): StoreProductReview | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  const rating = Number(row.rating);
  const orderNumber = Number(row.orderNumber);
  if (status !== "pending" && status !== "published" && status !== "rejected") return null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (typeof row.id !== "string" || typeof row.productTitle !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    productId: typeof row.productId === "string" ? row.productId : "",
    productTitle: row.productTitle,
    orderNumber: Number.isInteger(orderNumber) ? orderNumber : 0,
    name: row.name,
    body: typeof row.body === "string" ? row.body : "",
    rating,
    status,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
  };
}

export async function listProductReviews(status: ReviewStatus) {
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("list_store_product_reviews", {
    target_store: storeId,
    wanted_status: status,
  });
  if (error) throw new Error("לא הצלחנו לטעון את הביקורות");
  let payload: unknown = data;
  if (typeof data === "string") {
    try { payload = JSON.parse(data) as unknown; } catch { payload = []; }
  }
  return Array.isArray(payload) ? payload.flatMap((item) => {
    const review = asReview(item);
    return review ? [review] : [];
  }) : [];
}

export async function decideProductReview(id: string, decision: "approve" | "reject") {
  const storeId = getStoreIdentity().storeId;
  if (!storeId) throw new Error("החנות לא נטענה");
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.rpc("decide_store_product_review", {
    target_store: storeId,
    review_id: id,
    decision,
  });
  if (error) throw new Error(decision === "approve" ? "לא הצלחנו לאשר את הביקורת" : "לא הצלחנו לדחות את הביקורת");
}
