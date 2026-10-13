import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { moduleAccess } from "@/platform/registry";
import { getAdminSession } from "@/platform/session";

export const metadata: Metadata = {
  title: "מועדון לקוחות",
};

export default function LoyaltyPage() {
  const access = moduleAccess(getAdminSession(), "loyalty-program");
  if (!access.ok) notFound();

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-4 px-4 py-4 min-[1000px]:px-6 min-[1000px]:py-6">
      <h1 className="m-0 text-[22px] leading-7 font-bold">{access.module.name}</h1>
      <Card className="px-4 py-5">
        <p className="m-0 text-sm text-ink-secondary">{access.module.description}</p>
      </Card>
    </div>
  );
}
