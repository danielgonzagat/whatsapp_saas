# Mapa Canônico de Domínios — Kloel (2026-06-10)

> **Origem:** derivado 100% de leitura de código-fonte (`backend/src/*`, `worker/*`, `frontend/src/components/*`) em 2026-06-10.
> **Nota:** `CANONICAL_DOMAINS.md` e `SERVICE_CATALOG.md` já existiam (sessão paralela); este artefato é a versão datada e independente — não sobrescreve os originais.
> **Método:** contagem via `find | wc`; responsabilidade lida nos `*.module.ts` / `*.service.ts` principais (não inferida pelo nome do diretório); centralidade de serviços via frequência de `import ... from '*.service'`.
> **Par:** [`SERVICE_CATALOG_2026-06-10.md`](SERVICE_CATALOG_2026-06-10.md) (catálogo dos ~35 serviços mais centrais).

---

## 1. Inventário — `backend/src/*` (78 diretórios)

Contagens: `src` = arquivos `.ts` excluindo `*.spec.ts`/`*.test.ts`; `test` = specs. Responsabilidade derivada da leitura dos módulos/serviços principais.

### 1.1 Núcleo cognitivo (Mind)

| Dir | src | test | Responsabilidade real | Domínio |
|---|---|---|---|---|
| `kloel/` | 1067 | 641 | Mega-módulo da IA comercial ("KLOEL"): reply engine, unified agent, ABI (cognitive state), capability registry v2, tool dispatcher, ~35 submódulos "Camada I–XXXIV" (trust, cash, offer, insight, wisdom, recovery, delegation, evol, legit, affil, role, agency, …), spine de eventos, e **também** controllers de vendas/site/webinar/wallet (vazamento — §4). | **Mind** (com vazamentos de Checkout/Payment/Channel) |
| `kloel/mind/` | 310 .ts | — | Substrato MIND: valência, atenção, hebbian, consolidação, beliefs (Beta-posterior), bandit/policy, percepção, CIA runtime, event spine canônico (`MindEventSpine`, ADR-0013). | Mind |
| `kloel/agent-runtime/` | 36 .ts | — | Scheduler/sessões/skills/evidence-store do agente autônomo. | Mind |
| `kloel/capability-registry-v2/` | 29 .ts | — | Fonte única de capabilities (definições, tiers, maturidade, receipts). | Mind |
| `kloel/services-v2/` | 20 .ts | — | Serviços de domínio invocados por capability (`lead`, `churn`, `nps`, `brand`, `channel`, `messaging`, `abandonment`, `agent-job`, …) via `KloelDomainServiceResolver` (ModuleRef DI). | Mind (fachada p/ domínios) |
| `kloel/spine/` | — | — | `SpineEmitterService` — spine in-process (PCI.1+B17), ring buffer 5000, emissão pós-efeito de negócio, nunca lança. | Mind |

### 1.2 Domínios de negócio

