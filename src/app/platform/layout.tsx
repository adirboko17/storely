import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allowed } = await supabase.rpc("has_platform_access");
  if (allowed !== true) redirect("/admin");

  return <PlatformShell email={user.email ?? ""}>{children}</PlatformShell>;
}
