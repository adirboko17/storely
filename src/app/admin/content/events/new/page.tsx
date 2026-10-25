import type { Metadata } from "next";
import { EventEditorScreen } from "@/components/admin/events/event-editor-screen";

export const metadata: Metadata = { title: "אירוע חדש" };

export default function NewEventPage() {
  return <EventEditorScreen eventId={null} />;
}