| Dir | src | test | Responsabilidade real | Domínio |
|---|---|---|---|---|
| `auth/` | 60 | 32 | Registro/login, OAuth (Apple/Google), magic-link, MFA/TOTP, partner-invite, **e-mail transacional** (`email.service.ts` — templates, Resend/SendGrid/SMTP). | Identity |
| `workspaces/` | 7 | 3 | CRUD de workspace + settings merge profundo + provider WhatsApp default; cacheado via `CacheService`. | Workspace |
| `team/` | 4 | 3 | Convites e membros do workspace (usa `EmailService` + `WorkspaceService`). | Workspace |
| `api-keys/` | 4 | 2 | Chaves de API por workspace (módulo `@Global`). | Identity |
| `admin/` | 170 | 70 | Backoffice `adm.kloel.com`: identidade admin própria, audit, permissões, sessões, transações, suporte, carteira/reconcile, mind/brain ops, destructive ops (SP-0..2). | Identity (Admin) |
| `marketing/` | 159 | 102 | **Dois domínios num dir:** (a) Marketing Command Center (email marketing, google-ads, tiktok-marketing); (b) `channels/` = transportes de canal (WhatsApp 135 arquivos, email, instagram, messenger, tiktok, internal-partnership) + `channel-message-dispatch.service.ts` (dispatch canônico OmniCore W1). | Campaign **e** Channel |
| `meta/` | 22 | 13 | Meta Platform: OAuth/embedded signup, Graph API, WhatsApp Cloud API (`meta-whatsapp.service.ts`), webhooks, ads. | Channel |
| `omnichannel/` | 4 | 2 | Hook de entrada de canal → percept p/ Mind (`channel-inbound-hook.service.ts`) + resolução de contato canônica (flag `omni-canonical-identity`). | Channel |
| `contacts/` | 5 | 3 | Identidade canônica de contato cross-canal (resolver, merge, channel-identifier). | Channel/CRM |
| `inbox/` | 11 | 6 | Inbox unificada + `omnichannel.service.ts` (normalização de mensagens inbound, attachments, smart-routing) — sobrepõe `omnichannel/` (§4). | Conversation |
| `chat/` | 5 | 3 | Persistência de conversas de chat (UI Kloel). | Conversation |
| `copilot/` | 6 | 7 | Sales copilot — HTTP + socket gateway. | Conversation |
| `campaigns/` | 6 | 5 | CRUD de campanhas WhatsApp (enfileira p/ worker). | Campaign |
| `mass-send/` | 3 | 2 | Disparo em massa WhatsApp (produz jobs). | Campaign |
| `flows/` | 18 | 10 | Definição/CRUD de flows, templates, optimizer (execução fica no worker). | Campaign/Automation |
| `autopilot/` | 21 | 21 | Config do autopilot + segmentação + ops (execução no worker). | Campaign/Automation |
| `followup/` | 3 | 2 | Agendamento de follow-ups. | Campaign/Automation |
| `launch/` | 4 | 2 | Lançamentos (eventos de venda orquestrados). | Campaign |
| `growth/` | 6 | 4 | Growth + "Money Machine". | Campaign |
| `anuncios/` | 3 | 2 | Agregador de ads Meta/Google/TikTok (contas, campanhas, insights) via providers de `integrations/`. | Campaign (Ads) |
| `tiktok-ads/` | 2 | 1 | OAuth TikTok + Events API. | Campaign (Ads) |
| `google-ads/` | 1 | 1 | Só callback OAuth — lógica real em `marketing/google-ads-marketing.service.ts` e `integrations/google-ads.provider` (fragmentado, §3). | Campaign (Ads) |
| `scrapers/` | 5 | 4 | Scraping de leads (omni-scraper) — produz jobs p/ worker. | Campaign (aquisição) |
| `unsubscribe/` | 3 | 2 | Endpoint de unsubscribe com token assinado (LGPD). | Campaign/Compliance |
| `products/` | 4 | 6 | **Serviço canônico de produto** (`product.service.ts`) — CRUD + payload comercial + emissão `MindEventSpine`. | Product |
| `product-categories/` | 3 | 2 | Categorias de produto por workspace. | Product |
| `member-area/` | 8 | 5 | Áreas de membros (cursos, comunidades) + stats denormalizados. | Product |
| `sites/` | 7 | 1 | Site builder CRUD (Site, SiteDomain, SiteAppIntegration). | Product (Sites) |
| `marketplace/` | 3 | 2 | Vitrine marketplace. | Product |
| `checkout/` | 70 | 47 | Sistema de checkout: catálogo (config, cupons, pixels), criação/consulta de ordem, pricing, pós-pagamento, webhook com validação de transição de estado, Facebook CAPI. | Checkout |
| `sales/` | 13 | 8 | Venda in-chat (PIX, cartão, boleto) — usa Billing (Stripe Sessions) + Payments (MercadoPago) + Spine. | Checkout |
| `payments/` | 51 | 40 | Stripe Connect: `connect/` (onboarding), `ledger/` (razão financeiro com idempotência + eventos spine), `split/`, `fraud/` (FraudEngine), `mercadopago/` (PIX/boleto), `provider-router/`. | Payment |
| `billing/` | 23 | 14 | Assinatura SaaS da plataforma: `stripe.service.ts` (fonte única do SDK, ADR-0003), `plan-limits.service.ts` (limites FREE/STARTER/PRO/ENTERPRISE), webhook de billing. | Billing |
| `plans/` | 3 | 3 | CRUD de planos (preço de oferta do usuário, não plano SaaS). | Checkout/Product |
| `wallet/` | 13 | 12 | **Carteira pré-paga de uso** (top-up Stripe/PIX, charge/settle/refund de serviços medidos, FraudEngine). | Payment |
| `marketplace-treasury/` | 6 | 6 | Razão/reconciliação de taxas do marketplace — crédito de fee na MESMA `$transaction` que marca ordem PAID (SP-9). | Payment |
| `kyc/` | 16 | 6 | KYC (verificação de vendedor) + guard `KycApprovedGuard` + emitter p/ Mind. | Payment/Compliance |
| `affiliate/` | 6 | 4 | Sistema de afiliados + marketplace de afiliação. | Affiliate |
| `partnerships/` | 10 | 6 | Parcerias (colaboradores, afiliados, chat). | Affiliate |
| `crm/` | 13 | 6 | CRM + "Neuro CRM". | CRM |
| `pipeline/` | 4 | 2 | Board de pipeline de vendas (emite eventos via `SpineEmitterService` + `CrmEventEmitterService`). | CRM |
| `calendar/` | 6 | 2 | Integração com calendários (agendamento). | CRM |
| `analytics/` | 10 | 7 | Analytics avançado + performance de agente. | Analytics |
| `dashboard/` | 9 | 6 | Dashboard do app (lê `MindMemoryItemService`). | Analytics |
| `reports/` | 7 | 5 | Relatórios (vendas, assinaturas, churn, afiliados, ordens). ⚠️ os 1569 arquivos do dir são quase todos artefatos JSON gerados — só 7 .ts de código. | Analytics |
| `metrics/` | 6 | 4 | Prometheus (interceptor + controller). | Infra/Observability |

