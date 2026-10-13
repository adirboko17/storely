"use client";

import { useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const selectClass =
  "h-8 w-full rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm text-ink outline-none";

export function GeneralSettingsScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  const store = getStoreIdentity();
  const [region, setRegion] = useState("israel");
  const [units, setUnits] = useState("metric");
  const [weight, setWeight] = useState("kg");
  const [timezone, setTimezone] = useState("jerusalem");

  return (
    <div data-screen-label="Settings general" className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-8">
      <h1 className="m-0 text-xl font-bold text-ink-strong">כללי</h1>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold text-ink">פרטי העסק</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">הישות העסקית שמשמשת למוצרים פיננסיים, שווקים, אפליקציות ומיסים בחנות הזו.</p>
        </div>
        <Card className="flex items-center gap-3 px-3 py-3">
          <span className="text-lg leading-none" aria-hidden>
            🇮🇱
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{store.name}</span>
            <span className="block text-[13px] text-ink-secondary">ישראל</span>
          </span>
          <button
            type="button"
            aria-label="פעולות נוספות"
            onClick={() => toast("עריכת פרטי העסק תתווסף בהמשך")}
            className="grid size-8 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
          >
            <span className="text-lg leading-none">···</span>
          </button>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">פרטי קשר של החנות</h2>
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => toast("עריכת פרטי הקשר תתווסף בהמשך")}
            className="flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-[#fafafa]"
          >
            <Icon name="store" className="shrink-0 text-ink-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{store.name}</span>
              <span dir="ltr" className="block text-right text-[13px] text-ink-secondary">
                {store.ownerEmail || "אין אימייל"} · אין מספר טלפון
              </span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-ink-secondary" />
          </button>
          <button
            type="button"
            onClick={() => toast("עריכת הכתובת תתווסף בהמשך")}
            className="flex w-full items-start gap-3 border-t border-[#ebebeb] px-3 py-3 text-start hover:bg-[#fafafa]"
          >
            <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center text-ink-secondary">
              <span className="size-2 rounded-full border-2 border-current" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">כתובת החנות</span>
              <span className="block text-[13px] text-ink-secondary">לא הוגדרה כתובת</span>
            </span>
            <Icon name="chevron" size={16} className="mt-0.5 shrink-0 text-ink-secondary" />
          </button>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">ברירות מחדל של החנות</h2>
        <Card className="flex flex-col">
          <div className="flex items-start gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">תצוגת מטבע</div>
              <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">המטבע שמוצג ללקוחות בחנות.</p>
            </div>
            <div className="flex items-center gap-2 pt-0.5 text-sm text-ink">
              <span dir="ltr">שקל חדש (ILS ₪)</span>
              <button
                type="button"
                aria-label="פעולות מטבע"
                onClick={() => toast("שינוי המטבע יתווסף בהמשך")}
                className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
              >
                <span className="text-base leading-none">···</span>
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-2 border-t border-[#ebebeb] px-4 py-3.5">
            <span>
              <span className="block text-sm font-semibold text-ink">אזור גיבוי</span>
              <span className="mt-0.5 block text-[13px] text-ink-secondary">קובע ברירות מחדל ללקוחות מחוץ לישראל.</span>
            </span>
            <select value={region} onChange={(event) => setRegion(event.target.value)} className={selectClass}>
              <option value="israel">ישראל</option>
            </select>
          </label>

          <div className="grid gap-4 border-t border-[#ebebeb] px-4 py-3.5 min-[720px]:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">שיטת יחידות</span>
              <select value={units} onChange={(event) => setUnits(event.target.value)} className={selectClass}>
                <option value="metric">מטרית</option>
                <option value="imperial">אימפריאלית</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">יחידת משקל</span>
              <select value={weight} onChange={(event) => setWeight(event.target.value)} className={selectClass}>
                <option value="kg">קילוגרם (ק״ג)</option>
                <option value="g">גרם (ג׳)</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 border-t border-[#ebebeb] px-4 py-3.5">
            <span className="text-sm font-semibold text-ink">אזור זמן</span>
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className={selectClass}>
              <option value="jerusalem">(GMT+03:00) ירושלים</option>
            </select>
          </label>
        </Card>
      </section>
    </div>
  );
}
