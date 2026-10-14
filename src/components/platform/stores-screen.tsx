"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { darkButton } from "@/components/admin/orders/chrome";
import { Icon } from "@/components/ui/icon";
import type { PlatformStore } from "@/components/platform/types";

function ownerOf(store: PlatformStore) {
  return store.members.find((member) => member.roleKey === "owner") ?? store.members[0];
}

function hostOf(store: PlatformStore) {
  return store.primaryHost || store.previewHost || store.hostname || "—";
}

export function StoresScreen({ stores }: { stores: PlatformStore[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const needle = query.trim();
  const rows = useMemo(
    () =>
      stores.filter((store) => {
        if (!needle) return true;
        const owner = ownerOf(store);
        const haystack = `${store.displayName} ${store.name} ${store.previewHost ?? ""} ${store.primaryHost ?? ""} ${store.hostname ?? ""} ${owner?.name ?? ""} ${owner?.email ?? ""}`;
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
            const owner = ownerOf(store);
            const name = store.displayName || store.name;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => router.push(`/platform/${store.id}`)}
                className="rounded-xl bg-white p-3 text-start shadow-[0_0_0_1px_rgba(0,0,0,.08)]"
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-bold">{name}</span>
                    <span dir="ltr" className="mt-0.5 block text-right text-[13px] text-[#616161]">
                      {hostOf(store)}
                    </span>
                  </span>
                  <Status status={store.status} />
                </span>
                {owner ? <span className="mt-2 block text-[13px] text-[#616161]">{owner.name}</span> : null}
              </button>
            );
          })
        )}
      </div>

      <div className="mx-3 mt-2 hidden overflow-x-auto min-[800px]:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="h-[34px] text-[13px] text-[#4a4a4a]">
              {["חנות", "דומיין", "בעלים", "סטטוס"].map((label) => (
                <th key={label} className="bg-[#f3f3f3] px-3 text-start font-semibold first:rounded-s-[10px] last:rounded-e-[10px]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="h-16 bg-white">
                <td colSpan={4} className="px-3 text-[#616161]">
                  אין חנויות שמתאימות לחיפוש.
                </td>
              </tr>
            ) : (
              rows.map((store) => {
                const owner = ownerOf(store);
                return (
                  <tr
                    key={store.id}
                    className="h-[52px] cursor-pointer border-b border-[#ebebeb] bg-white hover:bg-[#f7f7f7]"
                    onClick={() => router.push(`/platform/${store.id}`)}
                  >
                    <td className="px-3 font-semibold">{store.displayName || store.name}</td>
                    <td dir="ltr" className="px-3 text-right text-[#616161]">
                      {hostOf(store)}
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
                      <Status status={store.status} />
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

function Status({ status }: { status: string }) {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium"
      style={status === "active" ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#303030" }}
    >
      {status === "active" ? "פעילה" : "כבויה"}
    </span>
  );
}
