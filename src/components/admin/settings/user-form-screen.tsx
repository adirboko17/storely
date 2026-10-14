"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { Icon } from "@/components/ui/icon";
import { addStoreUser, listStoreUsers, updateStoreUser, type StoreUser } from "@/app/admin/settings/users/actions";
import { getStoreIdentity } from "@/data/live/store-identity";
import { ACCESS_AREAS, type AccessAreaId } from "@/platform/access";
import { cn } from "@/lib/cn";

const field =
  "h-9 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-sm text-ink outline-none focus:border-[#303030] focus:shadow-[0_0_0_1px_#303030]";

const AREA_IDS = new Set<string>(ACCESS_AREAS.map((area) => area.id));

type Draft = {
  userId: string;
  name: string;
  email: string;
  password: string;
  roleTitle: string;
  everything: boolean;
  areas: AccessAreaId[];
  active: boolean;
  primary: boolean;
};

const emptyDraft: Draft = {
  userId: "",
  name: "",
  email: "",
  password: "",
  roleTitle: "",
  everything: true,
  areas: [],
  active: true,
  primary: false,
};

function draftFromUser(user: StoreUser): Draft {
  const everything = user.primary || user.areas.includes("all");
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    password: "",
    roleTitle: user.primary || user.roleName === "צוות" || (user.roleName === "מנהל" && everything) ? "" : user.roleName,
    everything,
    areas: everything ? [] : user.areas.filter((area): area is AccessAreaId => AREA_IDS.has(area)),
    active: user.status !== "disabled",
    primary: user.primary,
  };
}

