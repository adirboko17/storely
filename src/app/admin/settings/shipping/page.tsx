import type { Metadata } from "next";
import { ShippingScreen } from "@/components/admin/settings/shipping-screen";

export const metadata: Metadata = { title: "משלוחים" };

export default function ShippingPage() {
  return <ShippingScreen />;
}
