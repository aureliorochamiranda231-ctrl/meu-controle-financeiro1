import { normalize } from "./assistant";

const indicators = {
  selic: { series: 432, label: "Meta Selic", unit: "% ao ano" },
  ipca: { series: 433, label: "IPCA mensal", unit: "%" },
  dolar: { series: 1, label: "Dólar americano (venda)", unit: " reais por dólar" }
} as const;

export function detectIndicator(question: string) {
  const query = normalize(question);
  if (/\bselic\b/.test(query)) return "selic";
  if (/\b(ipca|inflacao)\b/.test(query)) return "ipca";
  if (/\b(dolar|usd|cambio)\b/.test(query)) return "dolar";
  return null;
}

export async function readIndicator(key: keyof typeof indicators, fetchData = fetch) {
  const { series, label, unit } = indicators[key];
  const today = new Date();
  const start = new Date(today.getTime() - 90 * 86_400_000);
  const date = (day: Date) => day.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=${date(start)}&dataFinal=${date(today)}`;
  const isLocalApp = typeof location !== "undefined" &&
    (location.origin === "https://meucontrole.local" ||
      location.origin === "https://appassets.androidplatform.net");
  const endpoint = isLocalApp ? `${location.origin}/indicador/${series}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetchData(endpoint, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP");
    const records = await response.json();
    const record = Array.isArray(records) ? records.at(-1) : null;
    const value = typeof record?.valor === "string" && /^-?\d+(?:[.,]\d+)?$/.test(record.valor)
      ? Number(record.valor.replace(",", ".")) : NaN;
    if (!Number.isFinite(value) || typeof record.data !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(record.data)) {
      throw new Error("Invalid observation");
    }
    const reference = key === "ipca" ? record.data.slice(3) : record.data;
    const amount = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: key === "dolar" ? 4 : 2 });
    return { answer: `${label}: ${amount}${unit}.\nReferência: ${reference}. Fonte: Banco Central do Brasil (SGS ${series}).`, source: url };
  } catch {
    return { answer: `A consulta de ${label} ao Banco Central está indisponível agora. Confira a conexão e tente novamente.` };
  } finally {
    clearTimeout(timer);
  }
}
