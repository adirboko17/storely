"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";

const LINES = [
  { label: "ישיר", color: "#1fa7e8", path: "M0,160 C80,150 140,140 200,120 C280,90 340,100 420,70 C500,40 580,55 680,30 C760,20 860,28 1000,18" },
  { label: "פייסבוק (ממומן)", color: "#6b3fe0", path: "M0,180 C100,170 180,160 260,150 C360,130 440,140 540,110 C640,90 760,100 1000,70" },
  { label: "חיפוש בגוגל (אורגני)", color: "#4f7fe8", path: "M0,200 C120,196 220,190 340,184 C480,176 620,170 760,164 C880,158 940,154 1000,150" },
  { label: "אינסטגרם (אורגני)", color: "#d63fb0", path: "M0,210 C140,206 260,200 400,194 C560,186 720,180 860,174 L1000,168" },
  { label: "אינסטגרם (ממומן)", color: "#1bb3a0", path: "M0,190 C100,182 200,170 320,160 C460,145 600,150 740,130 C860,118 940,110 1000,100" },
];

const ROWS = [
  ["ישיר", "ישיר", "#1fa7e8", "•", "8,420", "₪48,210.00", "214", "2.54%", "₪225.28", "86", "41%"],
  ["פייסבוק (ממומן)", "ממומן", "#6b3fe0", "f", "4,630", "₪31,440.00", "128", "2.76%", "₪245.63", "70", "32%"],
  ["חיפוש בגוגל (אורגני)", "אורגני", "#4f7fe8", "G", "1,860", "₪12,080.00", "54", "2.90%", "₪223.70", "22", "28%"],
  ["אינסטגרם (אורגני)", "אורגני", "#d63fb0", "◎", "1,180", "₪6,940.00", "31", "2.63%", "₪223.87", "14", "24%"],
  ["אינסטגרם (ממומן)", "ממומן", "#1bb3a0", "◎", "2,940", "₪18,220.00", "76", "2.59%", "₪239.74", "33", "30%"],
];

export function AttributionScreen() {
  const { toast } = useAdmin();
  const [granularity, setGranularity] = useState<"יומי" | "שבועי" | "חודשי">("יומי");
  const [metric, setMetric] = useState(0);
  const [hidden, setHidden] = useState<number[]>([]);
  const [banner, setBanner] = useState(true);
  const [asc, setAsc] = useState(false);
  const metrics = ["ביקורים לפי 5 הערוצים המובילים לאורך זמן", "הזמנות לפי 5 הערוצים המובילים לאורך זמן", "מכירות לפי 5 הערוצים המובילים לאורך זמן"];
  const rows = [...ROWS].sort((a, b) => (asc ? Number(a[4].replace(/,/g, "")) - Number(b[4].replace(/,/g, "")) : Number(b[4].replace(/,/g, "")) - Number(a[4].replace(/,/g, ""))));

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">ייחוס</h1>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => setGranularity((current) => (current === "יומי" ? "שבועי" : current === "שבועי" ? "חודשי" : "יומי"))}>{granularity}</button>
        <select className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2 text-sm font-semibold" defaultValue="lndc" onChange={() => toast("מודל הייחוס עודכן")}>
          <option value="lndc">קליק אחרון ללא ישיר</option>
          <option value="last">קליק אחרון</option>
          <option value="first">קליק ראשון</option>
        </select>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => toast("הדוח נשלח להדפסה")}>הדפסה</button>
      </div>
      {banner ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[#d8f3fb] px-4 py-3 text-[#0b3b4b]">
          <span className="flex-1">הייחוס מבוסס על ביקורים ב-30 הימים האחרונים. שינוי המודל מעדכן את הטבלה מיד.</span>
          <button type="button" aria-label="סגירה" className="border-0 bg-transparent" onClick={() => setBanner(false)}>×</button>
        </div>
      ) : null}
      <div className="rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <button type="button" className="border-0 bg-transparent p-0 text-sm font-semibold" onClick={() => setMetric((index) => (index + 1) % metrics.length)}>{metrics[metric]}</button>
        <svg viewBox="0 0 1000 240" className="mt-3 h-[240px] w-full" aria-hidden>
          {LINES.map((line, index) => <path key={line.label} d={line.path} fill="none" stroke={line.color} strokeWidth={index === 0 ? 2 : 1.6} opacity={hidden.includes(index) ? 0 : 1} />)}
        </svg>
        <div className="mt-2 flex flex-wrap gap-3">
          {LINES.map((line, index) => (
            <button key={line.label} type="button" className="inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px]" style={{ opacity: hidden.includes(index) ? 0.4 : 1 }} onClick={() => setHidden((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}>
              <span className="size-2 rounded-full" style={{ background: line.color }} />{line.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              {["ערוץ", "סוג", "ביקורים", "מכירות", "הזמנות", "המרה", "ממוצע הזמנה", "חדשים", "חוזרים"].map((label, index) => (
                <th key={label} className="h-9 bg-[#f7f7f7] px-3 text-start font-semibold" onClick={index === 2 ? () => setAsc((value) => !value) : undefined}>{label}{index === 2 ? (asc ? " ▲" : " ▼") : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-[#ebebeb]">
                <td className="px-3 py-2"><span className="me-2 inline-grid size-4 place-items-center rounded text-[10px] font-bold text-white" style={{ background: row[2] }}>{row[3]}</span>{row[0]}</td>
                <td className="px-3">{row[1]}</td>
                {row.slice(4).map((cell) => <td key={cell} dir="ltr" className="px-3 text-right">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
