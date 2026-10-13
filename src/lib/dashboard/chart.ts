import { formatInteger, formatMoney0 } from "@/lib/formatting/money";

export const RANGES = [
  { id: "1", label: "היום" },
  { id: "7", label: "7 הימים האחרונים" },
  { id: "30", label: "30 הימים האחרונים" },
  { id: "90", label: "90 הימים האחרונים" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];
export type MetricId = "sales" | "orders" | "sessions" | "conv";

const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

const METRIC_LABELS: Record<MetricId, string> = {
  sales: "מכירות ברוטו",
  orders: "הזמנות",
  sessions: "ביקורים",
  conv: "שיעור המרה",
};

export type MetricCard = {
  id: MetricId;
  label: string;
  value: string;
  delta: string;
  deltaColor: string;
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

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function niceCeil(value: number) {
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

export function buildDashboardChart(range: RangeId, metric: MetricId, hover: number | null) {
  const pointCount = range === "1" ? 24 : Number(range);
  const hourly = pointCount === 24;
  const make = (key: "sales" | "orders" | "sessions", seed: number, factor: number) => {
    const random = rng(seed + pointCount * 13);
    const base = { sales: 1630, orders: 10.4, sessions: 328 }[key] * (hourly ? 1 / 24 : 1) * factor;
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
      return base * wave * (0.72 + random() * 0.56);
    });
  };

  const current = {
    sales: make("sales", 11, 1),
    orders: make("orders", 21, 1),
    sessions: make("sessions", 31, 1),
    conv: [] as number[],
  };
  const previous = {
    sales: make("sales", 12, 0.89),
    orders: make("orders", 22, 0.93),
    sessions: make("sessions", 32, 0.96),
    conv: [] as number[],
  };
  current.conv = current.orders.map((value, index) => (value / (current.sessions[index] ?? 1)) * 100);
  previous.conv = previous.orders.map((value, index) => (value / (previous.sessions[index] ?? 1)) * 100);

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const totals = (series: typeof current) => ({
    sales: sum(series.sales),
    orders: sum(series.orders),
    sessions: sum(series.sessions),
    conv: (sum(series.orders) / sum(series.sessions)) * 100,
  });
  const currentTotals = totals(current);
  const previousTotals = totals(previous);
  const show: Record<MetricId, (value: number) => string> = {
    sales: formatMoney0,
    orders: formatInteger,
    sessions: formatInteger,
    conv: (value) => `${value.toFixed(2)}%`,
  };

  const metrics: MetricCard[] = (["sales", "orders", "sessions", "conv"] as const).map((key) => {
    const percent = ((currentTotals[key] - previousTotals[key]) / previousTotals[key]) * 100;
    return {
      id: key,
      label: METRIC_LABELS[key],
      value: show[key](currentTotals[key]),
      delta: `${percent >= 0 ? "+" : "−"}${Math.abs(percent).toFixed(0)}%`,
      deltaColor: percent >= 0 ? "#1f7a4d" : "#8e1f0b",
      spark: sparkline(current[key]),
    };
  });

  const currentSeries = current[metric];
  const previousSeries = previous[metric];
  const nice = niceCeil(Math.max(...currentSeries, ...previousSeries) * 1.05);
  const yOf = (value: number) => 10 + (1 - value / nice) * 180;
  const xOf = (index: number) => (index / (pointCount - 1)) * 800;
  const path = (values: number[]) =>
    values
      .map((value, index) => `${index ? "L" : "M"}${xOf(index).toFixed(1)},${yOf(value).toFixed(1)}`)
      .join("");

  const yFormat =
    metric === "sales"
      ? (value: number) => (value >= 1000 ? `₪${(value / 1000).toFixed(value % 1000 ? 1 : 0)}K` : `₪${formatInteger(value)}`)
      : metric === "orders"
        ? (value: number) => String(Number(value.toFixed(1)))
        : metric === "sessions"
          ? (value: number) => formatInteger(value)
          : (value: number) => `${value.toFixed(1)}%`;

  const end = new Date(2026, 9, 12);
  const dayAt = (index: number, offset: number) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (pointCount - 1 - index) - offset);
    return date;
  };
  const labelAt = (index: number) => (hourly ? `${String(index).padStart(2, "0")}:00` : formatDay(dayAt(index, 0)));
  const xTicks = [0, 1, 2, 3, 4].map((step) => labelAt(Math.round((step * (pointCount - 1)) / 4)));
  const yTicks = [nice, nice / 2, 0].map((value) => ({ label: yFormat(value), top: `${yOf(value)}px` }));

  const active = hover != null && hover < pointCount;
  const tipFormat =
    metric === "sales"
      ? formatMoney0
      : metric === "orders" || metric === "sessions"
        ? formatInteger
        : (value: number) => `${value.toFixed(2)}%`;

  const chart: ChartModel = {
    title: METRIC_LABELS[metric],
    current: path(currentSeries),
    previous: path(previousSeries),
    area: `${path(currentSeries)}L800,190L0,190Z`,
    xTicks,
    yTicks,
    pointCount,
    hasHover: active,
    hx: active ? `${(hover / (pointCount - 1)) * 100}%` : "0%",
    hy: active ? `${yOf(currentSeries[hover] ?? 0)}px` : "0px",
    tipTransform: active ? (hover / (pointCount - 1) > 0.6 ? "translateX(-104%)" : "translateX(10px)") : "none",
    tipDate: active ? (hourly ? `היום, ${labelAt(hover)}` : formatDay(dayAt(hover, 0))) : "",
    tipPrevDate: active ? (hourly ? `אתמול, ${labelAt(hover)}` : formatDay(dayAt(hover, pointCount))) : "",
    tipCurrent: active ? tipFormat(currentSeries[hover] ?? 0) : "",
    tipPrevious: active ? tipFormat(previousSeries[hover] ?? 0) : "",
    currentLabel: hourly ? "היום" : `${formatDay(dayAt(0, 0))}–${formatDay(end)} 2026`,
    previousLabel: hourly
      ? "אתמול"
      : `${formatDay(dayAt(0, pointCount))}–${formatDay(dayAt(pointCount - 1, pointCount))} 2026`,
  };

  return { metrics, chart };
}

export function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "לילה טוב, מאיה!";
  if (hour < 12) return "בוקר טוב, מאיה!";
  if (hour < 17) return "צהריים טובים, מאיה!";
  if (hour < 21) return "ערב טוב, מאיה!";
  return "לילה טוב, מאיה!";
}
