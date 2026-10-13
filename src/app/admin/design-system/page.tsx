import type { Metadata } from "next";
import { DesignSystemScreen } from "@/components/admin/design/design-system-screen";

export const metadata: Metadata = { title: "מערכת עיצוב ומפרט" };

export default function DesignSystemPage() {
  return <DesignSystemScreen />;
}
