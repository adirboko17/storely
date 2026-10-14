import type { Metadata } from "next";
import { CollectionEditorScreen } from "@/components/admin/products/collection-editor-screen";

export const metadata: Metadata = { title: "הוספת קטגוריה" };

export default function NewCollectionPage() {
  return <CollectionEditorScreen collectionKey={null} />;
}
