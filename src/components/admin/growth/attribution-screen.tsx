"use client";

import { useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import type { AttributionChannel } from "@/app/admin/traffic";
import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

const COLORS = ["#2a5bd7", "#1fa7e8", "#6b3fe0", "#0c5132", "#8e1f0b"];

function linePath(values: number[], max: number) {
  if (values.length < 2) return "";
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 1000;
      const y = 220 - (max ? (value / max) * 190 : 0);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function bucket(days: number[], size: number) {
  const groups: number[] = [];
  for (let index = 0; index < days.length; index += size) {
    groups.push(days.slice(index, index + size).reduce((sum, value) => sum + value, 0));
  }
  return groups.length ? groups : [0];
}

export function AttributionScreen({ channels }: { channels: AttributionChannel[] }) {
  const { toast } = useAdmin();
  const [granularity, setGranularity] = useState<"יומי" | "שבועי" | "חודשי">("יומי");
  const [hidden, setHidden] = useState<number[]>([]);
  const [banner, setBanner] = useState(true);
  const [asc, setAsc] = useState(false);
  const rows = useMemo(
    () => [...channels].sort((a, b) => (asc ? a.visits - b.visits : b.visits - a.visits)),
    [asc, channels],
  );
  const top = rows.slice(0, 5);
  const series = top.map((row) => (granularity === "יומי" ? row.days : granularity === "שבועי" ? bucket(row.days, 7) : bucket(row.days, 30)));
  const max = Math.max(...series.flat(), 1);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-5 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">ייחוס</h1>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-3 text-sm font-semibold" onClick={() => setGranularity((current) => (current === "יומי" ? "שבועי" : current === "שבועי" ? "חודשי" : "יומי"))}>{granularity}</button>
        <select className="h-[30px] rounded-[10px] border-0 bg-[#ebebeb] px-2 text-sm font-semibold" defaultValue="lndc" onChange={() => toast("הערוץ נשמר לפי הקליק האחרון שאינו כניסה ישירה")}>
          <option value="lndc">קליק אחרון ללא ישיר</option>
        </select>
        <button type="button" className="h-[30px] rounded-[10px] border-0 bg-white px-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(0,0,0,.1)]" onClick={() => window.print()}>הדפסה</button>
      </div>
      {banner ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[#d8f3fb] px-4 py-3 text-[#0b3b4b]">
          <span className="flex-1">הייחוס מבוסס על ביקורים ב-30 הימים האחרונים. כניסה ישירה לא מוחקת קמפיין או הפניה שכבר נרשמו.</span>
          <button type="button" aria-label="סגירה" className="border-0 bg-transparent" onClick={() => setBanner(false)}>×</button>
        </div>
      ) : null}
      <div className="rounded-[14px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <span className="text-sm font-semibold">ביקורים לפי הערוצים המובילים</span>
        {top.length === 0 ? <p className="m-0 mt-6 text-sm text-ink-secondary">אין ביקורים ב-30 הימים האחרונים.</p> : null}
        <svg viewBox="0 0 1000 240" className="mt-3 h-[240px] w-full" aria-hidden>
          {series.map((values, index) => (
            <path key={top[index]?.channel} d={linePath(values, max)} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth={index === 0 ? 2 : 1.6} opacity={hidden.includes(index) ? 0 : 1} />
          ))}
        </svg>
        <div className="mt-2 flex flex-wrap gap-3">
          {top.map((row, index) => (
            <button key={row.channel} type="button" className="inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px]" style={{ opacity: hidden.includes(index) ? 0.4 : 1 }} onClick={() => setHidden((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}>
              <span className="size-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
              {row.channel}
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-ink-secondary">עדיין אין ביקורים להציג.</td>
              </tr>
            ) : rows.map((row, index) => {
              const conversion = row.visits ? (row.orders / row.visits) * 100 : 0;
              const average = row.orders ? row.sales / row.orders : 0;
              return (
                <tr key={`${row.channel}-${row.type}`} className="border-t border-[#ebebeb]">
                  <td className="px-3 py-2">
                    <span className="me-2 inline-grid size-4 place-items-center rounded text-[10px] font-bold text-white" style={{ background: COLORS[index % COLORS.length] }}>{row.channel.slice(0, 1)}</span>
                    {row.channel}
                  </td>
                  <td className="px-3">{row.type}</td>
                  <td dir="ltr" className="px-3 text-right">{formatInteger(row.visits)}</td>
                  <td dir="ltr" className="px-3 text-right">{formatMoney0(row.sales)}</td>
                  <td dir="ltr" className="px-3 text-right">{formatInteger(row.orders)}</td>
                  <td dir="ltr" className="px-3 text-right">{conversion.toFixed(1)}%</td>
                  <td dir="ltr" className="px-3 text-right">{formatMoney0(average)}</td>
                  <td dir="ltr" className="px-3 text-right">{formatInteger(row.fresh)}</td>
                  <td dir="ltr" className="px-3 text-right">{formatInteger(row.returning)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
