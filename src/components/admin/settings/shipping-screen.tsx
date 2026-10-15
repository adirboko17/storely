"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { addShipProfile, deleteShipProfile, getSettings, getSettingsVersion, setShippingFlag, subscribeSettings, type ShipProfile } from "@/data/mock/settings-session";
import { currencySymbol } from "@/lib/formatting/currency";

function profileSummary(profile: ShipProfile) {
  if (!profile.zones.length) return "עדיין אין יעד ומחיר. לחצו כדי להגדיר.";
  const places = profile.zones.map((zone) => zone.name).join(", ");
  const rate = profile.zones.flatMap((zone) => zone.rates).find((item) => item.price.trim() || item.name.trim());
  const price = !rate ? "בלי מחיר" : rate.price.trim() ? `${currencySymbol()}${rate.price}` : "חינם";
  return `${places} · ${price}`;
}

export function ShippingScreen() {
  useSyncExternalStore(subscribeSettings, getSettingsVersion, getSettingsVersion);
  const settings = getSettings();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="m-0 text-xl font-bold text-ink-strong">משלוחים</h1>
        <p className="m-0 mt-1 text-sm text-ink-secondary">כל משלוח הוא אפשרות שהלקוח רואה בקופה, למשל משלוח עד הבית.</p>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-sm font-semibold">המשלוחים שלכם</h2>
          <button type="button" className={`${darkButton} gap-1.5`} onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            הוספת משלוח
          </button>
        </div>
        <Card className="overflow-hidden">
          {settings.profiles.length ? settings.profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/admin/settings/shipping/${profile.id}`}
              className="flex items-center gap-3 border-t border-[#ebebeb] px-4 py-3 text-sm no-underline first:border-t-0 hover:bg-[#fafafa] hover:no-underline"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{profile.name}</span>
                <span className="mt-0.5 block text-[13px] text-ink-secondary">{profileSummary(profile)}</span>
              </span>
              <button
                type="button"
                className="h-7 rounded-lg border-0 bg-transparent px-2 text-[13px] font-semibold text-[#d72c0d]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteShipProfile(profile.id);
                }}
              >
                הסרה
              </button>
              <Icon name="chevron" size={16} className="text-ink-secondary" />
            </Link>
          )) : (
            <p className="m-0 px-4 py-4 text-sm text-ink-secondary">אין משלוחים. הוסיפו משלוח כדי שהלקוח יוכל לבחור אותו בקופה.</p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold">דרכי מסירה נוספות</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">אפשר להפעיל אותן בנוסף למשלוח הרגיל.</p>
        </div>
        <Card className="overflow-hidden">
          <ToggleRow title="משלוח מקומי" on={settings.localDelivery} onToggle={() => setShippingFlag("localDelivery", !settings.localDelivery)} />
          <ToggleRow title="איסוף מהחנות" on={settings.pickup} onToggle={() => setShippingFlag("pickup", !settings.pickup)} />
        </Card>
      </section>

      {creating ? (
        <SettingsDialog
          title="משלוח חדש"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className={softButton} onClick={() => setCreating(false)}>
                ביטול
              </button>
              <button
                type="button"
                className={darkButton}
                onClick={() => {
                  const id = addShipProfile(name);
                  setCreating(false);
                  setName("");
                  router.push(`/admin/settings/shipping/${id}`);
                }}
              >
                המשך
              </button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            שם שיופיע ברשימה
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-9 rounded-lg border border-[#c9c9c9] px-2.5 text-sm font-normal outline-none focus:border-[#1a1a1a]"
              placeholder="לדוגמה: משלוח עד הבית"
            />
          </label>
          <p className="m-0 mt-2 text-[13px] text-ink-secondary">אחרי השמירה תגדירו לאן המשלוח מגיע וכמה הוא עולה.</p>
        </SettingsDialog>
      ) : null}
    </div>
  );
}

function ToggleRow({ title, detail, on, onToggle }: { title: string; detail?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 border-t border-[#ebebeb] px-4 py-3 text-start first:border-t-0 hover:bg-[#fafafa]">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {detail ? <span className="mt-0.5 block text-[13px] text-ink-secondary">{detail}</span> : null}
      </span>
      <span
        className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium"
        style={on ? { background: "#cdfee1", color: "#0c5132" } : { background: "#ebebeb", color: "#303030" }}
      >
        {on ? "פעיל" : "כבוי"}
      </span>
    </button>
  );
}
