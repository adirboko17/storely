import type { Metadata } from "next";
import { EventsScreen } from "@/components/admin/events/events-screen";

export const metadata: Metadata = { title: "אירועים" };

export default function EventsPage() {
  return <EventsScreen />;
}
