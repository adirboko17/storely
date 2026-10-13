"use client";

import { Icon } from "@/components/ui/icon";
import { useAdmin } from "@/components/admin/layout/admin-provider";

export function TopBar() {
  const { toggleNav } = useAdmin();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 bg-shell px-2.5">
      <button
        type="button"
        aria-label="תפריט"
        onClick={toggleNav}
        className="grid size-[34px] place-items-center rounded-lg bg-[#303030] text-[#e3e3e3]"
      >
        <Icon name="menu" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/storely-logo.png" alt="Storely" className="block h-[26px] w-auto" />
    </div>
  );
}
