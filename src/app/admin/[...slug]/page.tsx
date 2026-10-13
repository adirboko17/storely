import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ModulePlaceholder } from "@/components/admin/shared/module-placeholder";
import { modulePathStatus, titleForAdminPath } from "@/platform/navigation";
import { getAdminSession } from "@/platform/session";

async function UnbuiltModule({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/admin/${slug.join("/")}`;
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
