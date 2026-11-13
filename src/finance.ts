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
