import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = { children: React.ReactNode };
type State = { failed: boolean };

export default class StartupBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error, details: React.ErrorInfo) {
    console.error("[KYVON] Falha na interface:", error, details.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.mark}><Text style={styles.k}>K</Text></View>
      <Text style={styles.title}>KYVON</Text>
      <Text style={styles.heading}>Não foi possível abrir esta tela.</Text>
      <Text style={styles.description}>Seus registros não foram apagados. Tente novamente. Se persistir, envie os registros de erro do Android para o suporte.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => this.setState({ failed: false })}>
        <Text style={styles.buttonText}>Tentar novamente</Text>
      </TouchableOpacity>
    </ScrollView>;
  }
}
const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: "#090A0E", padding: 30, justifyContent: "center", alignItems: "center" },
  mark: { width: 72, height: 72, borderRadius: 24, backgroundColor: "#25211A", alignItems: "center", justifyContent: "center" },
  k: { fontSize: 46, fontWeight: "900", color: "#D9B678" },
  title: { color: "#D9B678", fontSize: 24, fontWeight: "900", letterSpacing: 3, marginTop: 18 },
  heading: { color: "#F9F7F1", fontSize: 21, fontWeight: "700", marginTop: 28, textAlign: "center" },
  description: { color: "#A6A7B0", fontSize: 14, lineHeight: 23, marginTop: 12, textAlign: "center" },
  button: { backgroundColor: "#D9B678", borderRadius: 16, paddingVertical: 17, paddingHorizontal: 34, marginTop: 28 },
  buttonText: { color: "#17120A", fontWeight: "900" }
});
