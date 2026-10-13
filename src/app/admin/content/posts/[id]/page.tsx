import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PostEditorScreen } from "@/components/admin/content/post-editor-screen";

export const metadata: Metadata = { title: "פוסט" };

async function PostRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <PostEditorScreen postId={Number(id)} />;
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <PostRoute params={params} />
    </Suspense>
  );
}
