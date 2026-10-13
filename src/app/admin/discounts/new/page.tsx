import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscountNewScreen } from "@/components/admin/discounts/discount-editor-screen";

export const metadata: Metadata = { title: "הנחה חדשה" };

export default function NewDiscountPage() {
  return (
    <Suspense fallback={null}>
      <DiscountNewScreen />
    </Suspense>
  );
}
