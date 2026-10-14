import type { Metadata } from "next";
import { loadStoreAttribution } from "@/app/admin/traffic";
import { ReportDetailScreen } from "@/components/admin/analytics/report-detail-screen";

export const metadata: Metadata = { title: "דוח" };

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const channels = await loadStoreAttribution();
  return <ReportDetailScreen reportId={reportId} channels={channels} />;
}
