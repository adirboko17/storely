"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { useUnsavedEditor } from "@/components/admin/shared/use-unsaved";
import { Icon } from "@/components/ui/icon";
import { addPerson, patchProfile } from "@/data/mock/people-session";

const field =
  "h-9 w-full rounded-lg border border-[#8a8a8a] bg-white px-3 text-sm text-ink outline-none focus:border-[#303030] focus:shadow-[0_0_0_1px_#303030]";
const labelClass = "mb-1 block text-[13px] font-medium text-[#303030]";

type Draft = {
  first: string;
  last: string;
  language: "he" | "en";
  email: string;
  phone: string;
  emailMarketing: boolean;
  sms: boolean;
  whatsapp: boolean;
  note: string;
  tags: string[];
  company: string;
  street: string;
  apartment: string;
  city: string;
  zip: string;
  addressPhone: string;
};

const blank = (): Draft => ({
  first: "",
  last: "",
  language: "he",
  email: "",
  phone: "",
  emailMarketing: false,
  sms: false,
  whatsapp: false,
  note: "",
  tags: [],
  company: "",
  street: "",
  apartment: "",
  city: "",
  zip: "",
  addressPhone: "",
});

function dirtyOf(draft: Draft) {
  const empty = blank();
  return (Object.keys(empty) as Array<keyof Draft>).some((key) => {
    const value = draft[key];
    const start = empty[key];
    if (Array.isArray(value) && Array.isArray(start)) return value.length > 0;
    return value !== start;
  });
}

