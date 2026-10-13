export type Post = {
  id: number;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  blog: string;
  visible: boolean;
  tags: string[];
  tone: string;
};

type Snapshot = { version: number; posts: Post[] };
let current: Snapshot = { version: 0, posts: [] };
const listeners = new Set<() => void>();

function publish(posts: Post[]) {
  current = { version: current.version + 1, posts };
  listeners.forEach((listener) => listener());
}

export function subscribePosts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPostsVersion() {
  return current.version;
}

export function listPosts() {
  return current.posts.map((post) => ({ ...post, tags: [...post.tags] }));
}

export function getPost(id: number) {
  const post = current.posts.find((item) => item.id === id);
  return post ? { ...post, tags: [...post.tags] } : null;
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
