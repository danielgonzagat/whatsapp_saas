# Kloel CIA Meta Operator Setup

Data de referência desta validação: `2026-04-21`.

Este documento centraliza o preenchimento operacional do app Meta `Kloel CIA`
e os comandos reais que precisam ser executados para ativar os casos de uso
oficiais por workspace.

O app `Kloel Auth` (`1330781852282671`) nao entra neste preenchimento. Para
estes casos de uso oficiais, use apenas o app principal de canais `Kloel CIA`
(`2208402546567386`).

## Valores canônicos

- App principal de canais: `Kloel CIA`
- App ID: `2208402546567386`
- Config ID do Embedded Signup: `2217262462346828`
- Backend público: `https://api.kloel.com`
- Frontend público: `https://www.kloel.com`
- Site institucional: `https://kloel.com`
- OAuth Redirect URI:
  `https://api.kloel.com/meta/auth/callback`
- Webhook Callback URL:
  `https://api.kloel.com/webhooks/meta`
- Data Deletion Callback URL:
  `https://api.kloel.com/auth/facebook/data-deletion`
- Deauthorize Callback URL:
  `https://api.kloel.com/auth/facebook/deauthorize`
- Privacy Policy URL:
  `https://kloel.com/privacy`
- Terms of Service URL:
  `https://kloel.com/terms`
- App Domains:
  - `kloel.com`
  - `www.kloel.com`
  - `app.kloel.com`
  - `api.kloel.com`

## Verify token

Não comite o verify token no repositório.

Use exatamente o valor configurado em produção na variável `META_VERIFY_TOKEN`
do backend Railway. Em `2026-04-21`, o verify GET e o signed POST foram
validados com sucesso contra `https://api.kloel.com/webhooks/meta`.

## Objetos e campos de webhook

### Page

- `messages`
- `messaging_postbacks`
- `message_reads`
- `message_deliveries`
- `feed`
- `leadgen`

### Instagram

- `messages`
- `messaging_postbacks`
- `message_reactions`
- `mentions`
- `comments`
- `live_comments`
- `story_insights`

### WhatsApp Business Account

- `messages`

## Preenchimento por caso de uso

### 1. Criar e mensurar anúncios

- Não usa webhook dedicado.
- Permissões:
  - `ads_management`
  - `ads_read`
  - `business_management`

### 2. Mensurar desempenho do anúncio

- Não usa webhook dedicado.
- Fluxo via Graph pull.
- Permissões:
  - `ads_read`
  - `business_management`

### 3. Capturar e gerenciar leads de anúncios

- Webhook:
  - `https://api.kloel.com/webhooks/meta`
- Objeto:
  - `Page`
- Campo:
  - `leadgen`
- Permissões:
  - `leads_retrieval`
  - `pages_manage_metadata`
  - `pages_read_engagement`
  - `business_management`

### 4. Messenger from Meta

- Webhook:
  - `https://api.kloel.com/webhooks/meta`
- Objeto:
  - `Page`
- Campos:
  - `messages`
  - `messaging_postbacks`
  - `message_reads`
  - `message_deliveries`
- Permissões:
  - `pages_messaging`
  - `pages_manage_metadata`
  - `pages_show_list`
  - `pages_read_engagement`

### 5. API do Instagram

- Webhook:
  - `https://api.kloel.com/webhooks/meta`
- Objeto:
  - `Instagram`
- Campos:
  - `messages`
  - `messaging_postbacks`
  - `message_reactions`
  - `mentions`
  - `comments`
  - `live_comments`
  - `story_insights`
- Redirect URI:
  - `https://api.kloel.com/meta/auth/callback`
- Permissões:
  - `instagram_basic`
  - `instagram_manage_messages`
  - `instagram_manage_comments`
  - `instagram_content_publish`
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `business_management`

### 6. Gerenciar Página

- Webhook:
  - `https://api.kloel.com/webhooks/meta`
- Objeto:
  - `Page`
- Campos:
  - `feed`
  - `messages`
  - `message_reads`
  - `message_deliveries`
  - `messaging_postbacks`
  - `leadgen`
- Permissões:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `pages_manage_ads`
  - `pages_messaging`

### 7. Conectar no WhatsApp

- Webhook:
  - `https://api.kloel.com/webhooks/meta`
- Objeto:
  - `WhatsApp Business Account`
- Campo:
  - `messages`
- Embedded Signup:
  - `config_id=2217262462346828`
- Redirect URI:
  - `https://api.kloel.com/meta/auth/callback`
- Permissões:
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`
  - `business_management`

## Comandos operacionais

### 1. Obter Page access token

Use o token de usuário do caso de uso correspondente e recupere o `access_token`
da Page:

```bash
curl -G 'https://graph.facebook.com/v25.0/me/accounts' \
  --data-urlencode 'fields=id,name,access_token' \
  --data-urlencode 'access_token=<USER_ACCESS_TOKEN>'
```

### 2. Assinar Lead Ads realtime na Page

Esse comando foi validado com sucesso em `2026-04-21` para a Page
`994971940375552`, deixando `leadgen` e `feed` ativos em `subscribed_apps`.

```bash
curl -X POST 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  -H 'Content-Type: application/json' \
  -d '{
    "access_token": "<PAGE_ACCESS_TOKEN>",
    "subscribed_fields": "leadgen,feed"
  }'
```

### 3. Verificar assinaturas atuais da Page

```bash
curl -G 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  --data-urlencode 'access_token=<PAGE_ACCESS_TOKEN>'
```

### 4. Assinar Messenger realtime na Page

```bash
curl -X POST 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  -H 'Content-Type: application/json' \
  -d '{
    "access_token": "<PAGE_ACCESS_TOKEN>",
    "subscribed_fields": "messages,messaging_postbacks,message_reads,message_deliveries"
  }'
```

Se esse POST retornar erro `(#200)` exigindo `pages_messaging`, o token usado
não está apto para ativar o Messenger oficial.

### 5. Enviar template de teste no WhatsApp Cloud API

```bash
curl -X POST 'https://graph.facebook.com/v25.0/1055729897629826/messages' \
  -H 'Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "messaging_product": "whatsapp",
    "to": "<DESTINATION_NUMBER>",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

## Estado real validado em 2026-04-21

### Verde real

- `GET /webhooks/meta` verify challenge responde `200` no backend público.
- `POST /webhooks/meta` assinado responde `200`.
- `GET /meta/auth/callback` está público e redireciona corretamente.
- O app `Kloel CIA` está assinado na Page `994971940375552` para:
  - `leadgen`
  - `feed`
- O repositório agora persiste `page.leadgen` por workspace em `MetaLeadCapture`
  sem inventar telefone e sem forçar CRM quando a Meta não traz telefone.

### Blocked external

- `Messenger`: a assinatura `messages,messaging_postbacks,message_reads,message_deliveries`
  falhou ao vivo com `(#200)` exigindo `pages_messaging` no token validado.
- `Instagram Direct`: a Page `994971940375552` ainda não expõe
  `instagram_business_account` no Graph, então o vínculo oficial do canal ainda
  não está completo.

## Assets atuais validados

- Business ID: `1230634055818028`
- Page ID: `994971940375552`
- WhatsApp Business Account ID: `2848659798820132`
- WhatsApp Phone Number ID: `1055729897629826`
- Test Number: `+1 555 634 5954`
