import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionEditorScreen } from "@/components/admin/products/collection-editor-screen";

export const metadata: Metadata = { title: "אוסף" };

async function CollectionRoute({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <CollectionEditorScreen collectionKey={decodeURIComponent(key)} />;
}

export default function CollectionPage({ params }: { params: Promise<{ key: string }> }) {
  return (
    <Suspense fallback={null}>
      <CollectionRoute params={params} />
    </Suspense>
  );
}
