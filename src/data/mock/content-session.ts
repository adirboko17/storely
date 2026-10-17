import { isHydrating, writeStore } from "@/data/live/write";

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
