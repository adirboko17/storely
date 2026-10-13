"use client";

import { Icon } from "@/components/ui/icon";
import { useAdmin } from "@/components/admin/layout/admin-provider";

export function ToastViewport() {
  const { toastMessage, dismissToast } = useAdmin();
  if (!toastMessage) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 animate-[toast-in_.2s_ease-out] items-center gap-3 rounded-[10px] bg-shell py-2.5 pr-4 pl-3 font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,.25)]"
    >
      <span>{toastMessage}</span>
      <button
        type="button"
        aria-label="סגירה"
        onClick={dismissToast}
        className="grid size-[22px] place-items-center text-[#b5b5b5]"
      >
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
