import type { Metadata } from "next";
import { CollectionsScreen } from "@/components/admin/products/collections-screen";

export const metadata: Metadata = { title: "קטגוריות" };

export default function CollectionsPage() {
  return <CollectionsScreen />;
}
