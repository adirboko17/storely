"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { SlicePending, useAdminSlice } from "@/components/admin/slice-pending";
import { EmailHtmlPreview } from "@/components/admin/marketing/email-html-preview";
import { EmailPreview, InboxPreview } from "@/components/admin/marketing/email-preview";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { uploadEmailImage } from "@/data/live/email-media";
import { getStoreIdentity } from "@/data/live/store-identity";
import { blankBlock, EMAIL_FONTS, EMAIL_LINKS, EMAIL_SIZES, EMAIL_VARS, getEmail, getMarketingVersion, saveEmail, subscribeMarketing, type EmailAlign, type EmailBlock, type EmailLook, type EmailWeight, type MarketingEmail } from "@/data/mock/marketing-session";
import { brandPalette, getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";

const field = "mt-1 h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 font-normal";
const area = "mt-1 w-full rounded-[10px] border border-[#c9c9c9] p-2 font-normal";
const palette: Array<{ type: EmailBlock["type"]; label: string; detail: string }> = [
  { type: "image", label: "תמונה", detail: "באנר או גרפיקה" },
  { type: "logo", label: "לוגו", detail: "הלוגו מההגדרות" },
  { type: "heading", label: "כותרת", detail: "שורה גדולה" },
  { type: "text", label: "טקסט", detail: "פסקה" },
  { type: "button", label: "כפתור", detail: "קישור לפעולה" },
  { type: "columns", label: "שתי עמודות", detail: "שני טקסטים זה לצד זה" },
  { type: "spacer", label: "רווח", detail: "אוויר בין חלקים" },
  { type: "divider", label: "קו", detail: "הפרדה דקה" },
];

const blockNames: Record<EmailBlock["type"], string> = {
  image: "תמונה",
  logo: "לוגו",
  heading: "כותרת",
  text: "טקסט",
  button: "כפתור",
  columns: "שתי עמודות",
  spacer: "רווח",
  divider: "קו",
};

export function EmailEditorScreen({ emailId, fromFlow }: { emailId: string; fromFlow: string }) {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeMarketing, getMarketingVersion, () => 0);
  const deskReady = useAdminSlice("desk");
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const existing = getEmail(emailId);
  const missing = !existing;
  const baseline = existing ?? { id: emailId, name: "", subject: "", preview: "", blocks: [] };
  const [draft, setDraft] = useState<MarketingEmail>(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(emailId);
  const [selected, setSelected] = useState("");
  const [phase, setPhase] = useState<"design" | "inbox" | "html">("design");
  const [dragging, setDragging] = useState(false);
  const [uploadingId, setUploadingId] = useState("");
  if (bound !== emailId) {
    setBound(emailId);
    setDraft(baseline);
    setSaved(baseline);
    setSelected("");
    setPhase("design");
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  function save() {
    saveEmail(draft);
    setSaved(draft);
    toast("המייל נשמר");
  }
  useUnsavedEditor(dirty, false, save, () => setDraft(saved));
  if (missing && !deskReady) return <SlicePending label="טוען מייל…" />;
  if (missing) notFound();
  const block = draft.blocks.find((item) => item.id === selected) ?? null;
  const back = fromFlow ? `/admin/marketing/automations/${fromFlow}` : "/admin/marketing/emails";

  function insert(index: number, next: EmailBlock) {
    setDraft((current) => {
      const blocks = [...current.blocks];
      blocks.splice(index, 0, next);
      return { ...current, blocks };
    });
    setSelected(next.id);
  }

  function moveTo(id: string, index: number) {
    setDraft((current) => {
      const from = current.blocks.findIndex((item) => item.id === id);
      if (from < 0) return current;
      const blocks = [...current.blocks];
      const [item] = blocks.splice(from, 1);
      if (!item) return current;
      blocks.splice(from < index ? index - 1 : index, 0, item);
      return { ...current, blocks };
    });
    setSelected(id);
  }

  async function uploadInto(blockId: string, file: File) {
    setUploadingId(blockId);
    try {
      const src = await uploadEmailImage(getStoreIdentity().storeId, file);
      setDraft((current) => ({
        ...current,
        blocks: current.blocks.map((item) => (item.id === blockId && item.type === "image" ? { ...item, src } : item)),
      }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "העלאת התמונה נכשלה");
    } finally {
      setUploadingId("");
    }
  }

  function dropAt(index: number, payload: string, file?: File) {
    if (file?.type.startsWith("image/")) {
      const next = blankBlock("image");
      insert(index, next);
      void uploadInto(next.id, file);
      return;
    }
    if (payload.startsWith("new:")) {
      const type = payload.slice(4);
      if (!palette.some((item) => item.type === type)) return;
      insert(index, blankBlock(type as EmailBlock["type"]));
      return;
    }
    if (payload.startsWith("move:")) moveTo(payload.slice(5), index);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Link href={back} aria-label="חזרה" className="grid size-[30px] place-items-center rounded-full bg-white text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1)]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <span className="text-sm text-[#4a4a4a]">מיילים ו-SMS /</span>
        <label className="flex min-w-0 items-center gap-1">
          <input aria-label="שם המייל" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-8 max-w-[280px] min-w-[4ch] border-0 bg-transparent px-0.5 text-[15px] font-bold outline-none" style={{ backgroundColor: "transparent", color: "#303030", fieldSizing: "content" }} />
          <Icon name="pencil" size={14} strokeWidth={1.7} className="shrink-0 text-[#8a8a8a]" />
        </label>
        <div className="ms-auto flex rounded-full bg-[#f1f1f1] p-0.5">
          <button type="button" onClick={() => setPhase("design")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${phase === "design" ? "bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>המייל</button>
          <button type="button" onClick={() => setPhase("inbox")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${phase === "inbox" ? "bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>בתיבת הדואר</button>
          <button type="button" onClick={() => setPhase("html")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${phase === "html" ? "bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-transparent text-[#616161]"}`}>HTML</button>
        </div>
      </div>
      {phase === "html" ? (
        <div className="min-h-[calc(100dvh-92px)] bg-[#f3f3f3] px-4 py-5">
          <EmailHtmlPreview email={draft} storeName={getStoreIdentity().name} logoUrl={getSettings().logo} />
        </div>
      ) : phase === "inbox" ? (
        <div className="flex min-h-[calc(100dvh-92px)] flex-col gap-4 bg-[#f3f3f3] px-4 py-5">
          <div className="mx-auto grid w-full max-w-[860px] gap-4">
            <div className="grid gap-4 rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)] min-[720px]:grid-cols-2">
              <TokenField label="נושא" hint="השורה העבה, לפני שפותחים את המייל." value={draft.subject} onChange={(subject) => setDraft({ ...draft, subject })} />
              <TokenField label="תצוגה מקדימה" hint="המשפט האפור ליד הנושא. הוא לא מופיע בתוך המייל." value={draft.preview} onChange={(preview) => setDraft({ ...draft, preview })} />
            </div>
            <InboxPreview sender={getStoreIdentity().name} subject={draft.subject} preview={draft.preview} />
          </div>
        </div>
      ) : (
      <div className="grid min-h-[calc(100dvh-92px)] gap-4 bg-[#f3f3f3] px-4 py-5 min-[980px]:grid-cols-[240px_minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-bold text-[#616161]">גררו בלוק למייל</div>
          {palette.map((item) => (
            <button
              key={item.type}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", `new:${item.type}`);
                event.dataTransfer.effectAllowed = "copy";
                setDragging(true);
              }}
              onDragEnd={() => setDragging(false)}
              onClick={() => insert(draft.blocks.length, blankBlock(item.type))}
              className="cursor-grab rounded-xl border-0 bg-white px-3 py-2 text-start shadow-[0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#fafafa] active:cursor-grabbing"
            >
              <b className="block text-sm">{item.label}</b>
              <span className="text-[12px] text-[#616161]">{item.detail}</span>
            </button>
          ))}
        </div>
        <EmailPreview
          email={draft}
          selectedId={selected}
          dragging={dragging}
          uploadingId={uploadingId}
          onSelect={setSelected}
          onDragBlock={() => setDragging(true)}
          onDragEnd={() => setDragging(false)}
          onDropAt={dropAt}
          onUpload={(blockId, file) => void uploadInto(blockId, file)}
          onRemove={(id) => { setDraft((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== id) })); setSelected(""); }}
          logo={getSettings().logo}
        />
        <div className="flex h-full flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
          {block ? (
            <BlockFields
              block={block}
              uploading={uploadingId === block.id}
              onChange={(next) => setDraft((current) => ({ ...current, blocks: current.blocks.map((item) => (item.id === next.id ? next : item)) }))}
              onUpload={(file) => void uploadInto(block.id, file)}
              onRemove={() => { setDraft((current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) })); setSelected(""); }}
            />
          ) : <p className="m-0 text-sm text-[#4a4a4a]">בחרו בלוק במייל כדי לשנות אותו. אפשר גם לגרור בלוקים מהצד, או תמונה ישר לתוך המייל.</p>}
          <button type="button" onClick={() => setPhase("inbox")} className="mt-auto h-9 rounded-[10px] border-0 bg-[#f1f1f1] text-sm font-semibold text-[#1a1a1a]">המשך לנושא ולתצוגה בתיבה</button>
        </div>
      </div>
      )}
    </div>
  );
}

function BlockFields({ block, uploading, onChange, onUpload, onRemove }: { block: EmailBlock; uploading: boolean; onChange: (next: EmailBlock) => void; onUpload: (file: File) => void; onRemove: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <b className="flex-1 text-sm">{blockNames[block.type]}</b>
        <button type="button" aria-label="מחיקה" onClick={onRemove} className="grid size-8 place-items-center rounded-full border-0 bg-transparent text-[#6b6b6b] hover:bg-[#f3f3f3] hover:text-[#1a1a1a]">
          <Icon name="trash" size={16} strokeWidth={1.6} />
        </button>
      </div>
      {block.type === "logo" ? (
        <p className="m-0 text-sm leading-6 text-[#4a4a4a]">הלוגו נמשך אוטומטית מההגדרות הכלליות. <Link href="/admin/settings" className="font-semibold text-[#1a1a1a]">להעלאת לוגו</Link></p>
      ) : null}
      {block.type === "image" ? (
        <>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) onUpload(next); event.target.value = ""; }} />
          <button type="button" disabled={uploading} onClick={() => file.current?.click()} className="h-9 rounded-[10px] border-0 bg-[#1a1a1a] text-sm font-semibold text-white disabled:opacity-60">{uploading ? "מעלים…" : block.src ? "החלפת תמונה" : "העלאת תמונה"}</button>
          <label className="text-sm font-semibold">תיאור<input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} className={field} /></label>
          <LinkPicker value={block.href} onChange={(href) => onChange({ ...block, href })} />
        </>
      ) : null}
      {block.type === "heading" || block.type === "text" ? (
        <>
          <Align value={block.align} onChange={(align) => onChange({ ...block, align })} />
          <TypeStyle look={block} onChange={(look) => onChange({ ...block, ...look })} />
          <ColorField label="צבע הטקסט" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <TokenArea label={block.type === "heading" ? "כותרת" : "טקסט"} value={block.text} rows={block.type === "heading" ? 3 : 6} onChange={(text) => onChange({ ...block, text })} />
        </>
      ) : null}
      {block.type === "button" ? (
        <>
          <Align value={block.align} onChange={(align) => onChange({ ...block, align })} />
          <TypeStyle look={block} onChange={(look) => onChange({ ...block, ...look })} />
          <ColorField label="צבע הכפתור" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <ColorField label="צבע הכיתוב" value={block.textColor} onChange={(textColor) => onChange({ ...block, textColor })} />
          <TokenField label="טקסט הכפתור" value={block.label} onChange={(label) => onChange({ ...block, label })} />
          <LinkPicker value={block.href} onChange={(href) => onChange({ ...block, href })} />
        </>
      ) : null}
      {block.type === "columns" ? (
        <>
          <TypeStyle look={block} onChange={(look) => onChange({ ...block, ...look })} />
          <ColorField label="צבע הטקסט" value={block.color} onChange={(color) => onChange({ ...block, color })} />
          <TokenArea label="עמודה ראשונה" value={block.left} rows={4} onChange={(left) => onChange({ ...block, left })} />
          <TokenArea label="עמודה שנייה" value={block.right} rows={4} onChange={(right) => onChange({ ...block, right })} />
        </>
      ) : null}
      {block.type === "divider" ? <ColorField label="צבע הקו" value={block.color} onChange={(color) => onChange({ ...block, color })} /> : null}
      {block.type === "spacer" ? (
        <div className="flex gap-2">
          {(["s", "m", "l"] as const).map((size) => (
            <button key={size} type="button" onClick={() => onChange({ ...block, size })} className="h-8 flex-1 rounded-[10px] border-0 text-sm font-semibold" style={{ background: block.size === size ? "#1a1a1a" : "#f1f1f1", color: block.size === size ? "#fff" : "#1a1a1a" }}>{size === "s" ? "קטן" : size === "l" ? "גדול" : "בינוני"}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const current = value || "#1a1a1a";
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {brandPalette().map((color, index) => (
          <button key={`${color}-${index}`} type="button" aria-label={color} onClick={() => onChange(color)} className="size-6 rounded-full" style={{ background: color, boxShadow: current.toLowerCase() === color ? "0 0 0 2px #fff, 0 0 0 4px #1a1a1a" : "0 0 0 1px rgba(0,0,0,.16)" }} />
        ))}
        <label className="relative grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full text-[11px] font-bold" style={{ background: current, color: current.toLowerCase() === "#ffffff" ? "#1a1a1a" : "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.16)" }}>
          +
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#1a1a1a"} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}

function insertToken(token: string, value: string, element: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!element) return `${value}${token}`;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
  const place = start + token.length;
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(place, place);
  });
  return next;
}

function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen((next) => !next)} className="inline-flex h-7 items-center gap-1 rounded-full border-0 bg-transparent px-0 text-[12px] font-semibold text-[#5b3fc4]">
        משתנים
        <Icon name="chevron" size={12} strokeWidth={1.8} className={`transition-transform duration-300 ease-out ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className={`overflow-hidden ${open ? "" : "pointer-events-none"}`}>
          <div className={`flex flex-wrap gap-1 pt-1.5 transition-all duration-300 ease-out ${open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}>
            {EMAIL_VARS.map((item) => (
              <button key={item.token} type="button" title={item.detail} onClick={() => onInsert(item.token)} className="h-6 rounded-full border-0 bg-[#f3e8ff] px-2 text-[11px] font-semibold text-[#5b3fc4]">{item.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
        {hint ? <span className="mt-0.5 block text-[12px] leading-5 font-normal text-[#616161]">{hint}</span> : null}
        <input ref={input} value={value} onChange={(event) => onChange(event.target.value)} className={field} />
      </label>
      <VariableChips onInsert={(token) => onChange(insertToken(token, value, input.current))} />
    </div>
  );
}

function TokenArea({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
        <textarea ref={input} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className={area} />
      </label>
      <VariableChips onInsert={(token) => onChange(insertToken(token, value, input.current))} />
    </div>
  );
}

function LinkPicker({ value, onChange }: { value: string; onChange: (href: string) => void }) {
  const preset = EMAIL_LINKS.find((item) => item.token === value);
  return (
    <div>
      <div className="text-sm font-semibold">קישור</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {EMAIL_LINKS.map((item) => {
          const selected = value === item.token;
          return (
            <button key={item.token} type="button" title={selected ? "לחיצה נוספת מבטלת" : item.detail} onClick={() => onChange(selected ? "" : item.token)} className="h-7 rounded-full border-0 px-2.5 text-[12px] font-semibold" style={{ background: selected ? "#1a1a1a" : "#f1f1f1", color: selected ? "#fff" : "#1a1a1a" }}>{item.label}</button>
          );
        })}
      </div>
      {preset ? <p className="m-0 mt-1.5 text-[12px] leading-5 text-[#616161]">{preset.detail}. לחיצה נוספת על אותו קישור מבטלת אותו.</p> : null}
      <input dir="ltr" value={preset ? "" : value} placeholder="או כתובת משלכם" onChange={(event) => onChange(event.target.value)} className={`${field} text-left`} />
    </div>
  );
}

function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((next) => !next)} className="inline-flex h-7 items-center gap-1 rounded-full border-0 bg-transparent px-0 text-[13px] font-semibold text-[#1a1a1a]">
        {label}
        <Icon name="chevron" size={12} strokeWidth={1.8} className={`text-[#8a8a8a] transition-transform duration-300 ease-out ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className={`overflow-hidden ${open ? "" : "pointer-events-none"}`}>
          <div className={`pb-1 transition-all duration-300 ease-out ${open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function chip(selected: boolean) {
  return { background: selected ? "#1a1a1a" : "#f1f1f1", color: selected ? "#fff" : "#1a1a1a" };
}

function TypeStyle({ look, onChange }: { look: EmailLook; onChange: (look: EmailLook) => void }) {
  const fonts = [{ id: "", label: "ברירת המחדל" }, ...EMAIL_FONTS];
  const weights: Array<{ id: EmailWeight; label: string }> = [
    { id: 400, label: "רגיל" },
    { id: 500, label: "בינוני" },
    { id: 700, label: "מודגש" },
  ];
  const marks = [
    { key: "italic" as const, label: "נטוי", style: { fontStyle: "italic" as const } },
    { key: "underline" as const, label: "קו תחתון", style: { textDecoration: "underline" } },
    { key: "strike" as const, label: "קו חוצה", style: { textDecoration: "line-through" } },
  ];
  return (
    <div className="flex flex-col">
      <Fold label="פונט">
        <div className="flex flex-wrap gap-1">
          {fonts.map((item) => (
            <button key={item.id || "default"} type="button" onClick={() => onChange({ ...look, font: item.id })} className="h-7 rounded-full border-0 px-2.5 text-[12px] font-semibold" style={{ ...chip(look.font === item.id), fontFamily: item.id ? `"${item.id}", sans-serif` : undefined }}>{item.label}</button>
          ))}
        </div>
      </Fold>
      <Fold label="גודל">
        <div className="flex flex-wrap gap-1">
          {EMAIL_SIZES.map((size) => (
            <button key={size} type="button" onClick={() => onChange({ ...look, size })} className="h-7 min-w-8 rounded-full border-0 px-2 text-[12px] font-semibold" style={chip(look.size === size)}>{size}</button>
          ))}
        </div>
      </Fold>
      <Fold label="משקל">
        <div className="flex gap-1">
          {weights.map((item) => (
            <button key={item.id} type="button" onClick={() => onChange({ ...look, weight: item.id })} className="h-7 flex-1 rounded-full border-0 px-2 text-[12px]" style={{ ...chip(look.weight === item.id), fontWeight: item.id }}>{item.label}</button>
          ))}
        </div>
      </Fold>
      <Fold label="עיטורים">
        <div className="flex gap-1">
          {marks.map((item) => (
            <button key={item.key} type="button" onClick={() => onChange({ ...look, [item.key]: !look[item.key] })} className="h-7 flex-1 rounded-full border-0 px-2 text-[12px] font-semibold" style={{ ...chip(look[item.key]), ...item.style }}>{item.label}</button>
          ))}
        </div>
      </Fold>
    </div>
  );
}

function Align({ value, onChange }: { value: EmailAlign; onChange: (align: EmailAlign) => void }) {
  return (
    <div className="flex gap-2">
      {([{ id: "start", label: "ימין" }, { id: "center", label: "מרכז" }, { id: "end", label: "שמאל" }] as const).map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} className="h-8 flex-1 rounded-[10px] border-0 text-sm font-semibold" style={{ background: value === item.id ? "#1a1a1a" : "#f1f1f1", color: value === item.id ? "#fff" : "#1a1a1a" }}>{item.label}</button>
      ))}
    </div>
  );
}
