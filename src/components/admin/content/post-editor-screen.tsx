"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { notFound } from "next/navigation";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { deletePost, getPost, getPostsVersion, nextPostId, savePost, subscribePosts, type Post } from "@/data/mock/content-session";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm outline-none";

function blank(id: number): Post {
  return { id, title: "", excerpt: "", body: "", author: "מאיה ברק", blog: "בלוג החנות", visible: true, tags: [], tone: "" };
}

export function PostEditorScreen({ postId }: { postId: number | null }) {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePosts, getPostsVersion, () => 0);
  const existing = postId == null ? null : getPost(postId);
  const missing = postId != null && !existing;
  const baseline = existing ?? blank(0);
  const [draft, setDraft] = useState(baseline);
  const [saved, setSaved] = useState(baseline);
  const [bound, setBound] = useState(postId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [tag, setTag] = useState("");
  const [seo, setSeo] = useState(false);
  if (bound !== postId) {
    setBound(postId);
    setDraft(baseline);
    setSaved(baseline);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    if (!draft.title.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    const id = existing?.id ?? nextPostId();
    window.setTimeout(() => {
      const next = { ...draft, id, tone: draft.tone || "#e7e2d9" };
      savePost(next);
      setDraft(next);
      setSaved(next);
      setSaving(false);
      toast("הפוסט נשמר");
      if (postId == null) router.replace(`/admin/content/posts/${id}`);
    }, 400);
  }

  useUnsavedEditor(dirty, saving, save, () => { setDraft(saved); setError(false); });
  if (missing) notFound();

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/content/posts" aria-label="חזרה" className="grid size-8 place-items-center rounded-lg text-[#4a4a4a] no-underline">←</Link>
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">{draft.title || "פוסט חדש"}</h1>
        {existing ? <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold text-[#8e1f0b] shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => { deletePost(existing.id); toast("הפוסט נמחק"); router.push("/admin/content/posts"); }}>מחיקה</button> : null}
      </div>
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <label className="font-semibold">כותרת<input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setError(false); }} className={`${field} mt-1.5 font-normal`} style={{ borderColor: error ? "#e51c00" : "#c9c9c9", background: error ? "#fff4f4" : "#fff" }} /></label>
          {error ? <div className="text-[13px] text-[#8e1f0b]">יש להזין כותרת</div> : null}
          <div className="flex gap-1 rounded-t-[10px] border border-b-0 border-[#c9c9c9] bg-[#f7f7f7] p-1">
            <button type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent text-[#5b3fc4]" onClick={() => setDraft({ ...draft, title: draft.title || "5 דרכים לערוך שולחן חג עם כלי קרמיקה", body: draft.body || "הכינו שולחן חג עם ספלים, קערות ומפיות מהסטודיו." })}>✦</button>
            {["B", "I", "U"].map((mark) => <button key={mark} type="button" className="grid size-7 place-items-center rounded-md border-0 bg-transparent font-bold">{mark}</button>)}
          </div>
          <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={8} className="rounded-b-[10px] border border-[#c9c9c9] bg-white p-3 text-sm outline-none" />
          <label className="font-semibold">תקציר<textarea value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} rows={3} placeholder="הוסיפו סיכום של הפוסט שיופיע בדף הבית או בבלוג." className="mt-1.5 w-full rounded-[10px] border border-[#c9c9c9] bg-white p-3 font-normal outline-none" /></label>
          <button type="button" className="self-start text-sm text-[#005bd3]" onClick={() => setSeo((open) => !open)}>{seo ? "סגירת תצוגת חיפוש" : "עריכת תצוגת חיפוש"}</button>
          {seo ? <div className="text-sm text-[#4a4a4a]">storely.co.il › blogs › {draft.title || "post"}<div className="text-lg text-[#1a4fd6]">{draft.title || "כותרת"}</div>{draft.excerpt || draft.body.slice(0, 155)}</div> : null}
        </div>
        <aside className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="font-semibold">נראות</div>
          <button type="button" className="h-[30px] rounded-[10px] border-0 px-3 text-sm font-semibold" style={{ background: draft.visible ? "#cdfee1" : "#ebebeb" }} onClick={() => setDraft({ ...draft, visible: true })}>גלוי</button>
          <button type="button" className="h-[30px] rounded-[10px] border-0 px-3 text-sm font-semibold" style={{ background: !draft.visible ? "#e3e3e3" : "#fff" }} onClick={() => setDraft({ ...draft, visible: false })}>מוסתר</button>
          <label className="text-sm font-semibold">מחבר<input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} className={`${field} mt-1 font-normal`} /></label>
          <label className="text-sm font-semibold">בלוג<select value={draft.blog} onChange={(event) => setDraft({ ...draft, blog: event.target.value })} className={`${field} mt-1 font-normal`}><option>בלוג החנות</option><option>מאחורי הקלעים</option></select></label>
          <button type="button" className="h-24 rounded-xl border border-dashed border-[#c9c9c9]" style={{ background: draft.tone || "#fff" }} onClick={() => setDraft({ ...draft, tone: draft.tone ? "" : "#e7e2d9" })}>{draft.tone ? "הסרת תמונה" : "הוספת תמונה"}</button>
          <div className="flex flex-wrap gap-1">
            {draft.tags.map((item) => <span key={item} className="inline-flex h-6 items-center rounded-md bg-[#ebebeb] px-2 text-[13px]">{item}<button type="button" className="border-0 bg-transparent" onClick={() => setDraft({ ...draft, tags: draft.tags.filter((tagItem) => tagItem !== item) })}>×</button></span>)}
          </div>
          <input value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && tag.trim()) { setDraft({ ...draft, tags: draft.tags.includes(tag.trim()) ? draft.tags : [...draft.tags, tag.trim()] }); setTag(""); } }} placeholder="תגית ו-Enter" className={field} />
        </aside>
      </div>
    </div>
  );
}
