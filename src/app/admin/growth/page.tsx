import type { Metadata } from "next";
import { GrowthScreen } from "@/components/admin/growth/growth-screen";

export const metadata: Metadata = { title: "צמיחה" };

export default function GrowthPage() {
  return <GrowthScreen />;
}
