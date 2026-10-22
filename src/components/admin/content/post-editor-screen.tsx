"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { getCatalogVersion, isVideoMedia, listCatalogProducts, subscribeCatalog } from "@/data/mock/catalog-session";
import { commitPostVideo, deletePost, getPost, getPostsVersion, nextPostId, postCover, postHasOwnImage, releasePostVideo, savePost, stagePostVideo, subscribePosts, type Post } from "@/data/mock/content-session";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { slugifyHandle } from "@/lib/catalog/present";
import { fitVideo, needsVideoFit, VideoFitError } from "@/lib/media/fit-video";
import { formatMoney0 } from "@/lib/formatting/money";
import type { Product } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-[#303030] outline-none placeholder:text-[#8a8a8a]";
const selectField = "h-[34px] w-full appearance-none rounded-[10px] border border-[#c9c9c9] bg-white ps-3 pe-8 text-sm text-[#303030] outline-none";
const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23303030' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")";

const MARK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|<u>([^<\n]+)<\/u>/g;

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(text: string) {
  let html = "";
  let cursor = 0;
  for (const match of text.matchAll(MARK)) {
    const start = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, start));
    if (match[1] && match[2]) html += `<a href="${escapeHtml(match[2])}">${escapeHtml(match[1])}</a>`;
    else if (match[3]) html += `<strong>${escapeHtml(match[3])}</strong>`;
    else if (match[4]) html += `<em>${escapeHtml(match[4])}</em>`;
    else if (match[5]) html += `<u>${escapeHtml(match[5])}</u>`;
    cursor = start + match[0].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function bodyToHtml(body: string) {
  if (!body) return "";
  return body.split("\n").map((line) => `<div>${inlineHtml(line) || "<br>"}</div>`).join("");
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\u00a0/g, " ");
  if (!(node instanceof HTMLElement) || node.tagName === "BR") return "";
  const inner = [...node.childNodes].map(inlineText).join("");
  const tag = node.tagName;
  if ((tag === "STRONG" || tag === "B") && inner) return `**${inner}**`;
  if ((tag === "EM" || tag === "I") && inner) return `*${inner}*`;
  if (tag === "U" && inner) return `<u>${inner}</u>`;
  if (tag === "A" && inner) {
    const href = node.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href) || href.startsWith("/") ? `[${inner}](${href})` : inner;
  }
  return inner;
}