export function NewCustomerScreen() {
  const router = useRouter();
  const { toast } = useAdmin();
  const [draft, setDraft] = useState<Draft>(blank);
  const [addressOpen, setAddressOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [emailError, setEmailError] = useState(false);

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || draft.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    patch({ tags: [...draft.tags, tag] });
    setTagInput("");
  }

  function discard() {
    setDraft(blank());
    setAddressOpen(false);
    setNoteOpen(false);
    setTagInput("");
    setEmailError(false);
  }

  function save() {
    const email = draft.email.trim();
    const name = `${draft.first} ${draft.last}`.trim();
    if (email && !email.includes("@")) {
      setEmailError(true);
      toast("יש להזין דוא״ל תקין");
      return;
    }
    if (!name && !email) {
      toast("יש להזין שם או דוא״ל");
      return;
    }
    setEmailError(false);
    const street = [draft.company, draft.street, draft.apartment].map((part) => part.trim()).filter(Boolean).join(", ");
    const person = addPerson({
      name: name || email,
      email,
      phone: draft.phone.trim() || draft.addressPhone.trim(),
      city: draft.city.trim(),
      street,
      zip: draft.zip.trim(),
    });
    patchProfile(person.id, {
      subscribed: draft.emailMarketing,
      note: draft.note.trim(),
      tags: draft.tags,
      language: draft.language,
      sms: draft.sms,
      whatsapp: draft.whatsapp,
    });
    toast("הלקוח נוסף");
    router.push(`/admin/customers/${person.id}`);
  }

  useUnsavedEditor(dirtyOf(draft) || tagInput.trim().length > 0, false, save, discard);

  return (
    <div className="min-h-full px-4 py-4 sm:px-6">
      <div className="mx-auto w-full max-w-[1000px]">
        <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-[#616161] no-underline hover:text-ink">
          <Icon name="chevron" size={16} className="rotate-180" />
          לקוחות
        </Link>

        <div className="mt-3 grid items-start gap-8 min-[960px]:grid-cols-[minmax(0,1fr)_250px]">
          <div className="flex min-w-0 flex-col gap-6">
            <h1 className="m-0 text-[22px] leading-7 font-bold text-[#1a1a1a]">לקוח חדש</h1>

            <section className="flex flex-col gap-2">
              <h2 className="m-0 text-[13px] font-semibold text-[#303030]">סקירת לקוח</h2>
              <div className="flex flex-col gap-4 rounded-xl border border-[#e3e3e3] bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>שם פרטי</span>
                    <input value={draft.first} onChange={(event) => patch({ first: event.target.value })} autoComplete="given-name" className={field} />
                  </label>
                  <label>
                    <span className={labelClass}>שם משפחה</span>
                    <input value={draft.last} onChange={(event) => patch({ last: event.target.value })} autoComplete="family-name" className={field} />
                  </label>
                </div>

                <label>
                  <span className={labelClass}>שפה</span>
                  <select value={draft.language} onChange={(event) => patch({ language: event.target.value === "en" ? "en" : "he" })} className={field}>
                    <option value="he">עברית [ברירת מחדל]</option>
                    <option value="en">English</option>
                  </select>
                  <span className="mt-1 block text-[13px] text-[#616161]">הלקוח יקבל הודעות בשפה הזו.</span>
                </label>

                <label>
                  <span className={labelClass}>דוא״ל</span>
                  <input
                    value={draft.email}
                    onChange={(event) => {
                      patch({ email: event.target.value });
                      if (emailError) setEmailError(false);
                    }}
                    dir="ltr"
                    type="email"
                    autoComplete="email"
                    className={field}
                    style={{ borderColor: emailError ? "#e51c00" : undefined, background: emailError ? "#fff4f4" : undefined }}
                  />
                  {emailError ? <span className="mt-1 block text-[13px] text-[#8e1f0b]">יש להזין דוא״ל תקין</span> : null}
                </label>

                <label>
                  <span className={labelClass}>מספר טלפון</span>
                  <div className="flex h-9 overflow-hidden rounded-lg border border-[#8a8a8a] bg-white focus-within:border-[#303030] focus-within:shadow-[0_0_0_1px_#303030]">
                    <span className="grid w-11 shrink-0 place-items-center border-e border-[#c9c9c9]" title="ישראל" aria-label="ישראל">
                      <svg viewBox="0 0 22 16" width="22" height="16" aria-hidden>
                        <rect width="22" height="16" rx="1" fill="#fff" stroke="#d4d4d4" />
                        <rect y="1.5" width="22" height="2.4" fill="#0038b8" />
                        <rect y="12.1" width="22" height="2.4" fill="#0038b8" />
                        <path d="M11 4.2 12.6 6.8H9.4zM11 10.2 9.4 7.6h3.2z" fill="none" stroke="#0038b8" strokeWidth="0.7" />
                      </svg>
                    </span>
                    <input
                      value={draft.phone}
                      onChange={(event) => patch({ phone: event.target.value })}
                      dir="ltr"
                      type="tel"
                      autoComplete="tel"
                      className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-ink outline-none"
                    />
                  </div>
                </label>

                <div className="flex flex-col gap-2.5 pt-1">
                  {(
                    [
                      ["emailMarketing", "הלקוח הסכים לקבל דוא״ל שיווקי"],
                      ["sms", "הלקוח הסכים לקבל הודעות SMS שיווקיות"],
                      ["whatsapp", "הלקוח הסכים לקבל הודעות וואטסאפ שיווקיות"],
                    ] as const
                  ).map(([key, text]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-[#303030]">
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        onChange={(event) => patch({ [key]: event.target.checked })}
                        className="size-4 accent-[#303030]"
                      />
                      {text}
                    </label>
                  ))}
                </div>

                <p className="m-0 text-[13px] leading-5 text-[#616161]">
                  יש לבקש מהלקוח אישור לפני שמצרפים אותו לדיוור בדוא״ל, ב-SMS או בוואטסאפ.
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <div>
                <h2 className="m-0 text-sm font-semibold text-[#303030]">כתובת ברירת מחדל</h2>
                <p className="m-0 mt-1 text-[13px] text-[#616161]">הכתובת הראשית של הלקוח</p>
              </div>
              {addressOpen ? (
                <div className="flex flex-col gap-3 rounded-xl border border-[#e3e3e3] bg-white p-4">
                  <label>
                    <span className={labelClass}>מדינה/אזור</span>
                    <select className={field} defaultValue="israel">
                      <option value="israel">ישראל</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>חברה</span>
                    <input value={draft.company} onChange={(event) => patch({ company: event.target.value })} className={field} />
                  </label>
                  <label>
                    <span className={labelClass}>כתובת</span>
                    <input value={draft.street} onChange={(event) => patch({ street: event.target.value })} autoComplete="street-address" className={field} />
                  </label>
                  <label>
                    <span className={labelClass}>דירה, קומה וכדומה</span>
                    <input value={draft.apartment} onChange={(event) => patch({ apartment: event.target.value })} className={field} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className={labelClass}>עיר</span>
                      <input value={draft.city} onChange={(event) => patch({ city: event.target.value })} autoComplete="address-level2" className={field} />
                    </label>
                    <label>
                      <span className={labelClass}>מיקוד</span>
                      <input value={draft.zip} onChange={(event) => patch({ zip: event.target.value })} dir="ltr" autoComplete="postal-code" className={field} />
                    </label>
                  </div>
                  <label>
                    <span className={labelClass}>טלפון</span>
                    <input value={draft.addressPhone} onChange={(event) => patch({ addressPhone: event.target.value })} dir="ltr" type="tel" className={field} />
                  </label>
                  <div className="flex justify-end">
                    <button type="button" className="border-0 bg-transparent p-0 text-sm text-[#616161] underline" onClick={() => setAddressOpen(false)}>
                      סגירה
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddressOpen(true)}
                  className="flex h-12 w-full items-center gap-2 rounded-xl border border-[#e3e3e3] bg-white px-3 text-sm font-medium text-[#303030]"
                >
                  <span className="grid size-5 place-items-center rounded-full border border-[#8a8a8a]">
                    <Icon name="plus" size={12} strokeWidth={1.8} />
                  </span>
                  הוספת כתובת
                  <Icon name="chevron" size={16} className="ms-auto text-[#616161]" />
                </button>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <section>
              <h2 className="m-0 text-[13px] font-semibold text-[#303030]">הערות</h2>
              {noteOpen ? (
                <textarea
                  value={draft.note}
                  onChange={(event) => patch({ note: event.target.value })}
                  rows={4}
                  autoFocus
                  placeholder="ההערות פרטיות ולא ישותפו עם הלקוח."
                  className="mt-2 w-full resize-y rounded-lg border border-[#8a8a8a] bg-white p-2.5 text-sm outline-none focus:border-[#303030] focus:shadow-[0_0_0_1px_#303030]"
                />
              ) : (
                <div className="mt-1 flex items-start gap-2">
                  <p className="m-0 flex-1 text-[13px] leading-5 text-[#616161]">
                    {draft.note.trim() || "ההערות פרטיות ולא ישותפו עם הלקוח."}
                  </p>
                  <button type="button" aria-label="עריכת הערה" className="grid size-7 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-[#303030] hover:bg-[#f1f1f1]" onClick={() => setNoteOpen(true)}>
                    <Icon name="pencil" size={16} />
                  </button>
                </div>
              )}
            </section>

            <section>
              <h2 className="m-0 text-[13px] font-semibold text-[#303030]">תגיות</h2>
              <div className="mt-2 flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-[#8a8a8a] bg-white px-2 py-1 focus-within:border-[#303030] focus-within:shadow-[0_0_0_1px_#303030]">
                <Icon name="tag" size={16} className="shrink-0 text-[#616161]" />
                {draft.tags.map((tag) => (
                  <span key={tag} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-[#ebebeb] ps-2 pe-1 text-[13px]">
                    {tag}
                    <button
                      type="button"
                      aria-label={`הסרת ${tag}`}
                      className="grid size-4 place-items-center border-0 bg-transparent text-[#616161]"
                      onClick={() => patch({ tags: draft.tags.filter((item) => item !== tag) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={draft.tags.length ? "" : "הוספת תגיות"}
                  className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent text-sm text-ink outline-none"
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
