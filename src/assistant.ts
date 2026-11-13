import { dailyAllowance, dayBounds, money, monthBounds, parseMoney, sumExpenses, weekBounds } from "./finance";

export type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
};

export type AppData = {
  monthlyIncome: number;
  budget: number;
  weeklyLimit: number;
  dailyLimit: number;
  reserve: number;
  goalTarget: number;
  expenses: Expense[];
  goals: { id: string; title: string; target: number; saved: number }[];
};

export const categories = ["Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Compras", "Outros"];

export const suggestedQuestions = [
  { label: "Resumo", question: "Como estão minhas finanças?" },
  { label: "Limite diário", question: "Quanto posso gastar hoje?" },
  { label: "Limite semanal", question: "Quanto resta do meu limite semanal?" },
  { label: "Calcular limites", question: "Calcule meus limites" },
  { label: "Por categoria", question: "Em que categorias mais gastei este mês?" },
  { label: "Reserva", question: "Quanto falta para minha meta da reserva?" }
];

export function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const examples = {
  summary: ["como estão minhas finanças", "me dá um panorama da minha situação", "como andam minhas contas", "me atualiza", "como estou indo"],
  reserve: ["quanto falta para minha meta da reserva", "meu fundo de emergência", "quanto tenho juntado", "quanto eu já poupei", "quanto consegui economizar para emergências"],
  income: ["qual é minha renda mensal", "qual meu salário", "quanto recebo por mês", "quanto entra por mês"],
  limit: ["quanto resta no limite semanal", "ainda tenho margem para gastar", "quanto posso desembolsar", "quanto posso gastar ainda", "quanto dinheiro tenho livre"],
  categories: ["em que categorias mais gastei", "onde foi parar meu dinheiro", "com o que mais gastei", "para onde foi meu dinheiro", "como se dividem minhas despesas"],
  largest: ["qual foi minha maior despesa", "quais foram os pagamentos mais altos", "o que pesou mais no bolso", "quais foram as compras mais caras"],
  total: ["quanto gastei", "quanto saiu da minha conta", "quanto desembolsei", "qual o total dos meus gastos", "qual o valor somado dos pagamentos"]
} as const;

type Intent = keyof typeof examples;

const stopWords = new Set("a o as os de da do das dos e em com por para um uma eu me meu minha meus minhas foi qual quais que quanto tem se no na".split(" "));

function words(text: string) {
  return new Set(normalize(text).match(/[a-z]+/g)?.filter(word => !stopWords.has(word)) ?? []);
}

const trainingExamples = (Object.keys(examples) as Intent[]).flatMap(intent =>
  examples[intent].map(example => ({ intent, terms: words(example) }))
);

function classifyIntent(query: string): Intent | undefined {
  const terms = words(query);
  let bestScore = 0.53;
  let bestIntent: Intent | undefined;
  for (const example of trainingExamples) {
    const overlap = [...terms].filter(term => example.terms.has(term)).length;
    const score = terms.size && example.terms.size ? overlap / Math.sqrt(terms.size * example.terms.size) : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = example.intent;
    }
  }
  return bestIntent;
}

function inPeriod(expenses: Expense[], bounds: [Date, Date]) {
  const [start, end] = bounds;
  return expenses.filter(item => {
    const date = new Date(item.date);
    return date >= start && date < end;
  });
}

function remaining(label: string, limit: number, spent: number) {
  if (!limit) return `${label}: defina um valor em Ajustes.`;
  const difference = Math.round(limit * 100) - Math.round(spent * 100);
  const status = difference < 0 ? "acima do limite" : "disponíveis";
  return `${label}: ${money(spent)} de ${money(limit)} usados. ${money(Math.abs(difference) / 100)} ${status}.`;
}

function reservation(data: AppData) {
  const saved = `Você tem ${money(data.reserve)} na reserva registrada.`;
  if (!data.goalTarget) return `${saved} Você pode definir uma meta em Ajustes.`;
  if (data.reserve >= data.goalTarget) return `${saved} Sua meta de ${money(data.goalTarget)} foi atingida.`;
  return `${saved} Faltam ${money(data.goalTarget - data.reserve)} para a meta de ${money(data.goalTarget)}.`;
}

