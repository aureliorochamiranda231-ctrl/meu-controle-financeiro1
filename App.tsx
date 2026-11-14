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
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>K</Text></View>
          <View>
            <Text style={styles.brand}>KYVON</Text>
            <Text style={styles.subtitle}>FINANÇAS SIMPLES, VIDA LEVE</Text>
          </View>
        </View>
        <TouchableOpacity accessibilityLabel="Abrir planejamento" onPress={() => setTab("settings")} style={styles.avatar}>
          <Ionicons name="settings-outline" size={21} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {storageWarning && <View accessibilityRole="alert" style={styles.warningBanner}>
        <Ionicons name="alert-circle-outline" color="#9A6700" size={19} />
        <Text style={styles.warningText}>{storageWarning}</Text>
      </View>}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView key={tab} ref={scrollRef} onContentSizeChange={tab === "assistant" && conversation.length ? () => scrollRef.current?.scrollToEnd({ animated: true }) : undefined} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === "home" && <>
            <View style={styles.welcomeRow}>
              <View>
                <Text style={styles.welcomeLabel}>BEM-VINDO AO KYVON</Text>
                <Text style={styles.welcomeTitle}>Seu dinheiro, em ordem.</Text>
              </View>
              <View style={styles.privateTag}><Ionicons name="lock-closed-outline" size={12} color="#2563EB" /><Text style={styles.privateTagText}>Local e privado</Text></View>
            </View>
            <View style={styles.hero}>
              <View style={styles.heroDecoration} />
              <View style={styles.heroTop}><Text style={styles.eyebrow}>DISPONÍVEL NO MÊS</Text><Ionicons name="wallet-outline" size={23} color="#FFFFFF" /></View>
              <Text style={[styles.heroValue, data.budget > 0 && available < 0 && styles.overLimit]}>{data.budget > 0 ? money(available) : "Sem orçamento"}</Text>
              <Text style={styles.heroNote}>{data.budget > 0 ? `Do orçamento de ${money(data.budget)}` : "Defina seu orçamento no planejamento."}</Text>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${data.budget > 0 ? Math.min(100, spent / data.budget * 100) : 0}%` }]} /></View>
              <Text style={styles.heroNote}>{data.budget > 0 ? `${Math.round(spent / data.budget * 100)}% do orçamento utilizado` : ""}</Text>
            </View>

            <View style={styles.quickActions}>
              <QuickAction icon="add-circle-outline" label="Novo gasto" onPress={() => setTab("expenses")} />
              <QuickAction icon="flag-outline" label="Minha reserva" onPress={() => setTab("goals")} />
              <QuickAction icon="sparkles-outline" label="Assistente" onPress={() => setTab("assistant")} />
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Seus limites</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setTab("settings")}><Text style={styles.link}>Ajustar limites</Text></TouchableOpacity>
            </View>
            <View style={styles.limitRow}>
              <View style={styles.limitCard}>
                <View style={styles.limitIcon}><Ionicons name="calendar-outline" color="#2563EB" size={19} /></View>
                <Text style={styles.limitLabel}>Esta semana</Text>
                <Text style={styles.limitSpent}>{money(weeklySpent)} gastos</Text>
                {data.weeklyLimit > 0
                  ? <Text style={[styles.limitBalance, weeklyAvailable < 0 && styles.overLimit]}>
                      {money(Math.abs(weeklyAvailable))} {weeklyAvailable < 0 ? "acima" : "restantes"}
                    </Text>
                  : <Text style={styles.limitNoValue}>Defina um limite</Text>}
              </View>
              <View style={styles.limitCard}>
                <View style={[styles.limitIcon, styles.limitIconGreen]}><Ionicons name="today-outline" size={19} color="#15946A" /></View>
                <Text style={styles.limitLabel}>Hoje</Text>
                <Text style={styles.limitSpent}>{money(dailySpent)} gastos</Text>
                {todayAllowance
                  ? <Text style={styles.limitBalance}>{money(todayAllowance.automatic ? todayAllowance.amount : Math.max(0, difference(todayAllowance.amount,dailySpent)))} {todayAllowance.automatic ? "sugeridos" : "disponíveis"}</Text>
                  : <Text style={styles.limitNoValue}>Defina um limite</Text>}
              </View>
            </View>
            <Text style={styles.sectionTitle}>Seu mês em números</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="trending-down-outline" size={20} color="#FE939C" />
                <Text style={styles.statLabel}>Gastos do mês</Text>
                <Text style={styles.statValue}>{money(spent)}</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#15946A" />
                <Text style={styles.statLabel}>Reserva atual</Text>
                <Text style={[styles.statValue, { color: "#15946A" }]}>{money(data.reserve)}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Onde você gastou</Text>
                <Ionicons name="stats-chart-outline" size={18} color="#2563EB" />
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
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Registrar despesa</Text>
            </TouchableOpacity>
          </>}

          {tab === "expenses" && <>
            <Text style={styles.pageEyebrow}>MOVIMENTAÇÕES</Text>
            <Text style={styles.pageTitle}>Seus gastos</Text>
            <Text style={styles.pageSubtitle}>Cada registro deixa suas finanças mais claras.</Text>
            <View style={styles.infoStrip}>
              <Ionicons name="receipt-outline" size={20} color="#2563EB" />
              <View style={{flex: 1}}><Text style={styles.infoStripTitle}>Total deste mês</Text><Text style={styles.infoStripValue}>{money(spent)}</Text></View>
              <Text style={styles.infoStripHint}>{monthExpenses.length} registros</Text>
            </View>
            <View style={styles.panel}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{editingId ? "Editar lançamento" : "Novo lançamento"}</Text><Ionicons name="add-circle-outline" size={21} color="#2563EB" /></View>
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
            <Text style={styles.sectionTitle}>Histórico de despesas</Text>
            <View style={styles.filters}>
              {(["all", "week"] as const).map(period => (
                <TouchableOpacity key={period} style={[styles.chip, historyPeriod === period && styles.chipActive]} onPress={() => setHistoryPeriod(period)}>
                  <Text style={[styles.chipText,historyPeriod === period && styles.chipTextActive]}>{period === "all" ? "Todos os gastos" : "Esta semana"}</Text>
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
            <Text style={styles.pageEyebrow}>OBJETIVOS</Text>
            <Text style={styles.pageTitle}>Sua reserva</Text>
            <Text style={styles.pageSubtitle}>Uma meta de cada vez. A tranquilidade vem junto.</Text>
            <View style={styles.goalCard}>
              <View style={styles.goalIcon}><Ionicons name="shield-checkmark" size={25} color="#15946A" /></View>
              <Text style={styles.eyebrow}>VALOR GUARDADO</Text>
              <Text style={styles.goalValue}>{money(data.reserve)}</Text>
              <Text style={styles.heroNote}>{data.goalTarget > 0 ? `Meta de ${money(data.goalTarget)}` : "Defina uma meta em Ajustes."}</Text>
              <View style={styles.goalProgressTrack}><View style={[styles.goalProgressFill, { width: `${goalProgress}%` }]} /></View>
              <Text style={styles.goalPercent}>{goalProgress.toFixed(0)}% da meta alcançada</Text>
              {data.goalTarget > 0 && <Text style={styles.heroNote}>Faltam {money(Math.max(0, data.goalTarget - data.reserve))}</Text>}
            </View>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Fortaleça sua reserva</Text>
              <Text style={styles.bodyText}>Escolha quanto deseja registrar. Este valor é somente um controle, não movimenta dinheiro.</Text>
              <Field label="Valor para guardar (R$)" value={reserveDeposit} onChange={setReserveDeposit} />
              <View style={styles.suggestedAmounts}>
                {["25","50","100"].map(value => <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setReserveDeposit(value)} style={styles.amountChip}><Text style={styles.amountChipText}>R$ {value}</Text></TouchableOpacity>)}
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={addToReserve}><Text style={styles.primaryButtonText}>Adicionar à reserva</Text></TouchableOpacity>
            </View>
          </>}

          {tab === "assistant" && <>
            <Text style={styles.pageEyebrow}>INTELIGÊNCIA FINANCEIRA</Text>
            <Text style={styles.pageTitle}>Seu assistente</Text>
            <Text style={styles.pageSubtitle}>Respostas práticas para cuidar melhor do seu dinheiro.</Text>
            <View style={styles.assistantIntro}>
              <View style={styles.assistantLogo}><Ionicons name="sparkles-outline" color="#2563EB" size={24} /></View>
              <View style={{flex: 1}}>
                <Text style={styles.assistantIntroTitle}>Oi! Sou seu assistente KYVON.</Text>
                <Text style={styles.assistantIntroText}>Posso calcular limites, resumir gastos e consultar indicadores públicos. Seus registros permanecem neste dispositivo.</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>Perguntas rápidas</Text>
            <View style={styles.filters}>
              {suggestedQuestions.map(suggestion => (
                <TouchableOpacity key={suggestion.label} accessibilityRole="button" disabled={!!pending || onlineBusy} style={styles.chip} onPress={() => askAssistant(suggestion.question)}>
                  <Text style={styles.chipText}>{suggestion.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {conversation.map((message, index) => (
              <View key={index} style={styles.messageGroup}>
                <View style={styles.questionBubble}><Text style={styles.questionText}>{message.question}</Text></View>
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
                <Ionicons name="send-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Enviar pergunta</Text>
              </TouchableOpacity>
              {conversation.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={clearConversation}>
                <Text style={styles.clearConversation}>Limpar conversa</Text>
              </TouchableOpacity>}
            </View>
          </>}

          {tab === "settings" && <>
            <Text style={styles.pageEyebrow}>PREFERÊNCIAS E METAS</Text>
            <Text style={styles.pageTitle}>Seu planejamento</Text>
            <Text style={styles.pageSubtitle}>Organize seus objetivos do seu jeito, com total clareza.</Text>
            <View style={styles.panel}>
              <View style={styles.settingsGroupTitle}><Ionicons name="wallet-outline" size={20} color="#2563EB"/><Text style={styles.sectionTitle}>Orçamento do mês</Text></View>
              <Field label="Renda mensal (R$)" value={incomeInput} onChange={setIncomeInput} />
              <Field label="Orçamento mensal (R$)" value={budgetInput} onChange={setBudgetInput} />
            </View>
            <View style={styles.panel}>
              <View style={styles.settingsGroupTitle}><Ionicons name="speedometer-outline" size={20} color="#2563EB"/><Text style={styles.sectionTitle}>Limites pessoais</Text></View>
              <Field label="Limite semanal (R$)" value={weeklyInput} onChange={setWeeklyInput} />
              <Field label="Limite diário (R$)" value={dailyInput} onChange={setDailyInput} />
            </View>
            <View style={styles.panel}>
              <View style={styles.settingsGroupTitle}><Ionicons name="flag-outline" size={20} color="#15946A"/><Text style={styles.sectionTitle}>Metas e reserva</Text></View>
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
    <View style={styles.quickIcon}><Ionicons name={icon} size={23} color="#2563EB" /></View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <View style={{ marginBottom: 16 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="0,00" placeholderTextColor="#838997" keyboardType="decimal-pad" style={styles.input} /></View>;
}
function ExpenseRow({ item }: { item: Expense }) {
  return <View style={styles.expenseRow}>
    <View style={styles.expenseIcon}><Ionicons name="receipt-outline" size={19} color="#2563EB" /></View>
    <View style={{ flex: 1 }}><Text style={styles.expenseTitle}>{item.title}</Text><Text style={styles.expenseMeta}>{item.category} • {new Date(item.date).toLocaleDateString("pt-BR")}</Text></View>
    <Text style={styles.expenseAmount}>-{money(item.amount)}</Text>
  </View>;
}
function EmptyState({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="file-tray-outline" size={28} color="#8AA0C4" /><Text style={styles.emptyText}>{text}</Text></View>;
}
function TabButton({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={styles.tabButton}>
    <View style={[styles.tabIcon, active && styles.tabIconActive]}><Ionicons name={icon} size={21} color={active ? "#2563EB" : "#8993A6"} /></View>
    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F8FC" },
  loading: { color: "#1E293B", textAlign: "center", marginTop: 80, fontWeight: "600" },
  header: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F6F8FC" },
  brand: { color: "#18283E", fontSize: 19, fontWeight: "900", letterSpacing: 1.9 },
  brandGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  brandLetter: { color: "#FFFFFF", fontSize: 25, fontWeight: "900" },
  subtitle: { color: "#748297", fontSize: 8, marginTop: 3, letterSpacing: 0.7, fontWeight: "700" },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7EBF3", alignItems: "center", justifyContent: "center" },
  warningBanner: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#FFF6E7", paddingHorizontal: 18, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F4DCB3" },
  warningText: { color: "#8C621D", fontSize: 12, lineHeight: 18, flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 17, paddingBottom: 34 },
  welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 19, gap: 8 },
  welcomeLabel: { color: "#7D8EA6", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  welcomeTitle: { color: "#18283E", fontSize: 22, fontWeight: "800", marginTop: 6, flexShrink: 1 },
  privateTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: "#E8F0FF" },
  privateTagText: { color: "#245FCE", fontSize: 9, fontWeight: "800" },
  hero: { backgroundColor: "#2563EB", borderRadius: 27, padding: 22, marginBottom: 18, overflow: "hidden", minHeight: 208 },
  heroDecoration: { position: "absolute", top: -65, right: -55, width: 205, height: 205, borderRadius: 105, backgroundColor: "#407DF2", opacity: 0.65 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#E7F0FF", fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  heroValue: { color: "#FFFFFF", fontSize: 35, fontWeight: "900", marginTop: 15, marginBottom: 3, letterSpacing: -0.8 },
  heroNote: { color: "#E2EDFF", fontSize: 12, marginTop: 9, fontWeight: "500" },
  progressTrack: { height: 7, borderRadius: 10, backgroundColor: "#6F9AF6", overflow: "hidden", marginTop: 21 },
  progressFill: { height: 7, borderRadius: 10, backgroundColor: "#FFFFFF" },
  quickActions: { flexDirection: "row", gap: 10, marginBottom: 23 },
  quickAction: { flex: 1, alignItems: "center", backgroundColor: "#FFFFFF", paddingVertical: 16, paddingHorizontal: 4, borderRadius: 20, borderWidth: 1, borderColor: "#EDF0F6" },
  quickIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#E8F0FF", justifyContent: "center", alignItems: "center", marginBottom: 10 },
  quickLabel: { color: "#253448", fontSize: 11, fontWeight: "700", textAlign: "center" },
  sectionTitle: { color: "#17253B", fontSize: 17, fontWeight: "800", marginBottom: 13 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 5 },
  limitRow: { flexDirection: "row", gap: 12, marginBottom: 25 },
  limitCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 20, padding: 15, minHeight: 160, borderWidth: 1, borderColor: "#EBEEF5" },
  limitIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#E8F0FF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  limitIconGreen: { backgroundColor: "#E5F8EF" },
  limitLabel: { color: "#78879B", fontSize: 12, fontWeight: "700" },
  limitSpent: { color: "#344054", fontSize: 12, marginTop: 6 },
  limitBalance: { color: "#2563EB", fontSize: 13, fontWeight: "800", marginTop: 8 },
  limitNoValue: { color: "#8392A7", fontSize: 12, marginTop: 8 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 22 },
  statCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 20, padding: 16, minHeight: 114, borderWidth: 1, borderColor: "#EBEEF5" },
  statLabel: { color: "#7D8A9B", fontSize: 11, marginTop: 10 },
  statValue: { color: "#E66D70", fontSize: 17, fontWeight: "800", marginTop: 5 },
  panel: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 18, marginBottom: 19, borderWidth: 1, borderColor: "#ECF0F6" },
  categoryBlock: { marginTop: 8, marginBottom: 14 },
  categoryLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryName: { color: "#45536A", fontSize: 12, fontWeight: "600" },
  categoryAmount: { color: "#202F45", fontSize: 12, fontWeight: "800" },
  categoryTrack: { height: 7, borderRadius: 8, backgroundColor: "#E9EEF7", overflow: "hidden", marginTop: 9 },
  categoryFill: { height: 7, borderRadius: 8, backgroundColor: "#5086F6" },
  link: { color: "#2563EB", fontWeight: "800", fontSize: 12, marginBottom: 12 },
  primaryButton: { backgroundColor: "#2563EB", borderRadius: 16, minHeight: 52, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pageEyebrow: { color: "#6884B6", fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 6 },
  pageTitle: { color: "#17253B", fontSize: 27, fontWeight: "900", marginBottom: 7 },
  pageSubtitle: { color: "#77869B", fontSize: 13, lineHeight: 20, marginBottom: 21 },
  infoStrip: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#EAF2FF", paddingHorizontal: 15, paddingVertical: 15, borderRadius: 19, marginBottom: 19 },
  infoStripTitle: { color: "#60799D", fontSize: 11, fontWeight: "700" },
  infoStripValue: { color: "#1D4ED8", fontSize: 20, fontWeight: "900", marginTop: 4 },
  infoStripHint: { color: "#6681A6", fontSize: 10, fontWeight: "700" },
  label: { color: "#344054", fontSize: 12, fontWeight: "700", marginBottom: 9 },
  input: { backgroundColor: "#F8FAFD", color: "#17253B", borderWidth: 1, borderColor: "#E4EAF3", borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, marginBottom: 16, minHeight: 51 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#E0E7F0", backgroundColor: "#F8FAFD", borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10 },
  chipActive: { backgroundColor: "#E5EEFF", borderColor: "#4D85EF" },
  chipText: { color: "#65758D", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#2563EB", fontWeight: "800" },
  expenseRow: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, marginBottom: 7, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "#EDF0F6" },
  expenseIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#EAF1FF", alignItems: "center", justifyContent: "center" },
  expenseTitle: { color: "#223249", fontWeight: "800", fontSize: 13 },
  expenseMeta: { color: "#8B98A8", fontSize: 11, marginTop: 4 },
  expenseAmount: { color: "#DF646B", fontSize: 13, fontWeight: "800" },
  expenseActions: { flexDirection: "row", gap: 18, justifyContent: "flex-end", marginBottom: 8, paddingRight: 4 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  goalCard: { backgroundColor: "#EAF8F1", borderRadius: 27, padding: 23, marginBottom: 20, borderWidth: 1, borderColor: "#D3F1DF" },
  goalIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#D1F5E3", alignItems: "center", justifyContent: "center", marginBottom: 19 },
  goalValue: { color: "#137F5A", fontSize: 35, fontWeight: "900", marginTop: 10 },
  goalProgressTrack: { height: 9, borderRadius: 9, backgroundColor: "#CDEADC", overflow: "hidden", marginTop: 19 },
  goalProgressFill: { height: 9, borderRadius: 9, backgroundColor: "#15946A" },
  goalPercent: { color: "#137F5A", fontWeight: "800", fontSize: 13, marginTop: 13 },
  suggestedAmounts: { flexDirection: "row", gap: 10, marginTop: -2, marginBottom: 3 },
  amountChip: { backgroundColor: "#E9F1FF", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 15 },
  amountChipText: { color: "#2563EB", fontSize: 12, fontWeight: "800" },
  assistantIntro: { flexDirection: "row", alignItems: "flex-start", gap: 13, backgroundColor: "#E9F1FF", padding: 16, borderRadius: 20, marginBottom: 23 },
  assistantLogo: { backgroundColor: "#FFFFFF", width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  assistantIntroTitle: { fontSize: 14, fontWeight: "800", color: "#1D4ED8", marginBottom: 5 },
  assistantIntroText: { fontSize: 12, lineHeight: 18, color: "#53729D" },
  messageGroup: { gap: 8, marginBottom: 16 },
  questionBubble: { backgroundColor: "#2563EB", alignSelf: "flex-end", maxWidth: "90%", borderRadius: 18, borderBottomRightRadius: 5, padding: 13 },
  answerBubble: { backgroundColor: "#FFFFFF", alignSelf: "flex-start", maxWidth: "94%", borderRadius: 18, borderBottomLeftRadius: 5, padding: 15, borderWidth: 1, borderColor: "#E7ECF4" },
  messageText: { color: "#26364E", fontSize: 14, lineHeight: 21 },
  questionText: { color: "#FFFFFF", fontSize: 14, lineHeight: 21 },
  disabledButton: { opacity: 0.45 },
  clearConversation: { color: "#7D8B9C", textAlign: "center", paddingTop: 16, fontSize: 12, fontWeight: "700" },
  weekBalance: { color: "#2563EB", fontSize: 17, fontWeight: "800" },
  overLimit: { color: "#E05C62" },
  empty: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 23, alignItems: "center", gap: 10, marginBottom: 16, borderWidth: 1, borderColor: "#EEF1F6" },
  emptyText: { color: "#8593A7", fontSize: 12, textAlign: "center", lineHeight: 19 },
  bodyText: { color: "#6E7D92", fontSize: 13, lineHeight: 20, marginBottom: 10 },
  settingsGroupTitle: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 15 },
  dangerText: { color: "#D95361", fontSize: 13, fontWeight: "800", marginTop: 16 },
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E8ECF2", paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 20 : 12, paddingHorizontal: 4 },
  tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { width: 41, height: 33, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: "#E6EFFF" },
  tabLabel: { color: "#8592A7", fontSize: 10, fontWeight: "700" },
  tabLabelActive: { color: "#2563EB", fontWeight: "900" }
});
