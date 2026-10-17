import type { AttributionChannel } from "@/app/admin/traffic";
import type { StoreTraffic } from "@/data/live/traffic";
import type { ResolvedOrder } from "@/lib/orders/present";
import type { Product } from "@/types/commerce";

export type ReportAuthor = "storely" | "me";
export type ReportFormat = "integer" | "money" | "percent";

export type ReportDefinition = {
  id: string;
  name: string;
  category: string;
  author: ReportAuthor;
  metric: string;
  dimension: string;
  format: ReportFormat;
  kind: "trend" | "breakdown";
};

export type ReportPoint = {
  label: string;
  current: number;
  previous: number;
};

export type BuiltReport = {
  definition: ReportDefinition;
  total: number;
  previous: number;
  delta: number | null;
  currentLabel: string;
  previousLabel: string;
  points: ReportPoint[];
  axis: string[];
  note: string;
  refreshed: string;
};

export const REPORT_SEEN_KEY = "storely-report-seen";

export const REPORTS: ReportDefinition[] = [
  { id: "new-vs-returning", name: "לקוחות חדשים מול חוזרים", category: "לקוחות", author: "storely", metric: "לקוחות", dimension: "סוג לקוח", format: "integer", kind: "breakdown" },
  { id: "visits-by-location", name: "ביקורים לפי מיקום", category: "רכישת לקוחות", author: "storely", metric: "ביקורים", dimension: "מיקום", format: "integer", kind: "breakdown" },
  { id: "visits-by-social", name: "ביקורים לפי רשת חברתית מפנה", category: "רכישת לקוחות", author: "storely", metric: "ביקורים", dimension: "רשת", format: "integer", kind: "breakdown" },
  { id: "sessions-over-time", name: "ביקורים לאורך זמן", category: "רכישת לקוחות", author: "storely", metric: "ביקורים", dimension: "יום", format: "integer", kind: "trend" },
  { id: "sales-over-time", name: "סך המכירות לאורך זמן", category: "מכירות", author: "storely", metric: "מכירות", dimension: "יום", format: "money", kind: "trend" },
  { id: "orders-over-time", name: "הזמנות לאורך זמן", category: "הזמנות", author: "storely", metric: "הזמנות", dimension: "יום", format: "integer", kind: "trend" },
  { id: "fulfilled-over-time", name: "הזמנות שנשלחו לאורך זמן", category: "הזמנות", author: "storely", metric: "הזמנות שנשלחו", dimension: "יום", format: "integer", kind: "trend" },
  { id: "items-over-time", name: "פריטים שהוזמנו לאורך זמן", category: "הזמנות", author: "storely", metric: "פריטים", dimension: "יום", format: "integer", kind: "trend" },
  { id: "sales-by-product", name: "סך המכירות לפי מוצר", category: "מכירות", author: "storely", metric: "מכירות", dimension: "מוצר", format: "money", kind: "breakdown" },
  { id: "fulfillment-time", name: "זמן מהזמנה עד משלוח", category: "הזמנות", author: "storely", metric: "הזמנות", dimension: "סטטוס משלוח", format: "integer", kind: "breakdown" },
  { id: "returning-rate", name: "שיעור לקוחות חוזרים לאורך זמן", category: "לקוחות", author: "storely", metric: "שיעור חוזרים", dimension: "יום", format: "percent", kind: "trend" },
  { id: "sales-by-discount", name: "מכירות לפי קוד הנחה", category: "מכירות", author: "me", metric: "מכירות", dimension: "קוד הנחה", format: "money", kind: "breakdown" },
  { id: "visits-by-referrer", name: "ביקורים לפי אתר מפנה", category: "רכישת לקוחות", author: "storely", metric: "ביקורים", dimension: "אתר מפנה", format: "integer", kind: "breakdown" },
  { id: "visitors-over-time", name: "מבקרים לאורך זמן", category: "רכישת לקוחות", author: "storely", metric: "ביקורים", dimension: "יום", format: "integer", kind: "trend" },
  { id: "visitors-now", name: "מבקרים כעת", category: "רכישת לקוחות", author: "storely", metric: "מבקרים כעת", dimension: "מיקום", format: "integer", kind: "breakdown" },
  { id: "bounce-rate", name: "שיעור נטישה לאורך זמן", category: "התנהגות", author: "storely", metric: "שיעור נטישה", dimension: "יום", format: "percent", kind: "trend" },
  { id: "checkout-conversion", name: "שיעור המרה בקופה לאורך זמן", category: "התנהגות", author: "storely", metric: "המרה בקופה", dimension: "יום", format: "percent", kind: "trend" },
  { id: "conversion-breakdown", name: "פירוט שיעור ההמרה", category: "התנהגות", author: "storely", metric: "כמות", dimension: "שלב", format: "integer", kind: "breakdown" },
  { id: "conversion-over-time", name: "שיעור המרה לאורך זמן", category: "התנהגות", author: "storely", metric: "שיעור המרה", dimension: "יום", format: "percent", kind: "trend" },
  { id: "customer-behavior", name: "התנהגות לקוחות", category: "התנהגות", author: "storely", metric: "כמות", dimension: "שלב", format: "integer", kind: "breakdown" },
  { id: "recommendation-conversions", name: "המרות מהמלצות מוצרים לאורך זמן", category: "התנהגות", author: "storely", metric: "המרות", dimension: "יום", format: "integer", kind: "trend" },
  { id: "inventory-value", name: "ערך מלאי לפי מוצר", category: "מלאי", author: "storely", metric: "ערך מלאי", dimension: "מוצר", format: "money", kind: "breakdown" },
  { id: "out-of-stock", name: "מוצרים שאזלו מהמלאי", category: "מלאי", author: "storely", metric: "מוצרים", dimension: "מוצר", format: "integer", kind: "breakdown" },
  { id: "vat-by-month", name: "מע״מ שנגבה לפי חודש", category: "כספים", author: "storely", metric: "מע״מ", dimension: "חודש", format: "money", kind: "breakdown" },
  { id: "payments-by-method", name: "תשלומים לפי אמצעי תשלום", category: "כספים", author: "storely", metric: "תשלומים", dimension: "סטטוס", format: "money", kind: "breakdown" },
  { id: "gross-profit", name: "רווח גולמי לפי מוצר", category: "כספים", author: "me", metric: "רווח גולמי", dimension: "מוצר", format: "money", kind: "breakdown" },
];

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
const MONTHS_FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const DAY_MS = 86400000;

