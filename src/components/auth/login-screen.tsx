"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ConnectingScreen } from "@/components/auth/connecting-screen";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const field =
  "h-11 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-[15px] text-[#1a1a1a] outline-none";

export function LoginScreen({ nextPath = "" }: { nextPath?: string }) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);

  function continueWithEmail() {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("הזינו כתובת אימייל תקינה");
      setNotice("");
      return;
    }
    setEmail(value);
    setError("");
    setNotice("");
    setStep("password");
  }

  async function signIn() {
    if (password.length === 0) {
      setError("הזינו סיסמה");
      return;
    }
    setPending(true);
    setError("");
    let entered = false;
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message.toLowerCase().includes("invalid") ? "האימייל או הסיסמה לא נכונים" : "לא הצלחנו להתחבר. נסו שוב");
        return;
      }
      entered = true;
      setConnecting(true);
      const destination = nextPath || ((await supabase.rpc("has_platform_access")).data === true ? "/platform" : "/admin");
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.push(destination);
      router.refresh();
    } catch {
      entered = false;
      setConnecting(false);
      setError("לא הצלחנו להתחבר. נסו שוב");
    } finally {
      if (!entered) setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (step === "email") continueWithEmail();
    else void signIn();
  }

  function unavailable(label: string) {
    setError("");
    setNotice(`${label} עדיין לא מחובר לחשבון`);
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-[#070b14] text-[#1a1a1a]">
      {connecting ? <ConnectingScreen /> : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(72,156,255,0.5)_0%,rgba(18,48,120,0.28)_46%,rgba(0,0,0,0.72)_100%)]"
      />

      <div className="absolute top-7 right-7 z-10 flex items-center gap-2.5 text-white sm:top-8 sm:right-9">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/storely-logo.png" alt="" className="block h-[30px] w-auto" />
        <span className="text-[22px] leading-none font-bold tracking-[-0.04em]">storely</span>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-24">
        <section className="w-full max-w-[400px] rounded-2xl bg-white px-7 pt-8 pb-6 shadow-[0_18px_50px_rgba(0,0,0,0.35)] sm:px-8">
          <h1 className="m-0 text-[24px] leading-8 font-extrabold tracking-[-0.02em] text-[#1a1a1a]">התחברות</h1>
          <p className="m-0 mt-1 text-[15px] leading-6 font-semibold text-[#1a1a1a]">
            המשך אל <bdi>Storely</bdi>
          </p>

          <form className="mt-6" onSubmit={onSubmit} noValidate>
            {step === "email" ? (
              <label htmlFor={emailId} className="block text-[13px] leading-5 font-medium">
                אימייל
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  dir="ltr"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  className={`${field} mt-1.5 text-left`}
                />
              </label>
            ) : (
              <>
                <div className="flex items-center gap-3 text-[13px] leading-5">
                  <span dir="ltr" className="min-w-0 truncate text-left text-[#616161]">
                    {email}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-[#005bd3] hover:underline"
                    onClick={() => {
                      setStep("email");
                      setPassword("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    שינוי
                  </button>
                </div>
                <label htmlFor={passwordId} className="mt-4 block text-[13px] leading-5 font-medium">
                  סיסמה
                  <input
                    id={passwordId}
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    dir="ltr"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    className={`${field} mt-1.5 text-left`}
                  />
                </label>
              </>
            )}

            {error ? (
              <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-[#8e1f0b]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-4 h-11 w-full rounded-lg bg-[#1a1a1a] text-[14px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-70"
            >
              {step === "email" ? "המשך באמצעות אימייל" : pending ? "מתחברים…" : "התחברות"}
            </button>
          </form>

          {step === "email" ? (
            <>
              <div className="my-5 flex items-center gap-3 text-[13px] text-[#616161]">
                <span className="h-px flex-1 bg-[#e3e3e3]" />
                או
                <span className="h-px flex-1 bg-[#e3e3e3]" />
              </div>

              <button
                type="button"
                onClick={() => unavailable("מפתח גישה")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#f1f1f1] text-[14px] font-medium text-[#1a1a1a] transition-colors hover:bg-[#e7e7e7]"
              >
                <KeyIcon />
                התחברות עם מפתח גישה
              </button>

              <div className="mt-2.5 grid grid-cols-4 gap-2">
                <ProviderButton label="וואטסאפ" onClick={() => unavailable("וואטסאפ")}>
                  <WhatsAppIcon />
                </ProviderButton>
                <ProviderButton label="פייסבוק" onClick={() => unavailable("פייסבוק")}>
                  <FacebookIcon />
                </ProviderButton>
                <ProviderButton label="Apple" onClick={() => unavailable("Apple")}>
                  <AppleIcon />
                </ProviderButton>
                <ProviderButton label="Google" onClick={() => unavailable("Google")}>
                  <GoogleIcon />
                </ProviderButton>
              </div>

              {notice ? (
                <p role="status" className="m-0 mt-3 text-center text-[13px] leading-5 text-[#616161]">
                  {notice}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("חשבון ניהול נפתח בהזמנה מבעל החנות");
                }}
                className="mx-auto mt-5 flex items-center justify-center gap-1 text-[13px] leading-5 text-[#005bd3] hover:underline"
              >
                <span>
                  חדש ב-<bdi>Storely</bdi>? התחל עכשיו
                </span>
                <ArrowIcon />
              </button>
            </>
          ) : null}
        </section>
      </div>

      <footer className="relative z-10 px-6 pb-7 text-center">
        <p className="m-0 text-[13px] leading-5 text-white/90">
          <Link href="/support" className="underline">
            צריך עזרה?
          </Link>
        </p>
        <p className="mx-auto mt-2 max-w-[560px] text-[11px] leading-4 text-white/45">
          המשך מהווה הסכמה לתנאי השימוש ול
          <Link href="/privacy" className="underline">
            מדיניות הפרטיות
          </Link>{" "}
          של <bdi>Storely</bdi>.
        </p>
      </footer>
    </main>
  );
}

function ProviderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={`התחברות עם ${label}`}
      onClick={onClick}
      className="flex h-11 items-center justify-center rounded-lg bg-[#f1f1f1] transition-colors hover:bg-[#e7e7e7]"
    >
      {children}
    </button>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="7.5" cy="12" r="4" stroke="#1a1a1a" strokeWidth="1.8" />
      <circle cx="7.5" cy="12" r="1.35" fill="#1a1a1a" />
      <path d="M11.2 12H21M16.4 12v3.3M19.2 12v3.3" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M12.5 5 7.5 10l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M12.04 3C7.6 3 4 6.55 4 10.93c0 1.4.37 2.76 1.08 3.96L4 21l6.28-1.64a8.1 8.1 0 0 0 3.76.92h.01c4.44 0 8.04-3.55 8.04-7.93C22.09 6.55 16.48 3 12.04 3z"
      />
      <path
        fill="#fff"
        d="M16.7 14.42c-.2-.1-1.18-.58-1.36-.64-.18-.07-.32-.1-.45.1-.14.2-.52.64-.64.77-.12.14-.23.15-.43.05-.2-.1-.84-.3-1.6-.98-.59-.52-.99-1.16-1.1-1.36-.12-.2-.01-.3.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.34.06-.14.03-.26-.02-.36-.05-.1-.45-1.08-.62-1.48-.16-.39-.33-.33-.45-.34h-.38c-.14 0-.36.05-.55.26-.18.2-.72.7-.72 1.7s.74 1.97.84 2.11c.1.14 1.45 2.2 3.5 3.09 1.23.53 1.71.58 2.32.49.37-.06 1.18-.48 1.35-.94.16-.46.16-.86.11-.94-.04-.08-.18-.13-.38-.23z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path fill="#1877F2" d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07C2 17.1 5.66 21.25 10.44 22v-7.03H7.9v-2.9h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.48h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.9h-2.34V22C18.34 21.25 22 17.1 22 12.07z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1a1a1a"
        d="M16.37 12.72c.03 2.72 2.39 3.62 2.42 3.64-.02.07-.38 1.3-1.25 2.57-.75 1.1-1.53 2.19-2.76 2.21-1.21.02-1.6-.72-2.98-.72s-1.81.7-2.95.74c-1.19.04-2.1-1.19-2.86-2.28-1.56-2.25-2.75-6.36-1.15-9.13.79-1.37 2.21-2.24 3.75-2.26 1.17-.02 2.28.79 2.98.79.7 0 2.01-.98 3.39-.83.58.02 2.2.23 3.24 1.76-.08.05-1.93 1.13-1.91 3.51zM14.7 6.3c.63-.76 1.05-1.82.94-2.88-.91.04-2.01.6-2.66 1.36-.58.68-1.1 1.76-.96 2.79 1.02.08 2.05-.51 2.68-1.27z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
