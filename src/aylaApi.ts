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

/** The mobile app must use an HTTPS endpoint. No tokens are stored in build config. */
export function normalizeAylaEndpoint(text: string): string | null {
  const raw = text.trim();
  if (!/^https:\/\//i.test(raw)) return null;
  try {
    const uri = new URL(raw);
    if (uri.protocol !== "https:" || !uri.hostname.includes(".") ||
      uri.username || uri.password || uri.search || uri.hash) return null;
    if (uri.pathname === "/" || uri.pathname === "") uri.pathname = "/chat";
    if (uri.pathname !== "/chat") return null;
    return uri.toString();
  } catch {
    return null;
  }
}

export type AylaPrivateConnection = { endpoint: string; token: string };
export function isAylaConnectionReady(config: AylaPrivateConnection | null): boolean {
  return !!config && !!normalizeAylaEndpoint(config.endpoint) &&
    config.token.length >= 32 && config.token.length <= 256;
}

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
 * Requests travel encrypted to an HTTPS server; its private bearer token lives
 * only in application memory during this beta session (never in AsyncStorage).
 * The server holds the OpenAI API key and authenticates before any AI call.
 */
export async function askAylaOnline(
  config: AylaPrivateConnection,
  history: AylaMessage[],
  summary?: AylaFinancialSummary,
  signal?: AbortSignal
): Promise<string> {
  const url = normalizeAylaEndpoint(config.endpoint);
  if (!url || !isAylaConnectionReady(config)) {
    throw new Error("Configure o endereço HTTPS e a chave privada da Ayla.");
  }
  const messages = history.slice(-12).map(item => ({
    role: item.role,
    content: item.content.slice(0, 2000)
  }));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.token
    },
    body: JSON.stringify({ messages, ...(summary ? { financialSummary: summary } : {}) }),
    signal
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("A chave privada da Ayla está incorreta ou foi revogada.");
    if (response.status === 429) throw new Error("Limite temporário de perguntas atingido.");
    if (response.status === 503) throw new Error("Servidor da Ayla ainda não está configurado ou está indisponível.");
    throw new Error("Não foi possível conversar com a Ayla online.");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("reply" in data) ||
    typeof data.reply !== "string" || !data.reply.trim() || data.reply.length > 12000) {
    throw new Error("Resposta inválida do servidor da Ayla.");
  }
  return data.reply.trim();
}