### 1.3 Mídia e conteúdo

| Dir | src | test | Responsabilidade real | Domínio |
|---|---|---|---|---|
| `media/` | 7 | 5 | Upload/gestão de mídia (+ um `video.controller` próprio). | Media |
| `audio/` | 3 | 2 | Transcrição de áudio (`TranscriptionService`). | Media |
| `voice/` | 7 | 4 | Voz (TTS/chamadas — produz jobs p/ `voice-processor` do worker). | Media |
| `video/` | 3 | 2 | Jobs de geração de vídeo. | Media |

### 1.4 Compliance e privacidade

| Dir | src | test | Responsabilidade real | Domínio |
|---|---|---|---|---|
| `gdpr/` | 12 | 8 | Export e deleção de dados LGPD/GDPR. | Compliance |
| `compliance/` | 6 | 5 | Callbacks de compliance OAuth/Meta + direitos do titular. | Compliance |
| `cookie-consent/` | 3 | 2 | Consentimento de cookies. | Compliance |
| `audit/` | 4 | 2 | `AuditService` — trilha de auditoria de ações de sistema (segurança/compliance). | Compliance/Infra |

### 1.5 Plataforma / Infra

| Dir | src | test | Responsabilidade real | Domínio |
|---|---|---|---|---|
| `common/` | 90 | 39 | Transversal: idempotência (guard+interceptor+middleware), throttler por classe de rota, storage (local/S3/R2), cache, máquinas de estado (`payment-state-machine.ts`, `checkout-order-state-machine.ts`), `money.ts`, `ledger-reconciliation.service.ts`, `channel-dispatch/` (port canônico), webhooks, TOTP, phone. ⚠️ contém regra de negócio financeira (§4.8). | Infra (+ vazamentos) |
| `prisma/` | 16 | 4 | `PrismaService` (conexão única ao Postgres). | Infra |
| `config/` | 3 | 3 | Validação Joi de env (`AppConfigModule`). | Infra |
| `queue/` | 5 | 3 | Produtores BullMQ do backend. | Infra |
| `health/` | 17 | 14 | Health checks. | Infra |
| `observability/` | 4 | 4 | `OpsAlertService` — alerta crítico de ops (Sentry + tabela OpsEvent). | Infra |
| `logging/` | 1 | 1 | `StructuredLogger`. | Infra |
| `lib/` | 6 | 4 | `llm-provider.ts` (cliente LLM multi-provider), `openai-models.ts`, crypto, prompt-registry. Sobrepõe conceito de `common/` (§3). | Infra (LLM) |
| `i18n/` | 2 | 1 | Internacionalização. | Infra |
| `webhooks/` | 27 | 23 | Recepção de webhooks externos (pagamento Stripe/genérico, ledger de webhook). | Infra/Payment |
| `notifications/` | 4 | 3 | Notificações + e-mails de boas-vindas/onboarding. | Infra |
| `email/` | 2 | 2 | **Só inbound** de e-mail (`email-inbound.service.ts`) — nome engana (§3). | Channel (e-mail inbound) |
| `public-api/` | 3 | 3 | API pública autenticada por API key (expõe Inbox). | Infra (API) |
| `integrations/` | 19 | 10 | Providers de plataformas de ads (Meta marketing, Google Ads). | Campaign (Ads) |
| `ops/` | 2 | 1 | Controller de operações internas. | Infra |
| `alerts/` | 1 | 1 | Só `alerts.gateway.ts` (socket.io), registrado direto no `app.module.ts` — sem módulo próprio (§3). | Infra |
| `contracts/` | 2 | 2 | Contratos compartilhados: `autopilot-jobs.ts` (espelhado byte-a-byte no worker, CI valida) e `schemas.ts` (contrato frontend↔backend). | Infra (contratos) |

