"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { softButton } from "@/components/admin/orders/chrome";
import { SlicePending, useAdminSlice, useOrderCatalog } from "@/components/admin/slice-pending";
import { Icon } from "@/components/ui/icon";
import { reloadAdminSlice } from "@/data/live/admin-slices";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { writeStore } from "@/data/live/write";
import { getCatalogVersion, listCatalogProducts, subscribeCatalog } from "@/data/mock/catalog-session";
import { getOrderSessionVersion, resolveOrder, subscribeOrderSession } from "@/data/mock/order-session";
import { getPeopleVersion, listPeople, subscribePeople } from "@/data/mock/people-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { currencyLabel } from "@/lib/formatting/currency";
import { formatMoney } from "@/lib/formatting/money";
import { itemsLabel } from "@/lib/orders/present";
import type { Product } from "@/types/commerce";

const FREE_SHIPPING = 250;
const FREE_REASONS = ["שת״פ", "מתנה", "דוגמה", "החלפה", "שימוש פנימי"];

const card = "rounded-xl bg-white p-4 shadow-[var(--shadow-card)]";
const field =
  "h-9 w-full rounded-lg border border-[#d0d0d0] bg-white px-3 text-sm text-ink outline-none placeholder:text-[#9b9b9b] hover:border-[#a8a8a8] focus:border-[#303030] focus:shadow-[0_0_0_3px_rgba(48,48,48,.1)]";
const solidButton =
  "inline-flex h-9 items-center rounded-lg border-0 bg-[#303030] px-4 text-sm font-semibold text-white hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-[#8a8a8a]";
const linkButton = "border-0 bg-transparent p-0 text-sm text-[#2c6ecb] hover:underline";

type DraftLine = {
  key: string;
  productId?: string;
  title: string;
  variant: string;
  price: number;
  listPrice?: number;
  edited?: boolean;
  qty: number;
  image?: string;
  stock?: number;
};

type FoundCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
};

function amountOf(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100) / 100;
}

function includedVat(total: number) {
  return Math.round(((total * 18) / 118) * 100) / 100;
}

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "") || "?";
}

function foundCustomer(value: unknown): FoundCustomer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = textOf(row.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return {
    id,
    name: textOf(row.name),
    email: textOf(row.email),
    phone: textOf(row.phone),
    street: textOf(row.street),
    city: textOf(row.city),
    zip: textOf(row.zip),
  };
}

