import type { Metadata } from "next";
import { ProductEditorScreen } from "@/components/admin/products/product-editor-screen";

export const metadata: Metadata = { title: "מוצר חדש" };

export default function NewProductPage() {
  return <ProductEditorScreen productId={null} />;
}
