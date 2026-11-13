# KYVON

KYVON é um aplicativo de finanças pessoais em português, com visual escuro para Android, iPhone e navegador. A tela inicial mostra o orçamento mensal e o limite da semana, de segunda a domingo. Na aba Gastos você pode registrar, editar e excluir despesas. A aba Reserva acompanha o valor guardado e a meta.

## Testar no celular

Use Node.js 22 LTS ou mais recente. Na pasta do projeto, execute:

```sh
npm ci
npm start
```

Em um celular com Expo Go compatível com o SDK deste projeto, abra o QR code exibido pelo Expo. Use a mesma rede Wi‑Fi do computador. Para testar pelo navegador, execute `npm run web`.

Em **Ajustes**, defina o orçamento mensal, o limite semanal e, se quiser, a meta de reserva. Os limites começam em branco. Os lançamentos ficam no armazenamento local do aparelho ou navegador, sem conta ou sincronização. Limpar os dados do aplicativo ou do navegador remove seus registros.

## Gerar um APK de teste

Em um computador, entre na sua conta Expo e inicie o build Android:

```sh
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Na primeira execução, o EAS pede para vincular o projeto à sua conta e configurar a assinatura do APK. Quando concluir, ele fornece o link de instalação. Para distribuição iOS pelo TestFlight, o build precisa ser assinado com uma conta Apple Developer.

## Verificar o código

```sh
npm run typecheck
npm run export:web
```

## Assistente financeiro

A aba **Assistente** interpreta perguntas e comandos em português com um classificador local e regras de cálculo. O assistente pode consultar e alterar registros e ajustes do app. As alterações propostas aparecem no chat e só são aplicadas ao confirmar. O histórico da conversa fica em memória.

- **“Quanto posso gastar hoje?”** usa seu limite diário, se configurado. Sem um limite fixo, divide o saldo semanal pelos dias até domingo, incluindo hoje.
- **“Calcule meus limites”** distribui o saldo do orçamento mensal pelos dias restantes e propõe limites fixos. Os valores ficam salvos até que você recalcule ou altere.
- **“Registre R$ 30,00 em mercado / Alimentação”**, **“Corrija ‘mercado’ para R$ 35,00”** e **“Defina o limite semanal para R$ 120,00”** propõem alterações. Use aspas duplas nos nomes das despesas ao corrigir ou excluir pelo chat.
- **“Qual a Selic?”**, **“Qual o IPCA?”** e **“Qual o dólar?”** consultam as séries 432, 433 e 1 do Banco Central do Brasil. O app apresenta o valor com a data de referência. Somente as séries públicas são solicitadas. O texto da conversa e os registros financeiros ficam no aparelho.

O APK beta usa o código em `android-preview/` para executar a exportação web localmente. O WebView intercepta os três caminhos de consulta pública e encaminha requisições HTTPS fixas ao Banco Central.

## Identidade visual KYVON

O aplicativo usa apenas a letra **K** dourada sobre fundo preto no ícone e tela de abertura. A identidade foi configurada em `app.json` (Expo) e em `android-preview/res/drawable/` (APK Android de teste). Para gerar um novo APK, execute o build conforme as instruções anteriores; esta alteração por si só não compila nem distribui o APK.
