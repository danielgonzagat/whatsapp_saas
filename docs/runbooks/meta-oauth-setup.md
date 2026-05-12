# Meta OAuth — Marketing (WhatsApp / Facebook / Instagram)

Como configurar e diagnosticar a integração da Meta usada pela aba
**Marketing ► Conversas ► (WhatsApp/Facebook/Instagram)** do app Kloel.

> Tudo nesta página assume que o painel da Meta já foi cadastrado pelo dono do
> app. O que está aqui é o **lado servidor** — variáveis Railway/Vercel,
> ordem de resolução do `redirect_uri`, e o endpoint `GET /meta/auth/diagnostics`
> para confirmar que o backend está enxergando o que a Meta espera ver.

---

## 1. Variáveis de ambiente obrigatórias

### Backend (Railway)

| Variável                   | Exemplo                                    | Obrigatória | Notas                                                                                                                                                    |
| -------------------------- | ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `META_APP_ID`              | `2208402546567386`                         | sim         | App ID público (painel Settings → Basic).                                                                                                                |
| `META_APP_SECRET`          | (rotacionado, valor secreto)               | sim         | App Secret. **Nunca commitar.** Rotacionar se vazar.                                                                                                     |
| `META_VERIFY_TOKEN`        | (string aleatória ≥ 32 chars)              | sim         | Verificação do webhook. Mesmo valor deve estar no painel da Meta.                                                                                        |
| `META_GRAPH_API_VERSION`   | `v21.0`                                    | recomendada | Default no código.                                                                                                                                       |
| `BACKEND_PUBLIC_URL`       | `https://api.kloel.com`                    | sim         | Resolve em `redirect_uri = ${BACKEND_PUBLIC_URL}/meta/auth/callback`.                                                                                    |
| `META_OAUTH_REDIRECT_URI`  | `https://api.kloel.com/meta/auth/callback` | recomendada | **Override total** do redirect URI. Use quando o `BACKEND_PUBLIC_URL` não é o backend "público" exato (ex: split entre `api.kloel.com` e proxy interno). |
| `FRONTEND_URL`             | `https://app.kloel.com`                    | sim         | Para onde o callback redireciona depois do OAuth.                                                                                                        |
| `META_CONFIG_ID`           | (id do flow Embedded Signup)               | opcional    | Geral. Use os channel-specific abaixo se tiver mais de um flow.                                                                                          |
| `META_CONFIG_ID_WHATSAPP`  | (id do flow WhatsApp)                      | opcional    | Override só para canal WhatsApp.                                                                                                                         |
| `META_CONFIG_ID_INSTAGRAM` | (id do flow Instagram)                     | opcional    | Override só para canal Instagram.                                                                                                                        |
| `META_CONFIG_ID_MESSENGER` | (id do flow Messenger/FB)                  | opcional    | Override só para Facebook/Messenger.                                                                                                                     |

### Frontend (Vercel)

| Variável                             | Exemplo                  | Notas                                           |
| ------------------------------------ | ------------------------ | ----------------------------------------------- |
| `NEXT_PUBLIC_META_APP_ID`            | mesmo do backend         | Lido pelo SDK no client.                        |
| `NEXT_PUBLIC_META_GRAPH_API_VERSION` | `v21.0`                  | Idem.                                           |
| `NEXT_PUBLIC_SITE_URL`               | `https://kloel.com`      |                                                 |
| `NEXT_PUBLIC_APP_URL`                | `https://app.kloel.com`  |                                                 |
| `NEXT_PUBLIC_AUTH_URL`               | `https://auth.kloel.com` |                                                 |
| `NEXT_PUBLIC_API_URL`                | `https://api.kloel.com`  |                                                 |
| `NEXT_PUBLIC_PROD_ROOT_DOMAIN`       | `kloel.com`              | Default. Setar só em white-label/staging clone. |

---

## 2. Ordem de resolução do redirect URI (lado backend)

`backend/src/meta/__parts__/meta-oauth-url.helpers.ts → resolveOAuthRedirect`
resolve, na ordem, o primeiro **não-vazio** que vencer:

1. `META_OAUTH_REDIRECT_URI` — URL completa, override absoluto.
2. `BACKEND_PUBLIC_URL` → `${URL}/meta/auth/callback`.
3. `PUBLIC_BACKEND_URL`, `BACKEND_URL`, `SERVICE_BASE_URL`, `API_URL`,
   `API_PUBLIC_URL` (nesta ordem).
