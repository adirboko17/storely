import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { PopupPreviewFrame } from "@/components/marketing/popup-preview-frame";
import { readPopupPreview } from "@/lib/mcp/popup-preview-token";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Popup preview",
  robots: { index: false, follow: false },
};

export default function PopupPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; device?: string; state?: string }>;
}) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#e7e1db]" />}>
      <PopupPreview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PopupPreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; device?: string; state?: string }>;
}) {
  await io();
  const { id } = await params;
  const query = await searchParams;
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!secret || readPopupPreview(query.token ?? "", secret) !== id) notFound();
  const supabase = createSupabaseServiceClient();
  const { data: popup } = await supabase.from("store_popups").select("store_id, design").eq("id", id).maybeSingle();
  if (!popup) notFound();
  const { data: settings } = await supabase.from("store_settings").select("logo_url").eq("store_id", popup.store_id).maybeSingle();
  const device = query.device === "mobile" ? "mobile" : "desktop";
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Playfair+Display:wght@500;700&display=swap" />
      <PopupPreviewFrame design={popup.design} device={device} logoUrl={settings?.logo_url ?? ""} submitted={query.state === "success"} />
    </>
  );
}
