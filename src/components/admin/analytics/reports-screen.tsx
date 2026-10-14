"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { REPORTS, formatSeen, readReportSeen, type ReportAuthor } from "@/lib/analytics/reports";

const clearInput = { backgroundColor: "transparent", color: "#303030" } as const;

function AuthorCell({ author, mine }: { author: ReportAuthor; mine: string }) {
  if (author === "me") return <span>{mine || "שלי"}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/brand/storely-logo.png" alt="" className="size-5 object-contain" />
      Storely
    </span>
  );
}

export function ReportsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<ReportAuthor | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [asc, setAsc] = useState(false);
  const [menu, setMenu] = useState<"by" | "cat" | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const mine = getStoreIdentity().ownerName.trim();
  const categories = [...new Set(REPORTS.map((report) => report.category))];

  useEffect(() => {
    setSeen(readReportSeen());
  }, []);

  const rows = useMemo(() => {
    return REPORTS.filter((report) => {
      if (query.trim() && !report.name.includes(query.trim())) return false;
      if (category && report.category !== category) return false;
      if (author && report.author !== author) return false;
      return true;
    }).sort((a, b) => {
      const left = seen[a.id] ? new Date(seen[a.id] ?? 0).getTime() : 0;
      const right = seen[b.id] ? new Date(seen[b.id] ?? 0).getTime() : 0;
      return asc ? left - right : right - left;
    });
  }, [query, author, category, asc, seen]);

  return (
    <div className="flex min-h-full flex-col gap-2.5 px-3.5 pt-2.5">
      <div className="flex items-center gap-2">
        <Icon name="content" size={18} strokeWidth={1.6} />
        <h1 className="m-0 flex-1 text-[15px] font-bold">דוחות</h1>
      </div>
      <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <div className="flex h-[46px] items-center gap-2.5 border-b border-[#ebebeb] px-4 text-ink-secondary">
          <Icon name="search" size={16} strokeWidth={1.8} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש דוחות" className="h-8 min-w-0 flex-1 border-0 text-sm outline-none" style={clearInput} />
          <button type="button" aria-label="מיון" className="grid size-7 place-items-center rounded-lg border-0 bg-[#f1f1f1]" onClick={() => setAsc((value) => !value)}>↕</button>
        </div>
        <div className="flex gap-1.5 p-2">
          <div className="relative">
            <button type="button" className="inline-flex h-[26px] items-center rounded-lg bg-white px-2.5 text-[13px] shadow-[0_0_0_1px_rgba(0,0,0,.12)]" onClick={() => setMenu(menu === "by" ? null : "by")}>{author === "me" ? "נוצר על ידי: אני" : author === "storely" ? "נוצר על ידי: Storely" : "נוצר על ידי"}</button>
            {menu === "by" ? (
              <div className="absolute top-8 right-0 z-50 w-[180px] rounded-xl bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                {([[null, "הכל"], ["storely", "Storely"], ["me", "שלי"]] as const).map(([key, label]) => <button key={label} type="button" className="flex w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-start text-sm hover:bg-[#f1f1f1]" onClick={() => { setAuthor(key); setMenu(null); }}>{label}</button>)}
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
              <tr key={report.id} className="h-[34px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]" onClick={() => router.push(`/admin/analytics/reports/${report.id}`)}>
                <td className="px-3">{report.name}</td>
                <td className="px-3"><span className="inline-flex h-5 items-center rounded-md bg-[#ebebeb] px-[7px] text-[13px] font-medium">{report.category}</span></td>
                <td className="px-3">{formatSeen(seen[report.id] ?? "")}</td>
                <td className="px-3"><AuthorCell author={report.author} mine={mine} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="px-4 py-10 text-center text-ink-secondary">לא נמצאו דוחות.</div> : null}
      </div>
    </div>
  );
}
