import { Suspense } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-shell" />}>
      <PlatformFrame>{children}</PlatformFrame>
    </Suspense>
  );
}

async function PlatformFrame({ children }: { children: React.ReactNode }) {
  await io();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allowed } = await supabase.rpc("has_platform_access");
  if (allowed !== true) redirect("/admin");

  return <PlatformShell email={user.email ?? ""}>{children}</PlatformShell>;
}
