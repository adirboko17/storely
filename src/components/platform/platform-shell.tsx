"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutPlatform } from "@/app/platform/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { IconName } from "@/lib/icons";

const NAV: Array<{ href: string; label: string; icon: IconName; exact?: boolean }> = [
  { href: "/platform", label: "חנויות", icon: "store", exact: true },
  { href: "/platform/new", label: "אתר חדש", icon: "plus" },
];

export function PlatformShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  const initial = email.trim().charAt(0).toUpperCase() || "S";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const showSide = !narrow || open;

  return (
    <div className="relative flex h-dvh overflow-hidden bg-shell text-[#303030]">
      {showSide ? (
        <nav
          className={cn(
            "z-30 flex h-full w-60 shrink-0 flex-col bg-shell px-2 pt-2.5 pb-2 text-[#e3e3e3]",
            narrow && "absolute inset-y-0 right-0 shadow-[-8px_0_24px_rgba(0,0,0,.35)]",
          )}
        >
          <Link href="/platform" className="flex items-center gap-2 px-1 pt-0.5 pb-3 no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/storely-logo.png" alt="Storely" className="block h-[30px] w-auto" />
          </Link>

          <div className="px-2 pt-1 pb-1 text-[13px] font-semibold text-[#8a8a8a]">הפלטפורמה</div>
          {NAV.map((item) => {
            const active = item.href === "/platform" ? pathname === "/platform" || /^\/platform\/[0-9a-f-]{36}$/i.test(pathname) : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm no-underline hover:bg-[#2a2a2a] hover:no-underline",
                  active ? "bg-[#303030] font-semibold text-white" : "font-medium text-[#e3e3e3]",
                )}
              >
                <Icon name={item.icon} className="shrink-0 opacity-85" />
                {item.label}
              </Link>
            );
          })}

          <div className="min-h-4 flex-1" />
          <div className="mb-1 flex items-center gap-2 rounded-lg px-1.5 py-1.5">
            <span className="grid size-[22px] shrink-0 place-items-center rounded-md bg-[#c9e7d5] text-[11px] font-bold text-[#0c5132]">
              {initial}
            </span>
            <span dir="ltr" className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold">
              {email}
            </span>
          </div>
          <form action={signOutPlatform}>
            <button
              type="submit"
              className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-sm font-medium text-[#e3e3e3] hover:bg-[#2a2a2a]"
            >
              <Icon name="close" />
              יציאה
            </button>
          </form>
        </nav>
      ) : null}

      <div className={cn("relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas", narrow ? "m-0" : "my-1.5 ml-1.5 rounded-[14px]")}>
        {narrow ? (
          <div className="flex h-12 shrink-0 items-center gap-2 bg-shell px-2.5">
            <button
              type="button"
              aria-label="תפריט"
              onClick={() => setOpen(true)}
              className="grid size-[34px] place-items-center rounded-lg bg-[#303030] text-[#e3e3e3]"
            >
              <Icon name="menu" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/storely-logo.png" alt="Storely" className="block h-[26px] w-auto" />
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {narrow && open ? <button type="button" aria-label="סגירת תפריט" className="fixed inset-0 z-20 bg-black/35" onClick={() => setOpen(false)} /> : null}
    </div>
  );
}
