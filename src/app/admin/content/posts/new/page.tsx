import type { Metadata } from "next";
import { PostEditorScreen } from "@/components/admin/content/post-editor-screen";

export const metadata: Metadata = { title: "הוספת פוסט בבלוג" };

export default function NewPostPage() {
  return <PostEditorScreen postId={null} />;
}
