import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { answerQuestion, normalize, suggestedQuestions, type AppData } from "./assistant";
import { applyAction, parseAction, type AssistantAction } from "./assistantActions";
import { detectIndicator, readIndicator } from "./publicIndicators";
import {
  askAylaOnline, aylaOnlineConfigured, financialSummary, type AylaMessage
} from "./aylaApi";

const CHAT_KEY = "@kyvon_ayla_chat_v1";
const MAX_HISTORY = 60;
type Pending = { action: AssistantAction; description: string };

type Props = {
  data: AppData;
  onDataChange: React.Dispatch<React.SetStateAction<AppData>>;
  onNavigate: (tab: "home" | "expenses" | "goals" | "settings") => void;
  onReset: () => void;
};

function makeMessage(role: AylaMessage["role"], content: string, source?: string): AylaMessage {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    role, content, source, createdAt: new Date().toISOString()
  };
}

function validMessage(value: unknown): value is AylaMessage {
  if (!value || typeof value !== "object") return false;
  const x = value as Partial<AylaMessage>;
  return typeof x.id === "string" && (x.role === "user" || x.role === "assistant") &&
    typeof x.content === "string" && x.content.length > 0 && x.content.length <= 12000 &&
    typeof x.createdAt === "string" && Number.isFinite(Date.parse(x.createdAt)) &&
    (x.source === undefined || typeof x.source === "string");
}

function financialQuestion(text: string): boolean {
  return /\b(gast|gastos|gastei|despesa|despesas|orcamento|limite|limites|renda|salario|reserva|meta|financ|dinheiro|economiz|poup|categoria|categorias|saldo)\w*/.test(normalize(text));
}

