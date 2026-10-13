import type { Metadata } from "next";
import { CollectionsScreen } from "@/components/admin/products/collections-screen";

export const metadata: Metadata = { title: "אוספים" };

export default function CollectionsPage() {
  return <CollectionsScreen />;
}
