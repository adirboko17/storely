"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { EMAIL_LINKS, EMAIL_VARS, SMS_LIMIT, getMarketingVersion, getSms, saveSms, subscribeMarketing, type MarketingSms } from "@/data/mock/marketing-session";

export function SmsEditorScreen({ smsId, fromFlow }: { smsId: string; fromFlow: string }) {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const existing = getSms(smsId);
  const missing = !existing;
  const baseline = existing ?? { id: smsId, name: "", text: "" };
  const [draft, setDraft] = useState<MarketingSms>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(smsId);
  if (bound !== smsId) {
    setBound(smsId);
    setDraft(baseline);
    setSaved(baseline);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  function save() {
    const next = { ...draft, text: draft.text.slice(0, SMS_LIMIT) };
    saveSms(next);
    setDraft(next);
    setSaved(next);
    toast("ה-SMS נשמר");
  }
  useUnsavedEditor(dirty, false, save, () => setDraft(saved));
  if (missing) notFound();
  const back = fromFlow ? `/admin/marketing/automations/${fromFlow}` : "/admin/marketing/emails";
  const left = SMS_LIMIT - draft.text.length;

  function write(text: string) {
    if (text.length > SMS_LIMIT) {
      toast("SMS מוגבל ל-250 תווים");
      setDraft({ ...draft, text: text.slice(0, SMS_LIMIT) });
      return;
    }
    setDraft({ ...draft, text });
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href={back} aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">מיילים ו-SMS /</span>
        <label className="flex min-w-0 items-center gap-1">
          <input aria-label="שם ההודעה" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-8 max-w-[280px] min-w-[4ch] border-0 bg-transparent px-0.5 text-[15px] font-bold outline-none" style={{ backgroundColor: "transparent", color: "#303030", fieldSizing: "content" }} />
          <Icon name="pencil" size={14} strokeWidth={1.7} className="shrink-0 text-[#8a8a8a]" />
        </label>
      </div>
      <div className="grid min-h-[calc(100dvh-92px)] gap-4 bg-[#f3f3f3] px-4 py-5 min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid place-items-center">
          <div className="w-[280px] rounded-[32px] bg-[#1a1a1a] p-2.5 shadow-[0_18px_40px_rgba(0,0,0,.16)]">
            <div className="min-h-[460px] rounded-[24px] bg-[#f3f3f3] px-3 py-8">
              <div className="max-w-[220px] rounded-2xl rounded-tr-md bg-white px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap text-[#1a1a1a] shadow-[0_0_0_1px_rgba(0,0,0,.04)]">
                {draft.text.trim() ? <Rich text={draft.text} /> : <span className="text-[#8a8a8a]">ההודעה תופיע כאן</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
          <div>
            <div className="text-sm font-semibold">הודעה</div>
            <p className="m-0 mt-0.5 text-[12px] leading-5 text-[#616161]">טקסט בלבד, בלי תמונה ובלי צבע. עד {SMS_LIMIT} תווים.</p>
          </div>
          <MessageField value={draft.text} onChange={write} />
          <div className="text-[12px] font-semibold" style={{ color: left < 20 ? "#8e1f0b" : "#616161" }}>{draft.text.length} / {SMS_LIMIT}</div>
        </div>
      </div>
    </div>
  );
}

function MessageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <textarea ref={input} value={value} rows={7} onChange={(event) => onChange(event.target.value)} className="w-full rounded-[10px] border border-[#c9c9c9] p-2 text-sm font-normal whitespace-pre-wrap" />
      <button type="button" aria-expanded={open} onClick={() => setOpen((next) => !next)} className="mt-1.5 inline-flex h-7 items-center gap-1 border-0 bg-transparent px-0 text-[12px] font-semibold text-[#5b3fc4]">
        משתנים
        <Icon name="chevron" size={12} strokeWidth={1.8} className={`transition-transform duration-300 ease-out ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className={`overflow-hidden ${open ? "" : "pointer-events-none"}`}>
          <div className={`flex flex-wrap gap-1 pt-1.5 transition-all duration-300 ease-out ${open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}>
            {EMAIL_VARS.map((item) => (
              <button key={item.token} type="button" title={item.detail} onClick={() => onChange(insertToken(item.token, value, input.current))} className="h-6 rounded-full border-0 bg-[#f3e8ff] px-2 text-[11px] font-semibold text-[#5b3fc4]">{item.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function insertToken(token: string, value: string, element: HTMLTextAreaElement | null) {
  if (!element) return `${value}${token}`.slice(0, SMS_LIMIT);
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`.slice(0, SMS_LIMIT);
  const place = Math.min(start + token.length, next.length);
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(place, place);
  });
  return next;
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{[a-z_]+\})/g);
  return parts.map((part, index) => {
    const token = [...EMAIL_VARS, ...EMAIL_LINKS].find((item) => item.token === part);
    if (!token) return <span key={index}>{part}</span>;
    return <span key={index} className="mx-0.5 inline-flex rounded-md bg-[#f3e8ff] px-1.5 py-0.5 align-middle text-[0.85em] font-semibold text-[#5b3fc4]">{token.label}</span>;
  });
}
