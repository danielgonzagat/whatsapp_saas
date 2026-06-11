# Catálogo de Serviços Centrais — Kloel (2026-06-10)

> **Origem:** derivado de código-fonte em 2026-06-10. Centralidade medida por frequência de import (`grep -rhoE "from '[^']*\.service'" backend/src | sort | uniq -c`).
> **Par:** [`CANONICAL_DOMAINS_2026-06-10.md`](CANONICAL_DOMAINS_2026-06-10.md) (mapa de domínios + vazamentos).
> Coluna **imports** = nº de arquivos que importam o serviço. Coluna **"NÃO deve"** = limite de responsabilidade derivado do contrato lido no código + regras do §6 do mapa de domínios.

## Ranking de centralidade (top do grafo de imports)

| # | Serviço | imports | Domínio | Arquivo |
|---|---|---|---|---|
| 1 | PrismaService | 833 | Infra | `backend/src/prisma/prisma.service.ts` |
| 2 | OpsAlertService | 171 | Infra | `backend/src/observability/ops-alert.service.ts` |
| 3 | AuditService | 115 | Compliance | `backend/src/audit/audit.service.ts` |
| 4 | PlanLimitsService | 105 | Billing | `backend/src/billing/plan-limits.service.ts` |
| 5 | SpineEmitterService | 92 | Mind | `backend/src/kloel/spine/spine-emitter.service.ts` |
| 6 | DecisionOutcomeService | 55 | Mind | `backend/src/kloel/decision-outcome.service.ts` |
| 7 | MindMemoryItemService | 54 | Mind | `backend/src/kloel/mind/aliases/mind-memory-item.service.ts` |
| 8 | MindBeliefService | 49 | Mind | `backend/src/kloel/mind/inference/mind-belief.service.ts` |
| 9 | FinancialAlertService | 39 | Payment/Infra | `backend/src/common/financial-alert.service.ts` |
| 10 | EmailService | 37 | Identity | `backend/src/auth/email.service.ts` |
| 11 | CapabilityRegistryV2Service | 33 | Mind | `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts` |
| 12 | WhatsappService | 32 | Channel | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` |
| 13 | UnifiedAgentService | 32 | Mind | `backend/src/kloel/unified-agent.service.ts` |
| 14 | KloelReplyEngineService | 31 | Mind | `backend/src/kloel/kloel-reply-engine.service.ts` |
| 15 | KloelChatToolsService | 31 | Mind | `backend/src/kloel/kloel-chat-tools.service.ts` |
| 16 | StripeService | 30 | Billing/Payment | `backend/src/billing/stripe.service.ts` |
| 17 | AdminAuditService | 30 | Identity (Admin) | `backend/src/admin/audit/admin-audit.service.ts` |
| 18 | AbiBuilderService | 30 | Mind | `backend/src/kloel/abi/abi-builder.service.ts` |
| 19 | WalletService (⚠️ duplo) | 29 | Payment | `backend/src/wallet/wallet.service.ts` **e** `backend/src/kloel/wallet.service.ts` |
| 20 | StorageService | 29 | Infra | `backend/src/common/storage/storage.service.ts` |
| 21 | KloelThreadService | 29 | Mind | `backend/src/kloel/kloel-thread.service.ts` |
| 22 | KloelComposerService | 29 | Mind | `backend/src/kloel/kloel-composer.service.ts` |
| 23 | SmartPaymentService | 28 | Mind→Payment | `backend/src/kloel/smart-payment.service.ts` |
| 24 | MindSurpriseService / MindPolicyService | 26/26 | Mind | `backend/src/kloel/mind/…` |
| 25 | KloelWorkspaceContextService | 26 | Mind | `backend/src/kloel/kloel-workspace-context.service.ts` |
| 26 | ValenceTaggerService | 25 | Mind | `backend/src/kloel/mind/valence-tagger.service.ts` |
| 27 | KloelToolDispatcherService | 25 | Mind | `backend/src/kloel/kloel-tool-dispatcher.service.ts` |
| 28 | ValenceAggregatorService | 23 | Mind | `backend/src/kloel/mind/valence-aggregator.service.ts` |
| 29 | MindGlobalPriorService | 22 | Mind | `backend/src/kloel/mind/memory/mind-global-prior.service.ts` |
| 30 | MemoryService (⚠️ duplo) | 22 | Mind | `backend/src/kloel/memory.service.ts` e `backend/src/kloel/mind/memory/memory.service.ts` |
| 31 | ConnectService | 22 | Payment | `backend/src/payments/connect/connect.service.ts` |
| 32 | LedgerService | 21 | Payment | `backend/src/payments/ledger/ledger.service.ts` |
| 33 | ProductService | 20 | Product | `backend/src/products/product.service.ts` |
| 34 | MindBanditService | 20 | Mind | `backend/src/kloel/mind/policy/mind-bandit.service.ts` |
| 35 | MetaWhatsappService | 20 | Channel | `backend/src/meta/meta-whatsapp.service.ts` |
| 36 | MercadoPagoPixChargeService | 20 | Payment | `backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts` |
| 37 | AgentEventsService | 20 | Conversation | `backend/src/marketing/channels/whatsapp/agent-events.service.ts` |
| 38 | MindEventSpine | 19 | Mind | `backend/src/kloel/mind/coordination/mind-event-spine.service.ts` |
| 39 | AttentionService | 19 | Mind | `backend/src/kloel/mind/attention.service.ts` |
| 40 | SelfHealthService / SelfGapsService | 19/19 | Mind | `backend/src/kloel/self-awareness/…` |
| 41 | WorkspaceService | 18 | Workspace | `backend/src/workspaces/workspace.service.ts` |

---

## Fichas (responsabilidade · proibições · dependências)

### Infra / Plataforma

**PrismaService** — `backend/src/prisma/prisma.service.ts` · 833 imports
- **Faz:** conexão única ao Postgres; superfície de todos os delegates Prisma.
- **NÃO deve:** conter regra de negócio, defaults de domínio ou queries "espertas" — é só o client. O número 833 é o sintoma do anti-padrão "todo mundo fala com o banco"; migrações devem REDUZIR este número movendo acesso para services donos de tabela.
- **Depende de:** `@prisma/client`.

**OpsAlertService** — `backend/src/observability/ops-alert.service.ts` · 171
- **Faz:** alerta operacional crítico — grava `OpsEvent` (delegate detectado dinamicamente) + `Sentry.captureException`.
- **NÃO deve:** ser canal de notificação de produto (usuário final) nem alerta financeiro (há `FinancialAlertService`); nunca lançar exceção no caminho de negócio.
- **Depende de:** PrismaService, Sentry.

**StorageService** — `backend/src/common/storage/storage.service.ts` · 29
- **Faz:** upload/URL assinada multi-driver (local/S3/R2): áudio, avatar, imagem de produto, mídia WhatsApp, upload-from-url.
- **NÃO deve:** decidir regras de mídia por domínio (limites de plano ficam no chamador via PlanLimitsService); não validar conteúdo.
- **Depende de:** driver configurado por env.

**FinancialAlertService** — `backend/src/common/financial-alert.service.ts` · 39
- **Faz:** alerta estruturado `FINANCIAL_ALERT` (payment failed, withdrawal, webhook) → log + Sentry. Injetado em qualquer serviço que mexe com dinheiro.
- **NÃO deve:** persistir estado nem tomar ação corretiva — é telemetria pura.
- **Depende de:** Sentry (apenas).

### Identity / Workspace / Compliance

**EmailService** — `backend/src/auth/email.service.ts` · 37
- **Faz:** e-mail transacional com templates embarcados (password-reset, verification, magic-link…), seleção de provider (Resend/SendGrid/SMTP), bundle de unsubscribe.
- **NÃO deve:** enviar e-mail de marketing/campanha (dono: `marketing/email-marketing.service.ts`) nem processar inbound (dono: `email/email-inbound.service.ts`). Mover para fora de `auth/` quando consolidar o canal e-mail (vazamento 5.7).
- **Depende de:** PrismaService, OpsAlertService, helpers `email.helpers.ts`.

**WorkspaceService** — `backend/src/workspaces/workspace.service.ts` · 18
- **Faz:** CRUD de workspace, merge profundo de `settings`, resolução de provider WhatsApp default, cache.
- **NÃO deve:** conhecer formato interno de settings de outros domínios além de validar shape; não é repositório genérico de config de feature.
- **Depende de:** PrismaService, CacheService, `marketing/channels/whatsapp/providers/provider-env` (⚠️ acoplamento Workspace→Channel; aceitável só enquanto provider default morar em settings).

**AuditService** — `backend/src/audit/audit.service.ts` · 115
- **Faz:** trilha de auditoria (`AuditLog`) de ações de sistema para segurança/compliance.
- **NÃO deve:** ser confundido com `AdminAuditService` (audit do backoffice) nem com `kloel/event-emit-audit-emitter` (spine); nunca bloquear a ação auditada.
- **Depende de:** PrismaService, OpsAlertService (opcional).

**AdminAuditService** — `backend/src/admin/audit/admin-audit.service.ts` · 30
- **Faz:** append + listagem filtrada de ações de admins (adminUserId, action, entity, ip, userAgent).
- **NÃO deve:** auditar ações de usuários do produto (dono: AuditService).
- **Depende de:** PrismaService.

### Billing / Payment

**PlanLimitsService** — `backend/src/billing/plan-limits.service.ts` · 105
- **Faz:** enforcement de limites por plano SaaS (FREE/STARTER/PRO/ENTERPRISE): flows, campanhas, msgs/min-dia-mês, instâncias, tokens IA; contadores em Redis; lança `ForbiddenException`.
- **NÃO deve:** cobrar (dono: Billing/Wallet) nem definir preço; tabela `planConfig` é a única fonte dos números — não duplicar limites em chamadores.
- **Depende de:** Redis, PrismaService, OpsAlertService, StructuredLogger.

**StripeService** — `backend/src/billing/stripe.service.ts` · 30
- **Faz:** fonte ÚNICA do SDK Stripe (apiVersion pinada, validação de chave, instância lazy) para billing, payments, webhooks, wallet, connect (ADR-0003: live key nunca em dev/test).
- **NÃO deve:** nenhum consumidor pode chamar `new Stripe(...)` direto; este serviço não contém lógica de cobrança — só entrega o client.
- **Depende de:** ConfigService, StripeRuntime.

**ConnectService** — `backend/src/payments/connect/connect.service.ts` · 22
- **Faz:** Stripe Connect custom accounts — criação, onboarding profile, status projection, capabilities, payout schedule fallback.
- **NÃO deve:** tocar ledger (dono: LedgerService) nem decidir split (dono: `payments/split`).
- **Depende de:** StripeService, PrismaService.

**LedgerService** — `backend/src/payments/ledger/ledger.service.ts` · 21
- **Faz:** razão financeiro (`ConnectLedgerEntry`): créditos pendentes/disponíveis, débito de payout, absorção, idempotência com recovery code, snapshot de saldo, auditoria via `FINANCIAL_TRANSACTION_OPTIONS`, eventos spine de pagamento.
- **NÃO deve:** chamar gateway (Stripe/MP) — recebe fatos, registra; nunca aceitar valor não-positivo (`assertPositiveAmount`).
- **Depende de:** PrismaService, SpineEmitterService, helpers de ledger.

**WalletService (pré-paga)** — `backend/src/wallet/wallet.service.ts` · (29 compartilhado com a homônima)
- **Faz:** carteira pré-paga de uso medido: top-up via Stripe PaymentIntent / PIX MercadoPago, charge/settle/refund de uso, erros tipados (`InsufficientWalletBalanceError`).
- **NÃO deve:** misturar-se com a carteira de vendedor (split/antecipação/saque) que hoje vive em `kloel/wallet.service.ts` — classes homônimas, domínios diferentes (vazamento 5.1).
- **Depende de:** StripeService, MercadoPagoPixChargeService, FraudEngine, PrismaService.

**WalletService (vendedor, no Mind — LEGADO POSICIONAL)** — `backend/src/kloel/wallet.service.ts`
- **Faz:** split de venda, antecipação, saque, reconciliação (cron), histórico — domínio Payment rodando dentro do módulo kloel.
- **NÃO deve:** permanecer em `kloel/`; migração alvo: `payments/seller-wallet/` com shim de reexport (padrão de `kloel/product.service.ts`).
- **Depende de:** WalletLedgerService, FinancialAlertService, OpsAlertService, PrismaService.

**MercadoPagoPixChargeService** — `backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts` · 20
- **Faz:** geração de cobrança PIX/boleto via MercadoPago.
- **NÃO deve:** decidir QUANDO cobrar (donos: Sales/Checkout/Wallet); só executa a cobrança.
- **Depende de:** SDK MP, PrismaService.

### Channel / Conversation

**WhatsappService** — `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` · 32
- **Faz:** fachada do canal WhatsApp: chats/mensagens/contatos (normalização, backlog, catchup), estado operacional da conversa, registry de providers (Baileys/Cloud API).
- **NÃO deve:** conter decisão comercial; ⚠️ já importa `CiaRuntimeService` do Mind — manter essa ponte atrás do hook de inbound (`omnichannel/channel-inbound-hook.service.ts`), não expandir.
- **Depende de:** PrismaService, WhatsAppProviderRegistry, WhatsappChatBacklog/Messages, CiaRuntimeService (⚠️), OpsAlertService.

**MetaWhatsappService** — `backend/src/meta/meta-whatsapp.service.ts` · 20
- **Faz:** WhatsApp Cloud API oficial: OAuth/embedded signup, descoberta de phone numbers, envio, mark-as-read, heartbeat de webhook, startup check.
- **NÃO deve:** persistir conversa (dono: WhatsappService/Inbox); é adapter de transporte puro.
- **Depende de:** MetaSdkService, PrismaService, OpsAlertService.

**AgentEventsService** — `backend/src/marketing/channels/whatsapp/agent-events.service.ts` · 20
- **Faz:** stream de eventos do agente (fases, tokens, runId) para UI em tempo real (pub/sub).
- **NÃO deve:** ser barramento de domínio — eventos de negócio vão no spine.
- **Depende de:** Redis pub/sub.

### Mind (núcleo cognitivo)

**SpineEmitterService** — `backend/src/kloel/spine/spine-emitter.service.ts` · 92
- **Faz:** spine in-process de eventos cognitivos (PCI.1+B17): envelope universal (eventId, occurredAt, environment), valence auto-tag (B7), ring buffer 5000 + Redis stream.
- **NÃO deve:** NUNCA lançar (caminho de negócio é sagrado); emitters chamam `.emit()` APÓS o efeito de negócio; não é fila durável — não usar para garantia de entrega.
- **Depende de:** Redis (opcional), ValenceTaggerService.

**MindEventSpine** — `backend/src/kloel/mind/coordination/mind-event-spine.service.ts` · 19
- **Faz:** barramento canônico (ADR-0013 Wave M1) que re-emite CRUD bruto (`product.created`, `channel.message.received`…) como eventos `mind.*` para o runtime unificado. Shim legado: `brain-event-spine.service.ts`.
- **NÃO deve:** processar — só re-emitir; consumidores de domínio não devem se inscrever nele (é entrada do Mind, não saída).
- **Depende de:** EventEmitter2.

**DecisionOutcomeService** — `backend/src/kloel/decision-outcome.service.ts` · 55
- **Faz:** ledger de decisões (recordDecision/closeOutcome) com dual-write espelhando para MindPolicy/bandit sob flag `decision-ledger-dualwrite.flag.ts`.
- **NÃO deve:** decidir — registra decisões tomadas e fecha outcomes; chamadores de domínio (checkout etc.) devem tratá-lo como telemetria, nunca como gate.
- **Depende de:** PrismaService, MindBanditService.

**MindMemoryItemService** — `backend/src/kloel/mind/aliases/mind-memory-item.service.ts` · 54
- **Faz:** alias canônico Brain→Mind sobre `prisma.kloelMemory` (mesma linha, dual-write/read-canonical sob flags). Fase 1 de `BRAIN_MIND_UNIFICATION_PLAN.md`.
- **NÃO deve:** novos códigos não devem usar `prisma.kloelMemory` direto — passar por aqui; não criar segunda tabela.
- **Depende de:** PrismaService, flags de dual-write.

**MindBeliefService** — `backend/src/kloel/mind/inference/mind-belief.service.ts` · 49
- **Faz:** crenças Bayesianas (Beta posterior, variância), mistura com prior global, emissão no spine.
- **NÃO deve:** efeito de mundo — atualiza distribuição, quem age é policy/agent.
- **Depende de:** PrismaService, MindGlobalPriorService, SpineEmitterService.

**MindGlobalPriorService** — `backend/src/kloel/mind/memory/mind-global-prior.service.ts` · 22
- **Faz:** prior global cross-workspace agregando `mindBanditArm` (alpha/beta) por decisionType+action.
- **NÃO deve:** vazar dados identificáveis entre workspaces (k-anonimidade é responsabilidade da camada Wisdom).
- **Depende de:** PrismaService.

**MindBanditService** — `backend/src/kloel/mind/policy/mind-bandit.service.ts` · 20
- **Faz:** seleção de braço UCB/Bayes; leitura read-only para sinais (nunca incrementa pulls na leitura).
- **NÃO deve:** ser chamado no caminho síncrono de checkout/pagamento como gate (vazamento 5.5).
- **Depende de:** PrismaService.

**ValenceTaggerService / ValenceAggregatorService** — `backend/src/kloel/mind/valence-tagger.service.ts` (25) / `valence-aggregator.service.ts` (23)
- **Fazem:** tag de valência terminal por evento (B7) / agregação em "mood" operacional por janela (UTP-MIND-VALENCE-002, "descrição, NÃO emoção" — B13).
- **NÃO devem:** influenciar diretamente resposta ao cliente sem passar por policy/guards.

**AttentionService** — `backend/src/kloel/mind/attention.service.ts` · 19
- **Faz:** alocação dinâmica de atenção (recência × |valência| × prioridade de classe) sobre eventos salientes do spine (UTP-MIND-ATT-001/002).
- **NÃO deve:** persistir decisões — produz ranking consumido pelo ABI/agent.

**AbiBuilderService** — `backend/src/kloel/abi/abi-builder.service.ts` · 30
- **Faz:** monta o ABI (Agent Cognitive State): percepção, beliefs, atenção, working memory, predictions, readiness/truth-mode, com checagem de projeção comprometida (IdentityProjector).
- **NÃO deve:** chamar LLM nem executar ações — é snapshot builder puro.
- **Depende de:** IdentityProjectorService (lineage), serviços Mind, AbiSnapshotCache.

**UnifiedAgentService** — `backend/src/kloel/unified-agent.service.ts` · 32
- **Faz:** orquestra o agente unificado: contexto (UnifiedAgentContextService), resposta LLM com fallback (`chatCompletionWithFallback`), ações pré-decididas, executor de tools, estado cognitivo (ABI).
- **NÃO deve:** falar com canal direto (sai via dispatcher/transport) nem cobrar (delega SmartPayment); não duplicar contexto de workspace (dono: KloelWorkspaceContextService).
- **Depende de:** PlanLimitsService, llm-provider, PrismaService, AbiBuilder/SnapshotCache, AgentRuntimeContext, MindCapabilityExecutor, UnifiedAgentToolExecutor.

**KloelReplyEngineService** — `backend/src/kloel/kloel-reply-engine.service.ts` · 31
- **Faz:** motor de resposta do chat Kloel (streaming SSE, abort por timeout/disconnect): contexto + thread + tool-router + skills de marketing + sinais Mind (beliefs, atenção, valência, self-health/gaps, risk-class) + spine.
- **NÃO deve:** executar tools de alto risco sem o fluxo de aprovação do dispatcher; não persistir thread direto (dono: KloelThreadService).
- **Depende de:** ~20 serviços (ver imports no arquivo) — **é o god-node do Mind**; mudanças aqui exigem testes de stream.

**KloelThreadService** — `backend/src/kloel/kloel-thread.service.ts` · 29
- **Faz:** persistência de threads/mensagens do chat com trace de processamento, versões de resposta, espelhamento dual-write p/ MindChatMessage, sumarização (ThreadSummary).
- **NÃO deve:** formatar prompt (dono: ContextFormatter) nem chamar tools.
- **Depende de:** PrismaService, MindChatMessageService (alias), KloelThreadSummaryService.

**KloelComposerService** — `backend/src/kloel/kloel-composer.service.ts` · 29
- **Faz:** geração de artefatos (imagens via OpenAI Images, conversão DOCX/HTML→markdown, uploads) com validação anti-SSRF (`validateNoInternalAccess`).
- **NÃO deve:** acessar URLs internas (validador é obrigatório); respeitar PlanLimits de tokens/mídia.
- **Depende de:** OpenAI, StorageService, PlanLimitsService, PrismaService.

**KloelToolDispatcherService** — `backend/src/kloel/kloel-tool-dispatcher.service.ts` · 25
- **Faz:** dispatch de tools do agente com receipt canônico, fluxo de aprovação high-risk (request/execute-approved), resolução de serviço de domínio via `KloelDomainServiceResolver` (ModuleRef).
- **NÃO deve:** implementar a tool em si — resolve e delega; toda execução gera receipt + audit.
- **Depende de:** AuditService, PlanLimitsService, CapabilityRegistryV2, KloelDomainServiceResolver, MindCapabilityExecutor, SmartPaymentService, WorkspaceService, OpsAlertService.

**KloelChatToolsService** — `backend/src/kloel/kloel-chat-tools.service.ts` · 31
- **Faz:** tools de chat (agent jobs, artifacts, busca em memória/sessões) sobre o agent-runtime.
- **NÃO deve:** tocar pagamento/canal — essas tools têm serviços próprios (SmartPayment, KloelWhatsappTools).
- **Depende de:** ProductService, SmartPaymentService, agent-runtime (scheduler, evidence store, session store, skill registry), PrismaService.

**KloelWorkspaceContextService** — `backend/src/kloel/kloel-workspace-context.service.ts` · 26
- **Faz:** monta o contexto comercial do workspace para prompts (produtos com filtro de legados, integrações, branding, memória) com limites de formatação.
- **NÃO deve:** escrever dados de domínio (exceto criação de integração explicitamente exposta); é read-model para LLM.
- **Depende de:** PrismaService, KloelContextFormatter, ContextData/LinkedProduct services, KloelMemoryEngineService.

**SmartPaymentService** — `backend/src/kloel/smart-payment.service.ts` · 28
- **Faz:** ponte Mind→Payment: interpreta intenção de pagamento via LLM (prompt de negociação), gera PIX/link com idempotência, mensagens de confirmação.
- **NÃO deve:** tocar gateway direto — delega a `kloel/payment.service.ts`/payments; toda criação de cobrança auditada (AuditService) e idempotente.
- **Depende de:** OpenAI (com retry), AuditService, PlanLimitsService, PaymentService, PrismaService, ConfigService.

**CapabilityRegistryV2Service** — `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts` · 33
- **Faz:** fonte única de capabilities (definições, tiers, maturidade, classificação de intent, confirmação, receipts) — substitui o registry antigo.
- **NÃO deve:** executar capability (dono: dispatcher/executor); definições vivem em `capability-registry-v2.const.ts`, não espalhadas.
- **Depende de:** ModulesContainer (introspecção DI).

**SelfHealthService / SelfGapsService** — `backend/src/kloel/self-awareness/` · 19/19
- **Fazem:** snapshot honesto de saúde de infra (probe falhou ⇒ `down`/`unknown`, nunca finge `ok`) / diff entre capability registry e switch real do dispatcher (meta-cap `self.gaps`).
- **NÃO devem:** mascarar falha; não corrigir nada — só reportar.

**MemoryService (RAG)** — `backend/src/kloel/memory.service.ts` · 22
- **Faz:** fachada de memória RAG (MemoryCrudService + MemorySearchService, embeddings).
- **NÃO deve:** ser confundido com `kloel/mind/memory/memory.service.ts` (substrato Mind); convergência via plano Brain→Mind.
- **Depende de:** MemoryCrud, MemorySearch.

### Domínios de negócio

**ProductService** — `backend/src/products/product.service.ts` · 20
- **Faz:** CRUD canônico de produto com escopo de workspace, payload comercial, paginação, emissão `MindEventSpine` + EventEmitter2, audit.
- **NÃO deve:** lógica de checkout/preço de oferta (donos: checkout/plans); `kloel/product.service.ts` é apenas shim de reexport — não adicionar código lá.
- **Depende de:** PrismaService, AuditService, MindEventSpine, EventEmitter2.

### Worker (serviços centrais do processo BullMQ)

| Serviço/arquivo | Faz | NÃO deve |
|---|---|---|
| `worker/queue.ts` (Lazy Queue System) | 9 filas + DLQ + QueueEvents criadas lazy via Proxy; zero conexão Redis no import; `shutdownQueueSystem()` em SIGTERM. | Abrir conexão no import; criar fila fora deste módulo. |
| `worker/processor.ts` | Bootstrap de todos os workers (campaign, scraper, media, voice, memory, webhook, crm, silent-24h, mass-send, mind-self-evolution) + guards de flow + idempotência. | Conter lógica de nó de flow (dono: flow-node-executor). |
| `worker/flow-engine-*.ts` + `flow-node-executor*.ts` | Motor de execução de flows: parse, lifecycle, nós de ação/IA/API/interação. | Falar com canal direto — sai via providers/dispatcher. |
| `worker/providers/unified-agent-integrator.ts` + `mind-client.ts` | Ponte worker→Mind (chama backend para cognição). | Reimplementar cognição localmente. |
| `worker/providers/commercial-intelligence.*` | Sinais/tarefas de inteligência comercial no ciclo autopilot. | Duplicar regras das Camadas do backend. |
| `worker/providers/prepaid-wallet-settlement.ts` | Liquidação de uso contra a wallet pré-paga. | Criar cobrança nova (dono: backend wallet). |
| `worker/processors/autopilot/*` (cognition/decision/execution) | Ciclo CIA: contexto → decisão → execução com guards, planner, dispatcher, audit. | Pular `execution-guards`; toda ação dispatchada deve ser auditável. |

---

## Anti-padrões a monitorar (resumo executável)

1. **833 imports de PrismaService** — meta de migração: domínio dono de tabela expõe service; reduzir uso direto fora do dir dono (ver `PRISMA_USAGE.md`).
2. **54 controllers com `this.prisma.`** — regra de revisão: bloquear novos casos.
3. **Dois `WalletService` homônimos** (`wallet/` e `kloel/`) — risco real de import errado; renomear na migração 5.1.
4. **God-node `KloelReplyEngineService`** (~20+ deps) — qualquer extração de canal/pagamento reduz o raio de explosão.
5. **Flags de dual-write em voo** (`decision-ledger-dualwrite`, `mindmemory-dualwrite`, `channel-transport-canonical-delegate`, `omni-canonical-identity`, `tiktok-inbox-canonical-dispatch`) — cada uma é uma migração a CONCLUIR (promover default + remover caminho legado), não estado permanente.
