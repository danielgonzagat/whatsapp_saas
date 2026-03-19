# 🚀 KLOEL - WhatsApp Omni IA Full Agent SaaS

> **STATUS: RELEASE CANDIDATE 1.0.0-rc1** (Ready for Production)

> **A primeira plataforma autônoma de negócios do mundo** - Uma IA que entende, planeja, cria, executa, opera, conversa, gerencia, otimiza, aprende e muda o próprio comportamento. Multicanal.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com)

---

## 🏆 MOEDAS DE OURO - Diferenciais Únicos

### 🟦 MOEDA DE OURO #1 — Flow Engine Universal conectado à IA

Nenhuma empresa do mundo tem um motor de fluxos:

- ✅ **100% dinâmico** - Fluxos criados e modificados em tempo real
- ✅ **Tolerante a falhas** - Retries automáticos, watchdog, circuit breaker
- ✅ **WAIT nodes reais** - Pausas inteligentes com persistência
- ✅ **Nós de IA dentro do fluxo** - GPT-4o com RAG e tool calling
- ✅ **Sub-fluxos** - Composição modular de automações
- ✅ **Timeouts, retries, watchdog** - Resiliência enterprise
- ✅ **Fluxo unificado WhatsApp → Email → Instagram** - Omnichannel real
- ✅ **Entrega via filas e workers independentes** - Escalabilidade horizontal

### 🟦 MOEDA DE OURO #2 — IA com Tool-Calling Interno (KIA Layer)

A IA é literalmente o **ADMINISTRADOR do SaaS**:

- ✅ Cria flows automaticamente
- ✅ Cria e gerencia produtos
- ✅ Cria campanhas de marketing
- ✅ Atualiza configurações
- ✅ Gerencia o CRM completo
- ✅ Salva memórias e aprende
- ✅ Controla o workspace
- ✅ Altera seu próprio comportamento
- ✅ Ativa/desativa o autopilot
- ✅ Negocia preços e aplica descontos
- ✅ Gera links de pagamento

### 🟦 MOEDA DE OURO #3 — Onboarding Conversacional com Tool-Calling Real

**Auto-SaaS Generation** - O usuário conversa, e a IA CONSTRÓI o SaaS:

- ✅ Sem formulários
- ✅ Sem painéis complexos
- ✅ Sem tutoriais
- ✅ Sem desenvolvedores

A IA automaticamente:
- Cria o workspace
- Define branding
- Monta funis de vendas
- Cadastra produtos
- Conecta canais
- Configura horários
- Define tom de voz
- Ajusta automações

### 🟦 MOEDA DE OURO #4 — Arquitetura Omnichannel REAL

Um **cérebro unificado** que pensa em múltiplos canais como "superfícies de comunicação":

- ✅ **Message Normalization Layer** - Formato único para todas as plataformas
- ✅ **Unified Inbox** - Todas as conversas em um lugar
- ✅ **Universal Channel Interface** - Adaptadores plugáveis
- ✅ **Estrutura pronta** para Instagram, Email, Telegram, SMS, TikTok
- ✅ **Workers independentes** - Processamento distribuído
- ✅ **Flow Engine compartilhado** entre canais

