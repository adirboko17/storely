"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getPostsVersion, listPosts, subscribePosts } from "@/data/mock/content-session";

export function PostsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  useSyncExternalStore(subscribePosts, getPostsVersion, () => 0);
  const posts = listPosts();

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-end px-3.5 py-2.5">
        <button type="button" className={softButton} onClick={() => toast("ניהול בלוגים: בלוג החנות פעיל")}>ניהול בלוגים</button>
      </div>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-3.5 px-5 pb-24">
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
          <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            {posts.map((post) => (
              <button key={post.id} type="button" className="flex w-full items-center gap-3.5 border-0 border-b border-[#f1f1f1] bg-white px-4 py-3 text-start hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/content/posts/${post.id}`)}>
                {post.image ? (
                  <img src={post.image} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-10 w-14 shrink-0 rounded-lg" style={{ background: post.tone || "#e3e3e3" }} />
                )}
                <span className="min-w-0 flex-1"><b className="block">{post.title}</b><span className="block truncate text-[13px] text-ink-secondary">{post.excerpt}</span></span>
                <span className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: post.visible ? "#cdfee1" : "#e3e3e3", color: post.visible ? "#0c5132" : "#616161" }}>{post.visible ? "גלוי" : "מוסתר"}</span>
                <span className="w-[90px] text-[13px] text-[#4a4a4a]">{post.blog}</span>
                <span className="w-[90px] text-[13px] text-[#4a4a4a]">{post.author}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}