async function searchStoreCustomers(query: string) {
  const storeId = getStoreIdentity().storeId;
  if (!storeId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("search_store_customers", { target_store: storeId, query });
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((item) => {
    const customer = foundCustomer(item);
    return customer ? [customer] : [];
  });
}

function localCustomers(query: string): FoundCustomer[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return listPeople()
    .flatMap((person) => {
      if (!person.sourceId || !/^[0-9a-f-]{36}$/i.test(person.sourceId)) return [];
      const haystack = `${person.name} ${person.email} ${person.phone}`.toLowerCase();
      if (!haystack.includes(needle)) return [];
      return [{
        id: person.sourceId,
        name: person.name,
        email: person.email,
        phone: person.phone,
        street: person.street,
        city: person.city,
        zip: person.zip,
      }];
    })
    .slice(0, 8);
}

function MoneyRow({ label, detail, value, strong = false, muted = false }: { label: string; detail?: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 text-sm ${strong ? "text-[15px] font-semibold" : ""} ${muted ? "text-ink-secondary" : ""}`}>
      <span>{label}</span>
      {detail ? <span className="text-[13px] text-ink-secondary">{detail}</span> : null}
      <span dir="ltr" className="ms-auto">{value}</span>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-[#f1f1f1] p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={`h-8 flex-1 rounded-md border-0 px-3 text-[13px] whitespace-nowrap ${value === option.id ? "bg-white font-semibold text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "bg-transparent font-medium text-[#616161] hover:text-[#1a1a1a]"}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[13px] font-medium text-[#303030]">
        {label}
        {required ? <span className="text-[#b42318]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function CreateOrderScreen({ orderId }: { orderId?: number } = {}) {
  const router = useRouter();
  const { toast, narrow } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, () => 0);
  const orderVersion = useSyncExternalStore(subscribeOrderSession, getOrderSessionVersion, () => 0);
  const catalogReady = useAdminSlice("catalog");
  const ordersReady = useAdminSlice("orders");
  const orderCatalog = useOrderCatalog();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productOpen, setProductOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [priceKey, setPriceKey] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [kind, setKind] = useState<"sale" | "free">("sale");
  const [freeReason, setFreeReason] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountText, setDiscountText] = useState("");
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shippingText, setShippingText] = useState("");
  const [payment, setPayment] = useState<"pending" | "paid">("pending");
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<FoundCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundCustomer | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [seeded, setSeeded] = useState(orderId == null);
  const [missing, setMissing] = useState(false);
  const [shipLabel, setShipLabel] = useState("");
  const [originalShip, setOriginalShip] = useState(0);
  const [discountCode, setDiscountCode] = useState("");
  const [paidAlready, setPaidAlready] = useState(false);
  const [alreadyShipped, setAlreadyShipped] = useState(false);

  const free = kind === "free";
  const listSubtotal = Math.round(lines.reduce((sum, line) => sum + line.price * line.qty, 0) * 100) / 100;
  const subtotal = free ? 0 : listSubtotal;
  const discount = free ? 0 : discountOpen ? amountOf(discountText) : 0;
  const shipping = free ? 0 : shippingOpen ? amountOf(shippingText) : 0;
  const discountValue = discount ?? 0;
  const shippingValue = shipping ?? 0;
  const goods = Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);
  const total = Math.round((goods + shippingValue) * 100) / 100;
  const freeShipping = !free && goods >= FREE_SHIPPING && shippingValue === 0;
  const unitCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const productMatches = listCatalogProducts()
    .filter((product) => product.sourceId && product.status !== "archived")
    .filter((product) => {
      const needle = productQuery.trim().toLowerCase();
      if (!needle) return true;
      return `${product.title} ${product.variant} ${product.sku}`.toLowerCase().includes(needle);
    })
    .slice(0, 30);

  useEffect(() => {
    const query = customerQuery.trim();
    if (!query || selected) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let cancel = false;
    setMatches(localCustomers(query));
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchStoreCustomers(query).then((found) => {
        if (cancel) return;
        if (found) setMatches(found);
        setSearching(false);
      });
    }, 220);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [customerQuery, selected]);

  useEffect(() => {
    if (!orderId || seeded) return;
    if (!catalogReady) return;
    const order = resolveOrder(orderId);
    if (!order) {
      if (ordersReady && orderCatalog.complete) setMissing(true);
      return;
    }
    const catalog = listCatalogProducts();
    const seededLines = order.lines.map((line, index) => ({
      key: line.product.sourceId ? `${line.product.sourceId}-${index}` : `kept-${index}`,
      productId: line.product.sourceId,
      title: line.product.title,
      variant: line.product.variant && line.product.variant !== line.product.title ? line.product.variant : "",
      price: line.product.price,
      listPrice: line.product.sourceId ? catalog.find((product) => product.sourceId === line.product.sourceId)?.price : undefined,
      qty: line.quantity,
      image: line.product.media?.find((url) => url.startsWith("http")),
      stock: line.product.sourceId && line.product.trackInventory !== false ? line.product.stock + line.quantity : undefined,
    }));
    setLines(seededLines);
    if (order.total === 0 && seededLines.length > 0 && seededLines.every((line) => line.price === 0)) setKind("free");
    if (order.discountAmount > 0) {
      setDiscountOpen(true);
      setDiscountText(String(order.discountAmount));
    }
    setDiscountCode(order.discount?.[0] ?? "");
    if (order.shipCost > 0) {
      setShippingOpen(true);
      setShippingText(String(order.shipCost));
    }
    setShipLabel(order.ship);
    setOriginalShip(order.shipCost);
    setNote(order.note ?? "");
    setTags(order.tags ?? []);
    setPaidAlready(order.pay !== "pending");
    setAlreadyShipped(order.fulfillment === "fulfilled");
    setSelected({
      id: "",
      name: order.customer.name,
      email: order.customer.email,
      phone: order.customer.phone,
      street: order.customer.street,
      city: order.customer.city,
      zip: order.customer.zip,
    });
    setSeeded(true);
  }, [orderId, seeded, catalogReady, ordersReady, orderCatalog.complete, orderVersion]);

  function addProduct(product: Product) {
    const productId = product.sourceId;
    if (!productId) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) => (line.productId === productId ? { ...line, qty: Math.min(999, line.qty + 1) } : line));
      }
      return [
        ...current,
        {
          key: productId,
          productId,
          title: product.title,
          variant: product.variant && product.variant !== product.title ? product.variant : "",
          price: product.price,
          listPrice: product.price,
          qty: 1,
          image: product.media?.find((url) => url.startsWith("http")),
          stock: product.trackInventory === false ? undefined : product.stock,
        },
      ];
    });
    setProductQuery("");
    setProductOpen(false);
    setError("");
  }

  function addCustom() {
    const title = customTitle.trim();
    const price = amountOf(customPrice);
    const qty = Number(customQty);
    if (!title) {
      setError("לפריט מותאם צריך שם");
      return;
    }
    if (price == null) {
      setError("מחיר לא תקין");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      setError("כמות לא תקינה");
      return;
    }
    setLines((current) => [
      ...current,
      { key: `custom-${Date.now()}`, title, variant: "", price, qty, edited: true },
    ]);
    setCustomTitle("");
    setCustomPrice("");
    setCustomQty("1");
    setCustomOpen(false);
    setError("");
  }

  function startPriceEdit(line: DraftLine) {
    setPriceKey(line.key);
    setPriceDraft(line.price.toFixed(2));
  }

  function commitPrice() {
    if (!priceKey) return;
    const price = amountOf(priceDraft);
    if (price == null) {
      setError("מחיר לא תקין");
      return;
    }
    setLines((current) => current.map((line) => (
      line.key === priceKey
        ? { ...line, price, edited: line.productId ? line.listPrice == null || price !== line.listPrice : true }
        : line
    )));
    setPriceKey(null);
    setError("");
  }

  function chooseKind(next: "sale" | "free") {
    setKind(next);
    setError("");
    if (next === "sale") {
      setLines((current) => current.map((line) => (
        line.price === 0 && line.listPrice != null && line.listPrice > 0 ? { ...line, price: line.listPrice, edited: true } : line
      )));
    }
  }

  function commitTag(raw: string) {
    const next = raw.replace(/,/g, "").trim().slice(0, 40);
    if (!next) {
      setTagText("");
      return;
    }
    setTags((current) => (current.includes(next) || current.length >= 12 ? current : [...current, next]));
    setTagText("");
  }

  function pickCustomer(customer: FoundCustomer) {
    setSelected(customer);
    setCustomerQuery("");
    setError("");
  }

  function startNewCustomer() {
    const typed = customerQuery.trim();
    setSelected(null);
    setCustomerMode("new");
    if (typed) {
      if (typed.includes("@")) setEmail((current) => current || typed);
      else if (/^[\d\s+()-]{6,}$/.test(typed)) setPhone((current) => current || typed);
      else setName((current) => current || typed);
    }
    setCustomerQuery("");
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (priceKey) {
      setError("סיימו לערוך את המחיר לפני השמירה");
      return;
    }
    if (lines.length === 0) {
      setError("צריך להוסיף לפחות מוצר אחד");
      return;
    }
    if (discount == null || shipping == null) {
      setError("הנחה או משלוח לא תקינים");
      return;
    }
    const newCustomer = customerMode === "new" && !selected;
    if (!orderId && !selected && !newCustomer) {
      setError("בחרו לקוח קיים או עברו ל״לקוח חדש״");
      return;
    }
    if (!orderId && newCustomer && !name.trim()) {
      setError("ללקוח חדש צריך שם");
      return;
    }
    const pendingTag = tagText.replace(/,/g, "").trim().slice(0, 40);
    const withPending = pendingTag && !tags.includes(pendingTag) && tags.length < 12 ? [...tags, pendingTag] : tags;
    const orderTags = free && freeReason && !withPending.includes(freeReason) && withPending.length < 12 ? [...withPending, freeReason] : withPending;
    const shippingName = orderId && shipping === originalShip
      ? shipLabel || "ללא משלוח"
      : shipping > 0
        ? "משלוח"
        : freeShipping
          ? "משלוח חינם"
          : "ללא משלוח";
    const orderLines = lines.map((line) => {
      if (!line.productId) return { title: line.title, quantity: line.qty, unitPrice: free ? 0 : line.price };
      if (free) return { productId: line.productId, quantity: line.qty, unitPrice: 0 };
      return line.edited
        ? { productId: line.productId, quantity: line.qty, unitPrice: line.price }
        : { productId: line.productId, quantity: line.qty };
    });
    setSaving(true);
    setError("");
    try {
      if (orderId) {
        const data = await writeStore("edit_store_order", {
          order_number: orderId,
          payload: {
            lines: orderLines,
            discount,
            shipping,
            shippingName,
            note: note.trim(),
            tags: orderTags,
          },
        });
        const result = data && typeof data === "object" ? (data as { ok?: boolean; reason?: string }) : null;
        if (!result?.ok) {
          setError(result?.reason || "לא הצלחנו לשמור את ההזמנה");
          return;
        }
        const storeId = getStoreIdentity().storeId;
        if (storeId) await reloadAdminSlice(storeId, "orders");
        toast("ההזמנה עודכנה");
        router.push(`/admin/orders/${orderId}`);
        return;
      }
      const data = await writeStore("create_store_order", {
        payload: {
          customerId: selected?.id || undefined,
          customer: selected
            ? undefined
            : { name: name.trim(), email: email.trim(), phone: phone.trim(), street: street.trim(), city: city.trim(), zip: zip.trim() },
          lines: orderLines,
          discount,
          shipping,
          shippingName,
          payment: free ? "paid" : payment,
          note: note.trim(),
          tags: orderTags,
        },
      });
      const result = data && typeof data === "object" ? (data as { ok?: boolean; orderNumber?: number; reason?: string }) : null;
      if (!result?.ok || !result.orderNumber) {
        setError(result?.reason || "לא הצלחנו לשמור את ההזמנה");
        return;
      }
      const storeId = getStoreIdentity().storeId;
      if (storeId) await reloadAdminSlice(storeId, "orders");
      toast(free ? "ההזמנה נוצרה ללא חיוב" : "ההזמנה נוצרה");
      router.push(`/admin/orders/${result.orderNumber}`);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "לא הצלחנו לשמור את ההזמנה");
    } finally {
      setSaving(false);
    }
  }

  if (orderId && missing) {
    return (
      <div className="mx-auto flex max-w-[1040px] flex-col gap-3" style={{ padding: narrow ? 16 : 24 }}>
        <p className="m-0 text-sm">ההזמנה לא נמצאה</p>
        <button type="button" className={`${softButton} w-fit`} onClick={() => router.push("/admin/orders")}>חזרה להזמנות</button>
      </div>
    );
  }
  if (orderId && !seeded) return <SlicePending label="טוען הזמנה…" />;

  const query = customerQuery.trim();

  return (
    <form data-screen-label={orderId ? "Edit order" : "Create order"} onSubmit={(event) => void save(event)} className="mx-auto flex max-w-[1040px] flex-col gap-4" style={{ padding: narrow ? 16 : 24 }}>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" aria-label={orderId ? "חזרה להזמנה" : "חזרה להזמנות"} onClick={() => router.push(orderId ? `/admin/orders/${orderId}` : "/admin/orders")} className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#e3e3e3]">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10h12M11 5l5 5-5 5" />
          </svg>
        </button>
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">{orderId ? `עריכת הזמנה #${orderId}` : "יצירת הזמנה"}</h1>
        <button type="submit" className={solidButton} disabled={saving}>
          {saving ? "שומר…" : orderId ? "שמירת שינויים" : free ? "יצירת הזמנה ללא חיוב" : "יצירת הזמנה"}
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <section className={card}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold">מוצרים</h2>
              <button type="button" className={softButton} onClick={() => { setCustomOpen((current) => !current); setProductOpen(false); }}>
                <Icon name="plus" size={14} strokeWidth={2} />
                פריט מותאם
              </button>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-[#d0d0d0] bg-white px-3 focus-within:border-[#303030] focus-within:shadow-[0_0_0_3px_rgba(48,48,48,.1)]">
                <Icon name="search" size={16} className="shrink-0 text-[#8a8a8a]" />
                <input
                  value={productQuery}
                  onChange={(event) => { setProductQuery(event.target.value); setProductOpen(true); }}
                  onFocus={() => { setProductOpen(true); setCustomOpen(false); }}
                  onBlur={() => window.setTimeout(() => setProductOpen(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setProductOpen(false);
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (productMatches[0]) addProduct(productMatches[0]);
                    }
                  }}
                  placeholder="חיפוש מוצר להוספה"
                  className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#9b9b9b]"
                />
              </div>
              {productOpen ? (
                <div className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-[320px] overflow-y-auto rounded-xl bg-white p-1 shadow-[var(--shadow-popover)]">
                  {catalogReady && productMatches.length === 0 ? <p className="m-0 px-3 py-3 text-sm text-ink-secondary">אין מוצר כזה</p> : null}
                  {!catalogReady && productMatches.length === 0 ? <p className="m-0 px-3 py-3 text-sm text-ink-secondary">טוען מוצרים…</p> : null}
                  {productMatches.map((product) => {
                    const out = product.trackInventory !== false && product.stock <= 0;
                    return (
                      <button key={product.sourceId} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addProduct(product)} className="flex w-full items-center gap-3 rounded-lg border-0 bg-white px-2.5 py-2 text-start hover:bg-[#f4f4f4]">
                        {product.media?.[0] ? <img src={product.media[0]} alt="" className="size-9 rounded-md object-cover" /> : <span className="size-9 rounded-md bg-[#f1f1f1]" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{product.title}</span>
                          <span className={`block text-xs ${out ? "text-[#8a4b08]" : "text-ink-secondary"}`}>
                            {product.status === "draft" ? "טיוטה · " : ""}
                            {product.trackInventory === false ? "ללא מעקב מלאי" : out ? "אזל מהמלאי" : `במלאי ${product.stock}`}
                          </span>
                        </span>
                        <span dir="ltr" className="text-sm">{formatMoney(product.price)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {customOpen ? (
              <div className="mt-3 grid gap-3 rounded-xl bg-[#f7f7f7] p-3">
                <Field label="שם הפריט" required>
                  <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} className={field} autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="מחיר ליחידה">
                    <input value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
                  </Field>
                  <Field label="כמות">
                    <input value={customQty} onChange={(event) => setCustomQty(event.target.value)} inputMode="numeric" className={field} />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className={softButton} onClick={() => setCustomOpen(false)}>ביטול</button>
                  <button type="button" className={solidButton} onClick={addCustom}>הוספה</button>
                </div>
              </div>
            ) : null}

            {lines.length === 0 ? (
              <div className="mt-3 grid place-items-center gap-1 rounded-xl border border-dashed border-[#d0d0d0] px-4 py-8 text-center">
                <Icon name="cart" size={22} className="text-[#8a8a8a]" />
                <p className="m-0 text-sm font-medium">עוד אין מוצרים בהזמנה</p>
                <p className="m-0 text-[13px] text-ink-secondary">חפשו מוצר מהקטלוג או הוסיפו פריט מותאם</p>
              </div>
            ) : (
              <div className="mt-2 flex flex-col">
                {lines.map((line) => {
                  const unit = free ? 0 : line.price;
                  const was = free ? line.price : line.listPrice != null && line.listPrice > line.price ? line.listPrice : null;
                  const editing = priceKey === line.key;
                  return (
                    <div key={line.key} className="flex flex-wrap items-center gap-3 border-b border-[#ebebeb] py-3 last:border-b-0">
                      {line.image ? (
                        <img src={line.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#f1f1f1] text-xs text-[#8a8a8a]">פריט</span>
                      )}
                      <div className="min-w-[140px] flex-1">
                        <div className="text-sm font-medium">{line.title}</div>
                        {line.variant ? <div className="text-xs text-ink-secondary">{line.variant}</div> : null}
                        {editing ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <input
                              value={priceDraft}
                              onChange={(event) => setPriceDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") { event.preventDefault(); commitPrice(); }
                                if (event.key === "Escape") setPriceKey(null);
                              }}
                              inputMode="decimal"
                              autoFocus
                              dir="ltr"
                              className="h-7 w-24 rounded-md border border-[#303030] bg-white px-2 text-sm outline-none"
                            />
                            <button type="button" className="h-7 rounded-md border-0 bg-[#303030] px-2.5 text-xs font-semibold text-white" onClick={commitPrice}>אישור</button>
                            <button type="button" className="h-7 rounded-md border-0 bg-transparent px-1.5 text-xs text-ink-secondary" onClick={() => setPriceKey(null)}>ביטול</button>
                          </div>
                        ) : (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                            {free ? (
                              <span className="font-medium text-[#0c5132]">ללא חיוב</span>
                            ) : (
                              <button type="button" className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent p-0 text-xs text-[#2c6ecb] hover:underline" onClick={() => startPriceEdit(line)} aria-label={`עריכת המחיר של ${line.title}`}>
                                <span dir="ltr">{formatMoney(unit)}</span>
                                <Icon name="pencil" size={12} />
                              </button>
                            )}
                            {was != null && was !== unit ? <span dir="ltr" className="text-ink-secondary line-through">{formatMoney(was)}</span> : null}
                          </div>
                        )}
                        {line.stock != null && line.qty > line.stock ? (
                          <div className="mt-0.5 text-xs text-[#8a4b08]">במלאי נשארו {line.stock}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center rounded-lg border border-[#d0d0d0]">
                        <button type="button" aria-label="הפחתת כמות" className="grid size-8 place-items-center rounded-s-lg border-0 bg-transparent text-sm hover:bg-[#f1f1f1]" onClick={() => setLines((current) => current.flatMap((item) => (item.key === line.key ? (item.qty <= 1 ? [] : [{ ...item, qty: item.qty - 1 }]) : [item])))}>
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{line.qty}</span>
                        <button type="button" aria-label="הוספת כמות" className="grid size-8 place-items-center rounded-e-lg border-0 bg-transparent text-sm hover:bg-[#f1f1f1]" onClick={() => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, qty: Math.min(999, item.qty + 1) } : item)))}>
                          +
                        </button>
                      </div>
                      <span dir="ltr" className="w-20 text-end text-sm font-semibold">
                        {formatMoney(unit * line.qty)}
                      </span>
                      <button type="button" aria-label="הסרת פריט" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-[#8a8a8a] hover:bg-[#f1f1f1] hover:text-[#b42318]" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={`${card} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold">תשלום</h2>
              <div className="w-full sm:w-[300px]">
                <Segmented
                  label="סוג ההזמנה"
                  value={kind}
                  options={[{ id: "sale", label: "מכירה" }, { id: "free", label: "ללא חיוב (₪0)" }]}
                  onChange={chooseKind}
                />
              </div>
            </div>

            {free ? (
              <div className="rounded-xl bg-[#f1f8f5] p-3">
                <p className="m-0 text-[13px] leading-5 text-[#0c5132]">
                  ההזמנה תירשם ב-₪0 ותסומן כשולמה. המוצרים יורדו מהמלאי כרגיל, כך שהמלאי נשאר מדויק.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] text-[#303030]">סיבה:</span>
                  {FREE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      aria-pressed={freeReason === reason}
                      onClick={() => setFreeReason((current) => (current === reason ? "" : reason))}
                      className={`h-7 rounded-full border px-3 text-[13px] ${freeReason === reason ? "border-[#303030] bg-[#303030] font-semibold text-white" : "border-[#c9c9c9] bg-white text-[#303030] hover:border-[#8a8a8a]"}`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                {freeReason ? <p className="m-0 mt-2 text-xs text-ink-secondary">התגית ״{freeReason}״ תתווסף להזמנה, כדי שיהיה קל למצוא אותה אחר כך.</p> : null}
              </div>
            ) : null}

            {lines.length === 0 ? (
              <p className="m-0 text-sm text-ink-secondary">הוסיפו מוצר כדי לחשב את הסכום</p>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-xl border border-[#ebebeb] p-3">
                <MoneyRow label="סכום ביניים" detail={itemsLabel(unitCount)} value={formatMoney(subtotal)} />
                {free ? (
                  <MoneyRow label="שווי המוצרים" detail="לא מחויב" value={formatMoney(listSubtotal)} muted />
                ) : (
                  <>
                    {discountOpen ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="shrink-0">הנחה{discountCode ? ` (${discountCode})` : ""}</span>
                        <input value={discountText} onChange={(event) => setDiscountText(event.target.value)} inputMode="decimal" placeholder="0.00" dir="ltr" className={`${field} ms-auto h-8 max-w-[140px]`} autoFocus={!orderId} />
                        <button type="button" aria-label="הסרת הנחה" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-[#8a8a8a] hover:bg-[#f1f1f1]" onClick={() => { setDiscountOpen(false); setDiscountText(""); }}>
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center text-sm">
                        <button type="button" className={linkButton} onClick={() => setDiscountOpen(true)}>הוספת הנחה</button>
                        <span dir="ltr" className="ms-auto text-ink-secondary">—</span>
                      </div>
                    )}
                    {shippingOpen ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="shrink-0">משלוח</span>
                        <input value={shippingText} onChange={(event) => setShippingText(event.target.value)} inputMode="decimal" placeholder="0.00" dir="ltr" className={`${field} ms-auto h-8 max-w-[140px]`} autoFocus={!orderId} />
                        <button type="button" aria-label="הסרת משלוח" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-[#8a8a8a] hover:bg-[#f1f1f1]" onClick={() => { setShippingOpen(false); setShippingText(""); }}>
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center text-sm">
                        <button type="button" className={linkButton} onClick={() => setShippingOpen(true)}>
                          {freeShipping ? "משלוח חינם" : "הוספת משלוח"}
                        </button>
                        {freeShipping ? <span className="ms-2 text-xs text-ink-secondary">מעל {formatMoney(FREE_SHIPPING)}</span> : null}
                        <span dir="ltr" className="ms-auto">{formatMoney(0)}</span>
                      </div>
                    )}
                    <MoneyRow label="מע״מ" detail="כלול במחיר" value={formatMoney(includedVat(total))} muted />
                  </>
                )}
                <div className="border-t border-[#ebebeb] pt-2.5">
                  <MoneyRow label="סה״כ" value={formatMoney(total)} strong />
                </div>
              </div>
            )}

            {orderId ? (
              <>
                {paidAlready ? <p className="m-0 text-xs text-ink-secondary">ההזמנה כבר שולמה. שינוי בסכום לא מחייב ולא מזכה את הלקוח.</p> : null}
                {alreadyShipped ? <p className="m-0 text-xs text-ink-secondary">ההזמנה כבר סומנה כנשלחה. שינוי במוצרים יעדכן את המלאי.</p> : null}
              </>
            ) : !free && lines.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">סטטוס תשלום</span>
                <div className="w-full sm:w-[260px]">
                  <Segmented
                    label="סטטוס תשלום"
                    value={payment}
                    options={[{ id: "pending", label: "ממתין לתשלום" }, { id: "paid", label: "שולם" }]}
                    onChange={setPayment}
                  />
                </div>
              </div>
            ) : null}
            {error ? (
              <p className="m-0 flex items-center gap-1.5 rounded-lg bg-[#fee9e7] px-3 py-2 text-sm text-[#b42318]">
                <Icon name="warning" size={15} />
                {error}
              </p>
            ) : null}
            <p className="m-0 text-xs text-ink-secondary">מטבע: {currencyLabel()} · שוק: ישראל</p>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="m-0 text-[15px] font-semibold">לקוח</h2>
              {!orderId && selected ? (
                <button type="button" className={linkButton} onClick={() => setSelected(null)}>החלפה</button>
              ) : null}
            </div>

            {selected ? (
              <div className="flex items-start gap-3 rounded-lg bg-[#f6f6f6] p-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#303030] text-[13px] font-semibold text-white">{initials(selected.name)}</span>
                <div className="min-w-0 flex-1 leading-5">
                  <div className="font-semibold">{selected.name || "ללא שם"}</div>
                  {selected.email ? <div className="truncate text-ink-secondary">{selected.email}</div> : null}
                  {selected.phone ? <div dir="ltr" className="text-end text-ink-secondary">{selected.phone}</div> : null}
                  {selected.street || selected.city ? (
                    <div className="mt-1.5 border-t border-[#e3e3e3] pt-1.5 text-ink-secondary">{[selected.street, selected.city, selected.zip].filter(Boolean).join(", ")}</div>
                  ) : null}
                </div>
              </div>
            ) : orderId ? (
              <p className="m-0 text-sm text-ink-secondary">ללא לקוח</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Segmented
                  label="סוג הלקוח"
                  value={customerMode}
                  options={[{ id: "existing", label: "לקוח קיים" }, { id: "new", label: "לקוח חדש" }]}
                  onChange={(mode) => { setCustomerMode(mode); setError(""); }}
                />
                {customerMode === "existing" ? (
                  <div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#d0d0d0] bg-white px-3 focus-within:border-[#303030] focus-within:shadow-[0_0_0_3px_rgba(48,48,48,.1)]">
                      <Icon name="search" size={16} className="shrink-0 text-[#8a8a8a]" />
                      <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="שם, טלפון או אימייל" className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#9b9b9b]" autoFocus={!narrow} />
                    </div>
                    {query && matches.length > 0 ? (
                      <div className="mt-2 max-h-[260px] overflow-y-auto rounded-lg border border-[#ebebeb]">
                        {matches.map((customer) => (
                          <button key={customer.id} type="button" onClick={() => pickCustomer(customer)} className="flex w-full items-center gap-2.5 border-0 border-b border-[#f1f1f1] bg-white px-3 py-2 text-start last:border-b-0 hover:bg-[#f7f7f7]">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#ebebeb] text-[11px] font-semibold">{initials(customer.name)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{customer.name || "ללא שם"}</span>
                              <span className="block truncate text-xs text-ink-secondary">{[customer.phone, customer.email].filter(Boolean).join(" · ") || customer.city}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {query && matches.length === 0 ? (
                      <div className="mt-2 rounded-lg bg-[#f7f7f7] px-3 py-2.5 text-sm">
                        <p className="m-0 text-ink-secondary">{searching ? "מחפש…" : "לא מצאנו לקוח כזה."}</p>
                        {!searching ? (
                          <button type="button" className={`${linkButton} mt-1`} onClick={startNewCustomer}>יצירת לקוח חדש: {query}</button>
                        ) : null}
                      </div>
                    ) : null}
                    {!query ? <p className="m-0 mt-2 text-xs text-ink-secondary">התחילו להקליד כדי למצוא לקוח קיים</p> : null}
                  </div>
                ) : (
                  <div className="grid gap-2.5">
                    <Field label="שם מלא" required>
                      <input value={name} onChange={(event) => setName(event.target.value)} className={field} autoComplete="off" />
                    </Field>
                    <Field label="טלפון">
                      <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" dir="ltr" className={`${field} text-end`} autoComplete="off" />
                    </Field>
                    <Field label="אימייל">
                      <input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" dir="ltr" className={`${field} text-end`} autoComplete="off" />
                    </Field>
                    <p className="m-0 mt-1 text-[13px] font-semibold">כתובת למשלוח</p>
                    <Field label="רחוב ומספר">
                      <input value={street} onChange={(event) => setStreet(event.target.value)} className={field} autoComplete="off" />
                    </Field>
                    <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                      <Field label="עיר">
                        <input value={city} onChange={(event) => setCity(event.target.value)} className={field} autoComplete="off" />
                      </Field>
                      <Field label="מיקוד">
                        <input value={zip} onChange={(event) => setZip(event.target.value)} inputMode="numeric" dir="ltr" className={field} autoComplete="off" />
                      </Field>
                    </div>
                    <p className="m-0 text-xs text-ink-secondary">אם כבר יש לקוח עם האימייל הזה, ההזמנה תשויך אליו.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="m-0 mb-2 text-[15px] font-semibold">הערות</h2>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={free ? "למשל: נשלח לשת״פ עם…" : "הערה פנימית להזמנה"} className="min-h-[88px] w-full resize-y rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 text-sm outline-none focus:border-[#303030]" />
          </section>

          <section className={card}>
            <h2 className="m-0 mb-2 text-[15px] font-semibold">תגיות</h2>
            <input
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitTag(tagText);
                }
              }}
              onBlur={() => commitTag(tagText)}
              placeholder="הוספת תגית ואנטר"
              className={field}
            />
            {tags.length > 0 || (free && freeReason) ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))} className="inline-flex h-6 items-center gap-1 rounded-lg border-0 bg-[#ebebeb] px-2 text-[13px] hover:bg-[#e0e0e0]">
                    {tag}
                    <Icon name="close" size={11} />
                  </button>
                ))}
                {free && freeReason && !tags.includes(freeReason) ? (
                  <span className="inline-flex h-6 items-center rounded-lg bg-[#e3f1df] px-2 text-[13px] text-[#0c5132]">{freeReason}</span>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </form>
  );
}
