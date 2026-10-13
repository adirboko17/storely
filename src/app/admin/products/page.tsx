import type { Metadata } from "next";
import { ProductsListScreen } from "@/components/admin/products/products-list-screen";

export const metadata: Metadata = { title: "מוצרים" };

export default function ProductsPage() {
  return <ProductsListScreen />;
}
