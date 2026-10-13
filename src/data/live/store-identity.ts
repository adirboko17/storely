export type StoreIdentity = {
  storeId: string;
  name: string;
  hostname: string;
  ownerName: string;
  ownerEmail: string;
};

const empty: StoreIdentity = {
  storeId: "",
  name: "",
  hostname: "",
  ownerName: "",
  ownerEmail: "",
};

let current: StoreIdentity = empty;
let version = 0;
let appliedStore = "";
const listeners = new Set<() => void>();

export function subscribeStoreIdentity(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreIdentityVersion() {
  return version;
}

export function getStoreIdentity() {
  return current;
}

export function storeMark(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  return name.trim().slice(0, 2) || "ח";
}

export function setStoreIdentity(next: StoreIdentity) {
  current = next;
  version += 1;
  listeners.forEach((listener) => listener());
}

export function claimStore(storeId: string, mark = "") {
  const key = `${storeId}:${mark}`;
  if (typeof window !== "undefined" && appliedStore === key) return false;
  appliedStore = key;
  return true;
}
