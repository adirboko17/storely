"use client";

import { Icon } from "@/components/ui/icon";
import { useAdmin } from "@/components/admin/layout/admin-provider";

export function UnsavedBar() {
  const { editor } = useAdmin();
  if (!editor.dirty) return null;

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2.5 bg-shell px-4">
      <Icon name="warning" size={20} strokeWidth={1.7} className="text-[#ffb800]" />
      <span className="text-[15px] font-semibold text-white">שינויים שלא נשמרו</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={editor.onDiscard}
        className="h-8 rounded-lg bg-[#303030] px-3.5 text-sm font-semibold text-[#e3e3e3] shadow-[inset_0_0_0_1px_#616161] hover:bg-[#4a4a4a]"
      >
        ביטול שינויים
      </button>
      <button
        type="button"
        onClick={editor.onSave}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-[18px] text-sm font-bold text-shell hover:bg-[#ebebeb]"
      >
        {editor.saving ? (
          <span className="size-3.5 animate-[spin_.7s_linear_infinite] rounded-full border-2 border-[#b5b5b5] border-t-shell" />
        ) : null}
        שמירה
      </button>
    </div>
  );
}
