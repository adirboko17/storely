"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { deletePost, getPostsVersion, listPosts, postCover, postHasOwnImage, subscribePosts } from "@/data/mock/content-session";
import { getSettings, getSettingsVersion, subscribeSettings } from "@/data/mock/settings-session";

export function PostsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  useSyncExternalStore(subscribePosts, getPostsVersion, () => 0);
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const posts = listPosts();
  const logo = getSettings().logo;
  const needle = query.trim().toLowerCase();
  const rows = needle
    ? posts.filter((post) => [post.title, post.excerpt, post.author, post.blog].some((value) => value.toLowerCase().includes(needle)))
    : posts;

  function remove(id: number) {
    deletePost(id);
    setPending(null);
    toast("הפוסט נמחק");
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-3.5 px-5 py-4 pb-24">
        <div className="flex items-center gap-2">
          <h1 className="m-0 flex-1 text-[26px] leading-8 font-semibold text-[#1a1a1a]">פוסטים בבלוג</h1>
          {posts.length ? <button type="button" className={darkButton} onClick={() => router.push("/admin/content/posts/new")}>יצירת פוסט</button> : null}
        </div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-[14px] bg-white px-6 py-16 text-center shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="mb-2 grid size-[150px] place-items-center rounded-full bg-[#f1f1f1]">
              <div className="h-28 w-24 rounded bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,.12)]">
                <span className="mb-2 block h-7 w-10 rounded-sm bg-[#56b8ac]" />
                <span className="mb-1 block h-0.5 bg-[#d4d4d4]" />
                <span className="block h-0.5 w-4/5 bg-[#d4d4d4]" />
              </div>
            </div>
            <h2 className="m-0 text-base font-semibold">כתבו פוסט בבלוג</h2>
            <p className="m-0 max-w-[420px] leading-5 text-pretty">פוסטים בבלוג הם דרך מצוינת לבנות קהילה סביב המוצרים והמותג שלכם.</p>
            <div className="mt-1.5 flex gap-2">
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold">מידע נוסף</button>
              <button type="button" className={darkButton} onClick={() => router.push("/admin/content/posts/new")}>יצירת פוסט</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              <Icon name="search" size={16} strokeWidth={1.8} className="text-ink-secondary" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש פוסט" className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
            </div>
            <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#616161]">אין פוסטים תואמים לחיפוש</div>
              ) : rows.map((post) => (
                <div key={post.id} className="flex items-center gap-2 border-b border-[#f1f1f1] pe-2 hover:bg-[#f7f7f7]">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3.5 border-0 bg-transparent px-4 py-3 text-start" onClick={() => router.push(`/admin/content/posts/${post.id}`)}>
                    {postCover(post.image, logo) ? (
                      <img src={postCover(post.image, logo)} alt="" className={"h-10 w-14 shrink-0 rounded-lg bg-[#f6f6f6] " + (postHasOwnImage(post.image) ? "object-cover" : "object-contain p-1")} />
                    ) : (
                      <span className="h-10 w-14 shrink-0 rounded-lg" style={{ background: post.tone || "#e3e3e3" }} />
                    )}
                    <span className="min-w-0 flex-1"><b className="block">{post.title}</b><span className="block truncate text-[13px] text-ink-secondary">{post.excerpt}</span></span>
                    <span className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: post.visible ? "#cdfee1" : "#e3e3e3", color: post.visible ? "#0c5132" : "#616161" }}>{post.visible ? "גלוי" : "מוסתר"}</span>
                    <span className="w-[90px] text-[13px] text-[#4a4a4a]">{post.blog}</span>
                    <span className="w-[90px] text-[13px] text-[#4a4a4a]">{post.author}</span>
                  </button>
                  {pending === post.id ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" className="h-7 rounded-lg border-0 bg-[#8e1f0b] px-2 text-[13px] font-semibold text-white" onClick={() => remove(post.id)}>מחיקה</button>
                      <button type="button" className="h-7 rounded-lg border-0 bg-transparent px-2 text-[13px] font-semibold" onClick={() => setPending(null)}>ביטול</button>
                    </span>
                  ) : (
                    <button type="button" aria-label="מחיקת פוסט" className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-[#8e1f0b] hover:bg-[#f1f1f1]" onClick={() => setPending(post.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}
