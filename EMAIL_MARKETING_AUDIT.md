# ביקורת Email Marketing — Storely

תאריך ביקורת: 16 באוקטובר 2026.  
היקף: קריאת קוד, migrations, וסכמה חיה ב-Supabase. לא שונה קוד, לא שונתה סכמה, ולא נשלח מייל.

מקרא סטטוסים:

- **FULLY IMPLEMENTED** — המסך, השרת והנתונים עושים את הפעולה מקצה לקצה.
- **PARTIALLY IMPLEMENTED** — חלק מהשרשרת קיים ועובד, אבל חסר שלב שמכריע אם הפיצ'ר באמת רץ.
- **UI ONLY** — יש מסך, כפתור או שדה, בלי אפקט אמיתי מעבר ל-toast או לזיכרון מקומי שלא מניע שליחה.
- **NOT IMPLEMENTED** — אין מימוש.
- **NOT VERIFIED** — לא ניתן לאשר מהקוד או מהמסד.

הסכמה החיה אומתה בקריאה בלבד. ספירות בזמן הביקורת: 3 חנויות, 3 שורות `store_settings`, שורה אחת עם מפתחות `flows` ו-`emails` ב-`marketing`, 0 שורות ב-`private.store_messaging`, 0 לקוחות, 0 הזמנות, 0 `checkout_drafts`, 0 `audit_logs`, 15 אירועי חנות (`page_view` 13, `add_to_cart` 2). לא נחשפו מפתחות, כתובות שולח, או רשומות לקוח.

---

## 1. Overall Architecture

מודול השיווק אינו שירות שליחה נפרד. הוא עורך הגדרות שנשמר כ-JSON בתוך החנות, בתוספת כרטיס חיבור ספקים שרק מנהל הפלטפורמה רואה.

### מבנה

| שכבה | תפקיד | קבצים |
| --- | --- | --- |
| דפים | ניתוב בלבד | `src/app/admin/marketing/**` |
| מסכים | כל ה-UI | `src/components/admin/marketing/**` |
| מצב לקוח | singleton בזיכרון הדפדפן, ואז שמירה | `src/data/mock/marketing-session.ts` |
| הידרציה | טעינת snapshot של החנות אל הזיכרון | `src/data/live/apply-store.ts` (`applyStoreSnapshot`) |
| כתיבה | RPC עם `target_store` | `src/data/live/write.ts` (`writeStore`) |
| אחסון הגדרות | `public.store_settings.marketing jsonb` | `save_store_sections` ב-`supabase/migrations/20261014180000_store_commerce_connection.sql` |
| ספקי שליחה | מפתחות פרטיים, בלי שליחה | `private.store_messaging`, `src/app/platform/actions.ts` |
| מדיה | העלאת תמונות למייל | `src/data/live/email-media.ts`, bucket `email-media` |
| קהל משוער | ספירה מקומית של לקוחות והזמנות שכבר נטענו | `src/data/mock/trigger-audience.ts` |

`marketing-session.ts` יושב תחת `src/data/mock`, אבל `publish()` קורא ל-`writeStore("save_store_sections", …)` אחרי כל שינוי. הנתונים אינם mock קבוע אחרי שהחנות נטענה. הם JSON אמיתי של אותה חנות. ה-seed של התבניות כן קבוע בקוד (`TEMPLATES`).

### נתיבים

הניווט מוגדר ב-`src/lib/navigation/nav.ts`, מפתח `marketing`:

| נתיב | מסך | כותרת |
| --- | --- | --- |
| `/admin/marketing/integrations` | `IntegrationsScreen` | אינטגרציות |
| `/admin/marketing/emails` | `EmailsScreen` | מיילים ו-SMS |
| `/admin/marketing/emails/[id]` | `EmailEditorScreen` | מייל |
| `/admin/marketing/sms/[id]` | `SmsEditorScreen` | SMS |
| `/admin/marketing/automations` | `AutomationsScreen` | אוטומציות |
| `/admin/marketing/automations/[id]` | `AutomationEditorScreen` | אוטומציה |

פרמטר `?from=` בעורך המייל מחזיר אל האוטומציה (`email-editor-screen.tsx`, `back`).

אין נתיב ציבורי של unsubscribe, אין webhook של ספק, ואין route של שליחת קמפיין.

### חיבור ל-Supabase

1. `store_admin_snapshot(target_store)` מחזיר את `settings.marketing` יחד עם לקוחות, הזמנות וקופות (`store_commerce_connection.sql`, בסביבות שורה 1255).
2. `applyStoreSnapshot` מפרק את ה-JSON דרך `parseEmails`, `parseSms`, `absorbLegacyEmails`, ואז `replaceMarketing`.
3. כל שמירה כותבת את כל אובייקט השיווק: `connected`, `flows`, `emails`, `sms`.
4. `loadStoreMessaging` ב-`src/app/admin/traffic.ts` קורא ל-`store_messaging_status` ומעביר סטטוס בלבד למסך האוטומציות. המפתח לא מגיע לדפדפן.

### בידוד בין חנויות

ההגדרות יושבות בשורה של `store_settings` לפי `store_id`. ה-RPC בודק `private.can_manage_store(target_store)` לפני כתיבה. אירועי החנות והקופות גם הם עם `store_id`.

הזיכרון בדפדפן הוא singleton אחד (`current` ב-`marketing-session.ts`). החלפת חנות תלויה ב-`claimStore` ואז `replaceMarketing`. אין מפתח store בתוך אובייקט ה-flow עצמו. אם הידרציה של חנות אחרת נכשלת באמצע, המצב הישן נשאר במודול. זה סיכון של בלבול בממשק, לא של דליפת SQL בין חנויות.

`can_manage_store` (`store_admin_snapshot.sql`) מאשר כל חבר פעיל בחנות, או מפעיל פלטפורמה עם `platform.stores.read`. הוא לא בודק `marketing.read`. הרשאת `marketing.read` חוסמת רק את הנתיב ב-UI (`src/platform/access.ts`, `canOpenAdminPath`).

### ספקים חיצוניים

| ספק | מה מחובר | מה לא מחובר |
| --- | --- | --- |
| Resend | שמירת API key, כתובת שולח ושם; בדיקת דומיין דרך `GET https://api.resend.com/domains` ב-`checkStoreEmail` | אין `emails.send`, אין webhook, אין תור |
| Pulseem | שמירת משתמש, סיסמה ומספר שולח ל-SMS | אין קריאת API שליחה בקוד האפליקציה |
| Google Fonts | טעינת פונטים עבריים בתצוגת העורך בלבד (`email-preview.tsx`) | לא מוטמעים ב-HTML מייל |
| Meta / GA4 / GTM / Google Ads / TikTok / Clarity | טופס שמירת מזהה בתוך אותו JSON | אין הזרקה לחנות. `connectedIntegrations` נקרא רק מ-`integrations-screen.tsx` |

### נתונים אמיתיים מול תצוגה

אמיתי ונשמר: גוף המייל (בלוקים), נושא, תצוגה מקדימה, flows, דגלי הפעלה, תנאי הפיצול, מזהי אינטגרציה, תמונות ב-Storage, דגל `customers.subscribed`, דגל `checkout_drafts.reminded`.

מחושב במסך מנתוני מסחר שנטענו: `triggerAudienceCount`.

תצוגה בלי מקור אירועים: עמודות נשלחו / פתיחה / הקלקה / הכנסות. `Flow.stats` נוצר תמיד `null` ב-`createFlow`. אין קוד שכותב סטטיסטיקה.

Toast בלי פעולה: שליחת בדיקה, הגדרות שליחה, ייצוא לקוחות, הוספת תגיות מרוכזת, יצירת פלח מהבחירה, שליחת קמפיין לפלח.

---

## 2. Email Campaigns

