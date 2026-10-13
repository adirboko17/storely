import type { Metadata } from "next";
import { NewCustomerScreen } from "@/components/admin/customers/new-customer-screen";

export const metadata: Metadata = { title: "לקוח חדש" };

export default function NewCustomerPage() {
  return <NewCustomerScreen />;
}
