import { CUSTOMERS } from "@/data/mock/customers";
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

function defaultProfile(customer: Customer): PersonProfile {
  return {
    subscribed: customer.id % 3 !== 1,
    note: customer.id === 0 ? "מעדיפה איסוף עצמי כשהסטודיו פתוח." : "",
    tags: customer.orders >= 8 ? ["VIP"] : customer.orders >= 5 ? ["חוזר"] : [],
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
  publish({ ...current, profiles: { ...current.profiles, [id]: { ...base, ...patch } } });
}

export function addPerson(input: Pick<Customer, "name" | "email" | "phone" | "city"> & Partial<Pick<Customer, "street" | "zip">>) {
  const id = Math.max(0, ...listPeople().map((person) => person.id)) + 1;
  const person: Customer = { id, name: input.name, email: input.email, phone: input.phone, street: input.street ?? "", city: input.city, zip: input.zip ?? "", orders: 0 };
  publish({ ...current, added: [person, ...current.added] });
  return person;
}
