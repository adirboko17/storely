import type { Metadata } from "next";
import { Suspense } from "react";
import { GiftCardEditorScreen } from "@/components/admin/products/gift-card-editor-screen";

export const metadata: Metadata = { title: "כרטיס מתנה" };

async function GiftCardRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GiftCardEditorScreen cardCode={decodeURIComponent(code)} />;
}

export default function GiftCardPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={null}>
      <GiftCardRoute params={params} />
    </Suspense>
  );
}
