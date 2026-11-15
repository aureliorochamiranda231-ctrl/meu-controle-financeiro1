# KYVON — Ayla com backend privado HTTPS

## Hospedagem
- Projeto: **KYVON Ayla API** no Railway, privado no painel da conta.
- Endereço: `https://ayla-private-api-production.up.railway.app/chat`
- Login: `POST /auth` com `{"password":"..."}`, devolvendo token de sessão temporária de 12 horas.
- Chat: `POST /chat` com `Authorization: Bearer <token-de-sessao>` e corpo `{"messages":[{"role":"user","content":"Oi!"}]}`.
- Estado: servidor implantado com proteção de senha. **Sem `OPENAI_API_KEY` no Railway, respostas de IA online ficam indisponíveis.**
- O endpoint é acessível via HTTPS público (necessário para celulares fora da rede), mas as rotas de login/chat exigem autenticação. Isto não é uma rede VPN privada.
- Modelo configurável: `AYLA_MODEL`, atualmente `gpt-5-mini`.

## Secrets que ficam exclusivamente no Railway
- `AYLA_PASSWORD_SHA256`: hash SHA-256 da senha privada para beta;
- `AYLA_SESSION_SECRET`: segredo usado para assinar tokens temporários;
- `OPENAI_API_KEY`: deve ser criada pelo proprietário da API OpenAI e cadastrada manualmente no Railway; **não compartilhe o segredo por chat ou no GitHub**.
- `AYLA_MODEL=gpt-5-mini` e `AYLA_WEB_SEARCH=0` (pode habilitar busca web, sujeita a custo).
- HTTPS/TLS terminado pelo provedor de hospedagem Railway.
- A conta Railway pode gerar custo de infraestrutura e a API OpenAI cobra consumo separadamente da assinatura ChatGPT.

## Como acessar no aplicativo
1. Abra KYVON → aba **Ayla** → ícone de servidor.
2. O endereço HTTPS já estará preenchido; toque no campo da senha privada e entre.
3. O app solicita uma sessão temporária pelo endpoint `/auth`, sem enviar a senha para a OpenAI.
4. A sessão não é guardada em AsyncStorage: precisa entrar novamente ao fechar o aplicativo.
5. Enviar dados financeiros agregados para IA online é desabilitado por padrão e precisa de consentimento. Mensagens sobre finanças respondidas localmente não são exportadas por padrão.
6. Alterações financeiras precisam de aprovação local antes de gravar.

## Limitações e segurança
- Este modo privado é **beta para uma pessoa**. A senha única não deve ser distribuída a usuários públicos. Antes de lançamento público, substituir por autenticação individual e limites/quotas por conta.
- Rate limiting de login e perguntas é em memória por instância; para escala ou múltiplas réplicas, usar limites distribuídos (Redis) e quotas por pessoa. A proteção contra força bruta é básica.
- O histórico de chat é local no aparelho. Mensagens para IA online vão ao servidor e ao provedor do modelo. O servidor foi configurado para `store: false` ao chamar Responses API.
- Não há conexão bancária ou função de pagamento. Nenhuma alteração de dados é aplicada sem confirmação.
- Desinstalar o app pode apagar registros e conversas locais.
- A aplicação no GitHub é pública; **nunca** registrar senhas reais, hash com valor em texto claro, tokens ou chaves de API no código.

## Testar
- `npm ci`
- `npm run typecheck`
- `npm run test:unit`
- `npm run export:web`
- Validar /health, /auth (senha incorreta -> 401), /chat sem sessão -> 401 e /chat com sessão, após configurar a OpenAI, -> 200.
