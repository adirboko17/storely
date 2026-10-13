import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OrderDetailScreen } from "@/components/admin/orders/order-detail-screen";
import { ORDERS } from "@/data/mock/orders";

export const metadata: Metadata = { title: "הזמנה" };

async function OrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || !ORDERS.some((order) => order.id === orderId)) notFound();
  return <OrderDetailScreen orderId={orderId} />;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <OrderRoute params={params} />
    </Suspense>
  );
}
