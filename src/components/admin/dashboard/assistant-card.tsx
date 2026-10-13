"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { assistantDestination } from "@/lib/navigation/nav";

export function AssistantCard() {
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
    <div className="flex w-full max-w-[640px] flex-col gap-2 rounded-2xl bg-white px-4 pt-3.5 pb-2.5 shadow-[var(--shadow-float)]">
      <textarea
        rows={2}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="שאלו את העוזר, או כתבו מה תרצו לעשות"
        className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[22px] text-ink outline-none"
      />
      <div className="flex items-center gap-1.5">
        <span className="grid size-6 place-items-center rounded-lg bg-[#ede7fb] text-[#5b3fc4]">
          <Icon name="spark" size={14} strokeWidth={1.8} />
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => toast("אין עדיין שיחות קודמות עם העוזר")}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-[#f1f1f1]"
        >
          <Icon name="clock" size={15} strokeWidth={1.7} />
          אחרונים
        </button>
        <span className="h-[18px] w-px bg-[#e3e3e3]" />
        <button
          type="button"
          aria-label="צירוף"
          className="grid size-7 place-items-center rounded-lg text-ink hover:bg-[#f1f1f1]"
        >
          <Icon name="plus" size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="שליחה"
          onClick={send}
          className="grid size-7 place-items-center rounded-lg"
          style={{ background: ready ? "#303030" : "#f1f1f1", color: ready ? "#fff" : "#b5b5b5" }}
        >
          <Icon name="send" size={16} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}
