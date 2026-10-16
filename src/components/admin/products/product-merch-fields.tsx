"use client";

import type { ReactNode } from "react";
import type { ProductPage } from "@/types/commerce";

const field = "h-[34px] w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm text-ink outline-none";
const area = "w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3 py-2 text-sm text-ink outline-none";
const card = "rounded-xl border border-[#d9d9d9] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.06)]";

type BundleDraft = { qty: string; price: string };

const PANEL_PRESETS = ["תיאור", "הוראות שימוש", "רשימת INCI מלאה"];

export function ProductMerchFields({
  bundles,
  page,
  showPage,
  onBundles,
  onPage,
}: {
  bundles: BundleDraft[];
  page: ProductPage;
  showPage: boolean;
  onBundles: (bundles: BundleDraft[]) => void;
  onPage: (page: ProductPage) => void;
}) {
  return (
    <>
      <section className={`${card} flex flex-col gap-3`}>
        <div>
          <h2 className="m-0 text-[15px] font-semibold">באנדלים</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-secondary">קנה כמות במחיר אחד. לדוגמה: קנה 1 ב־129, קנה 2 ב־240.</p>
        </div>
        {bundles.map((bundle, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label>
              <span className="mb-1.5 block text-sm font-semibold">כמות</span>
              <input dir="ltr" inputMode="numeric" value={bundle.qty} onChange={(event) => updateBundle(index, { qty: event.target.value })} className={`${field} text-end`} />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold">מחיר</span>
              <input dir="ltr" inputMode="decimal" value={bundle.price} onChange={(event) => updateBundle(index, { price: event.target.value })} className={`${field} text-end`} />
            </label>
            <button type="button" className="h-[34px] rounded-lg border-0 bg-transparent px-2 text-sm font-semibold text-[#d72c0d]" onClick={() => onBundles(bundles.filter((_, item) => item !== index))}>הסרה</button>
          </div>
        ))}
        <button type="button" className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" onClick={() => onBundles([...bundles, { qty: String(bundles.length + 1), price: "" }])}>
          <span className="grid size-5 place-items-center rounded-full border border-[#8a8a8a]">+</span>
          הוספת באנדל
        </button>
      </section>

      {showPage ? (
        <section className={`${card} flex flex-col gap-5`}>
          <div>
            <h2 className="m-0 text-[15px] font-semibold">עמוד המוצר בחנות</h2>
            <p className="m-0 mt-1 text-[13px] text-ink-secondary">אזור שלא מולא לא יופיע בעמוד המוצר.</p>
          </div>

          <Block title="מתחת לכפתור ההוספה לסל" hint="תיאור, הוראות שימוש, רשימת INCI, או כותרת משלך.">
            {page.panels.map((panel, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border border-[#e3e3e3] p-3">
                <input value={panel.title} onChange={(event) => updatePanel(index, { title: event.target.value })} placeholder="כותרת" className={field} />
                <textarea value={panel.body} onChange={(event) => updatePanel(index, { body: event.target.value })} rows={4} placeholder="הטקסט שיופיע כשפותחים את השורה" className={area} />
                <button type="button" className="self-start text-sm font-semibold text-[#d72c0d]" onClick={() => onPage({ ...page, panels: page.panels.filter((_, item) => item !== index) })}>הסרה</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {PANEL_PRESETS.map((title) => (
                <button key={title} type="button" className="h-8 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" onClick={() => onPage({ ...page, panels: [...page.panels, { title, body: "" }] })}>+ {title}</button>
              ))}
              <button type="button" className="h-8 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" onClick={() => onPage({ ...page, panels: [...page.panels, { title: "", body: "" }] })}>+ מותאם אישית</button>
            </div>
          </Block>

          <Block title="אמהות משתמשות" hint="סטורי של משפיענית ותיוג לעמוד האינסטגרם שלה.">
            {page.stories.map((story, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-[#e3e3e3] p-3">
                <input value={story.handle} onChange={(event) => updateStory(index, { handle: event.target.value })} placeholder="@שם_משפיענית" className={field} />
                <input dir="ltr" value={story.url} onChange={(event) => updateStory(index, { url: event.target.value })} placeholder="https://instagram.com/..." className={`${field} text-end`} />
                <button type="button" className="self-start text-sm font-semibold text-[#d72c0d]" onClick={() => onPage({ ...page, stories: page.stories.filter((_, item) => item !== index) })}>הסרה</button>
              </div>
            ))}
            <Add label="הוספת סטורי" onClick={() => onPage({ ...page, stories: [...page.stories, { handle: "", url: "" }] })} />
          </Block>

          <Block title="מתי להתחיל?" hint="כל שורה היא שלב על ציר הזמן.">
            {page.steps.map((step, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border border-[#e3e3e3] p-3">
                <input value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} placeholder="לדוגמה: גילוי ההריון" className={field} />
                <textarea value={step.body} onChange={(event) => updateStep(index, { body: event.target.value })} rows={3} placeholder="מה כתוב בשלב הזה" className={area} />
                <button type="button" className="self-start text-sm font-semibold text-[#d72c0d]" onClick={() => onPage({ ...page, steps: page.steps.filter((_, item) => item !== index) })}>הסרה</button>
              </div>
            ))}
            <Add label="הוספת שלב" onClick={() => onPage({ ...page, steps: [...page.steps, { title: "", body: "" }] })} />
          </Block>

          <Block title="רכיבי מפתח" hint="אפשר להוסיף ולהסיר רכיבים.">
            <textarea value={page.ingredientsIntro} onChange={(event) => onPage({ ...page, ingredientsIntro: event.target.value })} rows={2} placeholder="משפט קצר ליד הכותרת" className={area} />
            {page.ingredients.map((item, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border border-[#e3e3e3] p-3">
                <div className="grid gap-2 min-[700px]:grid-cols-2">
                  <input dir="ltr" value={item.en} onChange={(event) => updateIngredient(index, { en: event.target.value })} placeholder="Jojoba" className={`${field} text-end`} />
                  <input value={item.he} onChange={(event) => updateIngredient(index, { he: event.target.value })} placeholder="שמן חוחובה" className={field} />
                </div>
                <textarea value={item.body} onChange={(event) => updateIngredient(index, { body: event.target.value })} rows={3} placeholder="תיאור הרכיב" className={area} />
                <button type="button" className="self-start text-sm font-semibold text-[#d72c0d]" onClick={() => onPage({ ...page, ingredients: page.ingredients.filter((_, entry) => entry !== index) })}>הסרה</button>
              </div>
            ))}
            <Add label="הוספת רכיב" onClick={() => onPage({ ...page, ingredients: [...page.ingredients, { en: "", he: "", body: "" }] })} />
          </Block>

          <Block title="לקוחות ממליצות" hint="ההמלצה הראשונה מוצגת כציטוט גדול.">
            {page.reviews.map((review, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border border-[#e3e3e3] p-3">
                <div className="grid gap-2 min-[700px]:grid-cols-2">
                  <input value={review.name} onChange={(event) => updateReview(index, { name: event.target.value })} placeholder="שם" className={field} />
                  <input value={review.date} onChange={(event) => updateReview(index, { date: event.target.value })} placeholder="22 ביוני" className={field} />
                </div>
                <input value={review.title} onChange={(event) => updateReview(index, { title: event.target.value })} placeholder="כותרת קצרה" className={field} />
                <textarea value={review.body} onChange={(event) => updateReview(index, { body: event.target.value })} rows={3} placeholder="ההמלצה" className={area} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={review.verified} onChange={(event) => updateReview(index, { verified: event.target.checked })} className="size-4 accent-[#303030]" />רכישה מאומתת</label>
                <button type="button" className="self-start text-sm font-semibold text-[#d72c0d]" onClick={() => onPage({ ...page, reviews: page.reviews.filter((_, item) => item !== index) })}>הסרה</button>
              </div>
            ))}
            <Add label="הוספת המלצה" onClick={() => onPage({ ...page, reviews: [...page.reviews, { name: "", title: "", body: "", date: "", verified: false }] })} />
          </Block>
        </section>
      ) : null}
    </>
  );

  function updateBundle(index: number, partial: Partial<BundleDraft>) {
    onBundles(bundles.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)));
  }

  function updatePanel(index: number, partial: Partial<ProductPage["panels"][number]>) {
    onPage({ ...page, panels: page.panels.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)) });
  }

  function updateStory(index: number, partial: Partial<ProductPage["stories"][number]>) {
    onPage({ ...page, stories: page.stories.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)) });
  }

  function updateStep(index: number, partial: Partial<ProductPage["steps"][number]>) {
    onPage({ ...page, steps: page.steps.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)) });
  }

  function updateIngredient(index: number, partial: Partial<ProductPage["ingredients"][number]>) {
    onPage({ ...page, ingredients: page.ingredients.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)) });
  }

  function updateReview(index: number, partial: Partial<ProductPage["reviews"][number]>) {
    onPage({ ...page, reviews: page.reviews.map((item, itemIndex) => (itemIndex === index ? { ...item, ...partial } : item)) });
  }
}

function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-[#ebebeb] pt-4">
      <div>
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        <p className="m-0 mt-1 text-[13px] text-ink-secondary">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#d4d4d4] bg-white px-3 text-sm" onClick={onClick}>
      <span className="grid size-5 place-items-center rounded-full border border-[#8a8a8a]">+</span>
      {label}
    </button>
  );
}