**A IA decide o canal ideal para cada cliente:**
- 📱 **WhatsApp** → se urgente
- 📧 **Email** → se for conteúdo longo
- 📲 **SMS** → se lead está frio
- 📸 **Instagram** → para público jovem
- 🎙️ **Voz** → para leads quentes
- 🔔 **Push** → para recuperação

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        KLOEL SaaS Platform                       │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 16)          │  Backend (NestJS)              │
│  ├── Dashboard                  │  ├── KloelModule               │
│  ├── FlowBuilder               │  │   ├── UnifiedAgentService   │
│  ├── Inbox                     │  │   ├── SkillEngineService    │
│  ├── Onboarding Chat           │  │   ├── SmartPaymentService   │
│  └── Analytics                 │  │   ├── AudioService          │
│                                 │  │   └── MemoryService         │
│                                 │  ├── AuthModule                │
│                                 │  ├── FlowsModule               │
│                                 │  ├── AutopilotModule           │
│                                 │  └── BillingModule             │
├─────────────────────────────────────────────────────────────────┤
│                        Worker (BullMQ)                           │
│  ├── autopilot-processor      (AI decision making)              │
│  ├── flow-engine-global       (Flow execution)                  │
│  ├── campaign-processor       (Mass messaging)                  │
│  ├── media-processor          (Images, PDFs)                    │
│  └── voice-processor          (TTS via ElevenLabs)              │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure                                                  │
│  ├── PostgreSQL (Prisma ORM)                                    │
│  ├── Redis (BullMQ queues)                                      │
│  ├── WhatsApp (WAHA Plus)                                       │
│  └── OpenAI (GPT-4o, Whisper, TTS)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 21+
- PostgreSQL 15+
- Redis 7+
- Docker (opcional)

### 1. Clone o repositório

```bash
git clone https://github.com/danielgonzagat/whatsapp_saas.git
cd whatsapp_saas
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

**Variáveis obrigatórias:**

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/kloel

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=sua-chave-secreta-muito-segura-aqui

# OpenAI
OPENAI_API_KEY=sk-...

# WhatsApp (WAHA Plus)
WAHA_API_URL=https://seu-waha.up.railway.app
WAHA_API_KEY=your-waha-api-key
WAHA_MULTISESSION=true
WAHA_USE_WORKSPACE_SESSION=true

# Google Sign-In (GIS)
# Frontend:
NEXT_PUBLIC_GOOGLE_CLIENT_ID=seu-google-web-client-id.apps.googleusercontent.com
# Backend:
GOOGLE_CLIENT_ID=seu-google-web-client-id.apps.googleusercontent.com
# Opcional para preview/local + produção:
GOOGLE_ALLOWED_CLIENT_IDS=
```

### 3. Instale as dependências

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy

# Frontend
cd ../frontend
npm install

# Worker
cd ../worker
npm install
```

### 4. Inicie os serviços

```bash
# Terminal 1 - Backend
cd backend && npm run start:dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Terminal 3 - Worker
cd worker && npm run dev
```

### 5. Acesse

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001
- **Swagger:** http://localhost:3001/api

---

## ✅ Checklist de Produção (Auth + WhatsApp)

- `NEXTAUTH_URL` / `AUTH_URL`: base do frontend (NÃO incluir `/auth` ou `/api/auth`).
- `BACKEND_URL`: URL do backend usada server-side pelo frontend para chamar `POST /auth/oauth/google`.
- `NEXT_PUBLIC_API_URL`: URL pública do backend NestJS usada pelo frontend.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: obrigatório no projeto do frontend/Vercel para renderizar o botão Google.
- `GOOGLE_CLIENT_ID` ou `GOOGLE_ALLOWED_CLIENT_IDS`: obrigatório no runtime do backend para validar o ID token recebido do Google.
- Se usar preview/local + produção com client IDs diferentes, preencha `GOOGLE_ALLOWED_CLIENT_IDS` com CSV.
- `GOOGLE_CLIENT_SECRET`: opcional para o login GIS; mantenha apenas se você também usa integrações OAuth com segredo.
- Apple (OAuth): Callback URL deve ser `${NEXTAUTH_URL}/api/auth/callback/apple`.
- Migrations: backend executa `npx prisma migrate deploy` automaticamente no startup (produção).
- Redis/RateLimit: configure `REDIS_URL` em produção (rate limit distribuído + filas). Se Redis cair, auth usa fallback local (por processo) e loga WARN.
- Pós-login é sempre `/` (ChatContainer). Rotas legado como `/dashboard` redirecionam para `/`.
- WAHA Plus:
  - `WAHA_API_URL` deve apontar para a instância WAHA pública.
  - `WAHA_API_KEY` deve bater exatamente com a configurada no WAHA.
  - `WAHA_MULTISESSION=true` e `WAHA_USE_WORKSPACE_SESSION=true` são obrigatórios para um SaaS multi-tenant.
  - Cada workspace usa o próprio `workspaceId` como nome de sessão WAHA.

---

## 🐳 Docker Compose

```bash
# Desenvolvimento
docker-compose up -d

