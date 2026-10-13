import type { Metadata } from "next";
import { LiveViewScreen } from "@/components/admin/analytics/live-view-screen";

export const metadata: Metadata = { title: "צפייה חיה" };

export default function LiveViewPage() {
  return <LiveViewScreen />;
}
