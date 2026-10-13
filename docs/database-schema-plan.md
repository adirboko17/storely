# תכנון סכמת מסד הנתונים

הסכמה מיועדת לפרויקט Supabase מרכזי אחד, עם חנויות רבות. המיגרציה הוחלה על פרויקט הפיתוח `storely`. מפתחות ראשיים משתמשים ב־`gen_random_uuid()` כי Postgres 17.11 בפרויקט הזה אינו כולל `uuidv7()`.

כשיגיע הזמן, קובץ ה־SQL ייווצר עם כלי המיגרציה של Supabase, לא בשם ידני. לפני כן יש לאשר את גרסת Postgres ואת זמינות `uuidv7()`. עד אז מפתח ראשי מתוכנן כ־`uuid`. אם `uuidv7()` קיים בפרויקט, הוא ברירת המחדל כי הוא נשמר לפי זמן. אם אינו קיים, משתמשים ב־`gen_random_uuid()` ומציינים זאת במיגרציה.

## כללי המודל

כל טבלה שמחזיקה מידע של חנות כוללת `store_id uuid not null`.

לכל טבלה כזו:

- מפתח ראשי על `id`.
- אילוץ `unique (store_id, id)`, כדי שמפתח זר מורכב יוכל להצביע עליו.
- מפתח זר `store_id → stores.id`.
- אינדקס שמתחיל ב־`store_id` לכל שאילתה תפעולית. האילוץ `unique (store_id, id)` כבר משרת סינון לפי חנות. עמודות סינון נוספות נכנסות לאינדקס מורכב שאחרי `store_id`, שוויון לפני טווח.
- RLS מופעל, וגם `FORCE ROW LEVEL SECURITY`.
- אין `GRANT` ל־`anon` על טבלאות ניהול. `authenticated` מקבל הרשאות רק אחרי שהמדיניות כתובה.
- תצוגה, אם תיווצר, תוגדר עם `security_invoker = true`.

מפתח זר אל שורה של חנות אחרת נכשל גם כשמזהה השורה קיים. הילד נושא את אותו `store_id` ומצביע אל `(store_id, parent_id)`.

```sql
-- צורה מתוכננת. זה אינו קובץ מיגרציה.
unique (store_id, id)

-- product_variants
foreign key (store_id, product_id)
  references products (store_id, id)
```

עדכון שמשנה `store_id` לשורה של חנות אחרת נדחה גם במפתח הזר וגם ב־`WITH CHECK` של המדיניות. מדיניות עדכון כוללת `USING` וגם `WITH CHECK`. בלי `WITH CHECK` אפשר להעביר שורה לחנות אחרת.

## זהות, חברות ומודולים

### `stores`

`id`, `name`, `status` (`active` או `disabled`), `environment` (`production` או `development`), `core_version`, `created_at`.

חנות כבויה אינה נפתחת בדומיין ואינה מקבלת כתיבה חדשה.

### `store_domains`

`id`, `store_id`, `hostname`, `environment`, `verified_at`.

`hostname` ייחודי בכל המסד. דומיין פעיל הוא שורה עם `verified_at` מלא וסביבה זהה לסביבת החנות. אימות הסביבה נאכף במיגרציה, כדי שדומיין פיתוח לא יפתור חנות ייצור.

אינדקס ייחודי על `hostname`. אינדקס על `(store_id)`.

### `store_settings`

שורה אחת לחנות: `store_id` כמפתח ראשי, מטבע, שפה, שם תצוגה, והגדרות תפעול שאינן מודול. מפתח זר אל `stores.id`.

### `store_members`

`store_id`, `user_id` אל `auth.users`, `role_id`, `display_name`, `status` (`active`, `invited`, `disabled`), `created_at`.

ייחודיות על `(store_id, user_id)`. מפתח זר מורכב `(store_id, role_id) → roles (store_id, id)`. אינדקס על `(user_id, store_id)` למציאת החנויות של אדם. אינדקס חלקי על חברות `active`, כי מדיניות RLS שואלת אותו בכל בקשה.

אותו אדם מופיע בכמה שורות אם הוא חבר בכמה חנויות. התפקיד בכל שורה עצמאי.

### `roles`

התפקידים המובנים מועתקים אל כל חנות בזמן יצירתה: `owner`, `admin`, `manager`, `staff`. תפקיד מותאם נוצר כשורה נוספת של אותה חנות.

`id`, `store_id`, `key`, `name`, `built_in`. ייחודיות על `(store_id, key)` ועל `(store_id, id)`.

כך אין תפקיד גלובלי שאפשר לשתף בטעות בין חנויות, והמפתח הזר של החברות נשאר מורכב.

### `permissions`

קטלוג מפתחות גלובלי: `key` כמפתח ראשי, ותיאור. כאן נשמרים מפתחות הליבה (`products.read`, `orders.update`, `settings.manage`) ומפתחות שמודול מוסיף (`loyalty.read`). זו רשימת המפתחות החוקיים, לא הרשאה של משתמש.

