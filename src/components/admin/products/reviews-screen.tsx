"use client";

import { useEffect, useState } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { decideProductReview, listProductReviews, type ReviewStatus, type StoreProductReview } from "@/lib/catalog/reviews";

const TABS: Array<{ id: ReviewStatus; label: string }> = [
  { id: "pending", label: "ממתינות לאישור" },
  { id: "published", label: "פורסמו" },
  { id: "rejected", label: "נדחו" },
];

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

export function ReviewsScreen() {
  const { toast } = useAdmin();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [rows, setRows] = useState<StoreProductReview[] | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null);
    listProductReviews(status).then((reviews) => { if (alive) setRows(reviews); }).catch((error: Error) => {
      if (alive) setRows([]);
      toast(error.message);
    });
    return () => { alive = false; };
  }, [status, toast]);

  async function decide(review: StoreProductReview, decision: "approve" | "reject") {
    setBusy(review.id);
    try {
      await decideProductReview(review.id, decision);
      setRows((current) => current?.filter((item) => item.id !== review.id) ?? current);
      toast(decision === "approve" ? "הביקורת פורסמה בעמוד המוצר" : "הביקורת נדחתה");
    } catch (error) {
      toast(error instanceof Error ? error.message : "הפעולה נכשלה");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div>
          <h1 className="m-0 text-[15px] font-bold">ביקורות</h1>
          <p className="m-0 mt-1 text-sm text-[#4a4a4a]">לקוחה שנותנת 4 או 5 כוכבים מתפרסמת מיד בעמוד המוצר. ביקורת של 3 כוכבים ומטה מחכה כאן לאישור.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" className={status === tab.id ? darkButton : softButton} onClick={() => setStatus(tab.id)}>{tab.label}</button>
          ))}
        </div>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          {rows === null ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">טוען ביקורות…</div> : null}
          {rows && rows.length === 0 ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">{status === "pending" ? "אין ביקורות שמחכות לאישור." : "אין ביקורות ברשימה הזאת."}</div> : null}
          {rows?.map((review) => (
            <article key={review.id} className="flex flex-col gap-2 border-t border-[#f1f1f1] px-4 py-3 first:border-t-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="text-sm">{review.productTitle}</b>
                <span className="text-sm text-[#c9873e]" aria-label={`${review.rating} כוכבים`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                <span className="text-sm text-[#4a4a4a]">{review.name}</span>
                <span className="text-xs text-[#6d6d6d]">הזמנה {review.orderNumber || "—"} · {when(review.createdAt)}</span>
              </div>
              <p className="m-0 whitespace-pre-line text-sm leading-6 text-[#303030]">{review.body}</p>
              <div className="flex flex-wrap gap-2">
                {review.status !== "published" ? <button type="button" className={darkButton} disabled={busy === review.id} onClick={() => void decide(review, "approve")}>אישור ופרסום</button> : null}
                {review.status !== "rejected" ? <button type="button" className={softButton} disabled={busy === review.id} onClick={() => void decide(review, "reject")}>{review.status === "published" ? "הסרה מהחנות" : "דחייה"}</button> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
