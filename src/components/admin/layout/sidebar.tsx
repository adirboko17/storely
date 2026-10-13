"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { getOrderSessionVersion, subscribeOrderSession, unfulfilledCount } from "@/data/mock/order-session";
import { cn } from "@/lib/cn";
import { pathMatches, type NavItem } from "@/lib/navigation/nav";

function itemActive(pathname: string, item: NavItem) {
  const moduleOn = item.exact ? pathname === item.match : pathMatches(pathname, item.match);
  const childOn = item.children?.some((child) => pathMatches(pathname, child.href)) ?? false;
  return { moduleOn, childOn, filled: moduleOn && !childOn, open: moduleOn && Boolean(item.children?.length) };
}

export function Sidebar({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const { narrow, toggleNav, menu, toggleMenu, toast } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const unfulfilled = unfulfilledCount();
  const profileOpen = menu === "profile";
  const settingsOn = pathname.startsWith("/admin/settings");

  return (
    <nav
      className={cn(
        "z-30 flex w-60 shrink-0 flex-col gap-px overflow-y-auto bg-shell px-2 pt-2.5 pb-2 text-nav",
        narrow ? "absolute inset-y-0 right-0 shadow-[-8px_0_24px_rgba(0,0,0,.35)]" : "relative",
      )}
    >
      <div className="flex items-center gap-2 px-1 pt-0.5 pb-2.5">
        <Link href="/admin" className="flex flex-1 items-center gap-2 no-underline">
          {/* Intrinsic img matches the prototype logo box. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/storely-logo.png" alt="Storely" className="block h-[30px] w-auto" />
        </Link>
        <button
          type="button"
          aria-label="כיווץ סרגל הצד"
          onClick={toggleNav}
          className="grid size-7 place-items-center rounded-lg text-[#b5b5b5] hover:bg-[#303030] hover:text-white"
        >
          <Icon name="collapse" />
        </button>
      </div>

      <div className="mb-2.5 flex h-[34px] items-center gap-2 rounded-[10px] bg-[#303030] px-2.5 text-[#b5b5b5] hover:bg-[#3a3a3a]">
        <Icon name="search" size={16} strokeWidth={1.8} />
        <input
          id="admin-search"
          placeholder="חיפוש"
          className="min-w-0 flex-1 border-0 text-sm text-white outline-none placeholder:text-[#b5b5b5]"
          style={{ backgroundColor: "transparent", color: "#fff" }}
        />
        <span dir="ltr" className="text-xs font-semibold text-[#b5b5b5]">
          Ctrl K
        </span>
      </div>

      {navItems.map((item) => {
        const state = itemActive(pathname, item);
        return (
          <div key={item.key} className="flex flex-col gap-px">
            <Link
              href={item.href}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-sm no-underline hover:bg-[#2a2a2a] hover:no-underline",
                state.filled ? "bg-[#303030] font-semibold text-white" : "font-medium",
                state.moduleOn ? "text-white" : "text-[#e3e3e3]",
                state.moduleOn && !state.filled ? "font-semibold" : "",
              )}
            >
              <Icon name={item.icon} className="shrink-0 opacity-85" />
              <span className="flex-1">{item.label}</span>
              {item.key === "orders" && unfulfilled > 0 ? (
                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-[#3a3a3a] px-1.5 text-xs font-bold text-white">
                  {unfulfilled}
                </span>
              ) : null}
            </Link>
            {state.open
              ? item.children?.map((child) => {
                  const active = pathMatches(pathname, child.href);
                  return (
                    <Link
                      key={child.key}
                      href={child.href}
                      className={cn(
                        "flex h-[30px] w-full items-center rounded-lg pr-9 pl-2 text-start text-sm no-underline hover:bg-[#2a2a2a] hover:no-underline",
                        active ? "bg-[#303030] font-semibold text-white" : "font-medium text-[#b5b5b5]",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })
              : null}
            {item.section ? (
              <div className="flex items-center gap-1 px-2 pt-3.5 pb-1 text-[13px] font-semibold text-[#8a8a8a]">
                {item.section}
                <Icon name="chevron" size={12} strokeWidth={2} />
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="min-h-4 flex-1" />

      <Link
        href="/admin/settings"
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-sm font-medium text-[#e3e3e3] no-underline hover:bg-[#2a2a2a] hover:no-underline",
          settingsOn && "bg-[#303030]",
        )}
      >
        <Icon name="settings" />
        הגדרות
      </Link>

      <div className="relative mt-0.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggleMenu("profile")}
          className="flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-start text-sm font-semibold text-[#e3e3e3] hover:bg-[#2a2a2a]"
        >
          <span className="grid size-[22px] shrink-0 place-items-center rounded-md bg-[#c9e7d5] text-[11px] font-bold text-[#0c5132]">
            סל
          </span>
          סטודיו לבנה
        </button>
        <button
          type="button"
          aria-label="התראות"
          onClick={() => toast("אין התראות חדשות")}
          className="relative grid size-8 place-items-center rounded-lg text-[#b5b5b5] hover:bg-[#2a2a2a] hover:text-white"
        >
          <Icon name="bell" />
          <span className="absolute top-[3px] left-1 grid h-[15px] min-w-[15px] place-items-center rounded-lg bg-[#e51c00] px-0.5 text-[10px] font-bold text-white">
            2
          </span>
        </button>
        {profileOpen ? (
          <div className="absolute right-0 bottom-10 z-50 w-56 rounded-xl bg-white p-1.5 text-ink shadow-[var(--shadow-popover)]">
            <div className="mb-1 border-b border-[#ebebeb] px-2 pt-2 pb-2.5">
              <div className="font-semibold">מאיה ברק</div>
              <div dir="ltr" className="text-right text-[13px] text-ink-secondary">
                maya@lavana.co.il
              </div>
            </div>
            <Link
              href="/admin/settings"
              className="flex w-full rounded-lg px-2 py-1.5 text-start text-sm text-ink no-underline hover:bg-[#f1f1f1] hover:no-underline"
            >
              הגדרות חשבון
            </Link>
            <button
              type="button"
              onClick={() => {
                toggleMenu("profile");
                toast("התנתקות אינה זמינה באב-טיפוס");
              }}
              className="flex w-full rounded-lg border-t border-[#ebebeb] px-2 py-1.5 text-start text-sm text-ink hover:bg-[#f1f1f1]"
            >
              התנתקות
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