אין ישות Campaign. אין טבלה, אין סטטוס `draft | scheduled | sending | sent`, ואין נמענים שמורים. מה שקיים הוא ספריית מיילים (`MarketingEmail`) ואוטומציה שתפקידה "מבצע לקהל" (`TEMPLATES` ב-`marketing-session.ts`, מפתח `campaign`).

| יכולת | סטטוס | מה קורה בפועל |
| --- | --- | --- |
| יצירת מייל | PARTIALLY IMPLEMENTED | `createEmail` יוצר רשומה ושומר אותה ב-JSON. זה לא קמפיין. |
| עריכה | PARTIALLY IMPLEMENTED | `saveEmail` מעדכן את אותו JSON. יש סרגל שינויים שלא נשמרו (`useUnsavedEditor`). |
| שכפול | NOT IMPLEMENTED | אין `duplicateEmail` / `duplicateFlow`. תבנית יוצרת עותק חדש, לא משכפלת מייל קיים. |
| טיוטה | PARTIALLY IMPLEMENTED | אוטומציה חדשה נשמרת עם `on: false` ומתויגת "טיוטה". אין טיוטת קמפיין נפרדת. |
| בחירת נמענים ופלחים | UI ONLY | טריגרים "כל הלקוחות", "כל המנויים", "פלח: לקוחות חדשים", "פלח: רכשו יותר מפעמיים" הם תוויות. `triggerAudienceCount` רק סופר. אין רשימת נמענים שננעלת לשליחה. |
| תזמון | NOT IMPLEMENTED | אין `sendAt`. שלב `wait` הוא מחרוזת בעיצוב ("1" + "שעות"), בלי מתזמן. |
| שליחה מיידית | NOT IMPLEMENTED | אין קריאת שליחה. |
| מייל בדיקה | UI ONLY | הכפתור ב-`automation-editor-screen.tsx` מציג toast עם `ownerEmail`. אין `fetch` ל-Resend. |
| ניהול סטטוס | PARTIALLY IMPLEMENTED | `toggleFlow` / כפתור הפעלה הופכים `flow.on`. זה לא מונע או מפעיל worker. ברשימת המיילים הסטטוס הוא "באוטומציה" או "לא מחובר" לפי האם `emailId` מופיע ב-flow. |
| סטטיסטיקות קמפיין | UI ONLY | העמודות קיימות. הערך הוא `flow.stats` או "—". |
| A/B | UI ONLY | שלב `{ type: "ab", percent, a, b }` נשמר. אין הקצאת נמענים ואין מדידת מנצח. |
| משתני פרסונליזציה | PARTIALLY IMPLEMENTED | הטוקנים מוגדרים ב-`EMAIL_VARS` ומוצגים כצ'יפים ב-`Rich`. אין מנוע החלפה בזמן שליחה. |
| המלצות מוצר | NOT IMPLEMENTED | אין בלוק מוצר ב-`EmailBlock`. |

`emailReady` בודק שיש נושא ולפחות בלוק עם תוכן. זו בדיקת עורך, לא בדיקת מוכנות לשליחה (אין from, אין נמענים, אין HTML).

---

## 3. Email Template Builder

אין ספריית עורך חיצונית. אין Unlayer, GrapesJS, MJML, או `react-email`. העורך הוא React מותאם: גרירה עם `dataTransfer` ב-`EmailEditorScreen` ו-`EmailPreview`.

| יכולת | סטטוס | ראיה |
| --- | --- | --- |
| גרירה | PARTIALLY IMPLEMENTED | פלטה גוררת `new:<type>`, בלוק קיים גורר `move:<id>`, קווי השלכה ב-`DropLine`. זה סדר אנכי אחד, לא קנבס חופשי. |
| טקסט, תמונה, כפתור, מפריד, עמודות | PARTIALLY IMPLEMENTED | טיפוסים: `image`, `logo`, `heading`, `text`, `button`, `columns`, `spacer`, `divider` ב-`blankBlock`. |
| בלוק מוצר מקטלוג | NOT IMPLEMENTED | אין סוג `product`. |
| מידע מוצר דינמי | NOT IMPLEMENTED | `{cart_items}` ו-`{cart_total}` הם תוויות בלבד. |
| תצוגת מובייל ודסקטופ | NOT IMPLEMENTED | אין מתג viewport. רוחב התצוגה קבוע סביב `max-w-[520px]`. |
| תצוגת תיבת דואר | PARTIALLY IMPLEMENTED | `InboxPreview` מדמה שורה בנושא. שתי השורות השכנות הן טקסט קבוע ("חנות אחרת", "עדכונים"). |
| RTL ועברית | PARTIALLY IMPLEMENTED | האפליקציה היא `lang="he" dir="rtl"` ב-`src/app/layout.tsx`. התצוגה יורשת RTL. אין `dir` נפרד על גוף המייל, ואין HTML מייל עם `dir="rtl"`. |
| פונטים וצבעים | PARTIALLY IMPLEMENTED | `EMAIL_FONTS` (Heebo, Rubik, Assistant, Alef, Noto Sans/Serif Hebrew ועוד), גדלים, משקלים 400/500/700, italic, underline, strike, צבע hex. הפונטים נטענים ל-DOM של האדמין, לא למייל שנשלח. |
| תבניות שמורות | PARTIALLY IMPLEMENTED | שלוש תבניות קוד ב-`emails-screen.tsx` (`cart`, `welcome`, `thanks`) יוצרות מייל חדש. אין גלריית תבניות שנשמרת בנפרד מהמיילים עצמם. כל מייל שנשמר הוא הרשומה. |
| יצירת HTML | NOT IMPLEMENTED | `BlockView` מרנדר רכיבי React ו-CSS (`grid`, `rounded-full`). אין פונקציה שפולטת HTML תואם לקוחות מייל. |
| רספונסיביות במייל | NOT IMPLEMENTED | עמודות הן `grid-cols-2`. זה לא נשבר ל-stack ב-Outlook או ב-Gmail. |
| תצוגה מקדימה | PARTIALLY IMPLEMENTED | תצוגת עיצוב חיה בזמן עריכה. |
| שליחת בדיקה מהעורך | NOT IMPLEMENTED | בעורך המייל אין כפתור שליחה. כפתור הבדיקה נמצא רק בעורך האוטומציה, והוא toast. |

העלאת תמונה: `uploadEmailImage` שומר ב-`{storeId}/emails/{uuid}.{ext}` ב-bucket ציבורי `email-media`, עד 5MB, סוגים jpg/png/webp/gif/avif. ה-URL נשמר בשדה `src` של הבלוק.

לוגו: בלוק `logo` קורא את `getSettings().logo`, לא מעתיק את הקובץ לתוך המייל.

קישורים שמורים: `{store_url}`, `{checkout_url}`, `{account_url}` (`EMAIL_LINKS`). אין ולידציה שהטוקן יוחלף, ואין מעקב קליקים.

---

## 4. Marketing Automations / Flows

קיים בונה זרימה ויזואלי. לא קיים מנוע הרצה.

המבנה נשמר כ-`Flow`: `id` מספרי מקומי, `name`, `trigger` (מחרוזת תווית בעברית), `lookback` אופציונלי, `on`, `steps`, `stats`.

שלבי `FlowStep`: `wait`, `cond` (yes/no), `ab`, `both` (מייל ו-SMS), `email`, `sms`, `end`. ענפים מקוננים. `linkLegacyEmails` ממיר שלב מייל ישן עם `subject/body` למייל בספרייה ומחליף את השלב ב-`emailId`.

### טריגרים שמוגדרים ב-UI

`FLOW_TRIGGERS` ב-`marketing-session.ts`:

