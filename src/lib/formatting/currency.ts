export const STORE_CURRENCIES = [
  { code: "ILS", label: "שקל חדש (ILS ₪)", symbol: "₪" },
  { code: "USD", label: "דולר אמריקאי (USD $)", symbol: "$" },
  { code: "EUR", label: "אירו (EUR €)", symbol: "€" },
] as const;

export type StoreCurrency = (typeof STORE_CURRENCIES)[number]["code"];

let current: StoreCurrency = "ILS";

export function isStoreCurrency(value: string): value is StoreCurrency {
  return STORE_CURRENCIES.some((item) => item.code === value);
}

export function getStoreCurrency() {
  return current;
}

export function currencySymbol(code = current) {
  return STORE_CURRENCIES.find((item) => item.code === code)?.symbol ?? "₪";
}

export function currencyLabel(code = current) {
  return STORE_CURRENCIES.find((item) => item.code === code)?.label ?? STORE_CURRENCIES[0].label;
}

export function setStoreCurrency(value: unknown) {
  current = typeof value === "string" && isStoreCurrency(value) ? value : "ILS";
}
