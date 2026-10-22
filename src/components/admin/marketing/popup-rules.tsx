"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getStoreIdentity } from "@/data/live/store-identity";
import { getPostsVersion, listPosts, subscribePosts } from "@/data/mock/content-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { frequencyLabel, type PopupDevice, type PopupFrequency, type PopupPages, type PopupTrigger, type StorePopup } from "@/lib/marketing/popups";

const field = "mt-1 h-9 w-full rounded-lg border border-[#e3e3e3] bg-white px-2.5 text-sm";

const BASIC_PATHS = ["/events", "/contact", "/stores", "/podcast"] as const;

const BASICS: Array<{ id: string; label: string; hint: string; flag?: keyof Pick<PopupPages, "home" | "product" | "catalog" | "checkout" | "content">; path?: string }> = [
  { id: "home", label: "דף הבית", hint: "רק העמוד הראשי", flag: "home" },
  { id: "product", label: "כל המוצרים", hint: "כל עמוד מוצר בחנות", flag: "product" },
  { id: "catalog", label: "החנות", hint: "רשימת המוצרים", flag: "catalog" },
  { id: "checkout", label: "תשלום", hint: "עמוד הקופה", flag: "checkout" },
  { id: "content", label: "כל המאמרים", hint: "הרשימה וכל כתבה", flag: "content" },
  { id: "events", label: "כל האירועים", hint: "עמוד האירועים", path: "/events" },
  { id: "contact", label: "צור קשר", hint: "עמוד יצירת קשר", path: "/contact" },
  { id: "stores", label: "חנויות", hint: "איפה קונים", path: "/stores" },
  { id: "podcast", label: "פודקאסט", hint: "עמודי הפודקאסט", path: "/podcast" },
];

const TRIGGERS: Array<{ id: PopupTrigger; title: string; hint: string }> = [
  { id: "immediate", title: "מיד", hint: "ברגע שנכנסים לעמוד" },
  { id: "delay", title: "אחרי המתנה", hint: "כמה שניות אחרי הכניסה" },
  { id: "scroll", title: "אחרי גלילה", hint: "כשמגיעים לעומק בעמוד" },
  { id: "exit", title: "לפני יציאה", hint: "כשהעכבר עוזב למעלה" },
];

const FREQUENCIES: Array<{ id: PopupFrequency; hint: string }> = [
  { id: "always", hint: "שוב בכל מעבר עמוד" },
  { id: "session", hint: "פעם אחת בכל ביקור" },
  { id: "day", hint: "פעם ביום" },
  { id: "once", hint: "פעם אחת, ולא שוב" },
];

const DEVICES: Array<{ id: PopupDevice; label: string; hint: string }> = [
  { id: "all", label: "כולם", hint: "מחשב וטלפון" },
  { id: "desktop", label: "מחשב", hint: "מסך רחב" },
  { id: "mobile", label: "טלפון", hint: "מסך צר" },
];

type SitePage = { id: string; title: string; path: string; kind: "product" | "article" | "event" };

function localValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isEvent(blog: string) {
  return blog.includes("אירוע");
}

