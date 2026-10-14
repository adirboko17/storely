import { CUSTOMERS } from "@/data/mock/customers";
import { getStoreIdentity } from "@/data/live/store-identity";
import { isHydrating, writeStore } from "@/data/live/write";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer } from "@/types/commerce";

export type PersonProfile = {
  subscribed: boolean;
  note: string;
  tags: string[];
  credit: number;
  comments: Array<{ text: string; time: string }>;
  blocks: Array<{ title: string; value: string }>;
  language?: "he" | "en";
  sms?: boolean;
  whatsapp?: boolean;
};

type Snapshot = {
  version: number;
  added: Customer[];
  profiles: Record<number, PersonProfile>;
};

function defaultProfile(_customer: Customer): PersonProfile {
  return {
    subscribed: false,
    note: "",
    tags: [],
    credit: 0,
    comments: [],
    blocks: [],
  };
}

let current: Snapshot = { version: 0, added: [], profiles: {} };
const listeners = new Set<() => void>();

function publish(next: Omit<Snapshot, "version">) {
  current = { ...next, version: current.version + 1 };
  listeners.forEach((listener) => listener());
}

export function subscribePeople(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPeopleVersion() {
  return current.version;
}

export function replacePeople(people: Customer[], profiles: Record<number, PersonProfile> = {}) {
  CUSTOMERS.splice(0, CUSTOMERS.length, ...people.map((person) => ({ ...person })));
  publish({ added: [], profiles });
}

function persistPerson(person: Customer, profile: PersonProfile) {
  if (!person.sourceId || isHydrating()) return;
  void writeStore("save_store_customer", {
    customer_id: person.sourceId,
    customer_name: person.name,
    customer_email: person.email,
    customer_phone: person.phone,
    customer_street: person.street,
    customer_city: person.city,
    customer_zip: person.zip,
    replace_profile: true,
    customer_note: profile.note,
    customer_tags: profile.tags,
    customer_subscribed: profile.subscribed,
    customer_credit: profile.credit,
    customer_locale: profile.language ?? "he",
    customer_sms: profile.sms ?? false,
    customer_whatsapp: profile.whatsapp ?? false,
  });
}

export function listPeople() {
  return [...current.added, ...CUSTOMERS];
}

export function getPerson(id: number) {
  return listPeople().find((person) => person.id === id) ?? null;
}

export function profileOf(customer: Customer): PersonProfile {
  return current.profiles[customer.id] ?? defaultProfile(customer);
}

export function patchProfile(id: number, patch: Partial<PersonProfile>) {
  const person = getPerson(id);
  if (!person) return;
  const base = profileOf(person);
  const next = { ...base, ...patch };
  publish({ ...current, profiles: { ...current.profiles, [id]: next } });
  persistPerson(person, next);
}

export function addPerson(input: Pick<Customer, "name" | "email" | "phone" | "city"> & Partial<Pick<Customer, "street" | "zip">>) {
  const id = Math.max(0, ...listPeople().map((person) => person.id)) + 1;
  const person: Customer = { id, name: input.name, email: input.email, phone: input.phone, street: input.street ?? "", city: input.city, zip: input.zip ?? "", orders: 0 };
  publish({ ...current, added: [person, ...current.added] });
  if (typeof window !== "undefined" && getStoreIdentity().storeId) {
    const supabase = createSupabaseBrowserClient();
    void supabase
      .rpc("save_store_customer", {
        target_store: getStoreIdentity().storeId,
        customer_id: null,
        customer_name: person.name,
        customer_email: person.email,
        customer_phone: person.phone,
        customer_street: person.street,
        customer_city: person.city,
        customer_zip: person.zip,
      })
      .then(({ data }) => {
        if (typeof data !== "string" || !data) return;
        publish({
          ...current,
          added: current.added.map((item) => (item.id === id ? { ...item, sourceId: data } : item)),
        });
      });
  }
  return person;
}
