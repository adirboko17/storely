import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { StoreDetailScreen } from "@/components/platform/store-detail-screen";
import type { PlatformStore } from "@/components/platform/types";
import { emptyMessaging, parseMessaging } from "@/data/live/messaging";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "כרטיס חנות",
};

export default function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-canvas" />}>
      <StoreDetail params={params} />
    </Suspense>
  );
}

async function StoreDetail({ params }: { params: Promise<{ storeId: string }> }) {
  await io();
  const { storeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: messaging }] = await Promise.all([
    supabase.rpc("list_platform_overview"),
    supabase.rpc("store_messaging_status", { target_store: storeId }),
  ]);
  if (error || !Array.isArray(data)) redirect("/login");
  const store = (data as PlatformStore[]).find((item) => item.id === storeId);
  if (!store) notFound();
  return (
    <StoreDetailScreen
      store={store}
      messaging={messaging == null ? emptyMessaging() : parseMessaging(messaging)}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      publishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
    />
  );
}
