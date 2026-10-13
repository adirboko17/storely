import { NextResponse } from "next/server";
import { moduleAccess } from "@/platform/registry";
import { getAdminSession } from "@/platform/session";

/**
 * Server gate for a module.
 * A disabled or missing module returns no module payload.
 * Before deployment this route must sit behind the store's admin session.
 */
export async function GET(_request: Request, context: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await context.params;
  const access = moduleAccess(getAdminSession(), moduleId);

  if (!access.ok) {
    const status = access.reason === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: access.reason }, { status });
  }

  return NextResponse.json({
    id: access.module.id,
    name: access.module.name,
    version: access.module.version,
  });
}
