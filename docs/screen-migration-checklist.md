# מעקב המרת מסכים

מקור האמת: `Admin Prototype v2.dc.html`.

מסך נחשב הושלם רק כשהתוכן, העיצוב והאינטראקציות מהאב־טיפוס קיימים ב־React. כותרת או מעטפת בלבד אינן השלמה.

מצב הנתונים: נתוני דוגמה בזיכרון הדפדפן. רענון מאפס שינויים מקומיים. אין חיבור למסד נתונים.

| מסך באב־טיפוס | מסלול | קומפוננטות | קיים | עיצוב תואם | אינטראקציות | מה חסר |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `/admin` | `DashboardScreen`, `SalesChart`, `dashboard-widgets`, `AssistantCard` | כן | כן | כן | אין. אומת במחזור הקודם |
| Orders list | `/admin/orders` | `OrdersListScreen`, `IndexDock` | כן | כן | כן | בוחר עמודות וניהול תצוגות מציגים הודעה, כמו באב־טיפוס. כפתורי העימוד כבויים, כמו במקור |
| Abandoned checkouts | `/admin/orders/abandoned` | `AbandonedListScreen`, `IndexDock` | כן | כן | כן | כפתור „הכל” בלי פעולה, כמו באב־טיפוס |
| Abandoned checkout detail | `/admin/orders/abandoned/[id]` | `AbandonedDetailScreen`, `AssistantDock` | כן | כן | כן | „פעולות נוספות” בלי תפריט, כמו באב־טיפוס |
| Order details | `/admin/orders/[id]` | `OrderDetailScreen`, `FulfillDialog`, `RefundDialog` | כן | כן | כן | כפתורי החזרה, עריכה והדפסה בכותרת בלי פעולה, כמו באב־טיפוס. קישור לקוח ומוצר נפתח במסך האמיתי |
| Products list | `/admin/products` | `ProductsListScreen` | כן | כן | כן | בוחר עמודות, ייבוא ופעולות נוספות בלי תפריט, כמו באב־טיפוס. עימוד כבוי |
| Collections | `/admin/products/collections` | `CollectionsScreen` | כן | כן | כן | עימוד כבוי |
| Collection editor | `/admin/products/collections/[key]`, `/collections/new` | `CollectionEditorScreen` | כן | כן | כן | ספירת מוצרים ברשימה לאוסף שנשמר עם תנאים משוערת לפי המוצרים שנבחרו ידנית |
| Inventory | `/admin/products/inventory` | `InventoryScreen` | כן | כן | כן | עדכון כמות זמינה נשמר בזיכרון הדפדפן |
| Gift cards | `/admin/products/gift-cards` | `GiftCardsScreen` | כן | כן | כן | ייצוא כבוי כשאין כרטיסים |
| Product editor | `/admin/products/new`, `/admin/products/[id]` | `ProductEditorScreen` | כן | כן | כן | כפתורי העיצוב בסרגל התיאור חזותיים. כפתור העוזר ממלא תיאור |
| Customers list | `/admin/customers` | `CustomersListScreen` | כן | כן | כן | תיוג קבוצתי מציג הודעה. עימוד כבוי |
| Customer profile | `/admin/customers/[id]` | `CustomerProfileScreen` | כן | כן | כן | עריכת כתובת נשמרת בהערה. „יצירת הזמנה” מוביל לטיוטות, שעדיין placeholder |
| Customer segments | `/admin/customers/segments` | `SegmentsScreen` | כן | כן | כן | שמירת פלח חדש נשארת במסך הנוכחי ולא מוסיפה שורה קבועה לסרגל |
| Discounts list | `/admin/discounts` | `DiscountsListScreen` | כן | כן | כן | עימוד כבוי |
| Discount editor | `/admin/discounts/new`, `/admin/discounts/[id]` | `DiscountEditorScreen`, `DiscountNewScreen` | כן | כן | כן | שילובי הנחות נשמרים בטיוטה המקומית |
| Growth | `/admin/growth` | `GrowthScreen` | כן | כן | כן | „התחלה” מציג הודעה |
| Attribution | `/admin/growth/attribution` | `AttributionScreen` | כן | כן | כן | שינוי מודל הייחוס והדפסה מציגים הודעה |
| Blog posts | `/admin/content/posts` | `PostsScreen` | כן | כן | כן | המצב הראשון ריק, כמו באב־טיפוס. „ניהול בלוגים” מציג הודעה |
| Blog post editor | `/admin/content/posts/new`, `/admin/content/posts/[id]` | `PostEditorScreen` | כן | כן | כן | אין |
| Integrations | `/admin/marketing/integrations` | `IntegrationsScreen` | כן | כן | כן | אין |
| Automations | `/admin/marketing/automations` | `AutomationsScreen` | כן | כן | כן | אין |
| Automation editor | `/admin/marketing/automations/[id]` | `AutomationEditorScreen` | כן | כן | כן | שליחת בדיקה מציגה הודעה אל maya@lavana.co.il |
| Analytics | `/admin/analytics` | `AnalyticsScreen` | כן | כן | כן | „למה זה קורה?” ויעדים מציגים הודעה |
| Reports | `/admin/analytics/reports` | `ReportsScreen` | כן | כן | כן | לחיצה על דוח מציגה „גוף הדוח יעוצב בשלב 4”. אין גוף דוח באב־טיפוס |
| Live view | `/admin/analytics/live` | `LiveViewScreen`, `LiveGlobe` | כן | כן | כן | כדור הארץ מסתובב, זום ותוויות ערים. חיפוש המיקום חזותי, כמו באב־טיפוס |
| Design system | `/admin/design-system` | `DesignSystemScreen` | כן | כן | כן | מפרט סטטי, לא עורך טוקנים חי |

## יעדי placeholder באב־טיפוס

אלה אינם מסכים מעוצבים. האב־טיפוס עצמו מציג את מסך „שלב 4”. הרכיב `ModulePlaceholder` כבר תואם לטקסט הזה.

| יעד | מסלול | קיים | עיצוב תואם | אינטראקציות | מה חסר |
| --- | --- | --- | --- | --- | --- |
| טיוטות / יצירת הזמנה | `/admin/orders/drafts` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| החזרות והחזרים כספיים | `/admin/orders/returns` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| חברות | `/admin/customers/companies` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| עמודים | `/admin/online-store/pages` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| תפריטי ניווט | `/admin/online-store/menus` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| תוכן דף הבית | `/admin/online-store/home` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| באנרים | `/admin/online-store/banners` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין עיצוב להעביר |
| הגדרות | `/admin/settings` | כן, כ־placeholder | כן, לפי מסך שלב 4 | קישור חזרה לבית | אין מסך הגדרות באב־טיפוס |

## חלוניות ששייכות למסכים

| חלונית | מסך | קיים |
| --- | --- | --- |
| סימון כנשלח | Order details | כן. דורש מספר מעקב |
| החזר כספי | Order details | כן. כמות, דמי משלוח וחישוב סכום |
| מחיקת מוצרים | Products list | כן |
| בחירת סוג הנחה | Discounts list | כן. מוביל אל `/admin/discounts/new?type=` |
| חיבור אינטגרציה | Integrations | כן. כולל ולידציה וניתוק |
| יצירת כרטיס מתנה | Gift cards | כן |
| הוספת כתובת | Customer profile | כן. הכתובת החדשה נשמרת בהערת הלקוח |
