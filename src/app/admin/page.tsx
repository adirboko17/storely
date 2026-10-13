import type { Metadata } from "next";
import { DashboardScreen } from "@/components/admin/dashboard/dashboard-screen";
import { contributions } from "@/platform/registry";
import { getAdminSession } from "@/platform/session";

export const metadata: Metadata = {
  title: "בית",
};

export default function DashboardPage() {
  const cards = contributions(getAdminSession(), "dashboard.cards").map(({ id, title, body }) => ({
    id,
    title,
    body,
  }));

  return <DashboardScreen cards={cards} />;
}
