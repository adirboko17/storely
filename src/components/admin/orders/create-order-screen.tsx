"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";
import { softButton } from "@/components/admin/orders/chrome";
import { useAdminSlice } from "@/components/admin/slice-pending";
import { reloadAdminSlice } from "@/data/live/admin-slices";
import { getStoreIdentity, getStoreIdentityVersion, subscribeStoreIdentity } from "@/data/live/store-identity";
import { writeStore } from "@/data/live/write";
import { getCatalogVersion, listCatalogProducts, subscribeCatalog } from "@/data/mock/catalog-session";
import { getPeopleVersion, listPeople, subscribePeople } from "@/data/mock/people-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { currencyLabel } from "@/lib/formatting/currency";
import { formatMoney } from "@/lib/formatting/money";
import { itemsLabel } from "@/lib/orders/present";
import type { Product } from "@/types/commerce";

const FREE_SHIPPING = 250;

const card = "rounded-xl bg-white p-4 shadow-[var(--shadow-card)]";
const field =
  "h-9 w-full rounded-lg border border-[#d0d0d0] bg-white px-3 text-sm text-ink outline-none placeholder:text-[#9b9b9b] hover:border-[#a8a8a8] focus:border-[#303030] focus:shadow-[0_0_0_3px_rgba(48,48,48,.1)]";
const solidButton =
  "inline-flex h-9 items-center rounded-lg border-0 bg-[#303030] px-4 text-sm font-semibold text-white hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-[#8a8a8a]";

