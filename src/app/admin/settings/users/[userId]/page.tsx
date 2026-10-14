import type { Metadata } from "next";
import { UserFormScreen } from "@/components/admin/settings/user-form-screen";

export const metadata: Metadata = { title: "עריכת משתמש" };

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserFormScreen userId={userId} />;
}
