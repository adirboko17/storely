import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description: "מדיניות הפרטיות של אפליקציית Storely. Privacy policy for the Storely app.",
};

const operator = {
  nameHe: "אדיר בוקובזה",
  nameEn: "Adir Bokobza",
  email: "bokobzadir@gmail.com",
};

const kept = ["שם", "כתובת אימייל", "מספר טלפון", "כתובת פיזית, כשהיא מוזנת בחנות, בהזמנה או אצל לקוח", "תמונות שהועלו למוצרים, ללוגו או לתוכן החנות", "מזהה משתמש של החשבון"];

const keptEn = [
  "Name",
  "Email address",
  "Phone number",
  "Physical address, when it is entered for the store, an order, or a customer",
  "Photos uploaded for products, the logo, or store content",
  "A user ID for the account",
];

export default function PrivacyPolicyPage() {
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
          <h1 className="m-0 text-[28px] font-bold leading-tight">מדיניות פרטיות של אפליקציית Storely</h1>
          <p className="mt-3 text-sm text-[#616161]">עודכן לאחרונה: 27 באוקטובר 2026</p>
          <p className="mt-6 text-[16px] leading-7">
            מדיניות זו מסבירה איך אפליקציית Storely לניהול חנות אוספת מידע, למה הוא נשמר, ומה אפשר לבקש לגביו. המפעיל של האפליקציה הוא {operator.nameHe}, ואפשר לפנות אליו בכתובת <Mail />.
          </p>
          <p className="mt-4 text-[16px] leading-7">האפליקציה מיועדת לבעלי חנות ולצוות שלהם. היא לא מיועדת לילדים מתחת לגיל 13, ואנחנו לא אוספים ביודעין מידע מילדים.</p>

          <h2 className="mt-10 text-xl font-bold">איזה מידע נשמר</h2>
          <p className="mt-3 text-[16px] leading-7">כדי להפעיל את החשבון ואת ניהול החנות, נשמרים:</p>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-[16px] leading-7">
            {kept.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-7">המידע הזה מגיע מההרשמה ומההתחברות, ממה שמזינים באפליקציה, ומהרשומות של החנות: מוצרים, הזמנות, לקוחות, אנשי צוות ותוכן.</p>
          <p className="mt-4 text-[16px] leading-7">פרטי כרטיס אשראי לא מוזנים באפליקציה ולא נשמרים בה. תשלום של לקוח קורה באתר החנות.</p>
          <p className="mt-4 text-[16px] leading-7">המיקום בצפייה החיה משמש רק להצגת הגלובוס על המכשיר. הוא לא נשלח לשרת ולא נשמר אצלנו.</p>

          <h2 className="mt-10 text-xl font-bold">למה המידע משמש</h2>
          <p className="mt-3 text-[16px] leading-7">המידע משמש להפעלת האפליקציה: התחברות, אבטחת החשבון, ניהול החנות, מוצרים, הזמנות, לקוחות, תמונות וצוות. הוא לא משמש לפרסום, לא נמכר, ולא משמש למעקב פרסומי בין אפליקציות או אתרים.</p>
          <p className="mt-4 text-[16px] leading-7">השם, האימייל, הטלפון, הכתובת, התמונות ומזהה המשתמש שמורים יחד עם החשבון והחנות, ולכן הם מקושרים לזהות המשתמש.</p>

          <h2 className="mt-10 text-xl font-bold">איפה המידע נשמר</h2>
          <p className="mt-3 text-[16px] leading-7">המידע נשמר בשרתים שמשמשים אותנו להפעלת Storely. השרתים עשויים להיות מחוץ למדינה של המשתמש. הגישה אליהם מוגבלת למי שצריך אותה כדי להפעיל את השירות ולתמוך בחנות.</p>

          <h2 className="mt-10 text-xl font-bold">כמה זמן המידע נשמר</h2>
          <p className="mt-3 text-[16px] leading-7">המידע נשמר כל עוד החשבון או החנות פעילים, וככל שצריך כדי להפעיל את השירות, לקיים חובה בחוק, או לטפל במחלוקת. אחרי מחיקת חשבון או בקשת מחיקה, המידע נמחק או הופך לבלתי מזוהה, אלא אם החוק מחייב להשאיר חלק ממנו.</p>

          <h2 className="mt-10 text-xl font-bold">בקשות על המידע</h2>
          <p className="mt-3 text-[16px] leading-7">
            אפשר לבקש לראות את המידע, לתקן אותו או למחוק אותו. פונים אל <Mail /> מהאימייל של החשבון, ומציינים את שם החנות. אם הבקשה נוגעת ללקוח של החנות, בעל החנות הוא הכתובת הראשונה, כי הרשומות האלה מנוהלות בחנות שלו.
          </p>

          <h2 className="mt-10 text-xl font-bold">אבטחה</h2>
          <p className="mt-3 text-[16px] leading-7">הגישה לחשבון מוגנת בסיסמה, והתעבורה אל השרת מוצפנת. אף שיטה לא מבטיחה אבטחה מוחלטת.</p>

          <h2 className="mt-10 text-xl font-bold">שינויים</h2>
          <p className="mt-3 text-[16px] leading-7">אם המדיניות תשתנה, הגרסה המעודכנת תפורסם בעמוד הזה עם תאריך חדש. המשך שימוש באפליקציה אחרי העדכון הוא הסכמה לנוסח המעודכן.</p>
        </article>

        <article id="en" lang="en" dir="ltr" className="mt-16 scroll-mt-8 border-t border-[#e3e3e3] pt-16 text-left">
          <h1 className="m-0 text-[28px] font-bold leading-tight">Storely App Privacy Policy</h1>
          <p className="mt-3 text-sm text-[#616161]">Last updated: 27 October 2026</p>
          <p className="mt-6 text-[16px] leading-7">
            This policy explains how the Storely store-management app collects information, why it is kept, and what you can ask us to do with it. The app is operated by {operator.nameEn}. Contact: <Mail />.
          </p>
          <p className="mt-4 text-[16px] leading-7">The app is for store owners and their staff. It is not directed at children under 13, and we do not knowingly collect information from children.</p>

          <h2 className="mt-10 text-xl font-bold">Information we keep</h2>
          <p className="mt-3 text-[16px] leading-7">To run your account and your store, we keep:</p>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-[16px] leading-7">
            {keptEn.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-7">This information comes from sign-up and sign-in, from what you enter in the app, and from store records: products, orders, customers, staff, and content.</p>
          <p className="mt-4 text-[16px] leading-7">Card numbers are not entered in the app and are not stored there. A customer’s payment happens on the store website.</p>
          <p className="mt-4 text-[16px] leading-7">Location in the live view is used only to show the globe on the device. It is not sent to our server and is not stored by us.</p>

          <h2 className="mt-10 text-xl font-bold">Why we use it</h2>
          <p className="mt-3 text-[16px] leading-7">We use this information to operate the app: sign-in, account security, and managing the store, products, orders, customers, photos, and staff. We do not use it for advertising. We do not sell it. We do not use it to track you across other apps or websites.</p>
          <p className="mt-4 text-[16px] leading-7">Name, email, phone number, address, photos, and user ID are stored with the account and the store, so they are linked to the user’s identity.</p>

          <h2 className="mt-10 text-xl font-bold">Where it is stored</h2>
          <p className="mt-3 text-[16px] leading-7">Information is stored on servers we use to operate Storely. Those servers may be outside your country. Access is limited to people who need it to run the service and support the store.</p>

          <h2 className="mt-10 text-xl font-bold">How long we keep it</h2>
          <p className="mt-3 text-[16px] leading-7">We keep information while the account or store is active, and for as long as needed to operate the service, meet a legal duty, or handle a dispute. After an account is deleted, or after a deletion request, we delete the information or remove what identifies you, unless the law requires us to keep part of it.</p>

          <h2 className="mt-10 text-xl font-bold">Requests about your information</h2>
          <p className="mt-3 text-[16px] leading-7">
            You can ask to see your information, correct it, or delete it. Email <Mail /> from the account email address and include the store name. If a request is about a customer of the store, the store owner is the first contact, because those records are managed in that store.
          </p>

          <h2 className="mt-10 text-xl font-bold">Security</h2>
          <p className="mt-3 text-[16px] leading-7">Account access is protected by a password, and traffic to the server is encrypted. No method can guarantee absolute security.</p>

          <h2 className="mt-10 text-xl font-bold">Changes</h2>
          <p className="mt-3 text-[16px] leading-7">If this policy changes, the updated version will be published on this page with a new date. Continuing to use the app after an update means you accept the updated policy.</p>
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
