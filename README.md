# KYVON — beta 1.7.1

Aplicativo pessoal de finanças para Android e iOS com interface modernizada.

## Ayla: conversa como um chat
- Nova aba **Ayla** com mensagens em balões, histórico salvo no celular e sugestões de perguntas.
- Cálculos e comandos financeiros com confirmação obrigatória antes de alterar registros.
- Integração preparada com um modelo avançado via API HTTPS (sem chave secreta dentro do app). **A IA geral ainda não está ativa até o servidor ser implantado e configurado.**
- O envio de resumo financeiro à IA externa é opcional e desativado por padrão. Confira [instruções completas](docs/AYLA.md).

## API privada da Ayla (beta)
- Backend pronto para hospedar via Railway, com HTTPS, chave privada e limites básicos de requisição.
- Na aba Ayla, toque no ícone de servidor para informar a URL HTTPS e a chave privada; nenhuma chave é gravada em arquivo local.
- A implantação e o faturamento da API exigem a conta do desenvolvedor e variáveis secretas no serviço de hospedagem. Saiba mais em [docs/AYLA.md](docs/AYLA.md).

## Visual KYVON Clean
- Interface **clara**: fundo gelo, cartões brancos, azul principal e verde para metas positivas.
- Painel inicial completamente redesenhado com resumo mensal, atalhos, limites, gastos e categorias.
- Telas de despesas, reserva, assistente e planejamento renovadas, com nova hierarquia tipográfica, campos e navegação.
- Novo ícone azul e branco com a letra K e tela de abertura clara.
- Renderização nativa React Native (Expo), sem dependência de WebView ou servidor Metro no APK release.

## Funcionalidades preservadas
Lançamentos de despesas, edição, exclusão, orçamento mensal, limite semanal e diário, reserva, metas, assistente financeiro baseado em regras e consulta a indicadores públicos. A chave de armazenamento local `@meu_controle_v1` **não foi alterada** para preservar dados já registrados. Os testes de recuperação e validação TypeScript continuam na CI.

## Testar
```sh
npm ci
npm run typecheck
npm run test:unit
npm run export:web
```

O GitHub Actions gera o APK Android em `kyvon-beta-v1.7.1` e publica em [Releases](https://github.com/aureliorochamiranda231-ctrl/meu-controle-financeiro1/releases) após passar nos testes. **Não há garantia de abertura até o teste em um aparelho real.**

## Privacidade
Os registros continuam **locais**; não há conta, sincronização, banco conectado ou IA hospedada pronta para uso. Serviços como Supabase e PostHog ainda não estão integrados à aplicação. Não comite chaves privadas em um repositório público. Desinstalar o APK para instalar outro pode apagar os registros locais.
