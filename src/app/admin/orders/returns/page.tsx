import type { Metadata } from "next";
import { ReturnsScreen } from "@/components/admin/orders/returns-screen";

export const metadata: Metadata = { title: "החזרות והחזרים כספיים" };

export default function ReturnsPage() {
  return <ReturnsScreen />;
}
