"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";

const INSIGHTS = [
  { label: "מכירות מלקוחות חדשים", title: "המכירות מלקוחות חדשים מזנקות זה השבוע השלישי", text: "הכנסתם ₪46.59K מסוג הלקוחות לקוח חדש בשבוע שעבר. הפלח הזה צמח ב-48%, בזמן שהעסק כולו צמח ב-41%." },
  { label: "הזמנות עם משלוח לתל אביב", title: "ההזמנות לתל אביב עלו ב-22% השבוע", text: "תל אביב-יפו הביאה ₪18.2K השבוע, 39% מכלל ההכנסות." },
  { label: "מוצרים מסטודיו לבנה", title: "הספל בגוון אפור חול הוא המוצר הנמכר ביותר", text: "הספל מכר 142 יחידות ב-30 הימים האחרונים, 27% מהיחידות שנמכרו." },
  { label: "תמונת מכירות", title: "המכירות היום נמוכות ב-31% לעומת אתמול", text: "עד 10:27 נמכר ב-₪2,480.80. רוב המכירות של אתמול הגיעו אחרי 18:00." },
];

const METRICS = [
  ["מכירות ברוטו", "₪2,501.70", "↘ 27%", "#616161"],
  ["שיעור לקוחות חוזרים", "20%", "", "#1f7a4d"],
  ["הזמנות שנשלחו", "13", "↗ 18%", "#1f7a4d"],
  ["הזמנות", "10", "↘ 9%", "#616161"],
];

const BREAKDOWN = [
  ["מכירות ברוטו", "₪2,501.70", "↘ 27%"],
  ["הנחות", "−₪50.73", "↗ 31%"],
  ["ביטולי מכירות", "−₪169.67", "—"],
  ["מכירות נטו", "₪2,281.30", "↘ 32%"],
  ["דמי משלוח", "₪199.50", "↘ 29%"],
  ["סך המכירות", "₪2,480.80", "↘ 31%"],
];

export function AnalyticsScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [banner, setBanner] = useState(true);
  const [insight, setInsight] = useState(0);
  const current = INSIGHTS[insight] ?? INSIGHTS[0];

  return (
    <div className="flex min-h-full flex-col gap-3.5 px-3.5 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="bars" size={18} strokeWidth={1.7} />
        <h1 className="m-0 text-[15px] font-bold">ניתוח נתונים</h1>
        <span className="flex-1 text-sm text-ink-secondary">רענון אחרון: 10:27</span>
        <button type="button" className={softButton} onClick={() => toast("הגדרת יעדים חודשיים תתווסף בהמשך")}>הגדרת יעדים</button>
        <button type="button" className={darkButton} onClick={() => router.push("/admin/analytics/reports")}>ניתוח חדש</button>
      </div>
      {banner ? (
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#d8f3fb] px-4 py-3.5 text-[#0b3b4b]">
          <span className="flex-1 text-pretty">החל מ-21 בספטמבר 2026, מספרי הביקורים והמדדים הקשורים אליהם עשויים להשתנות, כי המערכת מסננת עכשיו תנועה של בוטים.</span>
          <button type="button" aria-label="סגירה" className="border-0 bg-transparent" onClick={() => setBanner(false)}>×</button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-sm font-semibold">היום</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-sm font-semibold">בהשוואה ל: 12 באוק׳ 2026</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-sm font-semibold">₪ ILS</button>
      </div>
      <div className="grid overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)] min-[1000px]:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-0.5 border-e border-[#ebebeb] bg-[#f7f7f7] p-2.5">
          {INSIGHTS.map((item, index) => (
            <button key={item.label} type="button" className="h-[34px] rounded-[10px] border-0 px-2.5 text-start text-sm" style={{ background: insight === index ? "#fff" : "transparent", fontWeight: insight === index ? 600 : 500, boxShadow: insight === index ? "0 0 0 1px rgba(0,0,0,.06)" : "none" }} onClick={() => setInsight(index)}>{item.label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <h2 className="m-0 text-base font-semibold">{current.title}</h2>
          <p className="m-0 text-pretty">{current.text}</p>
          <button type="button" className="self-start border-0 bg-transparent p-0 text-sm text-[#005bd3]" onClick={() => toast("העוזר מנתח את הנתונים מאחורי התובנה")}>למה זה קורה?</button>
        </div>
      </div>
      <div className="grid gap-3 min-[800px]:grid-cols-4">
        {METRICS.map(([label, value, delta, color]) => (
          <div key={label} className="rounded-[14px] bg-white p-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">{label}</div>
            <div className="mt-1 flex items-center gap-1.5"><b dir="ltr">{value}</b><span dir="ltr" className="text-xs font-semibold" style={{ color }}>{delta}</span></div>
          </div>
        ))}
      </div>
      <div className="rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="text-sm font-semibold">סך המכירות <b dir="ltr">₪2,480.80</b></div>
        <svg viewBox="0 0 800 180" className="mt-2 h-[180px] w-full" aria-hidden>
          <path d="M0,140 C60,130 120,120 180,100 C240,70 300,90 360,60 C420,40 480,80 540,50 C600,30 680,55 800,20" fill="none" stroke="#9cc3ee" strokeDasharray="3 3" />
          <path d="M0,150 C40,120 80,130 120,90 C160,40 200,70 240,55 L320,48" fill="none" stroke="#2c6ecb" strokeWidth="2" />
        </svg>
      </div>
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {BREAKDOWN.map(([label, value, delta], index) => (
          <div key={label} className="flex items-center gap-3 px-4 py-2.5" style={{ background: index % 2 ? "#f7f7f7" : "#fff" }}>
            <span className="flex-1">{label}</span>
            <b dir="ltr">{value}</b>
            <span dir="ltr" className="w-16 text-left text-[13px] text-[#616161]">{delta}</span>
          </div>
        ))}
      </div>
      <div className="h-16" />
    </div>
  );
}
