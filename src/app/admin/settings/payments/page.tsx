import type { Metadata } from "next";
import { PaymentsScreen } from "@/components/admin/settings/payments-screen";

export const metadata: Metadata = { title: "סליקה" };

export default function PaymentsSettingsPage() {
  return <PaymentsScreen />;
}