type DraftLine = {
  key: string;
  productId?: string;
  title: string;
  variant: string;
  price: number;
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

function MoneyRow({ label, detail, value, strong = false }: { label: string; detail?: string; value: string; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-2 text-sm ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="text-ink-secondary">{detail}</span>
      <span dir="ltr">{value}</span>
    </div>
  );
}

export function CreateOrderScreen() {
  const router = useRouter();
  const { toast, narrow } = useAdmin();
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  useSyncExternalStore(subscribePeople, getPeopleVersion, () => 0);
  useSyncExternalStore(subscribeStoreIdentity, getStoreIdentityVersion, () => 0);
  const catalogReady = useAdminSlice("catalog");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picker, setPicker] = useState<"product" | "custom" | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountText, setDiscountText] = useState("");
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shippingText, setShippingText] = useState("");
  const [payment, setPayment] = useState<"pending" | "paid">("pending");
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<FoundCustomer[]>([]);
  const [selected, setSelected] = useState<FoundCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.price * line.qty, 0) * 100) / 100;
  const discount = discountOpen ? amountOf(discountText) : 0;
  const shipping = shippingOpen ? amountOf(shippingText) : 0;
  const discountValue = discount ?? 0;
  const shippingValue = shipping ?? 0;
  const goods = Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);
  const total = Math.round((goods + shippingValue) * 100) / 100;
  const freeShipping = goods >= FREE_SHIPPING && shippingValue === 0;
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
      return;
    }
    let cancel = false;
    setMatches(localCustomers(query));
    const timer = window.setTimeout(() => {
      void searchStoreCustomers(query).then((found) => {
        if (!cancel && found) setMatches(found);
      });
    }, 220);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [customerQuery, selected]);

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
          qty: 1,
          image: product.media?.find((url) => url.startsWith("http")),
          stock: product.stock,
        },
      ];
    });
    setProductQuery("");
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
      { key: `custom-${Date.now()}`, title, variant: "", price, qty },
    ]);
    setCustomTitle("");
    setCustomPrice("");
    setCustomQty("1");
    setPicker(null);
    setError("");
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

  function startNewCustomer() {
    setSelected(null);
    setCreating(true);
    setName((current) => current || customerQuery.trim());
    setCustomerQuery("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (lines.length === 0) {
      setError("צריך להוסיף לפחות מוצר אחד");
      return;
    }
    if (discount == null || shipping == null) {
      setError("הנחה או משלוח לא תקינים");
      return;
    }
    if (!selected && !name.trim()) {
      setError("צריך לבחור לקוח או לרשום שם");
      return;
    }
    const pendingTag = tagText.replace(/,/g, "").trim().slice(0, 40);
    const orderTags = pendingTag && !tags.includes(pendingTag) && tags.length < 12 ? [...tags, pendingTag] : tags;
    setSaving(true);
    setError("");
    try {
      const data = await writeStore("create_store_order", {
        payload: {
          customerId: selected?.id,
          customer: selected
            ? undefined
            : { name: name.trim(), email: email.trim(), phone: phone.trim(), street: street.trim(), city: city.trim(), zip: zip.trim() },
          lines: lines.map((line) =>
            line.productId
              ? { productId: line.productId, quantity: line.qty }
              : { title: line.title, quantity: line.qty, unitPrice: line.price },
          ),
          discount,
          shipping,
          shippingName: shipping > 0 ? "משלוח" : freeShipping ? "משלוח חינם" : "ללא משלוח",
          payment,
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
      toast("ההזמנה נוצרה");
      router.push(`/admin/orders/${result.orderNumber}`);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "לא הצלחנו לשמור את ההזמנה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form data-screen-label="Create order" onSubmit={(event) => void save(event)} className="mx-auto flex max-w-[1040px] flex-col gap-4" style={{ padding: narrow ? 16 : 24 }}>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" aria-label="חזרה להזמנות" onClick={() => router.push("/admin/orders")} className="grid size-8 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-[#4a4a4a] hover:bg-[#e3e3e3]">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 10h12M11 5l5 5-5 5" />
          </svg>
        </button>
        <h1 className="m-0 flex-1 text-[22px] leading-7 font-bold">יצירת הזמנה</h1>
        <button type="submit" className={solidButton} disabled={saving}>
          {saving ? "שומר…" : "יצירת הזמנה"}
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="m-0 mb-3 text-[15px] font-semibold">מוצרים</h2>
            {lines.length > 0 ? (
              <div className="mb-3 flex flex-col">
                {lines.map((line) => (
                  <div key={line.key} className="flex items-start gap-3 border-b border-[#ebebeb] py-3 last:border-b-0">
                    {line.image ? (
                      <img src={line.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#f1f1f1] text-xs text-[#8a8a8a]">פריט</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{line.title}</div>
                      {line.variant ? <div className="text-xs text-ink-secondary">{line.variant}</div> : null}
                      <div dir="ltr" className="text-xs text-[#6e5650]">
                        {formatMoney(line.price)} × {line.qty}
                      </div>
                      {line.stock != null && line.qty > line.stock ? (
                        <div className="text-xs text-[#8a4b08]">במלאי נשארו {line.stock}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="הפחתת כמות" className="grid size-7 place-items-center rounded-lg border-0 bg-[#f1f1f1] text-sm" onClick={() => setLines((current) => current.flatMap((item) => (item.key === line.key ? (item.qty <= 1 ? [] : [{ ...item, qty: item.qty - 1 }]) : [item])))}>
                        −
                      </button>
                      <span className="w-6 text-center text-sm">{line.qty}</span>
                      <button type="button" aria-label="הוספת כמות" className="grid size-7 place-items-center rounded-lg border-0 bg-[#f1f1f1] text-sm" onClick={() => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, qty: Math.min(999, item.qty + 1) } : item)))}>
                        +
                      </button>
                    </div>
                    <span dir="ltr" className="w-20 text-end text-sm font-medium">
                      {formatMoney(line.price * line.qty)}
                    </span>
                    <button type="button" aria-label="הסרת פריט" className="grid size-7 place-items-center rounded-lg border-0 bg-transparent text-[#8a8a8a] hover:bg-[#f1f1f1]" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex min-h-[72px] flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-[#d0d0d0] px-3 py-4">
              <button type="button" className={softButton} onClick={() => setPicker((current) => (current === "custom" ? null : "custom"))}>
                + פריט מותאם
              </button>
              <button type="button" className={softButton} onClick={() => setPicker((current) => (current === "product" ? null : "product"))}>
                + מוצר
              </button>
            </div>

            {picker === "product" ? (
              <div className="mt-3">
                <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="חיפוש מוצר" className={field} autoFocus />
                <div className="mt-2 overflow-hidden rounded-lg border border-[#ebebeb]">
                  {catalogReady && productMatches.length === 0 ? <p className="m-0 px-3 py-3 text-sm text-ink-secondary">אין מוצר כזה</p> : null}
                  {!catalogReady && productMatches.length === 0 ? <p className="m-0 px-3 py-3 text-sm text-ink-secondary">טוען מוצרים…</p> : null}
                  {productMatches.map((product) => (
                    <button key={product.sourceId} type="button" onClick={() => addProduct(product)} className="flex w-full items-center gap-3 border-0 border-b border-[#f1f1f1] bg-white px-3 py-2 text-start last:border-b-0 hover:bg-[#f7f7f7]">
                      {product.media?.[0] ? <img src={product.media[0]} alt="" className="size-8 rounded-md object-cover" /> : <span className="size-8 rounded-md bg-[#f1f1f1]" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{product.title}</span>
                        <span className="block text-xs text-ink-secondary">{product.status === "draft" ? "טיוטה · " : ""}במלאי {product.stock}</span>
                      </span>
                      <span dir="ltr" className="text-sm">{formatMoney(product.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {picker === "custom" ? (
              <div className="mt-3 grid gap-2">
                <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="שם הפריט" className={field} autoFocus />
                <div className="grid grid-cols-2 gap-2">
                  <input value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} inputMode="decimal" placeholder="מחיר" className={field} />
                  <input value={customQty} onChange={(event) => setCustomQty(event.target.value)} inputMode="numeric" placeholder="כמות" className={field} />
                </div>
                <button type="button" className={`${softButton} justify-center`} onClick={addCustom}>
                  הוספת פריט
                </button>
              </div>
            ) : null}
          </section>

          <section className={`${card} flex flex-col gap-3`}>
            <h2 className="m-0 text-[15px] font-semibold">תשלום</h2>
            {lines.length === 0 ? (
              <p className="m-0 text-sm text-ink-secondary">הוסיפו מוצר כדי לחשב סה״כ ואפשרויות תשלום</p>
            ) : (
              <>
                <MoneyRow label="סכום ביניים" detail={itemsLabel(lines.reduce((sum, line) => sum + line.qty, 0))} value={formatMoney(subtotal)} />
                {discountOpen ? (
                  <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 text-sm">
                    <span>הנחה</span>
                    <input value={discountText} onChange={(event) => setDiscountText(event.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
                  </label>
                ) : (
                  <button type="button" className="w-fit border-0 bg-transparent p-0 text-sm text-[#2c6ecb] hover:underline" onClick={() => setDiscountOpen(true)}>
                    הוספת הנחה
                  </button>
                )}
                {shippingOpen ? (
                  <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 text-sm">
                    <span>משלוח</span>
                    <input value={shippingText} onChange={(event) => setShippingText(event.target.value)} inputMode="decimal" placeholder="0.00" className={field} />
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <button type="button" className="border-0 bg-transparent p-0 text-[#2c6ecb] hover:underline" onClick={() => setShippingOpen(true)}>
                      {freeShipping ? "משלוח חינם" : "הוספת משלוח"}
                    </button>
                    <span dir="ltr">{formatMoney(0)}</span>
                  </div>
                )}
                {freeShipping && !shippingOpen ? <p className="m-0 text-xs text-ink-secondary">משלוח חינם מעל {formatMoney(FREE_SHIPPING)}</p> : null}
                <MoneyRow label="מע״מ משוער" detail="כלול במחיר" value={formatMoney(includedVat(total))} />
                <MoneyRow label="סה״כ" value={formatMoney(total)} strong />
                <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 text-sm">
                  <span>תשלום</span>
                  <select value={payment} onChange={(event) => setPayment(event.target.value === "paid" ? "paid" : "pending")} className={field}>
                    <option value="pending">ממתין לתשלום</option>
                    <option value="paid">שולם</option>
                  </select>
                </label>
              </>
            )}
            {error ? <p className="m-0 text-sm text-[#b42318]">{error}</p> : null}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="m-0 mb-2 text-sm font-semibold">הערות</h2>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="הערה להזמנה" className="min-h-[88px] w-full resize-y rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 text-sm outline-none focus:border-[#303030]" />
          </section>

          <section className={card}>
            <h2 className="m-0 mb-2 text-sm font-semibold">לקוח</h2>
            {selected ? (
              <div className="rounded-lg bg-[#f6f6f6] p-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{selected.name}</div>
                    {selected.email ? <div className="text-ink-secondary">{selected.email}</div> : null}
                    {selected.phone ? <div dir="ltr" className="text-ink-secondary">{selected.phone}</div> : null}
                    {selected.city || selected.street ? <div className="text-ink-secondary">{[selected.street, selected.city].filter(Boolean).join(", ")}</div> : null}
                  </div>
                  <button type="button" className="border-0 bg-transparent p-0 text-xs text-[#2c6ecb]" onClick={() => setSelected(null)}>
                    הסרה
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="חיפוש או יצירת לקוח" className={field} />
                {customerQuery.trim() && matches.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-lg border border-[#ebebeb]">
                    {matches.map((customer) => (
                      <button key={customer.id} type="button" onClick={() => { setSelected(customer); setCreating(false); setCustomerQuery(""); }} className="block w-full border-0 border-b border-[#f1f1f1] bg-white px-3 py-2 text-start last:border-b-0 hover:bg-[#f7f7f7]">
                        <span className="block text-sm">{customer.name}</span>
                        <span className="block text-xs text-ink-secondary">{customer.email || customer.phone || customer.city}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {customerQuery.trim() && matches.length === 0 ? (
                  <button type="button" className="mt-2 border-0 bg-transparent p-0 text-sm text-[#2c6ecb] hover:underline" onClick={startNewCustomer}>
                    יצירת לקוח: {customerQuery.trim()}
                  </button>
                ) : null}
                {!creating ? (
                  <button type="button" className="mt-2 border-0 bg-transparent p-0 text-sm text-[#2c6ecb] hover:underline" onClick={startNewCustomer}>
                    לקוח חדש
                  </button>
                ) : (
                  <div className="mt-3 grid gap-2">
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="שם" className={field} />
                    <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="אימייל" inputMode="email" className={field} />
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="טלפון" inputMode="tel" className={field} />
                    <input value={street} onChange={(event) => setStreet(event.target.value)} placeholder="רחוב" className={field} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="עיר" className={field} />
                      <input value={zip} onChange={(event) => setZip(event.target.value)} placeholder="מיקוד" className={field} />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className={`${card} flex items-center justify-between gap-3`}>
            <h2 className="m-0 text-sm font-semibold">שוק</h2>
            <span className="text-sm">ישראל</span>
          </section>
          <section className={`${card} flex items-center justify-between gap-3`}>
            <h2 className="m-0 text-sm font-semibold">מטבע</h2>
            <span className="text-sm">{currencyLabel()}</span>
          </section>
          <section className={card}>
            <h2 className="m-0 mb-2 text-sm font-semibold">תגיות</h2>
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
              placeholder="הוספת תגית"
              className={field}
            />
            {tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))} className="inline-flex h-6 items-center rounded-lg border-0 bg-[#ebebeb] px-2 text-[13px]">
                    {tag} ×
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </form>
  );
}
