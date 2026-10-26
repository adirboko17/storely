"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useAdminSlice } from "@/components/admin/slice-pending";
import { getStoreIdentity } from "@/data/live/store-identity";
import { ColumnsButton, IndexDock, SearchField, darkButton, menuItem, menuPanel } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import {
  getOrderSessionVersion,
  listLiveCheckouts,
  markCheckoutsSent,
  subscribeOrderSession,
  type LiveCheckout,
} from "@/data/mock/order-session";
import { abandonedSlug } from "@/data/mock/abandoned";
import { formatMoney } from "@/lib/formatting/money";

type StatusFilter = "open" | "done" | "all";

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "open", label: "לא הושלמו" },
  { id: "done", label: "שוחזרו" },
  { id: "all", label: "כל העגלות" },
];

function emailBadge(checkout: LiveCheckout) {
  return checkout.sent
    ? { label: "נשלח", background: "#cdfee1", color: "#0c5132" }
    : { label: "לא נשלח", background: "#ffd6a4", color: "#5e4200" };
}

function recoveryBadge(checkout: LiveCheckout) {
  return checkout.recovered
    ? { label: "שוחזרה", background: "#cdfee1", color: "#0c5132" }
    : { label: "לא שוחזרה", background: "#ffd6a4", color: "#5e4200" };
}

export function AbandonedListScreen() {
  const router = useRouter();
  const { menu, toggleMenu, closeMenu, toast } = useAdmin();
  useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const checkoutsReady = useAdminSlice("checkouts");
  const checkouts = listLiveCheckouts();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const rows = checkouts.filter((checkout) => {
    if (status === "open" && checkout.recovered) return false;
    if (status === "done" && !checkout.recovered) return false;
    const needle = query.trim();
    if (needle && !checkout.name.includes(needle) && !checkout.id.includes(needle)) return false;
    return true;
  });
  const ids = rows.map((checkout) => checkout.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const statusLabel = STATUS_OPTIONS.find((item) => item.id === status)?.label ?? "לא הושלמו";

  function toggleAll() {
    setSelected(allSelected ? [] : ids);
  }

  return (
    <div data-screen-label="Abandoned checkouts" className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="cart" size={18} className="text-ink" />
        <h1 className="m-0 text-[15px] font-bold">עגלות נטושות</h1>
        <div className="relative z-30 flex-1">
          <button type="button" className="inline-flex h-[30px] items-center gap-1 rounded-[10px] border-0 bg-white px-3 text-sm font-medium text-ink shadow-[0_0_0_1px_rgba(0,0,0,.1),0_1px_1px_rgba(0,0,0,.04)] hover:bg-[#f7f7f7]" onClick={() => toggleMenu("abSt")}>
            {statusLabel}
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8l4 4 4-4" />
            </svg>
          </button>
          {menu === "abSt" ? (
            <div className={`${menuPanel("start")} w-[180px]`}>
              {STATUS_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={menuItem}
                  style={{ background: status === item.id ? "#f1f1f1" : "transparent" }}
                  onClick={() => {
                    setStatus(item.id);
                    setSelected([]);
                    closeMenu();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className={darkButton} onClick={() => toast(`קובץ CSV יישלח אל ${getStoreIdentity().ownerEmail}`)}>
          ייצוא
        </button>
      </div>

      <div className="mx-3 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        {selected.length === 0 ? (
          <>
            <button type="button" className="inline-flex h-[30px] items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-ink hover:bg-[#f1f1f1]">
              הכל
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 8l3-3 3 3M7 12l3 3 3-3" />
              </svg>
            </button>
            <SearchField value={query} onChange={setQuery} />
            <ColumnsButton onClick={() => toast("בחירת עמודות תתווסף בשלב הבא")} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="m-0 size-4 cursor-pointer accent-[#303030]" />
            <span className="me-2 font-semibold">{selected.length} נבחרו</span>
            <button
              type="button"
              className="h-7 rounded-lg border-0 bg-white px-2.5 text-[13px] font-semibold text-ink shadow-[0_0_0_1px_#d4d4d4]"
              onClick={() => {
                const idsToSend = selected;
                markCheckoutsSent(idsToSend);
                setSelected([]);
                toast(`נשלחו ${idsToSend.length} הודעות שחזור`);
              }}
            >
              שליחת דוא״ל שחזור
            </button>
          </div>
        )}
      </div>

      <div className="mx-3 mt-2 overflow-x-auto rounded-[10px]">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-[#4a4a4a]">
              <th className="w-10 bg-[#f3f3f3] px-2.5" style={{ borderRadius: "0 10px 10px 0" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="m-0 size-4 cursor-pointer accent-[#303030] align-middle" />
              </th>
              {["עגלה", "נוצרה", "שם הלקוח", "סטטוס דוא״ל", "אזור", "סטטוס שחזור"].map((label) => (
                <th key={label} className="h-8 bg-[#f3f3f3] px-2.5 text-start font-semibold whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="h-8 bg-[#f3f3f3] pe-4 ps-2.5 text-end font-semibold whitespace-nowrap" style={{ borderRadius: "10px 0 0 10px" }}>
                סכום
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((checkout) => {
              const email = emailBadge(checkout);
              const recovery = recoveryBadge(checkout);
              const chosen = selected.includes(checkout.id);
              return (
                <tr
                  key={checkout.id}
                  onClick={() => router.push(`/admin/orders/abandoned/${abandonedSlug(checkout.id)}`)}
                  className="h-[33px] cursor-pointer border-b border-[#ebebeb] hover:bg-[#f7f7f7]"
                  style={{ background: chosen ? "#f1f1f1" : "#fff" }}
                >
                  <td className="px-2.5" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={chosen}
                      onChange={() => setSelected((current) => (current.includes(checkout.id) ? current.filter((id) => id !== checkout.id) : [...current, checkout.id]))}
                      className="m-0 size-4 cursor-pointer accent-[#303030] align-middle"
                    />
                  </td>
                  <td dir="ltr" className="px-2.5 text-right font-semibold whitespace-nowrap">
                    {checkout.id}
                  </td>
                  <td className="px-2.5 whitespace-nowrap">{checkout.date}</td>
                  <td dir="auto" className="px-2.5 text-right whitespace-nowrap">
                    {checkout.name}
                  </td>
                  <td className="px-2.5">
                    <span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: email.background, color: email.color }}>
                      {email.label}
                    </span>
                  </td>
                  <td className="px-2.5">ישראל</td>
                  <td className="px-2.5">
                    <span className="inline-flex h-5 items-center rounded-md px-[7px] text-[13px] font-medium whitespace-nowrap" style={{ background: recovery.background, color: recovery.color }}>
                      {recovery.label}
                    </span>
                  </td>
                  <td dir="ltr" className="py-0 pe-4 ps-2.5 text-left whitespace-nowrap">
                    {formatMoney(checkout.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="mx-3 rounded-b-xl bg-white px-4 py-12 text-center text-ink-secondary">{checkoutsReady ? "אין עגלות נטושות בתצוגה הזו." : "טוען עגלות…"}</div> : null}
      <div className="min-h-4 flex-1" />
      <IndexDock pageLabel={rows.length ? `1-${rows.length}` : "0"} />
    </div>
  );
}