export function PopupRules({
  popup,
  onChange,
  onWindow,
}: {
  popup: StorePopup;
  onChange: (targeting: StorePopup["targeting"]) => void;
  onWindow: (startsAt: string | null, endsAt: string | null) => void;
}) {
  const pages = popup.targeting.pages;
  const [kind, setKind] = useState<"product" | "article" | "event">("product");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SitePage[]>([]);
  const [datesOpen, setDatesOpen] = useState(Boolean(popup.startsAt || popup.endsAt));
  useSyncExternalStore(subscribePosts, getPostsVersion, () => 0);

  useEffect(() => {
    const storeId = getStoreIdentity().storeId;
    if (!storeId) return;
    let alive = true;
    createSupabaseBrowserClient()
      .from("products")
      .select("id, title, handle, status")
      .eq("store_id", storeId)
      .order("title")
      .then(({ data }) => {
        if (!alive || !data) return;
        setProducts(data.flatMap((row) => {
          if (row.status !== "active" || !row.title) return [];
          const key = (typeof row.handle === "string" && row.handle.trim()) || row.id;
          return [{ id: row.id, title: row.title, path: `/product/${encodeURIComponent(key)}`, kind: "product" as const }];
        }));
      });
    return () => { alive = false; };
  }, []);

  const posts = listPosts().filter((post) => post.visible && post.handle && post.title);
  const catalog = {
    articles: posts.filter((post) => !isEvent(post.blog)).map((post) => ({ id: `post-${post.id}`, title: post.title, path: `/articles/${post.handle}`, kind: "article" as const })),
    events: posts.filter((post) => isEvent(post.blog)).map((post) => ({ id: `event-${post.id}`, title: post.title, path: `/events/${post.handle}`, kind: "event" as const })),
  };

  const sitePages = kind === "product" ? products : kind === "article" ? catalog.articles : catalog.events;
  const needle = query.trim().toLowerCase();
  const shown = sitePages.filter((page) => !needle || page.title.toLowerCase().includes(needle)).slice(0, 30);
  const picked = pages.paths.filter((path) => !BASIC_PATHS.includes(path as (typeof BASIC_PATHS)[number]));

  function setPages(next: Partial<PopupPages>) {
    onChange({ ...popup.targeting, pages: { ...pages, ...next } });
  }

  function togglePath(path: string) {
    const paths = pages.paths.includes(path) ? pages.paths.filter((item) => item !== path) : [...pages.paths, path].slice(0, 20);
    setPages({ paths });
  }

  function titleFor(path: string) {
    return products.find((page) => page.path === path)?.title
      ?? catalog.articles.find((page) => page.path === path)?.title
      ?? catalog.events.find((page) => page.path === path)?.title
      ?? path;
  }

  const card = "rounded-2xl border-0 px-3 py-3 text-start data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white";

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
        <b className="text-sm">איפה זה מופיע</b>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-on={pages.all} onClick={() => setPages({ all: true })} className={`${card} bg-[#f6f6f6]`}>
            <b className="block text-sm">כל האתר</b>
            <span className="mt-0.5 block text-xs opacity-70">בכל עמוד שהמבקר פותח</span>
          </button>
          <button type="button" data-on={!pages.all} onClick={() => setPages({ all: false })} className={`${card} bg-[#f6f6f6]`}>
            <b className="block text-sm">עמודים שאני בוחר</b>
            <span className="mt-0.5 block text-xs opacity-70">אזור באתר, או עמוד אחד</span>
          </button>
        </div>
        {pages.all ? <p className="m-0 mt-3 text-sm text-[#616161]">החלון יכול להופיע בכל עמוד באתר.</p> : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {BASICS.map((item) => {
                const on = item.flag ? pages[item.flag] : pages.paths.includes(item.path ?? "");
                return (
                  <button key={item.id} type="button" data-on={on} onClick={() => item.flag ? setPages({ [item.flag]: !pages[item.flag] }) : togglePath(item.path ?? "")} className={`${card} bg-[#f6f6f6]`}>
                    <b className="block text-sm">{item.label}</b>
                    <span className="mt-0.5 block text-xs opacity-70">{item.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <b className="text-sm">עמוד מסוים</b>
              <p className="m-0 mt-1 text-xs text-[#616161]">אפשר לבחור כמה. למשל רק מוצר אחד, או מאמר אחד, או אירוע אחד.</p>
              {picked.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {picked.map((path) => (
                    <button key={path} type="button" onClick={() => togglePath(path)} className="inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[#1a1a1a] px-3 text-xs font-semibold text-white">
                      <span className="max-w-[180px] truncate">{titleFor(path)}</span>
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex rounded-full bg-[#f3f3f3] p-1">
                {([
                  ["product", "מוצרים"],
                  ["article", "מאמרים"],
                  ["event", "אירועים"],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button" data-on={kind === id} onClick={() => { setKind(id); setQuery(""); }} className="h-8 flex-1 rounded-full border-0 text-sm font-semibold text-[#616161] data-[on=true]:bg-white data-[on=true]:text-[#1a1a1a]">{label}</button>
                ))}
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "product" ? "חיפוש מוצר" : kind === "article" ? "חיפוש מאמר" : "חיפוש אירוע"} className={`${field} mt-2`} />
              <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {shown.length === 0 ? <p className="m-0 px-1 py-3 text-sm text-[#616161]">{kind === "event" ? "אין עדיין אירועים באתר. אפשר לבחור את עמוד כל האירועים למעלה." : "אין תוצאות."}</p> : null}
                {shown.map((page) => {
                  const on = pages.paths.includes(page.path);
                  return (
                    <button key={page.id} type="button" data-on={on} onClick={() => togglePath(page.path)} className="flex items-center gap-2 rounded-xl border-0 bg-[#f7f7f7] px-3 py-2 text-start text-sm data-[on=true]:bg-[#1a1a1a] data-[on=true]:text-white">
                      <span className="min-w-0 flex-1 truncate">{page.title}</span>
                      <span className="text-xs opacity-70">{on ? "נבחר" : "בחירה"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
        <b className="text-sm">מתי הוא נפתח</b>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TRIGGERS.map((item) => (
            <button key={item.id} type="button" data-on={popup.targeting.trigger === item.id} onClick={() => onChange({ ...popup.targeting, trigger: item.id })} className={`${card} bg-[#f6f6f6]`}>
              <b className="block text-sm">{item.title}</b>
              <span className="mt-0.5 block text-xs opacity-70">{item.hint}</span>
            </button>
          ))}
        </div>
        {popup.targeting.trigger === "immediate" ? <p className="m-0 mt-3 text-sm text-[#616161]">החלון מופיע ברגע שהעמוד נטען.</p> : null}
        {popup.targeting.trigger === "delay" ? (
          <Meter label="שניות אחרי הכניסה לעמוד" min={0} max={90} value={popup.targeting.delaySeconds} text={popup.targeting.delaySeconds === 0 ? "מיד" : `${popup.targeting.delaySeconds} שניות`} onChange={(delaySeconds) => onChange({ ...popup.targeting, delaySeconds })} />
        ) : null}
        {popup.targeting.trigger === "scroll" ? (
          <>
            <Meter label="כמה מהעמוד צריך לגלול" min={10} max={90} value={popup.targeting.scrollPercent} text={`${popup.targeting.scrollPercent}%`} onChange={(scrollPercent) => onChange({ ...popup.targeting, scrollPercent })} />
            <p className="m-0 mt-2 text-xs text-[#8a8a8a]">בעמוד קצר בלי גלילה, החלון נפתח אחרי כמה שניות במקום.</p>
          </>
        ) : null}
        {popup.targeting.trigger === "exit" ? (
          <>
            <p className="m-0 mt-3 text-sm text-[#616161]">במחשב החלון נפתח כשהעכבר יוצא מהחלק העליון של המסך. בטלפון אין עכבר, אז הוא נפתח אחרי ההמתנה.</p>
            <Meter label="בטלפון, אחרי כמה שניות" min={0} max={90} value={popup.targeting.delaySeconds} text={popup.targeting.delaySeconds === 0 ? "מיד" : `${popup.targeting.delaySeconds} שניות`} onChange={(delaySeconds) => onChange({ ...popup.targeting, delaySeconds })} />
          </>
        ) : null}
      </section>

      <section className="rounded-[18px] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
        <b className="text-sm">כל כמה זמן</b>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FREQUENCIES.map((item) => (
            <button key={item.id} type="button" data-on={popup.targeting.frequency === item.id} onClick={() => onChange({ ...popup.targeting, frequency: item.id })} className={`${card} bg-[#f6f6f6]`}>
              <b className="block text-sm">{frequencyLabel(item.id)}</b>
              <span className="mt-0.5 block text-xs opacity-70">{item.hint}</span>
            </button>
          ))}
        </div>
        <b className="mt-4 block text-sm">באיזה מסך</b>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEVICES.map((item) => (
            <button key={item.id} type="button" data-on={popup.targeting.device === item.id} onClick={() => onChange({ ...popup.targeting, device: item.id })} className={`${card} bg-[#f6f6f6]`}>
              <b className="block text-sm">{item.label}</b>
              <span className="mt-0.5 block text-xs opacity-70">{item.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[18px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
        <button type="button" aria-expanded={datesOpen} onClick={() => setDatesOpen((open) => !open)} className="flex w-full items-center gap-2 border-0 bg-transparent px-4 py-3 text-start">
          <b className="text-sm">תאריכים</b>
          <span className="text-xs text-[#8a8a8a]">{popup.startsAt || popup.endsAt ? "מוגבל" : "בלי הגבלה"}</span>
          <span className="ms-auto text-xs text-[#8a8a8a]">{datesOpen ? "▴" : "▾"}</span>
        </button>
        {datesOpen ? (
          <div className="grid gap-3 px-4 pb-4">
            <label className="text-sm">התחלה
              <input type="datetime-local" value={localValue(popup.startsAt)} onChange={(event) => onWindow(fromLocal(event.target.value), popup.endsAt)} className={field} />
            </label>
            <label className="text-sm">סיום
              <input type="datetime-local" value={localValue(popup.endsAt)} onChange={(event) => onWindow(popup.startsAt, fromLocal(event.target.value))} className={field} />
            </label>
            <p className="m-0 text-xs text-[#8a8a8a]">ריק אומר שהחלון לא מוגבל בתאריך.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Meter({ label, min, max, value, text, onChange }: { label: string; min: number; max: number; value: number; text: string; onChange: (value: number) => void }) {
  return (
    <label className="mt-3 block rounded-2xl bg-[#fafafa] px-3 py-3 text-sm">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <b>{text}</b>
      </span>
      <input type="range" min={min} max={max} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full" />
    </label>
  );
}
