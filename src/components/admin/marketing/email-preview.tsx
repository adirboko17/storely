"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { EMAIL_LINKS, EMAIL_VARS, type EmailBlock, type MarketingEmail } from "@/data/mock/marketing-session";

const hebrewFonts = "https://fonts.googleapis.com/css2?family=Alef:wght@400;700&family=Assistant:wght@400;500;700&family=David+Libre:wght@400;500;700&family=Frank+Ruhl+Libre:wght@400;500;700&family=Fredoka:wght@400;500;700&family=Heebo:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Miriam+Libre:wght@400;700&family=Noto+Sans+Hebrew:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Noto+Serif+Hebrew:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Rubik:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=Secular+One&display=swap";

export function EmailPreview({
  email,
  selectedId,
  dragging,
  uploadingId,
  onSelect,
  onDragBlock,
  onDragEnd,
  onDropAt,
  onUpload,
  onRemove,
  logo,
}: {
  email: MarketingEmail;
  selectedId?: string;
  dragging: boolean;
  uploadingId: string;
  onSelect?: (id: string) => void;
  onDragBlock?: () => void;
  onDragEnd?: () => void;
  onDropAt?: (index: number, payload: string, file?: File) => void;
  onUpload?: (blockId: string, file: File) => void;
  onRemove?: (id: string) => void;
  logo?: string;
}) {
  useEffect(() => {
    const id = "storely-hebrew-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = hebrewFonts;
    document.head.appendChild(link);
  }, []);
  return (
    <div className="rounded-[28px] bg-[#e7e7e7] p-5">
      <div className="mx-auto max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_rgba(0,0,0,.08)]">
        <div className="flex flex-col py-2">
          {email.blocks.map((block, index) => (
            <div key={block.id}>
              {onDropAt ? <DropLine open={dragging} onDrop={(payload, file) => onDropAt(index, payload, file)} /> : null}
              <div
                draggable={Boolean(onDragBlock)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", `move:${block.id}`);
                  event.dataTransfer.effectAllowed = "move";
                  onDragBlock?.();
                }}
                onDragEnd={onDragEnd}
                onDragOver={(event) => { if (block.type === "image" && [...event.dataTransfer.types].includes("Files")) event.preventDefault(); }}
                onDrop={(event) => {
                  const file = event.dataTransfer.files?.[0];
                  if (block.type !== "image" || !file?.type.startsWith("image/")) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onUpload?.(block.id, file);
                }}
                onClick={() => onSelect?.(block.id)}
                className="relative cursor-grab text-start active:cursor-grabbing"
                style={{ boxShadow: selectedId === block.id ? "inset 0 0 0 2px #1a1a1a" : undefined }}
              >
                {selectedId === block.id && onRemove ? (
                  <button type="button" draggable={false} aria-label="מחיקת הבלוק" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(block.id); }} className="absolute top-2 end-2 z-10 grid size-7 place-items-center rounded-full border-0 bg-white text-[#1a1a1a] shadow-[0_0_0_1px_rgba(0,0,0,.12),0_6px_16px_rgba(0,0,0,.12)]">
                    <Icon name="trash" size={14} strokeWidth={1.7} />
                  </button>
                ) : null}
                <BlockView block={block} uploading={uploadingId === block.id} logo={logo ?? ""} />
              </div>
            </div>
          ))}
          {onDropAt ? <DropLine open={dragging || email.blocks.length === 0} tall={email.blocks.length === 0} onDrop={(payload, file) => onDropAt(email.blocks.length, payload, file)} /> : null}
          {email.blocks.length === 0 ? <div className="px-6 pb-10 text-center text-sm text-[#8a8a8a]">גררו לכאן בלוק, או תמונה מהמחשב</div> : null}
        </div>
      </div>
    </div>
  );
}