export function reportById(id: string) {
  return REPORTS.find((report) => report.id === id) ?? null;
}

export function readReportSeen(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REPORT_SEEN_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function rememberReportSeen(id: string) {
  const next = { ...readReportSeen(), [id]: new Date().toISOString() };
  window.localStorage.setItem(REPORT_SEEN_KEY, JSON.stringify(next));
  return next;
}

export function formatSeen(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ב${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

type ReportInput = {
  traffic: StoreTraffic;
  orders: ResolvedOrder[];
  products: Product[];
  channels: AttributionChannel[];
};

type ReportWindow = { start: Date; end: Date };

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(date: Date) {
  return `${date.getDate()} ב${MONTHS[date.getMonth()]}`;
}

function formatSpan(start: Date, end: Date) {
  if (dayKey(start) === dayKey(end)) return `${formatDay(start)} ${start.getFullYear()}`;
  return `${formatDay(start)}–${formatDay(end)} ${end.getFullYear()}`;
}

function eachDay(start: Date, end: Date) {
  const days: Date[] = [];
  for (let cursor = startOfDay(start); cursor.getTime() <= startOfDay(end).getTime(); cursor = addDays(cursor, 1)) days.push(cursor);
  return days.length ? days : [startOfDay(end)];
}

function offsetFromToday(date: Date, today: Date) {
  return Math.round((startOfDay(today).getTime() - startOfDay(date).getTime()) / DAY_MS);
}

function seriesAt(recent: number[], earlier: number[], offset: number) {
  if (offset < 0) return 0;
  if (offset < recent.length) return recent[recent.length - 1 - offset] ?? 0;
  const earlierOffset = offset - recent.length;
  return earlierOffset >= 0 && earlierOffset < earlier.length ? earlier[earlier.length - 1 - earlierOffset] ?? 0 : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function orderTime(order: ResolvedOrder) {
  if (!order.at) return null;
  const date = new Date(order.at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function net(order: ResolvedOrder) {
  return Math.max(0, order.total - order.refundedAmount);
}

function customerKey(order: ResolvedOrder) {
  const email = order.customer.email.trim().toLowerCase();
  if (email) return email;
  if (order.customer.id > 0) return `id:${order.customer.id}`;
  const name = order.customerName.trim().toLowerCase();
  return name || `order:${order.id}`;
}

function productLabel(title: string, variant: string) {
  return variant ? `${title} — ${variant}` : title;
}

function axisFor(points: ReportPoint[], hourly: boolean) {
  if (!points.length) return [];
  if (hourly) return ["00:00", "06:00", "12:00", "18:00"];
  if (points.length === 1) return [points[0]?.label ?? ""];
  return [0, 1, 2, 3].map((step) => points[Math.round(((points.length - 1) * step) / 3)]?.label ?? "");
}

function finish(
  definition: ReportDefinition,
  window: ReportWindow,
  length: number,
  points: ReportPoint[],
  note: string,
  hourly = false,
  totals?: { current: number; previous: number },
): BuiltReport {
  const current = totals?.current ?? sum(points.map((point) => point.current));
  const previous = totals?.previous ?? sum(points.map((point) => point.previous));
  const previousStart = addDays(window.start, -length);
  const previousEnd = addDays(window.start, -1);
  return {
    definition,
    total: current,
    previous,
    delta: change(current, previous),
    currentLabel: formatSpan(window.start, window.end),
    previousLabel: formatSpan(previousStart, previousEnd),
    points,
    axis: axisFor(points, hourly),
    note,
    refreshed: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };
}

function ranked(rows: Map<string, { current: number; previous: number }>) {
  return [...rows.entries()]
    .map(([label, value]) => ({ label, current: value.current, previous: value.previous }))
    .filter((row) => row.current || row.previous)
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
}

export function buildReport(id: string, window: ReportWindow, today: Date, input: ReportInput): BuiltReport | null {
  const definition = reportById(id);
  if (!definition) return null;
  const anchor = startOfDay(today);
  const start = startOfDay(window.start);
  const end = startOfDay(window.end);
  const days = eachDay(start, end);
  const length = days.length;
  const previousStart = addDays(start, -length);
  const previousEnd = addDays(start, -1);
  const dated = input.orders.flatMap((order) => {
    const at = orderTime(order);
    return at ? [{ order, at }] : [];
  });
  const inSpan = (at: Date, from: Date, to: Date) => {
    const time = startOfDay(at).getTime();
    return time >= startOfDay(from).getTime() && time <= startOfDay(to).getTime();
  };
  const currentOrders = dated.filter((item) => inSpan(item.at, start, end));
  const previousOrders = dated.filter((item) => inSpan(item.at, previousStart, previousEnd));
  const firstSeen = new Map<string, number>();
  dated.forEach((item) => {
    const key = customerKey(item.order);
    const time = item.at.getTime();
    const known = firstSeen.get(key);
    if (known == null || time < known) firstSeen.set(key, time);
  });

  const trafficField = (field: "sales" | "orders" | "visits") => {
    const recent = input.traffic.days[field];
    const earlier = input.traffic.days[field === "sales" ? "previousSales" : field === "orders" ? "previousOrders" : "previousVisits"];
    if (length === 1) {
      const offset = offsetFromToday(days[0] ?? anchor, anchor);
      if (offset === 0 || offset === 1) {
        const currentHours = field === "sales"
          ? (offset === 0 ? input.traffic.today.salesByHour : input.traffic.yesterday.salesByHour)
          : field === "orders"
            ? (offset === 0 ? input.traffic.today.ordersByHour : input.traffic.yesterday.ordersByHour)
            : (offset === 0 ? input.traffic.today.visitsByHour : input.traffic.yesterday.visitsByHour);
        const previousHours = offset === 0
          ? (field === "sales" ? input.traffic.yesterday.salesByHour : field === "orders" ? input.traffic.yesterday.ordersByHour : input.traffic.yesterday.visitsByHour)
          : currentHours.map(() => 0);
        return {
          hourly: true,
          points: currentHours.map((value, hour) => ({
            label: `${String(hour).padStart(2, "0")}:00`,
            current: value,
            previous: previousHours[hour] ?? 0,
          })),
        };
      }
    }
    return {
      hourly: false,
      points: days.map((day) => ({
        label: formatDay(day),
        current: seriesAt(recent, earlier, offsetFromToday(day, anchor)),
        previous: seriesAt(recent, earlier, offsetFromToday(day, anchor) + length),
      })),
    };
  };

  const orderTrend = (pick: (order: ResolvedOrder) => number) => days.map((day) => ({
    label: formatDay(day),
    current: sum(currentOrders.filter((item) => dayKey(item.at) === dayKey(day)).map((item) => pick(item.order))),
    previous: sum(previousOrders.filter((item) => dayKey(item.at) === dayKey(addDays(day, -length))).map((item) => pick(item.order))),
  }));

  if (id === "sessions-over-time" || id === "visitors-over-time") {
    const series = trafficField("visits");
    return finish(definition, window, length, series.points, id === "visitors-over-time"
      ? "מבקרים ייחודיים לא נשמרים לפי יום, ולכן הדוח מציג ביקורים בעמודים."
      : "ביקורים בעמודים מהאתר, לפי הטווח שנבחר.", series.hourly);
  }

  if (id === "sales-over-time") {
    const series = trafficField("sales");
    return finish(definition, window, length, series.points, "סך הרכישות שנרשמו באתר.", series.hourly);
  }

  if (id === "orders-over-time") {
    const series = trafficField("orders");
    return finish(definition, window, length, series.points, "מספר הרכישות שנרשמו באתר.", series.hourly);
  }

  if (id === "conversion-over-time") {
    const visits = trafficField("visits");
    const orders = trafficField("orders");
    const points = visits.points.map((point, index) => {
      const orderPoint = orders.points[index];
      return {
        label: point.label,
        current: point.current ? ((orderPoint?.current ?? 0) / point.current) * 100 : 0,
        previous: point.previous ? ((orderPoint?.previous ?? 0) / point.previous) * 100 : 0,
      };
    });
    const visitTotal = sum(visits.points.map((point) => point.current));
    const visitBefore = sum(visits.points.map((point) => point.previous));
    const orderTotal = sum(orders.points.map((point) => point.current));
    const orderBefore = sum(orders.points.map((point) => point.previous));
    return finish(definition, window, length, points, "אחוז הביקורים שהסתיימו ברכישה.", visits.hourly, {
      current: visitTotal ? (orderTotal / visitTotal) * 100 : 0,
      previous: visitBefore ? (orderBefore / visitBefore) * 100 : 0,
    });
  }

  if (id === "fulfilled-over-time") {
    return finish(definition, window, length, orderTrend((order) => (order.fulfillment === "fulfilled" || order.fulfillment === "partial" ? 1 : 0)), "הזמנות שסומנו כנשלחו, לפי תאריך ההזמנה.");
  }

  if (id === "items-over-time") {
    return finish(definition, window, length, orderTrend((order) => order.quantity), "כמות הפריטים בתוך ההזמנות של הטווח.");
  }

  if (id === "returning-rate") {
    const rate = (rows: typeof currentOrders) => {
      const orders = rows.length;
      const returning = rows.filter((item) => (firstSeen.get(customerKey(item.order)) ?? item.at.getTime()) < startOfDay(item.at).getTime()).length;
      return orders ? (returning / orders) * 100 : 0;
    };
    const points = days.map((day) => ({
      label: formatDay(day),
      current: rate(currentOrders.filter((item) => dayKey(item.at) === dayKey(day))),
      previous: rate(previousOrders.filter((item) => dayKey(item.at) === dayKey(addDays(day, -length)))),
    }));
    return finish(definition, window, length, points, "החלק של ההזמנות שהגיעו מלקוח שכבר הזמין קודם.", false, {
      current: rate(currentOrders),
      previous: rate(previousOrders),
    });
  }

  if (id === "checkout-conversion") {
    const includesToday = days.some((day) => offsetFromToday(day, anchor) === 0);
    const current = input.traffic.today.checkouts ? (input.traffic.today.orders / input.traffic.today.checkouts) * 100 : 0;
    return finish(
      definition,
      window,
      length,
      includesToday ? [{ label: formatDay(anchor), current, previous: 0 }] : [],
      "הגעה לתשלום נשמרת רק ליום הנוכחי. השיעור הוא רכישות מתוך מי שהגיעו לתשלום.",
      false,
      { current: includesToday ? current : 0, previous: 0 },
    );
  }

  if (id === "bounce-rate") {
    return finish(definition, window, length, [], "שיעור נטישה לא נמדד. המערכת שומרת ביקורים ורכישות, בלי לרשום יציאה מעמוד.", false, { current: 0, previous: 0 });
  }

  if (id === "recommendation-conversions") {
    return finish(definition, window, length, [], "אין מעקב אחרי קליקים על המלצות מוצרים, ולכן אין המרות להציג.", false, { current: 0, previous: 0 });
  }

  if (id === "visitors-now") {
    const points = input.traffic.now.locations.map((place) => ({ label: place.label, current: place.count, previous: 0 }));
    return finish(definition, window, length, points, "המספר הוא מי שנמצא באתר עכשיו, והפירוט הוא לפי המיקום שלהם.", false, {
      current: input.traffic.now.visitors,
      previous: 0,
    });
  }

  if (id === "visits-by-location") {
    const includesToday = days.some((day) => offsetFromToday(day, anchor) === 0);
    const points = includesToday
      ? input.traffic.today.locations.map((place) => ({ label: place.label, current: place.count, previous: 0 }))
      : [];
    return finish(definition, window, length, points, "מיקום הביקורים נשמר ליום הנוכחי.", false, {
      current: sum(points.map((point) => point.current)),
      previous: 0,
    });
  }

  const channelPoints = (matches: (channel: AttributionChannel) => boolean) => {
    const rows = new Map<string, { current: number; previous: number }>();
    input.channels.filter(matches).forEach((channel) => {
      const current = sum(days.map((day) => {
        const index = channel.days.length - 1 - offsetFromToday(day, anchor);
        return index >= 0 && index < channel.days.length ? channel.days[index] ?? 0 : 0;
      }));
      const previous = sum(days.map((day) => {
        const index = channel.days.length - 1 - offsetFromToday(addDays(day, -length), anchor);
        return index >= 0 && index < channel.days.length ? channel.days[index] ?? 0 : 0;
      }));
      rows.set(channel.channel, { current, previous });
    });
    return ranked(rows);
  };

  if (id === "visits-by-social") {
    return finish(definition, window, length, channelPoints((channel) => channel.type === "חברתי" || channel.channel === "רשת חברתית"), "ביקורים שהגיעו מרשת חברתית, ב-30 הימים האחרונים שיש עבורם פירוט.");
  }

  if (id === "visits-by-referrer") {
    return finish(definition, window, length, channelPoints((channel) => channel.type === "הפניה"), "אתרים שהפנו ביקורים לחנות, ב-30 הימים האחרונים שיש עבורם פירוט.");
  }

  if (id === "new-vs-returning") {
    const count = (rows: typeof currentOrders, from: Date) => {
      const seen = new Set<string>();
      let fresh = 0;
      let returning = 0;
      rows.forEach((item) => {
        const key = customerKey(item.order);
        if (seen.has(key)) return;
        seen.add(key);
        if ((firstSeen.get(key) ?? item.at.getTime()) >= startOfDay(from).getTime()) fresh += 1;
        else returning += 1;
      });
      return { fresh, returning };
    };
    const current = count(currentOrders, start);
    const previous = count(previousOrders, previousStart);
    return finish(definition, window, length, [
      { label: "לקוחות חדשים", current: current.fresh, previous: previous.fresh },
      { label: "לקוחות חוזרים", current: current.returning, previous: previous.returning },
    ].filter((row) => row.current || row.previous), "לקוח חדש הוא מי שההזמנה הראשונה שלו נמצאת בטווח. לקוח חוזר כבר הזמין לפני כן.", false, {
      current: current.fresh + current.returning,
      previous: previous.fresh + previous.returning,
    });
  }

  if (id === "sales-by-product" || id === "gross-profit") {
    const rows = new Map<string, { current: number; previous: number }>();
    const add = (source: typeof currentOrders, key: "current" | "previous") => {
      source.forEach((item) => {
        item.order.lines.forEach((line) => {
          const label = productLabel(line.product.title, line.product.variant);
          const amount = id === "gross-profit" ? (line.product.price - line.product.cost) * line.quantity : line.product.price * line.quantity;
          const row = rows.get(label) ?? { current: 0, previous: 0 };
          row[key] += amount;
          rows.set(label, row);
        });
      });
    };
    add(currentOrders, "current");
    add(previousOrders, "previous");
    return finish(definition, window, length, ranked(rows), id === "gross-profit" ? "מחיר המכירה פחות העלות, כפול הכמות שהוזמנה." : "מכירות לפי המוצרים שהוזמנו בטווח.");
  }

  if (id === "sales-by-discount") {
    const rows = new Map<string, { current: number; previous: number }>();
    const add = (source: typeof currentOrders, key: "current" | "previous") => {
      source.forEach((item) => {
        const code = item.order.discount?.[0];
        if (!code) return;
        const row = rows.get(code) ?? { current: 0, previous: 0 };
        row[key] += net(item.order);
        rows.set(code, row);
      });
    };
    add(currentOrders, "current");
    add(previousOrders, "previous");
    return finish(definition, window, length, ranked(rows), "סך ההזמנות שהשתמשו בכל קוד הנחה.");
  }

  if (id === "fulfillment-time") {
    const labels: Record<string, string> = { fulfilled: "נשלח", partial: "נשלח חלקית", unfulfilled: "לא נשלח", onhold: "בהמתנה", progress: "בטיפול" };
    const rows = new Map<string, { current: number; previous: number }>();
    const add = (source: typeof currentOrders, key: "current" | "previous") => {
      source.forEach((item) => {
        const label = labels[item.order.fulfillment] ?? item.order.fulfillment;
        const row = rows.get(label) ?? { current: 0, previous: 0 };
        row[key] += 1;
        rows.set(label, row);
      });
    };
    add(currentOrders, "current");
    add(previousOrders, "previous");
    return finish(definition, window, length, ranked(rows), "זמן השליחה המדויק לא נשמר. הדוח מציג כמה הזמנות יש בכל סטטוס משלוח.");
  }

  if (id === "payments-by-method") {
    const labels: Record<string, string> = { paid: "שולם", pending: "ממתין לתשלום", partially_refunded: "הוחזר חלקית", refunded: "הוחזר" };
    const rows = new Map<string, { current: number; previous: number }>();
    const add = (source: typeof currentOrders, key: "current" | "previous") => {
      source.forEach((item) => {
        const label = labels[item.order.pay] ?? item.order.pay;
        const row = rows.get(label) ?? { current: 0, previous: 0 };
        row[key] += net(item.order);
        rows.set(label, row);
      });
    };
    add(currentOrders, "current");
    add(previousOrders, "previous");
    return finish(definition, window, length, ranked(rows), "אמצעי התשלום עצמו לא נשמר. הדוח מחלק את הסכום לפי סטטוס התשלום של ההזמנה.");
  }

  if (id === "conversion-breakdown" || id === "customer-behavior") {
    const visits = trafficField("visits");
    const orders = trafficField("orders");
    const exactToday = length === 1 && offsetFromToday(start, anchor) === 0;
    const points = [
      { label: "ביקורים", current: sum(visits.points.map((point) => point.current)), previous: sum(visits.points.map((point) => point.previous)) },
      ...(exactToday
        ? [
            { label: "הוסיפו לעגלה", current: input.traffic.today.carts, previous: 0 },
            { label: "הגיעו לתשלום", current: input.traffic.today.checkouts, previous: 0 },
          ]
        : []),
      { label: "רכשו", current: sum(orders.points.map((point) => point.current)), previous: sum(orders.points.map((point) => point.previous)) },
    ];
    return finish(definition, window, length, points, exactToday
      ? "השלבים של היום: ביקור, הוספה לעגלה, תשלום ורכישה."
      : "הוספה לעגלה והגעה לתשלום נשמרות רק להיום. בשאר הטווחים מוצגים ביקורים ורכישות.");
  }

  if (id === "inventory-value") {
    const points = input.products
      .filter((product) => product.status !== "archived")
      .map((product) => ({
        label: productLabel(product.title, product.variant),
        current: Math.max(0, product.stock) * (product.cost > 0 ? product.cost : product.price),
        previous: 0,
      }))
      .filter((row) => row.current > 0)
      .sort((a, b) => b.current - a.current);
    return finish(definition, window, length, points, "הערך הוא המלאי הנוכחי כפול העלות. במוצר בלי עלות החישוב הוא לפי מחיר המכירה.");
  }

  if (id === "out-of-stock") {
    const points = input.products
      .filter((product) => product.status === "active" && product.stock <= 0)
      .map((product) => ({ label: productLabel(product.title, product.variant), current: 1, previous: 0 }));
    return finish(definition, window, length, points, "מוצרים פעילים שהמלאי שלהם אזל.");
  }

  if (id === "vat-by-month") {
    const rows = new Map<string, { current: number; previous: number }>();
    currentOrders.forEach((item) => {
      const label = `${MONTHS_FULL[item.at.getMonth()]} ${item.at.getFullYear()}`;
      rows.set(label, rows.get(label) ?? { current: 0, previous: 0 });
    });
    const sales = sum(currentOrders.map((item) => net(item.order)));
    return finish(definition, window, length, [...rows.keys()].map((label) => ({ label, current: 0, previous: 0 })), `מע״מ לא נשמר בנפרד על ההזמנות, ולכן הסכום הוא 0. המכירות בטווח הן ${Math.round(sales).toLocaleString("en-US")} ₪.`);
  }

  return finish(definition, window, length, [], "");
}
