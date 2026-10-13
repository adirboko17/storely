import type { Metadata } from "next";
import { InventoryScreen } from "@/components/admin/products/inventory-screen";

export const metadata: Metadata = { title: "מלאי" };

export default function InventoryPage() {
  return <InventoryScreen />;
}
