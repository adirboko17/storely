import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";
import { LoginScreen } from "@/components/auth/login-screen";
import { consentReturnPath } from "@/lib/oauth/consent-path";

export const metadata: Metadata = {
  title: "התחברות",
};

export default function LoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#070b14]" />}>
      <LoginRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginRoute({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  await io();
  const { redirect: next } = await searchParams;
  return <LoginScreen nextPath={consentReturnPath(next)} />;
}
