import { getStoreIdentity } from "@/data/live/store-identity";
import { isHydrating, writeStore } from "@/data/live/write";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type Post = {
  id: number;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  updated: string;
  productId: string;
  productNote: string;
  blog: string;
  visible: boolean;
  tags: string[];
  tone: string;
  image: string;
  video: string;
  seoTitle: string;
  seoDescription: string;
  handle: string;
  template: string;
};

type Snapshot = { version: number; posts: Post[] };
let current: Snapshot = { version: 0, posts: [] };
const listeners = new Set<() => void>();

function publish(posts: Post[]) {
  current = { version: current.version + 1, posts };
  listeners.forEach((listener) => listener());
  if (!isHydrating()) void writeStore("save_store_sections", { sections: { posts } });
}

export function replacePosts(posts: Post[]) {
  publish(posts.map(copyPost));
}

export function subscribePosts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPostsVersion() {
  return current.version;
}

function copyPost(post: Post): Post {
  return {
    ...post,
    tags: [...post.tags],
  };
}

export function postHasOwnImage(image: string) {
  const value = image.trim();
  return value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:image/");
}

export function postCover(image: string, logo: string) {
  return postHasOwnImage(image) ? image : logo.trim();
}

const mediaBucket = "product-media";
const pendingVideos = new Map<string, Blob>();

export function stagePostVideo(key: string, file: Blob) {
  pendingVideos.set(key, file);
}

export function releasePostVideo(key: string) {
  pendingVideos.delete(key);
  if (key.startsWith("blob:")) URL.revokeObjectURL(key);
}

function publicMediaUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${mediaBucket}/${path}`;
}

function storedPostVideo(value: string, storeId: string) {
  const marker = `/storage/v1/object/public/${mediaBucket}/`;
  const index = value.indexOf(marker);
  if (index < 0) return null;
  const path = decodeURIComponent(value.slice(index + marker.length).split("?")[0] ?? "");
  return path.startsWith(`${storeId}/posts/`) ? path : null;
}

export async function commitPostVideo(video: string, previous = "") {
  const next = video.trim();
  const storeId = getStoreIdentity().storeId;
  if (!storeId || typeof window === "undefined") return next;
  const supabase = createSupabaseBrowserClient();
  const dropPrevious = async () => {
    if (!previous || previous === next) return;
    const stale = storedPostVideo(previous, storeId);
    if (stale) await supabase.storage.from(mediaBucket).remove([stale]);
  };
  if (!next || /^https?:\/\//i.test(next)) {
    await dropPrevious();
    return next;
  }
  const blob = pendingVideos.get(next);
  if (!blob) throw new Error("הסרטון לא נמצא. בחרו אותו שוב.");
  const extension = blob.type === "video/webm" ? "webm" : blob.type === "video/quicktime" ? "mov" : "mp4";
  const path = `${storeId}/posts/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(mediaBucket).upload(path, blob, { contentType: blob.type || "video/mp4", upsert: false });
  if (error) throw new Error("העלאת הסרטון נכשלה");
  releasePostVideo(next);
  await dropPrevious();
  return publicMediaUrl(path);
}

export function listPosts() {
  return current.posts.map(copyPost);
}

export function getPost(id: number) {
  const post = current.posts.find((item) => item.id === id);
  return post ? copyPost(post) : null;
}

export function savePost(post: Post) {
  const exists = current.posts.some((item) => item.id === post.id);
  publish(exists ? current.posts.map((item) => (item.id === post.id ? post : item)) : [post, ...current.posts]);
}

export function deletePost(id: number) {
  publish(current.posts.filter((post) => post.id !== id));
}

export function nextPostId() {
  return Math.max(0, ...current.posts.map((post) => post.id)) + 1;
}
