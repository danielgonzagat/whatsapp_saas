# 🚀 CHECKLIST DE LANÇAMENTO - KLOEL WhatsApp SaaS MVP

**Data de Criação:** Junho 2025  
**Versão:** MVP 1.0  
**Status:** ✅ Pronto para Deploy

---

## 📋 Visão Geral

Este documento consolida todos os passos necessários para lançar o MVP do KLOEL
WhatsApp SaaS em produção.

### Arquitetura Final

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │   Flow Builder  │     │     Backend     │
│  (Next.js 16)   │     │  (React Admin)  │     │    (NestJS)     │
│   Port: 3000    │     │  Port: (opcional)│     │   Port: 3001    │
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
│   PostgreSQL    │     │      Redis      │     │      WAHA       │
│   + pgvector    │     │       7.4       │     │ (serviço externo│
│   Port: 5432    │     │   Port: 6379    │     │ ou self-hosted) │
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

## ✅ ETAPA 1: Frontend (Next.js)

### Status: WAHA-ONLY ✅

| Item                     | Status | Observação               |
| ------------------------ | ------ | ------------------------ |
| TypeScript 5.7.2         | ✅     | Atualizado de 5.6.3      |
| Build sem erros          | ✅     | `npm run build` passa    |
| subscriptionStatus types | ✅     | Adicionado "suspended"   |
| Prop naming fixes        | ✅     | onUpdate → onPlansChange |
| Turbopack configurado    | ✅     | turbopack.root definido  |
| Docker image             | ✅     | Imagem construída        |

### Comandos de Verificação

```bash
cd frontend
npm install
npm run build
npm run dev  # Porta 3000
```

---

## ✅ ETAPA 2: Autenticação

### Status: COMPLETO ✅

| Item           | Status | Observação                                               |
| -------------- | ------ | -------------------------------------------------------- |
| Email/Password | ✅     | JWT + refresh token                                      |
| Google OAuth   | ✅     | Popup flow implementado                                  |
| Apple Sign-In  | ✅     | NextAuth provider (requer credenciais Apple em produção) |
| Magic Link     | 🟡     | Backend pronto, email service necessário                 |
| Refresh Token  | ✅     | Rotação automática                                       |

### Configuração Google OAuth

1. **Console Google Cloud:**
   - Criar projeto ou usar existente
   - Ativar "Google Sign-In API"
   - Configurar OAuth consent screen
   - Criar credenciais OAuth 2.0

2. **Variáveis de Ambiente (produção):**

```env
# Frontend (NextAuth)
# IMPORTANTE: NEXTAUTH_URL/AUTH_URL deve ser a BASE do frontend.
# NÃO inclua "/auth" ou "/api/auth".
NEXTAUTH_URL=https://seu-dominio.com
# AUTH_URL=https://seu-dominio.com
NEXTAUTH_SECRET=change-me

# Backend URL usada server-side pelo NextAuth para chamar POST /auth/oauth
BACKEND_URL=https://api.seu-dominio.com

# OAuth Providers
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
```

1. **Redirect URI (Google Console):**

- `${NEXTAUTH_URL}/api/auth/callback/google`

### Fluxo de Autenticação

```
Usuário → /login → NextAuth (Google/Apple)
       ↓
  /api/auth/callback/{provider}
       ↓
     signIn callback (server) chama backend:
     POST {BACKEND_URL}/auth/oauth { provider, providerId, email, name }
       ↓
    Backend retorna JWT + refresh
       ↓
  Pós-login padronizado: /
```

### Migrations (produção)

- O backend executa `npx prisma migrate deploy` automaticamente no startup.
- Se o schema/migrations não estiverem prontos, endpoints de auth retornam `503`
  com mensagem clara.

### Redis / RateLimit (produção)

- Configure `REDIS_URL` (recomendado): rate limit distribuído + filas/queues.
- Se Redis estiver indisponível, auth usa fallback local (por processo) e loga
  WARN (não quebra login, evita abuso óbvio).

---

## ✅ ETAPA 3: WhatsApp API

### Status: COMPLETO ✅

