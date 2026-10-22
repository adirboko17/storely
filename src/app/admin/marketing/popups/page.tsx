import type { Metadata } from "next";
import { PopupsScreen } from "@/components/admin/marketing/popups-screen";

export const metadata: Metadata = { title: "פופאפים" };

export default function PopupsPage() {
  return <PopupsScreen />;
}