function expenseDetails(expenses: Expense[], period: string) {
  if (!expenses.length) return `Você ainda tem zero despesas registradas ${period}.`;
  const top = [...expenses].sort((first, second) => second.amount - first.amount).slice(0, 3);
  return `Maiores despesas ${period}:\n` + top.map(item => `• ${item.title} · ${money(item.amount)}`).join("\n");
}

function categoryDetails(expenses: Expense[], period: string) {
  const totals = new Map<string, number>();
  for (const item of expenses) {
    const cents = Math.round(item.amount * 100);
    totals.set(item.category, (totals.get(item.category) ?? 0) + cents);
  }
  if (!totals.size) return `Você ainda tem zero despesas registradas ${period}.`;
  const groups = [...totals].sort((first, second) => second[1] - first[1]);
  return `Gastos por categoria ${period}:\n` + groups.map(([category, cents]) => `• ${category} · ${money(cents / 100)}`).join("\n");
}

export function answerQuestion(question: string, data: AppData, now = new Date()): string {
  const query = normalize(question);
  const intent = classifyIntent(query);
  const week = weekBounds(now);
  const month = monthBounds(now);
  const weekly = sumExpenses(inPeriod(data.expenses, week));
  const monthly = sumExpenses(inPeriod(data.expenses, month));
  const lastWeek = new Date(week[0]);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(month[0].getFullYear(), month[0].getMonth() - 1, 1);
  const [today, tomorrow] = dayBounds(now);
  const daily = sumExpenses(inPeriod(data.expenses, [today, tomorrow]));
  const day = dailyAllowance(data.dailyLimit, data.weeklyLimit, weekly, now);
  const dayStatus = !day ? "Limite diário: defina um limite diário ou semanal em Ajustes."
    : day.automatic ? `Sugestão para gastar ainda hoje: ${money(day.amount)}. Dividi o saldo semanal pelos dias restantes até domingo, incluindo hoje. Gastos de hoje: ${money(daily)}.`
    : remaining("Limite diário", day.amount, daily);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let period = "neste mês";
  let bounds = month;
  if (/\b(hoje|ontem)\b/.test(query)) {
    const previousDay = /\bontem\b/.test(query);
    bounds = previousDay ? [yesterday, today] : [today, tomorrow];
    period = previousDay ? "ontem" : "hoje";
  } else if (/semana passada/.test(query)) {
    bounds = [lastWeek, week[0]];
    period = "na semana passada";
  } else if (/mes passado/.test(query)) {
    bounds = [lastMonth, month[0]];
    period = "no mês passado";
  } else if (/\b(semanal|semana)\b/.test(query)) {
    bounds = week;
    period = "nesta semana";
  }
  const allTime = /\b(historico completo|desde o inicio|todo o historico|total geral|todos os gastos)\b/.test(query);
  const expenses = allTime ? data.expenses : inPeriod(data.expenses, bounds);
  if (allTime) period = "em todo o histórico";

  if (/\b(compare|comparar|comparacao|gastei mais)\b/.test(query) &&
      /semana passada|mes passado/.test(query)) {
    const isWeek = /semana passada/.test(query);
    const previous = sumExpenses(inPeriod(data.expenses, isWeek ? [lastWeek, week[0]] : [lastMonth, month[0]]));
    const current = isWeek ? weekly : monthly;
    return `Você registrou ${money(current)} ${isWeek ? "nesta semana" : "neste mês"} até agora e ${money(previous)} ${isWeek ? "na semana passada inteira" : "no mês passado inteiro"}.`;
  }

  if (/\b(reserva|meta|guardad[oa])\b/.test(query) || intent === "reserve") return reservation(data);
  if (/\b(renda|salario|ganho mensal)\b/.test(query) || intent === "income") {
    return data.monthlyIncome > 0
      ? `Sua renda mensal cadastrada é ${money(data.monthlyIncome)}. Você registrou ${money(monthly)} em despesas neste mês.`
      : "Sua renda mensal está em branco. Você pode preenchê-la em Ajustes.";
  }

  const simulation = query.match(/\b(?:gastar|pagar|comprar|compra de|cenario de)\s+(?:r\$\s*)?(\d+(?:[.,]\d+)*)/);
  if (simulation) {
    const amount = parseMoney(simulation[1]);
    if (!Number.isFinite(amount) || amount <= 0) return "Informe um valor válido em reais para simular a despesa.";
    return `Se você acrescentar uma despesa de ${money(amount)} hoje:\n` +
      (data.dailyLimit > 0 ? remaining("Limite diário", data.dailyLimit, sumExpenses([{ amount }, { amount: daily }])) + "\n" : "") +
      remaining("Limite semanal", data.weeklyLimit, sumExpenses([{ amount }, { amount: weekly }])) + "\n" +
      remaining("Orçamento mensal", data.budget, sumExpenses([{ amount }, { amount: monthly }]));
  }

  const queryWords = query.split(/[^a-z0-9]+/);
  const group = [...new Set([...categories, ...data.expenses.map(item => item.category)])]
    .find(category => normalize(category).split(/\s+/).every(word => queryWords.includes(word)));
  const merchant = question.match(/(?:^|\s)["“]([^"”]+)["”]/)?.[1];
  if (merchant || group) {
    const matches = expenses.filter(item =>
      merchant ? normalize(item.title).includes(normalize(merchant)) : item.category === group
    );
    if (!matches.length) return `Encontrei zero despesas de ${merchant || group} ${period}.`;
    return `Você registrou ${money(sumExpenses(matches))} em ${matches.length} ${matches.length === 1 ? "despesa" : "despesas"} de ${merchant || group} ${period}.`;
  }

  if (/\b(categorias?|onde|em que|com o que)\b/.test(query)) return categoryDetails(expenses, period);
  if (/\b(maior(?:es)?|mais caros?|mais caras?)\b/.test(query)) return expenseDetails(expenses, period);
  if (/\b(diario|diaria|por dia)\b/.test(query) || /\bhoje\b/.test(query) && /(?:posso gastar|limite|resta|sobrou|disponivel|saldo|margem)/.test(query)) return dayStatus;
  if (/\b(limite|resta|sobrou|estourei|orcamento|disponivel|saldo|sobra|ultrapassei)\b/.test(query) || intent === "limit") {
    if (period === "nesta semana") return remaining("Limite semanal", data.weeklyLimit, weekly);
    if (/\b(hoje|ontem)\b|semana passada|mes passado/.test(query)) {
      return `Você registrou ${money(sumExpenses(expenses))} ${period}. Os limites cadastrados se aplicam à semana atual e ao mês atual.`;
    }
    if (/\b(mes|mensal)\b/.test(query)) return remaining("Orçamento mensal", data.budget, monthly);
    return [remaining("Limite semanal", data.weeklyLimit, weekly), remaining("Orçamento mensal", data.budget, monthly)].join("\n");
  }
  if (intent === "categories") return categoryDetails(expenses, period);
  if (intent === "largest") return expenseDetails(expenses, period);
  if (/\b(gast\w*|despes\w*|lancament\w*|total)\b/.test(query) || intent === "total") {
    const count = expenses.length;
    return `Você registrou ${money(sumExpenses(expenses))} ${period}, em ${count} ${count === 1 ? "despesa" : "despesas"}.`;
  }

  if (/\b(resumo|panorama|financas|situacao)\b/.test(query) || intent === "summary") {
    return [
      dayStatus,
      remaining("Limite semanal", data.weeklyLimit, weekly),
      remaining("Orçamento mensal", data.budget, monthly),
      reservation(data)
    ].join("\n\n");
  }
  return 'Posso consultar seus gastos, limites, renda e reserva. Experimente “Quanto gastei hoje?”, “Qual foi minha maior despesa?” ou coloque a descrição entre aspas para pesquisar um lançamento.';
}
