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
WAHA_API_URL=https://devlikeaprowaha-production-19f9.up.railway.app

# API Key para autenticação (header X-Api-Key)
WAHA_API_KEY=your-waha-api-key
```

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

1. Verifique se o container está rodando: `docker-compose ps`
2. Verifique logs: `docker-compose logs whatsapp-api`
3. Certifique-se de chamar `POST /session/start` antes de pedir o QR

### Mensagem não enviada

1. Verifique status da sessão: `GET /session/status`
2. Confirme que está conectado (status: `CONNECTED`)
3. Verifique logs do worker: `docker-compose logs worker`

### Webhook não chega

1. Verifique `BASE_WEBHOOK_URL` no container
2. Confirme que o backend está acessível pelo container
3. Teste conectividade: `docker-compose exec whatsapp-api curl http://backend:3001/health`

## Referências

- [WAHA (WhatsApp HTTP API)](https://waha.devlike.pro/)
- [NestJS](https://nestjs.com/)
