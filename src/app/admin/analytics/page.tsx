import type { Metadata } from "next";
import { AnalyticsScreen } from "@/components/admin/analytics/analytics-screen";

export const metadata: Metadata = { title: "ניתוח נתונים" };

export default function AnalyticsPage() {
  return <AnalyticsScreen />;
}
