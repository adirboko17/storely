"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AccountMenu } from "@/components/admin/layout/account-menu";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getMenuName, subscribeMenuName } from "@/data/live/menu-name";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { IconName } from "@/lib/icons";

const ITEMS: Array<{ href: string; label: string; icon: IconName; exact?: boolean }> = [
  { href: "/admin/settings", label: "כללי", icon: "store", exact: true },
  { href: "/admin/settings/ai", label: "חיבור AI", icon: "spark" },
  { href: "/admin/settings/users", label: "משתמשים", icon: "user" },
  { href: "/admin/settings/shipping", label: "משלוחים", icon: "truck" },
  { href: "/admin/settings/policies", label: "פוליסות", icon: "document" },
];

export function SettingsSidebar({ accountName, accountEmail }: { accountName: string; accountEmail: string }) {
  const pathname = usePathname();
  const { menu, toggleMenu } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const liveName = useSyncExternalStore(subscribeMenuName, getMenuName, () => "");
  const store = getStoreIdentity();
  const [query, setQuery] = useState("");
  const profileOpen = menu === "profile";
  const needle = query.trim();
  const items = ITEMS.filter((item) => !needle || item.label.includes(needle));

  return (
    <nav className="relative z-30 flex h-full min-h-0 w-60 shrink-0 flex-col overflow-y-auto bg-shell px-2 pt-2.5 pb-2 text-nav">
      <div className="flex items-center gap-1 px-1 pt-0.5 pb-2.5">
        <Link
          href="/admin"
          aria-label="חזרה"
          className="grid size-7 place-items-center rounded-lg text-[#b5b5b5] no-underline hover:bg-[#303030] hover:text-white hover:no-underline"
        >
          <Icon name="chevron" className="rotate-180" />
        </Link>
        <span className="text-sm font-semibold text-white">הגדרות</span>
      </div>

      <label className="mb-1 flex h-7 w-full items-center gap-2 rounded-lg bg-[#303030] px-2.5 text-[#b5b5b5] focus-within:bg-[#3a3a3a]">
        <Icon name="search" size={15} strokeWidth={1.8} className="shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש"
          aria-label="חיפוש בהגדרות"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-white outline-none placeholder:text-[#9c9c9c]"
          style={{ backgroundColor: "transparent", color: "#fff" }}
        />
      </label>

      <div className="px-2 pt-3 pb-1.5">
        <div className="text-sm font-semibold text-[#e3e3e3]">{store.name}</div>
        <div dir="ltr" className="text-right text-[13px] text-[#8a8a8a]">
          {store.hostname}
        </div>
      </div>

      <div className="flex flex-col gap-px">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-start text-sm no-underline hover:bg-[#2a2a2a] hover:no-underline",
                active ? "bg-[#303030] font-semibold text-white" : "font-medium text-[#e3e3e3]",
              )}
            >
              <Icon name={item.icon} className="shrink-0 opacity-85" />
              {item.label}
            </Link>
          );
        })}
        {items.length === 0 ? <div className="px-2 py-2 text-[13px] text-[#8a8a8a]">אין התאמה</div> : null}
      </div>

      <div className="min-h-4 flex-1" />

      <div className="mt-0.5 border-t border-white/10 pt-1">
        <AccountMenu
          open={profileOpen}
          onToggle={() => toggleMenu("profile")}
          name={liveName || accountName || store.ownerName}
          storeName={store.name}
          email={accountEmail || store.ownerEmail}
        />
      </div>
    </nav>
  );
}
