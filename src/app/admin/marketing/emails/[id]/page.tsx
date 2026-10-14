import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailEditorScreen } from "@/components/admin/marketing/email-editor-screen";

export const metadata: Metadata = { title: "מייל" };

async function EmailRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  return <EmailEditorScreen emailId={id} fromFlow={typeof from === "string" ? from : ""} />;
}

export default function EmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  return (
    <Suspense fallback={null}>
      <EmailRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}
