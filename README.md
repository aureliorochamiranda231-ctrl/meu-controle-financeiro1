# Meu Controle

Aplicativo de finanças pessoais em português, com visual escuro para Android, iPhone e navegador. A tela inicial mostra o orçamento mensal e o limite da semana, de segunda a domingo. Na aba Gastos você pode registrar, editar e excluir despesas. A aba Reserva acompanha o valor guardado e a meta.

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

A aba **Assistente** interpreta perguntas em português com um classificador local baseado em exemplos. Os cálculos usam os lançamentos, limites, renda, reserva e meta cadastrados no app. O assistente consulta os registros em modo de leitura e funciona offline. O histórico da conversa fica em memória até o app fechar ou você tocar em **Limpar conversa**.

Você pode perguntar quanto gastou em determinado período, ver categorias e maiores despesas, consultar a reserva ou simular como uma compra afetaria os limites. Por exemplo, escreva “Se eu gastar R$ 30,00?” ou “Quanto gastei em "mercado" este mês?”.