### 1.6 Órfãos / resíduos dentro de `backend/src`

| Dir | Conteúdo | Veredito |
|---|---|---|
| `certification/` | 1 spec (`certification-e2e-scenarios.spec.ts`) sem módulo | Órfão — mover para `e2e/` ou `test/` |
| `post-sale/` | 1 módulo que só reexporta `kloel/post-sale-emitter` | Casca — eliminar ou absorver no emitter |
| `test-results/` | `backend-junit.xml` | Lixo de CI — gitignore + remover |
| `kloel/jest_dx/`, `kloel/test-results/` | cache do Jest + junit dentro de src | Lixo — gitignore + remover |
| `kloel/product.service.ts` | `export { ProductService } from '../products/product.service'` | Shim legado de migração — remover após atualizar imports |

---

## 2. Inventário — `worker/` (processo BullMQ separado)

| Área | .ts | Responsabilidade real |
|---|---|---|
| raiz (`worker/*.ts`) | 50 | `processor.ts` (bootstrap dos workers + SIGTERM), `queue.ts` (Lazy Queue System — 9 filas + DLQs criadas por Proxy, zero conexão no import, pós P2-4), `flow-engine-*.ts` (motor de execução de flows: parse, lifecycle, global, voice-producer), `flow-node-executor*.ts` (execução de nós: actions, AI, API, interactions), `send-message-handler.ts` (+persist success/failure), `scheduled-followup-handler.ts`, `autopilot-scanner.engine.ts`, `dlq-monitor.ts`, `metrics-server.ts`, `campaign-processor.ts`, `media-processor.ts`, `voice-processor.ts`, `scraper-processor.ts`, `reprocess-dlq.ts`/`retry-jobs.ts` (ferramentas operacionais). |
| `processors/` | 91 | `autopilot/` (ciclo CIA: cognition→decision→execution com guards/planner/dispatcher, backlog, catalog, followup, identity), `cia/` (brain governor, cognitive-state, conversation-policy/tactics, global-learning, self-improvement), `crm-processor`, `memory-processor`, `webhook-processor`, `mass-send-processor`, `silent-24h-resolver`, `mind-self-evolution-cron` (6h). |
| `providers/` | 41 | Adaptadores de saída/IA: `whatsapp-engine`, `unified-whatsapp-provider`, `whatsapp-api-provider`, `whatsapp-provider-resolver`, `channel-dispatcher`, `outbound-dispatcher`, `ai-provider`, `rag-provider`, `semantic-memory`, `fact-extractor`, `lead-scorer`, `commercial-intelligence.*` (core/signals/tasks/persistence), `mind-client`, `prepaid-wallet-settlement` (cobra a wallet do backend), `stripe-runtime`, `plan-limits`, `anti-ban`, `rate-limiter`, `watchdog`, `health-monitor`. |
| `utils/` | 11 | Helpers (error-message etc.). |
| `contracts/` | 1 | Espelho byte-a-byte de `backend/src/contracts/autopilot-jobs.ts` (CI valida igualdade). |
| `scrapers/` | 3 | Implementações de scraping. |
| `test/` | 77 | Specs (vitest). |
| `prisma/`, `templates/`, `constants/`, `lib/`, `src/utils/` | ~4 | Schema próprio, templates, 1 `error-handler.ts` órfão em `src/utils/`. |

