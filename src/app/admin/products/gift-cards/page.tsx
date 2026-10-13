import type { Metadata } from "next";
import { GiftCardsScreen } from "@/components/admin/products/gift-cards-screen";

export const metadata: Metadata = { title: "כרטיסי מתנה" };

export default function GiftCardsPage() {
  return <GiftCardsScreen />;
}
