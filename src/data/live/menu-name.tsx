"use client";

import { createContext, useContext, type ReactNode } from "react";

let menuName = "";
let edited = false;
const listeners = new Set<() => void>();

function publish(next: string) {
  if (menuName === next) return;
  menuName = next;
  listeners.forEach((listener) => listener());
}

export function subscribeMenuName(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMenuName() {
  return menuName;
}

/** Server value. A name saved in this session stays until reload. */
export function adoptMenuName(serverName: string) {
  if (edited) return;
  publish(serverName);
}

export function setMenuName(name: string) {
  edited = true;
  publish(name);
}

const MenuAccountContext = createContext("");

export function MenuAccountProvider({ name, children }: { name: string; children: ReactNode }) {
  adoptMenuName(name);
  return <MenuAccountContext.Provider value={name}>{children}</MenuAccountContext.Provider>;
}

export function useMenuAccount() {
  return useContext(MenuAccountContext);
}
