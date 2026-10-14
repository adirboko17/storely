import type { Metadata } from "next";
import { GrowthScreen } from "@/components/admin/growth/growth-screen";
import { loadStoreAttribution } from "@/app/admin/traffic";

export const metadata: Metadata = { title: "צמיחה" };

export default async function GrowthPage() {
  const channels = await loadStoreAttribution();
  return <GrowthScreen channels={channels} />;
}
