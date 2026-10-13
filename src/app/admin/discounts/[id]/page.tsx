import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DiscountEditorScreen } from "@/components/admin/discounts/discount-editor-screen";

export const metadata: Metadata = { title: "הנחה" };

async function DiscountRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <DiscountEditorScreen discountId={Number(id)} kind="order" />;
}

export default function DiscountPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <DiscountRoute params={params} />
    </Suspense>
  );
}
