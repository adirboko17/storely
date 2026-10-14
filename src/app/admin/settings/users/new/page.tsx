import type { Metadata } from "next";
import { UserFormScreen } from "@/components/admin/settings/user-form-screen";

export const metadata: Metadata = { title: "הוספת משתמש" };

export default function NewUserPage() {
  return <UserFormScreen />;
}
