"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { addShipProfile, getSettings, getSettingsVersion, setShippingFlag, subscribeSettings } from "@/data/mock/settings-session";

export function ShippingScreen() {
  useSyncExternalStore(subscribeSettings, getSettingsVersion, getSettingsVersion);
  const settings = getSettings();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <h1 className="m-0 text-xl font-bold text-ink-strong">משלוחים</h1>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">משלוח</h2>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <div>
              <div className="text-sm font-semibold">פרופילי משלוח</div>
              <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">איפה שולחים ומה התעריף לכל מוצר.</p>
            </div>
            <span className="text-[13px] text-ink-secondary">{settings.profiles.length} פרופילים</span>
          </div>
          {settings.profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/admin/settings/shipping/${profile.id}`}
              className="flex items-center gap-3 border-t border-[#ebebeb] px-4 py-3 text-sm no-underline hover:bg-[#fafafa] hover:no-underline"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{profile.name}</span>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-secondary">
                  <span>כל המוצרים</span>
                  <span>{profile.location ? "מיקום אחד" : "אין מיקום"}</span>
                  <span>{profile.zones.length === 1 ? "אזור אחד" : `${profile.zones.length} אזורים`}</span>
                </span>
              </span>
              <Icon name="chevron" size={16} className="text-ink-secondary" />
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 border-t border-[#ebebeb] px-4 py-3 text-start text-sm font-semibold hover:bg-[#fafafa]"
          >
            <Icon name="plus" size={16} />
            הוספת פרופיל מותאם
          </button>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <ToggleRow
          title="תאריכי אספקה משוערים"
          detail="מתי הלקוחות יכולים לצפות שההזמנה תגיע."
          on={settings.estimates}
          onToggle={() => setShippingFlag("estimates", !settings.estimates)}
        />
        <StatusRow title="תוויות משלוח" detail="רכישת תוויות וניהול חברות שילוח." value="אין חיבור" />
        <StatusRow title="חבילות" detail="מידות חבילה לחישוב תעריף." value="לא הוגדרה" />
        <StatusRow title="חשבונות מובילים" detail="חיבור חשבון מוביל קיים לתעריפים שלו." value="אין" />
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">דרכי מסירה נוספות</h2>
        <Card className="overflow-hidden">
          <ToggleRow title="משלוח מקומי" on={settings.localDelivery} onToggle={() => setShippingFlag("localDelivery", !settings.localDelivery)} />
          <ToggleRow title="איסוף מהחנות" on={settings.pickup} onToggle={() => setShippingFlag("pickup", !settings.pickup)} />
        </Card>
      </section>

      {creating ? (
        <SettingsDialog
          title="פרופיל משלוח חדש"
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
                יצירה
              </button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">
            שם הפרופיל
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-9 rounded-lg border border-[#c9c9c9] px-2.5 text-sm font-normal outline-none focus:border-[#1a1a1a]"
              placeholder="לדוגמה משלוח כבד"
            />
          </label>
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

function StatusRow({ title, detail, value }: { title: string; detail: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-[#ebebeb] px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-secondary">{detail}</span>
      </span>
      <span className="text-[13px] text-ink-secondary">{value}</span>
    </div>
  );
}
