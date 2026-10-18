import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{8,200}$/;

export async function POST(request: Request) {
  const formData = await request.formData();
  const decision = formData.get("decision");
  const authorizationId = formData.get("authorization_id");
  if (typeof authorizationId !== "string" || !AUTHORIZATION_ID.test(authorizationId)) {
    return NextResponse.json({ error: "חסר מזהה בקשה" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const result =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

  if (result.error || !result.data?.redirect_url) {
    return NextResponse.json({ error: result.error?.message || "לא הצלחנו לסיים את האישור" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(result.data.redirect_url);
  } catch {
    return NextResponse.json({ error: "כתובת החזרה לא תקינה" }, { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "כתובת החזרה לא תקינה" }, { status: 400 });
  }

  return NextResponse.redirect(target, 303);
}