export function UserFormScreen({ userId }: { userId?: string }) {
  const router = useRouter();
  const { toast } = useAdmin();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(!userId);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    const storeId = getStoreIdentity().storeId;
    if (!storeId) {
      setMissing(true);
      setReady(true);
      return;
    }
    void listStoreUsers(storeId).then((result) => {
      const user = "users" in result ? result.users.find((item) => item.userId === userId) : undefined;
      if (!user) setMissing(true);
      else setDraft(draftFromUser(user));
      setReady(true);
    });
  }, [userId]);

  function toggleArea(id: AccessAreaId) {
    setDraft((current) => {
      if (current.everything || current.primary) return current;
      const areas = current.areas.includes(id) ? current.areas.filter((area) => area !== id) : [...current.areas, id];
      return { ...current, areas };
    });
  }

  async function save() {
    if (!draft || saving || draft.primary) return;
    const storeId = getStoreIdentity().storeId;
    const name = draft.name.trim();
    const email = draft.email.trim();
    const areas = draft.everything ? ["all"] : draft.areas;
    if (name.length < 2) {
      setError("הזינו שם");
      return;
    }
    if (!draft.userId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("הזינו כתובת אימייל תקינה");
      return;
    }
    if ((!draft.userId || draft.password) && draft.password.length < 8) {
      setError("הסיסמה צריכה 8 תווים לפחות");
      return;
    }
    if (areas.length === 0) {
      setError("בחרו מה המשתמש יכול לראות");
      return;
    }
    setSaving(true);
    setError("");
    const result = draft.userId
      ? await updateStoreUser({
          storeId,
          userId: draft.userId,
          name,
          roleTitle: draft.roleTitle.trim(),
          areas,
          status: draft.active ? "active" : "disabled",
          password: draft.password,
        })
      : await addStoreUser({
          storeId,
          name,
          email,
          password: draft.password,
          roleTitle: draft.roleTitle.trim(),
          areas,
        });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast(draft.userId ? "המשתמש עודכן" : "המשתמש נוסף");
    router.push("/admin/settings/users");
    router.refresh();
  }

  const title = userId ? "עריכת משתמש" : "הוספת משתמש";

  return (
    <div className="min-h-full px-4 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
        <Link href="/admin/settings/users" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-[#303030] no-underline hover:underline">
          <Icon name="user" size={16} />
          משתמשים
        </Link>

        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-[20px] font-bold text-[#1a1a1a]">{ready && missing ? "המשתמש לא נמצא" : title}</h1>
          {draft.primary || missing ? null : (
            <div className="flex gap-2">
              <Link href="/admin/settings/users" className={softButton}>ביטול</Link>
              <button type="button" className={darkButton} disabled={saving || !ready} onClick={() => void save()}>
                {saving ? "שומרים…" : "שמירה"}
              </button>
            </div>
          )}
        </div>

        {!ready ? <p className="m-0 text-sm text-[#616161]">טוענים…</p> : null}
        {ready && missing ? (
          <p className="m-0 text-sm text-[#616161]">המשתמש לא נמצא בעסק הזה.</p>
        ) : null}

        {ready && !missing ? (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="m-0 text-[13px] font-semibold text-[#303030]">פרטי המשתמש</h2>
              <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.13)]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TypeCard
                    title="מנהל"
                    detail="רואה את כל הממשק"
                    selected={draft.everything}
                    disabled={draft.primary}
                    onClick={() => setDraft({ ...draft, everything: true, areas: [] })}
                  />
                  <TypeCard
                    title="גישה חלקית"
                    detail="בוחרים מה הוא רואה"
                    selected={!draft.everything}
                    disabled={draft.primary}
                    onClick={() => setDraft({ ...draft, everything: false })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-[13px] font-medium">שם</span>
                    <input value={draft.name} disabled={draft.primary} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={field} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[13px] font-medium">תפקיד</span>
                    <input
                      value={draft.roleTitle}
                      disabled={draft.primary}
                      onChange={(event) => setDraft({ ...draft, roleTitle: event.target.value })}
                      placeholder="לא חובה"
                      className={field}
                    />
                  </label>
                </div>
                <label>
                  <span className="mb-1 block text-[13px] font-medium">אימייל</span>
                  <input
                    dir="ltr"
                    type="email"
                    value={draft.email}
                    disabled={Boolean(draft.userId)}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                    placeholder="name@email.com"
                    className={`${field} text-left disabled:bg-[#f6f6f6]`}
                  />
                </label>
                {draft.primary ? null : (
                  <label>
                    <span className="mb-1 block text-[13px] font-medium">סיסמה</span>
                    <input
                      dir="ltr"
                      type="password"
                      value={draft.password}
                      onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                      placeholder={draft.userId ? "השאירו ריק כדי לא לשנות" : "8 תווים לפחות"}
                      autoComplete="new-password"
                      className={`${field} text-left`}
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="m-0 text-[13px] font-semibold text-[#303030]">תפקידים</h2>
              <div className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.13)]">
                <p className="m-0 text-[13px] text-[#616161]">
                  {draft.everything ? "מנהל רואה את כל עמודי ממשק הניהול." : "בחרו מה המשתמש יכול לראות בממשק."}
                </p>
                {draft.everything ? null : (
                  <div className="mt-3 overflow-hidden rounded-lg shadow-[0_0_0_1px_#e3e3e3]">
                    {ACCESS_AREAS.map((area) => {
                      const on = draft.areas.includes(area.id);
                      return (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() => toggleArea(area.id)}
                          className="flex h-11 w-full items-center justify-between border-0 border-b border-[#ebebeb] bg-white px-3 text-start text-sm last:border-b-0 hover:bg-[#fafafa]"
                        >
                          <span>{area.label}</span>
                          <span
                            className={cn(
                              "grid size-4 place-items-center rounded-[4px] border",
                              on ? "border-[#1a1a1a] bg-[#1a1a1a] text-white" : "border-[#8a8a8a] bg-white",
                            )}
                          >
                            {on ? <Icon name="check" size={12} strokeWidth={2.4} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {draft.userId && !draft.primary ? (
              <section className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.13)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="m-0 text-sm font-semibold">המשתמש פעיל</h2>
                    <p className="m-0 mt-1 text-[13px] leading-5 text-[#616161]">משתמש כבוי לא יכול להיכנס לממשק הניהול של העסק.</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={draft.active}
                    onClick={() => setDraft({ ...draft, active: !draft.active })}
                    className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full border-0", draft.active ? "bg-[#1a1a1a]" : "bg-[#b5b5b5]")}
                  >
                    <span className={cn("absolute top-0.5 size-4 rounded-full bg-white", draft.active ? "left-0.5" : "right-0.5")} />
                  </button>
                </div>
              </section>
            ) : null}

            {error ? <p className="m-0 text-sm text-[#8e1f0b]">{error}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function TypeCard({
  title,
  detail,
  selected,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-start",
        selected ? "border-[#2c6ecb] bg-[#f6f6f6] shadow-[0_0_0_1px_#2c6ecb]" : "border-[#e3e3e3] bg-white hover:bg-[#fafafa]",
        disabled ? "cursor-default" : "",
      )}
    >
      <span className="block text-sm font-semibold text-[#1a1a1a]">{title}</span>
      <span className="mt-0.5 block text-[13px] text-[#616161]">{detail}</span>
    </button>
  );
}
