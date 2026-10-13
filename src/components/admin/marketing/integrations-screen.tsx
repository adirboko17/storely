"use client";

import { useState, useSyncExternalStore } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import {
  EVENT_LABELS,
  INTEGRATIONS,
  connectedIntegrations,
  disconnectIntegration,
  getMarketingVersion,
  saveIntegration,
  subscribeMarketing,
  type IntegrationState,
} from "@/data/mock/marketing-session";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;
const GROUPS = [
  ["פרסום ורשתות חברתיות", "מדידת המרות מקמפיינים ובניית קהלים", "פרסום"],
  ["ניתוח ומדידה", "הבנת התנועה וההתנהגות בחנות", "ניתוח"],
  ["קוד מותאם", "לכלים שאין להם אינטגרציה מוכנה", "קוד"],
] as const;

export function IntegrationsScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const connected = connectedIntegrations();
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<IntegrationState>({ id: "", token: "", events: [0, 1, 2, 3, 4], consent: true, head: "", body: "" });
  const [error, setError] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = INTEGRATIONS.filter((item) => !needle || `${item.name} ${item.detail}`.toLowerCase().includes(needle));
  const live = visible.filter((item) => connected[item.key]);
  const current = INTEGRATIONS.find((item) => item.key === openKey);

  function open(key: string) {
    const item = connected[key];
    setDraft(item ? { ...item, events: [...item.events] } : { id: "", token: "", events: [0, 1, 2, 3, 4], consent: true, head: "", body: "" });
    setError("");
    setOpenKey(key);
  }

  function save() {
    if (!current || !openKey) return;
    if (current.key === "code") {
      if (!draft.head.trim() && !draft.body.trim()) {
        setError("הוסיפו קוד באחד השדות");
        toast("הוסיפו קוד באחד השדות");
        return;
      }
    } else if (!current.pattern.test(draft.id)) {
      setError(current.error);
      return;
    }
    const wasOn = Boolean(connected[openKey]);
    saveIntegration(openKey, draft);
    setOpenKey(null);
    toast(wasOn ? "ההגדרות נשמרו" : `${current.name} חובר בהצלחה`);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-7 px-6 pt-10 pb-24">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[260px] flex-1">
          <h1 className="m-0 text-[26px] leading-8 font-semibold text-[#1a1a1a]">אינטגרציות</h1>
          <p className="m-0 max-w-[560px] leading-[21px] text-pretty text-[#4a4a4a]">חברו פיקסלים, תגי מעקב וכלי ניתוח. הקוד נטען בכל עמודי החנות ובקופה, והאירועים נשלחים אוטומטית.</p>
        </div>
        <div className="flex h-9 w-[280px] max-w-full items-center gap-2 rounded-[10px] bg-white px-3 text-ink-secondary shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש אינטגרציה" className="min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
        </div>
      </div>
      {live.length ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2"><h2 className="m-0 text-[15px] font-semibold">מחוברות</h2><span className="inline-flex h-5 items-center rounded-md bg-[#cdfee1] px-[7px] text-xs font-semibold text-[#0c5132]">{live.length}</span></div>
          <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            {live.map((item) => {
              const state = connected[item.key];
              return (
                <button key={item.key} type="button" className="flex w-full flex-wrap items-center gap-x-5 gap-y-3 border-0 border-b border-[#f1f1f1] bg-white px-[18px] py-3.5 text-start hover:bg-[#fafafa]" onClick={() => open(item.key)}>
                  <span className="grid size-10 place-items-center rounded-xl text-[15px] font-extrabold text-white" style={{ background: item.color }}>{item.mark}</span>
                  <span className="min-w-[180px] flex-1"><b className="block">{item.name}</b><span className="text-xs text-ink-secondary">{item.sub}</span></span>
                  <span dir="ltr" className="font-mono text-[13px]">{item.key === "code" ? `${(state?.head.length ?? 0) + (state?.body.length ?? 0)} תווים` : state?.id}</span>
                  <span className="text-[13px] font-semibold text-[#0c5132]">פעיל</span>
                  <span className="text-[13px] text-[#4a4a4a]">{item.events ? `${state?.events.length ?? 0} מתוך 5 אירועים` : "—"}</span>
                  <span className="inline-flex h-[30px] items-center rounded-[10px] bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.12)]">ניהול</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {GROUPS.map(([title, detail, cat]) => {
        const cards = visible.filter((item) => item.cat === cat && !connected[item.key]);
        if (!cards.length) return null;
        return (
          <section key={cat} className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
            <p className="m-0 text-sm text-[#4a4a4a]">{detail}</p>
            <div className="grid gap-3 min-[800px]:grid-cols-2">
              {cards.map((item) => (
                <div key={item.key} className="flex flex-col gap-2 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                  <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-[10px] font-extrabold text-white" style={{ background: item.color }}>{item.mark}</span><b>{item.name}</b></div>
                  <p className="m-0 text-sm text-[#4a4a4a]">{item.detail}</p>
                  <button type="button" className={`${darkButton} self-start`} onClick={() => open(item.key)}>חיבור</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {openKey && current ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onClick={() => setOpenKey(null)}>
          <div role="dialog" aria-label={current.name} className="max-h-[90vh] w-full max-w-[520px] overflow-auto rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="m-0 text-base font-bold">{current.name}</h2>
            {current.key === "code" ? (
              <>
                <label className="mt-3 block text-sm font-semibold">head<textarea value={draft.head} onChange={(event) => setDraft({ ...draft, head: event.target.value })} rows={4} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label>
                <label className="mt-3 block text-sm font-semibold">body<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={4} className="mt-1 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-2 font-normal" /></label>
              </>
            ) : (
              <label className="mt-3 block text-sm font-semibold">{current.idLabel}
                <input dir="ltr" value={draft.id} onChange={(event) => { setDraft({ ...draft, id: event.target.value.trim() }); setError(""); }} placeholder={current.placeholder} className="mt-1 h-[34px] w-full rounded-[10px] border bg-white px-3 text-end font-normal" style={{ borderColor: error ? "#e51c00" : "#c9c9c9" }} />
              </label>
            )}
            {error ? <div className="mt-1 text-[13px] text-[#8e1f0b]">{error}</div> : null}
            {current.events ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {EVENT_LABELS.map((label, index) => (
                  <label key={label} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.events.includes(index)} onChange={() => setDraft({ ...draft, events: draft.events.includes(index) ? draft.events.filter((item) => item !== index) : [...draft.events, index] })} className="size-4 accent-[#303030]" />{label}</label>
                ))}
              </div>
            ) : null}
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.consent} onChange={(event) => setDraft({ ...draft, consent: event.target.checked })} className="size-4 accent-[#303030]" />כבוד להסכמת עוגיות</label>
            <div className="mt-4 flex justify-end gap-2">
              {connected[openKey] ? <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_#d4d4d4]" onClick={() => { disconnectIntegration(openKey); setOpenKey(null); toast(`${current.name} נותק`); }}>ניתוק</button> : null}
              <button type="button" className={softButton} onClick={() => setOpenKey(null)}>ביטול</button>
              <button type="button" className={darkButton} onClick={save}>{connected[openKey] ? "שמירה" : "חיבור"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
