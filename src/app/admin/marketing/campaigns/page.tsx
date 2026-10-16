import type { Metadata } from "next";
import { CampaignsScreen } from "@/components/admin/marketing/campaigns-screen";

export const metadata: Metadata = { title: "קמפיינים" };

export default function CampaignsPage() {
  return <CampaignsScreen />;
}
