// KYVON: offline-first React Native app; no WebView is used in the standalone APK.
import React, { useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { dailyAllowance, dayBounds, difference, money, monthBounds, parseMoney, sumExpenses, weekBounds } from "./src/finance";
import { answerQuestion, categories, suggestedQuestions, type AppData, type Expense } from "./src/assistant";

import { applyAction, parseAction, type AssistantAction } from "./src/assistantActions";
import { detectIndicator, readIndicator } from "./src/publicIndicators";
import StartupBoundary from "./src/StartupBoundary";
import { initialData, restoreSavedData } from "./src/persistence";

const KEY = "@meu_controle_v1";

function inform(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}

function confirmAction(title: string, message: string, label: string, action: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${message}`)) action();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: label, style: "destructive", onPress: action }
  ]);
}

type Tab = "home" | "expenses" | "goals" | "settings" | "assistant";

export default function App() {
  return <StartupBoundary><SafeAreaProvider><FinanceApp /></SafeAreaProvider></StartupBoundary>;
}

function FinanceApp() {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [data, setData] = useState<AppData>(initialData);
  const [loaded, setLoaded] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [today, setToday] = useState(() => new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<"all" | "week">("all");
  const [dailyInput, setDailyInput] = useState("");
  const [weeklyInput, setWeeklyInput] = useState("");
  const [reserveDeposit, setReserveDeposit] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Alimentação");
  const [incomeInput, setIncomeInput] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [reserveInput, setReserveInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<{ question: string; answer: string; source?: string }[]>([]);
  const [pending, setPending] = useState<{ action: AssistantAction; description: string } | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const lookupId = useRef(0);


  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        const restored = restoreSavedData(saved);
        // Preserve the original raw records before repairing malformed data.
        if (saved && restored.warning) {
          await AsyncStorage.setItem(KEY + "_backup_" + Date.now(), saved);
        }
        if (active) {
          setData(restored.data);
          setStorageWarning(restored.warning);
          setCanSave(true);
        }
      } catch (error) {
        console.error("[KYVON] Storage initialization:", error);
        if (active) {
          setStorageWarning("O armazenamento local não pôde ser aberto. Por segurança, esta sessão não sobrescreverá seus dados.");
          setCanSave(false);
        }
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loaded && canSave) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(error => {
      console.error("[KYVON] Persisting data:", error);
      setCanSave(false);
      setStorageWarning("Não foi possível salvar alterações neste aparelho. Confira o espaço disponível.");
    });
  }, [data, loaded, canSave]);

  useEffect(() => {
    setIncomeInput(data.monthlyIncome ? String(data.monthlyIncome).replace(".", ",") : "");
    setBudgetInput(data.budget ? String(data.budget).replace(".", ",") : "");
    setReserveInput(data.reserve ? String(data.reserve).replace(".", ",") : "");
    setGoalInput(data.goalTarget ? String(data.goalTarget).replace(".", ",") : "");
    setWeeklyInput(data.weeklyLimit ? String(data.weeklyLimit).replace(".", ",") : "");
    setDailyInput(data.dailyLimit ? String(data.dailyLimit).replace(".", ",") : "");
  }, [data.monthlyIncome, data.budget, data.reserve, data.goalTarget, data.weeklyLimit, data.dailyLimit]);

  const [weekStart, weekEnd] = weekBounds(today);
  const weekExpenses = data.expenses.filter(item => {
    const date = new Date(item.date);
    return date >= weekStart && date < weekEnd;
  });
  const [monthStart, monthEnd] = monthBounds(today);
  const monthExpenses = data.expenses.filter(item => {
    const date = new Date(item.date);
    return date >= monthStart && date < monthEnd;
  });
  const spent = sumExpenses(monthExpenses);
  const categoryRanking = categories.map(name => ({
    name, amount: sumExpenses(monthExpenses.filter(item => item.category === name))
  })).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 4);
  const maxCategory = Math.max(1, ...categoryRanking.map(item => item.amount));
  const weeklySpent = sumExpenses(weekExpenses);
  const [dayStart, dayEnd] = dayBounds(today);
  const dailySpent = sumExpenses(weekExpenses.filter(item => {
    const date = new Date(item.date);
    return date >= dayStart && date < dayEnd;
  }));
  const todayAllowance = dailyAllowance(data.dailyLimit, data.weeklyLimit, weeklySpent, today);
  const weeklyAvailable = difference(data.weeklyLimit, weeklySpent);
  const available = difference(data.budget, spent);
  const goalProgress = data.goalTarget > 0
    ? Math.min(100, (data.reserve / data.goalTarget) * 100) : 0;
  const visibleExpenses = historyPeriod === "week" ? weekExpenses : data.expenses;

  function resetExpenseForm() {
    setEditingId(null);
    setTitle("");
    setAmount("");
  }

  function addExpense() {
    const value = parseMoney(amount);
    if (!title.trim()) return inform("Falta uma descrição", "Informe o que você pagou.");
    if (!Number.isFinite(value) || value <= 0) {
      return inform("Valor inválido", "Digite um valor maior que zero, com até duas casas decimais.");
    }
    const item: Expense = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      title: title.trim(),
      amount: value,
      category,
      date: new Date().toISOString()
    };
    setData(current => ({
      ...current,
      expenses: editingId
        ? current.expenses.map(expense => expense.id === editingId
          ? { ...expense, title: item.title, amount: item.amount, category: item.category }
          : expense)
        : [item, ...current.expenses]
    }));
    resetExpenseForm();
  }

  function editExpense(item: Expense) {
    setEditingId(item.id);
    setTitle(item.title);
    setAmount(item.amount.toFixed(2).replace(".", ","));
    setCategory(item.category);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function removeExpense(id: string) {
    confirmAction("Excluir despesa?", "O lançamento será removido do histórico.", "Excluir", () => {
      setData(current => ({ ...current, expenses: current.expenses.filter(item => item.id !== id) }));
      if (editingId === id) resetExpenseForm();
    });
  }

  function saveSettings() {
    const monthlyIncome = parseMoney(incomeInput);
    const budget = parseMoney(budgetInput);
    const dailyLimit = parseMoney(dailyInput);
    const weeklyLimit = parseMoney(weeklyInput);
    const reserve = parseMoney(reserveInput);
    const goalTarget = parseMoney(goalInput);
    if (![monthlyIncome, budget, dailyLimit, weeklyLimit, reserve, goalTarget].every(Number.isFinite)) {
      return inform("Valor inválido", "Confira os valores informados em reais.");
    }
    setData(current => ({ ...current, monthlyIncome, budget, dailyLimit, weeklyLimit, reserve, goalTarget }));
    setTab("home");
  }

  function addToReserve() {
    const value = parseMoney(reserveDeposit);
    if (!Number.isFinite(value) || value <= 0) {
      return inform("Valor inválido", "Digite um valor maior que zero.");
    }
    setData(current => ({ ...current, reserve: sumExpenses([{ amount: current.reserve }, { amount: value }]) }));
    setReserveDeposit("");
  }

  function clearConversation() {
    lookupId.current += 1;
    setOnlineBusy(false);
    setConversation([]);
    setPending(null);
  }

  function resetAll() {
    resetExpenseForm();
    setReserveDeposit("");
    setQuestion("");
    clearConversation();
    setData(initialData);
    setTab("home");
  }

  async function askAssistant(input: string) {
    const prompt = input.trim();
    if (!prompt || pending || onlineBusy) return;
    setQuestion("");
    const append = (answer: string, source?: string) =>
      setConversation(previous => [...previous.slice(-9), { question: prompt, answer, source }]);

    const result = parseAction(prompt, data);
    if (result && "message" in result) {
      append(result.message);
      return;
    }
    if (result && "action" in result) {
      if (result.action.type === "navigate") {
        setTab(result.action.tab);
        return;
      }
      setPending(result);
      append("Revise a alteração e confirme abaixo.");
      return;
    }
    const indicator = detectIndicator(prompt);
    if (indicator) {
      const id = ++lookupId.current;
      setOnlineBusy(true);
      const response = await readIndicator(indicator);
      if (id === lookupId.current) {
        append(response.answer, response.source);
        setOnlineBusy(false);
      }
      return;
    }
    append(answerQuestion(prompt, data));
  }

  function finishAction(approved: boolean) {
    if (!pending) return;
    const { action, description } = pending;
    setPending(null);
    if (approved && action.type === "reset") {
      resetAll();
      return;
    }
    const now = new Date();
    if (approved) setData(current => applyAction(current, action, initialData, now));
    setConversation(previous => previous.map((message, index) =>
      index === previous.length - 1
        ? { ...message, answer: approved ? `Concluído. ${description}.` : "Alteração cancelada." }
        : message
    ));
  }

  if (!loaded) {
    return <SafeAreaView style={styles.container}><Text style={styles.loading}>Carregando seu controle...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>K</Text></View>
          <View>
            <Text style={styles.brand}>KYVON</Text>
            <Text style={styles.subtitle}>SEU PATRIMÔNIO, SEU CONTROLE</Text>
          </View>
        </View>
        <TouchableOpacity accessibilityLabel="Abrir planejamento" onPress={() => setTab("settings")} style={styles.avatar}>
          <Ionicons name="options-outline" size={21} color="#D9B678" />
        </TouchableOpacity>
      </View>

      {storageWarning && <View accessibilityRole="alert" style={styles.warningBanner}>
        <Ionicons name="alert-circle-outline" color="#F6C679" size={19} />
        <Text style={styles.warningText}>{storageWarning}</Text>
      </View>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView key={tab} ref={scrollRef} onContentSizeChange={tab === "assistant" && conversation.length ? () => scrollRef.current?.scrollToEnd({ animated: true }) : undefined} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === "home" && <>
            <View style={styles.welcomeRow}>
              <View>
                <Text style={styles.welcomeLabel}>SEU PAINEL FINANCEIRO</Text>
                <Text style={styles.welcomeTitle}>Visão geral</Text>
              </View>
              <View style={styles.privateTag}><Ionicons name="lock-closed-outline" size={12} color="#D9B678" /><Text style={styles.privateTagText}>Local e privado</Text></View>
            </View>
            <View style={styles.hero}>
              <View style={styles.heroTop}><Text style={styles.eyebrow}>SALDO DO ORÇAMENTO</Text><Ionicons name="sparkles-outline" size={21} color="#D9B678" /></View>
              <Text style={[styles.heroValue, data.budget > 0 && available < 0 && styles.overLimit]}>{data.budget > 0 ? money(available) : "Sem orçamento"}</Text>
              <Text style={styles.heroNote}>{data.budget > 0 ? `Limite mensal de ${money(data.budget)}` : "Configure um valor em Ajustes."}</Text>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${data.budget > 0 ? Math.min(100, spent / data.budget * 100) : 0}%` }]} /></View>
              <Text style={styles.heroNote}>{data.budget > 0 ? `${Math.round(spent / data.budget * 100)}% do orçamento utilizado` : ""}</Text>
            </View>

            <View style={styles.quickActions}>
              <QuickAction icon="add-outline" label="Novo gasto" onPress={() => setTab("expenses")} />
              <QuickAction icon="shield-checkmark-outline" label="Minha reserva" onPress={() => setTab("goals")} />
              <QuickAction icon="chatbubble-ellipses-outline" label="Assistente" onPress={() => setTab("assistant")} />
            </View>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Limite semanal</Text>
              <Text style={styles.bodyText}>{money(weeklySpent)} em gastos nesta semana</Text>
              {data.weeklyLimit > 0
                ? <Text style={[styles.weekBalance, weeklyAvailable < 0 && styles.overLimit]}>
                    {money(Math.abs(weeklyAvailable))} {weeklyAvailable < 0 ? "acima do limite" : "disponíveis"}
                  </Text>
                : <TouchableOpacity onPress={() => setTab("settings")}><Text style={styles.link}>Definir limite semanal</Text></TouchableOpacity>}
            </View>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Limite diário</Text>
              <Text style={styles.bodyText}>{money(dailySpent)} em gastos hoje</Text>
              {todayAllowance ? <Text style={styles.bodyText}>
                {todayAllowance.automatic
                  ? `${money(todayAllowance.amount)} sugeridos para o restante do dia`
                  : `${money(Math.abs(difference(todayAllowance.amount, dailySpent)))} ${dailySpent > todayAllowance.amount ? "acima do limite" : "disponíveis hoje"}`}
              </Text> : <TouchableOpacity onPress={() => setTab("settings")}><Text style={styles.link}>Definir limite diário</Text></TouchableOpacity>}
            </View>
            <Text style={styles.sectionTitle}>Visão geral</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="trending-down-outline" size={20} color="#FE939C" />
                <Text style={styles.statLabel}>Gastos do mês</Text>
                <Text style={styles.statValue}>{money(spent)}</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#D9B678" />
                <Text style={styles.statLabel}>Reserva atual</Text>
                <Text style={[styles.statValue, { color: "#D9B678" }]}>{money(data.reserve)}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Onde você gastou</Text>
                <Ionicons name="stats-chart-outline" size={18} color="#D9B678" />
              </View>
              {categoryRanking.length === 0
                ? <Text style={styles.bodyText}>Registre despesas para acompanhar a distribuição por categoria.</Text>
                : categoryRanking.map(item => <View key={item.name} style={styles.categoryBlock}>
                  <View style={styles.categoryLine}>
                    <Text style={styles.categoryName}>{item.name}</Text>
                    <Text style={styles.categoryAmount}>{money(item.amount)}</Text>
                  </View>
                  <View style={styles.categoryTrack}><View style={[styles.categoryFill,{width:`${Math.round(item.amount / maxCategory * 100)}%`}]} /></View>
                </View>)
              }
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Últimas despesas</Text>
              <TouchableOpacity onPress={() => setTab("expenses")}><Text style={styles.link}>Ver todas</Text></TouchableOpacity>
            </View>
            {data.expenses.length === 0
              ? <EmptyState text="Suas despesas aparecerão aqui quando você registrar a primeira." />
              : data.expenses.slice(0, 3).map(item => <ExpenseRow key={item.id} item={item} />)
            }

            <TouchableOpacity style={styles.primaryButton} onPress={() => setTab("expenses")}>
              <Ionicons name="add-circle-outline" size={20} color="#17120A" />
              <Text style={styles.primaryButtonText}>Registrar despesa</Text>
            </TouchableOpacity>
          </>}

          {tab === "expenses" && <>
            <Text style={styles.pageTitle}>Despesas</Text>
            <Text style={styles.pageSubtitle}>Registre seus gastos para acompanhar seu orçamento.</Text>
            <View style={styles.panel}>
              <Text style={styles.label}>O que você pagou?</Text>
              <TextInput value={title} onChangeText={setTitle} accessibilityLabel="Descrição da despesa" placeholder="Ex.: mercado, passagem..." placeholderTextColor="#838997" style={styles.input} />
              <Text style={styles.label}>Valor (R$)</Text>
              <TextInput accessibilityLabel="Valor da despesa" value={amount} onChangeText={setAmount} placeholder="0,00" placeholderTextColor="#838997" keyboardType="decimal-pad" style={styles.input} />
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.chips}>
                {categories.map(c => <TouchableOpacity key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipActive]}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text></TouchableOpacity>)}
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={addExpense}><Text style={styles.primaryButtonText}>{editingId ? "Salvar alterações" : "Salvar despesa"}</Text></TouchableOpacity>
            </View>
            {editingId && <TouchableOpacity onPress={resetExpenseForm}><Text style={styles.link}>Cancelar edição</Text></TouchableOpacity>}
            <Text style={styles.sectionTitle}>Histórico</Text>
            <View style={styles.filters}>
              {(["all", "week"] as const).map(period => (
                <TouchableOpacity key={period} style={[styles.chip, historyPeriod === period && styles.chipActive]} onPress={() => setHistoryPeriod(period)}>
                  <Text style={styles.chipText}>{period === "all" ? "Todos os gastos" : "Esta semana"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {visibleExpenses.length === 0 ? <EmptyState text="Nenhuma despesa neste período." /> :
              visibleExpenses.map(item => <View key={item.id}>
                <ExpenseRow item={item} />
                <View style={styles.expenseActions}>
                  <TouchableOpacity accessibilityLabel={`Editar ${item.title}`} onPress={() => editExpense(item)}><Text style={styles.link}>Editar</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel={`Excluir ${item.title}`} onPress={() => removeExpense(item.id)}><Text style={[styles.link, styles.overLimit]}>Excluir</Text></TouchableOpacity>
                </View>
              </View>)
            }
          </>}

          {tab === "goals" && <>
            <Text style={styles.pageTitle}>Reserva de emergência</Text>
            <Text style={styles.pageSubtitle}>Construa sua segurança financeira, um passo de cada vez.</Text>
            <View style={styles.goalCard}>
              <View style={styles.goalIcon}><Ionicons name="shield-checkmark" size={25} color="#D9B678" /></View>
              <Text style={styles.eyebrow}>VALOR GUARDADO</Text>
              <Text style={styles.goalValue}>{money(data.reserve)}</Text>
              <Text style={styles.heroNote}>{data.goalTarget > 0 ? `Meta de ${money(data.goalTarget)}` : "Defina uma meta em Ajustes."}</Text>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${goalProgress}%` }]} /></View>
              <Text style={styles.goalPercent}>{goalProgress.toFixed(0)}% da meta alcançada</Text>
              {data.goalTarget > 0 && <Text style={styles.heroNote}>Faltam {money(Math.max(0, data.goalTarget - data.reserve))}</Text>}
            </View>
            <View style={styles.panel}>
              <Field label="Valor para guardar (R$)" value={reserveDeposit} onChange={setReserveDeposit} />
              <TouchableOpacity style={styles.primaryButton} onPress={addToReserve}><Text style={styles.primaryButtonText}>Adicionar à reserva</Text></TouchableOpacity>
            </View>
          </>}

          {tab === "assistant" && <>
            <Text style={styles.pageTitle}>Assistente financeiro</Text>
            <Text style={styles.pageSubtitle}>Calcule limites, registre despesas e consulte Selic, IPCA e dólar. Seus lançamentos ficam no aparelho.</Text>
            <View style={styles.filters}>
              {suggestedQuestions.map(suggestion => (
                <TouchableOpacity key={suggestion.label} accessibilityRole="button" disabled={!!pending || onlineBusy} style={styles.chip} onPress={() => askAssistant(suggestion.question)}>
                  <Text style={styles.chipText}>{suggestion.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {conversation.map((message, index) => (
              <View key={index} style={styles.messageGroup}>
                <View style={styles.questionBubble}><Text style={styles.messageText}>{message.question}</Text></View>
                <View style={styles.answerBubble}>
                  <Text accessibilityLiveRegion="polite" style={styles.messageText}>{message.answer}</Text>
                  {message.source && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(message.source!).catch(() => inform("Fonte", message.source!))}>
                    <Text style={styles.link}>Ver dados do Banco Central</Text>
                  </TouchableOpacity>}
                </View>
              </View>
            ))}
            {pending && <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Confirmar alteração</Text>
              <Text style={styles.bodyText}>{pending.description}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={() => finishAction(true)}>
                <Text style={styles.primaryButtonText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => finishAction(false)}>
                <Text style={styles.clearConversation}>Cancelar alteração</Text>
              </TouchableOpacity>
            </View>}
            {onlineBusy && <Text accessibilityLiveRegion="polite" style={styles.bodyText}>Consultando o Banco Central…</Text>}
            <View style={styles.panel}>
              <TextInput
                accessibilityLabel="Pergunta ao assistente"
                style={styles.input}
                value={question}
                onChangeText={setQuestion}
                placeholder="Ex.: registre R$ 30,00 em mercado"
                placeholderTextColor="#B0ADB2"
                maxLength={300}
                returnKeyType="send"
                onSubmitEditing={() => askAssistant(question)}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: (!question.trim() || !!pending || onlineBusy) }}
                disabled={(!question.trim() || !!pending || onlineBusy)}
                style={[styles.primaryButton, (!question.trim() || !!pending || onlineBusy) && styles.disabledButton]}
                onPress={() => askAssistant(question)}
              >
                <Ionicons name="send-outline" size={16} color="#17120A" />
                <Text style={styles.primaryButtonText}>Enviar pergunta</Text>
              </TouchableOpacity>
              {conversation.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={clearConversation}>
                <Text style={styles.clearConversation}>Limpar conversa</Text>
              </TouchableOpacity>}
            </View>
          </>}

          {tab === "settings" && <>
            <Text style={styles.pageTitle}>Seu planejamento</Text>
            <Text style={styles.pageSubtitle}>Personalize os valores para sua realidade.</Text>
            <View style={styles.panel}>
              <Field label="Renda mensal (R$)" value={incomeInput} onChange={setIncomeInput} />
              <Field label="Orçamento mensal (R$)" value={budgetInput} onChange={setBudgetInput} />
              <Field label="Limite semanal (R$)" value={weeklyInput} onChange={setWeeklyInput} />
              <Field label="Limite diário (R$)" value={dailyInput} onChange={setDailyInput} />
              <Field label="Reserva já guardada (R$)" value={reserveInput} onChange={setReserveInput} />
              <Field label="Meta da reserva (R$)" value={goalInput} onChange={setGoalInput} />
              <TouchableOpacity style={styles.primaryButton} onPress={saveSettings}><Text style={styles.primaryButtonText}>Salvar planejamento</Text></TouchableOpacity>
            </View>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Seus dados</Text>
              <Text style={styles.bodyText}>Nesta primeira versão, seus registros ficam armazenados localmente neste aparelho. Não há conta, sincronização em nuvem ou conexão com banco.</Text>
              <TouchableOpacity onPress={() => confirmAction("Apagar todos os dados?", "Isso remove os registros deste aparelho.", "Apagar", resetAll)}>
                <Text style={styles.dangerText}>Apagar todos os meus dados</Text>
              </TouchableOpacity>
            </View>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.tabBar}>
        <TabButton icon="home-outline" label="Início" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton icon="receipt-outline" label="Gastos" active={tab === "expenses"} onPress={() => setTab("expenses")} />
        <TabButton icon="shield-checkmark-outline" label="Reserva" active={tab === "goals"} onPress={() => setTab("goals")} />
        <TabButton icon="chatbubble-ellipses-outline" label="Assistente" active={tab === "assistant"} onPress={() => setTab("assistant")} />
        <TabButton icon="settings-outline" label="Ajustes" active={tab === "settings"} onPress={() => setTab("settings")} />
      </View>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickAction}>
    <View style={styles.quickIcon}><Ionicons name={icon} size={21} color="#D9B678" /></View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <View style={{ marginBottom: 16 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="0,00" placeholderTextColor="#838997" keyboardType="decimal-pad" style={styles.input} /></View>;
}
function ExpenseRow({ item }: { item: Expense }) {
  return <View style={styles.expenseRow}>
    <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={18} color="#A9B7C6" /></View>
    <View style={{ flex: 1 }}><Text style={styles.expenseTitle}>{item.title}</Text><Text style={styles.expenseMeta}>{item.category} • {new Date(item.date).toLocaleDateString("pt-BR")}</Text></View>
    <Text style={styles.expenseAmount}>-{money(item.amount)}</Text>
  </View>;
}
function EmptyState({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="file-tray-outline" size={25} color="#838997" /><Text style={styles.emptyText}>{text}</Text></View>;
}
function TabButton({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}><Ionicons name={icon} size={21} color={active ? "#D9B678" : "#838997"} /><Text style={[styles.tabLabel, active && { color: "#D9B678" }]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#090A0E" },
  loading: { color: "#FFFFFF", textAlign: "center", marginTop: 80 },
  header: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: "#F6F1E5", fontSize: 19, fontWeight: "900", letterSpacing: 2.5 },
  brandGroup: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#282319", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#5B4C2C" },
  brandLetter: { color: "#D9B678", fontSize: 25, fontWeight: "900" },
  warningBanner: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#392D20", paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#6A5131" },
  warningText: { color: "#F6D8A4", fontSize: 12, lineHeight: 18, flex: 1 },
  welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 19, gap: 6 },
  welcomeLabel: { color: "#9E9586", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  welcomeTitle: { color: "#FAF8F4", fontSize: 26, fontWeight: "800", marginTop: 5 },
  privateTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 20, backgroundColor: "#282319" },
  privateTagText: { color: "#D9B678", fontSize: 10, fontWeight: "700" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickActions: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: -10, marginBottom: 20 },
  quickAction: { flex: 1, alignItems: "center", backgroundColor: "#171923", paddingVertical: 14, paddingHorizontal: 5, borderRadius: 18, borderWidth: 1, borderColor: "#292A31" },
  quickIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#30291D", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  quickLabel: { color: "#DFDBD4", fontSize: 11, fontWeight: "700" },
  categoryBlock: { marginTop: 7, marginBottom: 12 },
  categoryLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryName: { color: "#D8D9DC", fontSize: 12 },
  categoryAmount: { color: "#F2E8D2", fontSize: 12, fontWeight: "700" },
  categoryTrack: { height: 6, borderRadius: 6, backgroundColor: "#30303B", overflow: "hidden", marginTop: 9 },
  categoryFill: { height: 6, borderRadius: 6, backgroundColor: "#B79A65" },
  subtitle: { color: "#9B9AA6", fontSize: 9, marginTop: 4, letterSpacing: 0.7 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#191A21", alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 30 },
  hero: { backgroundColor: "#191A21", borderRadius: 22, padding: 22, marginBottom: 27, borderWidth: 1, borderColor: "#37312A" },
  eyebrow: { color: "#9BAEAA", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroValue: { color: "#D9B678", fontSize: 34, fontWeight: "800", marginTop: 10, marginBottom: 7 },
  heroNote: { color: "#B0ADB2", fontSize: 12, marginTop: 7 },
  progressTrack: { height: 7, borderRadius: 10, backgroundColor: "#30303B", overflow: "hidden", marginTop: 17 },
  progressFill: { height: 7, borderRadius: 10, backgroundColor: "#D9B678" },
  sectionTitle: { color: "#F4F7FA", fontSize: 17, fontWeight: "700", marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 27 },
  statCard: { flex: 1, backgroundColor: "#171923", borderRadius: 17, padding: 15, minHeight: 112 },
  statLabel: { color: "#B0ADB2", fontSize: 11, marginTop: 9 },
  statValue: { color: "#FE939C", fontSize: 16, fontWeight: "700", marginTop: 5 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: "#D9B678", fontWeight: "600", fontSize: 12, marginBottom: 14 },
  primaryButton: { backgroundColor: "#D9B678", borderRadius: 14, minHeight: 51, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 15 },
  primaryButtonText: { color: "#17120A", fontSize: 14, fontWeight: "800" },
  pageTitle: { color: "#F4F7FA", fontSize: 25, fontWeight: "800", marginBottom: 6 },
  pageSubtitle: { color: "#9B9AA6", fontSize: 13, lineHeight: 19, marginBottom: 22 },
  panel: { backgroundColor: "#171923", borderRadius: 18, padding: 17, marginBottom: 20 },
  label: { color: "#C1CBD5", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  input: { backgroundColor: "#11131A", color: "#FFFFFF", borderWidth: 1, borderColor: "#353745", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#344352", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  chipActive: { backgroundColor: "#3E3223", borderColor: "#D9B678" },
  chipText: { color: "#AAB7C4", fontSize: 11 },
  chipTextActive: { color: "#F2D59B", fontWeight: "700" },
  expenseRow: { backgroundColor: "#171923", borderRadius: 14, padding: 13, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 11 },
  expenseIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#272934", alignItems: "center", justifyContent: "center" },
  expenseTitle: { color: "#F2F5F8", fontWeight: "700", fontSize: 13 },
  expenseMeta: { color: "#9B9AA6", fontSize: 10, marginTop: 4 },
  expenseAmount: { color: "#FF9BA2", fontSize: 12, fontWeight: "700" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  messageGroup: { gap: 8, marginBottom: 16 },
  questionBubble: { backgroundColor: "#3E3223", alignSelf: "flex-end", maxWidth: "90%", borderRadius: 15, padding: 12 },
  answerBubble: { backgroundColor: "#171923", alignSelf: "flex-start", maxWidth: "94%", borderRadius: 15, padding: 14 },
  messageText: { color: "#F4F7FA", fontSize: 14, lineHeight: 21 },
  disabledButton: { opacity: 0.48 },
  clearConversation: { color: "#AAB7C4", textAlign: "center", paddingTop: 16, fontSize: 12 },
  expenseActions: { flexDirection: "row", gap: 18, justifyContent: "flex-end" },
  weekBalance: { color: "#D9B678", fontSize: 17, fontWeight: "700" },
  overLimit: { color: "#FF9BA2" },
  empty: { backgroundColor: "#171923", borderRadius: 14, padding: 22, alignItems: "center", gap: 9, marginBottom: 15 },
  emptyText: { color: "#9B9AA6", fontSize: 12, textAlign: "center", lineHeight: 18 },
  goalCard: { backgroundColor: "#191A21", borderRadius: 22, padding: 22, marginBottom: 18, borderWidth: 1, borderColor: "#37312A" },
  goalIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#3E3223", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  goalValue: { color: "#D9B678", fontSize: 32, fontWeight: "800", marginTop: 9 },
  goalPercent: { color: "#D9B678", fontWeight: "700", fontSize: 12, marginTop: 12 },
  bodyText: { color: "#AAB7C4", fontSize: 13, lineHeight: 20, marginBottom: 10 },
  dangerText: { color: "#FE939C", fontSize: 13, fontWeight: "700", marginTop: 18 },
  tabBar: { flexDirection: "row", backgroundColor: "#0F1017", borderTopWidth: 1, borderTopColor: "#24313E", paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 20 : 10 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { color: "#838997", fontSize: 10, fontWeight: "600" }
});