**Domínios no worker:** Automation/Flow (flow-engine), Mind (cia, autopilot cognition, mind-self-evolution), Campaign (campaign/mass-send/scraper), Channel (whatsapp-engine, channel-dispatcher), Media (media/voice), Payment (prepaid-wallet-settlement), Infra (queue, DLQ, metrics).

---

## 3. Inventário — `frontend/src/components/*` (arquivos `.ts/.tsx`, excluindo `node-compile-cache` espúrio)

⚠️ **Poluição detectada:** diretórios `node-compile-cache/` commitados/presentes dentro de `components/kloel/graph/` (~2.4k arquivos) e `components/kloel/conta/` (~540) — contagens abaixo já excluem.

| Cluster | .ts/.tsx | Responsabilidade | Domínio |
|---|---|---|---|
| `kloel/` (raiz, 72 arquivos) | 670 total | AppShell, AgentConsole, CommandPalette, chat — casca do app + console do agente. | Mind (UI) |
| `kloel/marketing/` | 86 | UI do Marketing Command Center. | Campaign |
| `kloel/products/` + `kloel/produtos/` | 60 + 33 | **Duplicação PT/EN** de UI de produtos (§4.12). | Product |
| `products/` (fora de kloel) | 49 | Terceira árvore de UI de produtos. | Product |
| `kloel/settings/` | 48 | Configurações. | Workspace |
| `kloel/conta/` | 44 | Conta: dados bancários/fiscais/pessoais, Stripe Connect, PIX, referral. | Identity/Payment |
| `kloel/landing/` | 37 | Landing pages. | Marketing site |
| `kloel/dashboard/` | 36 | Dashboard. | Analytics |
| `kloel/parcerias/` | 34 | Parcerias. | Affiliate |
| `plans/` | 29 | Planos/preços. | Billing |
| `canvas/` | 27 | Canvas (editor visual). | Mind (UI) |
| `flow/` | 24 | Editor de flows. | Automation |
| `kloel/vendas/` | 24 | Vendas. | Checkout |
| `kloel/sites/` | 24 | Site builder. | Product (Sites) |
| `kloel/auth/` | 20 | Autenticação. | Identity |
| `kloel/crm/` | 19 | CRM. | CRM |
| `kloel/inbox/` + `kloel/conversations/` | 18 + 5 | Inbox/conversas. | Conversation |
| `kloel/graph/` | 18 | Grafo Kloel (KloelGraph*). | Mind (UI) |
| `kloel/anuncios/` | 18 | Ads. | Campaign |
| `kloel/carteira/` | 14 | Carteira. | Payment |
| `kloel/sidebar/`, `kloel/cookies/`, `kloel/search/`, `kloel/home/`, `kloel/autopilot/`, `kloel/theme/`, `kloel/campaigns/`, `kloel/memory/`, `kloel/layouts/` | 11/9/7/7/7/3/3/2/2 | Navegação, consent, busca, home, autopilot, tema, campanhas, memória. | diversos |
| `ui/`, `webinarios/`, `login/`, `icons/`, `kloel/ui|primitives|legal` | 7/6/1/1/3 | Primitivas e páginas pontuais. | Infra (UI) |

