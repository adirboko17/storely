import type { Metadata } from "next";
import { Suspense } from "react";
import { SmsEditorScreen } from "@/components/admin/marketing/sms-editor-screen";

export const metadata: Metadata = { title: "SMS" };

async function SmsRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  return <SmsEditorScreen smsId={id} fromFlow={typeof from === "string" ? from : ""} />;
}

export default function SmsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  return (
    <Suspense fallback={null}>
      <SmsRoute params={params} searchParams={searchParams} />
    </Suspense>
  );
}
