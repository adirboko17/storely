"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { enterClientStore } from "@/app/platform/actions";
import { darkButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import type { PlatformStore } from "@/components/platform/types";

export function StoresScreen({ stores }: { stores: PlatformStore[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim();
  const rows = useMemo(
    () =>
      stores.filter((store) => {
        if (!needle) return true;
        const owner = store.members.find((member) => member.roleKey === "owner");
        const haystack = `${store.displayName} ${store.hostname ?? ""} ${owner?.name ?? ""} ${owner?.email ?? ""}`;
        return haystack.toLowerCase().includes(needle.toLowerCase());
      }),
    [needle, stores],
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5 pb-2">
        <Icon name="store" size={18} />
        <h1 className="m-0 flex-1 text-[15px] leading-5 font-bold">חנויות</h1>
        <Link href="/platform/new" className={darkButton}>
          אתר חדש
        </Link>
      </div>

      <div className="mx-3 flex min-h-[42px] items-center gap-2 rounded-xl bg-white px-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
        <Icon name="search" size={16} className="text-[#616161]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי חנות, דומיין או בעלים"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mx-3 mt-2 flex flex-col gap-2 min-[800px]:hidden">
        {rows.length === 0 ? (
          <p className="m-0 rounded-xl bg-white px-3 py-4 text-sm text-[#616161] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">אין חנויות שמתאימות לחיפוש.</p>
        ) : (
          rows.map((store) => {
            const owner = store.members.find((member) => member.roleKey === "owner") ?? store.members[0];
            return (
              <article key={store.id} className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-sm font-bold">{store.displayName || store.name}</h2>
                    <p dir="ltr" className="m-0 mt-0.5 text-right text-[13px] text-[#616161]">{store.hostname ?? "—"}</p>
                  </div>
                  <span
                    className="inline-flex h-[22px] shrink-0 items-center rounded-lg px-2 text-[13px] font-medium"
                    style={store.status === "active" ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#303030" }}
                  >
                    {store.status === "active" ? "פעילה" : "כבויה"}
                  </span>
                </div>
                {owner ? (
                  <p className="m-0 mt-2 text-[13px] text-[#616161]">
                    {owner.name}
                    <span dir="ltr" className="me-2">{owner.email}</span>
                  </p>
                ) : null}
                <form action={enterClientStore} className="mt-3">
                  <input type="hidden" name="storeId" value={store.id} />
                  <button type="submit" className={darkButton}>כניסה לניהול</button>
                </form>
              </article>
            );
          })
        )}
      </div>

      <div className="mx-3 mt-2 hidden overflow-x-auto min-[800px]:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="h-[34px] text-[13px] text-[#4a4a4a]">
              {["חנות", "דומיין", "בעלים", "סטטוס", ""].map((label) => (
                <th key={label || "action"} className="bg-[#f3f3f3] px-3 text-start font-semibold first:rounded-s-[10px] last:rounded-e-[10px]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="h-16 bg-white">
                <td colSpan={5} className="px-3 text-[#616161]">
                  אין חנויות שמתאימות לחיפוש.
                </td>
              </tr>
            ) : (
              rows.map((store) => {
                const owner = store.members.find((member) => member.roleKey === "owner") ?? store.members[0];
                return (
                  <tr key={store.id} className="h-[52px] border-b border-[#ebebeb] bg-white">
                    <td className="px-3 font-semibold">{store.displayName || store.name}</td>
                    <td dir="ltr" className="px-3 text-right text-[#616161]">
                      {store.hostname ?? "—"}
                    </td>
                    <td className="px-3">
                      {owner ? (
                        <span className="flex flex-col leading-4">
                          <span>{owner.name}</span>
                          <span dir="ltr" className="text-right text-[12px] text-[#616161]">
                            {owner.email}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3">
                      <span
                        className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium"
                        style={store.status === "active" ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#303030" }}
                      >
                        {store.status === "active" ? "פעילה" : "כבויה"}
                      </span>
                    </td>
                    <td className="px-3 text-end">
                      <form action={enterClientStore}>
                        <input type="hidden" name="storeId" value={store.id} />
                        <button type="submit" className={darkButton}>
                          כניסה לניהול
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
