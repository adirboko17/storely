import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersListScreen } from "@/components/admin/orders/orders-list-screen";

export const metadata: Metadata = { title: "הזמנות" };

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersListScreen />
    </Suspense>
  );
}
