# Kloel CIA Meta Operator Setup

Data de referência desta validação: `2026-04-22`.

Este documento concentra o preenchimento operacional do app Meta `Kloel CIA`
para os casos de uso oficiais de canais, leads e anúncios.

O app `Kloel Auth` (`1330781852282671`) serve apenas para autenticação / criação
de conta do usuário final dentro do Kloel. Ele não é o app canônico para
WhatsApp Cloud, Instagram Direct, Messenger, leads e ativos de marketing.

Para estes casos de uso, use apenas o app principal `Kloel CIA`
(`2208402546567386`).

## Valores canônicos

- App principal de canais: `Kloel CIA`
- App ID: `2208402546567386`
- Config ID do Embedded Signup: `2217262462346828`
- Site institucional: `https://kloel.com`
- Site público legal:
  - `https://kloel.com/privacy`
  - `https://kloel.com/terms`
  - `https://kloel.com/data-deletion`
- Frontend público: `https://app.kloel.com`
- Backend público canônico: `https://api.kloel.com`
- OAuth Redirect URI canônica:
  - `https://api.kloel.com/meta/auth/callback`
- Webhook Callback URL canônica:
  - `https://api.kloel.com/webhooks/meta`
- Data Deletion Callback URL canônica:
  - `https://api.kloel.com/auth/facebook/data-deletion`
- Deauthorize Callback URL canônica:
  - `https://api.kloel.com/auth/facebook/deauthorize`

## Domínios e whitelists

### App Domains

Preencha com os domínios públicos que participam do produto:

- `kloel.com`
- `www.kloel.com`
- `app.kloel.com`
- `auth.kloel.com`
- `pay.kloel.com`
- `api.kloel.com`

### Valid OAuth Redirect URIs

Cadastre explicitamente:

- `https://api.kloel.com/meta/auth/callback`

Se você optar por usar o proxy do frontend para alguma revisão manual, o backend
continua sendo a fonte canônica. Não troque a URL canônica sem também ajustar a
configuração pública do backend.

## Verify token

Não comite o verify token.

Use exatamente o valor configurado em produção na variável
`META_VERIFY_TOKEN` do backend Railway. O endpoint de verificação do app usa:

- `GET https://api.kloel.com/webhooks/meta`

O backend também aceita o alias legado `META_WEBHOOK_VERIFY_TOKEN`, mas o valor
canônico para operação e cadastro é `META_VERIFY_TOKEN`.

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

- Caso de uso Meta: `Criar e mensurar anúncios`
- Webhook URL: não usa webhook dedicado
- Redirect URI: não aplicável além do OAuth global do app
- Permissões mínimas:
  - `ads_management`
  - `ads_read`
  - `business_management`
- Token operacional:
  - use o token de usuário emitido para este caso de uso
- Observação:
  - a leitura e operação ficam via Graph pull; não existe callback específico no
    produto para este bloco

### 2. Mensurar desempenho do anúncio

- Caso de uso Meta: `Mensurar desempenho do anúncio`
- Webhook URL: não usa webhook dedicado
- Redirect URI: não aplicável além do OAuth global do app
- Permissões mínimas:
  - `ads_read`
  - `business_management`
- Token operacional:
  - use o token de usuário emitido para leitura do Ads Reporting

### 3. Capturar e gerenciar leads de anúncios

- Caso de uso Meta: `Capturar e gerenciar leads de anúncios`
- Webhook Callback URL:
  - `https://api.kloel.com/webhooks/meta`
- Objeto de webhook:
  - `Page`
- Campos a assinar na Page:
  - `leadgen`
  - `feed`
- Permissões mínimas:
  - `leads_retrieval`
  - `pages_manage_metadata`
  - `pages_read_engagement`
  - `business_management`
- Token operacional:
  - use o token de usuário emitido para este caso de uso para obter o
    `page_access_token`
- Evidência de produto:
  - o backend persiste os eventos de `page.leadgen` em `MetaLeadCapture` e faz
    sync honesto de CRM só quando existe telefone real

### 4. Messenger from Meta

- Caso de uso Meta: `Messenger from Meta`
- Webhook Callback URL:
  - `https://api.kloel.com/webhooks/meta`
- Objeto de webhook:
  - `Page`
- Campos a assinar na Page:
  - `messages`
  - `messaging_postbacks`
  - `message_reads`
  - `message_deliveries`
- Redirect URI:
  - `https://api.kloel.com/meta/auth/callback`
- Permissões mínimas:
  - `pages_messaging`
  - `pages_manage_metadata`
  - `pages_show_list`
  - `pages_read_engagement`
- Token operacional:
  - use o token de usuário emitido para este caso de uso para obter o
    `page_access_token`
- Estado atual:
  - o produto já tem a superfície e o backend oficial prontos, mas a assinatura
    final do Messenger continua dependendo de um token com `pages_messaging`
    efetivo na Page conectada

### 5. API do Instagram

- Caso de uso Meta: `API do Instagram`
- Webhook Callback URL:
  - `https://api.kloel.com/webhooks/meta`
