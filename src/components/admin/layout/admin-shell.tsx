"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import { canOpenAdminPath, type StoreAccess } from "@/platform/access";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { SearchDialog } from "@/components/admin/layout/search-dialog";
import { SettingsSidebar } from "@/components/admin/layout/settings-sidebar";
import { Sidebar } from "@/components/admin/layout/sidebar";
import { ToastViewport } from "@/components/admin/layout/toast-viewport";
import { TopBar } from "@/components/admin/layout/top-bar";
import { UnsavedBar } from "@/components/admin/layout/unsaved-bar";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation/nav";

const panelEase = "ease-[cubic-bezier(0.16,1,0.3,1)]";

const pageMotion = `
@keyframes page-out { to { opacity: 0; transform: translateY(-6px); } }
@keyframes page-in { from { opacity: 0; transform: translateY(8px); } }
::view-transition-old(root),
::view-transition-new(root) { animation: none; }
::view-transition-group(admin-page) { animation-duration: 240ms; }
::view-transition-old(.page-fade) {
  mix-blend-mode: normal;
  animation: 240ms cubic-bezier(0.4, 0, 0.2, 1) both page-out;
}
::view-transition-new(.page-fade) {
  mix-blend-mode: normal;
  animation: 240ms cubic-bezier(0.4, 0, 0.2, 1) both page-in;
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(.page-fade),
  ::view-transition-new(.page-fade) { animation: none; }
}
`;

export function AdminShell({
  children,
  navItems,
  access,
  accountName,
  accountEmail,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  access: StoreAccess;
  accountName: string;
  accountEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { narrow, navCollapsed, navOpen, toggleNav, menu, closeMenu } = useAdmin();
  const showSettings = access?.settings ?? true;

  useEffect(() => {
    if (!access || canOpenAdminPath(pathname, access)) return;
    const next = navItems.find((item) => !item.viewStore)?.href;
    if (next && next !== pathname) router.replace(next);
  }, [access, navItems, pathname, router]);
  const settings = pathname.startsWith("/admin/settings");
  const [open, setOpen] = useState(settings);
  const [present, setPresent] = useState(settings);

  if (settings && !present) setPresent(true);

  useEffect(() => {
    if (!settings) {
      setOpen(false);
      return;
    }
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [settings]);

  useEffect(() => {
    if (settings || !present) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPresent(false), reduce ? 0 : 450);
    return () => window.clearTimeout(timer);
  }, [settings, present]);

  const showSide = narrow ? navOpen : true;
  const showBar = narrow;

  return (
    <div className="relative flex h-dvh overflow-hidden bg-shell">
      {showSide ? (
        present ? (
          <div
            className={cn(
              "z-30 flex h-full shrink-0",
              narrow && "absolute inset-y-0 right-0 shadow-[-8px_0_24px_rgba(0,0,0,.35)]",
            )}
          >
            <div
              className={cn(
                "relative shrink-0 overflow-hidden transition-[width] duration-[320ms] motion-reduce:transition-none",
                panelEase,
                open ? "w-[52px]" : "w-60",
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 right-0 transition-opacity motion-reduce:transition-none",
                  open ? "pointer-events-none opacity-0 duration-150" : "opacity-100 delay-100 duration-200",
                )}
              >
                <Sidebar navItems={navItems} pinned showSettings={showSettings} accountName={accountName} accountEmail={accountEmail} />
              </div>
              <div
                className={cn(
                  "absolute inset-y-0 right-0 transition-opacity motion-reduce:transition-none",
                  open ? "opacity-100 delay-75 duration-200" : "pointer-events-none opacity-0 duration-100",
                )}
              >
                <Sidebar navItems={navItems} rail seam showSettings={showSettings} accountName={accountName} accountEmail={accountEmail} />
              </div>
            </div>
            <div
              className={cn(
                "h-full shrink-0 overflow-hidden transition-[width] duration-[320ms] motion-reduce:transition-none",
                panelEase,
                open ? "w-60" : "w-0",
              )}
            >
              <div
                inert={!open}
                className={cn(
                  "h-full w-60 transition-[opacity] duration-[320ms] motion-reduce:transition-none",
                  panelEase,
                  open ? "opacity-100" : "opacity-0",
                )}
              >
                <SettingsSidebar accountName={accountName} accountEmail={accountEmail} />
              </div>
            </div>
          </div>
        ) : narrow ? (
          <Sidebar navItems={navItems} showSettings={showSettings} accountName={accountName} accountEmail={accountEmail} />
        ) : (
          <div
            className={cn(
              "relative h-full shrink-0 overflow-hidden transition-[width] duration-[320ms] motion-reduce:transition-none",
              panelEase,
              navCollapsed ? "w-[52px]" : "w-60",
            )}
          >
            <div
              inert={navCollapsed}
              className={cn(
                "absolute inset-y-0 right-0 transition-opacity motion-reduce:transition-none",
                navCollapsed ? "pointer-events-none opacity-0 delay-[200ms] duration-150" : "opacity-100 duration-200",
              )}
            >
              <Sidebar navItems={navItems} pinned showSettings={showSettings} accountName={accountName} accountEmail={accountEmail} />
            </div>
            <div
              inert={!navCollapsed}
              className={cn(
                "absolute inset-y-0 right-0 transition-opacity motion-reduce:transition-none",
                navCollapsed ? "opacity-100 delay-[200ms] duration-150" : "pointer-events-none opacity-0 duration-120",
              )}
            >
              <Sidebar navItems={navItems} rail expandable showSettings={showSettings} accountName={accountName} accountEmail={accountEmail} />
            </div>
          </div>
        )
      ) : null}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas",
          narrow ? "m-0 rounded-none" : "my-1.5 ml-1.5 rounded-[14px]",
        )}
      >
        {showBar ? <TopBar /> : null}
        <UnsavedBar />
        <style>{pageMotion}</style>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas">
          <ViewTransition name="admin-page" default="page-fade" update="page-fade">
            <div key={pathname}>{children}</div>
          </ViewTransition>
        </main>
      </div>
      {menu ? <div className="fixed inset-0 z-20" onClick={closeMenu} /> : null}
      {narrow && showSide ? (
        <div className="fixed inset-0 z-[25] bg-black/35" onClick={toggleNav} />
      ) : null}
      <ToastViewport />
      <SearchDialog navItems={navItems} showSettings={showSettings} />
    </div>
  );
}
