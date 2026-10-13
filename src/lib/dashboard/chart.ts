import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

export const RANGES = [
  { id: "1", label: "היום" },
  { id: "7", label: "7 הימים האחרונים" },
  { id: "30", label: "30 הימים האחרונים" },
  { id: "90", label: "90 הימים האחרונים" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

export type ChartSpan = {
  days: number;
  hourly: boolean;
  end: Date;
};

const CHART_END = new Date(2026, 9, 13);

export function spanFromRangeId(range: RangeId, end = CHART_END): ChartSpan {
  return range === "1" ? { days: 1, hourly: true, end } : { days: Number(range), hourly: false, end };
}

export function isHourlySpan(range: RangeId | ChartSpan) {
  return typeof range === "string" ? range === "1" : range.hourly;
}

function resolveSpan(range: RangeId | ChartSpan): ChartSpan {
  return typeof range === "string" ? spanFromRangeId(range) : range;
}

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

export const METRIC_CATALOG = [
  {
    id: "aov",
    label: "ערך הזמנה ממוצע",
    title: "ערך הזמנה ממוצע לאורך זמן",
    description: "הסכום הממוצע של הזמנה בחנות המקוונת",
    format: "money",
    icon: "line",
  },
  {
    id: "sales",
    label: "מכירות ברוטו",
    title: "מכירות ברוטו לאורך זמן",
    description: "סך המכירות לפני החזרות",
    format: "money",
    icon: "line",
  },
  {
    id: "orders",
    label: "הזמנות",
    title: "הזמנות לאורך זמן",
    description: "מספר ההזמנות שהתקבלו בחנות",
    format: "integer",
    icon: "line",
  },
  {
    id: "returning",
    label: "שיעור לקוחות חוזרים",
    title: "שיעור לקוחות חוזרים לאורך זמן",
    description: "החלק של ההזמנות שהגיעו מלקוחות שכבר קנו",
    format: "percent",
    icon: "line",
  },
  {
    id: "refundRate",
    label: "שיעור החזרות",
    title: "שיעור החזרות לאורך זמן",
    description: "אחוז המכירות שהוחזרו ללקוחות",
    format: "percent",
    icon: "line",
  },
  {
    id: "search",
    label: "המרות מחיפוש",
    title: "המרות מחיפוש לאורך זמן",
    description: "ביקורים שהתחילו בחיפוש והסתיימו ברכישה",
    format: "percent",
    icon: "line",
  },
  {
    id: "units",
    label: "יחידות שנמכרו",
    title: "יחידות שנמכרו לאורך זמן",
    description: "כמות המוצרים שנמכרו בכל ההזמנות",
    format: "integer",
    icon: "bars",
  },
  {
    id: "channels",
    label: "מכירות לפי ערוץ",
    title: "מכירות החנות המקוונת לאורך זמן",
    description: "המכירות שהגיעו מהחנות המקוונת",
    format: "money",
    icon: "bars",
  },
  {
    id: "conv",
    label: "שיעור המרה",
    title: "שיעור המרה לאורך זמן",
    description: "אחוז הביקורים שהפכו להזמנה",
    format: "percent",
    icon: "line",
  },
  {
    id: "productOrders",
    label: "הזמנות לפי מוצר",
    title: "הזמנות לפי מוצר לאורך זמן",
    description: "הזמנות שכללו את המוצרים הנמכרים ביותר",
    format: "integer",
    icon: "bars",
  },
  {
    id: "refundQty",
    label: "כמות שהוחזרו",
    title: "כמות שהוחזרו לאורך זמן",
    description: "מספר היחידות שהוחזרו ללקוחות",
    format: "integer",
    icon: "bars",
  },
  {
    id: "refunds",
    label: "החזרי מכירות",
    title: "החזרי מכירות לאורך זמן",
    description: "סכום ההחזרים שניתנו בתקופה",
    format: "money",
    icon: "line",
  },
  {
    id: "sessions",
    label: "ביקורים",
    title: "ביקורים לאורך זמן",
    description: "מספר הביקורים בחנות המקוונת",
    format: "integer",
    icon: "line",
  },
  {
    id: "customers",
    label: "לקוחות חדשים",
    title: "לקוחות חדשים לאורך זמן",
    description: "לקוחות שקנו בפעם הראשונה בתקופה",
    format: "integer",
    icon: "line",
  },
  {
    id: "net",
    label: "מכירות נטו",
    title: "מכירות נטו לאורך זמן",
    description: "מכירות ברוטו אחרי החזרות",
    format: "money",
    icon: "line",
  },
  {
    id: "total",
    label: "סה״כ מכירות",
    title: "סה״כ מכירות לאורך זמן",
    description: "כל המכירות, כולל משלוח",
    format: "money",
    icon: "line",
  },
] as const;

export type MetricId = (typeof METRIC_CATALOG)[number]["id"];
export type MetricFormat = (typeof METRIC_CATALOG)[number]["format"];

const METRICS = Object.fromEntries(METRIC_CATALOG.map((item) => [item.id, item])) as Record<
  MetricId,
  (typeof METRIC_CATALOG)[number]
>;

export const DEFAULT_METRIC_SLOTS: MetricId[] = ["sales", "orders", "sessions", "conv"];

export function isMetricId(value: string): value is MetricId {
  return value in METRICS;
}

export type MetricCard = {
  id: MetricId;
  label: string;
  title: string;
  description: string;
  value: string;
  delta: string;
  deltaColor: string;
  positive: boolean;
  spark: string;
};

export type ChartModel = {
  title: string;
  current: string;
  previous: string;
  area: string;
  xTicks: string[];
  yTicks: { label: string; top: string }[];
  pointCount: number;
  hasHover: boolean;
  hx: string;
  hy: string;
  tipTransform: string;
  tipDate: string;
  tipPrevDate: string;
  tipCurrent: string;
  tipPrevious: string;
  currentLabel: string;
  previousLabel: string;
};

export type ChartOptions = {
  cutoff?: number | null;
  smooth?: boolean;
  tickCount?: number;
  ySteps?: number;
};

type Series = Record<MetricId, number[]>;

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function niceCeil(value: number) {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * exponent;
}

function formatDay(date: Date) {
  return `${date.getDate()} ב${MONTHS[date.getMonth()]}`;
}

function sparkline(values: number[]) {
  const buckets = 12;
  const step = values.length / buckets;
  const points = Array.from({ length: buckets }, (_, index) => {
    const start = Math.floor(index * step);
    const end = Math.max(Math.floor((index + 1) * step), start + 1);
    const slice = values.slice(start, end);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
  const min = Math.min(...points);
  const max = Math.max(...points) || 1;
  return points
    .map((value, index) => {
      const x = ((index * 28) / (buckets - 1)).toFixed(1);
      const y = (12 - ((value - min) / (max - min || 1)) * 10).toFixed(1);
      return `${index ? "L" : "M"}${x},${y}`;
    })
    .join("");
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function weighted(values: number[], weights: number[]) {
  const total = sum(weights);
  if (!total) return 0;
  return values.reduce((totalValue, value, index) => totalValue + value * (weights[index] ?? 0), 0) / total;
}

function derive(sales: number[], orders: number[], sessions: number[], seed: number): Series {
  const random = rng(seed);
  const units = orders.map((value) => value * (1.15 + random() * 0.7));
  const refundRate = orders.map((_, index) =>
    Math.min(18, Math.max(0.6, 3.1 + 1.8 * Math.sin(index / 3.2) + random() * 1.4)),
  );
  const refunds = sales.map((value, index) => value * ((refundRate[index] ?? 0) / 100));
  const refundQty = units.map((value, index) => value * ((refundRate[index] ?? 0) / 100));
  const returning = orders.map((_, index) =>
    Math.min(72, Math.max(8, 24 + 7 * Math.sin(index / 4.5 + 0.6) + random() * 5)),
  );
  const repeatOrders = orders.map((value, index) => value * ((returning[index] ?? 0) / 100));
  const customers = orders.map((value, index) => Math.max(0.2, value - (repeatOrders[index] ?? 0)));
  const conv = orders.map((value, index) => (value / (sessions[index] || 1)) * 100);
  const aov = orders.map((value, index) => (sales[index] ?? 0) / (value || 1));
  const search = conv.map((value) => value * 0.38);
  const channels = sales.map((value) => value * 0.84);
  const net = sales.map((value, index) => value - (refunds[index] ?? 0));
  const total = sales.map((value) => value * 1.16);
  const productOrders = orders.map((value) => value * 0.62);
  return {
    aov,
    sales,
    orders,
    returning,
    refundRate,
    search,
    units,
    channels,
    conv,
    productOrders,
    refundQty,
    refunds,
    sessions,
    customers,
    net,
    total,
  };
}

let liveMetrics = false;

export function enableLiveMetrics() {
  liveMetrics = true;
}

function periodTotal(series: Series, id: MetricId) {
  const orderTotal = sum(series.orders);
  const sessionTotal = sum(series.sessions);
  const salesTotal = sum(series.sales);
  if (id === "conv") return sessionTotal ? (orderTotal / sessionTotal) * 100 : 0;
  if (id === "aov") return orderTotal ? salesTotal / orderTotal : 0;
  if (id === "returning") return orderTotal ? (sum(series.orders.map((value, index) => value * ((series.returning[index] ?? 0) / 100))) / orderTotal) * 100 : 0;
  if (id === "refundRate") return salesTotal ? (sum(series.refunds) / salesTotal) * 100 : 0;
  if (id === "search") return weighted(series.search, series.sessions);
  return sum(series[id]);
}

function emptySeries(pointCount: number): Series {
  const flat = Array.from({ length: pointCount }, () => 0);
  return {
    aov: flat,
    sales: flat,
    orders: flat,
    returning: flat,
    refundRate: flat,
    search: flat,
    units: flat,
    channels: flat,
    conv: flat,
    productOrders: flat,
    refundQty: flat,
    refunds: flat,
    sessions: flat,
    customers: flat,
    net: flat,
    total: flat,
  };
}

function buildBundle(range: RangeId | ChartSpan) {
  const span = resolveSpan(range);
  const pointCount = span.hourly ? 24 : Math.max(2, Math.min(span.days, 366));
  const hourly = span.hourly;
  if (liveMetrics) {
    return { pointCount, hourly, end: span.end, current: emptySeries(pointCount), previous: emptySeries(pointCount) };
  }
  const make = (seed: number, base: number, factor: number) => {
    const random = rng(seed + pointCount * 13);
    const scaled = base * (hourly ? 1 / 24 : 1) * factor;
    return Array.from({ length: pointCount }, (_, index) => {
      const wave = hourly
        ? index < 7
          ? 0.25
          : index < 12
            ? 1.1
            : index < 18
              ? 1.3
              : index < 23
                ? 1.6
                : 0.6
        : (1 + 0.2 * Math.sin((index / 7) * 6.283 + 1)) * (1 + (0.15 * index) / pointCount);
      return scaled * wave * (0.72 + random() * 0.56);
    });
  };

  return {
    pointCount,
    hourly,
    end: span.end,
    current: derive(make(11, 1630, 1), make(21, 10.4, 1), make(31, 328, 1), 41),
    previous: derive(make(12, 1630, 0.89), make(22, 10.4, 0.93), make(32, 328, 0.96), 52),
  };
}

function showValue(format: MetricFormat, value: number) {
  if (format === "money") return formatMoney0(value);
  if (format === "percent") return `${value.toFixed(2)}%`;
  return formatInteger(value);
}

function cardFor(bundle: ReturnType<typeof buildBundle>, id: MetricId): MetricCard {
  const definition = METRICS[id];
  const current = periodTotal(bundle.current, id);
  const previous = periodTotal(bundle.previous, id);
  const percent = previous ? ((current - previous) / previous) * 100 : 0;
  const positive = percent >= 0;
  return {
    id,
    label: definition.label,
    title: definition.title,
    description: definition.description,
    value: showValue(definition.format, current),
    delta: `${positive ? "+" : "−"}${Math.abs(percent).toFixed(0)}%`,
    deltaColor: positive ? "#1f7a4d" : "#8e1f0b",
    positive,
    spark: sparkline(bundle.current[id]),
  };
}

export function dashboardMetrics(range: RangeId | ChartSpan, ids: MetricId[]) {
  const bundle = buildBundle(range);
  return ids.map((id) => cardFor(bundle, id));
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  const first = points[0];
  if (!first) return "";
  let path = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

function linePath(points: Array<{ x: number; y: number }>, smooth: boolean) {
  if (!points.length) return "";
  if (smooth) return smoothPath(points);
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("");
}

export function buildMetricChart(range: RangeId | ChartSpan, metric: MetricId, hover: number | null, options: ChartOptions = {}) {
  const bundle = buildBundle(range);
  const { pointCount, hourly } = bundle;
  const definition = METRICS[metric];
  const cutoff = options.cutoff == null ? pointCount - 1 : Math.max(0, Math.min(options.cutoff, pointCount - 1));
  const currentValues = bundle.current[metric].slice(0, cutoff + 1);
  const previousValues = bundle.previous[metric];
  const nice = niceCeil(Math.max(...currentValues, ...previousValues, 0) * 1.05);
  const yOf = (value: number) => 10 + (1 - value / nice) * 180;
  const xOf = (index: number) => (index / (pointCount - 1)) * 800;
  const toPoints = (values: number[]) => values.map((value, index) => ({ x: xOf(index), y: yOf(value) }));
  const smooth = options.smooth ?? false;
  const currentPoints = toPoints(currentValues);
  const current = linePath(currentPoints, smooth);
  const previous = linePath(toPoints(previousValues), smooth);
  const last = currentPoints[currentPoints.length - 1];
  const area = last ? `${current}L${last.x.toFixed(1)},190L0,190Z` : "";

  const axisNumber = (value: number) => (Number.isInteger(value) ? formatInteger(value) : value.toFixed(1));
  const yFormat =
    definition.format === "money"
      ? (value: number) => (value >= 1000 ? `₪${(value / 1000).toFixed(value % 1000 ? 1 : 0)}K` : `₪${axisNumber(value)}`)
      : definition.format === "percent"
        ? (value: number) => `${Number.isInteger(value) && value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`
        : (value: number) => (nice >= 100 && Number.isInteger(value) ? formatInteger(value) : axisNumber(value));

  const end = bundle.end;
  const dayAt = (index: number, offset: number) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (pointCount - 1 - index) - offset);
    return date;
  };
  const labelAt = (index: number) => (hourly ? `${String(index).padStart(2, "0")}:00` : formatDay(dayAt(index, 0)));
  const tickCount = options.tickCount ?? 5;
  const xTicks =
    hourly && tickCount > 5
      ? [0, 3, 6, 9, 12, 15, 18, 21].map((index) => labelAt(index))
      : [0, 1, 2, 3, 4].map((step) => labelAt(Math.round((step * (pointCount - 1)) / 4)));
  const ySteps = options.ySteps ?? 2;
  const yTicks = Array.from({ length: ySteps + 1 }, (_, step) => ySteps - step).map((step) => {
    const value = (nice * step) / ySteps;
    return { label: yFormat(value), top: `${yOf(value)}px` };
  });

  const active = hover != null && hover >= 0 && hover <= cutoff;
  const tipFormat = (value: number) => showValue(definition.format, value);
  const yesterday = new Date(end);
  yesterday.setDate(end.getDate() - 1);

  const chart: ChartModel = {
    title: definition.label,
    current,
    previous,
    area,
    xTicks,
    yTicks,
    pointCount,
    hasHover: active,
    hx: active ? `${(hover / (pointCount - 1)) * 100}%` : "0%",
    hy: active ? `${yOf(currentValues[hover] ?? 0)}px` : "0px",
    tipTransform: active ? (hover / (pointCount - 1) > 0.62 ? "translateX(-104%)" : "translateX(8px)") : "none",
    tipDate: active ? (hourly ? `היום, ${labelAt(hover)}` : formatDay(dayAt(hover, 0))) : "",
    tipPrevDate: active ? (hourly ? `אתמול, ${labelAt(hover)}` : formatDay(dayAt(hover, pointCount))) : "",
    tipCurrent: active ? tipFormat(currentValues[hover] ?? 0) : "",
    tipPrevious: active ? tipFormat(previousValues[hover] ?? 0) : "",
    currentLabel: hourly ? `${formatDay(end)} 2026` : `${formatDay(dayAt(0, 0))}–${formatDay(end)} 2026`,
    previousLabel: hourly
      ? `${formatDay(yesterday)} 2026`
      : `${formatDay(dayAt(0, pointCount))}–${formatDay(dayAt(pointCount - 1, pointCount))} 2026`,
  };

  return chart;
}

export function buildDashboardChart(range: RangeId, metric: MetricId, hover: number | null) {
  return {
    metrics: dashboardMetrics(range, DEFAULT_METRIC_SLOTS),
    chart: buildMetricChart(range, metric, hover),
  };
}

export function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "לילה טוב";
  if (hour < 12) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}