| Item                | Status | Observação                         |
| ------------------- | ------ | ---------------------------------- |
| QR Code generation  | ✅     | Via WAHA                           |
| Status check        | ✅     | Snapshot + provider registry       |
| Send text message   | ✅     | Via `/whatsapp-api/send/:phone`    |
| Send media          | ✅     | Suporta imagens, áudio, documentos |
| Webhook receive     | ✅     | `/webhooks/whatsapp-api`           |
| Logout/reset sessão | ✅     | `/whatsapp-api/session/logout`     |
| Health consolidado  | ✅     | `/health/system` e `/health/ready` |

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
WAHA_API_URL=https://seu-waha.up.railway.app
WAHA_API_KEY=your-waha-api-key
WHATSAPP_HOOK_URL=https://seu-backend.up.railway.app/webhooks/whatsapp-api
WHATSAPP_HOOK_EVENTS=session.status,message,message.any,message.ack
WHATSAPP_API_WEBHOOK_SECRET=change-me
WORKER_HEALTH_URL=http://worker:3003/health
WORKER_METRICS_TOKEN=change-me
```

---

## ✅ ETAPA 4: Stripe/Billing

### Status: COMPLETO ✅

| Item               | Status | Observação                             |
| ------------------ | ------ | -------------------------------------- |
| Subscription check | ✅     | GET /billing/subscription?workspaceId= |
| Checkout session   | ✅     | POST /billing/checkout                 |
| Webhook handler    | ✅     | POST /billing/webhook                  |
| Status mapping     | ✅     | mapSubscriptionStatus()                |
| Plans display      | ✅     | Componente PricingPlans                |

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

1. **Eventos Stripe (webhook):**
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

---

## ✅ ETAPA 5: Docker/Deploy

### Status: COMPLETO ✅

| Item                    | Status | Observação                                                     |
| ----------------------- | ------ | -------------------------------------------------------------- |
| docker-compose.prod.yml | ✅     | Todos os serviços configurados                                 |
| frontend service        | ✅     | Next.js (porta 3000 na rede interna; exposto via NGINX 80/443) |
| nginx config            | ✅     | Proxy reverso configurado                                      |
| SSL template            | ✅     | Certbot + Let's Encrypt                                        |

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

### Readiness operacional (Produção)

- `GET /health` -> liveness simples do backend
- `GET /health/system` -> banco + Redis + WAHA + worker + config crítica
- `GET /health/ready` -> alias para readiness
- `GET /whatsapp-api/health` -> reachability da WAHA
- `GET http://worker:3003/health` -> health do worker

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

| Item              | Status | Observação             |
| ----------------- | ------ | ---------------------- |
| Frontend V2 build | ✅     | Docker image criada    |
| Backend build     | ✅     | Compila sem erros      |
| Worker build      | ✅     | Compila sem erros      |
| E2E tests         | 🟡     | Playwright configurado |

### Comandos de Teste

```bash
# Backend unit tests
cd backend && npm test

# E2E tests (requer stack rodando)
cd e2e && npm test

# Smoke tests
./scripts/smoke_all.sh
```

### Gate final (Go-Live) — executado em 2025-12-16

- `npm --prefix /workspaces/whatsapp_saas/backend test` → **PASS** (19/19
  suites, 106/106 tests)
- `npm --prefix /workspaces/whatsapp_saas/backend run test:e2e` → **PASS**
  (10/10 suites; 22 passed; 1 skipped já era do suite)
- `npm --prefix /workspaces/whatsapp_saas/frontend run build` → **SUCESSO**
- `npm --prefix /workspaces/whatsapp_saas/frontend run lint` → **SUCESSO**

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

# WhatsApp (WAHA)
WAHA_API_URL=https://devlikeaprowaha-production-19f9.up.railway.app
WAHA_API_KEY=your-waha-api-key

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

### Frontend (Next.js) (.env.local)

```env
# API base (client-side)
NEXT_PUBLIC_API_URL=https://api.kloel.com

# NextAuth (server-side)
# IMPORTANTE: NEXTAUTH_URL/AUTH_URL deve ser a BASE do frontend.
# NÃO inclua "/auth" ou "/api/auth".
NEXTAUTH_URL=https://app.kloel.com
NEXTAUTH_SECRET=change-me

# Backend URL usada server-side pelo NextAuth para chamar POST /auth/oauth
# Em docker-compose.prod.yml, a URL interna costuma ser: http://backend:3001
BACKEND_URL=https://api.kloel.com

# OAuth Providers (NextAuth)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=

# Stripe publishable key (se aplicável ao Pricing/Checkout no frontend)
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
- [ ] Migrations: confirmar estratégia (automática no startup) e/ou rodar
      `npx prisma migrate deploy` como passo controlado

### Deploy

```bash
# 1. Pull latest
git pull origin main

# 2. Build images
docker compose -f docker-compose.prod.yml build

