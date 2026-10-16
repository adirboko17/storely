import type { Metadata } from "next";
import { Suspense } from "react";
import { SubcategoryScreen } from "@/components/admin/products/subcategory-screen";

export const metadata: Metadata = { title: "תת קטגוריה" };

async function SubcategoryRoute({ params }: { params: Promise<{ key: string; sub: string }> }) {
  const { key, sub } = await params;
  return <SubcategoryScreen categoryKey={decodeURIComponent(key)} subcategory={decodeURIComponent(sub)} />;
}

export default function SubcategoryPage({ params }: { params: Promise<{ key: string; sub: string }> }) {
  return (
    <Suspense fallback={null}>
      <SubcategoryRoute params={params} />
    </Suspense>
  );
}
