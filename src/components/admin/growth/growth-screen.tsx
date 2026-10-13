"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";

const TYPES = [
  { label: "ישיר", value: "12,815", color: "#1fa7e8", width: "40.5%" },
  { label: "ממומן", value: "12,057", color: "#6b3fe0", width: "38.1%" },
  { label: "אורגני", value: "5,227", color: "#4f7fe8", width: "16.5%" },
  { label: "לא ידוע", value: "1,556", color: "#d63fb0", width: "4.9%" },
];

const CHANNELS = [
  { label: "ישיר", mark: "•", color: "#1fa7e8", visits: "8,420 ביקורים", value: "₪4,812.10", orders: "41 הזמנות", rate: "0.49%" },
  { label: "אינסטגרם", mark: "◎", color: "#d63fb0", visits: "3,110 ביקורים", value: "₪2,206.87", orders: "18 הזמנות", rate: "0.58%" },
  { label: "גוגל", mark: "G", color: "#4285f4", visits: "2,640 ביקורים", value: "₪1,904.40", orders: "16 הזמנות", rate: "0.61%" },
  { label: "פייסבוק", mark: "f", color: "#1877f2", visits: "1,980 ביקורים", value: "₪1,393.36", orders: "11 הזמנות", rate: "0.56%" },
];

const CAMPAIGNS = [
  { title: "מבצע חנוכה · דיוור", status: "מתוזמן", background: "#e0f0ff", color: "#00527c", channel: "דוא״ל", value: "—" },
  { title: "השקת קולקציית סתיו", status: "הסתיים", background: "#ebebeb", color: "#303030", channel: "אינסטגרם", value: "₪2,206.87" },
  { title: "תזכורת עגלה נטושה", status: "פעיל", background: "#cdfee1", color: "#0c5132", channel: "דוא״ל", value: "₪3,777.74" },
];

