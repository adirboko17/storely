import type { Metadata } from "next";
import { CollectionEditorScreen } from "@/components/admin/products/collection-editor-screen";

export const metadata: Metadata = { title: "אוסף חדש" };

export default function NewCollectionPage() {
  return <CollectionEditorScreen collectionKey={null} />;
}