4. `RAILWAY_PUBLIC_DOMAIN` (promovido a https://).
5. `NEXT_PUBLIC_API_URL` / `APP_URL` — apenas se a URL "parece" um backend
   (host começa com `api.`/`backend.` ou é Railway com prefix `api`/`backend`).
6. **Fallback**: `http://localhost:3001/meta/auth/callback` — marcado como
   `isFallback: true`. **Em produção, isto é erro de configuração.**

> Recomendação: cadastre **exatamente** `https://api.kloel.com/meta/auth/callback`
> em "Valid OAuth Redirect URIs" no painel Meta e seta `META_OAUTH_REDIRECT_URI`
> com o mesmo valor. Aí não há ambiguidade.

---

## 3. Diagnóstico em runtime — `GET /meta/auth/diagnostics`

Endpoint autenticado (requer JWT + workspace). Retorna o estado real do backend
sem expor segredos:

```jsonc
{
  "redirectUri": "https://api.kloel.com/meta/auth/callback",
  "redirectUriSource": "META_OAUTH_REDIRECT_URI",
  "isFallback": false,
  "backendBaseUrl": "https://api.kloel.com",
  "frontendUrl": "https://app.kloel.com",
  "appId": "2208…7386",
  "appIdSet": true,
  "appSecretSet": true,
  "verifyTokenSet": true,
  "graphApiVersion": "v21.0",
  "configIds": { "whatsapp": true, "instagram": true, "messenger": true },
  "scopes": {
    "whatsapp": ["pages_show_list", "...", "whatsapp_business_messaging"],
    "instagram": ["pages_show_list", "...", "instagram_content_publish"],
    "facebook": ["pages_show_list", "...", "pages_messaging"],
  },
  "checklist": {
    "backendUrlResolved": true,
    "appCredentialsPresent": true,
    "webhookVerifyTokenPresent": true,
  },
}
```

Como chamar:

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" \
     -H "x-workspace-id: ${WORKSPACE_ID}" \
     https://api.kloel.com/meta/auth/diagnostics | jq
```

Confira que `redirectUri` é **byte-a-byte igual** à URL cadastrada no painel.
Espaço, barra final, http vs https, subdomain — tudo importa.

---

## 4. Mapa do erro "URL não está nos domínios do aplicativo"

A Meta retorna esse erro quando o `redirect_uri` enviado pela primeira chamada
OAuth não está cadastrado em alguma destas listas do app:

1. **Settings → Basic → App Domains** — só host, sem path. Cadastrar
   `api.kloel.com`, `app.kloel.com`, `auth.kloel.com`, `kloel.com`.
2. **Facebook Login → Settings → Valid OAuth Redirect URIs** — URL completa
   _com path_. Cadastrar `https://api.kloel.com/meta/auth/callback`.
3. **Facebook Login → Settings → Allowed Domains for the JS SDK** — host com
   `https://`. Cadastrar os mesmos cinco.
4. **Settings → Basic → Website → Site URL** — `https://kloel.com`.
5. **Business Verification → Verified Domains** — `kloel.com` (subdomínios
   herdam quando o root está verificado, mas precisam aparecer nas listas acima
   ainda assim).

Se o backend resolveu `redirectUri` correto via `/meta/auth/diagnostics` e o
erro continua, a divergência está num desses cinco lugares — não no código.

---

## 5. Renovação do Long-Lived Token

Tokens long-lived de usuário expiram em ~60 dias. O callback OAuth grava
`MetaConnection.tokenExpiresAt`. Para detectar antes de quebrar:

- `GET /meta/auth/status` retorna `tokenExpired: true` quando vencido.
- Frontend mostra estado "reconnect required" na aba Marketing.
- (Roadmap) job BullMQ que dispara alerta 7 dias antes do vencimento — issue
  separada.

---

## 6. Rotação de credenciais (incidente)

Se App Secret ou Long-Lived Token forem expostos:

1. Meta Console → **Settings → Basic → Reset App Secret**.
2. Atualizar `META_APP_SECRET` no Railway (production env).
3. Redeploy backend.
4. Para tokens de usuário: Meta Console → **Tools → Access Token Tool →
   "Debug" → Revoke** no token comprometido.
5. Forçar reconnect dos workspaces afetados:
   - `DELETE FROM "MetaConnection" WHERE workspaceId IN (...);`
   - próximo acesso a `/marketing/*` mostra "Conectar".

Nunca commitar nenhum dos valores. Nunca colar em chat com terceiros.

---

## 7. Smoke test manual

Após qualquer mudança de env ou deploy, rodar:

1. `curl /meta/auth/diagnostics` autenticado → `isFallback: false`,
   `appCredentialsPresent: true`, `redirectUri` match.
2. Frontend `/marketing/whatsapp` → clicar "Conectar" → OAuth Meta abre.
3. Concluir login → callback redireciona para `/marketing/whatsapp?meta=success`.
4. `GET /meta/auth/status` → `connected: true`, canal certo com
   `connected: true`.
5. Envio teste: `POST /api/meta/whatsapp/send-test` (se aplicável) ou
   conversa real disparada via Inbox.

Em caso de falha, abrir logs Railway com `event:meta_oauth_callback_failed` ou
`event:meta_oauth_token_exchange_failed`.
