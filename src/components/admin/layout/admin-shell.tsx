"use client";

import { Sidebar } from "@/components/admin/layout/sidebar";
import { ToastViewport } from "@/components/admin/layout/toast-viewport";
import { TopBar } from "@/components/admin/layout/top-bar";
import { UnsavedBar } from "@/components/admin/layout/unsaved-bar";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation/nav";

export function AdminShell({ children, navItems }: { children: React.ReactNode; navItems: NavItem[] }) {
  const { narrow, navCollapsed, navOpen, toggleNav, menu, closeMenu } = useAdmin();
  const showSide = narrow ? navOpen : !navCollapsed;
  const showBar = narrow || navCollapsed;

  return (
    <div className="relative flex h-dvh overflow-hidden bg-shell">
      {showSide ? <Sidebar navItems={navItems} /> : null}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas",
          narrow ? "m-0 rounded-none" : navCollapsed ? "m-1.5 rounded-[14px]" : "my-1.5 ml-1.5 rounded-[14px]",
        )}
      >
        {showBar ? <TopBar /> : null}
        <UnsavedBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas">{children}</main>
      </div>
      {menu ? <div className="fixed inset-0 z-20" onClick={closeMenu} /> : null}
      {narrow && showSide ? (
        <div className="fixed inset-0 z-[25] bg-black/35" onClick={toggleNav} />
      ) : null}
      <ToastViewport />
    </div>
  );
}
