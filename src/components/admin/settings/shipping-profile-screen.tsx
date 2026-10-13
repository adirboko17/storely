"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  addShipRate,
  addShipZone,
  deleteShipRate,
  getSettings,
  getSettingsVersion,
  saveShipLocation,
  setZonePrice,
  subscribeSettings,
  type ShipZone,
} from "@/data/mock/settings-session";

const field = "h-9 w-full rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm font-normal outline-none focus:border-[#1a1a1a]";

export function ShippingProfileScreen({ profileId }: { profileId: string }) {
  useSyncExternalStore(subscribeSettings, getSettingsVersion, getSettingsVersion);
  const profile = getSettings().profiles.find((item) => item.id === profileId);
  const [locationOpen, setLocationOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [rateZone, setRateZone] = useState<string | null>(null);

  if (!profile) {
    return (
      <div className="mx-auto max-w-[820px] px-6 py-8">
        <p className="text-sm text-ink-secondary">הפרופיל לא נמצא.</p>
        <Link href="/admin/settings/shipping" className="mt-3 inline-block text-sm font-semibold">
          חזרה למשלוחים
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/settings/shipping"
          aria-label="חזרה למשלוחים"
          className="grid size-8 place-items-center rounded-full bg-white text-ink no-underline shadow-[var(--shadow-card)] hover:no-underline"
        >
          <Icon name="chevron" className="rotate-180" size={16} />
        </Link>
        <span className="text-sm text-ink-secondary">משלוחים</span>
      </div>
      <h1 className="m-0 text-xl font-bold text-ink-strong">{profile.name}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">מוצרים</h2>
        <Card className="px-4 py-3">
          <div className="text-sm font-semibold">כל המוצרים שלא נמצאים בפרופיל אחר</div>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">מוצרים חדשים מתווספים לכאן כברירת מחדל.</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">מיקום אספקה</h2>
        <Card>
          <button type="button" onClick={() => setLocationOpen(true)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-[#fafafa]">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{profile.location?.name || "לא הוגדר מיקום"}</span>
              <span className="mt-0.5 block text-[13px] text-ink-secondary">{profile.location?.address || "הוסיפו כתובת שממנה יוצאות ההזמנות."}</span>
            </span>
            <Icon name="chevron" size={16} className="text-ink-secondary" />
          </button>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-sm font-semibold">אזורי משלוח</h2>
          <button type="button" className={softButton} onClick={() => setZoneOpen(true)}>
            <Icon name="plus" size={14} />
            אזור
          </button>
        </div>
        {profile.zones.length === 0 ? (
          <Card className="px-4 py-4 text-sm text-ink-secondary">אין אזורי משלוח. הוסיפו אזור כדי להגדיר תעריף.</Card>
        ) : (
          profile.zones.map((zone) => (
            <Card key={zone.id} className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-base" aria-hidden>
                  🇮🇱
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{zone.name}</span>
                  <span className="block text-[13px] text-ink-secondary">{zone.country}</span>
                </span>
                <ZonePrice profileId={profile.id} zone={zone} />
              </div>
              {zone.rates.slice(1).map((rate) => (
                <div key={rate.id} className="flex items-center gap-3 border-t border-[#ebebeb] px-4 py-3">
                  <Icon name="truck" size={16} className="text-ink-secondary" />
                  <span className="min-w-0 flex-1 text-sm">{rate.name}</span>
                  <span className="text-sm text-ink-secondary">{rate.price.trim() ? `₪${rate.price}` : "חינם"}</span>
                  <button
                    type="button"
                    aria-label="הסרת אפשרות"
                    onClick={() => deleteShipRate(profile.id, zone.id, rate.id)}
                    className="grid size-7 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRateZone(zone.id)}
                className="flex w-full items-center gap-2 border-t border-[#ebebeb] px-4 py-3 text-start text-sm font-semibold hover:bg-[#fafafa]"
              >
                <Icon name="plus" size={16} />
                הוספת אפשרות משלוח
              </button>
            </Card>
          ))
        )}
      </section>

      {locationOpen ? (
        <LocationDialog
          initialName={profile.location?.name ?? ""}
          initialAddress={profile.location?.address ?? ""}
          onClose={() => setLocationOpen(false)}
          onSave={(name, address) => {
            saveShipLocation(profile.id, { name, address });
            setLocationOpen(false);
          }}
        />
      ) : null}
      {zoneOpen ? (
        <ZoneDialog
          taken={profile.zones.some((zone) => zone.country === "ישראל")}
          onClose={() => setZoneOpen(false)}
          onSave={(name, price) => {
            addShipZone(profile.id, { id: `zone-${Date.now()}`, name: name.trim() || "ישראל", country: "ישראל", price });
            setZoneOpen(false);
          }}
        />
      ) : null}
      {rateZone ? (
        <RateDialog
          onClose={() => setRateZone(null)}
          onSave={(name, price) => {
            addShipRate(profile.id, rateZone, { id: `rate-${Date.now()}`, name, price });
            setRateZone(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LocationDialog({
  initialName,
  initialAddress,
  onClose,
  onSave,
}: {
  initialName: string;
  initialAddress: string;
  onClose: () => void;
  onSave: (name: string, address: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  return (
    <SettingsDialog
      title="מיקום אספקה"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={softButton} onClick={onClose}>
            ביטול
          </button>
          <button type="button" className={darkButton} onClick={() => onSave(name.trim() || "מיקום", address.trim())}>
            שמירה
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם המיקום
          <input value={name} onChange={(event) => setName(event.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          כתובת
          <input value={address} onChange={(event) => setAddress(event.target.value)} className={field} />
        </label>
      </div>
    </SettingsDialog>
  );
}

function ZonePrice({ profileId, zone }: { profileId: string; zone: ShipZone }) {
  const saved = zone.rates[0]?.price ?? "";
  const [price, setPrice] = useState(saved);

  useEffect(() => {
    setPrice(saved);
  }, [saved]);

  return (
    <label className="flex h-8 items-center gap-1 rounded-lg border border-[#c9c9c9] bg-white px-2">
      <span className="text-sm text-ink-secondary">₪</span>
      <input
        value={price}
        inputMode="decimal"
        aria-label={`מחיר משלוח ${zone.name}`}
        placeholder="מחיר"
        dir="ltr"
        onChange={(event) => setPrice(event.target.value)}
        onBlur={() => {
          if (price.trim() !== saved) setZonePrice(profileId, zone.id, price);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-20 border-0 bg-transparent text-left text-sm outline-none"
      />
    </label>
  );
}

function ZoneDialog({
  taken,
  onClose,
  onSave,
}: {
  taken: boolean;
  onClose: () => void;
  onSave: (name: string, price: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(false);
  const visible = "ישראל".includes(query.trim());

  return (
    <SettingsDialog
      title="אזור משלוח חדש"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={softButton} onClick={onClose}>
            ביטול
          </button>
          <button type="button" className={`${darkButton} disabled:opacity-40`} disabled={!selected || taken} onClick={() => onSave(name, price)}>
            סיום
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        שם האזור
        <input value={name} onChange={(event) => setName(event.target.value)} className={field} />
        <span className="text-[13px] font-normal text-ink-secondary">הלקוחות לא רואים את השם.</span>
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
        מחיר משלוח
        <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" dir="ltr" className={`${field} text-left`} placeholder="₪" />
        <span className="text-[13px] font-normal text-ink-secondary">השאירו ריק למשלוח חינם.</span>
      </label>
      <div className="mt-4 overflow-hidden rounded-xl border border-[#e3e3e3]">
        <div className="text-sm font-semibold px-3 pt-3">אזורי משלוח</div>
        <label className="mx-3 mt-2 mb-2 flex h-9 items-center gap-2 rounded-lg border border-[#c9c9c9] px-2.5">
          <Icon name="search" size={15} className="text-ink-secondary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש מדינה או אזור"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </label>
        {visible ? (
          <label className="flex items-center gap-3 border-t border-[#ebebeb] px-3 py-2.5 text-sm">
            <input type="checkbox" checked={selected} disabled={taken} onChange={(event) => setSelected(event.target.checked)} />
            <span aria-hidden>🇮🇱</span>
            <span className="flex-1">ישראל</span>
            {taken ? <span className="text-[13px] text-ink-secondary">באזור אחר</span> : null}
          </label>
        ) : (
          <p className="m-0 border-t border-[#ebebeb] px-3 py-3 text-sm text-ink-secondary">אין התאמה.</p>
        )}
      </div>
    </SettingsDialog>
  );
}

function RateDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string, price: string) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <SettingsDialog
      title="אפשרות משלוח"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={softButton} onClick={onClose}>
            ביטול
          </button>
          <button type="button" className={darkButton} onClick={() => onSave(name.trim() || "משלוח", price.trim())}>
            הוספה
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          שם
          <input value={name} onChange={(event) => setName(event.target.value)} className={field} placeholder="משלוח עד הבית" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          מחיר משלוח
          <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" dir="ltr" className={`${field} text-left`} placeholder="₪" />
          <span className="text-[13px] font-normal text-ink-secondary">השאירו ריק למשלוח חינם.</span>
        </label>
      </div>
    </SettingsDialog>
  );
}
