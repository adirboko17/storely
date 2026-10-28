import { Suspense } from "react";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/layout/admin-provider";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { StoreHydrator } from "@/components/admin/store-hydrator";
import { PlatformReturnBar } from "@/components/platform/return-bar";
import type { PlatformStore } from "@/components/platform/types";
import type { StoreShell } from "@/data/live/apply-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseStoreAccess, visibleAdminNavigation } from "@/platform/access";
import { resolveAdminNavigation } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";
import { installation } from "@/store/installation";

function presentText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center bg-shell text-sm text-white/70">טוען את הניהול…</div>}>
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

  const [{ data: visitHost }, { data: brand }] = await Promise.all([
    supabase.rpc("store_visit_host", { target_store: storeId }),
    supabase.from("store_settings").select("logo_url, brand_colors, currency, display_name").eq("store_id", storeId).maybeSingle(),
  ]);
  const brandRow = brand as { logo_url?: string; brand_colors?: unknown; currency?: string; display_name?: string } | null;
  const shell: StoreShell = {
    storeId,
    name: presentText(knownStore, brandRow?.display_name ?? ""),
    hostname: presentText(visitHost, knownHost),
    ownerName: knownName,
    ownerEmail: knownEmail,
    logoUrl: presentText(brandRow?.logo_url, ""),
    brandColors: brandRow?.brand_colors,
    currency: brandRow?.currency || "ILS",
  };
  const { data: accessRow } = await supabase.rpc("current_store_access", { target_store: storeId });
  const access = parseStoreAccess(accessRow);
  const navItems = visibleAdminNavigation(resolveAdminNavigation(getAdminSession()), access);
  const menuName = typeof user.user_metadata?.menu_name === "string" ? user.user_metadata.menu_name.trim() : "";
  const accountName = menuName || access.name || knownName;
  const accountEmail = access.email || knownEmail;

  return (
    <StoreHydrator shell={shell}>
      <AdminProvider>
        <AdminShell navItems={navItems} access={access} accountName={accountName} accountEmail={accountEmail}>
          {enteredName ? <PlatformReturnBar name={enteredName} /> : null}
          {children}
        </AdminShell>
      </AdminProvider>
    </StoreHydrator>
  );
}
