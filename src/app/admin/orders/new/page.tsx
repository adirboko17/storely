import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateOrderScreen } from "@/components/admin/orders/create-order-screen";

export const metadata: Metadata = { title: "יצירת הזמנה" };

export default function NewOrderPage() {
  return (
    <Suspense fallback={null}>
      <CreateOrderScreen />
    </Suspense>
  );
}
