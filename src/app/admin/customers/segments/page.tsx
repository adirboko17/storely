import type { Metadata } from "next";
import { SegmentsScreen } from "@/components/admin/customers/segments-screen";

export const metadata: Metadata = { title: "פלחים" };

export default function SegmentsPage() {
  return <SegmentsScreen />;
}
