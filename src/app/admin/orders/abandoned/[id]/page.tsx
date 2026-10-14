import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AbandonedDetailScreen } from "@/components/admin/orders/abandoned-detail-screen";

export const metadata: Metadata = { title: "עגלה נטושה" };

async function CheckoutRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) notFound();
  return <AbandonedDetailScreen checkoutId={id} />;
}

export default function AbandonedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <CheckoutRoute params={params} />
    </Suspense>
  );
}
