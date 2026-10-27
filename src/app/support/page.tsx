import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "תמיכה",
  description: "תמיכה באפליקציית Storely. Support for the Storely app.",
};

const operator = {
  nameHe: "אדיר בוקובזה",
  nameEn: "Adir Bokobza",
  email: "bokobzadir@gmail.com",
};

const topics = [
  "התחברות לחשבון, סיסמה או אין גישה לחנות",
  "מוצרים, מלאי, תמונות ותוכן החנות",
  "הזמנות ולקוחות שלא מוצגים או שלא מתעדכנים",
  "בקשה לראות, לתקן או למחוק מידע מהחשבון",
];

const topicsEn = [
  "Signing in, your password, or access to the store",
  "Products, inventory, photos, and store content",
  "Orders or customers that are missing or not updating",
  "A request to see, correct, or delete information from the account",
];

export default function SupportPage() {
  return (
    <main className="min-h-dvh bg-[#fafafa] text-[#1a1a1a]">
      <div className="mx-auto max-w-[720px] px-6 py-12 sm:py-16">
        <p className="m-0 text-sm font-semibold tracking-wide text-[#616161]">Storely</p>
        <nav className="mt-4 flex gap-4 text-sm" aria-label="שפה">
          <a href="#he" className="text-[#005bd3] underline">
            עברית
          </a>
          <a href="#en" className="text-[#005bd3] underline" dir="ltr">
            English
          </a>
        </nav>

        <article id="he" lang="he" className="mt-10 scroll-mt-8">
          <h1 className="m-0 text-[28px] font-bold leading-tight">תמיכה ב־Storely</h1>
          <p className="mt-6 text-[16px] leading-7">
            Storely היא האפליקציה לניהול החנות מהטלפון. כאן אפשר לקבל עזרה על התחברות, גישה לחנות, מוצרים, הזמנות, לקוחות ותמונות.
          </p>
          <p className="mt-4 text-[16px] leading-7">
            המפעיל הוא {operator.nameHe}. לפנייה כותבים אל <Mail />. במייל מציינים את שם החנות, את כתובת האימייל שאיתה נכנסים לאפליקציה, ואת תיאור הבעיה.
          </p>
          <p className="mt-4 text-[16px] leading-7">אפשר לפנות אלינו על:</p>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-[16px] leading-7">
            {topics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-7">
            התשובה נשלחת לאותו אימייל. אם הפנייה היא על לקוח של החנות, בעל החנות הוא הכתובת הראשונה, כי הרשומות האלה מנוהלות בחנות שלו.
          </p>
          <p className="mt-4 text-[16px] leading-7">
            <Link href="/privacy" className="text-[#005bd3] underline">
              מדיניות הפרטיות
            </Link>{" "}
            נמצאת בעמוד נפרד.
          </p>
        </article>

        <article id="en" lang="en" dir="ltr" className="mt-16 scroll-mt-8 border-t border-[#e3e3e3] pt-16 text-left">
          <h1 className="m-0 text-[28px] font-bold leading-tight">Storely Support</h1>
          <p className="mt-6 text-[16px] leading-7">
            Storely is the app for managing your store from your phone. This page is for help with sign-in, store access, products, orders, customers, and photos.
          </p>
          <p className="mt-4 text-[16px] leading-7">
            The app is operated by {operator.nameEn}. Email <Mail />. Include the store name, the email address you use to sign in, and a description of the problem.
          </p>
          <p className="mt-4 text-[16px] leading-7">You can contact us about:</p>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-[16px] leading-7">
            {topicsEn.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-7">
            We reply to that same email. If the request is about a customer of the store, the store owner is the first contact, because those records are managed in that store.
          </p>
          <p className="mt-4 text-[16px] leading-7">
            The{" "}
            <Link href="/privacy" className="text-[#005bd3] underline">
              privacy policy
            </Link>{" "}
            is on a separate page.
          </p>
        </article>
      </div>
    </main>
  );
}

function Mail() {
  return (
    <a href={`mailto:${operator.email}`} dir="ltr" className="text-[#005bd3] underline">
      {operator.email}
    </a>
  );
}
