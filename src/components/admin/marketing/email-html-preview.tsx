"use client";

import { useMemo, useState } from "react";
import type { MarketingEmail } from "@/data/mock/marketing-session";
import { renderEmailDocument, sampleEmailProfile, type EmailProfile } from "@/lib/marketing/email-document";

export function EmailHtmlPreview({ email, storeName, logoUrl, compact = false }: { email: MarketingEmail; storeName: string; logoUrl: string; compact?: boolean }) {
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const profile = useMemo<EmailProfile>(() => sampleEmailProfile(storeName, logoUrl), [storeName, logoUrl]);
  const document = useMemo(() => renderEmailDocument(email, profile), [email, profile]);

  return (
    <div className={`flex w-full flex-col gap-3 ${compact ? "" : "mx-auto max-w-[860px] gap-4"}`}>
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-white p-0.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <button type="button" onClick={() => setWidth("desktop")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${width === "desktop" ? "bg-[#1a1a1a] text-white" : "bg-transparent text-[#1a1a1a]"}`}>דסקטופ</button>
          <button type="button" onClick={() => setWidth("mobile")} className={`h-8 rounded-full border-0 px-3 text-sm font-semibold ${width === "mobile" ? "bg-[#1a1a1a] text-white" : "bg-transparent text-[#1a1a1a]"}`}>מובייל</button>
        </div>
        <span className="text-[13px] text-[#4a4a4a]">{compact ? "תצוגה מקדימה של המייל שיישלח" : `תצוגה של HTML אמיתי, מימין לשמאל, עם שם לדוגמה: ${profile.firstName}`}</span>
      </div>
      <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <iframe
          title="תצוגת HTML של המייל"
          sandbox=""
          srcDoc={document.html}
          className={`mx-auto block border-0 bg-[#e7e7e7] ${compact ? "h-[420px]" : "h-[640px]"}`}
          style={{ width: width === "mobile" ? 360 : "100%" }}
        />
      </div>
      {compact ? null : (
        <div className="rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <b className="block text-sm">Plain Text</b>
          <pre className="m-0 mt-2 whitespace-pre-wrap text-sm leading-6 text-[#303030]" dir="rtl">{document.text}</pre>
        </div>
      )}
    </div>
  );
}
