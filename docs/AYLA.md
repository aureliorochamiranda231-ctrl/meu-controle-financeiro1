# Ayla — API privada via HTTPS (beta KYVON 1.7.1)

Ayla possui chat com histórico local e comandos financeiros com confirmação explícita. A inteligência de conversação geral passa a usar um servidor privado autenticado por uma chave de acesso longa.

## Por que HTTPS público com autenticação?
O app Android/iOS precisa alcançar o servidor pela internet. O endereço `*.railway.internal` é privado **entre servidores Railway**, mas não pode ser acessado por smartphones sem um gateway. Por isso recomendamos um endereço HTTPS público protegido com token aleatório de acesso privado. HTTPS cifra os dados durante o trânsito; sem o token correto, `POST /chat` responde HTTP 401 e não consulta o modelo.

## Publicar no Railway (ação obrigatória do dono da conta)
1. Conecte seu Railway ao GitHub e selecione o repositório `aureliorochamiranda231-ctrl/meu-controle-financeiro1`.
2. Configure um novo serviço com **Root Directory** `/server/ayla`. Ajuste o caminho do arquivo de configuração Railway para `/server/ayla/railway.json` se solicitado. O projeto é Node 22+ e `npm start` executa o backend.
3. No serviço Railway, abra **Variables** e crie:
   - `OPENAI_API_KEY`: chave de API com faturamento habilitado na sua conta OpenAI; NÃO é a assinatura Plus.
   - `AYLA_PRIVATE_TOKEN`: segredo aleatório de pelo menos 32 caracteres, preferencialmente 64 caracteres hexadecimais gerados com `openssl rand -hex 32`. Este valor fica só nas variáveis privadas Railway e deve ser informado no campo privado no seu celular.
   - `AYLA_MODEL`: `gpt-6.1-sol` (opcional; deve estar disponível à sua conta de API).
   - `AYLA_WEB_SEARCH`: `1` para liberar pesquisa na web com possíveis custos adicionais (opcional).
   - `AYLA_WEB_ORIGIN`: deixe vazio para Android e iOS, ou defina o domínio exato de um site web controlado por você.
4. Gere um domínio HTTPS em **Settings → Networking → Public Networking → Generate Domain**. O Railway cuida do certificado TLS.
5. Confirme `GET https://<seu-dominio>/health` e aguarde `{"ready":true}`. **Isto confirma a configuração do servidor, não a comunicação com o modelo.**
6. No KYVON, entre em **Ayla → ícone de servidor**, informe `https://<seu-dominio>/chat` e o `AYLA_PRIVATE_TOKEN`. Toque **Conectar servidor**. Teste com "Oi, Ayla!". Sem um backend implantado, apenas o assistente local funciona.

## Privacidade
- Não coloque `OPENAI_API_KEY` nem `AYLA_PRIVATE_TOKEN` no repositório público ou num arquivo `.env` commitado.
- A chave privada da Ayla é mantida **somente em memória no app beta**. Será necessário inseri-la novamente ao reiniciar o aplicativo. A URL HTTPS é armazenada localmente para facilitar o retorno.
- Mensagens gerais enviadas ao modelo vão pela rede; as respostas e histórico ficam localmente no dispositivo. `store:false` no Responses API evita armazenar a resposta como objeto persistente na API, mas isso não substitui a política de retenção do provedor.
- Dados financeiros que a Ayla atende localmente não são exportados automaticamente. Somente com permissão explícita o resumo financeiro agregado é enviado à IA remota; lançamentos individuais não são anexados.
- O servidor não lê bancos, não faz transferências e não modifica dados no KYVON.
- O modo de **token único é apenas para beta privada**. Não distribuir a mesma chave para clientes em produção: use autenticação por usuário com sessão, quotas por usuário, auditoria e proteção de cobrança.
- Defina limites de uso e alertas de cobrança na plataforma de API; o modelo e pesquisa web podem gerar custos por requisição.
- TLS é obrigatório. Não use `http://` na URL pública, nem publique um servidor HTTP doméstico exposto sem criptografia.

## Endpoints
- `GET /health`: retorna `{"ready":true}` se há segredos configurados.
- `POST /chat` (HTTPS, Authorization Bearer token e JSON):
```json
{
  "messages": [{"role": "user", "content": "Oi, Ayla!"}]
}
```
Resposta:
```json
{"reply":"Olá! Como posso ajudar?"}
```

## Testar localmente o servidor
```sh
cd server/ayla
npm test
node --check index.mjs
OPENAI_API_KEY=... AYLA_PRIVATE_TOKEN=... node index.mjs
```
Nunca compartilhe a sua chave em issues, logs, commits ou screenshots. Seu servidor Node escuta em `0.0.0.0:$PORT` (Railway oferece HTTPS no domínio público e encaminha ao processo).
