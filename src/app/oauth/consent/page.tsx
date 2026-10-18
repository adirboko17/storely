import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { consentPath } from "@/lib/oauth/consent-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "אישור חיבור" };

const SCOPES: Record<string, string> = {
  openid: "לזהות את החשבון",
  email: "לראות את כתובת האימייל",
  profile: "לראות את שם הפרופיל",
  phone: "לראות את מספר הטלפון",
  offline_access: "להישאר מחובר",
};

const button =
  "h-11 rounded-lg px-4 text-[14px] font-semibold";

export default function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#070a08]" />}>
      <Consent searchParams={searchParams} />
    </Suspense>
  );
}

async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  await io();
  const authorizationId = (await searchParams).authorization_id ?? "";
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(authorizationId)) {
    return <ConsentFrame title="בקשת החיבור לא תקינה" body="חסר מזהה בקשה. חזרו לכלי ונסו שוב." />;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?redirect=${encodeURIComponent(consentPath(authorizationId))}`);

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return <ConsentFrame title="לא הצלחנו לפתוח את הבקשה" body={error?.message || "בקשת החיבור לא בתוקף."} />;
  }
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const scopes = details.scope
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return (
    <ConsentFrame
      title={`לאשר את ${details.client.name}?`}
      body="הכלי יוכל לפעול בחנות שלכם בשמכם: לקרוא מוצרים ולקוחות, ליצור ולערוך אותם."
    >
      <dl className="mt-4 space-y-2 text-[13px] leading-5">
        <div>
          <dt className="text-[#616161]">אפליקציה</dt>
          <dd className="m-0 font-semibold text-[#1a1a1a]">{details.client.name}</dd>
        </div>
        {details.client.uri ? (
          <div>
            <dt className="text-[#616161]">אתר</dt>
            <dd dir="ltr" className="m-0 truncate text-left text-[#1a1a1a]">
              {details.client.uri}
            </dd>
          </div>
        ) : null}
        {scopes.length > 0 ? (
          <div>
            <dt className="text-[#616161]">מה מתבקש</dt>
            <dd className="m-0">
              <ul className="m-0 list-disc pr-4">
                {scopes.map((scope) => (
                  <li key={scope}>{SCOPES[scope] ?? scope}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      <form action="/api/oauth/decision" method="post" className="mt-5 grid grid-cols-2 gap-2">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button type="submit" name="decision" value="deny" className={`${button} bg-[#f1f1f1] text-[#1a1a1a]`}>
          ביטול
        </button>
        <button type="submit" name="decision" value="approve" className={`${button} bg-[#1a1a1a] text-white`}>
          אישור
        </button>
      </form>
    </ConsentFrame>
  );
}

function ConsentFrame({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-[#070a08] px-4 py-16">
      <section className="w-full max-w-[420px] rounded-2xl bg-white px-7 py-7 text-[#1a1a1a] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <h1 className="m-0 text-[22px] leading-7 font-extrabold">{title}</h1>
        <p className="mt-2 mb-0 text-[14px] leading-6 text-[#303030]">{body}</p>
        {children}
      </section>
    </main>
  );
}
