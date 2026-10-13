import type { Metadata } from "next";
import { AutomationsScreen } from "@/components/admin/marketing/automations-screen";

export const metadata: Metadata = { title: "אוטומציות" };

export default function AutomationsPage() {
  return <AutomationsScreen />;
}
