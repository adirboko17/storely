import type { Metadata } from "next";
import { UsersScreen } from "@/components/admin/settings/users-screen";

export const metadata: Metadata = { title: "משתמשים" };

export default function UsersSettingsPage() {
  return <UsersScreen />;
}