# 3. Migrations (recomendado em rollout controlado)
# Observação: o backend também executa migrations automaticamente no startup.
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 4. Start services
docker compose -f docker-compose.prod.yml up -d

# 5. Verify health
curl https://api.kloel.com/health
curl https://app.kloel.com
```

---

## 🧾 Go-Live (Runbook Operacional)

### 1) Pré-voo (DNS/SSL)

- DNS: apontar o domínio de produção para o endpoint do NGINX/load balancer
  (ex.: `app.kloel.com` e `api.kloel.com` ).
- SSL: confirmar certificado válido (cadeia completa) e renovação automática via
  certbot (se aplicável).

### 2) OAuth (Google/Apple) — validação obrigatória

- Google Console → OAuth → Redirect URI:
  - `${NEXTAUTH_URL}/api/auth/callback/google`
- Apple Sign-In → Callback:
  - `${NEXTAUTH_URL}/api/auth/callback/apple`
- Validar `NEXTAUTH_URL` / `AUTH_URL` como **base** do frontend (sem `/auth` e
  sem `/api/auth` ).

### 3) Fluxos críticos (smoke manual)

- Login com email/senha.
- Cadastro + login.
- Login com Google.
- (Se habilitado) login com Apple.
- Confirmar pós-login padronizado em `/`.

### 4) Segurança / Rate limit

- Confirmar que endpoints de auth retornam **429** após excesso de tentativas.
- Em produção multi-instância: garantir `REDIS_URL` configurado (rate limit
  distribuído + filas).

### 5) Prisma/Migrations

- Confirmar que o backend sobe e executa `npx prisma migrate deploy` no primeiro
  deploy.
- Se houver falha de schema/migrations, endpoints de auth devem retornar **503**
  com mensagem clara (não erro genérico).

---

## 📈 Observabilidade (Logs/Métricas) — Operação

### Logs

- Backend: logs estruturados de request (inclui `requestId` ) e logs de erro com
  severidade adequada (4xx como warn/info; 5xx como error).
- Auth: observar warnings de fallback de rate limit (Redis indisponível) e erros
  OAuth com `errorId` para rastreio.

### Métricas

- Backend: `/metrics` (Prometheus) — manter protegido por token/segurança
  conforme configuração do ambiente.
- Filas/Jobs: Bull Board em `/admin/queues`.

### Alertas recomendados (sem mudança de código)

- Alertar em picos de **5xx** em rotas `/auth/*`.
- Alertar em aumento de **429** (possível abuso/ataque) e/ou queda de
  autenticação OAuth.
- Alertar em falhas de migrations (logs de startup e/ou health checks).

---

## 🧯 Plano de Rollback (Operação)

- Reverter para a imagem/tag anterior (backend/worker/frontend) e reiniciar o
  stack.
- Se houver alteração de schema:
  - **não** executar rollback automático de migrations sem validação; preferir
    restore de backup.
- Banco de dados:
  - garantir backup recente antes do Go-Live;
  - em incidentes críticos, restaurar backup + retornar versão anterior.

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

### Problema: "Failed to fetch" no Chat Guest

**Causa:** Variável `NEXT_PUBLIC_API_URL` não configurada no Vercel.

### Solução

1. Acesse Vercel → Projeto frontend → Settings → Environment Variables
2. Adicione ou edite:

   ```
   NEXT_PUBLIC_API_URL = https://whatsappsaas-production-fc69.up.railway.app
   ```

   (SEM barra no final)

3. Marque para `Production`, `Preview` e `Development`
4. Redeploy o frontend (Deployments → Redeploy)

### Verificação de CORS no backend

```bash
# Testar preflight
curl -sI -X OPTIONS \
  -H "Origin: https://kloel.com" \
  -H "Access-Control-Request-Method: POST" \
  https://whatsappsaas-production-fc69.up.railway.app/chat/guest

# Deve retornar 204 com headers CORS
```

### Configuração atual do backend (`main.ts`)

```typescript
app.enableCors({
  origin: [
    'https://kloel.com',
    'https://www.kloel.com',
    'https://kloel-frontend.vercel.app',
    'https://kloel.vercel.app',
    'http://localhost:3000',
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'User-Agent',
    'Cache-Control',
    'Pragma',
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
});
```

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

| Versão  | Data     | Mudanças                                    |
| ------- | -------- | ------------------------------------------- |
| MVP 1.0 | Jun 2025 | Release inicial com auth, WhatsApp, billing |

---

**Mantido por:** Time KLOEL  
**Última atualização:** Dezembro 2025