| id | תווית | קבוצה | ספירת קהל |
| --- | --- | --- | --- |
| cart | הלקוח נטש עגלה | אירוע | קופות לא משוחזרות בחלון זמן |
| checkout | התחיל תשלום ולא סיים | אירוע | אותה ספירה כמו cart. אין הבחנה |
| paid | הזמנה שולמה | אירוע | הזמנות `pay === "paid"` |
| fulfilled | הזמנה סופקה | אירוע | `fulfillment === "fulfilled"` |
| subscribed | לקוח נרשם לדיוור | אירוע | `profile.subscribed` |
| created | לקוח חדש נוצר | אירוע | כל הלקוחות, לא רק חדשים |
| browse | צפה במוצר ולא קנה | אירוע | תמיד 0 (`trigger-audience.ts`) |
| winback | לא קנה X ימים | אירוע | לקוחות שהזמנה האחרונה שלהם לפני החלון |
| all | כל הלקוחות | קהל | כל הלקוחות |
| subs | כל המנויים לדיוור | קהל | מנויים |
| fresh | פלח: לקוחות חדשים | קהל | הזמנה ראשונה בתוך החלון |
| repeat | פלח: רכשו יותר מפעמיים | קהל | `person.orders > 2` |

חלון זמן: 7 / 30 / 60 / 90 יום, או "כל הזמנים" (`TRIGGER_WINDOWS`). הטריגרים המתוזמנים מסומנים ב-`TIMED_TRIGGERS`.

הספירה רצה בדפדפן על המערכים שכבר נטענו. היא לא שולפת קהל ב-SQL, לא נועלת רשימה, ולא נרשמת לאירוע.

### תשובות ישירות

| בדיקה | מסקנה |
| --- | --- |
| יצירת אוטומציה | נשמרת. `createFlow` ואז `save` דרך `publish`. |
| בונה ויזואלי | קיים: `FlowLane`, ספריית שלבים, גרירה, החלפה, מחיקה. |
| טריגרים | רשימה קבועה. אין טריגר מותאם אישית ואין birthday. |
| אירועי לקוח | לא מחוברים לבונה. אירועי החנות נשמרים בנפרד ולא מפעילים flow. |
| המתנה | נשמרת כטקסט. אין job שמתעורר אחרי ההמתנה. |
| תנאים ופיצול כן/לא | נשמרים (`match: all \| any`, `FlowRule`). `stepReady` בודק שהטופס מלא. אין evaluator. |
| תנאי פלח | שדה טקסט `segment`. לא מקושר ל-`SegmentsScreen`. |
| פעולת שליחת מייל | בוחרת `emailId`. לא שולחת. |
| עגלה נטושה | תבנית UI. דגל `reminded` על קופה הוא סימון ידני (`markCheckoutsSent`), לא תוצאה של flow. |
| נטישת תשלום | אותו מקור נתונים כמו עגלה. אין אירוע נפרד. |
| ברוכים הבאים | תבנית על טריגר "לקוח נרשם לדיוור". ההרשמה לא יוצרת ריצת flow. |
| אחרי רכישה | תבנית "תודה על הרכישה" על "הזמנה שולמה". אין חיבור ל-`orders`. |
| Winback | תבנית וספירת קהל. אין ריצה תקופתית. |
| יום הולדת | NOT IMPLEMENTED. אין שדה תאריך לידה על `customers`. |
| הפעלה וכיבוי | הופכים `on` ושומרים. כיבוי לא עוצר ריצות כי אין ריצות. |
| עבודת רקע | NOT IMPLEMENTED. אין `pg_cron`, אין queue, אין worker, אין route של cron ב-`src`. |
| ניסיונות חוזרים | NOT IMPLEMENTED. |
| מניעת כפילות | NOT IMPLEMENTED. אין מפתח idempotency ואין טבלת שליחות. |
| מעקב ריצה בודדת | NOT IMPLEMENTED. אין `flow_runs`. |

הפעלה בלי טריגר נחסמת ב-UI (`needsTrigger`). אחרי שיש טריגר, "הפעלה" רק משנה בוליאני.

כפתור "הגדרות שליחה" מציג toast קבוע: `שם שולח: Storely · שעות שקטות: 22:00–08:00`. הוא לא קורא את `resend_from_name` ולא שומר שעות שקטות.

תנאי הפיצול כוללים שדות שאין להם נתונים: `opened`, `clicked`, `in_cart`. `subscribed`, `paid`, `orders`, `spent` קיימים במקומות אחרים במערכת אבל הפיצול לא קורא אותם בזמן ריצה.

**מסקנה:** האוטומציות לא רצות בבקאנד. הממשק והשמירה של ההגדרה קיימים. המנוע חסר.

---

## 5. Customer Profiles & Segmentation

הלקוח הוא רשומת מסחר, לא פרופיל שיווקי מלא.

### מה נשמר בטבלה `public.customers` (סכמה חיה)

`id`, `store_id`, `name`, `email` nullable, `phone`, `created_at`, `note`, `tags text[]`, `subscribed boolean`, `credit`, `locale`, `sms`, `whatsapp`.

מפתח: `id` יחיד, ובנוסף `unique (store_id, id)`. אינדקס: `customers_email_idx` על `(store_id, email)`. אין אינדקס על `subscribed` או על `tags`.

כתובת: `customer_addresses` (רחוב, עיר, מיקוד). אין כמה כתובות מסומנות כברירת מחדל מעבר לשורה שנשמרת ב-`save_store_customer`.

הזמנות: `orders.customer_id` אופציונלי, `order_items`, `payments`. בזמן הביקורת הטבלאות ריקות.

### איך קוראים ומעדכנים

- קריאה: `store_admin_snapshot` מכניס לקוחות ל-JSON, ו-`mapCustomer` / `mapProfiles` ב-`apply-store.ts` בונים `Customer` ו-`PersonProfile`.
- עדכון פרופיל: `patchProfile` ב-`people-session.ts` קורא ל-`save_store_customer` עם `replace_profile: true` ושדות `customer_subscribed`, `customer_tags`, `customer_sms`, `customer_whatsapp`.
- יצירה: `addPerson` קורא לאותו RPC. אחרי יצירה מזהה ה-uuid חוזר ל-`sourceId`. קריאת היצירה הראשונה לא שולחת את דגל המנוי. המסך החדש קורא אחר כך ל-`patchProfile` עם `subscribed`.

### פלחים

`SegmentsScreen` (`src/components/admin/customers/segments-screen.tsx`):

- ארבעה פלחים קבועים בקוד: VIP (הוצאה 1500 והזמנות 5), מנויים, לקוחות חדשים (לפחות הזמנה אחת), רכשו יותר מפעמיים (לפחות 3 הזמנות).
- הסינון רץ בזיכרון: `customerSpent` סוכם הזמנות לפי `customer.id` מקומי, פלוס `orders` ו-`subscribed`.
- "שמירת פלח" רק מעדכן `savedName` ב-state של הקומפוננטה ו-toast. רענון הדף מאבד פלח שאינו באחד מארבעת הקבועים. זה מתועד גם ב-`docs/screen-migration-checklist.md`.
- "שליחת קמפיין לפלח" הוא toast: "שליחת קמפיין לפלח תתווסף בהמשך".
- "יצירת פלח מהבחירה" ברשימת הלקוחות מציג toast ועובר למסך הפלחים בלי להעביר את הנבחרים.

אין טבלת segments, אין רשימה סטטית של חברים, ואין הערכה מחדש בשרת.

### שאר הפריטים