export default function AylaChat({ data, onDataChange, onNavigate, onReset }: Props) {
  const [messages, setMessages] = useState<AylaMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [shareFinancial, setShareFinancial] = useState(false);
  const historyRef = useRef<AylaMessage[]>([]);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  function updateHistory(next: AylaMessage[]) {
    const trimmed = next.slice(-MAX_HISTORY);
    historyRef.current = trimmed;
    setMessages(trimmed);
  }

  function addReply(content: string, source?: string) {
    updateHistory([...historyRef.current, makeMessage("assistant", content, source)]);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(CHAT_KEY);
        if (!active || !saved) return;
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          const record = parsed as { messages?: unknown; shareFinancial?: unknown };
          if (Array.isArray(record.messages)) {
            updateHistory(record.messages.filter(validMessage).slice(-MAX_HISTORY));
          }
          if (typeof record.shareFinancial === "boolean") setShareFinancial(record.shareFinancial);
        }
      } catch (error) {
        console.error("[KYVON] Falha ao recuperar chat Ayla:", error);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
      ++requestRef.current;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (ready) {
      AsyncStorage.setItem(CHAT_KEY, JSON.stringify({ messages, shareFinancial }))
        .catch(error => console.error("[KYVON] Falha ao salvar chat Ayla:", error));
    }
  }, [messages, shareFinancial, ready]);

  function clearChat() {
    const clear = () => {
      ++requestRef.current;
      controllerRef.current?.abort();
      setBusy(false);
      setPending(null);
      setText("");
      updateHistory([]);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Iniciar uma conversa nova? O histórico atual será apagado.")) clear();
    } else {
      Alert.alert("Nova conversa", "Apagar o histórico atual da Ayla?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Apagar e começar", style: "destructive", onPress: clear }
      ]);
    }
  }

  async function send(question: string) {
    const prompt = question.trim();
    if (!prompt || busy || pending || !ready) return;
    const requestId = ++requestRef.current;
    const next = [...historyRef.current, makeMessage("user", prompt.slice(0, 2000))];
    updateHistory(next);
    setText("");

    const localAction = parseAction(prompt, data);
    if (localAction) {
      if ("message" in localAction) addReply(localAction.message);
      else if (localAction.action.type === "navigate") {
        addReply("Abrindo a aba solicitada.");
        onNavigate(localAction.action.tab);
      } else {
        setPending(localAction);
        addReply("Posso fazer isso. Confira os detalhes antes de confirmar.");
      }
      return;
    }

    const indicator = detectIndicator(prompt);
    if (indicator) {
      setBusy(true);
      const result = await readIndicator(indicator);
      if (requestRef.current === requestId) {
        addReply(result.answer, result.source);
        setBusy(false);
      }
      return;
    }

    // Financial questions can be answered locally without exporting personal records.
    if (financialQuestion(prompt) && (!aylaOnlineConfigured || !shareFinancial)) {
      addReply(answerQuestion(prompt, data));
      return;
    }
    if (!aylaOnlineConfigured) {
      addReply(
        "Oi! Sou a Ayla. Já posso conversar sobre seus gastos, limites e reserva aqui no KYVON. " +
        "Para responder perguntas gerais como uma IA avançada, meu servidor de inteligência artificial " +
        "ainda precisa ser conectado pelo desenvolvedor. Você pode perguntar sobre suas finanças agora."
      );
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const summary = shareFinancial ? financialSummary(data) : undefined;
      const answer = await askAylaOnline(next, summary, controller.signal);
      if (requestRef.current === requestId) addReply(answer);
    } catch (error) {
      if (requestRef.current === requestId) {
        const message = controller.signal.aborted
          ? "Ayla demorou para responder. Verifique a internet e tente novamente."
          : error instanceof Error ? error.message : "Ayla está indisponível no momento.";
        addReply(message);
      }
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === requestId) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }

  function decide(approved: boolean) {
    if (!pending) return;
    const { action, description } = pending;
    setPending(null);
    if (!approved) {
      addReply("Tudo bem, não alterei seus registros.");
      return;
    }
    if (action.type === "reset") {
      onReset();
      return;
    }
    if (action.type !== "navigate") {
      onDataChange(current => applyAction(current, action, current, new Date()));
      addReply("Alteração confirmada: " + description + ".");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.avatar}><Text style={styles.avatarLetter}>A</Text></View>
        <View style={styles.heading}>
          <Text style={styles.name}>Ayla <Ionicons name="sparkles" size={16} color="#3973EA" /></Text>
          <Text style={styles.status}>{aylaOnlineConfigured ? "IA conectável • Respostas em português" : "Assistente financeiro • Modo básico"}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Nova conversa" onPress={clearChat} style={styles.newButton}>
          <Ionicons name="create-outline" size={21} color="#3A5D91" />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.history} contentContainerStyle={styles.historyContent}
        keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && (
          <View style={styles.welcome}>
            <View style={styles.welcomeIcon}><Ionicons name="sparkles" size={30} color="#FFFFFF" /></View>
            <Text style={styles.welcomeTitle}>Oi, eu sou a Ayla.</Text>
            <Text style={styles.welcomeDescription}>
              Sua assistente no KYVON. Pode conversar comigo de forma natural, analisar despesas,
              calcular limites e organizar suas metas.
            </Text>
            <View style={styles.suggestions}>
              {suggestedQuestions.slice(0, 4).map(item => (
                <TouchableOpacity key={item.label} onPress={() => send(item.question)}
                  style={styles.suggestion} accessibilityRole="button">
                  <Ionicons name="arrow-up-forward-outline" size={16} color="#3973EA" />
                  <Text style={styles.suggestionText}>{item.question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {messages.map(item => (
          <View key={item.id} style={[styles.messageRow, item.role === "user" && styles.userRow]}>
            {item.role === "assistant" && <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>A</Text></View>}
            <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
              <Text style={item.role === "user" ? styles.userText : styles.aiText} selectable>{item.content}</Text>
              {item.source && (
                <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(item.source!).catch(() => {})}>
                  <Text style={styles.source}>Consultar a fonte oficial</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {pending && (
          <View style={styles.confirmCard}>
            <View style={styles.confirmTitleRow}>
              <Ionicons name="shield-checkmark-outline" color="#2868DD" size={22} />
              <Text style={styles.confirmTitle}>Confirmar ação financeira</Text>
            </View>
            <Text style={styles.confirmDescription}>{pending.description}</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity accessibilityRole="button" onPress={() => decide(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => decide(true)} style={styles.confirmButton}>
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {busy && (
          <View style={styles.typingRow}>
            <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>A</Text></View>
            <Text style={styles.typing}>Ayla está pensando…</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.composer}>
        {aylaOnlineConfigured && (
          <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: shareFinancial }}
            accessibilityLabel="Compartilhar resumo financeiro com IA online"
            onPress={() => setShareFinancial(!shareFinancial)} style={styles.privacyRow}>
            <Ionicons name={shareFinancial ? "checkbox" : "square-outline"} color="#3973EA" size={19} />
            <Text style={styles.privacyText}>Enviar resumo financeiro à IA online: {shareFinancial ? "sim" : "não"}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.inputWrap}>
          <TextInput accessibilityLabel="Mensagem para Ayla"
            style={styles.input} value={text} onChangeText={setText}
            placeholder="Converse com a Ayla..." placeholderTextColor="#8A99B0"
            multiline maxLength={2000} editable={ready && !busy && !pending} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Enviar mensagem"
            accessibilityState={{ disabled: !text.trim() || busy || !!pending || !ready }}
            disabled={!text.trim() || busy || !!pending || !ready}
            onPress={() => send(text)}
            style={[styles.sendButton, (!text.trim() || busy || !!pending || !ready) && styles.sendDisabled]}>
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>
          {aylaOnlineConfigured
            ? "Mensagens são enviadas ao serviço de IA. O resumo financeiro só é enviado com sua permissão."
            : "Seu chat fica salvo neste aparelho. A IA avançada ainda não está conectada."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FC" },
  topBar: { backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#E7EDF5", flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 46, height: 46, backgroundColor: "#3477EF", borderRadius: 17,
    justifyContent: "center", alignItems: "center" },
  avatarLetter: { fontSize: 25, fontWeight: "900", color: "#FFFFFF" },
  heading: { flex: 1 },
  name: { color: "#152B49", fontSize: 20, fontWeight: "900" },
  status: { color: "#7386A2", fontSize: 11, marginTop: 3 },
  newButton: { padding: 11, backgroundColor: "#F0F5FF", borderRadius: 14 },
  history: { flex: 1 },
  historyContent: { padding: 17, paddingBottom: 26, flexGrow: 1 },
  welcome: { marginTop: 38, alignItems: "center" },
  welcomeIcon: { width: 72, height: 72, borderRadius: 27, backgroundColor: "#3477EF",
    alignItems: "center", justifyContent: "center", marginBottom: 20 },
  welcomeTitle: { color: "#182D4D", fontSize: 25, fontWeight: "900", marginBottom: 12 },
  welcomeDescription: { color: "#70829D", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 25 },
  suggestions: { width: "100%", gap: 10 },
  suggestion: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4EAF4",
    padding: 15, borderRadius: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  suggestionText: { color: "#3A526E", fontWeight: "600", fontSize: 13, flex: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 17 },
  userRow: { justifyContent: "flex-end" },
  smallAvatar: { width: 29, height: 29, backgroundColor: "#DEEBFF", borderRadius: 11,
    alignItems: "center", justifyContent: "center", marginBottom: 2 },
  smallAvatarText: { color: "#3477EF", fontSize: 16, fontWeight: "900" },
  bubble: { borderRadius: 19, paddingHorizontal: 15, paddingVertical: 12, maxWidth: "84%" },
  userBubble: { backgroundColor: "#3477EF", borderBottomRightRadius: 6 },
  aiBubble: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8EDF5", borderBottomLeftRadius: 6 },
  userText: { color: "#FFFFFF", fontSize: 14, lineHeight: 21 },
  aiText: { color: "#263C59", fontSize: 14, lineHeight: 21 },
  source: { color: "#2563EB", fontSize: 12, fontWeight: "800", paddingTop: 10 },
  confirmCard: { backgroundColor: "#EAF2FF", borderRadius: 18, padding: 16, marginBottom: 18 },
  confirmTitleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  confirmTitle: { fontSize: 14, fontWeight: "800", color: "#204B89" },
  confirmDescription: { fontSize: 13, lineHeight: 20, color: "#4A6080", marginTop: 10 },
  confirmButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center" },
  cancelText: { color: "#547193", fontWeight: "800" },
  confirmButton: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: "#3477EF", alignItems: "center" },
  confirmButtonText: { color: "#FFFFFF", fontWeight: "800" },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  typing: { color: "#6D829D", fontSize: 13, fontStyle: "italic" },
  composer: { backgroundColor: "#FFFFFF", borderTopColor: "#E7EDF5", borderTopWidth: 1,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 9 },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 9 },
  privacyText: { color: "#657B96", fontSize: 11, flex: 1 },
  inputWrap: { flexDirection: "row", alignItems: "flex-end", backgroundColor: "#F5F8FC",
    borderWidth: 1, borderColor: "#E1E9F3", borderRadius: 23, padding: 6, gap: 8 },
  input: { flex: 1, minHeight: 43, maxHeight: 128, paddingVertical: 10, paddingHorizontal: 12,
    color: "#182D4D", fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#3477EF",
    justifyContent: "center", alignItems: "center" },
  sendDisabled: { opacity: 0.4 },
  disclaimer: { color: "#8390A4", fontSize: 10, textAlign: "center", marginTop: 8, lineHeight: 14 }
});
