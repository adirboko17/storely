import type { Metadata } from "next";
import { CustomersListScreen } from "@/components/admin/customers/customers-list-screen";

export const metadata: Metadata = { title: "לקוחות" };

export default function CustomersPage() {
  return <CustomersListScreen />;
}
