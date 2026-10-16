import type { Metadata } from "next";
import { CampaignEditorScreen } from "@/components/admin/marketing/campaign-editor-screen";

export const metadata: Metadata = { title: "קמפיין" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CampaignEditorScreen campaignId={id} />;
}