### `role_permissions`

`store_id`, `role_id`, `permission_key`. מפתח ראשי על שלושתם. מפתח זר מורכב אל `roles`, ומפתח זר אל `permissions.key`.

בעל חנות מקבל את כל מפתחות הקטלוג, כולל מפתח שמודול יוסיף אחר כך, דרך כלל בעל החנות בשכבת האפליקציה ובפונקציית הבדיקה. שאר התפקידים מקבלים שורות מפורשות. התקנת מודול מוסיפה את `suggestedGrants` רק לתפקידי אותה חנות.

### `store_modules`

`store_id`, `module_id`, `version`, `enabled`, `installed_at`. מפתח ראשי על `(store_id, module_id)`.

היעדר שורה הוא «לא מותקן». `enabled = false` הוא «מותקן וכבוי». מדיניות הכתיבה לטבלאות של מודול דורשת שורה פעילה בחנות הזו, בנוסף להרשאת המודול.

### `platform_operators`

`user_id`, `permission_key`. מפתח ראשי על שניהם. אין `store_id`.

הטבלה אינה נפתחת לקריאה כללית של `authenticated`. הבדיקה יושבת בפונקציה בסכמה `private`.

## מסחר ותוכן

בכל הטבלאות הבאות יש `id`, `store_id`, `created_at`, ו־`unique (store_id, id)`, אלא אם צוין מפתח אחר.

| טבלה | קשרים שחייבים להישאר בתוך אותה חנות | אינדקס תפעולי |
| --- | --- | --- |
| `products` | — | `(store_id, status, updated_at desc)` |
| `product_variants` | `(store_id, product_id) → products` | `(store_id, sku)` ייחודי כשה־SKU מלא |
| `product_media` | `(store_id, product_id) → products` | `(store_id, product_id, position)` |
| `collections` | — | `(store_id, handle)` ייחודי |
| `collection_products` | אל `collections` ואל `products` באותו `store_id` | מפתח ראשי `(store_id, collection_id, product_id)` |
| `inventory_items` | `(store_id, variant_id) → product_variants` | `(store_id, variant_id)` ייחודי |
| `inventory_movements` | `(store_id, inventory_item_id) → inventory_items` | `(store_id, created_at desc)` |
| `customers` | — | `(store_id, email)` |
| `customer_addresses` | `(store_id, customer_id) → customers` | `(store_id, customer_id)` |
| `orders` | `(store_id, customer_id) → customers`, כשיש לקוח | `(store_id, created_at desc)`, `(store_id, financial_status)`, `(store_id, fulfillment_status)` |
| `order_items` | אל `orders` ואל `product_variants` באותו `store_id` | `(store_id, order_id)` |
| `payments` | `(store_id, order_id) → orders` | `(store_id, order_id)` |
| `refunds` | `(store_id, payment_id) → payments` | `(store_id, payment_id)` |
| `shipments` | `(store_id, order_id) → orders` | `(store_id, order_id)` |
| `discounts` | — | `(store_id, code)` ייחודי כשיש קוד |
| `pages` | — | `(store_id, handle)` ייחודי |
| `content_blocks` | `(store_id, page_id) → pages` | `(store_id, page_id, position)` |
| `audit_logs` | הישות המתועדת שייכת לאותה חנות | `(store_id, created_at desc)` |

`collection_products` היא טבלת הקשר הכרחית. בלי מפתח מורכב, אוסף של חנות אחת יכול להצביע על מוצר של חנות אחרת.

לקוח עם אותו אימייל בשתי חנויות הוא שתי שורות. אין מיזוג של פרטי לקוח בין חנויות.

`audit_logs` שומר `actor_user_id`, פעולה, סוג ישות ומזהה ישות. הוא אינו מעתיק לתוכו שורות של חנות אחרת. קריאה בו דורשת הרשאת ניהול של אותה חנות.

Postgres אינו יוצר אינדקס אוטומטי על עמודות של מפתח זר. כל מפתח זר מורכב מקבל אינדקס על אותן עמודות, אם אילוץ ייחודיות אינו מכסה אותן כבר.

## RLS

הבדיקה המשותפת יושבת בסכמה `private`, שאינה חשופה ב־Data API:

```sql
-- צורה מתוכננת. זה אינו קובץ מיגרציה.
-- security definer, search_path ריק, ו-auth.uid() בתוך הפונקציה.
-- execute נשלל מ-PUBLIC, anon ו-authenticated.
private.has_store_permission(target_store uuid, permission_key text) returns boolean
```

הפונקציה מחזירה אמת רק כש־`auth.uid()` הוא חבר פעיל ב־`target_store` ויש לו את המפתח, או שהוא בעל החנות שלה. היא אינה קוראת ערך שהמשתמש יכול לערוך ב־JWT.

מדיניות נפרדת לכל פעולה. `TO authenticated` לבדו אינו תנאי. `auth.role()` אינו בשימוש.