# Produção
docker-compose -f docker-compose.prod.yml up -d
```

---

## 📦 Deploy

### Railway

1. Conecte o repositório ao Railway
2. Configure as variáveis de ambiente:
   - `DATABASE_URL` (PostgreSQL)
   - `REDIS_URL` (Redis)
   - `JWT_SECRET`
   - `OPENAI_API_KEY`
   - `WAHA_API_URL`
   - `WAHA_API_KEY`
   - `WAHA_MULTISESSION=true`
   - `WAHA_USE_WORKSPACE_SESSION=true`
3. Deploy automático a cada push

### Vercel (Frontend)

1. Importe o projeto no Vercel
2. Configure:
   - Root Directory: `frontend`
   - `NEXT_PUBLIC_API_URL`
3. Deploy automático

---

## 🔧 Módulos Principais

### UnifiedAgentService (IA com Tool Calling)

```typescript
// Processa mensagem com IA autônoma
const result = await unifiedAgent.processMessage({
  workspaceId: 'ws-123',
  phone: '+5511999999999',
  message: 'Quero comprar o produto X',
});

// result.actions contém as ações executadas automaticamente:
// - send_product_info
// - create_payment_link
// - schedule_followup
```

### FlowEngine (Motor de Fluxos)

```typescript
// Tipos de nós disponíveis:
// - START, END, MESSAGE, DELAY
// - CONDITION, AI, ACTION, INPUT
// - SUBFLOW, WEBHOOK, CRM
// - VOICE, EMAIL, SMS
```

### SmartPaymentService (Pagamentos com IA)

```typescript
// Cria pagamento com mensagem personalizada pela IA
const payment = await smartPayment.createSmartPayment({
  workspaceId: 'ws-123',
  phone: '+5511999999999',
  customerName: 'João',
  amount: 99.90,
  productName: 'Plano Pro',
});

// Negocia desconto usando IA
const negotiation = await smartPayment.negotiatePayment({
  originalAmount: 100,
  customerMessage: 'Tá caro, consegue um desconto?',
});
```

### AudioService (Voz com Whisper/TTS)

```typescript
// Transcreve áudio
const text = await audioService.transcribeAudio(audioBuffer);

