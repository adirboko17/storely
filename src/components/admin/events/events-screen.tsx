"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { formatMoney0 } from "@/lib/formatting/money";
import { deleteEvent, duplicateEvent, listEvents, statusLabel, type EventStatus, type StoreEvent } from "@/lib/events/events";

const statusTone: Record<EventStatus, string> = {
  open: "bg-[#e3f1df] text-[#0c5132]",
  full: "bg-[#fff1e3] text-[#5e4200]",
  ended: "bg-[#f1f1f1] text-[#4a4a4a]",
  cancelled: "bg-[#fde8e6] text-[#8a1f11]",
  draft: "bg-[#f1f1f1] text-[#4a4a4a]",
};

function when(event: StoreEvent) {
  const [year, month, day] = event.date.split("-");
  return `${day}.${month}.${year} · ${event.from}–${event.to}`;
}

export function EventsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [events, setEvents] = useState<StoreEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    listEvents().then((rows) => { if (alive) setEvents(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [toast]);

  async function copy(event: StoreEvent) {
    try {
      const next = await duplicateEvent(event);
      toast("האירוע שוכפל כטיוטה");
      router.push(`/admin/content/events/${next.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשכפל");
    }
  }

  async function remove(event: StoreEvent) {
    if (!window.confirm(`למחוק את "${event.title}"?`)) return;
    try {
      await deleteEvent(event);
      setEvents((current) => current?.filter((row) => row.id !== event.id) ?? current);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו למחוק");
    }
  }

  const rows = events ?? [];
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[15px] font-bold">אירועים</h1>
          <button type="button" className={darkButton} onClick={() => router.push("/admin/content/events/new")}>אירוע חדש</button>
        </div>
        <p className="m-0 text-sm text-[#4a4a4a]">סדנאות שמופיעות באתר. טיוטה לא מתפרסמת, וקישור הזום נשאר רק כאן.</p>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="grid h-[34px] grid-cols-[minmax(0,1.4fr)_180px_90px_90px_150px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]">
            <span>שם</span><span>תאריך</span><span>סטטוס</span><span>מחיר</span><span />
          </div>
          {events === null ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">טוען אירועים…</div> : null}
          {events && rows.length === 0 ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">עדיין אין אירועים. אירוע חדש נשמר כטיוטה עד שמשנים את הסטטוס.</div> : null}
          {rows.map((event) => (
            <div key={event.id} className="grid cursor-pointer grid-cols-[minmax(0,1.4fr)_180px_90px_90px_150px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-2.5 hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/content/events/${event.id}`)}>
              <b className="truncate">{event.title}</b>
              <span className="truncate text-sm">{when(event)}</span>
              <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[event.status]}`}>{statusLabel(event.status)}</span>
              <span className="text-sm">{event.price === 0 ? "חינם" : formatMoney0(event.price)}</span>
              <span className="flex gap-1.5">
                <button type="button" className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={(click) => { click.stopPropagation(); void copy(event); }}>שכפול</button>
                <button type="button" className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={(click) => { click.stopPropagation(); void remove(event); }}>מחיקה</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
