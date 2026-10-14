import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ModulePlaceholder } from "@/components/admin/shared/module-placeholder";
import { modulePathStatus, titleForAdminPath } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";

async function UnbuiltModule({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/admin/${slug.join("/")}`;
  if (path === "/admin/online-store" || path.startsWith("/admin/online-store/")) redirect("/admin");
  const session = getAdminSession();
  if (modulePathStatus(path, session) === "unavailable") notFound();
  return <ModulePlaceholder title={titleForAdminPath(path, session)} />;
}

export default function UnbuiltModulePage({ params }: { params: Promise<{ slug: string[] }> }) {
  return (
    <Suspense fallback={<ModulePlaceholder title="…" />}>
      <UnbuiltModule params={params} />
    </Suspense>
  );
}