| פריט | סטטוס | הערה |
| --- | --- | --- |
| רשימת לקוחות | PARTIALLY IMPLEMENTED | רשימה אמיתית מה-snapshot. ייצוא CSV הוא toast. ייבוא ו"פעולות נוספות" הם כפתורים בלי handler. |
| פרופיל | PARTIALLY IMPLEMENTED | `customer-profile-screen.tsx`. מתג מנוי נשמר. |
| היסטוריית רכישות | PARTIALLY IMPLEMENTED | דרך הזמנות החנות, לא ציר זמן שיווקי. |
| פעילות | PARTIALLY IMPLEMENTED | אירועי גלישה ב-`storefront_events` לפי session, לא לפי לקוח. |
| פלחים דינמיים | UI ONLY | התנאים מחושבים במסך ולא נשמרים. |
| רשימות סטטיות | NOT IMPLEMENTED | |
| תגיות | PARTIALLY IMPLEMENTED | `tags` על הלקוח נשמר. הוספה מרוכזת מהרשימה היא toast בלבד ולא קוראת ל-`patchProfile`. |
| סטטוס מנוי | PARTIALLY IMPLEMENTED | בוליאני יחיד `subscribed`. גם `sms` ו-`whatsapp`. |
| היסטוריית הסכמה | NOT IMPLEMENTED | אין טבלת consent events. |
| הסרה מדיוור | PARTIALLY IMPLEMENTED | רק מתג באדמין. אין קישור הסרה במייל ואין דף ציבורי. |
| מסנני לקוחות | PARTIALLY IMPLEMENTED | חיפוש טקסט אמיתי. תיבת "פלח" מזהה רק את המחרוזות "יותר מפעמיים", "VIP", "דיוור" (`customers-list-screen.tsx`). זה לא שפה טבעית. |
| זיהוי VIP | UI ONLY | סף 1500 או תגית "VIP" במסנן. אין שדה VIP במסד. |
| Lifetime value | PARTIALLY IMPLEMENTED | סכום הזמנות מחושב במסך (`customerSpent`). אין עמודה שמורה ואין עדכון מצטבר. |

`checkout.subscribed` ב-`mapCheckout` תמיד `false`, גם אם יש דגל על הלקוח. קופה נטושה לא יורשת סטטוס דיוור.

---

## 6. Event Tracking

אירועי חנות שנשמרים: `page_view`, `product_view`, `add_to_cart`, `begin_checkout`, `purchase`. האילוץ ב-`storefront_events.name` אוסר כל שם אחר. היצירה היא `record_storefront_event` (migration `20261014190000_storefront_attribution.sql`), והלקוח הוא `recordStorefrontEvent` ב-`src/tracking/storefront.ts`. הפונקציה מזהה חנות לפי tracking key ו-hostname, לא לפי מזהה שנשלח מהדפדפן. האירוע קשור ל-`store_id` ול-`session_id`. אין `customer_id` על האירוע או על הסשן. `visitor_key` הוא מזהה גולש, לא לקוח.

בסכמה החיה נראו רק `page_view` ו-`add_to_cart`. שאר השמות מותרים בסכמה אבל לא נצפו.

אף אירוע לא מפעיל אוטומציה. אין טבלת email events.

| אירוע | קיים | איפה נוצר | איפה נשמר | מפעיל אוטומציה | קשור לחנות וללקוח |
| --- | --- | --- | --- | --- | --- |
| Customer Created | חלקי | `save_store_customer` כש-`customer_id` ריק | שורה ב-`customers` | לא | חנות כן. אין אירוע נפרד. |
| Customer Subscribed | חלקי | מתג אדמין / יצירת לקוח דרך `patchProfile` | `customers.subscribed` | לא. הטריגר רק סופר את הדגל. | חנות כן, לקוח כן. אין חותמת זמן להסכמה. |
| Product Viewed | כן, כאירוע חנות | `record_storefront_event` עם `product_view` | `storefront_events` | לא. ספירת הטריגר `browse` קשיחה ל-0. | חנות וסשן. לא לקוח. |
| Added to Cart | כן | אותו RPC, `add_to_cart` | `storefront_events` | לא | חנות וסשן. לא לקוח. |
| Checkout Started | כן כשם מותר | `begin_checkout` | `storefront_events` | לא | חנות וסשן. |
| Checkout Abandoned | חלקי | טיוטת קופה, לא אירוע נטישה | `checkout_drafts` כש-`recovered = false` | לא | חנות ו-`visitor_key`. אימייל על הטיוטה אם נשמר. 0 שורות בזמן הביקורת. |
| Order Placed | חלקי | יצירת הזמנה במסחר, לא אירוע שיווק | `orders` | לא | `customer_id` אופציונלי. |
| Order Paid | חלקי | `orders.financial_status = paid` | עמודה על ההזמנה | לא. הטריגר רק סופר. | חנות כן. |
| Order Fulfilled | חלקי | `fulfillment_status` | עמודה על ההזמנה | לא | חנות כן. |
| Order Cancelled | לא כאירוע | אין סטטוס `cancelled`. יש `refunded` ו-`partially_refunded`. | — | לא | — |
| Email Opened | לא | שדה תנאי `opened` בעורך בלבד | לא נשמר | לא | — |
| Email Clicked | לא | שדה תנאי `clicked` | לא נשמר | לא | — |
| Email Bounced | לא | — | — | לא | — |
| Customer Unsubscribed | חלקי | אותו מתג אדמין שמכבה `subscribed` | עדכון הבוליאן | לא | אין אירוע הסרה ואין מקור (קישור, תלונה, אדמין). |

UTM נשמר על `storefront_sessions.utm_campaign` לצורכי ייחוס תנועה, לא כקמפיין אימייל. ראו `storefront_attribution.sql`.

---

## 7. Email Delivery Infrastructure

### ספק

הספק המיועד למייל הוא Resend. ה-SMS המיועד הוא Pulseem. שניהם נשמרים ב-`private.store_messaging`, טבלה בלי גישה ל-`anon` ול-`authenticated`, עם RLS מאולץ.

שמירה: `save_store_messaging`, רק `platform.stores.create`. ולידציה: מפתח תואם `re_…`, אימייל שולח, ודגל marketing/login לא נדלק בלי מפתח וכתובת. שדה ריק לא מוחק מפתח קיים. `clear_email` מאפס.

קריאה למסך החנות: `store_messaging_status` מחזיר כתובת, שם, דגלים, ו-4 התווים האחרונים של המפתח. לא את המפתח.

בדיקת חיבור: `checkStoreEmail` ב-`src/app/platform/actions.ts` מושך את הסוד בשרת ובודק שדומיין הכתובת קיים ב-Resend ושהסטטוס `verified`. זו בדיקת דומיין, לא שליחת הודעה.

בזמן הביקורת: 0 שורות ב-`private.store_messaging`. אף חנות לא מחוברת בפועל.

### דומיין לכל חנות

כל חנות יכולה לשמור כתובת שולח אחת. אין טבלת דומיינים של דיוור, אין רשומות SPF/DKIM/DMARC במערכת, ואין מסך שמנחה להוסיף רשומות DNS. האימות קורה בחשבון Resend, והמערכת רק שואלת אם הדומיין כבר מאומת.

אין הפרדה בין כתובת שולח שיווקית לכתובת טרנזקציונית מעבר לשני בוליאנים: `email_marketing` ו-`email_login`. שניהם משתמשים באותו מפתח ואותה כתובת. אין קוד ששולח מייל התחברות למרות הדגל.

### מה שחסר למשלוח ייצור

| נושא | מצב |
| --- | --- |
| תור | אין |
| שליחה בכמות | אין |
| הגבלת קצב | אין |
| סטטוס מסירה | אין |
| טיפול ב-bounce | אין |
| תלונות ספאם | אין |
| קישור הסרה ו-List-Unsubscribe | אין |
| רשימת דיכוי | אין. הכיבוי היחיד הוא `subscribed = false`, והשולח לא מתייעץ בו כי אין שולח. |
| ניסיונות חוזרים | אין |
| לוג שליחה | אין |
| Webhooks של Resend או Pulseem | אין route ואין טבלה |

הדגל `checkout_drafts.reminded` יכול להטעות: הוא מתעד סימון ידני במסך הזמנות נטושות, לא מסירה.

### חסמים מעשיים

