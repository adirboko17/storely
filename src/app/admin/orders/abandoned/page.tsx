import type { Metadata } from "next";
import { AbandonedListScreen } from "@/components/admin/orders/abandoned-list-screen";

export const metadata: Metadata = { title: "עגלות נטושות" };

export default function AbandonedPage() {
  return <AbandonedListScreen />;
}