function htmlToBody(root: HTMLElement) {
  const lines: string[] = [];
  let line = "";
  const pushLine = () => {
    lines.push(line);
    line = "";
  };
  for (const node of root.childNodes) {
    if (node instanceof HTMLElement && (node.tagName === "UL" || node.tagName === "OL")) {
      if (line) pushLine();
      [...node.children].forEach((item, index) => {
        if (item.tagName !== "LI") return;
        lines.push(`${node.tagName === "OL" ? `${index + 1}. ` : "• "}${inlineText(item)}`);
      });
      continue;
    }
    if (node instanceof HTMLElement && (node.tagName === "DIV" || node.tagName === "P" || /^H[1-3]$/.test(node.tagName))) {
      if (line) pushLine();
      lines.push(inlineText(node));
      continue;
    }
    if (node instanceof HTMLBRElement) {
      pushLine();
      continue;
    }
    line += inlineText(node);
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

const BLOGS = ["חדשות", "בלוג החנות", "מאחורי הקלעים"];
const TEMPLATES = ["פוסט בלוג ברירת מחדל", "פוסט בלוג מלא"];

function blank(id: number): Post {
  return {
    id,
    title: "",
    excerpt: "",
    body: "",
    author: "",
    updated: "",
    productId: "",
    productNote: "",
    blog: "חדשות",
    visible: false,
    tags: [],
    tone: "",
    image: "",
    video: "",
    seoTitle: "",
    seoDescription: "",
    handle: "",
    template: TEMPLATES[0],
  };
}

function productPhoto(product: Product) {
  return product.media?.find((item) => item && !isVideoMedia(item)) ?? "";
}

function ProductThumb({ product }: { product: Product }) {
  const photo = productPhoto(product);
  return photo ? (
    <img src={photo} alt="" className="size-9 rounded-lg object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" />
  ) : (
    <span className="size-9 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]" style={{ background: product.tone || "#ececec" }} />
  );
}

function ProductSearch({ productId, onPick }: { productId: string; onPick: (id: string) => void }) {
  const products = listCatalogProducts().filter((product) => product.sourceId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = products.find((product) => product.sourceId === productId) ?? null;
  const needle = query.trim().toLowerCase();
  const matches = needle ? products.filter((product) => product.title.toLowerCase().includes(needle)) : products;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: string) {
    onPick(id);
    setQuery("");
    setOpen(false);
    setActive(0);
  }

  return (
    <div className="min-w-0">
      {selected ? (
        <div className="mb-2 grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-xl border border-[#e3e3e3] bg-[#fafafa] px-2.5 py-2">
          <ProductThumb product={selected} />
          <span className="truncate text-sm font-semibold">{selected.title}</span>
          <span dir="ltr" className="text-[13px] text-[#616161]">{formatMoney0(selected.price)}</span>
          <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => onPick("")}>הסרה</button>
        </div>
      ) : null}
      <button type="button" className={`${field} flex items-center gap-2 text-start text-[#8a8a8a]`} onClick={() => { setQuery(""); setActive(0); setOpen(true); }}>
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.5-3.5" />
        </svg>
        חיפוש מוצר
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onMouseDown={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="בחירת מוצר"
            className="flex max-h-[min(560px,78vh)] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_rgba(0,0,0,.28),0_0_0_1px_rgba(0,0,0,.08)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#ebebeb] px-4 py-3">
              <h2 className="m-0 flex-1 text-[15px] font-semibold">בחירת מוצר</h2>
              <button type="button" aria-label="סגירה" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l8 8M14 6l-8 8" /></svg>
              </button>
            </div>
            <div className="border-b border-[#ebebeb] px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl bg-[#f6f6f6] px-3">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#616161" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  placeholder="חיפוש לפי שם"
                  className="h-11 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#8a8a8a]"
                  onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                  onKeyDown={(event) => {
                    if (matches.length === 0) return;
                    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % matches.length); }
                    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index <= 0 ? matches.length - 1 : index - 1)); }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const item = matches[active];
                      if (item?.sourceId) choose(item.sourceId);
                    }
                  }}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {matches.length ? matches.map((product, index) => {
                const current = product.sourceId === productId;
                return (
                  <button
                    key={product.sourceId}
                    type="button"
                    className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-0 px-2 py-2 text-start hover:bg-[#f6f6f6]"
                    style={{ background: index === active || current ? "#f1f1f1" : undefined }}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => { if (product.sourceId) choose(product.sourceId); }}
                  >
                    <ProductThumb product={product} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{product.title}</span>
                      {current ? <span className="block text-[12px] text-[#616161]">נבחר למאמר</span> : null}
                    </span>
                    <span dir="ltr" className="text-[13px] tabular-nums text-[#616161]">{formatMoney0(product.price)}</span>
                  </button>
                );
              }) : <div className="px-3 py-10 text-center text-sm text-[#616161]">אין מוצר תואם</div>}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function isAuthorLine(line: string) {
  return line.length < 140 && /מיילדת|גינקולוג|פיזיותרפ|מנהל מחלק|מנהל החטיב|רופא|נטע צמח|אלינה /.test(line) && !line.endsWith("?");
}

