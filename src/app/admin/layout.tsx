import { Suspense } from "react";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/layout/admin-provider";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { StoreHydrator } from "@/components/admin/store-hydrator";
import { PlatformReturnBar } from "@/components/platform/return-bar";
import type { PlatformStore } from "@/components/platform/types";
import type { StoreSnapshot } from "@/data/live/apply-store";
import { emptyTraffic, parseTraffic } from "@/data/live/traffic";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdminNavigation } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";
import { installation } from "@/store/installation";

function presentText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-shell" />}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}

async function AdminFrame({ children }: { children: React.ReactNode }) {
  await io();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed } = await supabase.rpc("has_platform_access");
  let enteredName: string | null = null;
  let storeId = installation.storeId;
  let knownName = "";
  let knownEmail = "";
  let knownStore = "";
  let knownHost = "";

  if (allowed === true) {
    const selected = (await cookies()).get("storely-platform-store")?.value;
    if (!selected) redirect("/platform");
    const { data } = await supabase.rpc("list_platform_overview");
    const stores = Array.isArray(data) ? (data as PlatformStore[]) : [];
    const store = stores.find((item) => item.id === selected);
    if (!store) redirect("/platform");
    storeId = store.id;
    enteredName = store.displayName || store.name;
    const owner = store.members.find((member) => member.roleKey === "owner") ?? store.members[0];
    knownName = owner?.name ?? "";
    knownEmail = owner?.email ?? "";
    knownStore = enteredName;
    knownHost = store.hostname ?? "";
  } else {
    const { data: membership } = await supabase
      .from("store_members")
      .select("store_id, display_name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = membership as { store_id?: string; display_name?: string } | null;
    if (!row?.store_id) redirect("/login");
    storeId = row.store_id;
    knownName = row.display_name ?? "";
    knownEmail = user.email ?? "";
  }

  const [{ data: snapshot }, { data: traffic }] = await Promise.all([
    supabase.rpc("store_admin_snapshot", { target_store: storeId }),
    supabase.rpc("store_traffic_snapshot", { target_store: storeId }),
  ]);
  const liveSnapshot: StoreSnapshot =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? { ...(snapshot as StoreSnapshot) } : {};
  if (!presentText(liveSnapshot.name, knownStore)) {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("display_name")
      .eq("store_id", storeId)
      .maybeSingle();
    const settingsRow = settings as { display_name?: string } | null;
    knownStore = settingsRow?.display_name ?? "";
  }
  liveSnapshot.name = presentText(liveSnapshot.name, knownStore);
  liveSnapshot.ownerName = presentText(liveSnapshot.ownerName, knownName);
  liveSnapshot.ownerEmail = presentText(liveSnapshot.ownerEmail, knownEmail);
  liveSnapshot.hostname = presentText(liveSnapshot.hostname, knownHost);
  const navItems = resolveAdminNavigation(getAdminSession());

  return (
    <StoreHydrator storeId={storeId} snapshot={liveSnapshot} traffic={traffic == null ? emptyTraffic() : parseTraffic(traffic)}>
      <AdminProvider>
        <AdminShell navItems={navItems}>
          {enteredName ? <PlatformReturnBar name={enteredName} /> : null}
          {children}
        </AdminShell>
      </AdminProvider>
    </StoreHydrator>
  );
}
