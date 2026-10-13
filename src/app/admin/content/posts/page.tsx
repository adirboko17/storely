import type { Metadata } from "next";
import { PostsScreen } from "@/components/admin/content/posts-screen";

export const metadata: Metadata = { title: "פוסטים בבלוג" };

export default function PostsPage() {
  return <PostsScreen />;
}
