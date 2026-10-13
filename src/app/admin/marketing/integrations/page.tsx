import type { Metadata } from "next";
import { IntegrationsScreen } from "@/components/admin/marketing/integrations-screen";

export const metadata: Metadata = { title: "אינטגרציות" };

export default function IntegrationsPage() {
  return <IntegrationsScreen />;
}
