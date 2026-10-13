"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { AccountMenu } from "@/components/admin/layout/account-menu";
import { getOrderSessionVersion, subscribeOrderSession, unfulfilledCount } from "@/data/mock/order-session";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { cn } from "@/lib/cn";
import { pathMatches, type NavItem } from "@/lib/navigation/nav";

function itemActive(pathname: string, item: NavItem) {
  const moduleOn = item.exact ? pathname === item.match : pathMatches(pathname, item.match);
  const childOn = item.children?.some((child) => pathMatches(pathname, child.href)) ?? false;
  return { moduleOn, childOn, filled: moduleOn && !childOn, open: moduleOn && Boolean(item.children?.length) };
}

export function Sidebar({
  navItems,
  rail = false,
  pinned = false,
  expandable = false,
  seam = false,
}: {
  navItems: NavItem[];
  rail?: boolean;
  pinned?: boolean;
  expandable?: boolean;
  seam?: boolean;
}) {
  const pathname = usePathname();
  const { narrow, toggleNav, menu, toggleMenu, openSearch } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const store = getStoreIdentity();
  const unfulfilled = unfulfilledCount();
  const profileOpen = menu === "profile";
  const settingsOn = pathname.startsWith("/admin/settings");

  if (rail) {
    return (
      <nav
        aria-label="תפריט מצומצם"
        className={cn(
          "relative z-30 flex h-full min-h-0 w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto bg-shell px-1.5 py-2.5 text-nav",
          seam && "border-l border-white/10",
        )}
      >
        {expandable ? (
          <button
            type="button"
            aria-label="הרחבת סרגל הצד"
            onClick={toggleNav}
            className="group mb-1.5 grid size-8 place-items-center rounded-lg hover:bg-[#303030]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/storely-logo.png" alt="" className="block size-7 object-contain group-hover:hidden" />
            <Icon name="collapse" className="hidden text-white group-hover:block" />
          </button>
        ) : (
          <Link href="/admin" aria-label="בית" className="mb-1.5 grid size-8 place-items-center no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/storely-logo.png" alt="" className="block size-7 object-contain" />
          </Link>
        )}
        <button
          type="button"
          aria-label="חיפוש"
          onClick={openSearch}
          className="grid size-8 place-items-center rounded-lg text-[#b5b5b5] hover:bg-[#2a2a2a] hover:text-white"
        >
          <Icon name="search" size={16} strokeWidth={1.8} />
        </button>
        {navItems.map((item) => {
          const state = itemActive(pathname, item);
          return (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            className={cn(
              "relative grid size-8 place-items-center rounded-lg no-underline hover:bg-[#2a2a2a] hover:text-white hover:no-underline",
              state.moduleOn ? "bg-[#303030] text-white" : "text-[#e3e3e3]",
            )}
          >
            <Icon name={item.icon} className="opacity-85" />
            {item.key === "orders" && unfulfilled > 0 ? (
              <span className="absolute top-0.5 left-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#3a3a3a] px-0.5 text-[9px] font-bold text-white">
                {unfulfilled}
              </span>
            ) : null}
          </Link>
          );
        })}
        <div className="min-h-4 flex-1" />
        <Link
          href="/admin/settings"
          aria-label="הגדרות"
          title="הגדרות"
          className={cn(
            "grid size-8 place-items-center rounded-lg no-underline hover:bg-[#2a2a2a] hover:text-white hover:no-underline",
            settingsOn ? "bg-[#303030] text-white" : "text-[#e3e3e3]",
          )}
        >
          <Icon name="settings" />
        </Link>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "z-30 flex w-60 shrink-0 flex-col gap-px overflow-y-auto bg-shell px-2 pt-2.5 pb-2 text-nav",
        pinned ? "absolute inset-y-0 right-0" : narrow ? "absolute inset-y-0 right-0 shadow-[-8px_0_24px_rgba(0,0,0,.35)]" : "relative",
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

      <div className="mb-2 w-full rounded-lg bg-[#303030] hover:bg-[#3a3a3a]">
        <button
          id="admin-search"
          type="button"
          onClick={openSearch}
          className="flex h-7 w-full items-center gap-2 rounded-lg bg-transparent px-2.5 text-start text-[13px] text-white"
        >
          <Icon name="search" size={15} strokeWidth={1.8} className="shrink-0 text-[#b5b5b5]" />
          <span className="min-w-0 flex-1 text-[#b5b5b5]">חיפוש</span>
          <span dir="ltr" className="text-xs font-medium text-[#9c9c9c]">
            Ctrl K
          </span>
        </button>
      </div>

      {navItems.map((item) => {
        const state = itemActive(pathname, item);
        return (
          <div key={item.key} className="flex flex-col">
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
            {item.children?.length ? (
              <div
                data-nav-sub={item.key}
                className={cn(
                  "grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                  state.open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
                inert={!state.open}
              >
                <div
                  className={cn(
                    "min-h-0 overflow-hidden transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transform-none motion-reduce:transition-none",
                    state.open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
                  )}
                >
                  <div className="flex flex-col gap-px pt-px">
                    {item.children.map((child) => {
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
                    })}
                  </div>
                </div>
              </div>
            ) : null}
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

      <AccountMenu
        open={profileOpen}
        onToggle={() => toggleMenu("profile")}
        name={store.ownerName}
        storeName={store.name}
        email={store.ownerEmail}
      />
    </nav>
  );
}