1. אין קריאת `POST /emails` ל-Resend בשום קובץ אפליקציה.
2. גוף המייל אינו HTML.
3. אין נמען, אין כפתור שליחה אמיתי, ואין worker.
4. בסיס הנתונים הנוכחי לא מכיל אפילו שורת חיבור ספק.
5. משתני `{first_name}` לא מוחלפים.
6. תמונות יושבות ב-bucket ציבורי. זה מתאים להטמעה במייל, אבל אין חתימת תוכן ואין מחיקה כשמוחקים בלוק.

---

## 8. Analytics & Reporting

מסך האנליטיקה (`analytics-screen.tsx`) מודד מסחר ותנועה, לא דיוור.

`overview.marketing` ב-`src/lib/analytics/overview.ts` מקבץ מכירות של היום לערוצים "חברתי" / "ידני" / "ישיר". זה לא קמפיין אימייל. כשאין ערכים מוצג `EmptyState`.

| מדד | סטטוס | מקור |
| --- | --- | --- |
| נשלחו | UI ONLY | `flow.stats[0]`, תמיד ריק ביצירה |
| נמסרו | NOT IMPLEMENTED | |
| פתיחות | UI ONLY | `flow.stats[1]` כמחרוזת תצוגה |
| הקלקות | UI ONLY | `flow.stats[2]` |
| Bounce | NOT IMPLEMENTED | |
| הסרות | NOT IMPLEMENTED | אין מונה. יש רק בוליאן מנוי. |
| המרות מקמפיין | NOT IMPLEMENTED | |
| הזמנות שיוחסו למייל | NOT IMPLEMENTED | UTM של סשן אינו קישור ממייל עם מזהה שליחה |
| הכנסות מקמפיין | UI ONLY | `flow.stats[3]` |
| ביצועי אוטומציה | UI ONLY | אותן עמודות, מסוכמות ל-30 יום בלי סינון תאריך אמיתי |
| הכנסות לפי פלח | NOT IMPLEMENTED | פלח לא שמור ולא מיוחס |

כרטיסי "מיילים", "SMS", "בשימוש", "מוכנים לשליחה" ב-`EmailsScreen` נספרים מהספרייה המקומית. "מוכן" פירושו `emailReady`, לא נשלח.

כרטיס "מייל מרקטינג" במסך האוטומציות הוא `channelLabel` של סטטוס Resend. זה חיבור, לא ביצוע.

---

## 9. Database Architecture

### אומת מול הסכמה החיה

נקראו עמודות מ-`information_schema` ורשימת טבלאות. אין טבלאות בשמות campaign, flow, email_message, email_event, segment, suppression, או automation_run.

### טבלאות שנוגעות לשיווק

| טבלה | תפקיד | מפתחות |
| --- | --- | --- |
| `public.store_settings` | שורה לחנות. עמודת `marketing jsonb` מחזיקה flows, emails, sms, connected. | PK `store_id` → `stores` |
| `private.store_messaging` | סודות Resend ו-Pulseem ודגלי הפעלה. | PK `store_id` |
| `public.customers` | לקוח, תגיות, מנוי. | PK `id`, unique `(store_id, id)` |
| `public.customer_addresses` | כתובת. | FK `(store_id, customer_id)` → customers |
| `public.orders` / `order_items` / `payments` | מסחר לצורך קהל ו-LTV מחושב. | `orders.customer_id` אופציונלי |
| `public.checkout_drafts` | טיוטת קופה, `reminded`, `recovered`. | unique `(store_id, visitor_key)` |
| `public.storefront_sessions` | גולש, ערוץ, UTM. | unique `(store_id, visitor_key)` |
| `public.storefront_events` | חמישה שמות אירוע מותרים. | FK לסשן באותה חנות |
| `public.audit_logs` | טבלה קיימת וריקה. אין כתיבה ממסלולי השיווק. | `store_id` |
| `storage.buckets.email-media` | תמונות מייל ולוגו. ציבורי, 5MB. | נתיב מתחיל ב-uuid של חנות |

ה-JSON של השיווק אינו סכמה. אין check ש-`flows` הוא מערך, אין FK מ-`emailId` אל מייל, ואין גרסה. `parseEmails` מסנן בלוקים לא מוכרים. מערך ה-flows עובר כמעט כמו שהוא אם יש `name` (`apply-store.ts`). אובייקט פגום יכול לשבור את העורך.

### RLS

טבלאות המסחר, כולל `customers` ו-`store_settings`, עם RLS מאולץ. מדיניות השורות נבנית מ-`private.has_store_permission(store_id, …)` (`store_tenancy_and_commerce.sql`). לדוגמה לקוחות: `customers.read` / `customers.create` / `customers.update`.

`storefront_events`, `storefront_sessions`, `checkout_drafts`: RLS מאולץ ו-`revoke all` מ-`public`, `anon`, `authenticated`. הגישה היא דרך פונקציות `security definer`.

`private.store_messaging`: אין מדיניות שורות שפותחת קריאה. הגישה רק דרך שלוש פונקציות עם בדיקת הרשאה.

שינוי `store_id` בעדכון נחסם ב-`private.reject_store_id_change()` על טבלאות המסחר והאירועים.

דליפת שורות בין חנויות דרך ה-API הרגיל לא נראית במדיניות. הפער הוא אחר: `save_store_sections` ו-`store_admin_snapshot` רצים כ-definer ומאשרים כל חבר פעיל, לא רק בעל `marketing.read`. חבר עם הרשאת מוצרים בלבד, אם הוא עדיין `store_members.status = active`, יכול לקרוא ל-RPC ישירות ולקרוא או לכתוב את כל ה-snapshot, כולל JSON השיווק. זה אומת מול הגדרת `can_manage_store`, לא מול ניסיון פריצה.

`platform_messaging_secrets` מוגבל ל-`platform.stores.create` ומחזיר את מפתח Resend. הוא לא חשוף לבעל החנות.

### אינדקסים

מתאימים למסחר ולאירועי תנועה: `(store_id, email)`, `(store_id, occurred_at)`, קופות פתוחות לפי `updated_at`. לא מתאימים לשיווק כי אין טבלאות שליחה. `marketing jsonb` בלי אינדקס GIN. חיפוש בתוך flows יישאר סריקה.

### טבלאות חסרות לדיוור יציב

לפי מה שהקוד מצפה לעשות מול מה שקיים: campaigns, campaign_recipients, email_messages (או deliveries), email_events, automation_runs, automation_step_runs, segments, segment_memberships, consent_events, suppressions, provider_webhooks, sending_domains. אף אחת מהן לא קיימת בסכמה החיה.

---

## 10. Security, Compliance & Reliability

| נושא | ממצא | חומרה |
| --- | --- | --- |
| בידוד חנויות בנתונים | שורות מסחר ואירועים קשורות ל-`store_id`. JSON השיווק יושב בשורת ההגדרות של החנות. | תקין בשכבת הטבלה |
| הרשאת יצירה ושליחה | UI דורש `marketing.read`. RPC השמירה דורש חברות פעילה. אין הרשאת send נפרדת כי אין שליחה. | פער הרשאות בקריאה/כתיבה של snapshot |
| הסכמה לדיוור | בוליאני שהאדמין מדליק. אין טופס הרשמה, אין מקור, אין חותמת. | לא עומד בתיעוד הסכמה |
| הסרה | אין קישור במייל. כיבוי רק באדמין. | קריטי לפני כל שליחה אמיתית |
| דיכוי לא-מנויים | אין בדיקה בנתיב שליחה. הטריגר "כל המנויים" רק מציג ספירה. | קריטי ברגע שיהיה שולח |
| שיווק מול טרנזקציוני | שני דגלים על אותו ספק ואותה כתובת. אף אחד לא שולח. | לא מופרד |
| כפילות שליחה | אין מנגנון | — |
| שחזור עבודה שנכשלה | אין תור | — |
| אמינות רקע | אין תהליך רקע | המערכת לא יכולה לשלוח כשהאדמין סגור |
| מידע לקוח | סודות הספק בטבלה פרטית. snapshot האדמין כולל אימייל וטלפון למי שמורשה ל-RPC. תמונות המייל ציבוריות. | סביר לסודות; תמונות ציבוריות במכוון |
| Audit | הטבלה קיימת, 0 שורות, ומסלולי השיווק לא כותבים אליה | אין עקבות להפעלת flow או לשינוי מנוי |

