"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { IconName } from "@/lib/icons";

const ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/admin/settings", label: "כללי", icon: "store" },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const { menu, toggleMenu, toast } = useAdmin();
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
        <div className="text-sm font-semibold text-[#e3e3e3]">סטודיו לבנה</div>
        <div dir="ltr" className="text-right text-[13px] text-[#8a8a8a]">
          lavana.co.il
        </div>
      </div>

      <div className="flex flex-col gap-px">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

      <div className="relative mt-0.5 border-t border-white/10 pt-1">
        <button
          type="button"
          onClick={() => toggleMenu("profile")}
          className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-start hover:bg-[#2a2a2a]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#c9e7d5] text-[11px] font-bold text-[#0c5132]">
            סל
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[#e3e3e3]">סטודיו לבנה</span>
            <span dir="ltr" className="block truncate text-right text-[12px] text-[#8a8a8a]">
              maya@lavana.co.il
            </span>
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
