"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function SettingsDialog({
  title,
  onClose,
  children,
  footer,
  className,
  scroll = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-50 flex justify-center bg-black/45 px-4", scroll ? "items-center overflow-hidden py-6" : "items-start overflow-y-auto py-8")}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "w-full rounded-2xl bg-white text-ink shadow-[0_24px_70px_rgba(0,0,0,.28)]",
          scroll ? "flex max-h-[min(640px,calc(100vh-3rem))] max-w-[560px] flex-col overflow-hidden" : "my-auto max-w-[760px]",
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <button
            type="button"
            aria-label="סגירה"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className={cn("px-5 pb-4", scroll && "min-h-0 flex-1 overflow-y-auto")}>{children}</div>
        {footer ? <div className="flex shrink-0 justify-end gap-2 border-t border-[#ebebeb] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