function hydrate(post: Post): Post {
  const next = { ...blank(post.id), ...post, tags: [...post.tags] };
  if (next.author.trim() || next.updated.trim()) return next;
  const lines = next.body.split("\n");
  let cursor = 0;
  const lead: string[] = [];
  while (cursor < lines.length && lines[cursor].trim() && !lines[cursor].trim().startsWith("עודכן") && !isAuthorLine(lines[cursor].trim())) {
    if (lines[cursor].trim().length > 80 && lines[cursor].trim().endsWith("?")) break;
    lead.push(lines[cursor].trim());
    cursor += 1;
    if (lead.join(" ").length > 500) break;
  }
  let author = "";
  let updated = "";
  while (cursor < lines.length && (!lines[cursor].trim() || lines[cursor].trim().startsWith("עודכן") || isAuthorLine(lines[cursor].trim()))) {
    const line = lines[cursor].trim();
    if (line.startsWith("עודכן")) updated = line.replace(/^עודכן:\s*/, "");
    else if (line) author = author ? `${author} · ${line}` : line;
    cursor += 1;
  }
  if (!author && !updated) return next;
  return {
    ...next,
    excerpt: lead.join(" ") || next.excerpt,
    author,
    updated,
    body: lines.slice(cursor).join("\n").trim(),
  };
}

