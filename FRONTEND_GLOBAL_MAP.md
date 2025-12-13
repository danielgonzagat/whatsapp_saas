# RESET DE ESCOPO — MAPA GLOBAL (CANÔNICO)

Este documento governa a execução da **SUBSTITUIÇÃO TOTAL DE FRONT-END + EXPANSÃO FUNCIONAL + VALIDAÇÃO E2E**.

## Declaração canônica (não negociável)

- O **front-end perfeito** é a **BASE ÚNICA** do produto: referência visual, UX, entrada principal e padrão de componentes.
- O front-end “antigo/legado” existe somente como:
  - checklist histórico de funcionalidades
  - referência de fluxos já implementados
- Qualquer experiência que fuja do perfeito deve ser considerada **déficit** e será absorvida/reconstruída dentro do perfeito.

## Mapa A — Backend real (capacidades por domínio)

Fonte principal: controllers em `backend/src/**`.

### Identidade, segurança e tenancy
- Auth: `auth/*`
- Workspaces: `workspace/*`
- Team/roles: `team/*`
- API Keys: `settings/api-keys/*`

### WhatsApp + provedores + webhooks
- WhatsApp core: `whatsapp/*`
- WhatsApp API: `whatsapp-api/*`
- Webhooks:
  - `webhooks/whatsapp-api/*`
  - `webhooks/asaas/*`
  - `webhook/payment/*`
  - `hooks/*` (geral)
  - `settings/webhooks/*`
- KLOEL WhatsApp Brain & Connection:
  - `kloel/whatsapp/*`
  - `kloel/whatsapp/connection/*`

### Conversas / Inbox
- Inbox: `inbox/*`
- Guest chat / chat: `chat/*`

### Vendas, billing e pagamentos
- Billing: `billing/*`
- Payment methods: `billing/payment-methods/*`
- KLOEL payments/smart payment:
  - `kloel/payments/*`
  - `kloel/payment/*`
  - `kloel/external-payments/*`
  - `mercadopago/*`
  - `kloel/asaas/*`
  - `kloel/wallet/*`

### Automação (Autopilot, Follow-ups, Campanhas, Fluxos)
- Autopilot: `autopilot/*`
- Segmentation: `segmentation/*`
- Followups: `followups/*`
- Campaigns: `campaigns/*` e `campaign/*` (mass send)
- Flows:
  - `flows/*`
  - `flows/ai/*` (otimizador/IA)
  - `flow-templates/*`

### CRM, funis e growth
- CRM: `crm/*` e `crm/neuro/*`
- Funnels: `funnels/*`
- Growth: `growth/*` e `growth/money-machine/*`

### Analytics, métricas, dashboards, ops
- Analytics: `analytics/*`
- Metrics: `metrics/*`
- Dashboard: `dashboard/*`
- Ops/queues: `ops/queues/*`
- Notifications: `notifications/*`
- Audit: `audit/*`

### Conteúdo e multimídia
- Products: `products/*`
- AI Brain/Knowledge Base: `ai/*`
- Media: `media/*` e `media/video/*`
- Voice: `voice/*`
- Audio: `kloel/audio/*` (e módulo `audio/*`)
- Upload/PDF:
  - `kloel/upload/*`
  - `kloel/pdf/*`

### Outros
- Calendar: `calendar/*`
- Marketplace: `marketplace/*`
- Scrapers: `scrapers/*`
- Pipeline: `pipeline/*`
- Launch: `launch/*`
- Diag: `diag/*`
- Copilot: `copilot/*`
- Public API: `api/v1/*`

## Mapa B — Front-end perfeito (o que existe de fato)

Fonte: `frontend/frontend_perfeito/**` (v0) e a versão integrada em `frontend/src/components/kloel/**`.

### Entrypoint & experiência canônica
- Página principal chat-first com `ChatContainer`.
- Autenticação via modal; onboarding; paywall/trial; conexão WhatsApp por QR.

### Configurações dentro do perfeito
- `SettingsDrawer` com abas atuais:
  - Conta
  - Faturamento
  - “Configurar Kloel” (Brain)
  - Atividade

### O que já está “produto” dentro do perfeito (confirmado no código)
- Chat guest (SSE) e chat autenticado.
- Deep-link para abrir Settings/Billing sem sair do perfeito.
- Checagem de status do WhatsApp e fluxo de conexão.
- Leitura de métodos de pagamento e estado de assinatura.

## Mapa C — Lacunas (backend real que não está plenamente exposto no perfeito)

### Lacunas críticas (core do produto)
- Inbox real (lista de conversas, timeline, handover, ações por conversa).
- CRM completo (contatos/leads, scoring, sentimento, ações neuro).
- Flows (criar, editar, templates, executar, monitorar, timeout/WAIT).
- Campaigns (criar, agendar, smart time, resultados).
- Autopilot (config, segmentação, limites, métricas, controle/pausa/retomada).

### Lacunas operacionais (precisa existir para produção)
- Gestão de provedores WhatsApp e conexão (multi-provider) + troubleshooting.
- Webhooks settings + verificação (Asaas, WhatsApp API, payment).
- API Keys e Public API (geração, rotação, permissões).
- Ops/Queues (health do worker, filas, DLQ, reprocess).
- Audit/Logs (visibilidade e trilha).

### Lacunas de conteúdo e multimídia
- Uploads, PDFs e base de conhecimento (visibilidade, ingestão, status, fontes).
- Media/Voice/Audio (upload/transcrição/armazenamento/status).

### Lacunas de gestão
- Workspaces / Team (usuários, permissões, convites).
- Marketplace / Growth / Scrapers / Pipeline (se forem vendáveis, precisam de UI mínima).

## Próximo passo (governado por lacunas, não por páginas)

1) Escolher o **primeiro “fluxo de valor completo” E2E** para tornar 100% operável no perfeito.
   - Sugestão inicial (mais vendável):
     - Onboarding → Conectar WhatsApp → Ensinar produtos/KB → Ativar Autopilot → Ver conversas (Inbox) → Medir resultados.
2) Para esse fluxo, definir:
   - endpoints do backend envolvidos
   - superfícies de UI dentro do perfeito (onde isso vive: drawer, console, telas internas do perfeito)
   - critérios E2E de aceite

> Nota: qualquer UI fora do perfeito é déficit; o plano é absorver/reconstruir.
