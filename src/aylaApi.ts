import type { AppData } from "./assistant";
import { monthBounds, sumExpenses, weekBounds } from "./finance";

export type AylaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  sentOnline?: boolean;
  createdAt: string;
};

export type AylaFinancialSummary = {
  month: string;
  monthlyIncome: number;
  monthlyBudget: number;
  monthlySpent: number;
  weeklyLimit: number;
  weeklySpent: number;
  dailyLimit: number;
  reserve: number;
  reserveGoal: number;
};

const apiUrl = (process.env.EXPO_PUBLIC_AYLA_API_URL ?? "").trim();

/** Only an HTTPS service owned by the developer. Never embed an AI API key in an APK. */
export const aylaOnlineConfigured = /^https:\/\/[^/]+/i.test(apiUrl);

export function financialSummary(data: AppData, now = new Date()): AylaFinancialSummary {
  const inBounds = ([start, end]: [Date, Date]) => sumExpenses(
    data.expenses.filter(item => {
      const date = new Date(item.date);
      return date >= start && date < end;
    })
  );
  return {
    month: now.toISOString().slice(0, 7),
    monthlyIncome: data.monthlyIncome,
    monthlyBudget: data.budget,
    monthlySpent: inBounds(monthBounds(now)),
    weeklyLimit: data.weeklyLimit,
    weeklySpent: inBounds(weekBounds(now)),
    dailyLimit: data.dailyLimit,
    reserve: data.reserve,
    reserveGoal: data.goalTarget
  };
}

/**
 * Contract: POST EXPO_PUBLIC_AYLA_API_URL with {messages, financialSummary?}.
 * The trusted server authenticates the user, rate limits and calls its model.
 * The server responds with {reply: string}. It never receives permissions
 * to mutate phone data; financial changes go through local confirmation.
 */
export async function askAylaOnline(
  history: AylaMessage[],
  summary?: AylaFinancialSummary,
  signal?: AbortSignal
): Promise<string> {
  if (!aylaOnlineConfigured) throw new Error("A IA online ainda não foi configurada.");
  const messages = history.slice(-12).map(item => ({
    role: item.role,
    content: item.content.slice(0, 2000)
  }));
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...(summary ? { financialSummary: summary } : {}) }),
    signal
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("A conexão da Ayla precisa de autenticação. Tente novamente após entrar na sua conta.");
    }
    if (response.status === 429) throw new Error("Ayla recebeu muitas perguntas. Tente novamente em instantes.");
    throw new Error("Não foi possível conversar com a Ayla online agora.");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("reply" in data) ||
      typeof data.reply !== "string" || !data.reply.trim() || data.reply.length > 12000) {
    throw new Error("Ayla recebeu uma resposta inválida. Tente novamente.");
  }
  return data.reply.trim();
}
