import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StoresScreen } from "@/components/platform/stores-screen";
import type { PlatformStore } from "@/components/platform/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "חנויות",
};

export default async function PlatformPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_platform_overview");
  if (error || !Array.isArray(data)) redirect("/login");
  return <StoresScreen stores={data as PlatformStore[]} />;
}
