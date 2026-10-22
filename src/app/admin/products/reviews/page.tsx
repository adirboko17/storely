import type { Metadata } from "next";
import { ReviewsScreen } from "@/components/admin/products/reviews-screen";

export const metadata: Metadata = { title: "ביקורות" };

export default function ProductReviewsPage() {
  return <ReviewsScreen />;
}