Há ainda um app separado **`frontend-admin/`** (113 .ts/.tsx — backoffice de `admin/`).

---

## 4. Domínios canônicos (síntese)

| # | Domínio | Dirs backend | Worker | Frontend |
|---|---|---|---|---|
| 1 | **Identity** | `auth`, `api-keys`, `admin` (identidade admin separada) | — | `kloel/auth`, `login`, `frontend-admin` |
| 2 | **Workspace** | `workspaces`, `team` | — | `kloel/settings`, `kloel/conta` |
| 3 | **Channel** (transporte) | `marketing/channels/*` (whatsapp/email/instagram/messenger/tiktok), `meta`, `omnichannel`, `contacts`, `email` (inbound), `common/channel-dispatch` | `providers/whatsapp-*`, `channel-dispatcher`, `outbound-dispatcher` | — |
| 4 | **Conversation** | `inbox`, `chat`, `copilot` | `send-message-handler`, `silent-24h-resolver` | `kloel/inbox`, `kloel/conversations` |
| 5 | **Campaign/Automation** | `campaigns`, `mass-send`, `flows`, `autopilot`, `followup`, `launch`, `growth`, `marketing` (command center), `anuncios`, `tiktok-ads`, `google-ads`, `integrations`, `scrapers`, `unsubscribe` | `flow-engine*`, `campaign-processor`, `mass-send-processor`, `scraper-processor`, `autopilot-scanner` | `flow`, `kloel/marketing`, `kloel/anuncios`, `kloel/campaigns`, `kloel/autopilot` |
| 6 | **Product** | `products`, `product-categories`, `member-area`, `sites`, `marketplace`, `plans` | — | `products`, `kloel/products`, `kloel/produtos`, `kloel/sites` |
| 7 | **Checkout** | `checkout`, `sales` | — | `kloel/vendas` |
| 8 | **Payment** | `payments` (connect/ledger/split/fraud/mercadopago), `wallet`, `marketplace-treasury`, `kyc`, `webhooks` (pagamento) | `prepaid-wallet-settlement`, `stripe-runtime` | `kloel/carteira`, `kloel/conta` (Connect) |
| 9 | **Billing** (SaaS) | `billing`, `plans` (parcial) | `plan-limits` | `plans` |
| 10 | **Affiliate** | `affiliate`, `partnerships` | — | `kloel/parcerias` |
| 11 | **CRM** | `crm`, `pipeline`, `calendar`, `contacts` (parcial) | `crm-processor` | `kloel/crm` |
| 12 | **Mind** | `kloel/*` (núcleo + 35 camadas), `kloel/mind`, `kloel/spine` | `processors/cia`, `processors/autopilot` (cognition), `mind-self-evolution-cron`, `providers/commercial-intelligence.*`, `mind-client` | `kloel/` raiz, `canvas`, `kloel/graph`, `kloel/memory` |
| 13 | **Analytics** | `analytics`, `dashboard`, `reports`, `metrics` | `metrics-server` | `kloel/dashboard` |
| 14 | **Media** | `media`, `audio`, `voice`, `video` | `media-processor`, `voice-processor` | — |
| 15 | **Compliance** | `gdpr`, `compliance`, `cookie-consent`, `audit`, `kyc` (parcial), `unsubscribe` (parcial) | — | `kloel/cookies`, `kloel/legal` |
| 16 | **Infra** | `common`, `prisma`, `config`, `queue`, `health`, `observability`, `logging`, `lib`, `i18n`, `public-api`, `ops`, `alerts`, `notifications`, `contracts` | `queue.ts`, `dlq-monitor`, `redis-client`, `watchdog` | `ui`, `icons`, `kloel/theme` |

---

## 5. Vazamentos de domínio (achados acionáveis)

Ordenados por gravidade. Cada item é executável como migração isolada.