function DropLine({ open, tall, onDrop }: { open: boolean; tall?: boolean; onDrop: (payload: string, file?: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex items-center px-4 transition-[height] duration-150 ${tall ? "h-16" : open || over ? "h-7" : "h-2"}`}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        onDrop(event.dataTransfer.getData("text/plain"), event.dataTransfer.files?.[0]);
      }}
    >
      <div className={`h-0.5 w-full rounded-full transition-colors ${over ? "bg-[#1a1a1a]" : open ? "bg-[#d0d0d0]" : "bg-transparent"}`} />
    </div>
  );
}

function lookStyle(block: EmailBlock, color: string) {
  if (!("font" in block)) return { color };
  const marks = [block.underline ? "underline" : "", block.strike ? "line-through" : ""].filter(Boolean).join(" ");
  return {
    color,
    fontFamily: block.font ? `"${block.font}", sans-serif` : undefined,
    fontSize: block.size || (block.type === "heading" ? 28 : 14),
    fontWeight: block.weight || (block.type === "heading" ? 700 : 400),
    fontStyle: block.italic ? "italic" : undefined,
    textDecoration: marks || undefined,
    textAlign: block.type === "columns" ? undefined : block.align === "center" || block.align === "end" ? block.align : "start",
  } as const;
}

function BlockView({ block, uploading, logo }: { block: EmailBlock; uploading: boolean; logo: string }) {
  const align = "align" in block && (block.align === "center" || block.align === "end") ? block.align : "start";
  if (block.type === "image") {
    if (uploading) return <div className="mx-6 my-3 grid h-40 place-items-center rounded-xl bg-[#f6f6f6] text-sm text-[#8a8a8a]">מעלים את התמונה…</div>;
    return block.src.trim() ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={block.src} alt={block.alt || ""} className="block w-full" />
    ) : (
      <div className="mx-6 my-3 grid h-40 place-items-center rounded-xl border border-dashed border-[#d4d4d4] text-sm text-[#8a8a8a]">גררו לכאן תמונה, או העלו מהצד</div>
    );
  }
  if (block.type === "logo") {
    return logo.trim() ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" className="mx-auto my-4 block h-12 w-auto max-w-[220px] object-contain" />
    ) : (
      <div className="mx-6 my-3 grid h-16 place-items-center rounded-xl border border-dashed border-[#d4d4d4] text-sm text-[#8a8a8a]">הוסיפו לוגו בהגדרות הכלליות</div>
    );
  }
  if (block.type === "heading") return <div className="px-6 py-3 leading-tight" style={lookStyle(block, block.color || "#1a1a1a")}><Rich text={block.text || "כותרת"} /></div>;
  if (block.type === "text") return <p className="m-0 px-6 py-2 leading-relaxed whitespace-pre-wrap" style={lookStyle(block, block.color || "#303030")}><Rich text={block.text || "טקסט"} /></p>;
  if (block.type === "button") {
    return (
      <div className="px-6 py-3" style={{ textAlign: align }}>
        <span className="inline-flex h-10 items-center rounded-full px-5" style={{ ...lookStyle(block, block.textColor || "#ffffff"), background: block.color || "#1a1a1a" }}><Rich text={block.label || "כפתור"} /></span>
      </div>
    );
  }
  if (block.type === "columns") {
    return (
      <div className="grid grid-cols-2 gap-4 px-6 py-3 leading-relaxed" style={lookStyle(block, block.color || "#303030")}>
        <p className="m-0 whitespace-pre-wrap"><Rich text={block.left || "עמודה"} /></p>
        <p className="m-0 whitespace-pre-wrap"><Rich text={block.right || "עמודה"} /></p>
      </div>
    );
  }
  if (block.type === "spacer") return <div style={{ height: block.size === "s" ? 16 : block.size === "l" ? 56 : 32 }} />;
  return <div className="mx-6 my-3 h-px" style={{ background: block.color || "#e6e6e6" }} />;
}

export function InboxPreview({ sender, subject, preview }: { sender: string; subject: string; preview: string }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
      <div className="border-b border-[#eee] px-4 py-3">
        <div className="mx-auto flex h-10 max-w-[520px] items-center rounded-full bg-[#f1f3f4] px-4 text-sm text-[#5f6368]">חיפוש בתיבה</div>
      </div>
      <InboxRow sender="חנות אחרת" subject="ההזמנה יצאה" preview="המשלוח בדרך אליכם" time="אתמול" />
      <InboxRow sender={sender || "החנות"} subject={subject} preview={preview} time="עכשיו" active />
      <InboxRow sender="עדכונים" subject="יש חדש" preview="מוצרים חדשים נכנסו לחנות" time="א׳" />
    </div>
  );
}

function InboxRow({ sender, subject, preview, time, active }: { sender: string; subject: string; preview: string; time: string; active?: boolean }) {
  return (
    <div className={`flex h-11 items-center gap-3 border-b border-[#f1f3f4] px-4 text-sm ${active ? "bg-[#f2f6fc]" : ""}`}>
      <span className="size-4 shrink-0 rounded-[3px] border border-[#5f6368]" />
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#5f6368" strokeWidth="1.4" className="shrink-0" aria-hidden><path d="M10 2.8l1.8 3.7 4 .6-2.9 2.8.7 4L10 12.1 6.4 14l.7-4L4.2 7.1l4-.6L10 2.8z" /></svg>
      <b className={`w-28 shrink-0 truncate ${active ? "text-[#202124]" : "font-normal text-[#202124]"}`}>{sender}</b>
      <div className="min-w-0 flex-1 truncate">
        {active ? (
          <>
            <b className="text-[#202124]">{subject.trim() ? <Rich text={subject} /> : <span className="font-semibold text-[#9aa0a6]">נושא המייל</span>}</b>
            <span className="font-normal text-[#5f6368]"> — {preview.trim() ? <Rich text={preview} /> : <span className="text-[#9aa0a6]">התצוגה המקדימה</span>}</span>
          </>
        ) : (
          <span className="text-[#202124]">{subject} <span className="text-[#5f6368]">— {preview}</span></span>
        )}
      </div>
      <span className={`shrink-0 text-xs ${active ? "font-bold text-[#202124]" : "text-[#5f6368]"}`}>{time}</span>
    </div>
  );
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{[a-z_]+\})/g);
  return parts.map((part, index) => {
    const token = [...EMAIL_VARS, ...EMAIL_LINKS].find((item) => item.token === part);
    if (!token) return <span key={index}>{part}</span>;
    return <span key={index} className="mx-0.5 inline-flex rounded-md bg-[#f3e8ff] px-1.5 py-0.5 align-middle text-[0.85em] font-semibold text-[#5b3fc4]">{token.label}</span>;
  });
}
