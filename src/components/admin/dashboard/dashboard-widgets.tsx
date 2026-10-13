import Link from "next/link";
import { FulfillmentBadge } from "@/components/ui/status-badge";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/lib/icons";
import { formatMoney, formatMoney0 } from "@/lib/formatting/money";
import { PRODUCTS } from "@/data/mock/products";
import { listOrderViews } from "@/data/mock/orders";

const TOP = [
  { id: 0, units: 142, value: 12638 },
  { id: 3, units: 118, value: 8850 },
  { id: 6, units: 37, value: 7770 },
  { id: 1, units: 21, value: 6720 },
  { id: 2, units: 49, value: 5880 },
] as const;

export function RecentOrders() {
  const orders = listOrderViews().slice(0, 5);
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center px-4 pt-4 pb-3">
        <h2 className="m-0 flex-1 text-[15px] font-bold">הזמנות אחרונות</h2>
        <Link href="/admin/orders" className="storely-link text-sm">
          לכל ההזמנות
        </Link>
      </div>
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/admin/orders/${order.id}`}
          className="flex h-12 w-full items-center gap-3 border-t border-[#ebebeb] bg-white px-4 text-start text-sm text-ink no-underline hover:bg-[#f7f7f7] hover:no-underline"
        >
          <span dir="ltr" className="w-[52px] font-semibold">
            #{order.id}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-[18px]">
            <span>{order.customerName}</span>
            <span className="text-xs text-ink-secondary">{order.date}</span>
          </span>
          <FulfillmentBadge status={order.fulfillment} />
          <span dir="ltr" className="w-[84px] text-left font-medium">
            {formatMoney(order.total)}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function TopProducts({ rangeLabel }: { rangeLabel: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center">
        <h2 className="m-0 flex-1 text-[15px] font-bold">מוצרים מובילים לפי מכירות</h2>
        <span className="text-[13px] text-ink-secondary">{rangeLabel}</span>
      </div>
      {TOP.map((item) => {
        const product = PRODUCTS[item.id];
        if (!product) return null;
        return (
          <Link
            key={item.id}
            href={`/admin/products/${item.id}`}
            className="grid grid-cols-[36px_minmax(0,1fr)_90px] items-center gap-3 text-start text-sm text-ink no-underline hover:no-underline"
          >
            <span
              className="size-9 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]"
              style={{ background: product.tone }}
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex justify-between gap-2">
                <span className="truncate font-semibold">{product.title}</span>
                <span className="text-[13px] whitespace-nowrap text-ink-secondary">{item.units} יחידות</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-[3px] bg-[#f1f1f1]">
                <span
                  className="block h-full rounded-[3px] bg-[#2c6ecb]"
                  style={{ width: `${Math.round((item.value / 12638) * 100)}%` }}
                />
              </span>
            </span>
            <span dir="ltr" className="text-left font-semibold">
              {formatMoney0(item.value)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function QuickActions() {
  const actions: Array<{ label: string; href: string }> = [
    { label: "הוספת מוצר", href: "/admin/products/new" },
    { label: "יצירת הזמנה ידנית", href: "/admin/orders/drafts" },
    { label: "יצירת קוד הנחה", href: "/admin/discounts/new" },
    { label: "עריכת באנר בדף הבית", href: "/admin/online-store/banners" },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
      <h2 className="m-0 mb-1 text-[15px] font-bold">פעולות מהירות</h2>
      {actions.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className="flex h-9 items-center gap-2 rounded-lg bg-[#f7f7f7] px-2.5 text-start text-sm font-semibold text-ink no-underline hover:bg-[#ebebeb] hover:no-underline"
        >
          <Icon name="plus" size={16} strokeWidth={1.8} />
          <span className="flex-1">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}

export function LowStock() {
  const products = PRODUCTS.filter((product) => product.status === "active" && product.stock < 5);
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <h2 className="m-0 flex-1 text-[15px] font-bold">מלאי נמוך</h2>
        <Link href="/admin/products/inventory" className="storely-link text-sm">
          ניהול מלאי
        </Link>
      </div>
      {products.map((product) => {
        const empty = product.stock === 0;
        return (
          <div key={product.id} className="flex items-center gap-3 border-t border-[#ebebeb] px-4 py-2.5">
            <span
              className="size-9 shrink-0 rounded-lg shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]"
              style={{ background: product.tone }}
            />
            <span className="flex min-w-0 flex-1 flex-col leading-[18px]">
              <span className="font-semibold">{product.title}</span>
              <span className="text-xs text-ink-secondary">{product.variant}</span>
            </span>
            <span
              className="inline-flex h-[22px] items-center rounded-lg px-2 text-[13px] font-medium whitespace-nowrap"
              style={{ background: empty ? "#fedad9" : "#ffeb78", color: empty ? "#8e1f0b" : "#4f4700" }}
            >
              {empty ? "אזל" : `נותרו ${product.stock}`}
            </span>
            <Link
              href={`/admin/products/${product.id}`}
              className="inline-flex h-7 items-center rounded-lg bg-white px-2.5 text-[13px] font-semibold text-ink no-underline shadow-[0_0_0_1px_#d4d4d4,inset_0_-1px_0_#e3e3e3] hover:bg-[#f7f7f7] hover:no-underline"
            >
              עדכון
            </Link>
          </div>
        );
      })}
    </div>
  );
}

const TIPS: Array<{
  title: string;
  body: string;
  cta: string;
  href: string;
  background: string;
  color: string;
  icon: IconName;
}> = [
  {
    title: "הפעילו תזכורת אוטומטית לעגלות נטושות",
    body: "שלחו ללקוחות תזכורת בדוא״ל וב-SMS שעה אחרי שעזבו עגלה מלאה, עם קישור ישיר לקופה.",
    cta: "הגדרת אוטומציה",
    href: "/admin/marketing/automations",
    background: "#eef4fd",
    color: "#2c6ecb",
    icon: "cart",
  },
  {
    title: "תזמנו את מבצע חנוכה מראש",
    body: "הכינו באנר, קוד הנחה ומחירים, והגדירו שיעלו לאוויר ב-4 בדצמבר וירדו מעצמם בסיום החג.",
    cta: "פתיחת המבצע",
    href: "/admin/discounts/3",
    background: "#fdf3e7",
    color: "#b2601b",
    icon: "calendar",
  },
  {
    title: "הוסיפו אמצעי תשלום גיבוי",
    body: "אם הסליקה הראשית נתקעת, ביט או PayPal ימשיכו לקבל תשלומים בלי הפסקה במכירות.",
    cta: "הוספת אמצעי תשלום",
    href: "/admin/settings",
    background: "#edf7f1",
    color: "#29845a",
    icon: "card",
  },
];

export function TipCards() {
  return (
    <div className="grid w-full max-w-[1000px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 px-4">
      {TIPS.map((tip) => (
        <div
          key={tip.title}
          className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,.07),0_1px_2px_rgba(0,0,0,.03)]"
        >
          <div className="flex flex-col gap-1.5 px-4 pt-4">
            <h3 className="m-0 text-base leading-[22px] font-bold text-pretty text-ink-strong">{tip.title}</h3>
            <p className="m-0 text-sm leading-5 text-pretty text-ink-soft">{tip.body}</p>
          </div>
          <div className="mt-4 grid min-h-[130px] flex-1 place-items-center" style={{ background: tip.background }}>
            <span
              className="grid size-[60px] -translate-y-2.5 place-items-center rounded-2xl bg-white shadow-[0_6px_18px_rgba(0,0,0,.08)]"
              style={{ color: tip.color }}
            >
              <Icon name={tip.icon} size={28} strokeWidth={1.5} />
            </span>
          </div>
          <Link
            href={tip.href}
            className="absolute right-3.5 bottom-3.5 inline-flex h-8 items-center rounded-[10px] bg-white px-3 text-sm font-semibold text-ink no-underline shadow-[0_0_0_1px_rgba(0,0,0,.1),0_1px_2px_rgba(0,0,0,.06)] hover:bg-[#f7f7f7] hover:no-underline"
          >
            {tip.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}
