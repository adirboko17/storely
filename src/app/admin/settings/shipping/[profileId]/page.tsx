import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ShippingProfileScreen } from "@/components/admin/settings/shipping-profile-screen";

export const metadata: Metadata = { title: "פרופיל משלוח" };

async function ProfileRoute({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!/^[a-z0-9-]+$/i.test(profileId)) notFound();
  return <ShippingProfileScreen profileId={profileId} />;
}

export default function ShippingProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  return (
    <Suspense fallback={null}>
      <ProfileRoute params={params} />
    </Suspense>
  );
}
