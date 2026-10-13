"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function SettingsDialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto w-full max-w-[760px] rounded-2xl bg-white text-ink shadow-[0_24px_70px_rgba(0,0,0,.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
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
        <div className="px-5 pb-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-[#ebebeb] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
