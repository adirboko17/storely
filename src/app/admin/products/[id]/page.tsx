import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductEditorScreen } from "@/components/admin/products/product-editor-screen";

export const metadata: Metadata = { title: "מוצר" };

async function ProductRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <ProductEditorScreen productId={Number(id)} />;
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <ProductRoute params={params} />
    </Suspense>
  );
}
