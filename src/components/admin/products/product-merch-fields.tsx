"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { getStoreIdentity } from "@/data/live/store-identity";
import { OLI_ARTICLES } from "@/data/oli-articles";
import { isVideoMedia, listCatalogProducts, releaseProductMedia, stageProductMedia } from "@/data/mock/catalog-session";
import { currencySymbol } from "@/lib/formatting/currency";
import { formatMoney } from "@/lib/formatting/money";
import { fitVideo, needsVideoFit, VideoFitError } from "@/lib/media/fit-video";
import type { ProductFaqTag, ProductPage, ProductPanel, ProductPanelLink } from "@/types/commerce";

const field = "h-9 w-full rounded-lg border border-[#d0d0d0] bg-white px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-[#9b9b9b] hover:border-[#a8a8a8] focus:border-[#303030] focus:shadow-[0_0_0_3px_rgba(48,48,48,.1)]";
const area = "block min-h-[92px] max-h-[520px] w-full resize-y rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition-[border-color,box-shadow] [field-sizing:content] placeholder:text-[#9b9b9b] hover:border-[#a8a8a8] focus:border-[#303030] focus:shadow-[0_0_0_3px_rgba(48,48,48,.1)]";
const card = "rounded-xl border border-[#d9d9d9] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.06)]";
const chip = "inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm transition-colors hover:border-[#8a8a8a] hover:bg-[#fafafa]";

type BundleDraft = { label: string; qty: string; price: string };

const PANEL_PRESETS = ["תיאור", "הוראות שימוש", "רשימת INCI מלאה"];
const FAQ_TOPICS: Array<{ id: ProductFaqTag; label: string }> = [
  { id: "use", label: "שימוש" },
  { id: "ing", label: "רכיבים" },
  { id: "post", label: "אחרי לידה" },
  { id: "buy", label: "רכישה" },
];
const STARTER_HIGHLIGHTS = ["ללא בישום", "ללא אלכוהול", "באישור משרד הבריאות", "100 ml"];
const EMPTY = "ריק, לא יופיע בעמוד";

function highlightKey(storeId: string) {
  return `storely-highlights:${storeId || "local"}`;
}

function rememberedHighlights() {
  const storeId = getStoreIdentity().storeId;
  let stored: unknown = [];
  if (typeof window !== "undefined") {
    try {
      stored = JSON.parse(window.localStorage.getItem(highlightKey(storeId)) || "[]");
    } catch {
      stored = [];
    }
  }
  const saved = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
  const used = listCatalogProducts().flatMap((product) => product.page?.highlights ?? []);
  return uniqueHighlights([...STARTER_HIGHLIGHTS, ...saved, ...used]);
}

function rememberHighlight(label: string) {
  const storeId = getStoreIdentity().storeId;
  const next = uniqueHighlights([...rememberedHighlights(), label]);
  try {
    window.localStorage.setItem(highlightKey(storeId), JSON.stringify(next));
  } catch {
    return;
  }
}

function uniqueHighlights(labels: string[]) {
  const seen = new Set<string>();
  const highlights: string[] = [];
  labels.forEach((label) => {
    const clean = label.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 40);
    const key = clean.toLocaleLowerCase("he");
    if (!clean || seen.has(key)) return;
    seen.add(key);
    highlights.push(clean);
  });
  return highlights;
}

function names(values: string[], none = EMPTY) {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  return filled.length ? filled.join(" · ") : none;
}

function nextBundle(bundles: BundleDraft[]): BundleDraft {
  const taken = new Set(bundles.map((bundle) => Number(bundle.qty)));
  let qty = 2;
  while (taken.has(qty) && qty < 99) qty += 1;
  return { label: "", qty: String(qty), price: "" };
}

