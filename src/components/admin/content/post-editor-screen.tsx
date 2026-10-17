"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { getCatalogVersion, listCatalogProducts, subscribeCatalog } from "@/data/mock/catalog-session";
import { deletePost, getPost, getPostsVersion, nextPostId, postCover, postHasOwnImage, savePost, subscribePosts, type Post } from "@/data/mock/content-session";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";
import { slugifyHandle } from "@/lib/catalog/present";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-[#303030] outline-none placeholder:text-[#8a8a8a]";
const selectField = "h-[34px] w-full appearance-none rounded-[10px] border border-[#c9c9c9] bg-white ps-3 pe-8 text-sm text-[#303030] outline-none";
const chevron = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23303030' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")";

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
    seoTitle: "",
    seoDescription: "",
    handle: "",
    template: TEMPLATES[0],
  };
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
  const [error, setError] = useState(false);
  const [tag, setTag] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [block, setBlock] = useState("פסקה");
  const [align, setAlign] = useState<"start" | "center" | "end">("start");
  const [code, setCode] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  function wrap(before: string, after = before) {
    const el = bodyRef.current;
    const source = draft.body;
    const start = el?.selectionStart ?? source.length;
    const end = el?.selectionEnd ?? source.length;
    const selected = source.slice(start, end) || "טקסט";
    const next = `${source.slice(0, start)}${before}${selected}${after}${source.slice(end)}`;
    setBody(next, true);
    window.requestAnimationFrame(() => {
      const node = bodyRef.current;
      if (!node) return;
      node.focus();
      node.selectionStart = start + before.length;
      node.selectionEnd = start + before.length + selected.length;
    });
  }

  function prefixLines(marker: (index: number) => string) {
    const el = bodyRef.current;
    const source = draft.body;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? source.length;
    const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEnd = source.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? source.length : lineEnd;
    const lines = source.slice(lineStart, sliceEnd).split("\n");
    const nextLines = lines.map((line, index) => `${marker(index)}${line.replace(/^(?:• |\d+\. )/, "")}`);
    setBody(`${source.slice(0, lineStart)}${nextLines.join("\n")}${source.slice(sliceEnd)}`, true);
  }

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

  function save() {
    if (!draft.title.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    const id = existing?.id ?? nextPostId();
    window.setTimeout(() => {
      const next = { ...draft, id, tone: draft.tone || "#e7e2d9", handle: draft.handle || slugifyHandle(draft.title) };
      savePost(next);
      setDraft(next);
      setSaved(next);
      setSaving(false);
      toast("הפוסט נשמר");
      if (postId == null) router.replace(`/admin/content/posts/${id}`);
    }, 400);
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
              <span className="mb-1.5 block text-[13px] font-semibold">תמונה</span>
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
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-semibold">גוף המאמר</span>
              <div className="overflow-hidden rounded-[10px] border border-[#c9c9c9] bg-white">
                <div className="flex flex-wrap items-center gap-0.5 border-b border-[#ebebeb] px-1 py-1">
                  <button type="button" aria-label="כתיבה בעזרת העוזר" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#5c2e91] hover:bg-[#f1f1f1]" onClick={() => setBody(draft.body || "הכינו שולחן חג עם ספלים, קערות ומפיות מהסטודיו. כל פריט נעשה ביד ואפשר לשלב אותו עם כלי ההגשה הקיימים.", true)}>
                    <Sparkle />
                  </button>
                  <select aria-label="סגנון פסקה" value={block} onChange={(event) => setBlock(event.target.value)} className="h-7 appearance-none rounded-md border-0 bg-transparent bg-[length:12px] bg-[position:left_4px_center] bg-no-repeat ps-2 pe-5 text-[13px] outline-none hover:bg-[#f1f1f1]" style={{ backgroundImage: chevron }}>
                    <option>פסקה</option>
                    <option>כותרת 1</option>
                    <option>כותרת 2</option>
                    <option>כותרת 3</option>
                  </select>
                  <ToolButton label="מודגש" onClick={() => wrap("**")}>B</ToolButton>
                  <ToolButton label="נטוי" onClick={() => wrap("*")} italic>I</ToolButton>
                  <ToolButton label="קו תחתון" onClick={() => wrap("<u>", "</u>")} underline>U</ToolButton>
                  <ToolButton label="צבע טקסט" onClick={() => toast("צבע הטקסט נשמר יחד עם העיצוב של הפסקה")}>
                    <span className="text-[13px] font-semibold underline decoration-[#303030] decoration-2 underline-offset-2">A</span>
                  </ToolButton>
                  <ToolButton label="יישור" onClick={() => setAlign((current) => (current === "start" ? "center" : current === "center" ? "end" : "start"))}>
                    <AlignIcon />
                  </ToolButton>
                  <ToolButton label="קישור" onClick={() => wrap("[", "](https://)")}>
                    <LinkIcon />
                  </ToolButton>
                  <ToolButton label="תמונה" onClick={() => fileRef.current?.click()}>
                    <ImageIcon />
                  </ToolButton>
                  <ToolButton label="וידאו" onClick={() => setBody(`${draft.body}${draft.body ? "\n" : ""}[וידאו](https://)`, true)}>
                    <VideoIcon />
                  </ToolButton>
                  <ToolButton label="טבלה" onClick={() => setBody(`${draft.body}${draft.body ? "\n" : ""}| עמודה | עמודה |\n| --- | --- |\n|  |  |`, true)}>
                    <TableIcon />
                  </ToolButton>
                  <ToolButton label="רשימה" onClick={() => prefixLines(() => "• ")}>•</ToolButton>
                  <ToolButton label="רשימה ממוספרת" onClick={() => prefixLines((index) => `${index + 1}. `)}>1.</ToolButton>
                  <ToolButton label="הזחה" onClick={() => prefixLines(() => "  ")}>
                    <IndentIcon />
                  </ToolButton>
                  <ToolButton label="ביטול" onClick={() => {
                    const prev = history.current.pop();
                    if (prev == null) return;
                    setDraft((current) => ({ ...current, body: prev }));
                  }}>
                    <UndoIcon />
                  </ToolButton>
                  <ToolButton label="קוד" onClick={() => setCode((open) => !open)}>&lt;/&gt;</ToolButton>
                </div>
                <textarea
                  ref={bodyRef}
                  value={draft.body}
                  onChange={(event) => patch({ body: event.target.value })}
                  rows={8}
                  className="block min-h-[180px] w-full resize-y border-0 bg-white p-3 text-sm leading-6 outline-none"
                  style={{ textAlign: align, fontFamily: code ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}
                />
              </div>
            </div>

            <div className="border-t border-[#ebebeb] pt-4">
              <span className="mb-1.5 block text-[13px] font-semibold">מוצר מומלץ</span>
              <p className="m-0 mb-2 text-[13px] text-[#616161]">לא חובה. אם בוחרים מוצר, הוא מופיע ככרטיס בסוף המאמר.</p>
              <select value={draft.productId} onChange={(event) => patch({ productId: event.target.value, productNote: event.target.value ? draft.productNote : "" })} className={selectField} style={{ backgroundImage: chevron, backgroundRepeat: "no-repeat", backgroundPosition: "left 10px center", backgroundSize: "14px" }}>
                <option value="">בלי מוצר</option>
                {listCatalogProducts().filter((product) => product.sourceId).map((product) => (
                  <option key={product.sourceId} value={product.sourceId}>{product.title}</option>
                ))}
              </select>
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
    <button type="button" aria-label={label} onClick={onClick} className="grid h-7 min-w-7 place-items-center rounded-md border-0 bg-transparent px-1 text-[13px] font-semibold text-[#303030] hover:bg-[#f1f1f1]" style={{ fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined }}>
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
