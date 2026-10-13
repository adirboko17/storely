"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";

const LINES: Array<{ label: string; color: string; path: string }> = [];

const ROWS: string[][] = [];

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
