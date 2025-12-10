# 🚀 CHECKLIST DE LANÇAMENTO - KLOEL WhatsApp SaaS MVP

**Data de Criação:** Junho 2025  
**Versão:** MVP 1.0  
**Status:** ✅ Pronto para Deploy

---

## 📋 Visão Geral

Este documento consolida todos os passos necessários para lançar o MVP do KLOEL WhatsApp SaaS em produção.

### Arquitetura Final

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend V2   │     │   Flow Builder  │     │     Backend     │
│  (Next.js 16)   │     │  (React Admin)  │     │    (NestJS)     │
│   Port: 3005    │     │   Port: 3000    │     │   Port: 3001    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │         NGINX           │
                    │     (Reverse Proxy)     │
                    │      Port: 80/443       │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
│   PostgreSQL    │     │      Redis      │     │  WhatsApp API   │
│   + pgvector    │     │       7.4       │     │  (WPPConnect)   │
│   Port: 5432    │     │   Port: 6379    │     │   Port: 3030    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │        Worker           │
                    │  (BullMQ Processors)    │
                    │   - Flow Engine         │
                    │   - Autopilot           │
                    │   - Campaigns           │
                    └─────────────────────────┘
```

---

## ✅ ETAPA 1: Frontend V2

### Status: COMPLETO ✅

| Item | Status | Observação |
|------|--------|------------|
| TypeScript 5.7.2 | ✅ | Atualizado de 5.6.3 |
| Build sem erros | ✅ | `pnpm build` passa |
| subscriptionStatus types | ✅ | Adicionado "suspended" |
| Prop naming fixes | ✅ | onUpdate → onPlansChange |
| Turbopack configurado | ✅ | turbopack.root definido |
| Docker image | ✅ | Imagem construída |

### Comandos de Verificação
```bash
cd frontend_v2
pnpm install
pnpm build
pnpm dev  # Porta 3005
```

---

## ✅ ETAPA 2: Autenticação

### Status: COMPLETO ✅

| Item | Status | Observação |
|------|--------|------------|
| Email/Password | ✅ | JWT + refresh token |
| Google OAuth | ✅ | Popup flow implementado |
| Apple Sign-In | 🟡 | Backend pronto, frontend precisa Apple JS SDK |
| Magic Link | 🟡 | Backend pronto, email service necessário |
| Refresh Token | ✅ | Rotação automática |

### Configuração Google OAuth

1. **Console Google Cloud:**
   - Criar projeto ou usar existente
   - Ativar "Google Sign-In API"
   - Configurar OAuth consent screen
   - Criar credenciais OAuth 2.0

2. **Variáveis de Ambiente:**
```env
# Backend
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Frontend
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

3. **URLs Autorizadas (Google Console):**
   - `http://localhost:3005` (dev)
   - `https://app.kloel.com` (produção)

### Fluxo de Autenticação

```
Usuario → Login Page → Google Button → Popup OAuth
                                           ↓
                              Google Consent Screen
                                           ↓
                              Callback com código
                                           ↓
POST /auth/oauth/login ← { provider: 'google', code: 'xxx' }
                                           ↓
                              JWT + Refresh Token
                                           ↓
                              AuthContext.login()
```

---

## ✅ ETAPA 3: WhatsApp API

### Status: COMPLETO ✅

| Item | Status | Observação |
|------|--------|------------|
| QR Code generation | ✅ | Atualização a cada 30s |
| Status check | ✅ | `state === 'CONNECTED'` |
| Send text message | ✅ | Via /whatsapp-api/send-message |
| Send media | ✅ | Suporta imagens, áudio, documentos |
| Webhook receive | ✅ | Mensagens recebidas processadas |

### Formato de Status

```typescript
// Resposta do endpoint /whatsapp-api/session/:sessionId/status
{
  state: 'CONNECTED' | 'DISCONNECTED' | 'OPENING' | 'PAIRING' | 'TIMEOUT',
  // NÃO usar: connected: boolean (formato antigo)
}
```

### Variáveis de Ambiente

```env
# Backend
WHATSAPP_API_URL=http://whatsapp-api:3030
WHATSAPP_API_KEY=your-secure-key
WHATSAPP_SESSION_WEBHOOK_URL=http://backend:3001/webhooks/whatsapp
```

---

## ✅ ETAPA 4: Stripe/Billing

### Status: COMPLETO ✅

| Item | Status | Observação |
|------|--------|------------|
| Subscription check | ✅ | GET /billing/subscription?workspaceId= |
| Checkout session | ✅ | POST /billing/checkout |
| Webhook handler | ✅ | POST /billing/webhook |
| Status mapping | ✅ | mapSubscriptionStatus() |
| Plans display | ✅ | Componente PricingPlans |

### Endpoints de Billing

```typescript
// Corretos:
GET  /billing/subscription?workspaceId=xxx
POST /billing/checkout
POST /billing/webhook  // Stripe webhook

// INCORRETOS (não usar):
// GET /billing/{workspaceId}/subscription ❌
```

### Configuração Stripe

1. **Dashboard Stripe:**
   - Criar produtos e preços
   - Configurar webhook para `/billing/webhook`
   - Copiar signing secret

2. **Variáveis de Ambiente:**
```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Preços
STRIPE_PRICE_BASIC=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx
```

3. **Eventos Stripe (webhook):**
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

---

## ✅ ETAPA 5: Docker/Deploy

### Status: COMPLETO ✅

