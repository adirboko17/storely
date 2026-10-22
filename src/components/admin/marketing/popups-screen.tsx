"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { blankPopup, deletePopup, listPopupLeads, listPopups, pagesLabel, savePopup, statusLabel, triggerLabel, type PopupLead, type StorePopup } from "@/lib/marketing/popups";

const statusTone: Record<StorePopup["status"], string> = {
  active: "bg-[#e3f1df] text-[#0c5132]",
  paused: "bg-[#fff1e3] text-[#5e4200]",
  draft: "bg-[#f1f1f1] text-[#4a4a4a]",
};

export function PopupsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [popups, setPopups] = useState<StorePopup[] | null>(null);
  const [leadPopup, setLeadPopup] = useState<StorePopup | null>(null);

  useEffect(() => {
    let alive = true;
    listPopups().then((rows) => { if (alive) setPopups(rows); }).catch((error: Error) => toast(error.message));
    return () => { alive = false; };
  }, [toast]);

  async function create() {
    try {
      const popup = await savePopup(blankPopup());
      router.push(`/admin/marketing/popups/${popup.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו ליצור פופאפ");
    }
  }

  async function copy(popup: StorePopup) {
    try {
      const next = await savePopup({ ...blankPopup(), name: `${popup.name} עותק`.slice(0, 80), design: popup.design, targeting: popup.targeting, status: "draft", startsAt: popup.startsAt, endsAt: popup.endsAt });
      toast("הפופאפ שוכפל כטיוטה");
      router.push(`/admin/marketing/popups/${next.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו לשכפל");
    }
  }

  async function remove(popup: StorePopup) {
    if (!window.confirm(`למחוק את "${popup.name}"?`)) return;
    try {
      await deletePopup(popup.id);
      setPopups((current) => current?.filter((row) => row.id !== popup.id) ?? current);
    } catch (error) {
      toast(error instanceof Error ? error.message : "לא הצלחנו למחוק");
    }
  }

  const rows = popups ?? [];
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[15px] font-bold">פופאפים</h1>
          <button type="button" className={darkButton} onClick={() => void create()}>פופאפ חדש</button>
        </div>
        <p className="m-0 text-sm text-[#4a4a4a]">חלון שנפתח למבקר באתר. לוחצים על מספר הלידים כדי לראות מי השאיר פרטים.</p>
        <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="grid h-[34px] grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,.8fr)_120px_150px] items-center gap-2.5 bg-[#f7f7f7] px-4 text-[13px] font-semibold text-[#4a4a4a]">
            <span>שם</span><span>מצב</span><span>מתי</span><span>איפה</span><span>לידים</span><span />
          </div>
          {popups === null ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">טוען פופאפים…</div> : null}
          {popups && rows.length === 0 ? <div className="px-4 py-6 text-sm text-[#4a4a4a]">עדיין אין פופאפים. הראשון נשאר טיוטה עד שלוחצים על פרסום.</div> : null}
          {rows.map((popup) => (
            <div key={popup.id} className="grid cursor-pointer grid-cols-[minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,.8fr)_120px_150px] items-center gap-2.5 border-t border-[#f1f1f1] px-4 py-2.5 hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/marketing/popups/${popup.id}`)}>
              <b className="truncate">{popup.name}</b>
              <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[popup.status]}`}>{statusLabel(popup.status)}</span>
              <span className="truncate text-sm">{triggerLabel(popup)}</span>
              <span className="truncate text-sm">{pagesLabel(popup)}</span>
              <button type="button" onClick={(event) => { event.stopPropagation(); setLeadPopup(popup); }} className="inline-flex h-8 w-fit items-center rounded-full border-0 bg-[#f3f3f3] px-3 text-sm font-semibold hover:bg-[#1a1a1a] hover:text-white">{popup.leadCount === 1 ? "ליד אחד" : `${popup.leadCount} לידים`}</button>
              <span className="flex gap-1.5">
                <button type="button" className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={(event) => { event.stopPropagation(); void copy(popup); }}>שכפול</button>
                <button type="button" className="h-7 rounded-lg border-0 bg-[#f1f1f1] px-2.5 text-[12px] font-semibold" onClick={(event) => { event.stopPropagation(); void remove(popup); }}>מחיקה</button>
              </span>
            </div>
          ))}
        </div>
      </div>
      {leadPopup ? <LeadsDialog popup={leadPopup} onClose={() => setLeadPopup(null)} /> : null}
    </div>
  );
}

function fieldLabel(key: string) {
  if (key === "email") return "אימייל";
  if (key === "tel" || key === "phone") return "טלפון";
  if (key === "name") return "שם";
  if (key === "note" || key === "message") return "הערה";
  return key;
}

function LeadsDialog({ popup, onClose }: { popup: StorePopup; onClose: () => void }) {
  const [leads, setLeads] = useState<PopupLead[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listPopupLeads(popup.id).then((rows) => { if (alive) setLeads(rows); }).catch((reason: Error) => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [popup.id]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="popup-leads-title" className="flex max-h-[min(720px,86vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(0,0,0,.24)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <b id="popup-leads-title" className="block truncate text-base">{popup.name}</b>
            <span className="text-sm text-[#616161]">{popup.leadCount === 1 ? "ליד אחד נכנס" : `${popup.leadCount} לידים נכנסו`}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="grid size-8 place-items-center rounded-full border-0 bg-[#f3f3f3] text-lg">×</button>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-5">
          {error ? <p className="m-0 text-sm text-[#8a1f11]">{error}</p> : null}
          {leads === null && !error ? <p className="m-0 text-sm text-[#616161]">טוען לידים…</p> : null}
          {leads && leads.length === 0 ? <p className="m-0 rounded-2xl bg-[#f7f7f7] px-4 py-8 text-center text-sm text-[#616161]">עדיין לא נשלח טופס מהפופאפ הזה.</p> : null}
          {leads?.map((lead) => (
            <article key={lead.id} className="rounded-2xl bg-[#f7f7f7] px-4 py-3">
              <div className="text-xs text-[#8a8a8a]">{new Date(lead.createdAt).toLocaleString("he-IL")} · {lead.pagePath || "/"}</div>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                {Object.entries(lead.fields).map(([key, value]) => (
                  <div key={key} className="flex gap-2"><span className="w-16 shrink-0 text-[#616161]">{fieldLabel(key)}</span><b className="min-w-0 break-words">{value}</b></div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
