import type { Metadata } from "next";
import { PopupEditorScreen } from "@/components/admin/marketing/popup-editor-screen";

export const metadata: Metadata = { title: "פופאפ" };

export default async function PopupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PopupEditorScreen popupId={id} />;
}
