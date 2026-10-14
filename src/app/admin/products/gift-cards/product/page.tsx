import type { Metadata } from "next";
import { GiftCardProductScreen } from "@/components/admin/products/gift-card-product-screen";

export const metadata: Metadata = { title: "יצירת מוצר כרטיס מתנה" };

export default function GiftCardProductPage() {
  return <GiftCardProductScreen />;
}