export function ProductMerchFields({
  bundles,
  page,
  showPage,
  unitPrice,
  onBundles,
  onPage,
}: {
  bundles: BundleDraft[];
  page: ProductPage;
  showPage: boolean;
  unitPrice: number;
  onBundles: (bundles: BundleDraft[]) => void;
  onPage: (page: ProductPage) => void;
}) {
  const faqs = page.faqs ?? [];
  const highlights = page.highlights ?? [];

  return (
    <>
      <section className={`${card} flex flex-col gap-4`}>
        <div>
          <h2 className="m-0 text-[15px] font-semibold">באנדלים</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-secondary">כל באנדל מופיע בעמוד המוצר תחת «בחרי כמות», עם הכיתוב והמחיר שתקבעו.</p>
        </div>
        {bundles.length ? (
          <div className="flex flex-col gap-2.5">
            {bundles.map((bundle, index) => (
              <BundleCard
                key={index}
                bundle={bundle}
                unitPrice={unitPrice}
                duplicate={bundles.some((item, other) => other !== index && item.qty.trim() !== "" && item.qty === bundle.qty)}
                onChange={(partial) => updateBundle(index, partial)}
                onRemove={() => onBundles(bundles.filter((_, item) => item !== index))}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-xl border border-dashed border-[#d4d4d4] px-4 py-5 text-center text-[13px] leading-5 text-ink-secondary">
            עדיין אין באנדלים. אפשר להוסיף למשל «זוג במחיר מיוחד» או «מארז 3 יחידות».
          </p>
        )}
        <Add label="הוספת באנדל" onClick={() => onBundles([...bundles, nextBundle(bundles)])} />
      </section>

      {showPage ? (
        <section className="overflow-hidden rounded-xl border border-[#d9d9d9] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)]">
          <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
            <div>
              <h2 className="m-0 text-[15px] font-semibold">עמוד המוצר בחנות</h2>
              <p className="m-0 mt-1 text-[13px] text-ink-secondary">לחצו על אזור כדי לפתוח ולערוך אותו. אזור ריק לא יופיע בעמוד.</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-[#f4f6f8] px-3 py-2.5 text-[13px] leading-5 text-[#4a4a4a]">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[#616161]" />
              <span>הטקסט יופיע בחנות בדיוק כמו שכתבת: ירידת שורה נשארת ירידת שורה, ושורה ריקה יוצרת רווח בין פסקאות.</span>
            </div>
          </div>

          <Section title="מתחת לתיאור הראשון" hint="עד 4 סימונים בעמוד. במובייל מוצגים 3 הראשונים. סימון חדש נשמר, ואפשר להוסיף אותו בלחיצה גם למוצרים הבאים." status={names(highlights)} filled={highlights.length > 0}>
            <HighlightEditor page={page} onPage={onPage} />
          </Section>

          <Section title="מתחת לכפתור ההוספה לסל" hint="שורות שנפתחות בלחיצה: תיאור, הוראות שימוש, רשימת INCI, או כותרת משלך. לכל שורה אפשר ליישר את הטקסט לשמאל, ולשייך כמה קישורים ומאמרים מהאתר." status={names(page.panels.map((panel) => panel.title))} filled={page.panels.length > 0}>
            <ItemList<ProductPanel>
              items={page.panels}
              onChange={(panels) => onPage({ ...page, panels })}
              max={8}
              untitled="שורה בלי כותרת"
              empty="עדיין אין שורות. בחרו אחת מהאפשרויות למטה."
              summary={(panel) => ({ title: panel.title, sub: panel.body })}
              adds={[...PANEL_PRESETS.map((title) => ({ label: title, make: () => ({ title, body: "", ...(title === "רשימת INCI מלאה" ? { align: "left" as const } : {}) }) })), { label: "כותרת משלך", make: () => ({ title: "", body: "" }) }]}
              render={(panel, update) => (
                <>
                  <Field label="כותרת השורה">
                    <input value={panel.title} maxLength={80} onChange={(event) => update({ title: event.target.value })} placeholder="לדוגמה: הוראות שימוש" className={field} />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-[#303030]">יישור הטקסט</span>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={alignTab(panel.align !== "left")} onClick={() => update({ align: "right" })}>לימין</button>
                      <button type="button" className={alignTab(panel.align === "left")} onClick={() => update({ align: "left" })}>לשמאל</button>
                    </div>
                    <Field label="הטקסט שנפתח בלחיצה">
                      <TextArea value={panel.body} max={4000} rows={5} align={panel.align === "left" ? "left" : "right"} onChange={(body) => update({ body })} placeholder="כתבו כאן. אפשר לרדת שורה ולהשאיר שורה ריקה בין פסקאות." />
                    </Field>
                  </div>
                  <PanelLinksEditor links={panel.links ?? []} onChange={(links) => update({ links })} />
                </>
              )}
            />
          </Section>

          <Section title="אמהות משתמשות" hint="העלו סרטון של משפיענית. בלי סרטון האזור לא מופיע בעמוד." status={page.stories.length ? `${page.stories.length} ${page.stories.length === 1 ? "סרטון" : "סרטונים"}` : EMPTY} filled={page.stories.some((story) => story.url)}>
            <ItemList
              items={page.stories}
              onChange={(stories) => onPage({ ...page, stories })}
              onRemove={(story) => releaseStory(story.url)}
              max={20}
              untitled="סטורי בלי שם"
              empty="עדיין אין סרטונים."
              summary={(story) => ({ title: story.handle, sub: story.url ? "יש סרטון" : "חסר סרטון" })}
              adds={[{ label: "הוספת סטורי", make: () => ({ handle: "", url: "" }) }]}
              render={(story, update) => (
                <>
                  <Field label="שם המשפיענית">
                    <input value={story.handle} maxLength={80} onChange={(event) => update({ handle: event.target.value })} placeholder="@שם_משפיענית" className={field} />
                  </Field>
                  <StoryVideo story={story} onChange={(url) => update({ url })} />
                </>
              )}
            />
          </Section>

          <Section title="מתי להתחיל?" hint="כל שלב מופיע כנקודה על ציר הזמן, לפי הסדר." status={names(page.steps.map((step) => step.title))} filled={page.steps.length > 0}>
            <ItemList
              items={page.steps}
              onChange={(steps) => onPage({ ...page, steps })}
              max={8}
              untitled="שלב בלי שם"
              empty="עדיין אין שלבים."
              summary={(step) => ({ title: step.title, sub: step.body })}
              adds={[{ label: "הוספת שלב", make: () => ({ title: "", body: "" }) }]}
              render={(step, update) => (
                <>
                  <Field label="שם השלב">
                    <input value={step.title} maxLength={80} onChange={(event) => update({ title: event.target.value })} placeholder="לדוגמה: גילוי ההריון" className={field} />
                  </Field>
                  <Field label="מה כתוב בשלב">
                    <TextArea value={step.body} max={500} onChange={(body) => update({ body })} placeholder="לדוגמה: אפשר להתחיל למרוח כבר מהיום הראשון." />
                  </Field>
                </>
              )}
            />
          </Section>

          <Section title="רכיבי מפתח" hint="משפט פתיחה ליד הכותרת, ואחריו הרכיבים לפי הסדר." status={names(page.ingredients.map((item) => item.he || item.en))} filled={page.ingredients.length > 0}>
            <Field label="משפט פתיחה" hint="מופיע ליד הכותרת «רכיבי מפתח»">
              <TextArea value={page.ingredientsIntro} max={300} rows={2} onChange={(ingredientsIntro) => onPage({ ...page, ingredientsIntro })} placeholder="לדוגמה: ארבעה רכיבים טבעיים, שנבחרו בשיתוף רופאים וכימאים." />
            </Field>
            <ItemList
              items={page.ingredients}
              onChange={(ingredients) => onPage({ ...page, ingredients })}
              max={12}
              untitled="רכיב בלי שם"
              empty="עדיין אין רכיבים."
              summary={(item) => ({ title: [item.he, item.en].filter((part) => part.trim()).join(" · "), sub: item.body })}
              adds={[{ label: "הוספת רכיב", make: () => ({ en: "", he: "", body: "" }) }]}
              render={(item, update) => (
                <>
                  <div className="grid gap-3 min-[700px]:grid-cols-2">
                    <Field label="שם באנגלית" hint="מופיע בגדול">
                      <input dir="ltr" value={item.en} maxLength={40} onChange={(event) => update({ en: event.target.value })} placeholder="Jojoba Oil" className={`${field} text-end`} />
                    </Field>
                    <Field label="שם בעברית" hint="מופיע מתחת, בקטן">
                      <input value={item.he} maxLength={40} onChange={(event) => update({ he: event.target.value })} placeholder="שמן חוחובה" className={field} />
                    </Field>
                  </div>
                  <Field label="תיאור הרכיב">
                    <TextArea value={item.body} max={500} onChange={(body) => update({ body })} placeholder="לדוגמה: נספג בקלות, עשיר בויטמין E ואומגה 9." />
                  </Field>
                </>
              )}
            />
          </Section>

          <Section title="לקוחות ממליצות" hint="ההמלצה הראשונה מוצגת כציטוט גדול. אפשר לשנות סדר עם החצים." status={page.reviews.length ? names(page.reviews.map((review) => review.name)) : EMPTY} filled={page.reviews.length > 0}>
            <ItemList
              items={page.reviews}
              onChange={(reviews) => onPage({ ...page, reviews })}
              max={30}
              untitled="המלצה בלי שם"
              empty="עדיין אין המלצות."
              summary={(review) => ({ title: [review.name, review.title].filter((part) => part.trim()).join(" · "), sub: review.body })}
              adds={[{ label: "הוספת המלצה", make: () => ({ name: "", title: "", body: "", date: "", rating: 5, verified: false }) }]}
              render={(review, update) => (
                <>
                  <div className="grid gap-3 min-[700px]:grid-cols-2">
                    <Field label="שם">
                      <input value={review.name} maxLength={80} onChange={(event) => update({ name: event.target.value })} placeholder="לדוגמה: נועה" className={field} />
                    </Field>
                    <Field label="תאריך" hint="לא חובה">
                      <input value={review.date} maxLength={40} onChange={(event) => update({ date: event.target.value })} placeholder="22 ביוני" className={field} />
                    </Field>
                  </div>
                  <StarPicker value={review.rating} onChange={(rating) => update({ rating })} />
                  <Field label="כותרת קצרה" hint="לא חובה">
                    <input value={review.title} maxLength={120} onChange={(event) => update({ title: event.target.value })} placeholder="לדוגמה: אין לי אף סימן מתיחה" className={field} />
                  </Field>
                  <Field label="ההמלצה">
                    <TextArea value={review.body} max={1000} onChange={(body) => update({ body })} placeholder="מה הלקוחה כתבה" />
                  </Field>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={review.verified} onChange={(event) => update({ verified: event.target.checked })} className="size-4 accent-[#303030]" />
                      רכישה מאומתת
                    </label>
                    {review.verified ? <VerifiedCustomer /> : null}
                  </div>
                </>
              )}
            />
          </Section>

          <Section title="שאלות ותשובות" hint="כל שאלה מקבלת נושא, והנושאים מופיעים כסינון באתר." status={faqs.length ? `${faqs.length} ${faqs.length === 1 ? "שאלה" : "שאלות"}` : EMPTY} filled={faqs.length > 0}>
            <ItemList
              items={faqs}
              onChange={(next) => onPage({ ...page, faqs: next })}
              max={20}
              untitled="שאלה חדשה"
              empty="עדיין אין שאלות."
              summary={(item) => ({ title: item.q, sub: FAQ_TOPICS.find((topic) => topic.id === item.tag)?.label })}
              adds={[{ label: "הוספת שאלה", make: () => ({ q: "", a: "", tag: "use" as ProductFaqTag }) }]}
              render={(item, update) => (
                <>
                  <Field label="השאלה">
                    <input value={item.q} maxLength={180} onChange={(event) => update({ q: event.target.value })} placeholder="לדוגמה: מתי מתחילים למרוח?" className={field} />
                  </Field>
                  <Field label="התשובה">
                    <TextArea value={item.a} max={1000} onChange={(a) => update({ a })} placeholder="התשובה שתופיע בפתיחת השאלה" />
                  </Field>
                  <div>
                    <span className="mb-1.5 block text-[13px] font-semibold text-[#303030]">נושא</span>
                    <div className="flex flex-wrap gap-2">
                      {FAQ_TOPICS.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          aria-pressed={item.tag === topic.id}
                          className={`h-8 rounded-full border px-3 text-sm transition-colors ${item.tag === topic.id ? "border-[#303030] bg-[#303030] text-white" : "border-[#d4d4d4] bg-white hover:border-[#8a8a8a]"}`}
                          onClick={() => update({ tag: topic.id })}
                        >
                          {topic.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            />
          </Section>
        </section>
      ) : null}
    </>
  );

  function updateBundle(index: number, partial: Partial<BundleDraft>) {
    onBundles(bundles.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)));
  }
}

function BundleCard({ bundle, unitPrice, duplicate, onChange, onRemove }: { bundle: BundleDraft; unitPrice: number; duplicate: boolean; onChange: (partial: Partial<BundleDraft>) => void; onRemove: () => void }) {
  const qty = Number(bundle.qty);
  const price = Number(bundle.price);
  const validQty = Number.isInteger(qty) && qty >= 1 && qty <= 99;
  const validPrice = bundle.price.trim() !== "" && Number.isFinite(price) && price >= 0;
  const regular = unitPrice * qty;
  const saving = regular - price;
  const sample = qty === 1 ? "יחידה" : qty === 2 ? "זוג" : `מארז ${validQty ? qty : 3}`;

  let note: { text: string; tone: "good" | "warn" | "bad" | "muted" };
  if (!validQty) note = { text: "הכמות צריכה להיות מספר שלם בין 1 ל־99.", tone: "bad" };
  else if (duplicate) note = { text: `כבר יש באנדל של ${qty}. רק אחד מהם יופיע בעמוד.`, tone: "bad" };
  else if (!validPrice) note = { text: "חסר מחיר. בלי מחיר הבאנדל לא יופיע בעמוד.", tone: "muted" };
  else if (unitPrice > 0 && saving > 0.004) note = { text: `חיסכון של ${formatMoney(saving)} (${Math.round((saving / regular) * 100)}%) לעומת ${qty} יחידות במחיר רגיל · ${formatMoney(price / qty)} ליחידה`, tone: "good" };
  else if (unitPrice > 0 && saving < -0.004) note = { text: `יקר יותר מ־${qty} יחידות במחיר רגיל (${formatMoney(regular)}).`, tone: "warn" };
  else note = { text: `${formatMoney(price / qty)} ליחידה`, tone: "muted" };

  const tones = { good: "text-[#0c5132]", warn: "text-[#8a6116]", bad: "text-[#8e1f0b]", muted: "text-ink-secondary" };
  const dots = { good: "bg-[#29845a]", warn: "bg-[#e8a92e]", bad: "bg-[#e51c00]", muted: "bg-[#c4c4c4]" };
  const step = (delta: number) => onChange({ qty: String(Math.min(99, Math.max(1, (validQty ? qty : 1) + delta))) });

  return (
    <div className={`rounded-xl border bg-white p-3.5 transition-colors ${note.tone === "bad" ? "border-[#fdb5b0]" : "border-[#e3e3e3] hover:border-[#cfcfcf]"}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 min-[700px]:grid-cols-[minmax(0,1fr)_128px_148px_auto]">
        <div className="col-span-3 min-[700px]:col-span-1">
          <Field label="כיתוב" hint={`אם ריק יופיע «קנה ${validQty ? qty : 2}»`}>
            <input value={bundle.label} maxLength={80} onChange={(event) => onChange({ label: event.target.value })} placeholder={`לדוגמה: ${sample}`} className={field} />
          </Field>
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-[#303030]">כמות</span>
          <div dir="ltr" className="flex h-9 items-center overflow-hidden rounded-lg border border-[#d0d0d0] bg-white transition-[border-color,box-shadow] hover:border-[#a8a8a8] focus-within:border-[#303030] focus-within:shadow-[0_0_0_3px_rgba(48,48,48,.1)]">
            <button type="button" aria-label="פחות" disabled={validQty && qty <= 1} className="grid h-full w-9 shrink-0 place-items-center border-0 bg-transparent text-lg leading-none text-[#4a4a4a] transition-colors hover:bg-[#f4f4f4] disabled:opacity-30 disabled:hover:bg-transparent" onClick={() => step(-1)}>−</button>
            <input inputMode="numeric" aria-label="כמות" value={bundle.qty} onChange={(event) => onChange({ qty: event.target.value.replace(/\D/g, "").slice(0, 2) })} className="h-full w-full min-w-0 border-0 bg-transparent text-center text-sm font-semibold text-ink outline-none" />
            <button type="button" aria-label="יותר" disabled={validQty && qty >= 99} className="grid h-full w-9 shrink-0 place-items-center border-0 bg-transparent text-lg leading-none text-[#4a4a4a] transition-colors hover:bg-[#f4f4f4] disabled:opacity-30 disabled:hover:bg-transparent" onClick={() => step(1)}>+</button>
          </div>
        </div>
        <Field label="מחיר הבאנדל">
          <span dir="ltr" className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#8a8a8a]">{currencySymbol()}</span>
            <input inputMode="decimal" value={bundle.price} onChange={(event) => onChange({ price: event.target.value.replace(/[^\d.]/g, "") })} placeholder={unitPrice > 0 && validQty ? (unitPrice * qty).toFixed(2) : "0.00"} className={`${field} pl-8 font-semibold`} />
          </span>
        </Field>
        <IconButton label="מחיקת באנדל" danger onClick={onRemove}>
          <Icon name="trash" size={16} />
        </IconButton>
      </div>
      <div className={`mt-3 flex items-center gap-2 border-t border-[#f0f0f0] pt-2.5 text-[13px] ${tones[note.tone]}`}>
        <span className={`size-1.5 shrink-0 rounded-full ${dots[note.tone]}`} aria-hidden />
        {note.text}
      </div>
    </div>
  );
}

function Section({ title, hint, status, filled, children }: { title: string; hint: string; status: string; filled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-[#ebebeb]">
      <button type="button" aria-expanded={open} className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-3.5 text-start transition-colors hover:bg-[#fafafa]" onClick={() => setOpen((value) => !value)}>
        <span className={`size-2 shrink-0 rounded-full ${filled ? "bg-[#29845a]" : "bg-[#d4d4d4]"}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#1a1a1a]">{title}</span>
          <span className={`block truncate text-[13px] ${filled ? "text-[#4a4a4a]" : "text-[#8a8a8a]"}`}>{status}</span>
        </span>
        <Icon name="chevron" size={16} className={`shrink-0 text-[#616161] transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <p className="m-0 text-[13px] leading-5 text-ink-secondary">{hint}</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ItemList<T>({
  items,
  onChange,
  onRemove,
  summary,
  render,
  adds,
  max,
  untitled,
  empty,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  onRemove?: (item: T) => void;
  summary: (item: T) => { title: string; sub?: string };
  render: (item: T, update: (partial: Partial<T>) => void) => ReactNode;
  adds: Array<{ label: string; make: () => T }>;
  max: number;
  untitled: string;
  empty: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  function update(index: number, partial: Partial<T>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)));
  }

  function move(index: number, step: number) {
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    if (open === index) setOpen(target);
    else if (open === target) setOpen(index);
  }

  function remove(index: number) {
    onRemove?.(items[index]);
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
    if (open === index) setOpen(null);
    else if (open !== null && open > index) setOpen(open - 1);
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item, index) => {
            const { title, sub } = summary(item);
            const expanded = open === index;
            return (
              <li key={index} className={`rounded-xl border bg-white transition-shadow ${expanded ? "border-[#b5b5b5] shadow-[0_2px_10px_rgba(0,0,0,.06)]" : "border-[#e3e3e3] hover:border-[#cfcfcf]"}`}>
                <div className="flex items-center gap-0.5 pe-1.5">
                  <button type="button" aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent py-2.5 ps-3 text-start" onClick={() => setOpen(expanded ? null : index)}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f1f1f1] text-xs font-semibold text-[#616161]">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${title ? "text-[#1a1a1a]" : "text-[#8a8a8a]"}`}>{title || untitled}</span>
                      {sub && !expanded ? <span className="block truncate text-[13px] text-ink-secondary">{sub}</span> : null}
                    </span>
                  </button>
                  <IconButton label="הזזה למעלה" disabled={index === 0} onClick={() => move(index, -1)}>
                    <Icon name="chevron" size={16} className="rotate-90" />
                  </IconButton>
                  <IconButton label="הזזה למטה" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                    <Icon name="chevron" size={16} className="-rotate-90" />
                  </IconButton>
                  <IconButton label="מחיקה" danger onClick={() => remove(index)}>
                    <Icon name="trash" size={16} />
                  </IconButton>
                </div>
                {expanded ? (
                  <div className="flex flex-col gap-3 border-t border-[#ebebeb] p-3">
                    {render(item, (partial) => update(index, partial))}
                    <button type="button" className="self-end rounded-lg border border-[#d4d4d4] bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[#f7f7f7]" onClick={() => setOpen(null)}>סגירה</button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-[#d4d4d4] px-3 py-4 text-center text-[13px] text-ink-secondary">{empty}</p>
      )}
      {items.length < max ? (
        <div className="flex flex-wrap gap-2">
          {adds.map((option) => (
            <button
              key={option.label}
              type="button"
              className={chip}
              onClick={() => {
                onChange([...items, option.make()]);
                setOpen(items.length);
              }}
            >
              <Icon name="plus" size={14} strokeWidth={2} />
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-ink-secondary">הגעת למספר המקסימלי ({max}).</p>
      )}
    </div>
  );
}

function IconButton({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent transition-colors disabled:cursor-default disabled:opacity-25 ${danger ? "text-[#8a8a8a] hover:bg-[#fee9e8] hover:text-[#d72c0d]" : "text-[#616161] hover:bg-[#f1f1f1] disabled:hover:bg-transparent"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const rating = Number.isInteger(value) && value >= 1 && value <= 5 ? value : 5;
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-[#303030]">כוכבים</span>
      <div dir="ltr" className="flex w-fit gap-0.5" role="radiogroup" aria-label="דירוג כוכבים">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} מתוך 5`}
            className={`grid size-8 place-items-center border-0 bg-transparent text-[22px] leading-none transition-colors ${star <= rating ? "text-[#e0a100]" : "text-[#d0d0d0] hover:text-[#b9b9b9]"}`}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function VerifiedCustomer() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a1a1a]">
      <svg width="16" height="16" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
        <circle cx="11" cy="11" r="11" fill="#0095F6" />
        <path d="M6.2 11.3 9.4 14.5 15.8 7.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      לקוחה מאומתת
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-[#303030]">{label}</span>
        {hint ? <span className="text-xs text-ink-secondary">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function alignTab(active: boolean) {
  return `h-8 rounded-full border px-3 text-sm transition-colors ${active ? "border-[#303030] bg-white font-medium" : "border-[#d4d4d4] bg-transparent hover:border-[#8a8a8a]"}`;
}

function TextArea({ value, max, rows = 3, placeholder, align = "right", onChange }: { value: string; max: number; rows?: number; placeholder?: string; align?: "right" | "left"; onChange: (value: string) => void }) {
  const near = value.length > max * 0.85;
  return (
    <>
      <textarea value={value} maxLength={max} rows={rows} dir={align === "left" ? "ltr" : "rtl"} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={align === "left" ? `${area} text-left` : area} />
      <span className={`mt-1 block text-end text-xs ${near ? "text-[#b98900]" : "text-ink-secondary"}`}>
        {value.length} / {max}
      </span>
    </>
  );
}

function HighlightEditor({ page, onPage }: { page: ProductPage; onPage: (page: ProductPage) => void }) {
  const [draft, setDraft] = useState("");
  const selected = page.highlights ?? [];
  const library = rememberedHighlights().filter((label) => !selected.some((item) => item.toLocaleLowerCase("he") === label.toLocaleLowerCase("he")));
  const full = selected.length >= 4;

  function add(label: string) {
    const clean = label.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 40);
    if (!clean || selected.some((item) => item.toLocaleLowerCase("he") === clean.toLocaleLowerCase("he"))) return;
    rememberHighlight(clean);
    setDraft("");
    if (full) return;
    onPage({ ...page, highlights: [...selected, clean] });
  }

  return (
    <>
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-[#303030]">בעמוד ({selected.length} מתוך 4)</span>
        {selected.length ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((label) => (
              <button key={label} type="button" aria-label={`הסרת ${label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border-0 bg-[#303030] px-3 text-sm font-medium text-white transition-colors hover:bg-[#1a1a1a]" onClick={() => onPage({ ...page, highlights: selected.filter((item) => item !== label) })}>
                {label}
                <Icon name="close" size={12} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[13px] text-ink-secondary">עדיין לא נבחרו סימונים.</p>
        )}
      </div>
      {library.length ? (
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-[#303030]">סימונים שמורים</span>
          <div className="flex flex-wrap gap-2">
            {library.map((label) => (
              <button key={label} type="button" disabled={full} className={`${chip} disabled:opacity-40`} onClick={() => add(label)}>
                <Icon name="plus" size={14} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); add(draft); }}>
        <input value={draft} maxLength={40} onChange={(event) => setDraft(event.target.value)} placeholder="סימון חדש, למשל: ללא בישום" className={`${field} max-w-sm flex-1`} />
        <button type="submit" disabled={!draft.trim()} className="h-9 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white disabled:opacity-40">יצירה והוספה</button>
      </form>
      {full ? <p className="m-0 text-[13px] text-ink-secondary">אפשר עד 4 סימונים במוצר הזה.</p> : null}
    </>
  );
}

const PANEL_LINK_LIMIT = 6;

function PanelLinksEditor({ links, onChange }: { links: ProductPanelLink[]; onChange: (links: ProductPanelLink[]) => void }) {
  const [adding, setAdding] = useState<"url" | "article" | null>(null);
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [query, setQuery] = useState("");
  const [urlError, setUrlError] = useState("");
  const full = links.length >= PANEL_LINK_LIMIT;
  const articles = OLI_ARTICLES.filter((article) => {
    const needle = query.trim().toLocaleLowerCase("he");
    if (!needle) return true;
    return article.title.toLocaleLowerCase("he").includes(needle) || article.category.toLocaleLowerCase("he").includes(needle);
  }).slice(0, 8);
  const tab = (active: boolean) => `h-8 rounded-full border px-3 text-sm transition-colors ${active ? "border-[#303030] bg-white font-medium" : "border-[#d4d4d4] bg-transparent hover:border-[#8a8a8a]"}`;

  function resetDraft() {
    setAdding(null);
    setLabel("");
    setHref("");
    setQuery("");
    setUrlError("");
  }

  function add(link: ProductPanelLink) {
    if (full || links.some((item) => item.kind === link.kind && item.href === link.href)) return;
    onChange([...links, link]);
    resetDraft();
  }

  function move(index: number, step: number) {
    const target = index + step;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[#f7f7f7] p-3">
      <span className="text-[13px] font-semibold text-[#303030]">קישורים בתחתית <span className="font-normal text-ink-secondary">(לא חובה, עד {PANEL_LINK_LIMIT})</span></span>
      {links.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {links.map((link, index) => {
            const article = link.kind === "article" ? OLI_ARTICLES.find((item) => `/articles/${item.slug}` === link.href) : null;
            return (
              <li key={`${link.kind}:${link.href}:${index}`} className="flex items-center gap-2 rounded-xl border border-[#e3e3e3] bg-white px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-secondary">{link.kind === "article" ? (article?.category ?? "מאמר באתר") : "קישור"}</span>
                  <span className="block truncate text-sm font-semibold">{article?.title ?? link.label}</span>
                  {link.kind === "url" ? <span dir="ltr" className="block truncate text-end text-xs text-ink-secondary">{link.href}</span> : null}
                </span>
                <IconButton label="הזזה למעלה" disabled={index === 0} onClick={() => move(index, -1)}>
                  <Icon name="chevron" size={16} className="rotate-90" />
                </IconButton>
                <IconButton label="הזזה למטה" disabled={index === links.length - 1} onClick={() => move(index, 1)}>
                  <Icon name="chevron" size={16} className="-rotate-90" />
                </IconButton>
                <button type="button" className="shrink-0 text-sm font-semibold text-[#d72c0d]" onClick={() => onChange(links.filter((_, item) => item !== index))}>הסרה</button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 text-[13px] text-ink-secondary">עדיין אין קישורים בשורה הזאת.</p>
      )}
      {full ? <p className="m-0 text-[13px] text-ink-secondary">אפשר עד {PANEL_LINK_LIMIT} קישורים בשורה.</p> : null}
      {!full && adding === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tab(false)} onClick={() => setAdding("url")}>הוספת קישור</button>
          <button type="button" className={tab(false)} onClick={() => setAdding("article")}>הוספת מאמר מהאתר</button>
        </div>
      ) : null}
      {adding === "url" ? (
        <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const nextLabel = label.trim(); const nextHref = href.trim(); if (!nextLabel || !nextHref) return; if (!/^https:\/\/\S+$/i.test(nextHref) && !/^\/[^/\s]/.test(nextHref)) { setUrlError("הקישור צריך להתחיל ב-https:// או בנתיב באתר, למשל /articles/name"); return; } add({ kind: "url", label: nextLabel, href: nextHref }); }}>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="הטקסט שיופיע, למשל: לקריאה נוספת" className={field} />
          <input dir="ltr" value={href} onChange={(event) => { setHref(event.target.value); setUrlError(""); }} placeholder="https://" className={`${field} text-end`} />
          {urlError ? <p className="m-0 text-sm text-[#8e1f0b]">{urlError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!label.trim() || !href.trim()} className="h-8 rounded-lg border-0 bg-[#1a1a1a] px-3 text-sm font-semibold text-white disabled:opacity-40">הוספה</button>
            <button type="button" className={tab(false)} onClick={resetDraft}>ביטול</button>
          </div>
        </form>
      ) : null}
      {adding === "article" ? (
        <>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש כתבה לפי שם" className={field} />
          <div className="flex max-h-52 flex-col overflow-auto rounded-lg bg-white">
            {articles.map((article) => {
              const href = `/articles/${article.slug}`;
              const taken = links.some((link) => link.kind === "article" && link.href === href);
              return (
                <button key={article.slug} type="button" disabled={taken} className="border-0 border-b border-[#eee] bg-transparent px-3 py-2 text-start text-sm transition-colors last:border-b-0 hover:bg-[#fafafa] disabled:opacity-40" onClick={() => add({ kind: "article", label: article.title, href })}>
                  <span className="block text-xs text-ink-secondary">{article.category}</span>
                  {article.title}
                  {taken ? <span className="block text-xs text-ink-secondary">כבר משויך</span> : null}
                </button>
              );
            })}
            {articles.length === 0 ? <span className="px-3 py-2 text-sm text-ink-secondary">אין כתבה בשם הזה</span> : null}
          </div>
          <button type="button" className={`${tab(false)} w-fit`} onClick={resetDraft}>סיום</button>
        </>
      ) : null}
    </div>
  );
}

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function releaseStory(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:video/")) releaseProductMedia(url);
}

function StoryVideo({ story, onChange }: { story: ProductPage["stories"][number]; onChange: (url: string) => void }) {
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const video = isVideoMedia(story.url);

  async function pick(file: File) {
    if (file.type !== "video/mp4" && file.type !== "video/webm" && file.type !== "video/quicktime") {
      setError("אפשר להעלות סרטון mp4, webm או mov");
      return;
    }
    setError("");
    setNote("");
    const original = file.size;
    let ready = file;
    if (needsVideoFit(file)) {
      setProgress(0);
      try {
        ready = await fitVideo(file, setProgress);
      } catch (failure) {
        setError(failure instanceof VideoFitError ? failure.message : "כיווץ הסרטון נכשל.");
        return;
      } finally {
        setProgress(null);
      }
      setNote(`הסרטון כווץ מ־${megabytes(original)} ל־${megabytes(ready.size)}.`);
    }
    const url = URL.createObjectURL(ready);
    releaseStory(story.url);
    stageProductMedia(url, ready);
    onChange(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-[#303030]">סרטון</span>
        <span className="text-xs text-ink-secondary">סרטון מעל 50MB יכווץ אוטומטית</span>
      </span>
      {video ? (
        <video src={story.url} muted playsInline controls className="h-56 w-32 rounded-xl bg-[#f3e6de] object-cover" />
      ) : story.url ? (
        <p className="m-0 text-sm text-ink-secondary">יש כאן קישור ישן. העלאת סרטון תחליף אותו.</p>
      ) : null}
      {progress !== null ? (
        <div className="flex max-w-sm flex-col gap-1.5 rounded-xl border border-[#e3e3e3] bg-[#fafafa] p-3">
          <span className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-[#303030]">מכווץ את הסרטון…</span>
            <span className="text-ink-secondary">{Math.round(progress * 100)}%</span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-[#e6e6e6]">
            <span className="block h-full rounded-full bg-[#303030] transition-[width] duration-300" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </span>
          <span className="text-xs text-ink-secondary">זה יכול לקחת דקה או שתיים. השאירו את הדף פתוח.</span>
        </div>
      ) : (
        <label className={`${chip} w-fit cursor-pointer`}>
          <Icon name="plus" size={14} strokeWidth={2} />
          {video || story.url ? "החלפת סרטון" : "העלאת סרטון"}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void pick(file);
            }}
          />
        </label>
      )}
      {note ? <p className="m-0 text-[13px] text-[#0c5132]">{note}</p> : null}
      {error ? <p className="m-0 text-sm text-[#8e1f0b]">{error}</p> : null}
    </div>
  );
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={`${chip} h-9 w-fit`} onClick={onClick}>
      <Icon name="plus" size={14} strokeWidth={2} />
      {label}
    </button>
  );
}
