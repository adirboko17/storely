import type { Metadata } from "next";
import { ReportsScreen } from "@/components/admin/analytics/reports-screen";

export const metadata: Metadata = { title: "דוחות" };

export default function ReportsPage() {
  return <ReportsScreen />;
}
