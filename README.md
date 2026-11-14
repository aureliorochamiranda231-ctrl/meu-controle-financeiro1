# KYVON

Aplicativo de finanças pessoais com visual escuro, gastos, limite diário e semanal, reserva e assistente baseado em regras.

## APK Android beta v1.4.0
O APK de teste é agora **nativo React Native/Expo**, não usa WebView para renderizar o aplicativo e incorpora o pacote JavaScript/Hermes ao arquivo de instalação. Funciona sem servidor Metro e não depende do Android System WebView para mostrar a interface.

A rotina GitHub Actions **Gerar APK KYVON**:
1. Verifica o código TypeScript;
2. Gera o projeto Android com `npx expo prebuild --platform android --clean --no-install`;
3. Executa `./gradlew :app:assembleRelease` para incluir o JavaScript no APK;
4. Instala e testa a abertura num emulador Android;
5. Publica o APK em **Releases**, na versão `kyvon-beta-v1.4.0`.

**Atenção:** o APK de testes usa chave de desenvolvimento gerada no ambiente de build. Se uma versão anterior tiver assinatura diferente, desinstale-a antes da instalação. Isso remove os dados locais dessa versão: exporte ou anote as informações importantes antes.

## Executar na máquina de desenvolvimento

Instale Node.js 22+ e execute:
```sh
npm ci
npm start
```
Use Expo Go compatível com o SDK do projeto para testes de desenvolvimento. O APK distribuído pelo GitHub é **release standalone** e não precisa de Expo Go.

Verificações:
```sh
npm run typecheck
npm run export:web
```

## Dados e assistente

Na aba **Ajustes**, defina orçamento mensal, limites e meta de reserva.
Os lançamentos ficam em armazenamento local no aparelho: não há conta, backup, sincronização em nuvem nem conexão bancária. Desinstalar ou limpar dados remove os registros.

O assistente local interpreta perguntas e comandos financeiros, propõe alterações que exigem confirmação e consulta Selic, IPCA e dólar ao Banco Central por HTTPS. Não é um modelo de IA conversacional hospedado.

## Identidade visual

Ícone dourado com letra **K** em fundo preto. O aplicativo é disponibilizado em versão beta, não na Play Store.
