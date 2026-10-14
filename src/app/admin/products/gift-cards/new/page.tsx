import type { Metadata } from "next";
import { GiftCardEditorScreen } from "@/components/admin/products/gift-card-editor-screen";

export const metadata: Metadata = { title: "יצירת כרטיס מתנה" };

export default function NewGiftCardPage() {
  return <GiftCardEditorScreen />;
}
