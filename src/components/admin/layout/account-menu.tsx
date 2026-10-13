"use client";

import type { ReactNode } from "react";
import { signOutPlatform } from "@/app/platform/actions";
import { Icon } from "@/components/ui/icon";

export function AccountMenu({
  open,
  onToggle,
  name,
  storeName,
  email,
  trailing,
}: {
  open: boolean;
  onToggle: () => void;
  name: string;
  storeName: string;
  email: string;
  trailing?: ReactNode;
}) {
  const label = name.trim() || "חשבון";

  return (
    <div className="relative flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-start text-sm font-semibold text-[#e3e3e3] hover:bg-[#2a2a2a]"
      >
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#1f8ceb] text-white">
          <Icon name="user" size={13} strokeWidth={1.8} />
        </span>
        <span className="truncate">{label}</span>
      </button>
      {trailing}
      {open ? (
        <div className="absolute inset-x-0 bottom-11 z-50 overflow-hidden rounded-2xl bg-white py-1.5 text-[#1a1a1a] shadow-[var(--shadow-popover)]">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Icon name="store" size={18} className="shrink-0 text-[#1a1a1a]" />
            <span className="truncate text-sm font-semibold">{storeName}</span>
          </div>
          <div className="mx-2 my-1 h-px bg-[#ebebeb]" />
          <div className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1f8ceb] text-white">
              <Icon name="user" size={16} strokeWidth={1.8} />
            </span>
            <span dir="ltr" className="min-w-0 flex-1 truncate text-right text-[13px] text-[#616161]">
              {email}
            </span>
          </div>
          <div className="mx-2 my-1 h-px bg-[#ebebeb]" />
          <form action={signOutPlatform}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm hover:bg-[#f6f6f6]"
            >
              <Icon name="logout" size={18} className="shrink-0" />
              התנתקות
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
