const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const whole = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatMoney(value: number) {
  const sign = value < -0.004 ? "−" : "";
  return `${sign}₪${money.format(Math.abs(value))}`;
}

export function formatMoney0(value: number) {
  return `₪${whole.format(Math.round(value))}`;
}

export function formatInteger(value: number) {
  return whole.format(Math.round(value));
}
