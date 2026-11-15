import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CreateOrderScreen } from "@/components/admin/orders/create-order-screen";

export const metadata: Metadata = { title: "עריכת הזמנה" };

async function EditOrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) notFound();
  return <CreateOrderScreen orderId={orderId} />;
}

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <EditOrderRoute params={params} />
    </Suspense>
  );
}
