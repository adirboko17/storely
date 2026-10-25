import type { Metadata } from "next";
import { EventEditorScreen } from "@/components/admin/events/event-editor-screen";

export const metadata: Metadata = { title: "אירוע" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventEditorScreen eventId={id} />;
}