סיכונים נוספים:

- מפתח Resend נשמר כטקסט בטבלה פרטית, לא בכספת חיצונית. הגישה חסומה היטב יחסית, אבל גיבוי מסד כולל את הסוד.
- סיסמת Pulseem נשמרת באותו אופן.
- `save_store_sections` מחליף את כל אובייקט `marketing` בלי נעילה אופטימית. שתי לשוניות יכולות לדרוס זו את זו.
- מזהי flow הם מספרים עולים בזיכרון (`max id + 1`), לא UUID. התנגשות אפשרית אם שתי לשוניות יוצרות flow לפני רענון.
- בדיקת הדומיין ב-Resend רצה בשרת הפלטפורמה עם המפתח. זה נכון. אסור להעביר את הבדיקה ללקוח.

---

## 11. Existing UI/UX

הניווט: שיווק → אינטגרציות, מיילים ו-SMS, אוטומציות. פלחים יושבים תחת לקוחות (`/admin/customers/segments`), לא תחת שיווק. חיבור Resend יושב בכרטיס חנות של סופר-אדמין (`store-messaging-card.tsx`), לא באדמין החנות.

### אינטגרציות

רשימת כלים, חיפוש, ודיאלוג שמירת מזהה. Meta, GA4 ו-TikTok מאפשרים בחירת אירועים מתוך `EVENT_LABELS` (צפייה בעמוד, צפייה במוצר, הוספה לעגלה, התחלת תשלום, רכישה) וצ'קבוקס "כבוד להסכמת עוגיות". השמירה אמיתית ל-JSON. הכלי לא נטען בחנות. Empty state הוא הרשימה עצמה כשאין חיבור.

### מיילים ו-SMS

כרטיסי ספירה, שני כפתורי יצירה, טבלה, מחיקה, וארבע תבניות התחלה. Empty state: "עדיין אין הודעות…". השורות לחיצות ומובילות לעורך. מחיקה מיידית בלי דיאלוג אישור, ונשמרת.

### עורך מייל

שם, חזרה, מתג "המייל" / "בתיבת הדואר", פלטת בלוקים, קנבס, פאנל שדות, העלאת תמונה, צבעים, פונטים, טוקנים. שמירה בסרגל השינויים. מצב חסר מציג `notFound()`. אין שליחה, אין מובייל, אין בלוק מוצר.

### עורך SMS

נתיב נפרד, מגבלה 250 תווים (`SMS_LIMIT`), אותם טוקנים. לא נבדק כעורך מייל, אבל הוא באותו מודול ונשמר באותו JSON.

### אוטומציות

כרטיסי סיכום, טבלה עם סטטיסטיקה ריקה, מתג פעיל, תבניות. Empty: הטבלה ריקה בלי שורת הסבר ייעודית אם אין flows (הכותרת נשארת). "הגדרות שליחה" הוא toast.

### עורך אוטומציה

טריגר, מונה קהל, מסלול, חלונות הוספה והחלפה, עורך שלב, פיצול, A/B, המתנה, קישור לעורך המייל או ה-SMS. תחתית: "שליחת בדיקה" (toast) ו"הפעלה" / "השהיה" (נשמר). סטטוס טיוטה/פעיל לפי `on`.

### פלחים

עמודה של פלחים שמורים קשיחים, טופס תנאים, קוד תנאי לתצוגה, רשימת לקוחות שעונים לתנאים, קישור לפרופיל. Empty של הרשימה: "אף לקוח לא עונה על התנאים". שמירה לא שורדת רענון.

### פרופיל ורשימת לקוחות

מתג מנוי עובד ונשמר. תגיות בודדות נשמרות. פעולות מרוכזות, ייצוא, ייבוא ו"פעולות נוספות" לא פונקציונליים. תיבת הפלח החופשית נראית חכמה ומסננת רק שלוש מילות מפתח.

### כפתורים לא פונקציונליים

- שליחת בדיקה
- הגדרות שליחה
- שליחת קמפיין לפלח
- יצירת פלח מהבחירה (הניווט עובד, היצירה לא)
- הוספת תגיות לנבחרים
- ייצוא, ייבוא, פעולות נוספות ברשימת הלקוחות

אין מסכי mock נפרדים עם נתוני דמה קבועים אחרי חיבור חנות. תבניות הטקסט והסטטיסטיקה הריקה הן שכבת התצוגה. `src/data/mock/abandoned.ts` עדיין מגדיר מבנה קופה, אבל הרשימה החיה מגיעה מה-snapshot.

---

## 12. Final Feature Matrix