export function PostEditorScreen({ postId }: { postId: number | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePosts, getPostsVersion, () => 0);
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  const existing = postId == null ? null : getPost(postId);
  const missing = postId != null && !existing;
  const baseline = existing ? hydrate(existing) : blank(0);
  const [draft, setDraft] = useState(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(postId);
  const [saving, setSaving] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [fitProgress, setFitProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [tag, setTag] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [block, setBlock] = useState("פסקה");
  const [align, setAlign] = useState<"start" | "center" | "end">("start");
  const [code, setCode] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);

  if (bound !== postId) {
    setBound(postId);
    setDraft(baseline);
    setSaved(baseline);
    setSeoOpen(false);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const blogs = BLOGS.includes(draft.blog) ? BLOGS : [draft.blog, ...BLOGS];
  const templates = TEMPLATES.includes(draft.template) ? TEMPLATES : [draft.template, ...TEMPLATES];
  const seoReady = Boolean(draft.seoTitle.trim() || draft.seoDescription.trim());

  function patch(partial: Partial<Post>) {
    setDraft((current) => ({ ...current, ...partial }));
    if ("title" in partial) setError(false);
  }

  function setBody(body: string, record = false) {
    setDraft((current) => {
      if (record) history.current.push(current.body);
      return { ...current, body };
    });
  }

  function syncFromEditor() {
    const node = bodyRef.current;
    if (!node) return;
    const body = htmlToBody(node);
    setDraft((current) => (current.body === body ? current : { ...current, body }));
  }

  function writeBody(body: string, record = false) {
    setBody(body, record);
    if (bodyRef.current) bodyRef.current.innerHTML = bodyToHtml(body);
  }

  function rememberSelection() {
    const node = bodyRef.current;
    const selection = window.getSelection();
    if (!node || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    if (!node.contains(selection.anchorNode) || !node.contains(selection.focusNode)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const node = bodyRef.current;
    const range = savedRange.current;
    if (!node || !range) return false;
    node.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function formatText(command: "bold" | "italic" | "underline") {
    if (!restoreSelection()) {
      toast("סמנו קודם את הטקסט");
      return;
    }
    document.execCommand(command);
    rememberSelection();
    syncFromEditor();
  }

  function applyLink() {
    if (!bodyRef.current || !restoreSelection()) {
      toast("סמנו קודם את הטקסט שיהיה קישור");
      return;
    }
    const url = window.prompt("הדביקו את כתובת הקישור", "https://");
    if (!url) return;
    const clean = url.trim();
    if (!/^https?:\/\/\S+$/i.test(clean) && !clean.startsWith("/")) {
      toast("הקישור צריך להתחיל ב-https://");
      return;
    }
    restoreSelection();
    document.execCommand("createLink", false, clean);
    rememberSelection();
    syncFromEditor();
  }

  function insertList(ordered: boolean) {
    bodyRef.current?.focus({ preventScroll: true });
    document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
    rememberSelection();
    syncFromEditor();
  }

  const bodySource = useRef(draft.body);
  bodySource.current = draft.body;

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.innerHTML = bodyToHtml(bodySource.current);
  }, [postId]);

  function readImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("אפשר להעלות רק קובץ תמונה");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ image: String(reader.result || ""), tone: draft.tone || "#e7e2d9" });
    reader.readAsDataURL(file);
  }

  async function readVideo(file: File | undefined) {
    if (!file) return;
    const allowed = file.type === "video/mp4" || file.type === "video/webm" || file.type === "video/quicktime";
    if (!allowed) {
      toast("אפשר להעלות סרטון mp4, webm או mov");
      return;
    }
    setFitting(true);
    try {
      let ready = file;
      if (needsVideoFit(file)) {
        toast("הסרטון גדול מ־50MB, מכווצים אותו…");
        setFitProgress(0);
        ready = await fitVideo(file, setFitProgress);
      }
      if (draft.video.startsWith("blob:")) releasePostVideo(draft.video);
      const url = URL.createObjectURL(ready);
      stagePostVideo(url, ready);
      patch({ video: url });
      toast("הסרטון נוסף");
    } catch (failure) {
      toast(failure instanceof VideoFitError ? failure.message : "כיווץ הסרטון נכשל.");
    } finally {
      setFitting(false);
      setFitProgress(null);
    }
  }

  async function save() {
    if (!draft.title.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    try {
      const video = await commitPostVideo(draft.video, saved.video);
      const id = existing?.id ?? nextPostId();
      const next = { ...draft, id, video, tone: draft.tone || "#e7e2d9", handle: draft.handle || slugifyHandle(draft.title) };
      savePost(next);
      setDraft(next);
      setSaved(next);
      toast("הפוסט נשמר");
      if (postId == null) router.replace(`/admin/content/posts/${id}`);
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : "שמירת הסרטון נכשלה");
    } finally {
      setSaving(false);
    }
  }

  useUnsavedEditor(dirty, saving, save, () => {
    setDraft(saved);
    setError(false);
    setSeoOpen(false);
  });
  if (missing) notFound();

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-4 min-[1000px]:px-6">
      <div className="mb-4 flex items-center gap-1.5">
        <Link href="/admin/content/posts" aria-label="חזרה לפוסטים" className="grid size-7 place-items-center rounded-lg text-[#4a4a4a] no-underline hover:bg-[#f1f1f1]">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 6l4 4-4 4" /></svg>
        </Link>
        <Link href="/admin/content/posts" className="text-[13px] text-[#616161] no-underline hover:underline">פוסטים בבלוג</Link>
      </div>

      <div className="grid items-start gap-8 min-[1000px]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-2">
            <h1 className="m-0 flex-1 text-xl leading-6 font-semibold text-[#1a1a1a]">{postId == null ? "הוספת פוסט בבלוג" : draft.title || "עריכת פוסט"}</h1>
            {existing ? (
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => { deletePost(existing.id); toast("הפוסט נמחק"); router.push("/admin/content/posts"); }}>מחיקה</button>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold">כותרת</span>
              <span className="relative block">
                <input
                  value={draft.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    const autoHandle = !draft.handle || draft.handle === slugifyHandle(draft.title);
                    patch({ title, handle: autoHandle ? slugifyHandle(title) : draft.handle });
                  }}
                  placeholder="לדוגמה: בלוג על המוצרים או המבצעים האחרונים שלכם"
                  className={`${field} !pe-9`}
                  style={{ borderColor: error ? "#e51c00" : "#c9c9c9", background: error ? "#fff4f4" : "#fff" }}
                />
                <button type="button" aria-label="הצעת כותרת" className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-[#5c2e91]" onClick={() => patch({ title: draft.title || "5 דרכים לערוך שולחן חג עם כלי קרמיקה" })}>
                  <Sparkle />
                </button>
              </span>
              {error ? <span className="mt-1.5 block text-[13px] font-normal text-[#8e1f0b]">יש להזין כותרת</span> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold">פסקה מתחת לכותרת</span>
              <textarea value={draft.excerpt} onChange={(event) => patch({ excerpt: event.target.value })} rows={4} placeholder="הפסקה שמופיעה מתחת לכותרת, לפני המחבר" className="w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm leading-6 outline-none placeholder:text-[#8a8a8a]" />
            </label>

            <div className="grid gap-3 min-[700px]:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">מחבר</span>
                <input value={draft.author} onChange={(event) => patch({ author: event.target.value })} placeholder="לדוגמה: פרופ׳ אייל שיינר" className={field} />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">תאריך</span>
                <input value={draft.updated} onChange={(event) => patch({ updated: event.target.value })} placeholder="13.06.2023" className={field} />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-semibold">תמונה או סרטון</span>
              <span className="mb-2 block text-[12px] text-[#616161]">אפשר להעלות תמונה, סרטון, או את שניהם. סרטון מעל 50MB יכווץ אוטומטית.</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { readImage(event.target.files?.[0]); event.target.value = ""; }} />
              {postCover(draft.image, getSettings().logo) ? (
                <div className="relative overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#f6f6f6]">
                  <img src={postCover(draft.image, getSettings().logo)} alt="" className={"h-[220px] w-full " + (postHasOwnImage(draft.image) ? "object-cover" : "object-contain p-8")} />
                  <div className="absolute end-2 top-2 flex gap-2">
                    <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => fileRef.current?.click()}>החלפה</button>
                    {postHasOwnImage(draft.image) ? <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" onClick={() => patch({ image: "" })}>הסרה</button> : null}
                  </div>
                  {postHasOwnImage(draft.image) ? null : <span className="absolute start-2 top-2 rounded-md bg-white px-2 py-1 text-[12px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]">לוגו החנות</span>}
                </div>
              ) : (
                <button type="button" className="h-9 rounded-lg border border-dashed border-[#b5b5b5] bg-white px-3 text-sm" onClick={() => fileRef.current?.click()}>הוספת תמונה</button>
              )}
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => { void readVideo(event.target.files?.[0]); event.target.value = ""; }} />
              {draft.video ? (
                <div className="relative mt-3 overflow-hidden rounded-xl border border-[#e3e3e3] bg-[#111]">
                  <video src={draft.video} controls playsInline className="h-[220px] w-full bg-black object-contain" />
                  <div className="absolute end-2 top-2 flex gap-2">
                    <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" disabled={fitting} onClick={() => videoRef.current?.click()}>החלפה</button>
                    <button type="button" className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.08)]" disabled={fitting} onClick={() => { if (draft.video.startsWith("blob:")) releasePostVideo(draft.video); patch({ video: "" }); }}>הסרה</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="mt-3 h-9 rounded-lg border border-dashed border-[#b5b5b5] bg-white px-3 text-sm disabled:opacity-60" disabled={fitting} onClick={() => videoRef.current?.click()}>{fitting ? "מכווצים את הסרטון…" : "הוספת סרטון"}</button>
              )}
              {fitProgress != null ? <span className="mt-2 block text-[12px] text-[#616161]">כיווץ {Math.round(fitProgress * 100)}%</span> : null}
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-semibold">גוף המאמר</span>
              <div className="overflow-hidden rounded-[10px] border border-[#c9c9c9] bg-white">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-[#ebebeb] px-1 py-1">
                  <button type="button" aria-label="כתיבה בעזרת העוזר" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#5c2e91] hover:bg-[#f1f1f1]" onMouseDown={(event) => event.preventDefault()} onClick={() => writeBody(draft.body || "הכינו שולחן חג עם ספלים, קערות ומפיות מהסטודיו. כל פריט נעשה ביד ואפשר לשלב אותו עם כלי ההגשה הקיימים.", true)}>
                    <Sparkle />
                  </button>
                  <select aria-label="סגנון פסקה" value={block} onChange={(event) => setBlock(event.target.value)} className="h-7 appearance-none rounded-md border-0 bg-transparent bg-[length:12px] bg-[position:left_4px_center] bg-no-repeat ps-2 pe-5 text-[13px] outline-none hover:bg-[#f1f1f1]" style={{ backgroundImage: chevron }}>
                    <option>פסקה</option>
                    <option>כותרת 1</option>
                    <option>כותרת 2</option>
                    <option>כותרת 3</option>
                  </select>
                  <ToolButton label="מודגש" onClick={() => formatText("bold")}>B</ToolButton>
                  <ToolButton label="נטוי" onClick={() => formatText("italic")} italic>I</ToolButton>
                  <ToolButton label="קו תחתון" onClick={() => formatText("underline")} underline>U</ToolButton>
                  <ToolButton label="צבע טקסט" onClick={() => toast("צבע הטקסט נשמר יחד עם העיצוב של הפסקה")}>
                    <span className="text-[13px] font-semibold underline decoration-[#303030] decoration-2 underline-offset-2">A</span>
                  </ToolButton>
                  <ToolButton label="יישור" onClick={() => setAlign((current) => (current === "start" ? "center" : current === "center" ? "end" : "start"))}>
                    <AlignIcon />
                  </ToolButton>
                  <ToolButton label="קישור" onClick={applyLink}>
                    <LinkIcon />
                  </ToolButton>
                  <ToolButton label="תמונה" onClick={() => fileRef.current?.click()}>
                    <ImageIcon />
                  </ToolButton>
                  <ToolButton label="וידאו" onClick={() => writeBody(`${draft.body}${draft.body ? "\n" : ""}[וידאו](https://)`, true)}>
                    <VideoIcon />
                  </ToolButton>
                  <ToolButton label="טבלה" onClick={() => writeBody(`${draft.body}${draft.body ? "\n" : ""}| עמודה | עמודה |\n| --- | --- |\n|  |  |`, true)}>
                    <TableIcon />
                  </ToolButton>
                  <ToolButton label="רשימה" onClick={() => insertList(false)}>•</ToolButton>
                  <ToolButton label="רשימה ממוספרת" onClick={() => insertList(true)}>1.</ToolButton>
                  <ToolButton label="הזחה" onClick={() => { bodyRef.current?.focus({ preventScroll: true }); document.execCommand("indent"); syncFromEditor(); }}>
                    <IndentIcon />
                  </ToolButton>
                  <ToolButton label="ביטול" onClick={() => {
                    const prev = history.current.pop();
                    if (prev == null) return;
                    writeBody(prev);
                  }}>
                    <UndoIcon />
                  </ToolButton>
                  <ToolButton label="קוד" onClick={() => setCode((open) => !open)}>&lt;/&gt;</ToolButton>
                </div>
                <div
                  ref={bodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline
                  aria-label="גוף המאמר"
                  onInput={syncFromEditor}
                  onMouseUp={rememberSelection}
                  onKeyUp={rememberSelection}
                  className="block min-h-[180px] w-full resize-y overflow-auto border-0 bg-white p-3 text-sm leading-6 outline-none [&_a]:text-[#1a4fd6] [&_a]:underline [&_b]:font-bold [&_em]:italic [&_i]:italic [&_strong]:font-bold [&_u]:underline"
                  style={{ textAlign: align, fontFamily: code ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}
                />
              </div>
              <p className="m-0 mt-2 text-[12px] leading-5 text-[#616161]">סמנו טקסט ולחצו מודגש, נטוי או קו. הקישור נצבע בכחול עם קו תחתון, והסמן נשאר על אותו טקסט.</p>
            </div>

            <div className="border-t border-[#ebebeb] pt-4">
              <span className="mb-1.5 block text-[13px] font-semibold">מוצר מומלץ</span>
              <p className="m-0 mb-2 text-[13px] text-[#616161]">לא חובה. חפשו מוצר ובחרו אותו מההשלמה, והוא יופיע ככרטיס בסוף המאמר.</p>
              <ProductSearch productId={draft.productId} onPick={(productId) => patch({ productId, productNote: productId ? draft.productNote : "" })} />
              {draft.productId ? (
                <textarea value={draft.productNote} onChange={(event) => patch({ productNote: event.target.value })} rows={2} placeholder="משפט קצר ליד המוצר. אם נשאר ריק, יוצג תיאור המוצר" className="mt-2 w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm outline-none placeholder:text-[#8a8a8a]" />
              ) : null}
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center">
              <h2 className="m-0 flex-1 text-[13px] font-semibold">רישום במנועי חיפוש</h2>
              <button type="button" aria-label="עריכת רישום במנועי חיפוש" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]" onClick={() => setSeoOpen((open) => !open)}>
                <PencilIcon />
              </button>
            </div>
            {seoOpen ? (
              <div className="flex flex-col gap-3 rounded-[10px] border border-[#c9c9c9] bg-white p-3">
                <label>
                  <span className="mb-1.5 block text-[13px] font-semibold">כותרת העמוד</span>
                  <input value={draft.seoTitle} onChange={(event) => patch({ seoTitle: event.target.value })} placeholder={draft.title || "כותרת הפוסט"} className={field} />
                  <span className="mt-1 block text-end text-[12px] text-[#616161]" dir="ltr">{draft.seoTitle.length} / 70</span>
                </label>
                <label>
                  <span className="mb-1.5 block text-[13px] font-semibold">תיאור מטא</span>
                  <textarea value={draft.seoDescription} onChange={(event) => patch({ seoDescription: event.target.value })} rows={3} placeholder="תיאור קצר שיופיע בתוצאת החיפוש" className="w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm outline-none placeholder:text-[#8a8a8a]" />
                  <span className="mt-1 block text-end text-[12px] text-[#616161]" dir="ltr">{draft.seoDescription.length} / 160</span>
                </label>
                <label>
                  <span className="mb-1.5 block text-[13px] font-semibold">כתובת</span>
                  <span dir="ltr" className="flex h-[34px] items-center gap-1 rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-left text-sm">
                    <span className="shrink-0 text-[#616161]">storely.co.il/blogs/</span>
                    <input dir="ltr" value={draft.handle} onChange={(event) => patch({ handle: event.target.value })} placeholder="post" className="h-full min-w-0 flex-1 border-0 bg-transparent text-left outline-none" />
                  </span>
                </label>
              </div>
            ) : seoReady ? (
              <button type="button" onClick={() => setSeoOpen(true)} className="flex w-full flex-col rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2.5 text-start">
                <span dir="ltr" className="block text-end text-[13px] text-[#4a4a4a]">storely.co.il/blogs/{draft.handle || slugifyHandle(draft.title) || "post"}</span>
                <span className="text-lg text-[#1a4fd6]">{draft.seoTitle || draft.title || "כותרת"}</span>
                <span className="text-sm text-[#4a4a4a]">{draft.seoDescription || draft.excerpt || draft.body.slice(0, 155)}</span>
              </button>
            ) : (
              <button type="button" onClick={() => setSeoOpen(true)} className="w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2.5 text-start text-sm leading-5 text-[#616161]">
                הוסיפו כותרת ותיאור כדי לראות איך הפוסט הזה עשוי להופיע ברישום של מנוע חיפוש
              </button>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 text-sm">
          <section className="border-b border-[#ebebeb] pb-4">
            <div className="mb-2 flex items-center">
              <h2 className="m-0 flex-1 text-[13px] font-semibold">נראות</h2>
              <button type="button" aria-label="תצוגה מקדימה" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#4a4a4a] hover:bg-[#f1f1f1]" onClick={() => toast(draft.visible ? "הפוסט גלוי בחנות" : "הפוסט מוסתר ולא יוצג בחנות")}>
                <EyeIcon />
              </button>
            </div>
            <label className="flex items-center gap-2 py-1">
              <input type="radio" name="visibility" checked={draft.visible} onChange={() => patch({ visible: true })} className="size-4 accent-[#303030]" />
              <span className={draft.visible ? "font-semibold" : "font-normal"}>גלוי</span>
            </label>
            <label className="flex items-center gap-2 py-1">
              <input type="radio" name="visibility" checked={!draft.visible} onChange={() => patch({ visible: false })} className="size-4 accent-[#303030]" />
              <span className={!draft.visible ? "font-semibold" : "font-normal"}>מוסתר</span>
            </label>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[13px] font-medium text-[#616161]">ארגון</h2>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">בלוג</span>
              <select value={draft.blog} onChange={(event) => patch({ blog: event.target.value })} className={selectField} style={{ backgroundImage: chevron, backgroundRepeat: "no-repeat", backgroundPosition: "left 10px center", backgroundSize: "14px" }}>
                {blogs.map((blog) => <option key={blog}>{blog}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold">תגיות</span>
              <div className="flex min-h-[34px] flex-wrap items-center gap-1 rounded-[10px] border border-[#c9c9c9] bg-white px-2 py-1">
                {draft.tags.map((item) => (
                  <span key={item} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-[#ebebeb] ps-2 pe-1 text-[13px]">
                    {item}
                    <button type="button" aria-label={`הסרת ${item}`} className="border-0 bg-transparent text-[#4a4a4a]" onClick={() => patch({ tags: draft.tags.filter((tagItem) => tagItem !== item) })}>×</button>
                  </span>
                ))}
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const value = tag.trim();
                    if (!value || draft.tags.includes(value)) return;
                    patch({ tags: [...draft.tags, value] });
                    setTag("");
                  }}
                  aria-label="תגיות"
                  className="h-6 min-w-[80px] flex-1 border-0 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div>
              <span className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold">
                תבנית ערכת נושא
                <button type="button" aria-label="התבנית קובעת איך הפוסט נראה בחנות" title="התבנית קובעת איך הפוסט נראה בחנות" className="grid size-4 place-items-center border-0 bg-transparent p-0 text-[#616161]" onClick={() => toast("התבנית קובעת איך הפוסט נראה בחנות")}>
                  <InfoIcon />
                </button>
              </span>
              <select aria-label="תבנית ערכת נושא" value={draft.template} onChange={(event) => patch({ template: event.target.value })} className={selectField} style={{ backgroundImage: chevron, backgroundRepeat: "no-repeat", backgroundPosition: "left 10px center", backgroundSize: "14px" }}>
                {templates.map((template) => <option key={template}>{template}</option>)}
              </select>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children, italic, underline }: { label: string; onClick: () => void; children: ReactNode; italic?: boolean; underline?: boolean }) {
  return (
    <button type="button" aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="grid h-7 min-w-7 place-items-center rounded-md border-0 bg-transparent px-1 text-[13px] font-semibold text-[#303030] hover:bg-[#f1f1f1]" style={{ fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined }}>
      {children}
    </button>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
      <path fill="currentColor" d="M10 1.8 11.55 7.1 16.8 8.65 11.55 10.2 10 15.5 8.45 10.2 3.2 8.65 8.45 7.1 10 1.8Z" />
      <path fill="currentColor" d="m15.3 12.1.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.2 3.6 16.4 7.8 7.2 17H3v-4.2L12.2 3.6Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.2 10S5.2 5.2 10 5.2 17.8 10 17.8 10 14.8 14.8 10 14.8 2.2 10 2.2 10Z" />
      <circle cx="10" cy="10" r="2.1" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9.2V14" strokeLinecap="round" />
      <circle cx="10" cy="6.6" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AlignIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M4 5h12M4 9h8M4 13h10" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M8.2 11.8 11.8 8.2M8.6 6.2 7.4 5a2.6 2.6 0 0 0-3.7 3.7l1.2 1.2M11.4 13.8l1.2 1.2a2.6 2.6 0 0 0 3.7-3.7l-1.2-1.2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="m4 14 3.2-3.2 2.3 2.2 2-2 4.5 4" />
      <circle cx="13" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="6.2" />
      <path d="M8.6 7.8 13 10l-4.4 2.2V7.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="1.2" />
      <path d="M3 8.5h14M3 12.5h14M8.5 4v12M12.5 4v12" />
    </svg>
  );
}

function IndentIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h12M8 9h8M8 13h8M4 10.5 6.2 9 4 7.5" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 7H4.5V4.5" />
      <path d="M5 8.2A5.5 5.5 0 1 1 6.2 14" />
    </svg>
  );
}
