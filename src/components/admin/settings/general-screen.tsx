"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { uploadStoreLogo } from "@/data/live/email-media";
import { getMenuName, setMenuName, subscribeMenuName, useMenuAccount } from "@/data/live/menu-name";
import { getStoreIdentity, getStoreIdentityVersion, setStoreIdentity, subscribeStoreIdentity } from "@/data/live/store-identity";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { darkButton, softButton } from "@/components/admin/orders/chrome";
import { SettingsDialog } from "@/components/admin/settings/settings-dialog";
import { brandPalette, getSettings, getSettingsVersion, saveStoreContact, setBrandColor, setStoreLogo, subscribeSettings, type StoreContact } from "@/data/mock/settings-session";
import { STORE_CURRENCIES, getStoreCurrency, isStoreCurrency, setStoreCurrency, type StoreCurrency } from "@/lib/formatting/currency";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const selectClass =
  "h-8 w-full rounded-lg border border-[#c9c9c9] bg-white px-2.5 text-sm text-ink outline-none";

function addressSummary(contact: StoreContact) {
  if (contact.addressMode !== "physical") return "חנות אונליין בלבד, ללא כתובת";
  const parts = [contact.street, contact.city].map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "לא הוגדרה כתובת";
}

export function GeneralSettingsScreen() {
  const { toast } = useAdmin();
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, getStoreIdentityVersion);
  useSyncExternalStore(subscribeSettings, getSettingsVersion, () => 0);
  const accountName = useMenuAccount();
  const liveName = useSyncExternalStore(subscribeMenuName, getMenuName, () => "");
  const shownName = liveName || accountName;
  const store = getStoreIdentity();
  const logo = getSettings().logo;
  const colors = brandPalette();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [businessName, setBusinessName] = useState(store.name);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [region, setRegion] = useState("israel");
  const [units, setUnits] = useState("metric");
  const [weight, setWeight] = useState("kg");
  const [timezone, setTimezone] = useState("jerusalem");
  const contact = getSettings().contact;
  const [contactOpen, setContactOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addressDraft, setAddressDraft] = useState<StoreContact>(contact);
  const [savingContact, setSavingContact] = useState(false);
  const [myName, setMyName] = useState(accountName);
  const [nameEditor, setNameEditor] = useState<"closed" | "open" | "closing">("closed");
  const [savingName, setSavingName] = useState(false);
  const [currency, setCurrency] = useState<StoreCurrency>(getStoreCurrency());
  const [savingCurrency, setSavingCurrency] = useState(false);

  async function changeCurrency(next: string) {
    if (!isStoreCurrency(next) || next === currency) return;
    const previous = currency;
    setCurrency(next);
    setStoreCurrency(next);
    if (!store.storeId) {
      setCurrency(previous);
      setStoreCurrency(previous);
      toast("לא נמצאה חנות");
      return;
    }
    setSavingCurrency(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("store_settings").update({ currency: next }).eq("store_id", store.storeId).select("currency").maybeSingle();
      if (error || !data) throw new Error("שמירת המטבע נכשלה");
      toast("המטבע עודכן בחנות ובסל");
    } catch (error: unknown) {
      setCurrency(previous);
      setStoreCurrency(previous);
      toast(error instanceof Error ? error.message : "שמירת המטבע נכשלה");
    } finally {
      setSavingCurrency(false);
    }
  }

  function openNameEditor() {
    setMyName(getMenuName() || accountName);
    setNameEditor("open");
  }

  function closeNameEditor() {
    if (savingName || nameEditor !== "open") return;
    setNameEditor("closing");
  }

  useEffect(() => {
    if (nameEditor !== "closing") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setNameEditor("closed"), reduce ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [nameEditor]);

  async function saveMyName() {
    const next = myName.trim();
    if (next.length < 2) {
      toast("הזינו שם");
      return;
    }
    if (next === shownName) {
      closeNameEditor();
      return;
    }
    setSavingName(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("set_my_menu_name", { next_name: next });
      if (error || typeof data !== "string") throw new Error(error?.message || "שמירת השם נכשלה");
      setMenuName(data);
      setMyName(data);
      setNameEditor("closing");
      toast("השם עודכן בתפריט");
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "שמירת השם נכשלה");
    } finally {
      setSavingName(false);
    }
  }

  function openBusiness() {
    setBusinessName(store.name);
    setEditingBusiness(true);
  }

  async function saveBusiness() {
    const next = businessName.trim();
    if (next.length < 2) {
      toast("הזינו שם עסק");
      return;
    }
    if (!store.storeId) {
      toast("לא נמצאה חנות");
      return;
    }
    setSavingBusiness(true);
    try {
      await persistStoreName(next);
      setEditingBusiness(false);
      toast("פרטי העסק נשמרו");
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "שמירת פרטי העסק נכשלה");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function persistStoreName(next: string) {
    if (!store.storeId) throw new Error("לא נמצאה חנות");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("store_settings").update({ display_name: next }).eq("store_id", store.storeId).select("display_name").maybeSingle();
    if (error || !data) throw new Error("שמירת שם החנות נכשלה");
    setStoreIdentity({ ...getStoreIdentity(), name: next });
  }

  function openContact() {
    setContactName(store.name);
    setContactEmail(contact.email || store.ownerEmail);
    setContactPhone(contact.phone);
    setContactOpen(true);
  }

  async function saveContact() {
    const nextName = contactName.trim();
    if (nextName.length < 2) {
      toast("הזינו שם לחנות");
      return;
    }
    setSavingContact(true);
    try {
      if (nextName !== store.name) await persistStoreName(nextName);
      saveStoreContact({ ...getSettings().contact, email: contactEmail.trim(), phone: contactPhone.trim() });
      setContactOpen(false);
      toast("פרטי הקשר נשמרו");
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : "שמירת פרטי הקשר נכשלה");
    } finally {
      setSavingContact(false);
    }
  }

  function openAddress() {
    setAddressDraft({ ...getSettings().contact, company: getSettings().contact.company || store.name, country: getSettings().contact.country || "ישראל" });
    setAddressOpen(true);
  }

  function saveAddress() {
    const current = getSettings().contact;
    const physical = addressDraft.addressMode === "physical";
    saveStoreContact({
      ...current,
      addressMode: addressDraft.addressMode,
      company: addressDraft.company.trim(),
      country: addressDraft.country || "ישראל",
      street: physical ? addressDraft.street.trim() : "",
      apartment: physical ? addressDraft.apartment.trim() : "",
      zip: physical ? addressDraft.zip.trim() : "",
      city: physical ? addressDraft.city.trim() : "",
    });
    setAddressOpen(false);
    toast("כתובת החנות נשמרה");
  }

  return (
    <div data-screen-label="Settings general" className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-8">
      <h1 className="m-0 text-xl font-bold text-ink-strong">כללי</h1>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold text-ink">השם שלי</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">מוצג רק לך, ומשנה את השם בתפריט למטה.</p>
        </div>
        <Card className="px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f1f1f1] text-ink-secondary">
              <Icon name="user" size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{shownName || "לא הוגדר שם"}</span>
            <button type="button" onClick={openNameEditor} className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold text-ink">עריכה</button>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold text-ink">לוגו</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">הלוגו שמופיע ליד שם החשבון בתפריט ובמיילים. בלוק הלוגו במייל מושך אותו מכאן.</p>
        </div>
        <Card className="flex items-center gap-4 px-4 py-4">
          <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f6f6f6]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="max-h-14 max-w-24 object-contain" />
            ) : (
              <span className="text-[12px] text-ink-secondary">אין לוגו</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (!next) return;
              setUploading(true);
              void uploadStoreLogo(store.storeId, next)
                .then((url) => { setStoreLogo(url); toast("הלוגו נשמר"); })
                .catch((error: unknown) => toast(error instanceof Error ? error.message : "העלאת הלוגו נכשלה"))
                .finally(() => setUploading(false));
            }} />
            <button type="button" disabled={uploading} onClick={() => file.current?.click()} className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white disabled:opacity-60">{uploading ? "מעלים…" : logo ? "החלפת לוגו" : "העלאת לוגו"}</button>
            {logo ? <button type="button" onClick={() => { setStoreLogo(""); toast("הלוגו הוסר"); }} className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold text-ink">הסרה</button> : null}
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold text-ink">צבעי מותג</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">שבעה צבעים שנשמרים לחנות ומופיעים בכל בחירת צבע במיילים.</p>
        </div>
        <Card className="flex flex-wrap gap-3 px-4 py-4">
          {colors.map((color, index) => (
            <label key={index} className="relative grid size-9 cursor-pointer place-items-center rounded-full" style={{ background: color, boxShadow: "0 0 0 1px rgba(0,0,0,.16)" }}>
              <span className="sr-only">צבע {index + 1}</span>
              <input type="color" value={color} onChange={(event) => setBrandColor(index, event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <div>
          <h2 className="m-0 text-sm font-semibold text-ink">פרטי העסק</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-secondary">הישות העסקית שמשמשת למוצרים פיננסיים, שווקים, אפליקציות ומיסים בחנות הזו.</p>
        </div>
        <Card className="px-4 py-4">
          {editingBusiness ? (
            <div className="flex flex-col gap-3">
              <label>
                <span className="mb-1.5 block text-sm font-semibold text-ink">שם העסק</span>
                <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className={selectClass} autoFocus />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={savingBusiness} onClick={() => void saveBusiness()} className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white disabled:opacity-60">{savingBusiness ? "שומר…" : "שמירה"}</button>
                <button type="button" disabled={savingBusiness} onClick={() => setEditingBusiness(false)} className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold text-ink">ביטול</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg leading-none" aria-hidden>🇮🇱</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{store.name}</span>
                <span className="block text-[13px] text-ink-secondary">ישראל</span>
              </span>
              <button type="button" onClick={openBusiness} className="h-8 rounded-lg border-0 bg-[#f1f1f1] px-3 text-sm font-semibold text-ink">עריכה</button>
            </div>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">פרטי קשר של החנות</h2>
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={openContact}
            className="flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-[#fafafa]"
          >
            <Icon name="store" className="shrink-0 text-ink-secondary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{store.name}</span>
              <span dir="ltr" className="block text-right text-[13px] text-ink-secondary">
                {contact.email || store.ownerEmail || "אין אימייל"} · {contact.phone || "אין מספר טלפון"}
              </span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-ink-secondary" />
          </button>
          <button
            type="button"
            onClick={openAddress}
            className="flex w-full items-start gap-3 border-t border-[#ebebeb] px-3 py-3 text-start hover:bg-[#fafafa]"
          >
            <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center text-ink-secondary">
              <span className="size-2 rounded-full border-2 border-current" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">כתובת החנות</span>
              <span className="block text-[13px] text-ink-secondary">{addressSummary(contact)}</span>
            </span>
            <Icon name="chevron" size={16} className="mt-0.5 shrink-0 text-ink-secondary" />
          </button>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-ink">ברירות מחדל של החנות</h2>
        <Card className="flex flex-col">
          <label className="flex flex-col gap-2 px-4 py-3.5">
            <span>
              <span className="block text-sm font-semibold text-ink">תצוגת מטבע</span>
              <span className="mt-0.5 block text-[13px] text-ink-secondary">המטבע שמוצג ללקוחות בחנות ובסל.</span>
            </span>
            <select value={currency} disabled={savingCurrency} onChange={(event) => void changeCurrency(event.target.value)} className={selectClass}>
              {STORE_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>

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

      {nameEditor !== "closed" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8 backdrop-blur-[2px]"
          style={{ animation: nameEditor === "closing" ? "name-veil-out 280ms ease forwards" : "name-veil-in 280ms ease" }}
          onMouseDown={closeNameEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="השם שלי"
            className="w-full max-w-[440px] rounded-2xl bg-white text-ink shadow-[0_24px_70px_rgba(0,0,0,.28)]"
            style={{ animation: nameEditor === "closing" ? "name-panel-out 280ms cubic-bezier(.4,0,1,1) forwards" : "name-panel-in 520ms cubic-bezier(.16,1,.3,1)" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="m-0 text-base font-bold">השם שלי</h2>
              <button type="button" aria-label="סגירה" onClick={closeNameEditor} className="grid size-8 place-items-center rounded-lg text-ink-secondary hover:bg-[#f1f1f1]">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="px-5 pb-4">
              <label>
                <span className="mb-1.5 block text-sm font-semibold">השם שמופיע בתפריט</span>
                <input value={myName} onChange={(event) => setMyName(event.target.value)} className={selectClass} autoComplete="name" autoFocus />
                <span className="mt-1.5 block text-[13px] text-ink-secondary">מוצג רק לך, ומשנה את השם בתפריט למטה.</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#ebebeb] px-5 py-3">
              <button type="button" className={softButton} onClick={closeNameEditor}>ביטול</button>
              <button type="button" className={darkButton} disabled={savingName} onClick={() => void saveMyName()}>{savingName ? "שומר…" : "שמירה"}</button>
            </div>
          </div>
          <style>{`
            @keyframes name-veil-in { from { opacity: 0 } to { opacity: 1 } }
            @keyframes name-veil-out { from { opacity: 1 } to { opacity: 0 } }
            @keyframes name-panel-in {
              0% { opacity: 0; transform: translateY(28px) scale(.92); }
              62% { opacity: 1; transform: translateY(-6px) scale(1.02); }
              100% { opacity: 1; transform: none; }
            }
            @keyframes name-panel-out {
              from { opacity: 1; transform: none; }
              to { opacity: 0; transform: translateY(14px) scale(.96); }
            }
            @media (prefers-reduced-motion: reduce) {
              @keyframes name-veil-in { from, to { opacity: 1 } }
              @keyframes name-veil-out { from, to { opacity: 0 } }
              @keyframes name-panel-in { from, to { opacity: 1; transform: none } }
              @keyframes name-panel-out { from, to { opacity: 0; transform: none } }
            }
          `}</style>
        </div>
      ) : null}

      {contactOpen ? (
        <SettingsDialog
          title="פרטי קשר של החנות"
          className="max-w-[560px]"
          onClose={() => setContactOpen(false)}
          footer={
            <>
              <button type="button" className={softButton} onClick={() => setContactOpen(false)}>ביטול</button>
              <button type="button" className={darkButton} disabled={savingContact} onClick={() => void saveContact()}>{savingContact ? "שומר…" : "שמירה"}</button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <label className="rounded-xl border border-[#e3e3e3] p-3">
              <span className="mb-1.5 block text-sm font-semibold">שם החנות</span>
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} className={selectClass} />
              <span className="mt-1.5 block text-[13px] text-ink-secondary">מופיע בחנות האונליין</span>
            </label>
            <div className="flex flex-col gap-3 rounded-xl border border-[#e3e3e3] p-3">
              <label>
                <span className="mb-1.5 block text-sm font-semibold">אימייל החנות</span>
                <input dir="ltr" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className={`${selectClass} text-end`} />
                <span className="mt-1.5 block text-[13px] text-ink-secondary">מקבל הודעות על החנות</span>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-semibold">טלפון החנות</span>
                <input dir="ltr" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className={`${selectClass} text-end`} placeholder="050-0000000" />
              </label>
              <p className="m-0 text-[13px] text-ink-secondary">פרטי הקשר גלויים ללקוחות.</p>
            </div>
          </div>
        </SettingsDialog>
      ) : null}

      {addressOpen ? (
        <SettingsDialog
          title="עריכת כתובת החנות"
          className="max-w-[560px]"
          onClose={() => setAddressOpen(false)}
          footer={
            <>
              <button type="button" className={softButton} onClick={() => setAddressOpen(false)}>ביטול</button>
              <button type="button" className={darkButton} onClick={saveAddress}>שמירה</button>
            </>
          }
        >
          <p className="m-0 mb-3 text-sm text-ink-secondary">הלקוחות יכולים לראות את הפרטים האלה</p>
          <div className="mb-4 grid gap-2">
            <button type="button" onClick={() => setAddressDraft((current) => ({ ...current, addressMode: "none" }))} className="rounded-xl border px-3 py-2.5 text-start" style={{ borderColor: addressDraft.addressMode === "none" ? "#1a1a1a" : "#e3e3e3" }}>
              <span className="block text-sm font-semibold">חנות אונליין בלבד</span>
              <span className="block text-[13px] text-ink-secondary">ללא כתובת פיזית</span>
            </button>
            <button type="button" onClick={() => setAddressDraft((current) => ({ ...current, addressMode: "physical" }))} className="rounded-xl border px-3 py-2.5 text-start" style={{ borderColor: addressDraft.addressMode === "physical" ? "#1a1a1a" : "#e3e3e3" }}>
              <span className="block text-sm font-semibold">כתובת פיזית</span>
              <span className="block text-[13px] text-ink-secondary">רחוב, עיר ומיקוד</span>
            </button>
          </div>
          {addressDraft.addressMode === "physical" ? (
            <div className="flex flex-col gap-3">
              <label>
                <span className="mb-1.5 block text-sm font-semibold">שם החברה</span>
                <input value={addressDraft.company} onChange={(event) => setAddressDraft((current) => ({ ...current, company: event.target.value }))} className={selectClass} />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-semibold">מדינה</span>
                <select value={addressDraft.country} onChange={(event) => setAddressDraft((current) => ({ ...current, country: event.target.value }))} className={selectClass}>
                  <option value="ישראל">ישראל</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-semibold">כתובת</span>
                <input value={addressDraft.street} onChange={(event) => setAddressDraft((current) => ({ ...current, street: event.target.value }))} className={selectClass} placeholder="רחוב ומספר" />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-semibold">דירה, כניסה וכו׳</span>
                <input value={addressDraft.apartment} onChange={(event) => setAddressDraft((current) => ({ ...current, apartment: event.target.value }))} className={selectClass} />
              </label>
              <div className="grid gap-3 min-[520px]:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-sm font-semibold">מיקוד</span>
                  <input dir="ltr" value={addressDraft.zip} onChange={(event) => setAddressDraft((current) => ({ ...current, zip: event.target.value }))} className={`${selectClass} text-end`} />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-semibold">עיר</span>
                  <input value={addressDraft.city} onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))} className={selectClass} />
                </label>
              </div>
            </div>
          ) : null}
        </SettingsDialog>
      ) : null}
    </div>
  );
}
