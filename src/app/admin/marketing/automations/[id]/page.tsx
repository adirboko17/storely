import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AutomationEditorScreen } from "@/components/admin/marketing/automation-editor-screen";

export const metadata: Metadata = { title: "אוטומציה" };

async function AutomationRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <AutomationEditorScreen flowId={Number(id)} />;
}

export default function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <AutomationRoute params={params} />
    </Suspense>
  );
}