| Feature | Status | Frontend | Backend | Database | Evidence / File Paths | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Marketing navigation | FULLY IMPLEMENTED | כן | נתיבי Next בלבד | לא | `src/lib/navigation/nav.ts`, `src/app/admin/marketing/**` | שלושה פריטים |
| Route guard marketing.read | PARTIALLY IMPLEMENTED | כן | RPC לא בודק את ההרשאה | הרשאה קיימת ב-`permissions` | `src/platform/access.ts`, `private.can_manage_store` | UI בלבד |
| Persist emails and flows | FULLY IMPLEMENTED | כן | `save_store_sections` | `store_settings.marketing` | `marketing-session.ts` `publish`, `apply-store.ts` | JSON, לא טבלאות |
| Multi-store isolation of definitions | PARTIALLY IMPLEMENTED | singleton בדפדפן | `target_store` ב-RPC | שורה לכל חנות | `write.ts`, `store_settings` | דריסה בין לשוניות אפשרית |
| Resend credential storage | FULLY IMPLEMENTED | כרטיס פלטפורמה | `save_store_messaging` | `private.store_messaging` | `20261014200000_store_messaging.sql` | 0 שורות חיות |
| Resend domain check | PARTIALLY IMPLEMENTED | כפתור בדיקה | `checkStoreEmail` | קורא סוד | `src/app/platform/actions.ts` | לא שולח מייל |
| Per-store sender address | PARTIALLY IMPLEMENTED | שדות בכרטיס | נשמר | `resend_from_email`, `resend_from_name` | אותה migration | כתובת אחת |
| SPF DKIM DMARC management | NOT IMPLEMENTED | לא | לא | לא | רק סטטוס `verified` מ-Resend | |
| Pulseem SMS credentials | PARTIALLY IMPLEMENTED | כרטיס פלטפורמה | שמירה בלבד | `pulseem_*` | `store-messaging-card.tsx` | אין שליחת SMS |
| Create email | PARTIALLY IMPLEMENTED | כן | שמירת JSON | jsonb | `createEmail` | לא קמפיין |
| Edit email | PARTIALLY IMPLEMENTED | כן | שמירת JSON | jsonb | `saveEmail`, `EmailEditorScreen` | |
| Duplicate email or flow | NOT IMPLEMENTED | לא | לא | לא | אין פונקציה | |
| Draft automation | PARTIALLY IMPLEMENTED | תג טיוטה | `on: false` | jsonb | `createFlow` | |
| Recipient selection | UI ONLY | טריגר ומונה | אין materialize | אין | `trigger-audience.ts` | ספירה בלבד |
| Schedule campaign | NOT IMPLEMENTED | לא | לא | לא | אין `sendAt` | |
| Send now | NOT IMPLEMENTED | לא | לא | לא | אין קריאת ספק | |
| Test send | UI ONLY | toast | לא | לא | `automation-editor-screen.tsx` שורה 516 | |
| Campaign status | PARTIALLY IMPLEMENTED | באוטומציה / לא מחובר; פעיל / טיוטה | דגל `on` | jsonb | `emails-screen.tsx`, `toggleFlow` | |
| Campaign statistics | UI ONLY | עמודות | לא נכתב | `stats` תמיד null ביצירה | `automations-screen.tsx` | |
| A/B testing | UI ONLY | פיצול אחוזים | לא רץ | jsonb | `FlowStep` type `ab` | |
| Personalization tokens | PARTIALLY IMPLEMENTED | צ'יפים | אין החלפה | נשמר כטקסט | `EMAIL_VARS`, `Rich` | |
| Product recommendations | NOT IMPLEMENTED | לא | לא | לא | אין ב-`EmailBlock` | |
| Drag and drop blocks | PARTIALLY IMPLEMENTED | כן | נשמר אחרי save | jsonb | `email-editor-screen.tsx`, `email-preview.tsx` | עמודה אחת |
| Text image button divider columns | PARTIALLY IMPLEMENTED | כן | נשמר | jsonb | `blankBlock` | |
| Product block from catalog | NOT IMPLEMENTED | לא | לא | לא | | |
| Mobile desktop preview | NOT IMPLEMENTED | לא | לא | לא | רק רוחב קבוע | |
| Inbox preview | PARTIALLY IMPLEMENTED | כן | לא | לא | `InboxPreview` | שורות שכנות קבועות |
| RTL Hebrew | PARTIALLY IMPLEMENTED | ירושת dir | אין HTML | אין | `src/app/layout.tsx` | |
| Fonts and colors | PARTIALLY IMPLEMENTED | כן, בעורך | לא במייל שנשלח | jsonb | `EMAIL_FONTS` | Google Fonts באדמין |
| Saved templates | PARTIALLY IMPLEMENTED | 3 תבניות קוד | יוצר מייל | jsonb | `emails-screen.tsx` TEMPLATES | |
| HTML generation | NOT IMPLEMENTED | React בלבד | לא | לא | `BlockView` | |
| Responsive email HTML | NOT IMPLEMENTED | CSS grid | לא | לא | `columns` | |
| Email image upload | FULLY IMPLEMENTED | כן | Storage upload | bucket ציבורי | `email-media.ts`, `20261014220000_email_media_storage.sql` | |
| Visual flow builder | PARTIALLY IMPLEMENTED | כן | שומר עץ | jsonb | `automation-editor-screen.tsx` | לא מריץ |
| Triggers catalog | PARTIALLY IMPLEMENTED | 12 טריגרים | ספירה מקומית | לא אירועי טריגר | `FLOW_TRIGGERS` | browse תמיד 0 |
| Wait step | UI ONLY | כן | אין scheduler | מחרוזת | type `wait` | |
| Conditional split | UI ONLY | כן | אין evaluator | jsonb | `FIELDS`, type `cond` | |
| Email action in flow | UI ONLY | בחירת מייל | לא שולח | `emailId` | `stepReady` | |
| Abandoned cart template | UI ONLY | תבנית | לא רץ | jsonb | template `cart` | |
| Abandoned checkout template | UI ONLY | טריגר נפרד בתווית | אותה ספירה כמו עגלה | `checkout_drafts` | `trigger-audience.ts` | |
| Welcome series template | UI ONLY | תבנית | לא רץ | jsonb | template `welcome` | |
| Post-purchase template | UI ONLY | תבנית | לא רץ | jsonb | template `thanks` | |
| Winback template | UI ONLY | תבנית וספירה | אין cron | jsonb | template `winback` | |
| Birthday | NOT IMPLEMENTED | לא | לא | אין עמודת לידה | | |
| Activate deactivate | PARTIALLY IMPLEMENTED | מתג | שומר `on` | jsonb | `toggleFlow` | לא מפעיל worker |
| Background jobs | NOT IMPLEMENTED | לא | לא | לא | אין cron/queue | |
| Retries | NOT IMPLEMENTED | לא | לא | לא | | |
| Duplicate send prevention | NOT IMPLEMENTED | לא | לא | לא | | |
| Per-run tracking | NOT IMPLEMENTED | לא | לא | לא | | |
| Customer list | PARTIALLY IMPLEMENTED | כן | snapshot | `customers` | `customers-list-screen.tsx` | 0 שורות חיות |
| Customer profile | PARTIALLY IMPLEMENTED | כן | `save_store_customer` | customers + addresses | `people-session.ts` | |
| Purchase history | PARTIALLY IMPLEMENTED | דרך הזמנות | orders | `orders` | `customerSpent` | |
| Dynamic segments | UI ONLY | סינון חי | לא נשמר | לא | `segments-screen.tsx` | |
| Static lists | NOT IMPLEMENTED | לא | לא | לא | | |
| Tags | PARTIALLY IMPLEMENTED | פרופיל נשמר | RPC | `customers.tags` | הוספה מרוכזת היא toast | |
| Marketing subscription flag | PARTIALLY IMPLEMENTED | מתג | RPC | `subscribed` | אין היסטוריה | |
| Consent history | NOT IMPLEMENTED | לא | לא | לא | | |
| Public unsubscribe | NOT IMPLEMENTED | לא | לא | לא | אין route | |
| Customer text filter | PARTIALLY IMPLEMENTED | 3 מילות מפתח | לא | לא | `customers-list-screen.tsx` | |
| VIP | UI ONLY | סף 1500 או תגית | לא | לא | | |
| Lifetime value | PARTIALLY IMPLEMENTED | סכום במסך | אין עמודה | נגזר מהזמנות | `customerSpent` | |
| Storefront events | PARTIALLY IMPLEMENTED | `recordStorefrontEvent` | `record_storefront_event` | `storefront_events` | 5 שמות מותרים | לא קשור ללקוח |
| Email open click bounce | NOT IMPLEMENTED | שדות תנאי בלבד | לא | לא | `FIELDS` | |
| Email queue and rate limit | NOT IMPLEMENTED | לא | לא | לא | | |
| Bounce and complaints | NOT IMPLEMENTED | לא | לא | לא | | |
| Suppression list | NOT IMPLEMENTED | לא | לא | לא | | |
| Send logs | NOT IMPLEMENTED | לא | לא | לא | | |
| Provider webhooks | NOT IMPLEMENTED | לא | לא | לא | | |
| Delivered open click rates | NOT IMPLEMENTED | עמודות ריקות | לא | לא | | |
| Revenue attribution to email | NOT IMPLEMENTED | לא | UTM תנועה בלבד | `utm_campaign` על סשן | `storefront_attribution.sql` | |
| Ad pixel integrations | PARTIALLY IMPLEMENTED | טפסים | נשמר ב-JSON | jsonb `connected` | `integrations-screen.tsx` | לא מוזרק לחנות |
| Subscription forms | NOT IMPLEMENTED | לא | לא | לא | אין popup או טופס | |
| AI features | NOT IMPLEMENTED | לא | לא | לא | תיבת הפלח אינה מודל | |
| Audit log for marketing | NOT IMPLEMENTED | לא | לא כותב | טבלה ריקה | `audit_logs` | |
| Transactional vs marketing split | UI ONLY | שני צ'קבוקסים | לא שולח | `email_marketing`, `email_login` | אותה כתובת שולח | |
| Quiet hours and from-name settings | UI ONLY | toast קבוע | לא | לא | `automations-screen.tsx` | הטקסט "Storely" קשיח | |

---

## 13. Executive Summary

### 1. מה עובד היום

- ניווט למסכי שיווק, שמירה וטעינה של מיילים, SMS ואוטומציות כ-JSON של החנות.
- עורך בלוקים עם גרירה, עיצוב, טוקנים ויזואליים, תצוגת תיבה, והעלאת תמונה ל-Storage.
- בונה זרימה ששומר טריגר, המתנה, פיצול, A/B, וקישור למייל או ל-SMS.
- ספירת קהל משוערת מתוך לקוחות, הזמנות וקופות שכבר נטענו לאדמין.
- שמירת מנוי, תגיות, שפה ו-SMS/WhatsApp על הלקוח.
- כספת ספק לכל חנות, ובדיקה שדומיין Resend מאומת. כרגע אין שורות חיבור.

