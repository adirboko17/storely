import { CUSTOMERS } from "@/data/mock/customers";
import { PRODUCTS } from "@/data/mock/products";
import type { Product } from "@/types/commerce";

export type AbandonedLine = {
  product: Product;
  quantity: number;
};

export type AbandonedCheckout = {
  id: string;
  day: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  lines: AbandonedLine[];
  subtotal: number;
  shipCost: number;
  total: number;
  sent: boolean;
  recovered: boolean;
  source: string;
  subscribed: boolean;
};

const DAYS = [
  "היום",
  "היום",
  "היום",
  "אתמול",
  "אתמול",
  "אתמול",
  "אתמול",
  "אתמול",
  "אתמול",
  "אתמול",
  "ראשון",
  "ראשון",
  "ראשון",
  "ראשון",
  "ראשון",
  "ראשון",
  "ראשון",
  "שבת",
  "שבת",
  "שבת",
  "שבת",
  "שישי",
  "שישי",
  "שישי",
  "שישי",
  "חמישי",
  "חמישי",
  "חמישי",
];

const EXTRA = [
  "שירה אדלר",
  "עומר נחום",
  "גלית כהן-ברק",
  "אביב שמש",
  "מאיר אוחיון",
  "דנה וקנין",
  "רוני אלמוג",
  "יעל זוהר",
  "ליה שטרן",
  "גיל ברנע",
  "אסף מימון",
  "נעמה טל",
  "+972 50-677-9292",
  "+972 52-620-1860",
  "Shani Weizman",
  "בן אלקיים",
];

const EMAILS = [
  "shira.a",
  "omer.n",
  "galit.cb",
  "aviv.s",
  "meir.o",
  "dana.v",
  "roni.al",
  "yael.z",
  "lia.st",
  "gil.b",
  "asaf.m",
  "naama.t",
  "",
  "",
  "shani.w",
  "ben.e",
];

function buildAbandoned(): AbandonedCheckout[] {
  return DAYS.map((day, index) => {
    const hour = 23 - ((index * 5) % 22);
    const minute = String((index * 23 + 11) % 60).padStart(2, "0");
    const clock = `${String(hour).padStart(2, "0")}:${minute}`;
    const pairs: Array<[number, number]> = [[(index * 5 + 1) % 12, 1]];
    if (index % 3 === 0) pairs.push([(index * 7 + 4) % 12, 1 + (index % 2)]);
    const lines = pairs.map(([productIndex, quantity]) => {
      const product = PRODUCTS[productIndex];
      if (!product) throw new Error(`Missing product ${productIndex}`);
      return { product, quantity };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const shipCost = subtotal >= 300 ? 0 : index % 2 ? 29.9 : 19.9;
    const customer = CUSTOMERS[index % 12];
    if (!customer) throw new Error("Missing customer");
    const date =
      index === 0
        ? "לפני 31 דקות"
        : index === 1
          ? "היום ב-02:10"
          : day === "היום"
            ? `היום ב-${clock}`
            : `${day === "אתמול" ? "אתמול" : `יום ${day}`} ב-${clock}`;
    return {
      id: `#${66890091004067 - index * 28471913}`,
      day,
      date,
      name: index < EXTRA.length ? (EXTRA[index] ?? customer.name) : customer.name,
      email: index < EXTRA.length ? `${EMAILS[index] ?? ""}@gmail.com` : customer.email,
      phone: customer.phone,
      street: customer.street,
      city: customer.city,
      zip: customer.zip,
      lines,
      subtotal,
      shipCost,
      total: subtotal + shipCost,
      sent: index === 16,
      recovered: index === 6,
      source: index % 4 === 0 ? "אינסטגרם" : "חנות אונליין",
      subscribed: index % 3 === 0,
    };
  });
}

export const ABANDONED: AbandonedCheckout[] = [];

export function abandonedSlug(id: string) {
  return id.replace(/^#/, "");
}

export function findAbandoned(raw: string) {
  const key = raw.startsWith("#") ? raw : `#${raw}`;
  return ABANDONED.find((checkout) => checkout.id === raw || checkout.id === key || abandonedSlug(checkout.id) === raw) ?? null;
}
