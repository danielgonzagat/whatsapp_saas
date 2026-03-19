# WhatsApp API Integration (WAHA)

## Visão Geral

Este projeto utiliza o [WAHA (WhatsApp HTTP API)](https://waha.devlike.pro/) como **provider oficial** para envio de mensagens WhatsApp.

### Vantagens

✅ Container Docker independente - fácil de escalar e manter  
✅ REST API completa e bem documentada  
✅ Suporte a webhooks para eventos em tempo real  
✅ Múltiplas sessões suportadas  
✅ QR Code via API REST  
✅ Sem dependência de Puppeteer no backend principal

## Arquitetura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│    Backend      │────▶│  whatsapp-api   │
│   (Next.js)     │     │   (NestJS)      │     │   (Container)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               │                        │
                        ┌──────▼──────┐          ┌──────▼──────┐
                        │   Worker    │          │   WhatsApp  │
                        │  (BullMQ)   │          │    Web      │
                        └─────────────┘          └─────────────┘
```

## Configuração

### 1. Variáveis de Ambiente

Adicione ao seu `.env`:

```bash
# URL da instância WAHA
WAHA_API_URL=https://seu-waha.up.railway.app

# API Key para autenticação (header X-Api-Key)
WAHA_API_KEY=your-waha-api-key

# Webhook WAHA -> Backend (essencial para inbound/autopilot)
WHATSAPP_HOOK_URL=https://seu-backend.up.railway.app/webhooks/whatsapp-api
WHATSAPP_HOOK_EVENTS=session.status,message,message.any,message.ack
WHATSAPP_API_WEBHOOK_SECRET=your-webhook-secret

# Health do worker consolidado no backend
WORKER_HEALTH_URL=http://worker:3003/health
WORKER_METRICS_TOKEN=your-worker-metrics-token

# Worker -> Backend (Unified Agent / Kloel)
BACKEND_URL=https://seu-backend.up.railway.app
```

Importante: o runtime atual falha cedo se `WAHA_API_URL` não estiver definido. Não existe mais fallback implícito para uma instância WAHA hardcoded.

### 2. WAHA como Serviço Externo

O WAHA roda como serviço externo (ex.: Railway). Não há mais container local no `docker-compose.yml`.

```bash
docker-compose up -d
```

## Endpoints da API

### Sessão

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/whatsapp-api/session/start` | Inicia nova sessão |
| `GET` | `/whatsapp-api/session/status` | Status da sessão |
| `GET` | `/whatsapp-api/session/qr` | QR Code para auth |
| `DELETE` | `/whatsapp-api/session/disconnect` | Encerra sessão |
| `POST` | `/whatsapp-api/session/logout` | Logout/reset completo da sessão |

### Mensagens

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/whatsapp-api/send/:phone` | Envia mensagem |
| `GET` | `/whatsapp-api/check/:phone` | Verifica se está no WhatsApp |

### Health

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/whatsapp-api/health` | Health check do serviço |
| `GET` | `/whatsapp-api/provider-status` | Status do provider |
| `GET` | `/health/system` | Health consolidado (DB, Redis, WAHA, worker, config) |
| `GET` | `/health/ready` | Alias de readiness |

## Exemplos de Uso

### Iniciar Sessão

```bash
curl -X POST http://localhost:3001/whatsapp-api/session/start \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "x-workspace-id: seu-workspace-id"
```

### Obter QR Code

```bash
curl -X GET http://localhost:3001/whatsapp-api/session/qr \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "x-workspace-id: seu-workspace-id"
```

Resposta:
```json
{
  "available": true,
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}
```

### Enviar Mensagem

```bash
curl -X POST http://localhost:3001/whatsapp-api/send/5511999998888 \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "x-workspace-id: seu-workspace-id" \
  -H "Content-Type: application/json" \
  -d '{"message": "Olá! Esta é uma mensagem de teste."}'
```

### Enviar Mídia

```bash
curl -X POST http://localhost:3001/whatsapp-api/send/5511999998888 \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "x-workspace-id: seu-workspace-id" \
  -H "Content-Type: application/json" \
  -d '{
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Confira esta imagem!"
  }'
```

## Webhooks

O backend recebe automaticamente webhooks em:

```
POST /webhooks/whatsapp-api
```

### Eventos Suportados

| Evento | Descrição |
|--------|-----------|
| `message` | Mensagem recebida |
| `message_create` | Mensagem criada (enviada) |
| `qr` | QR Code gerado |
| `ready` | Sessão pronta |
| `authenticated` | Autenticação concluída |
| `disconnected` | Sessão desconectada |

Observações operacionais:

- O WAHA precisa apontar explicitamente para `POST /webhooks/whatsapp-api`
- Sem webhook configurado, o Kloel não recebe mensagens em tempo real e não responde reativamente
- O catch-up inicial depende de `session.status` e do backlog disponível via WAHA

## Configuração do Workspace

Para usar o `whatsapp-api` como provider do workspace, configure em `providerSettings`:

```json
{
  "whatsappProvider": "whatsapp-api"
}
```

### Providers Disponíveis

| Provider | Descrição |
|----------|-----------|
| `whatsapp-api` | **RECOMENDADO** - WAHA (WhatsApp HTTP API) |
| `wpp` | WPPConnect (legado) |
| `meta` | Meta Cloud API (oficial, requer aprovação) |
| `evolution` | Evolution API |
| `auto` | Seleção automática baseada em disponibilidade |

## Arquivos Criados/Modificados

### Backend

```
backend/src/whatsapp/
├── providers/
│   ├── whatsapp-api.provider.ts       # Provider REST client
│   └── provider-registry.ts           # Registry unificado
├── controllers/
│   └── whatsapp-api.controller.ts     # Endpoints de sessão
└── whatsapp.module.ts                 # Módulo atualizado

backend/src/webhooks/
└── whatsapp-api-webhook.controller.ts # Receptor de webhooks
```

### Worker

```
worker/providers/
├── whatsapp-api-provider.ts           # Provider para jobs
└── whatsapp-engine.ts                 # Engine atualizado
```

### Docker

```
docker-compose.yml                     # Serviço whatsapp-api adicionado
.env.example                           # Variáveis documentadas
```

## Troubleshooting

### QR Code não aparece

1. Verifique se a WAHA está acessível em `WAHA_API_URL`
2. Verifique `GET /whatsapp-api/health` e `GET /health/system`
3. Certifique-se de chamar `POST /session/start` antes de pedir o QR
4. Confirme `WAHA_MULTISESSION=true` e `WAHA_USE_WORKSPACE_SESSION=true` em ambiente multi-tenant

### Mensagem não enviada

1. Verifique status da sessão: `GET /session/status`
2. Confirme que está conectado (status: `CONNECTED`)
3. Verifique logs do worker: `docker-compose logs worker`

### Webhook não chega

1. Verifique `WHATSAPP_HOOK_URL` e `WHATSAPP_HOOK_EVENTS` na WAHA
2. Confirme que `WHATSAPP_API_WEBHOOK_SECRET` bate com o header enviado pela WAHA
3. Teste conectividade: `curl https://seu-backend/health/system`
4. Verifique se a sessão da WAHA usa o mesmo `sessionId` esperado pelo workspace

## Referências

- [WAHA (WhatsApp HTTP API)](https://waha.devlike.pro/)
- [NestJS](https://nestjs.com/)
