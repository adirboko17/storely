import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { loadStoreAttribution } from "@/app/admin/traffic";
import { AttributionScreen } from "@/components/admin/growth/attribution-screen";

export const metadata: Metadata = { title: "ייחוס" };

export default function AttributionPage() {
  return (
    <Suspense fallback={null}>
      <AttributionRoute />
    </Suspense>
  );
}

async function AttributionRoute() {
  await io();
  const channels = await loadStoreAttribution();
  return <AttributionScreen channels={channels} />;
}