| Item | Status | Observação |
|------|--------|------------|
| docker-compose.prod.yml | ✅ | Todos os serviços configurados |
| frontend-v2 service | ✅ | Port 3005, standalone |
| flow-builder service | ✅ | Port 3000, admin |
| nginx config | ✅ | Proxy reverso configurado |
| SSL template | ✅ | Certbot + Let's Encrypt |

### Arquivos de Configuração

```
docker-compose.prod.yml      # Produção
docker/nginx/conf.d/
  ├── app.conf              # HTTP (desenvolvimento)
  └── app.conf.ssl.template # HTTPS (produção)
```

### Comandos de Deploy

```bash
# Build todas as imagens
docker compose -f docker-compose.prod.yml build

# Iniciar em produção
docker compose -f docker-compose.prod.yml up -d

# Ver logs
docker compose -f docker-compose.prod.yml logs -f

# Reiniciar serviço específico
docker compose -f docker-compose.prod.yml restart backend
```

### Configuração SSL (Produção)

```bash
# 1. Copiar template
cp docker/nginx/conf.d/app.conf.ssl.template docker/nginx/conf.d/app.conf

# 2. Editar domínio
sed -i 's/app.kloel.com/seu-dominio.com/g' docker/nginx/conf.d/app.conf

# 3. Gerar certificados
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d seu-dominio.com -d www.seu-dominio.com

# 4. Reiniciar nginx
docker compose -f docker-compose.prod.yml restart nginx
```

---

## ✅ ETAPA 6: Testes E2E

### Status: BUILD VERIFICADO ✅

| Item | Status | Observação |
|------|--------|------------|
| Frontend V2 build | ✅ | Docker image criada |
| Backend build | ✅ | Compila sem erros |
| Worker build | ✅ | Compila sem erros |
| E2E tests | 🟡 | Playwright configurado |

### Comandos de Teste

```bash
# Backend unit tests
cd backend && npm test

# E2E tests (requer stack rodando)
cd e2e && npm test

# Smoke tests
./scripts/smoke_all.sh
```

---

## 🔧 Variáveis de Ambiente Necessárias

### Backend (.env)

```env
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/whatsapp_saas

# Auth
JWT_SECRET=sua-chave-secreta-muito-longa
JWT_REFRESH_SECRET=outra-chave-secreta
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
APPLE_CLIENT_ID=com.kloel.app
APPLE_TEAM_ID=xxx
APPLE_KEY_ID=xxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_BASIC=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx

# WhatsApp
WHATSAPP_API_URL=http://whatsapp-api:3030
WHATSAPP_API_KEY=your-api-key
WHATSAPP_SESSION_WEBHOOK_URL=http://backend:3001/webhooks/whatsapp

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# OpenAI (para KLOEL/Autopilot)
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://app.kloel.com
```

### Frontend V2 (.env.local)

```env
NEXT_PUBLIC_API_URL=https://api.kloel.com
NEXT_PUBLIC_WS_URL=wss://api.kloel.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

---

## 📊 Métricas e Monitoramento

### Prometheus Endpoints

- Backend: `http://backend:3001/metrics`
- Worker: `http://worker:9090/metrics`

### Grafana Dashboards

- Autopilot: `worker/autopilot-grafana.json`
- Queue metrics: Bull Board em `/admin/queues`

### Alertmanager

- Configuração: `docker/alertmanager/`
- Slack/Discord webhooks para alertas críticos

---

## 🚀 Checklist Final de Lançamento

### Antes do Deploy

- [ ] Todas as variáveis de ambiente configuradas
- [ ] Domínio apontando para servidor
- [ ] Certificados SSL gerados
- [ ] Stripe webhook configurado
- [ ] Google OAuth URLs autorizadas
- [ ] Backup do banco de dados
- [ ] Migrations aplicadas

### Deploy

```bash
# 1. Pull latest
git pull origin main

# 2. Build images
docker compose -f docker-compose.prod.yml build

# 3. Run migrations
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 4. Start services
docker compose -f docker-compose.prod.yml up -d

# 5. Verify health
curl https://api.kloel.com/health
curl https://app.kloel.com
```

### Após o Deploy

- [ ] Testar login com email
- [ ] Testar login com Google
- [ ] Testar conexão WhatsApp (QR)
- [ ] Enviar mensagem de teste
- [ ] Testar checkout Stripe
- [ ] Verificar webhooks funcionando
- [ ] Monitorar logs por 15 minutos

---

## 🐛 Troubleshooting

### Problema: QR Code não aparece

```bash
# Verificar status do container WhatsApp API
docker compose logs whatsapp-api

# Reiniciar sessão
curl -X POST http://localhost:3030/session/default/start
```

### Problema: OAuth Google falha

1. Verificar GOOGLE_CLIENT_ID no frontend e backend
2. Confirmar URLs autorizadas no Google Console
3. Verificar CORS no backend

### Problema: Stripe webhook 400

```bash
# Testar webhook localmente
stripe listen --forward-to localhost:3001/billing/webhook

# Verificar signing secret
echo $STRIPE_WEBHOOK_SECRET
```

### Problema: Redis connection refused

```bash
# Verificar Redis está rodando
docker compose exec redis redis-cli ping

# Verificar variáveis
echo $REDIS_HOST $REDIS_PORT
```

---

## 📝 Histórico de Releases

| Versão | Data | Mudanças |
|--------|------|----------|
| MVP 1.0 | Jun 2025 | Release inicial com auth, WhatsApp, billing |

---

**Mantido por:** Time KLOEL  
**Última atualização:** Junho 2025
