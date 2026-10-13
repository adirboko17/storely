import type { Metadata } from "next";
import { DiscountsListScreen } from "@/components/admin/discounts/discounts-list-screen";

export const metadata: Metadata = { title: "הנחות" };

export default function DiscountsPage() {
  return <DiscountsListScreen />;
}
