import type { AppData, Expense } from "./assistant";

// Keep the original storage key and shape: existing users should not lose their records.
export const initialData: AppData = {
  monthlyIncome: 0, budget: 0, weeklyLimit: 0, dailyLimit: 0,
  reserve: 0, goalTarget: 0, expenses: [], goals: []
};
const safeAmount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 999999999.99
    ? Math.round(value * 100) / 100 : 0;

function validExpense(item: unknown): item is Expense {
  if (!item || typeof item !== "object") return false;
  const value = item as Partial<Expense>;
  return typeof value.id === "string" && value.id.length > 0 &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    typeof value.category === "string" && value.category.trim().length > 0 &&
    typeof value.date === "string" && Number.isFinite(Date.parse(value.date)) &&
    typeof value.amount === "number" && Number.isFinite(value.amount) &&
    value.amount > 0 && value.amount <= 999999999.99;
}

export type RestoredData = { data: AppData; warning: string | null };

/** Decode defensively. Never leave the app in a permanent loading state. */
export function restoreSavedData(raw: string | null): RestoredData {
  if (!raw) return { data: { ...initialData, expenses: [], goals: [] }, warning: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("bad root");
    const value = parsed as Record<string, unknown>;
    const rawExpenses = Array.isArray(value.expenses) ? value.expenses : [];
    const expenses = rawExpenses.filter(validExpense).map(item => ({
      id: item.id, title: item.title.slice(0, 120), category: item.category.slice(0, 60),
      amount: safeAmount(item.amount), date: item.date
    }));
    const rawGoals = Array.isArray(value.goals) ? value.goals : [];
    const goals = rawGoals.filter((item): item is { id: string; title: string; target: number; saved: number } =>
      !!item && typeof item.id === "string" && typeof item.title === "string" &&
      typeof item.target === "number" && Number.isFinite(item.target) &&
      typeof item.saved === "number" && Number.isFinite(item.saved)
    ).map(item => ({
      id: item.id, title: item.title.slice(0, 120),
      target: safeAmount(item.target), saved: safeAmount(item.saved)
    }));
    const amountKeys = ["monthlyIncome","budget","weeklyLimit","dailyLimit","reserve","goalTarget"] as const;
    const amounts = Object.fromEntries(amountKeys.map(key => [key, safeAmount(value[key])])) as
      Pick<AppData, typeof amountKeys[number]>;
    const changed = rawExpenses.length !== expenses.length || rawGoals.length !== goals.length ||
      amountKeys.some(key => value[key] !== amounts[key]) ||
      !Array.isArray(value.expenses) || !Array.isArray(value.goals);
    return {
      data: { ...initialData, ...amounts, expenses, goals },
      warning: changed ? "Alguns dados antigos precisaram de reparo. Uma cópia original foi preservada." : null
    };
  } catch {
    return {
      data: { ...initialData, expenses: [], goals: [] },
      warning: "Dados locais inválidos. O original foi preservado em uma cópia de segurança."
    };
  }
}