```sql
-- צורה מתוכננת עבור orders.
create policy orders_select on orders
  for select to authenticated
  using ((select private.has_store_permission(store_id, 'orders.read')));

create policy orders_update on orders
  for update to authenticated
  using ((select private.has_store_permission(store_id, 'orders.update')))
  with check ((select private.has_store_permission(store_id, 'orders.update')));
```

הקריאה לפונקציה עטופה ב־`select`, כדי שהיא תחושב פעם אחת לבקשה ולא לכל שורה. עמודות החברות שמופיעות בבדיקה ממופתחות.

יצירה דורשת את הרשאת היצירה ב־`WITH CHECK`. מחיקה דורשת את הרשאת המחיקה ב־`USING`. עדכון דורש גם מדיניות `SELECT`, כי Postgres קורא את השורה לפני שהוא מעדכן אותה.

`stores` נקראת על ידי משתמש מחובר רק עבור חנויות שהוא חבר בהן. רשימת כל החנויות שייכת לבדיקת `platform.stores.read`.

## Storage

דלי מדיה אחד לפלטפורמה. הנתיב מתחיל ב־`store_id`. המדיניות משווה את התיקייה הראשונה לחברות של `auth.uid()`. אין מדיניות ציבורית על הדלי כולו. קובץ שמיועד לאתר החנות יוצא בכתובת חתומה, או מסומן בשורה ב־`product_media` שהקריאה הציבורית המותרת היא רק אליו.

## Checkout

טבלת `orders` אינה פתוחה לכתיבה של `anon`. פעולת הקופה היא פונקציה צרה:

1. מקבלת hostname ופרטי הזמנה.
2. מתעלמת מכל `store_id` בתוך הפרטים.
3. פותרת דומיין מאומת בסביבה הנכונה.
4. כותבת הזמנה ופריטים רק עם ה־`store_id` הזה.
5. מחזירה את מזהה ההזמנה.

הפונקציה יושבת בסכמה `private` עם מעטפת מצומצמת. היא אינה רצה כ־`service_role` מתוך פעולת המשתמש, והיא אינה מקבלת מזהה חנות כאמין מהדפדפן.

## מיגרציות ותאימות

היסטוריית המיגרציות היא אחת לכל המסד, כי כל החנויות חולקות אותו. שדרוג סכמה חל על הפלטפורמה. הוא אינו רץ «לחנות אחת» בנפרד.

כל שינוי שומר על אתרים שכבר רצים:

- מוסיפים עמודה עם ברירת מחדל, או כעמודה שאפשר להשאיר ריקה.
- כותבים אל העמודה החדשה לפני שמתחילים לקרוא רק ממנה.
- מסירים עמודה ישנה רק אחרי שכל פריסות החנויות הפסיקו לקרוא אותה.
- מודול חדש מוסיף טבלאות. הוא אינו מוסיף שורות `store_modules` לכל החנויות.
- מפתח הרשאה חדש נוסף ל־`permissions`. הוא אינו מוענק לבד לכל התפקידים, מלבד כלל בעל החנות.

פריסה ישנה ממשיכה לעבוד מול סכמה חדשה כל עוד לא הוסרה עמודה שהיא קוראת. פריסה חדשה ממתינה עם קוד שדורש עמודה עד שהמיגרציה הוחלה.

## גיבוי ושחזור של חנות אחת

גיבוי מלא ושחזור לנקודת זמן מחזירים את כל החנויות לאותו רגע. אי אפשר להחזיר חנות אחת אחורה בלי להחזיר גם את השכנות, כל עוד כולן באותו מסד.

לשחזור חנות בודדת נשמר ייצוא לוגי תקופתי, מסונן לפי `store_id`, בסדר ששומר על המפתחות הזרים: חנות, הגדרות, חברים, קטלוג, מלאי, לקוחות, הזמנות, תשלומים, תוכן, מודולים, יומן.

המגבלות:

- `auth.users` הוא גלובלי. שחזור חנות אינו מוחק משתמש שחבר גם בחנות אחרת.
- שחזור שמוחק שורות לפי `store_id` חייב למחוק ילדים לפני הורים. המפתחות המורכבים מונעים חיבור של השורות המשוחזרות לחנות אחרת, והם גם כופים את סדר המחיקה.
- קבצי Storage של החנות מגובים בנפרד לפי קידומת התיקייה. שחזור טבלה בלי הקבצים משאיר מדיה שבורה.
- יומן הביקורת גדול. ייצוא חנות כולל רק את השורות שלה, לא את יומן הפלטפורמה כולה.
- חלון הזמן של הייצוא הלוגי רחב מחלון ה־PITR. אירוע שקרה אחרי הייצוא האחרון אינו ניתן לשחזור לחנות אחת בלי להזיז את כל המסד.

לכן גיבוי הפלטפורמה נשען על PITR של כל המסד, והייצוא לפי חנות הוא כלי תפעולי לחנות שנפגעה, עם חלון אובדן שצריך להיות ידוע מראש.
