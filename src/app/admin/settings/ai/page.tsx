import type { Metadata } from "next";
import { AiConnectionsScreen } from "@/components/admin/settings/ai-screen";

export const metadata: Metadata = { title: "חיבור AI" };

export default function AiSettingsPage() {
  return <AiConnectionsScreen />;
}
