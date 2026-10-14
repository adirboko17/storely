"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { darkButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { listStoreUsers, type StoreUser } from "@/app/admin/settings/users/actions";
import { getStoreIdentity } from "@/data/live/store-identity";
import { ACCESS_AREAS } from "@/platform/access";
import { cn } from "@/lib/cn";

type Tab = "all" | "active" | "disabled";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "active", label: "פעילים" },
  { id: "disabled", label: "מושבתים" },
];

function roleLabel(user: StoreUser) {
  if (user.primary || user.roleKey === "owner") return "מנהל";
  const title = user.roleName.trim();
  if (!title || title === "בעלים") return "צוות";
  return title;
}

function roleDetail(user: StoreUser) {
  const role = roleLabel(user);
  if (user.primary || user.areas.includes("all")) return role;
  const areas = ACCESS_AREAS.filter((area) => user.areas.includes(area.id)).map((area) => area.label);
  return areas.length ? `${role} · ${areas.join(", ")}` : role;
}

export function UsersScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const storeId = getStoreIdentity().storeId;
    if (!storeId) {
      setLoading(false);
      return;
    }
    void listStoreUsers(storeId).then((result) => {
      if ("error" in result) {
        toast(result.error);
        setUsers([]);
      } else {
        setUsers(result.users);
      }
      setLoading(false);
    });
  }, [toast]);

  const needle = query.trim();
  const rows = users.filter((user) => {
    if (tab === "active" && user.status === "disabled") return false;
    if (tab === "disabled" && user.status !== "disabled") return false;
    if (!needle) return true;
    const haystack = `${user.name} ${user.email} ${roleDetail(user)}`;
    return haystack.includes(needle);
  });

  return (
    <div data-screen-label="Settings users" className="min-h-full px-4 pt-5 pb-16 sm:px-6">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-[20px] font-bold text-[#1a1a1a]">משתמשים</h1>
          <Link href="/admin/settings/users/new" className={darkButton}>
            הוספת משתמש
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.13)]">
          <div className="flex items-center gap-1 px-2 pt-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "h-8 rounded-lg border-0 px-3 text-[13px] font-medium",
                  tab === item.id ? "bg-[#e3e3e3] text-[#1a1a1a]" : "bg-transparent text-[#616161] hover:bg-[#f1f1f1]",
                )}
              >
                {item.label}
              </button>
            ))}
            <div className="min-w-2 flex-1" />
            <label className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[#616161]">
              <Icon name="search" size={16} strokeWidth={1.8} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="חיפוש"
                aria-label="חיפוש משתמשים"
                className="w-28 border-0 bg-transparent text-sm text-[#303030] outline-none placeholder:text-[#8a8a8a] sm:w-40"
              />
            </label>
          </div>

          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="text-[13px] text-[#616161]">
                <th className="h-9 bg-[#f7f7f7] px-4 text-start font-medium">משתמש</th>
                <th className="h-9 w-[120px] bg-[#f7f7f7] px-3 text-start font-medium">סטטוס</th>
                <th className="h-9 bg-[#f7f7f7] px-4 text-start font-medium">תפקיד</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[13px] text-[#616161]">
                    טוענים את המשתמשים…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[13px] text-[#616161]">
                    אין משתמשים להצגה
                  </td>
                </tr>
              ) : null}
              {rows.map((user) => (
                <tr
                  key={user.userId}
                  className="cursor-pointer border-t border-[#ebebeb] hover:bg-[#f7f7f7]"
                  onClick={() => router.push(`/admin/settings/users/${user.userId}`)}
                >
                  <td className="px-4 py-3">
                    <span className="block text-sm font-medium text-[#1a1a1a]">{user.name}</span>
                    <span dir="ltr" className="mt-0.5 block text-right text-[13px] text-[#616161]">
                      {user.email || "אין אימייל"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex h-5 items-center rounded-md px-1.5 text-[12px] font-medium"
                      style={
                        user.status === "disabled"
                          ? { background: "#ffd6a4", color: "#5e4200" }
                          : { background: "#cdfee1", color: "#0c5132" }
                      }
                    >
                      {user.status === "disabled" ? "מושבת" : "פעיל"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#303030]">{roleDetail(user)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