export function GrowthScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [hero, setHero] = useState(true);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-5 pt-11 pb-24">
      <h1 className="m-0 mb-2.5 text-[26px] leading-8 font-semibold text-[#1a1a1a]">צמיחה</h1>
      {hero ? (
        <div className="relative grid items-center gap-6 pb-7 min-[1000px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-start gap-2.5">
            <span className="inline-flex h-5 items-center rounded-md bg-[#a4e8f2] px-[7px] text-[13px] font-semibold text-[#00527c]">גישה מוקדמת</span>
            <h2 className="m-0 text-[26px] leading-[34px] font-semibold text-balance text-[#1a1a1a]">שיווק על טייס אוטומטי</h2>
            <p className="m-0 max-w-[470px] leading-[22px] text-pretty">הטייס האוטומטי מקדם את המוצרים שלכם בערוצים המובילים, וממשיך לשפר את האסטרטגיה בזמן שאתם נשארים בשליטה.</p>
            <div className="mt-1 flex gap-2">
              <button type="button" className={darkButton} onClick={() => toast("הטייס האוטומטי יהיה זמין בהמשך")}>מתחילים</button>
              <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold">מידע נוסף</button>
            </div>
          </div>
          <div className="grid place-items-center">
            <div className="flex w-[220px] -rotate-3 flex-col gap-1.5 rounded-xl bg-[#2a2a2a] p-3 shadow-[0_12px_30px_rgba(0,0,0,.18)]">
              <span className="text-[11px] text-[#b5b5b5]">מכירות לפי ערוץ</span>
              <span className="flex items-baseline gap-1.5"><b className="text-sm text-white">1,045</b><span className="text-[11px] text-[#36d399]">↗ 32%</span></span>
              <svg viewBox="0 0 196 44" width="196" height="44" aria-hidden><path d="M0,38 L20,34 L40,36 L60,28 L80,30 L100,22 L120,24 L140,14 L160,18 L180,8 L196,10" fill="none" stroke="#36d399" strokeWidth="2" /><path d="M0,40 L30,38 L60,36 L90,34 L120,32 L150,30 L196,26" fill="none" stroke="#7b61d6" strokeWidth="1.5" /></svg>
              <span className="self-start rounded-[10px] bg-[#3a3a3a] px-2 py-0.5 text-[10px] text-[#e3e3e3]">• הועברו ₪250 ממטא לגוגל</span>
            </div>
          </div>
          <button type="button" className="absolute top-[-6px] left-0 inline-flex h-7 items-center gap-1.5 rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-[13px] font-semibold" onClick={() => setHero(false)}>הסתרה</button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[15px] font-semibold">ביצועים</h2>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2.5 text-sm font-semibold">30 הימים האחרונים</button>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-transparent px-2.5 text-sm font-semibold" onClick={() => router.push("/admin/growth/attribution")}>לפרטים</button>
      </div>
      <div className="grid gap-3.5 min-[1000px]:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <div className="flex items-center"><span className="flex-1 text-sm font-semibold underline decoration-dotted underline-offset-[3px]">מכירות שיוחסו לשיווק</span><span dir="ltr" className="text-sm font-bold text-[#4a4a4a]">↘ 3%</span></div>
          <div className="flex flex-wrap items-baseline gap-1.5"><b dir="ltr" className="text-[22px]">₪10,316.73</b><span className="text-sm">מתוך <b dir="ltr">₪208,028.02</b> סך המכירות בחנות</span></div>
          <svg viewBox="0 0 400 70" className="mt-2 h-20 w-full" aria-hidden><path d="M0,40 C40,42 80,30 120,34 C160,38 200,22 240,26 C280,30 320,18 360,16 L400,14" fill="none" stroke="#7fd0f2" strokeWidth="1.3" strokeDasharray="2 3" /><path d="M0,48 C40,44 80,36 120,32 C160,28 200,24 240,18 C280,20 320,12 360,10 L400,8" fill="none" stroke="#1fa7e8" strokeWidth="1.6" /></svg>
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
          <span className="text-sm font-semibold underline decoration-dotted underline-offset-[3px]">ביקורים לפי סוג תנועה</span>
          <div className="flex flex-wrap gap-5">
            {TYPES.map((type) => (
              <div key={type.label} className="flex flex-col text-xs">
                <span className="flex items-center gap-1.5 text-[#4a4a4a]"><span className="size-2 rounded-full" style={{ background: type.color }} />{type.label}</span>
                <b className="text-[13px]">{type.value}</b>
              </div>
            ))}
          </div>
          <div className="flex h-14 gap-[3px]">{TYPES.map((type) => <div key={type.label} style={{ width: type.width, background: type.color }} />)}</div>
        </div>
      </div>
      <div className="grid gap-3.5 min-[1000px]:grid-cols-4">
        {CHANNELS.map((channel) => (
          <div key={channel.label} className="flex min-h-[180px] flex-col gap-1.5 rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
            <div className="flex items-center gap-2"><span className="grid size-[18px] place-items-center rounded-[5px] text-[10px] font-extrabold text-white" style={{ background: channel.color }}>{channel.mark}</span><span className="flex-1 font-semibold underline decoration-dotted underline-offset-[3px]">{channel.label}</span><span className="text-[13px] text-[#4a4a4a]">{channel.visits}</span></div>
            <div className="flex-1" />
            <b dir="ltr" className="text-right text-[22px]">{channel.value}</b>
            <span className="text-[13px] leading-[19px]">ערך הזמנות של <b>{channel.orders}</b> בשיעור המרה של <b dir="ltr">{channel.rate}</b>.</span>
          </div>
        ))}
      </div>
      <h2 className="m-0 mt-3.5 text-[15px] font-semibold">טייס אוטומטי לקמפיינים</h2>
      <div className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <span className="flex-1">חברו ערוצים כדי לקדם את המוצרים שלכם אוטומטית בקמפיינים מנוהלים.</span>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => toast("הטייס האוטומטי יהיה זמין בהמשך")}>מתחילים</button>
      </div>
      <div className="mt-3.5 flex items-center"><h2 className="m-0 flex-1 text-[15px] font-semibold">קמפיינים אחרונים</h2><button type="button" className="border-0 bg-transparent text-sm" onClick={() => router.push("/admin/marketing/automations")}>הצגת הכל</button></div>
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {CAMPAIGNS.map((campaign) => (
          <div key={campaign.title} className="flex items-center gap-3 border-b border-[#f1f1f1] px-4 py-3">
            <span className="flex-1 font-medium">{campaign.title}</span>
            <span className="inline-flex h-5 items-center rounded-md px-[7px] text-xs font-semibold" style={{ background: campaign.background, color: campaign.color }}>{campaign.status}</span>
            <span className="w-[110px] text-[13px] text-[#4a4a4a]">{campaign.channel}</span>
            <b dir="ltr" className="w-[90px] text-left">{campaign.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
