import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/layout/admin-provider";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { PlatformReturnBar } from "@/components/platform/return-bar";
import type { PlatformStore } from "@/components/platform/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdminNavigation } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_platform_access");
  let enteredName: string | null = null;

  if (allowed === true) {
    const storeId = (await cookies()).get("storely-platform-store")?.value;
    if (!storeId) redirect("/platform");
    const { data } = await supabase.rpc("list_platform_overview");
    const stores = Array.isArray(data) ? (data as PlatformStore[]) : [];
    const store = stores.find((item) => item.id === storeId);
    if (!store) redirect("/platform");
    enteredName = store.displayName || store.name;
  }

  const navItems = resolveAdminNavigation(getAdminSession());

  return (
    <Suspense fallback={<div className="h-dvh bg-shell" />}>
      <AdminProvider>
        <AdminShell navItems={navItems}>
          {enteredName ? <PlatformReturnBar name={enteredName} /> : null}
          {children}
        </AdminShell>
      </AdminProvider>
    </Suspense>
  );
}
