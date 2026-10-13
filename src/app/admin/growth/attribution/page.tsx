import type { Metadata } from "next";
import { AttributionScreen } from "@/components/admin/growth/attribution-screen";

export const metadata: Metadata = { title: "ייחוס" };

export default function AttributionPage() {
  return <AttributionScreen />;
}
