"use client";

import { useMemo, useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";

const REPORTS: Array<[string, string, string, "me" | "sys"]> = [
  ["לקוחות חדשים מול חוזרים", "לקוחות", "13 באוקטובר 2026", "sys"],
  ["ביקורים לפי מיקום", "רכישת לקוחות", "13 באוקטובר 2026", "sys"],
  ["ביקורים לפי רשת חברתית מפנה", "רכישת לקוחות", "13 באוקטובר 2026", "sys"],
  ["ביקורים לאורך זמן", "רכישת לקוחות", "9 באוקטובר 2026", "sys"],
  ["סך המכירות לאורך זמן", "מכירות", "13 ביולי 2026", "sys"],
  ["הזמנות לאורך זמן", "הזמנות", "21 ביוני 2026", "sys"],
  ["הזמנות שנשלחו לאורך זמן", "הזמנות", "3 במאי 2026", "sys"],
  ["פריטים שהוזמנו לאורך זמן", "הזמנות", "20 באפריל 2026", "sys"],
  ["סך המכירות לפי מוצר", "מכירות", "18 באפריל 2026", "sys"],
  ["זמן מהזמנה עד משלוח", "הזמנות", "21 באפריל 2025", "sys"],
  ["שיעור לקוחות חוזרים לאורך זמן", "לקוחות", "29 במרץ 2025", "sys"],
  ["מכירות לפי קוד הנחה", "מכירות", "11 בפברואר 2025", "me"],
  ["ביקורים לפי אתר מפנה", "רכישת לקוחות", "", "sys"],
  ["מבקרים לאורך זמן", "רכישת לקוחות", "", "sys"],
  ["מבקרים כעת", "רכישת לקוחות", "", "sys"],
  ["שיעור נטישה לאורך זמן", "התנהגות", "", "sys"],
  ["שיעור המרה בקופה לאורך זמן", "התנהגות", "", "sys"],
  ["פירוט שיעור ההמרה", "התנהגות", "", "sys"],
  ["שיעור המרה לאורך זמן", "התנהגות", "", "sys"],
  ["התנהגות לקוחות", "התנהגות", "", "sys"],
  ["המרות מהמלצות מוצרים לאורך זמן", "התנהגות", "", "sys"],
  ["ערך מלאי לפי מוצר", "מלאי", "", "sys"],
  ["מוצרים שאזלו מהמלאי", "מלאי", "", "sys"],
  ["מע״מ שנגבה לפי חודש", "כספים", "", "sys"],
  ["תשלומים לפי אמצעי תשלום", "כספים", "", "sys"],
  ["רווח גולמי לפי מוצר", "כספים", "", "me"],
];

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

export function ReportsScreen() {
  const { toast } = useAdmin();
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [asc, setAsc] = useState(false);
  const [menu, setMenu] = useState<"by" | "cat" | null>(null);
  const categories = [...new Set(REPORTS.map((report) => report[1]))];
  const rows = useMemo(() => {
    return REPORTS.filter((report) => {
      if (query.trim() && !report[0].includes(query.trim())) return false;
      if (category && report[1] !== category) return false;
      if (author === "me" && report[3] !== "me") return false;
      if (author === "sys" && report[3] === "me") return false;
      return true;
    }).sort((a, b) => {
      if (!a[2] && !b[2]) return 0;
      if (!a[2]) return 1;
      if (!b[2]) return -1;
      return asc ? a[2].localeCompare(b[2], "he") : b[2].localeCompare(a[2], "he");
    });
  }, [query, author, category, asc]);

  return (
    <div className="flex min-h-full flex-col gap-2.5 px-3.5 pt-2.5">
      <div className="flex items-center gap-2">
        <Icon name="content" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">דוחות</h1>
        <button type="button" className={darkButton} onClick={() => toast("ניתוח חדש יישמר ברשימה הזו בשלב הבא")}>ניתוח חדש</button>
      </div>
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="flex h-[46px] items-center gap-2.5 border-b border-[#ebebeb] px-4 text-ink-secondary">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש דוחות" className="h-8 min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
          <button type="button" aria-label="מיון" className="grid size-7 place-items-center rounded-lg border-0 bg-[#f1f1f1]" onClick={() => setAsc((value) => !value)}>↕</button>
        </div>
        <div className="flex gap-1.5 p-2">
          <div className="relative">
            <button type="button" className="inline-flex h-[26px] items-center rounded-lg bg-white px-2.5 text-[13px] shadow-[0_0_0_1px_rgba(0,0,0,.12)]" onClick={() => setMenu(menu === "by" ? null : "by")}>{author === "me" ? "נוצר על ידי: אני" : author === "sys" ? "נוצר על ידי: מדף" : "נוצר על ידי"}</button>
            {menu === "by" ? (
              <div className="absolute top-8 right-0 z-50 w-[180px] rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                {[[null, "הכל"], ["sys", "מדף"], ["me", "מאיה ברק"]].map(([key, label]) => <button key={label} type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { setAuthor(key); setMenu(null); }}>{label}</button>)}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" className="inline-flex h-[26px] items-center rounded-lg bg-white px-2.5 text-[13px] shadow-[0_0_0_1px_rgba(0,0,0,.12)]" onClick={() => setMenu(menu === "cat" ? null : "cat")}>{category ? `קטגוריה: ${category}` : "קטגוריה"}</button>
            {menu === "cat" ? (
              <div className="absolute top-8 right-0 z-50 w-[180px] rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                <button type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { setCategory(null); setMenu(null); }}>כל הקטגוריות</button>
                {categories.map((item) => <button key={item} type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { setCategory(item); setMenu(null); }}>{item}</button>)}
              </div>
            ) : null}
          </div>
        </div>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="h-[38px] w-[55%] border-b border-[#ebebeb] bg-[#f7f7f7] px-3 text-start font-semibold">שם</th>
              <th className="border-b border-[#ebebeb] bg-[#f7f7f7] px-3 text-start font-semibold">קטגוריה</th>
              <th className="cursor-pointer border-b border-[#ebebeb] bg-[#f7f7f7] px-3 text-start font-semibold" onClick={() => setAsc((value) => !value)}>נצפה לאחרונה {asc ? "▲" : "▼"}</th>
              <th className="border-b border-[#ebebeb] bg-[#f7f7f7] px-3 text-start font-semibold">נוצר על ידי</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((report) => (
              <tr key={report[0]} className="h-[34px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" onClick={() => toast("גוף הדוח יעוצב בשלב 4")}>
                <td className="px-3">{report[0]}</td>
                <td className="px-3"><span className="inline-flex h-5 items-center rounded-md bg-[#ebebeb] px-[7px] text-[13px] font-medium">{report[1]}</span></td>
                <td className="px-3">{report[2]}</td>
                <td className="px-3">{report[3] === "me" ? "מאיה ברק" : "מדף"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="px-4 py-10 text-center text-ink-secondary">לא נמצאו דוחות.</div> : null}
      </div>
    </div>
  );
}