### 2. מה קיים ולא שלם

- קמפיין הוא תבנית אוטומציה, לא אובייקט שליחה.
- הפעלת flow שומרת דגל ולא מתחילה עבודה.
- פלחים מחושבים במסך ולא נשמרים.
- אירועי חנות נאספים בלי קישור ללקוח ובלי קשר לאוטומציה.
- פרסונליזציה, A/B ותנאים הם מודל נתונים בלי מנוע.
- אינטגרציות פרסום נשמרות ולא רצות בחנות.
- LTV ומסנני VIP הם חישוב תצוגה.

### 3. מה שהוא UI או נתון ריק

- שליחת בדיקה, הגדרות שליחה, סטטיסטיקות נשלח/פתיחה/הקלקה/הכנסה.
- שליחת קמפיין לפלח, יצירת פלח מהבחירה, תגיות מרוכזות, ייצוא.
- שורות התיבה המדומות שאינן המייל הנערך.
- מונה "צפה במוצר ולא קנה" שתמיד 0.

### 4. מה שחסר לגמרי

מנוע שליחה, HTML מייל, תור, cron, webhooks, מעקב פתיחה והקלקה, bounce, הסרה ציבורית, דיכוי, טפסי הרשמה, קמפיינים מתוזמנים, המלצות מוצר, יום הולדת, ייחוס הכנסה למייל, וטבלאות הדיוור.

### 5. באגים וסיכונים ארכיטקטוניים

- אי אפשר לשלוח דיוור בייצור. זה הפער המרכזי, לא באג נקודתי.
- `can_manage_store` רחב יותר מ-`marketing.read`.
- כתיבת JSON בלי גרסה: דריסה בין לשוניות, ומזהי flow מספריים.
- אין הסרה ואין דיכוי. חיבור עתידי ל-Resend בלי השכבה הזו יישלח גם ללא-מנויים אם מישהו יממש "כל הלקוחות" כפשוטו.
- `reminded` על קופה נראה כמו תזכורת שנשלחה אבל הוא סימון ידני.
- טריגר checkout ו-cart זהים בספירה.
- טריגר "לקוח חדש" סופר את כל הלקוחות.

### 6. תלויות חיצוניות שנדרשות היום

- Supabase: Auth, RPC, `store_settings`, Storage `email-media`.
- Resend: רק אם מפעיל פלטפורמה שומר מפתח ורוצה לאמת דומיין. לא נדרש להפעלת העורך.
- Pulseem: אותו דבר ל-SMS, בלי שימוש בקוד השליחה.
- Google Fonts: לתצוגת הפונטים בעורך.

### 7. מוכנות לייצור

מודול Email Marketing אינו מוכן לייצור כמערכת דיוור. הוא מוכן כאב-טיפוס עורך שנשמר פר חנות. אפשר לבנות בו מייל ולהפעיל דגל על זרימה. אי אפשר למסור הודעה, למדוד אותה, או לעמוד בהסרה. מול Klaviyo זו שכבת הגדרה, לא שכבת ביצוע.

---

## 14. Klaviyo Comparison Preparation

המטרה כאן היא מלאי מדויק, לא ציון דמיון.

### Campaign Management

קיים: ספריית מיילים עם שם, נושא, preview, בלוקים, מחיקה, ושיוך לאוטומציה. תבנית "מבצע לקהל" יוצרת flow עם מייל אחד.

מגבלות: אין ישות קמפיין, אין קהל נעול, אין תזמון, אין שליחה, אין שכפול, אין סטטוס מסירה, אין סטטיסטיקה אמיתית, ואין קמפיין חד-פעמי שנפרד מאוטומציה.

### Email Editor

קיים: עורך בלוקים ביתי, גרירה אנכית, טקסט, תמונה, לוגו, כפתור, שתי עמודות טקסט, רווח, קו, צבעים, פונטים עבריים, יישור, משתנים ויזואליים, תצוגת נושא בתיבה, העלאת תמונה.

מגבלות: אין ספריית עורך, אין HTML, אין תצוגת לקוח מייל, אין מובייל נפרד, אין בלוק מוצר, אין המלצות, אין מקטעים שמורים כספריית מודולים, ואין שליחת בדיקה אמיתית.

### Automations

קיים: בונה עץ, 12 טריגרים, המתנה, פיצול כן/לא, A/B באחוזים, מסלול מייל+SMS, סיום, תבניות עגלה / ברוכים הבאים / תודה / מבצע / winback, הפעלה שנשמרת.

מגבלות: אין executor, אין תור, אין המתנה אמיתית, אין הערכת תנאים, אין מניעת כפילות, אין ריצות, אין יום הולדת, וטריגר הצפייה במוצר לא סופר אירועים קיימים.

### Customer Segmentation

קיים: סינון חי לפי הוצאה, מספר הזמנות ומנוי. ארבעה פלחים קשיחים. חיפוש לקוחות. תגיות על לקוח. דגל מנוי.

מגבלות: פלח חדש לא נשמר. אין רשימה סטטית, אין חברות בפלח, אין עדכון אוטומטי, אין חיבור מהפלח אל flow מעבר לשדה טקסט חופשי, ואין היסטוריית הסכמה.

### Event Tracking

קיים: חמישה אירועי חנות על סשן, עם חנות, נתיב, סכום אופציונלי, ו-UTM על הסשן. הזמנה וסטטוס תשלום/אספקה במסחר. דגל מנוי על לקוח.

מגבלות: אין customer id על אירוע גלישה, אין אירועי מייל, אין ביטול הזמנה כאירוע, אין הפעלת flow, ואין ציר פעילות בפרופיל השיווקי.

### Deliverability

קיים: שמירת מפתח Resend וכתובת שולח פר חנות, הסתרת הסוד, ובדיקה שהדומיין מאומת אצל Resend.

מגבלות: אין שליחה, אין תור, אין warmup, אין ניהול DNS, אין bounce, אין תלונות, אין הסרה, אין דיכוי, אין לוג, אין webhook. אפס חנויות מחוברות בסביבה שנבדקה.

### Analytics

קיים: אנליטיקת הזמנות ותנועה, כולל ערוץ UTM. מונה מיילים בספרייה. סטטוס "מחובר" של הספק.

מגבלות: אין שיעורי דיוור. עמודות האוטומציה ריקות. "ביצועים לפי ערוץ שיווק" אינם ביצועי אימייל.

### Subscription Forms

קיים: מתג מנוי באדמין, ודגל `subscribed` במסד.

מגבלות: אין טופס, אין פופאפ, אין embed, אין double opt-in, ואין דף הסרה.

### AI Features

לא קיים. תיבת "תארו את הפלח" לא מפענחת משפט. היא מחפשת שלוש תת-מחרוזות. אין יצירת טקסט, אין בחירת שעת שליחה, ואין המלצת מוצר.

### Multi-Store Architecture

קיים: כל חנות היא `store_id`. הגדרות השיווק בשורת ההגדרות שלה. סודות הספק בטבלה פרטית פר חנות. מדיה בתיקייה של החנות. RLS על טבלאות החנות. אירועי חנות לא מקבלים store id מהלקוח אלא מ-tracking key.

מגבלות: מצב העורך בדפדפן הוא singleton. הרשאת הכתיבה של ה-RPC רחבה מחברות המסך. אין דומיין דיוור נפרד ממסחר מעבר לכתובת שולח אחת. אין מודול `email-marketing` ב-`store_modules` שמכבה את המסכים. המסמך `docs/multi-tenant-architecture.md` מזכיר `email-marketing` כמודול עתידי, והקוד הנוכחי לא רושם אותו שם.
