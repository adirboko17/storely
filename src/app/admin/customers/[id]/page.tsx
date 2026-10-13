import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CustomerProfileScreen } from "@/components/admin/customers/customer-profile-screen";

export const metadata: Metadata = { title: "לקוח" };

async function CustomerRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <CustomerProfileScreen customerId={Number(id)} />;
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <CustomerRoute params={params} />
    </Suspense>
  );
}