| # | Vazamento | Evidência (arquivo) | Correção proposta |
|---|---|---|---|
| 5.1 | **Wallet completa dentro do Mind.** `kloel/wallet.service.ts` implementa split de venda, antecipação, saque, reconciliação (cron) — domínio Payment puro, com nome de classe idêntico ao `wallet/wallet.service.ts` (wallet pré-paga). Dois "WalletService" distintos em DI. | `backend/src/kloel/wallet.service.ts`, `backend/src/kloel/wallet-ledger.service.ts`, `backend/src/kloel/wallet.controller.ts` vs `backend/src/wallet/wallet.service.ts` | Extrair para `payments/` (ou `wallet/` com nomes distintos: `SellerWalletService` vs `PrepaidWalletService`), deixando shim de reexport como feito em `kloel/product.service.ts`. |
| 5.2 | **Transporte de canal dentro do Mind.** `kloel/channel-transport.registry.ts` + `channel-transport.providers.ts` (WhatsApp/Email/Instagram/Messenger/TikTok) vivem no kloel; já delegam parcialmente ao dispatch canônico (`marketing/channel-message-dispatch.service.ts` + `common/channel-dispatch/channel-dispatch.port.ts`) sob a flag `channel-transport-canonical-delegate.flag.ts`. Migração a meio caminho. | `backend/src/kloel/channel-transport.registry.ts:1-30`, `backend/src/kloel/channel-transport-whatsapp.provider.ts`, `backend/src/kloel/channel-transport-canonical-delegate.flag.ts` | Concluir o delegate canônico, promover flag a default, mover providers para `marketing/channels/` (ou novo `channels/`), manter no Mind apenas o guard (`MindGuardsService`). |
| 5.3 | **Superfície de comércio dentro do módulo Mind.** Controllers de vendas, assinaturas, site builder, webinar, smart-payment, wallet e produto registrados em `kloel/`: `sales.controller.ts`, `sales-orders.controller.ts`, `sales-subscriptions.controller.ts`, `smart-payment.controller.ts`, `wallet.controller.ts`, `site.controller.ts`, `site-public.controller.ts`, `webinar.controller.ts`, `payment.controller.ts`, `product.controller.ts`, `product-sub-resources/*` (5 controllers). | `find backend/src/kloel -maxdepth 1 -name '*.controller.ts'` → 26 controllers | Mover controllers para os módulos de domínio (`sales/`, `checkout/`, `sites/`, `products/`, `wallet|payments/`) preservando rotas; kloel mantém apenas superfícies cognitivas (`kloel.controller`, `unified-agent.controller`, `memory.controller`, `canvas`, `diagnostics`). |
| 5.4 | **Regra comercial em controller + Prisma direto.** `kloel/sales.controller.ts` injeta `PrismaService` e `StripeService` diretamente e implementa refund no controller. No total, **54 controllers** usam `this.prisma.` direto (amostra: `checkout/checkout.controller.ts`, `dashboard/dashboard.controller.ts`, `meta/webhooks/meta-webhook.controller.ts`, `payments/connect/connect.controller.ts`, `admin/contacts/admin-contact-verify.controller.ts`). | `grep -rl "this\.prisma\." --include='*.controller.ts' backend/src | grep -v spec | wc -l` → 54 | Regra: controller só valida/autoriza/delega. Extrair para services existentes; criar `SalesRefundService` para o caso do refund. |
| 5.5 | **Mind acoplado dentro de Checkout.** `checkout.module.ts` importa `DecisionOutcomeService` e `MindBanditService` (decisão de bandit dentro do fluxo de checkout). | `backend/src/checkout/checkout.module.ts` (imports de `../kloel/decision-outcome.service` e `../kloel/mind/policy/mind-bandit.service`) | Aceitável se for só telemetria de outcome; se houver decisão de pricing/oferta via bandit no caminho do checkout, isolar atrás de port (`DecisionTelemetryPort`) para inverter a dependência. |
| 5.6 | **Dois "omnichannel".** `inbox/omnichannel.service.ts` (normalização inbound + roteamento, importa `UNIFIED_AGENT_TOKEN` do kloel) coexiste com módulo `omnichannel/` (hook → Mind percept + resolução de contato). | `backend/src/inbox/omnichannel.service.ts` vs `backend/src/omnichannel/channel-inbound-hook.service.ts` | Unificar ingestão inbound no módulo `omnichannel/` (canônico, já tem flag `omni-canonical-identity`); `inbox/` fica só com leitura/roteamento de conversas. |
| 5.7 | **E-mail fragmentado em 4 lugares.** Transacional em `auth/email.service.ts`; inbound em `email/`; marketing em `marketing/email-marketing.service.ts`; onboarding em `notifications/welcome-onboarding-email.service.ts`. | paths citados | Consolidar transporte num `channels/email` (já existe `marketing/channels/email/`); `auth` e `notifications` viram consumidores. Ver doc existente `EMAIL_ROUTING.md`. |
| 5.8 | **Regra financeira em `common/`.** `common/ledger-reconciliation.service.ts`, `payment-state-machine.ts`, `checkout-order-state-machine.ts`, `shared-ledger.port.ts` são domínio Payment/Checkout, não infra. | `backend/src/common/ledger-reconciliation.service.ts` etc. | Mover para `payments/` e `checkout/`; `common/` só mantém primitivas (`money.ts`, `math.ts`). |
| 5.9 | **Dois `MemoryService`.** `kloel/memory.service.ts` (RAG: CRUD + busca com embedding) e `kloel/mind/memory/memory.service.ts` (substrato Mind). Unificação Brain→Mind em andamento via aliases (`mind-memory-item.service.ts`, dual-write flags). | `backend/src/kloel/memory.service.ts` vs `backend/src/kloel/mind/memory/memory.service.ts`; plano em `docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md` | Seguir o plano de unificação já documentado (PI-K23/Claude-K50); não criar novos consumidores de `prisma.kloelMemory` direto. |
| 5.10 | **WhatsApp (135 arquivos) sob `marketing/`.** O transporte WhatsApp é usado por Conversation, Mind, Campaign e Sales — não é "marketing". | `backend/src/marketing/channels/whatsapp/` | Renomear o agrupador para `channels/` top-level (mecânico: 1 move + atualização de imports), separando do Marketing Command Center. |
| 5.11 | **Google Ads em 3 dirs.** `google-ads/` (só OAuth callback), `marketing/google-ads-marketing.service.ts`, `integrations/google-ads.provider`. | paths citados | Consolidar em `integrations/google-ads/` com controller de OAuth junto. |
| 5.12 | **UI de produtos triplicada.** `frontend/src/components/products/` (49), `kloel/products/` (60), `kloel/produtos/` (33) — PT e EN coexistem. | paths citados | Eleger árvore canônica, migrar imports, deletar as outras duas. |
| 5.13 | **Poluição de build em src.** `node-compile-cache/` dentro de `frontend/src/components/kloel/{graph,conta}/`; `jest_dx/` e `test-results/` dentro de `backend/src/kloel/`; `backend/src/test-results/`; dirs hex na raiz do repo (`03ac61d0…`, etc.) e perfis playwright. | listagens §1.6/§3 | Adicionar a `.gitignore` + limpeza; quebra contagens e buscas de qualquer ferramenta. |

---

## 6. Regras de pertencimento (para futuras decisões)

1. **Mind nunca transporta:** envio a canal externo passa por `common/channel-dispatch` port → adapters em `marketing/channels/*`. Mind decide e emite; não fala HTTP com Meta/Baileys.
2. **Mind nunca cobra:** dinheiro (split, refund, payout, top-up) vive em `payments|wallet|billing`. Mind apenas solicita via tool/capability com receipt (`kloel-tool-dispatcher`).
3. **Controller não toca Prisma:** acesso a dados via service do domínio dono da tabela.
4. **Eventos cross-domain só via spine:** `SpineEmitterService` (cognitivo) e `MindEventSpine` (CRUD canônico) — emissores `kloel/*-emitter/` são a ponte oficial domínio→Mind; domínios não importam services internos do Mind.
5. **Contratos backend↔worker↔frontend:** somente via `contracts/` (espelhos byte-a-byte validados em CI).