// Gera áudio de resposta
const audio = await audioService.synthesizeSpeech('Olá!', 'nova', 1.0);
```

---

## 📊 Endpoints de Diagnóstico

- `GET /diag` - Health check básico
- `GET /diag/full` - Diagnóstico completo do sistema
- `GET /diag/workspace/:id` - Diagnóstico por workspace
- `GET /diag/metrics` - Métricas no formato Prometheus
- `GET /diag/errors` - Últimos erros do sistema

---

## 🌐 API - Rotas Públicas vs Autenticadas

### Rotas Públicas (sem autenticação)

| Método | Endpoint | Descrição | Rate Limit |
|--------|----------|-----------|------------|
| `POST` | `/auth/login` | Login (email/senha) | 5/5min (por IP + email) |
| `POST` | `/auth/register` | Cadastro | 5/5min (por IP) |
| `POST` | `/auth/oauth` | OAuth sync (NextAuth) | 5/5min (por IP) |
| `POST` | `/auth/forgot-password` | Recuperação de senha | 3/1min (por IP) |
| `POST` | `/auth/verify-email` | Verificação de email | 10/1min (por IP) |
| `POST` | `/chat/guest` | Chat SSE para visitantes | 10/min |
| `POST` | `/chat/guest/sync` | Chat síncrono para visitantes | 10/min |
| `GET` | `/chat/guest/session` | Gerar sessão de visitante | 100/min |
| `GET` | `/chat/guest/health` | Health check do guest chat | 100/min |
| `POST` | `/kloel/onboarding/:workspaceId/start` | Iniciar onboarding | 100/min |
| `POST` | `/kloel/onboarding/:workspaceId/chat` | Chat de onboarding | 100/min |
| `GET` | `/kloel/onboarding/:workspaceId/status` | Status do onboarding | 100/min |
| `POST` | `/webhooks/whatsapp/*` | Webhooks WhatsApp | ∞ |
| `POST` | `/webhooks/stripe` | Webhooks Stripe | ∞ |
| `GET` | `/health` | Health check global | ∞ |
| `GET` | `/diag/*` | Diagnósticos | 100/min |

> Observação: em produção, configure `REDIS_URL` para rate limit distribuído. Se Redis estiver indisponível, auth usa fallback local (por processo) e loga WARN.

### Rotas Autenticadas (requer JWT)

| Método | Endpoint | Descrição | Roles |
|--------|----------|-----------|-------|
| `*` | `/kloel/*` | API principal KLOEL | ADMIN, AGENT |
| `*` | `/autopilot/*` | Configuração do Autopilot | ADMIN |
| `*` | `/flows/*` | Gerenciamento de fluxos | ADMIN |
| `*` | `/crm/*` | CRM e contatos | ADMIN, AGENT |
| `*` | `/campaigns/*` | Campanhas de marketing | ADMIN |
| `*` | `/voice/*` | Perfis de voz e TTS | ADMIN, AGENT |
| `*` | `/billing/*` | Faturamento e assinatura | ADMIN |
| `*` | `/analytics/*` | Métricas e relatórios | ADMIN, AGENT |

### Headers de Autenticação

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-Workspace-Id: <workspace_uuid> (opcional, sobrescreve JWT)
```

---

## 🔒 Segurança

- **JWT Authentication** com refresh tokens
- **Rate Limiting** por workspace e IP
- **Audit Logging** de todas as operações
- **Workspace Access Guard** - Verificação de membership
- **Sensitive Operation Guard** - Confirmação para ações críticas
- **Prisma P2021 Handler** - Mensagens claras quando DB não inicializado

---

## 📚 Documentação Adicional

- [README_AUTOPILOT.md](./README_AUTOPILOT.md) - Sistema de Autopilot
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Status de implementação
- [GLOBAL_TOP_1_AUDIT.md](./GLOBAL_TOP_1_AUDIT.md) - Auditoria completa

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/amazing`)
3. Commit suas mudanças (`git commit -m 'Add amazing feature'`)
4. Push para a branch (`git push origin feature/amazing`)
5. Abra um Pull Request

---

## 📄 Licença

Proprietário - © 2025 KLOEL. Todos os direitos reservados.

---

## 🌟 O que torna KLOEL único

> **Isso não é um chatbot.** 
> **Não é automação.**
> **Não é CRM.**
> **Não é plataforma de marketing.**
> **Não é ferramenta de WhatsApp.**
> **Não é IA assistente.**

É uma **PLATAFORMA AUTÔNOMA DE NEGÓCIOS** - uma nova espécie de software.

A IA KLOEL é um agente que:
- 🧠 **Entende** o contexto e a intenção
- 📋 **Planeja** as melhores ações
- 🏗️ **Cria** fluxos, campanhas, produtos
- ⚡ **Executa** ações em múltiplos canais
- 🔄 **Opera** 24/7 de forma autônoma
- 💬 **Conversa** naturalmente com clientes
- 📊 **Gerencia** CRM, vendas, atendimento
- 📈 **Otimiza** baseado em resultados
- 📚 **Aprende** com cada interação
- 🔧 **Muda o próprio comportamento** para melhorar

E faz tudo isso de forma **multicanal**, escolhendo automaticamente o melhor canal para cada cliente e situação.
