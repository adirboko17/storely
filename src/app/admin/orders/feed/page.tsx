import type { Metadata } from "next";
import { OrderFeedScreen } from "@/components/admin/orders/feed-screen";

export const metadata: Metadata = { title: "מפתח קריאה להזמנות" };

export default function OrderFeedPage() {
  return <OrderFeedScreen />;
}
