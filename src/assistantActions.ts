import { categories, normalize, type AppData } from "./assistant";
import { dayBounds, daysUntil, difference, money, monthBounds, parseMoney, sumExpenses, weekBounds } from "./finance";

export const settings = {
  dailyLimit: "Limite diário",
  weeklyLimit: "Limite semanal",
  budget: "Orçamento mensal",
  monthlyIncome: "Renda mensal",
  reserve: "Reserva",
  goalTarget: "Meta da reserva"
};

export const destinations = {
  home: "Início", expenses: "Gastos", goals: "Reserva", settings: "Ajustes"
};

type Action =
  | { type: "add"; title: string; amount: number; category: string }
  | { type: "edit"; id: string; amount: number }
  | { type: "remove"; id: string }
  | { type: "setting"; field: keyof typeof settings; amount: number }
  | { type: "reserve"; amount: number }
  | { type: "plan"; weeklyLimit: number; dailyLimit: number }
  | { type: "reset" }
  | { type: "navigate"; tab: keyof typeof destinations };

type Result = { action: Action; description: string } | { message: string };

const amountPattern = /^(?:r\$\s*)?(\d+(?:[.,]\d+)*)$/i;
const amountOf = (text: string) => {
  const match = text.trim().match(amountPattern);
  return match ? parseMoney(match[1]) : NaN;
};

function expenseByTitle(data: AppData, title: string) {
  const matches = data.expenses.filter(item => normalize(item.title) === normalize(title.trim()));
  return matches.length === 1 ? matches[0] : null;
}

