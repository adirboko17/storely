import { listLiveCheckouts, listResolvedOrders } from "@/data/mock/order-session";
import { listPeople, profileOf } from "@/data/mock/people-session";
import { TIMED_TRIGGERS, triggerByLabel } from "@/data/mock/marketing-session";

const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];

function stamp(at: string | undefined, label: string) {
  if (at) {
    const time = Date.parse(at);
    if (!Number.isNaN(time)) return time;
  }
  if (label.startsWith("היום") || label.startsWith("לפני")) return Date.now();
  if (label.startsWith("אתמול")) return Date.now() - 86400000;
  const match = label.match(/(\d+)\s+ב([א-ת]+)/);
  if (!match) return null;
  const monthName = match[2] ?? "";
  const month = MONTHS.findIndex((name) => monthName.startsWith(name));
  if (month < 0) return null;
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month, Number(match[1]));
  if (candidate.getTime() > now.getTime() + 86400000) year -= 1;
  return new Date(year, month, Number(match[1])).getTime();
}

function inWindow(at: string | undefined, label: string, days: number) {
  if (days <= 0) return true;
  const time = stamp(at, label);
  return time != null && time >= Date.now() - days * 86400000;
}

function checkoutKey(email: string, phone: string, name: string) {
  return (email || phone || name).trim().toLowerCase();
}

export function triggerAudienceCount(label: string, days: number) {
  const trigger = triggerByLabel(label);
  if (!trigger) return 0;
  const people = listPeople();
  const orders = listResolvedOrders();
  const checkouts = listLiveCheckouts().filter((checkout) => !checkout.recovered);
  const recentOrders = orders.filter((order) => inWindow(order.at, order.date, days));
  const recentCheckouts = checkouts.filter((checkout) => inWindow(checkout.at, checkout.date, days));

  function orderCustomers(source: typeof orders) {
    return new Set(source.map((order) => (order.customer.email || order.customerName || String(order.customerIndex)).trim().toLowerCase()).filter(Boolean));
  }

  if (trigger.id === "cart" || trigger.id === "checkout") {
    return new Set(recentCheckouts.map((checkout) => checkoutKey(checkout.email, checkout.phone, checkout.name)).filter(Boolean)).size;
  }
  if (trigger.id === "paid") return orderCustomers(recentOrders.filter((order) => order.pay === "paid")).size;
  if (trigger.id === "fulfilled") return orderCustomers(recentOrders.filter((order) => order.fulfillment === "fulfilled")).size;
  if (trigger.id === "browse") return 0;
  if (trigger.id === "winback") {
    const latest = new Map<string, number>();
    orders.forEach((order) => {
      const time = stamp(order.at, order.date);
      const key = (order.customer.email || order.customerName || String(order.customerIndex)).trim().toLowerCase();
      if (time == null || !key) return;
      latest.set(key, Math.max(latest.get(key) ?? 0, time));
    });
    if (days <= 0) return latest.size;
    const cutoff = Date.now() - days * 86400000;
    return [...latest.values()].filter((time) => time < cutoff).length;
  }
  if (trigger.id === "subscribed" || trigger.id === "subs") return people.filter((person) => profileOf(person).subscribed).length;
  if (trigger.id === "created" || trigger.id === "all") return people.length;
  if (trigger.id === "fresh") {
    const first = new Map<string, number>();
    orders.forEach((order) => {
      const time = stamp(order.at, order.date);
      const key = (order.customer.email || order.customerName || String(order.customerIndex)).trim().toLowerCase();
      if (time == null || !key) return;
      const previous = first.get(key);
      if (previous == null || time < previous) first.set(key, time);
    });
    if (days <= 0) return first.size;
    const cutoff = Date.now() - days * 86400000;
    return [...first.values()].filter((time) => time >= cutoff).length;
  }
  if (trigger.id === "repeat") return people.filter((person) => person.orders > 2).length;
  return 0;
}

export function customerCountLabel(count: number) {
  return count === 1 ? "לקוח אחד" : `${count} לקוחות`;
}

export function timedTrigger(label: string) {
  const trigger = triggerByLabel(label);
  return trigger ? TIMED_TRIGGERS.has(trigger.id) : false;
}
