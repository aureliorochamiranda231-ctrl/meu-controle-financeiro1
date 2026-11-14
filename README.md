# KYVON — beta 1.5.0

Controle financeiro pessoal para Android e iOS desenvolvido em React Native/Expo.

## Reconstrução do lançamento
- O Android usa **React Native nativo**, não depende de WebView, servidor Metro ou página remota.
- O aplicativo exibe um **estado de recuperação** se alguma tela falhar ao renderizar.
- O carregamento dos registros locais é defensivo: JSON inválido e despesas antigas malformadas não deixam a aplicativo preso em "Carregando".
- Antes de reparar registros, o dado bruto anterior é preservado numa chave de backup local.
- A interface apresenta uma identidade visual preta e dourada, painel de orçamento, atalhos, visão semanal, categorias, histórico, reserva, assistente local e ajustes.
- Não há conexão bancária, telemetria, login, sincronização em nuvem ou um LLM remoto ativo. Os plugins de desenvolvimento do ChatGPT **não são SDKs do aplicativo**.

## Baixar e instalar
Abra [Releases](https://github.com/aureliorochamiranda231-ctrl/meu-controle-financeiro1/releases), procure `kyvon-beta-v1.5.0` e instale `KYVON-beta.apk` no Android. A publicação depende da conclusão do GitHub Actions.

**Importante:** a compilação não prova o funcionamento num celular real. Faça o teste inicial antes de registrar dados pessoais. Se precisar desinstalar uma versão assinada com outra chave, copie primeiro seus registros, pois a remoção apaga os dados locais.

## Desenvolvimento
```sh
npm ci
npm run typecheck
npm run test:unit
npm run export:web
```

O GitHub Actions gera um APK release independente por `expo prebuild` e `assembleRelease`, valida a presença do bundle JavaScript e publica uma beta no GitHub Releases. As verificações automáticas não substituem o teste de abertura em um aparelho Android.

## Privacidade e futuras integrações
Supabase e PostHog estão disponíveis no ChatGPT, mas **não foram conectados ao app**. Não adicionar chaves secretas no repositório público nem enviar dados financeiros para serviços externos sem autorização, autenticação e RLS por usuário.
