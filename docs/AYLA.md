# Ayla — IA conversacional do KYVON

## O que já funciona sem servidor
- Aba **Ayla** com conversa em balões, mensagens longas, histórico e botão de nova conversa.
- Histórico salvo apenas no AsyncStorage do aparelho, em `@kyvon_ayla_chat_v1`. A chave financeira antiga `@meu_controle_v1` é preservada.
- Respostas financeiras locais, cálculos de limites, consulta pública ao Banco Central.
- Comandos para registrar/editar/excluir gastos, configurar limites e atualizar a reserva, sempre com confirmação antes de modificar qualquer dado.
- Painel de permissão para compartilhar **somente o resumo agregado** das finanças. Desligado por padrão.

## O que falta para a Ayla ter inteligência artificial geral
**Não existe um backend de IA conectado neste repositório.** O serviço Node em `server/ayla/index.mjs` é uma implementação de referência, não é implantado automaticamente pelo APK.

1. Configure um projeto Supabase e crie login para os usuários no aplicativo. O backend exige um **JWT de usuário** válido emitido pelo Supabase Auth.
2. Hospede o serviço `server/ayla/index.mjs` em infraestrutura confiável atrás de HTTPS, controle de acesso e monitoramento.
3. Defina APENAS no servidor: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. Não adicione nenhuma dessas credenciais privadas ao repositório. O nome do modelo pode ser definido com `AYLA_MODEL` (padrão `gpt-6.1-sol`).
4. Na configuração do Expo, defina `EXPO_PUBLIC_AYLA_API_URL=https://seu-servidor.exemplo/chat` antes do build.
5. Integre o acesso JWT do login no cabeçalho Authorization enviado por `src/aylaApi.ts`. **Essa autenticação ainda não existe no APK; sem ela o backend retorna 401.** Não remova a checagem de autenticação para contornar o problema.
6. Opcional: configure `AYLA_WEB_SEARCH=1` no servidor para permitir busca na web, considerando limites e custos por consulta.

A API do servidor recebe até 12 mensagens e opcionalmente `financialSummary`, e devolve `{ "reply": "..." }`. O app não recebe acesso à chave da OpenAI.

## Segurança e privacidade
- A Ayla jamais altera finanças sem a confirmação local do usuário. Ela não realiza pagamentos nem lê extratos bancários reais.
- **Mensagens digitadas para a IA online** e suas respostas entram no contexto da conversa online. Mensagens respondidas pelo sistema financeiro local não são enviadas automaticamente ao modelo online.
- O resumo financeiro (renda, orçamento, gastos agregados, limites e reserva) é enviado ao servidor apenas com o controle de consentimento ativado. Nenhuma transação individual é enviada automaticamente.
- A IA pode errar. Não tome decisões financeiras de alto impacto sem conferir os dados.
- O exemplo de backend tem limite básico em memória de 20 requisições por minuto por usuário e valida JWT com o Supabase. Para produção: armazenamento de limites compartilhado, limite mensal de gastos de API, proteção contra abuso, backups e uma política de privacidade revisada.
- Desinstalar o APK pode remover tanto o histórico do chat quanto os registros financeiros locais.

## Contrato da API
```http
POST /chat
Authorization: Bearer <JWT_REAL_DO_USUARIO>
Content-Type: application/json

{
  "messages": [{"role": "user", "content": "Oi, Ayla!"}],
  "financialSummary": {
    "month": "2026-11",
    "monthlyIncome": 0,
    "monthlyBudget": 500,
    "monthlySpent": 0,
    "weeklyLimit": 120,
    "weeklySpent": 0,
    "dailyLimit": 0,
    "reserve": 0,
    "reserveGoal": 0
  }
}
```

```json
{"reply": "Olá! Como posso ajudar hoje?"}
```

## Testes antes de publicar
```sh
npm ci
npm run typecheck
npm run test:unit
npm run export:web
```
O pipeline do GitHub pode gerar um APK para testes de abertura em aparelho real. Nenhum componente foi testado fisicamente em um celular nesta alteração.
