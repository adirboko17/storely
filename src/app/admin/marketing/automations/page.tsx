import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { loadStoreMessaging } from "@/app/admin/traffic";
import { AutomationsScreen } from "@/components/admin/marketing/automations-screen";
import { emptyMessaging } from "@/data/live/messaging";

export const metadata: Metadata = { title: "אוטומציות" };

export default function AutomationsPage() {
  return (
    <Suspense fallback={null}>
      <AutomationsRoute />
    </Suspense>
  );
}

async function AutomationsRoute() {
  await io();
  const messaging = (await loadStoreMessaging()) ?? emptyMessaging();
  return <AutomationsScreen messaging={messaging} />;
}
