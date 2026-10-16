export function storeConnectionPrompt(input: {
  storeName: string;
  trackingKey: string;
  hosts: string[];
  supabaseUrl: string;
  publishableKey: string;
}) {
  const hosts = input.hosts.filter(Boolean);
  const hostLine = hosts.length ? hosts.join(" או ") : "הדומיין שמחובר לכרטיס החנות";

  const url = input.supabaseUrl || "כתובת הפרויקט של Storely";
  const key = input.publishableKey || "המפתח הציבורי של Storely";

  return `חבר את האתר הזה לחנות "${input.storeName}" ב-Storely. כל הקריאות רצות בשרת, לא בדפדפן. אל תשלח store_id.

חמישה משתני סביבה ב-Production. אל תמחק את זוג ה-NEXT_PUBLIC, הקטלוג קורא לו. המעקב קורא לזוג STORELY_.
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}
STORELY_SUPABASE_URL=${url}
STORELY_PUBLISHABLE_KEY=${key}
STORELY_TRACKING_KEY=${input.trackingKey}

מפתחות הסליקה נשארים באתר כמו שהם. Storely לא מחליף את חברת הסליקה. החיוב נשלח במטבע currency שמגיע מ-storefront_shop ומ-quote_storefront: ILS, USD או EUR. אחרי שהתשלום אושר באתר, השרת קורא ל-place_storefront_order.

hostname בכל קריאה הוא ה-Host ששירת את הבקשה, בלי פרוטוקול ובלי נתיב. שלח רק אם הוא ${hostLine}.
visitor_key נשמר בעוגייה: 16 עד 80 תווים, רק אותיות, ספרות, _ ו-.
כל קריאה היא POST אל {STORELY_SUPABASE_URL}/rest/v1/rpc/{שם}
עם כותרות apikey ו-authorization Bearer של STORELY_PUBLISHABLE_KEY,
ובגוף tracking_key ו-hostname.

מוצרים, קטגוריות, משלוחים, מדיניות ופוסטים נערכים ב-CMS ונטענים באתר מ-storefront_shop. שינוי ב-CMS מופיע באתר בטעינה הבאה. האתר לא כותב מוצרים בעצמו.
policies.items הוא מערך המסמכים: id, title, body כ-HTML, footer כ-boolean, ו-cart ו-checkout עם הערכים hidden, link או checkbox.
בפוטר הציגו קישור לכל מסמך עם footer=true. הקישור נפתח בעמוד /policies/{id} ומציג את title ואת body.
בעגלת הקניות הציגו לפי cart, ובדף התשלום לפי checkout: hidden לא מוצג, link הוא קישור, checkbox הוא תיבת סימון "קראתי ואני מסכים" עם קישור לאותו עמוד. אי אפשר להמשיך לתשלום בלי לסמן כל תיבת סימון שמופיעה בעגלה או בדף התשלום.
אם policies.items חסר, התייחסו לשדות return, privacy, terms, shipping, contact, legal ו-purchase כ-HTML של מסמכים מובנים, עם קישור בפוטר ובדף התשלום.
השדה currency ב-storefront_shop וב-quote_storefront הוא מטבע החנות: ILS, USD או EUR. הציגו את הסמל המתאים בכל מחיר בחנות ובסל.

קופון נוצר ב-CMS. בסל קוראים ל-quote_storefront עם lines, code, shipping_name, customer_email ו-gift_code. המחיר, ההנחה, המשלוח והמטבע מגיעים מהתשובה.

עגלה שננטשה נשמרת ב-save_storefront_checkout עם visitor_key, lines ופרטי הלקוח.

אחרי תשלום שהתקבל קוראים ל-place_storefront_order עם אותם שדות ועם payment_status בשם paid. זו ההזמנה, הלקוח, המלאי והקופון ב-CMS.

צפייה חיה, ניתוח ולוח הבקרה מגיעים מ-record_storefront_event:
page_view בכל עמוד,
add_to_cart כשמוצר נוסף לסל,
begin_checkout במעבר לתשלום,
purchase אחרי place_storefront_order, עם amount של סכום ההזמנה.
אם עיר או מדינה ידועות, שלח אותן ב-page_view.
ב-page_view שלח גם referrer (ה-Host של document.referrer), utm_source, utm_medium ו-utm_campaign מהכתובת שנחתה. אם אין ערך, שלח מחרוזת ריקה. מזה מגיע מסך הייחוס.`;
}
