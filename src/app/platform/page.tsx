import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { StoresScreen } from "@/components/platform/stores-screen";
import type { PlatformStore } from "@/components/platform/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "חנויות",
};

export default function PlatformPage() {
  return (
    <Suspense fallback={null}>
      <PlatformStores />
    </Suspense>
  );
}

async function PlatformStores() {
  await io();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_platform_overview");
  if (error || !Array.isArray(data)) redirect("/login");
  return <StoresScreen stores={data as PlatformStore[]} />;
}
