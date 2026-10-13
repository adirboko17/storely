import type { Metadata } from "next";
import { PoliciesScreen } from "@/components/admin/settings/policies-screen";

export const metadata: Metadata = { title: "פוליסות" };

export default function PoliciesPage() {
  return <PoliciesScreen />;
}