export function parseAction(input: string, data: AppData, now = new Date()): Result | null {
  input = input.trim().replace(/[.!]+$/, "");
  const question = normalize(input);
  const navigation = question.match(/^(?:abra|abrir|va para|ir para)\s+(?:a aba\s+)?(inicio|gastos|reserva|ajustes)[.!?]?$/);
  if (navigation) {
    const tab = (Object.keys(destinations) as (keyof typeof destinations)[]).find(key => normalize(destinations[key]) === navigation[1])!;
    return { action: { type: "navigate", tab }, description: `Abrir ${destinations[tab]}` };
  }
  if (/^(?:apague|apagar|limpe|limpar) todos os (?:meus )?dados[.!]?$/.test(question)) {
    return { action: { type: "reset" }, description: "Apagar todos os registros financeiros e ajustes do aparelho" };
  }
  if (/^(?:calcule|calcular|gere|gerar|monte|montar|proponha|planeje|ajuste) (?:meus |os )?(?:limites(?: automaticos| diarios e semanais| semanal e diario)?|um plano de gastos)[.!?]?$/.test(question)) {
    if (data.budget <= 0) return { message: "Defina um orçamento mensal para calcular os limites." };
    const [monthStart, monthEnd] = monthBounds(now);
    const [weekStart, weekEnd] = weekBounds(now);
    const spentBetween = (start: Date, end: Date) => sumExpenses(data.expenses.filter(item => {
      const date = new Date(item.date);
      return date >= start && date < end;
    }));
    const monthlyBalance = Math.max(0, difference(data.budget, spentBetween(monthStart, monthEnd)));
    const dayCents = Math.floor(Math.round(monthlyBalance * 100) / daysUntil(now, monthEnd));
    if (!dayCents) return { message: "O saldo mensal registrado não comporta uma nova margem diária. Consulte o orçamento ou revise os lançamentos." };
    const daysThisWeek = daysUntil(now, weekEnd < monthEnd ? weekEnd : monthEnd);
    const weeklySpent = spentBetween(weekStart, weekEnd);
    const dailyLimit = sumExpenses([{ amount: spentBetween(...dayBounds(now)) }, { amount: dayCents / 100 }]);
    const weeklyLimit = sumExpenses([{ amount: weeklySpent }, { amount: dayCents * daysThisWeek / 100 }]);
    return {
      action: { type: "plan", weeklyLimit, dailyLimit },
      description: `Distribuir o saldo mensal pelos dias restantes. Limite semanal de ${money(weeklyLimit)}, incluindo gastos já registrados. Fixar o limite diário em ${money(dailyLimit)}, com ${money(dayCents / 100)} ainda disponíveis hoje. Os limites ficam salvos até o próximo ajuste.`
    };
  }
  const set = question.match(/^(?:defina|definir|ajuste|ajustar|altere|alterar|mude|mudar|configure|configurar)\s+(?:o |a |meu |minha )?(limite diario|limite semanal|orcamento(?: mensal)?|renda(?: mensal)?|reserva|meta da reserva)\s+(?:para\s+|em\s+)?(.+)$/);
  if (set) {
    const field = (Object.keys(settings) as (keyof typeof settings)[]).find(key =>
      normalize(settings[key]) === set[1] || normalize(settings[key]) === set[1] + " mensal"
    )!;
    const amount = amountOf(set[2]);
    if (!Number.isFinite(amount)) return { message: "Informe o valor em reais. Exemplo: defina o limite diário para R$ 25,00." };
    return { action: { type: "setting", field, amount }, description: `${settings[field]} → ${money(amount)}` };
  }
  const deposit = question.match(/^(?:guarde|guardar|adicione|adicionar|deposite|depositar) (.+) (?:na|a|para a) reserva$/);
  if (deposit) {
    const amount = amountOf(deposit[1]);
    if (!Number.isFinite(amount) || amount <= 0) return { message: "Informe um valor maior que zero para adicionar à reserva." };
    return { action: { type: "reserve", amount }, description: `Somar ${money(amount)} à reserva registrada` };
  }
  const add = input.match(/^(?:registre|registrar|adicione|adicionar|lance|lançar|anote|anotar)\s+(?:(?:uma?\s+)?(?:gasto|despesa)\s+de\s+)?(r\$\s*\d+(?:[.,]\d+)*|\d+(?:[.,]\d+)*)\s+(?:de|em|no|na|com)\s+(.+)$/i);
  if (add) {
    const amount = amountOf(add[1]);
    const [description, requestedCategory] = add[2].split(/\s*\/\s*/, 2);
    const title = description.trim();
    const category = requestedCategory ? categories.find(item => normalize(item) === normalize(requestedCategory.trim())) : "Outros";
    if (!Number.isFinite(amount) || amount <= 0 || !title) return { message: "Para registrar a despesa, informe um valor maior que zero e uma descrição." };
    if (!category) return { message: `Escolha uma categoria: ${categories.join(", ")}.` };
    return { action: { type: "add", amount, title, category }, description: `Registrar ${title} · ${money(amount)} · ${category}` };
  }
  const edit = input.match(/^(?:edite|editar|corrija|corrigir)\s+["“]([^"”]+)["”]\s+para\s+(.+)$/i);
  const remove = input.match(/^(?:exclua|excluir|apague|apagar|remova|remover)\s+["“]([^"”]+)["”]$/i);
  if (edit || remove) {
    const item = expenseByTitle(data, (edit ?? remove)![1]);
    if (!item) return { message: "O nome precisa identificar uma única despesa. Se houver nomes iguais, abra a aba Gastos e escolha o lançamento." };
    if (edit) {
      const amount = amountOf(edit[2]);
      if (!Number.isFinite(amount) || amount <= 0) return { message: "Informe um valor maior que zero para corrigir a despesa." };
      return { action: { type: "edit", id: item.id, amount }, description: `Alterar ${item.title} de ${money(item.amount)} para ${money(amount)}` };
    }
    return { action: { type: "remove", id: item.id }, description: `Excluir ${item.title} · ${money(item.amount)}` };
  }
  if (/^(?:registre|registrar|adicione|adicionar|lance|anote|defina|ajuste|altere|edite|corrija|exclua|apague|remova|guarde)(?:\s|$)/.test(question)) {
    return { message: 'Experimente “Registre R$ 30,00 em mercado / Alimentação”, “Defina o limite diário para R$ 25,00” ou “Exclua \"mercado\"”.' };
  }
  return null;
}

export function applyAction(data: AppData, action: Action, cleared: AppData, now = new Date()): AppData {
  switch (action.type) {
    case "add":
      return { ...data, expenses: [{
        id: `${now.valueOf()}-${Math.random().toString(36).slice(2, 10)}`,
        date: now.toISOString(), title: action.title, amount: action.amount, category: action.category
      }, ...data.expenses] };
    case "edit":
      return { ...data, expenses: data.expenses.map(item => item.id === action.id ? { ...item, amount: action.amount } : item) };
    case "remove":
      return { ...data, expenses: data.expenses.filter(item => item.id !== action.id) };
    case "setting":
      return { ...data, [action.field]: action.amount };
    case "reserve":
      return { ...data, reserve: sumExpenses([{ amount: data.reserve }, { amount: action.amount }]) };
    case "plan":
      return { ...data, dailyLimit: action.dailyLimit, weeklyLimit: action.weeklyLimit };
    case "reset":
      return cleared;
    case "navigate":
      return data;
  }
}

export type AssistantAction = Action;