- Objeto de webhook:
  - `Instagram`
- Campos do objeto Instagram:
  - `messages`
  - `messaging_postbacks`
  - `message_reactions`
  - `mentions`
  - `comments`
  - `live_comments`
  - `story_insights`
- Redirect URI:
  - `https://api.kloel.com/meta/auth/callback`
- Permissões mínimas:
  - `instagram_basic`
  - `instagram_manage_messages`
  - `instagram_manage_comments`
  - `instagram_content_publish`
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `business_management`
- Token operacional:
  - use o token de usuário emitido para este caso de uso
- Estado atual:
  - a superfície oficial e os endpoints existem, mas o canal só fica realmente
    verde quando a Page conectada expõe um `instagram_business_account` válido

### 6. Gerenciar Página

- Caso de uso Meta: `Gerenciar Página`
- Webhook Callback URL:
  - `https://api.kloel.com/webhooks/meta`
- Objeto de webhook:
  - `Page`
- Campos:
  - `feed`
  - `messages`
  - `message_reads`
  - `message_deliveries`
  - `messaging_postbacks`
  - `leadgen`
- Permissões mínimas:
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
  - `pages_manage_ads`
  - `pages_messaging`
- Token operacional:
  - use o token de usuário emitido para este caso de uso para obter o
    `page_access_token`

### 7. Conectar no WhatsApp

- Caso de uso Meta: `Conectar no WhatsApp`
- Embedded Signup Config ID:
  - `2217262462346828`
- Redirect URI:
  - `https://api.kloel.com/meta/auth/callback`
- Webhook Callback URL:
  - `https://api.kloel.com/webhooks/meta`
- Objeto de webhook:
  - `WhatsApp Business Account`
- Campo:
  - `messages`
- Permissões mínimas:
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`
  - `business_management`
- Token operacional:
  - use o token de usuário do app Kloel CIA ou o token do fluxo oficial
    autorizado para a checagem dos ativos
- Ativos já validados:
  - WABA ID: `2848659798820132`
  - Phone Number ID: `1055729897629826`
  - Número de teste: `+1 555 634 5954`

## Campos globais de revisão / compliance

Se o formulário do app também pedir os callbacks globais de privacidade, use:

- Privacy Policy URL:
  - `https://kloel.com/privacy`
- Terms of Service URL:
  - `https://kloel.com/terms`
- Data Deletion Instructions URL:
  - `https://kloel.com/data-deletion`
- Data Deletion Callback URL:
  - `https://api.kloel.com/auth/facebook/data-deletion`
- Deauthorize Callback URL:
  - `https://api.kloel.com/auth/facebook/deauthorize`

## Comandos operacionais

### 1. Obter o Page access token a partir do user access token

```bash
curl -G 'https://graph.facebook.com/v25.0/me/accounts' \
  --data-urlencode 'fields=id,name,access_token' \
  --data-urlencode 'access_token=<USER_ACCESS_TOKEN>'
```

### 2. Assinar Lead Ads realtime na Page

```bash
curl -X POST 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  -H 'Content-Type: application/json' \
  -d '{
    "access_token": "<PAGE_ACCESS_TOKEN>",
    "subscribed_fields": "leadgen,feed"
  }'
```

### 3. Assinar Messenger realtime na Page

```bash
curl -X POST 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  -H 'Content-Type: application/json' \
  -d '{
    "access_token": "<PAGE_ACCESS_TOKEN>",
    "subscribed_fields": "messages,messaging_postbacks,message_reads,message_deliveries"
  }'
```

### 4. Conferir as assinaturas ativas da Page

```bash
curl -G 'https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps' \
  --data-urlencode 'access_token=<PAGE_ACCESS_TOKEN>'
```

### 5. Validar o verify GET do webhook Meta

```bash
curl -G 'https://api.kloel.com/webhooks/meta' \
  --data-urlencode 'hub.mode=subscribe' \
  --data-urlencode 'hub.verify_token=<META_VERIFY_TOKEN>' \
  --data-urlencode 'hub.challenge=123456'
```

### 6. Enviar o template de teste do WhatsApp Cloud

```bash
curl -i -X POST \
  'https://graph.facebook.com/v25.0/1055729897629826/messages' \
  -H 'Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
    "messaging_product": "whatsapp",
    "to": "<DESTINATION_PHONE>",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": {
        "code": "en_US"
      }
    }
  }'
```

## Bloqueios externos honestos nesta data

- Instagram:
  - a Page validada ainda não expõe `instagram_business_account`
  - sem isso, não existe green honesto para DM / insights reais
- Messenger:
  - a assinatura final da Page continua bloqueada enquanto o token validado não
    tiver `pages_messaging` efetivo

## Regra operacional

Não comite:

- app secrets
- verify token
- user access tokens
- page access tokens
- long-lived tokens de operação

Esses valores devem ficar apenas nos ambientes de produção, no formulário da
Meta quando exigido e no cofre operacional.
