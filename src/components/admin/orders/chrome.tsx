"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { assistantDestination } from "@/lib/navigation/nav";

export const softButton =
  "inline-flex h-[30px] items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-ink shadow-[0_0_0_1px_rgba(0,0,0,.1),0_1px_1px_rgba(0,0,0,.04)] hover:bg-[#f7f7f7]";

export const darkButton =
  "inline-flex h-[30px] items-center rounded-[10px] border-0 bg-[#1a1a1a] px-3.5 text-sm font-semibold text-white no-underline hover:bg-[#303030] hover:no-underline";

export const menuItem =
  "flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm text-ink hover:bg-[#f1f1f1]";

export function menuPanel(align: "start" | "end" = "end") {
  return `absolute top-9 z-50 rounded-xl bg-white p-1.5 shadow-[var(--shadow-popover)] ${align === "end" ? "left-0" : "right-0"}`;
}

function Chevron({ direction }: { direction: "up" | "down" | "left" | "right" }) {
  const path =
    direction === "down"
      ? "M6 8l4 4 4-4"
      : direction === "up"
        ? "M6 12l4-4 4 4"
        : direction === "right"
          ? "M8 6l4 4-4 4"
          : "M12 6l-4 4 4 4";
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function AssistantPill() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [query, setQuery] = useState("");
  const ready = query.trim().length > 0;

  function send() {
    const text = query.trim();
    if (!text) return;
    setQuery("");
    const destination = assistantDestination(text);
    if (!destination) {
      toast("העוזר יוכל לענות על שאלות כאלה בשלב הבא");
      return;
    }
    router.push(destination.href);
    toast(destination.toast);
  }

  return (
    <div className="pointer-events-auto flex h-11 w-full max-w-[400px] items-center gap-2 rounded-[14px] bg-white py-0 pr-3 pl-2 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_6px_18px_rgba(0,0,0,.12)]">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#ede7fb] text-[#5b3fc4]">
        <Icon name="spark" size={14} strokeWidth={1.8} />
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="שאלו את העוזר"
        className="h-8 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
      />
      <button
        type="button"
        aria-label="שליחה"
        onClick={send}
        className="grid size-7 place-items-center rounded-lg border-0"
        style={{ background: ready ? "#303030" : "#f1f1f1", color: ready ? "#fff" : "#b5b5b5" }}
      >
        <Icon name="send" size={16} strokeWidth={1.9} />
      </button>
    </div>
  );
}

export function IndexDock({ pageLabel }: { pageLabel: string }) {
  return (
    <div className="sticky bottom-2.5 z-[5] flex items-center gap-3 px-3 pointer-events-none">
      <div className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl bg-white px-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08),0_4px_14px_rgba(0,0,0,.1)]">
        <button type="button" disabled aria-label="הקודם" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#b5b5b5]">
          <Chevron direction="right" />
        </button>
        <span dir="ltr" className="px-1.5 text-[13px] text-ink">
          {pageLabel}
        </span>
        <button type="button" disabled aria-label="הבא" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#b5b5b5]">
          <Chevron direction="left" />
        </button>
      </div>
      <div className="flex flex-1 justify-center">
        <AssistantPill />
      </div>
      <div className="w-[120px]" />
    </div>
  );
}

export function AssistantDock() {
  return (
    <div className="sticky bottom-2.5 z-[5] flex justify-center pointer-events-none">
      <AssistantPill />
    </div>
  );
}

export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-[200px] flex-1 items-center gap-2 px-1.5 text-ink-secondary">
      <Icon name="search" size={16} strokeWidth={1.8} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="חיפוש וסינון"
        className="h-[30px] min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
      />
    </div>
  );
}

export function ColumnsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="עמודות"
      onClick={onClick}
      className="grid size-[30px] place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 4.5h13v11h-13zM8 4.5v11M12 4.5v11" />
      </svg>
    </button>
  );
}

export function StatusPill({
  label,
  background,
  color,
  dot = "square",
}: {
  label: string;
  background: string;
  color: string;
  dot?: "square" | "ring" | "none";
}) {
  return (
    <span
      className="inline-flex h-5 items-center gap-1.5 rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap"
      style={{ background, color }}
    >
      {dot === "square" ? <span className="size-[7px] rounded-[2px] bg-current opacity-75" /> : null}
      {dot === "ring" ? <span className="box-border size-[7px] rounded-full border-[1.5px] border-current" /> : null}
      {label}
    </span>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M7 7h9v9H7zM4 13V4h9" />
    </svg>
  );
}
