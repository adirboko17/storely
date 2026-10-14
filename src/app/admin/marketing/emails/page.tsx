import type { Metadata } from "next";
import { EmailsScreen } from "@/components/admin/marketing/emails-screen";

export const metadata: Metadata = { title: "מיילים ו-SMS" };

export default function EmailsPage() {
  return <EmailsScreen />;
}
