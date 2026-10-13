import type { Metadata } from "next";
import { GeneralSettingsScreen } from "@/components/admin/settings/general-screen";

export const metadata: Metadata = { title: "כללי" };

export default function SettingsPage() {
  return <GeneralSettingsScreen />;
}
