export function parseMoney(input: string): number {
  const value = input.trim();
  if (!value) return 0;
  const brazilian = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$|^\d+(,\d{1,2})$/;
  const decimal = /^\d+(\.\d{1,2})?$/;
  const normalized = brazilian.test(value)
    ? value.replace(/\./g, "").replace(",", ".")
    : decimal.test(value) ? value : "";
  if (!normalized) return NaN;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents / 100 : NaN;
}

export function sumExpenses(expenses: { amount: number }[]): number {
  return expenses.reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100;
}

export function weekBounds(today: Date): [Date, Date] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return [start, end];
}

export const money = (amount: number) =>
  amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function monthBounds(today: Date): [Date, Date] {
  return [
    new Date(today.getFullYear(), today.getMonth(), 1),
    new Date(today.getFullYear(), today.getMonth() + 1, 1)
  ];
}

export function dayBounds(today: Date): [Date, Date] {
  const { start, end } = {
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  };
  return [start, end];
}

export function daysUntil(start: Date, end: Date) {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(end) - utc(start)) / 86_400_000);
}

export function difference(limit: number, spent: number) {
  return (Math.round(limit * 100) - Math.round(spent * 100)) / 100;
}

export function dailyAllowance(daily: number, weekly: number, spent: number, today: Date) {
  if (daily > 0) return { amount: daily, automatic: false };
  if (!weekly) return null;
  const days = daysUntil(today, weekBounds(today)[1]);
  return { amount: Math.floor(Math.max(0, difference(weekly, spent)) * 100 / days + 1e-8) / 100, automatic: true };
}
