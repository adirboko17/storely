import { Suspense } from "react";
import { AdminProvider } from "@/components/admin/layout/admin-provider";
import { AdminShell } from "@/components/admin/layout/admin-shell";
import { resolveAdminNavigation } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navItems = resolveAdminNavigation(getAdminSession());

  return (
    <Suspense fallback={<div className="h-dvh bg-shell" />}>
      <AdminProvider>
        <AdminShell navItems={navItems}>{children}</AdminShell>
      </AdminProvider>
    </Suspense>
  );
}
