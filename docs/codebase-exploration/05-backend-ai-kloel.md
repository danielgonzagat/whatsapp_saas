# Backend AI & Kloel Intelligence — Module Index & Architecture

> **Generated:** 2026-05-19 | **Scope:** `backend/src/kloel/*` (70+ subdirectories) + `{brain,ai-brain,copilot,autopilot,cia,chat,calendar,dashboard,voice,video,audio,media,alerts}`

---

## 1. Overview

The Kloel backend AI layer is one of the largest and most sophisticated subsystems in the codebase. It implements a **cognitive organism architecture** with multiple "camadas" (layers) of commercial intelligence running on top of NestJS.

### File Statistics

| Location | Non-test `.ts` files | Spec files | Total |
|---|---|---|---|
| `backend/src/kloel/` | 707 | 368 | **1,075** |
| `backend/src/copilot/` | 5 | 4 | 9 |
| `backend/src/autopilot/` | 13 | 13 | 26 |
| `backend/src/cia/` | 12 | 12 | 24 |
| `backend/src/ai-brain/` | 9 | 9 | 18 |
| `backend/src/chat/` | 3 | 4 | 7 |
| `backend/src/calendar/` | 3 | 4 | 7 |
| `backend/src/dashboard/` | 4 | 4 | 8 |
| `backend/src/voice/` | 3 | 4 | 7 |
| `backend/src/video/` | 2 | 3 | 5 |
| `backend/src/audio/` | 2 | 3 | 5 |
| `backend/src/media/` | 6 | 6 | 12 |
| `backend/src/alerts/` | 1 | 1 | 2 |
| `backend/src/admin/brain/` | 1 | 2 | 3 |
| `backend/src/brain/` | 1 | 1 | 2 |

**Grand Total (non-test): ~775 files | Total: ~1,212 files**

---

## 2. The Cognitive Stack Architecture

The AI layer is organized into a layered **cognitive organism**:

```
┌─────────────────────────────────────────────────┐
│                  CIA (Intelligence Surface)       │  ← User-facing intelligence dashboard
├─────────────────────────────────────────────────┤
│  Unified Agent  ←→  Kloel Thinker  ←→  Composer  │  ← Core LLM orchestration
├─────────────────────────────────────────────────┤
│  Brain Runtime (Observe → Decide → Execute)      │  ← Autonomous decision loop
├─────────────────────────────────────────────────┤
│  MIND (Perception → Belief → Policy → Bandit)   │  ← Bayesian cognition
├─────────────────────────────────────────────────┤
│  Commercial Decision Orchestrator                │  ← Inbound message routing
├─────────────────────────────────────────────────┤
│  Strategic Layers (Insight, Offer, Wisdom, Wow) │  ← Analysis + pattern detection
├─────────────────────────────────────────────────┤
│  Operational Layers (Agency, Cash, Recovery…)    │  ← Business diagnostics
├─────────────────────────────────────────────────┤
│  Copilot / Autopilot / AI Brain                  │  ← Agent-facing tools
├─────────────────────────────────────────────────┤
│  Foundation (Memory, Context, LLM Budget, …)    │  ← Shared infrastructure
└─────────────────────────────────────────────────┘
```

---

## 3. Complete Module Index

### 3.1 Core Kloel Intelligence (`backend/src/kloel/` — root-level files)

| File | Purpose |
|---|---|
| `kloel.module.ts` | Master NestJS module — imports 100+ providers, 30+ controllers |
| `kloel.service.ts` | Thin orchestrator over sub-services; handles threads, thinking, follow-ups |
| `kloel.controller.ts` | REST API: think, chat, onboarding, upload, threads, memory, approvals |
| `kloel-data.controller.ts` | Data export/query endpoints for Kloel AI data |
| `kloel-thinker.service.ts` | **LLM thinking loop** — SSE streaming + sync variants; delegates to composer, reply engine, tool dispatcher |
| `kloel-composer.service.ts` | **Capability composer** — `create_image` (OpenAI DALL-E), `create_site` (Anthropic), `search_web` |
| `kloel-reply-engine.service.ts` | Reply assembly: prompt construction, expertise detection, marketing skill integration |
| `kloel-tool-dispatcher.service.ts` | Tool execution routing to chat/business-config/whatsapp/composer sub-services |
| `kloel-tool-executor.service.ts` | Tool execution: product CRUD, brand voice, autopilot toggle, web search, flows |
| `kloel-tool-executor-billing.service.ts` | Billing tool execution (payment links, plans) |
| `kloel-tool-executor-crm.service.ts` | CRM tool execution (contacts, follow-ups) |
| `kloel-tool-executor-whatsapp.service.ts` | WhatsApp tool execution (send message, audio, document) |
| `kloel-chat-tools.service.ts` | Chat tool definitions: agent jobs, evidence, memory, sessions, skill outcomes |
| `kloel-whatsapp-tools.service.ts` | WhatsApp-specific tools: contacts, conversations, messages |
| `kloel-business-config-tools.service.ts` | Business configuration tools for the AI |
| `kloel-thread.service.ts` | Thread/CRUD management, message storage, processing traces |
| `kloel-thread-search.service.ts` | Search across AI conversation threads |
| `kloel-thread-summary.service.ts` | Summarize AI conversation threads |
| `kloel-conversation-store.ts` | In-memory conversation cache + persistence |
| `kloel-workspace-context.service.ts` | Builds runtime workspace context strings for AI prompts (products, integrations, branding) |
| `kloel-workspace-context-data.service.ts` | Raw data loading for workspace context |
| `kloel-workspace-context-linked-product.service.ts` | Linked product resolution for context |
| `kloel-context-formatter.ts` | Context string formatting for AI prompts |
| `kloel-stream-events.ts` + `kloel-stream-writer.ts` | SSE streaming infrastructure |
| `kloel.prompts.ts` | Canonical system prompts (fallback, cognitive state boundaries) |
| `kloel-global-prior.service.ts` | Global Bayesian prior across workspaces (channel × decisionType × action) |
| `kloel-lead-brain.service.ts` | WhatsApp autopilot lead processing, buy-intent detection, payment generation |
| `kloel-lead-processor.service.ts` | Lead processing pipeline helpers |
| `whatsapp-brain.service.ts` | WhatsApp webhook processing: intent detection → decision outcome |
| `guest-chat.service.ts` | Public guest chat (pre-auth) via the AI |
| `conversational-onboarding.service.ts` | AI-driven onboarding conversation replacing static onboarding |
| `conversational-onboarding-tools.service.ts` | Tools for onboarding: save business info, add product, set brand voice |
| `llm-budget.service.ts` | **Per-workspace LLM cost enforcement** — fail-closed when budget exceeded |
| `daily-limit.service.ts` | Per-workspace rate limiting for AI actions |
| `decision-outcome.service.ts` | Records decisions + closes outcomes for lift measurement |
| `commercial-decision-orchestrator.service.ts` | Inbound decision orchestration: gating, channel selection, scoring, composing |
| `runtime-conversation-tracer.service.ts` | E2E conversation tracing for runtime pipelines |
| `openai-wrapper.ts` | OpenAI API wrapper with retry/fallback |
| `economic-hierarchy.ts` | Decision hierarchy levels: compliance > margin > conversion > retention > UX > learning > exploration |
| `economic-objective.ts` | Profile-aware economic scoring (b2c_ecommerce, b2b_saas, recurring_subscription) |
| `ad-rules-engine.service.ts` | AI-driven ad rules engine |
| `email-campaign.service.ts` | Email campaign service |
| `cart-recovery.service.ts` | Cart recovery automation |
| `order-alerts.service.ts` | Order alert/notification service |
| `payment.service.ts` | Payment processing |
| `smart-payment.service.ts` | AI-powered payment link generation with LLM-suggested messaging |
| `leads.service.ts` | Lead management service |
| `pdf-processor.service.ts` | PDF parsing and processing |
| `audio.service.ts` | Text-to-speech via OpenAI TTS (with SSRF-safe URL fetching) |
| `channel-setup.service.ts` | Channel setup (WhatsApp, Instagram, Messenger, TikTok, Email) |
| `channel-transport.registry.ts` | Channel transport registry (multi-channel) |

### 3.2 Unified Agent Subsystem

| File | Purpose |
|---|---|
| `unified-agent.service.ts` | **Main orchestrator**: context → LLM → tool dispatch → response composition |
| `unified-agent-context.service.ts` | System prompt construction, lead tactical hints |
| `unified-agent-context-data.service.ts` | DB data loading for agent context |
| `unified-agent-response.service.ts` | Response extraction from LLM output (structured tool calls, text) |
| `unified-agent-actions.service.ts` | Action execution coordinator |
| `unified-agent-actions-messaging.service.ts` | Messaging action execution (WhatsApp, etc.) |
| `unified-agent-actions-crm.service.ts` | CRM action execution (contacts, deals) |
| `unified-agent-actions-sales.service.ts` | Sales action execution (orders, payments) |
| `unified-agent-actions-workspace.service.ts` | Workspace/configuration action execution |
| `unified-agent-actions-billing.service.ts` | Billing action execution |
| `unified-agent-actions-commerce.service.ts` | Commerce action execution |
| `unified-agent-tool-router.ts` | Routes tool calls to appropriate action services |
| `unified-agent.types.ts` | Shared types: ToolArgs, ActionEntry, PredecidedAction |

### 3.3 Brain Subsystem (`brain-*` + `brain/`)

| File | Purpose |
|---|---|
| `brain-runtime.service.ts` | **Brain runtime loop**: observe → decide → execute with capability registry |
| `brain-runtime.controller.ts` | Brain runtime REST API endpoints |
| `brain-runtime.dto.ts` | DTOs for brain runtime (BrainDecideDto, BrainObserveDto) |
| `brain-capability-registry.service.ts` | Registry of registered brain capabilities |
| `brain-capability-executor.service.ts` | Executes brain capabilities |
| `brain-autonomy.service.ts` | Autonomy level management for brain operations |
| `brain-commercial-graph.service.ts` | Builds workspace commercial graphs (nodes, edges) from events/beliefs/policies |
| `brain-commercial-graph.persistence.ts` | Persistence layer for commercial graph data |
| `brain-event-spine.service.ts` | Event writing to the spine (AutopilotEvent persistence) |
| `brain-event-taxonomy.ts` | Taxonomy of brain events |
| `brain-action-event-mapper.ts` | Maps brain actions to domain events |
| `brain/brain-spine-audit.service.ts` | SQL-based spine audit: capability × spine event mismatch detection |
| `admin/brain/brain-audit.controller.ts` | Admin-only spine audit endpoint |

### 3.4 MIND Cognitive Subsystem (`backend/src/kloel/` — mind-related files)

The MIND subsystem implements Bayesian cognition with belief tracking, decision policies, multi-armed bandits, and simulation:

| File | Purpose |
|---|---|
| `mind.service.ts` | **Main cognitive tick loop**: perceive → predict → surprise → update beliefs → decide |
| `mind-belief.service.ts` | Bayesian belief tracking (Beta distribution: α wins, β losses) with global priors |
| `mind-policy.service.ts` | Decision policy with counterfactual baseline comparison, cold-start handling |
| `mind-bandit.service.ts` | Multi-armed bandit (Thompson Sampling) for A/B testing decisions |
| `mind-perception.service.ts` | Event perception — raw events → structured perceptions |
| `mind-surprise.service.ts` | Prediction surprise tracking — logs prediction errors |
| `mind-event-processor.service.ts` | Event processing pipeline from spine events |
| `mind-case-memory.service.ts` | Case-based memory — stores past decision contexts for replay |
| `mind-predictor.service.ts` | Predicts outcomes given context + action |
| `mind-processor.service.ts` | BullMQ-based scheduler + worker for periodic MIND ticks |
| `mind-observability.service.ts` | Observability: state snapshots, strongest/uncertain beliefs, bandit arms, decisions |
| `mind-report.service.ts` | Generate MIND lift reports + quality reports |
| `mind-replay.service.ts` | Replay historical decisions to validate counterfactual accuracy |
| `mind-simulator.service.ts` | End-to-end simulation: replay + quality + summary |
| `mind-synthetic-generator.service.ts` | Synthetic data generation for simulation |
| `mind-verbalizer.service.ts` | Natural language verbalization of MIND decisions |
| `mind-workspace-state.service.ts` | Workspace state management (tick leases, watermarks) |
| `mind-global-prior.service.ts` | Global Bayesian priors aggregated across workspaces (anonymized) |
| `mind-guards.service.ts` | Safety/confidence guards for decisions |
| `mind-guard-context-builder.service.ts` | Builds context for guard evaluation |
| `mind-quality.service.ts` | Quality scoring for decisions |
| `mind-lift-report.service.ts` | Lift report generation (outcome-based) |
| `mind-concepts.service.ts` | Concept classification for commercial decisions |
| `mind-decision-catalog.ts` | Catalog of known decision types |
| `mind-decision-baselines.ts` | Baseline definitions for decisions |
| `mind-catalog-decision-resolvers.ts` | Resolvers: tone, message format, coupon, objection, audio vs text |
| `mind-commercial-decision-resolvers.ts` | Commercial resolvers: channel choice, human transfer, product offer, broadcast window |
| `mind-recovery-decision-resolvers.ts` | Recovery decision resolvers |
| `mind-belief-by-channel.ts` | Channel-specific belief extraction |
| `mind-case-memory-decision.helper.ts` | Case memory decision helpers |
| `mind-policy-calculation.ts` | Core policy math (baseline, counterfactual, fallback) |
| `mind-code-native.types.ts` | TypeScript types for code-native MIND operations |
| `mind-controller.ts` | REST API for MIND observability/management |
| `mind.types.ts` | Core MIND types: MindTick, MindBelief, MindPolicyDecision, MindPrediction |

### 3.5 Strategic Intelligence Camadas (Layers)

#### 3.5.1 Insight (`insight/` — 10 files)
**Camada VII** — Strategic Insight Engine. Detects actionable business insights:
- **Detectors**: funnel-bottleneck, offer-fit, objection-pattern, qualification-leak, cooling-window, pricing-elasticity, channel-roi, product-positioning
- **Key services**: `insight-delivery.service.ts` (delivers at right time/channel), `insight-ranker.ts` (ranks by financial impact × confidence)
- Target: ≥1 strategic insight per workspace per month

#### 3.5.2 Offer (`offer/` — 9 files)
**Camada XV** — Offer Evolution Intelligence. Detects what to change in product/offer:
- **Detectors**: bonus-desirability, promise-strength, product-version-fit, positioning-mismatch, page-promise-mismatch, pricing-psychology
- **Key services**: `offer-delivery.service.ts`, `offer-insight.ranker.ts`

#### 3.5.3 Wisdom (`wisdom/` — 19 files)
**Camada VI** — Cross-Workspace Commercial Wisdom. Extracts abstract patterns across workspaces:
- **Protections**: k-anonymity, differential privacy noise — no identifiable data crosses workspace boundaries
- **Key services**: `wisdom-pattern-extractor.service.ts`, `wisdom-privacy-guard.service.ts`, `wisdom-projector.service.ts`, `wisdom-validator.ts`
- **Patterns**: objection_pattern, channel_efficiency, conversion_lever, etc.

#### 3.5.4 Wow (`wow/` — 10 files)
**Camada XI** — First-Hour Wow. Delivers value shock in first minutes of workspace activation:
- **Pipeline**: history ingestion → wisdom/insight/maturity consumers → rank by impact → package with evidence → filter by confidence floor
- **Key services**: `first-hour.orchestrator.service.ts`, `cold-start-ingestion.service.ts`, `pattern-detector.service.ts`

### 3.6 Operational Intelligence Layers

#### 3.6.1 Agency (`agency/` — 17 files)
**Camada XXV** — Agency Intelligence. Portfolio management for agencies:
- `portfolio-state.service.ts` — Consolidated portfolio state
- `margin-per-client.tracker.ts` — Per-client margin tracking
- `churn-risk-per-client.detector.ts` — Churn risk with signals
- `priority.ranker.ts` — Priority ranking (agora/esta_semana/em_breve/sustentar)
- `team-load-balancer.ts` — Team load balancing
- `handoff.service.ts` — Client handoff service

#### 3.6.2 Coldstart (`coldstart/` — 12 files)
**Camada XVII** — Cold-Start Discovery. Empresa sem histórico → primeira verdade em ≤30 dias:
- `no-history-mode.detector.ts` — Detects new workspaces
- `first-truth.detector.ts` + `first-truth-roadmap.builder.ts` — Roadmap to first truth
- `guided-question.generator.ts` + `hypothesis-template-bank.ts` — Question generation
- `micro-test.designer.ts` + `progress.tracker.ts` — Progress tracking

#### 3.6.3 Delegation (`delegation/` — 11 files)
**Camada XIII** — Delegation Confidence per operational area:
- `delegation-state.tracker.ts` — Per-area confidence tracking
- `graduation.detector.ts` — Detects when area is ready to graduate
- `autonomy-suggestion.builder.ts` — Proposes autonomy expansion with evidence
- `autonomy-rollback.policy.ts` — Rollback when confidence breaks
- `area-by-area-graduation.service.ts` — Graduation progression

#### 3.6.4 Recovery (`recovery/` — 13 files)
**Camada XIV** — Mature Failure Recovery. Converts errors into trust-building:
- `self-error-detector.ts` — Self-detection of errors
- `error-acknowledgment.builder.ts` — Honest acknowledgment
- `error-explanation.builder.ts` + `error-narrative.builder.ts` — Commercial explanation
- `error-non-repeat.guard.ts` — Non-repeat guarding
- `error-damage-recovery.tactics.ts` — Damage recovery
- `trust-after-error.tracker.ts` — Trust trajectory tracking

#### 3.6.5 Role (`role/` — 13 files)
**Camada XXIII** — Role-Aware Intelligence:
- `role.detector.ts` — Detects role from usage patterns (produtor/afiliado/agencia/gestor/closer/creator/especialista)
- `leverage-map.service.ts` — Maps real levers per role
- `recommendation-guard.ts` — Guards: no suggestion outside control radius
- `multi-hat.service.ts` — Multi-role profile handling

#### 3.6.6 Cash (`cash/` — 15 files)
Cash position intelligence:
- `cash-position.tracker.service.ts` — Real-time cash position
- `runway.calculator.ts` — Runway projection
- `receivables.projector.ts` + `payables.projector.ts` — Cash flow projection
- `risk.detector.ts` + `volatility.tracker.ts` — Financial risk detection
- `protective-action.suggester.ts` — Protective action suggestions
- `unsafe-operation.blocker.ts` — Blocks unsafe financial operations

#### 3.6.7 Creator (`creator/` — 13 files)
Creator economy intelligence:
- `audience-saturation.detector.ts` — Audience fatigue detection
- `audience-partner-fit.detector.ts` — Partner-audience fit
- `authenticity.protector.ts` — Authenticity guard
- `creator-trust-capital.tracker.ts` — Trust capital metrics
- `engagement-vs-conversion.tracker.ts` — Balance tracking
- `mention-timing.advisor.ts` — Optimal mention timing

#### 3.6.8 Commem (`commem/` — 15 files)
Commercial memory layer:
- `ledger.service.ts` — Immutable commercial ledger
- `memory.projector.ts` — Memory projection
- `narrative.builder.ts` — Commercial narrative building
- `value-quantifier.service.ts` — Quantifies commercial value
- `time-machine.service.ts` — Historical replay

#### 3.6.9 Defens (`defens/` — 17 files)
Defensibility building:
- `asset-growth.tracker.service.ts` — Asset growth tracking
- `positioning-uniqueness.detector.ts` — Uniqueness detection
- `owned-audience.builder.ts` — Audience ownership building
- `social-proof.harvester.ts` — Social proof gathering
- `defensibility-narrative.builder.ts` — Narrative building

#### 3.6.10 Additional Operational Layers

| Layer | Dir | Files | Purpose |
|---|---|---|---|
| Channel | `channel/` | 11 | Channel health, concentration, diversification, migration |
| Channel Survival | `channel-survival/` | 4 | Channel health monitoring |
| Clarity | `clarity/` | 12 | Clarity/transparency intelligence |
| Drift | `drift/` | 7 | Model drift detection |
| Ecosys | `ecosys/` | 9 | Ecosystem intelligence (conflict detection, cross-role patterns) |
| Evol | `evol/` | 18 | Evolution tracking |
| Goal Field | `goal-field/` | 7 | Automatic goal emergence and promotion |
| Healthy Money | `healthymoney/` | 4 | Revenue quality scoring |
| Hypproof | `hypproof/` | 17 | Hypothesis testing/proof |
| Incent | `incent/` | 13 | Incentive/commission intelligence |
| Legit | `legit/` | 19 | Legitimacy verification |
| Maturity | `maturity/` | 8 | Workspace maturity classification |
| Move | `move/` | 5 | Friction detection, step decomposition |
| Offer (ads) | `offer/` | 9 | Offer optimization |
| Owner Criterion | `owner-criterion/` | 6 | Owner-defined ethical lines, tone, risk tolerance |
| Proof Level | `proof-level/` | 4 | Evidence requirement levels per action |
| Team | `team/` | 13 | Team intelligence: blind spots, follow-ups, handoff, pre-call context |
| Trust | `trust/` | 12 | Trust building and repair |
| V-Tier | `v-tier/` | 6 | Value tier classification |

#### 3.6.11 Postsale & Emitters

| Layer | Dir | Files | Purpose |
|---|---|---|---|
| Postsale Consumers | `postsale-consumers/` | 26 | Post-sale event consumers |
| Post-Sale Emitter | `post-sale-emitter/` | 2 | Post-sale event emission |
| Campaign Emitter | `campaign-emitter/` | 2 | Campaign event emission |
| Checkout Emitter | `checkout-emitter/` | 2 | Checkout event emission |
| CRM Emitter | `crm-emitter/` | 2 | CRM event emission |
| KYC Emitter | `kyc-emitter/` | 2 | KYC event emission |
| Member Area Emitter | `member-area-emitter/` | 2 | Member area event emission |
| WhatsApp Emitter | `whatsapp-emitter/` | 3 | WhatsApp event emission |
| Event Emit Audit Emitter | `event-emit-audit-emitter/` | 3 | Event emission auditing |

### 3.7 Infrastructure Subsystems

#### 3.7.1 Memory (`backend/src/kloel/` — memory-* files)

| File | Purpose |
|---|---|
| `memory.service.ts` | Facade: save, search, get context, get knowledge |
| `memory-crud.service.ts` | CRUD operations with embedding generation |
| `memory-search.service.ts` | Semantic search via vector similarity |
| `memory-management.service.ts` | TTL expiration, dedup, orphans (runs via cron) |
| `memory-stats.ts` | Memory statistics computation |
| `memory.controller.ts` | REST API for memory operations |
| `memory.types.ts` | Shared types: MemoryItem, SearchResult |

#### 3.7.2 Agent Runtime (`agent-runtime/` — 35 files)
The agent runtime subsystem provides infrastructure for long-running AI agents:

| File | Purpose |
|---|---|
| `agent-runtime.session-store.ts` | Session persistence |
| `agent-runtime.skill-registry.ts` | Skill registration/discovery |
| `agent-runtime.context.ts` | Context building service |
| `agent-runtime.context-compressor.ts` | Context compression (token limits) |
| `agent-runtime.memory-provider.ts` | Built-in memory provider |
| `agent-runtime.memory-curator.ts` | Memory curation |
| `agent-runtime.memory-manager.ts` | Memory management |
| `agent-runtime.evidence-store.ts` | Evidence storage |
| `agent-runtime.policy.ts` | Agent runtime policy |
| `agent-runtime.pulse-self-model.ts` | Self-model via PULSE |
| `agent-runtime.scheduler.ts` | Job scheduling |
| `agent-runtime.job-runner.ts` | Job runner (imported in kloel.module) |
| `agent-runtime.delegation.ts` | Delegation logic |
| `agent-runtime.types.ts` | Shared types |

#### 3.7.3 Other Infrastructure

| Layer | Dir | Files | Purpose |
|---|---|---|---|
| ABI | `abi/` + `abi-ab/` | 17 | ABI prompt protocol builder/validator |
| Affil | `affil/` | 16 | Affiliate intelligence |
| Capability Registry | `capability-registry/` | 5 | Capability registration |
| Channel Policy | `channel-policy/` | 4 | Channel repertoire config |
| Daily Dashboard | `daily-dashboard/` | 7 | Daily dashboard contract/service |
| DTO | `dto/` | 4 | Data transfer objects |
| Lineage | `lineage/` | 13 | Data lineage tracking |
| Local Identity | `local-identity/` | 6 | Local identity management |
| Marketing Skills | `marketing-skills/` | 9 | Marketing skill catalog + router |
| Middleware | `middleware/` | 2 | Audit log middleware |
| Observability | `observability/` | 7 | Observability infrastructure |
| Pulse Gates | `pulse-gates/` | 36 | PULSE governance gates |
| Risk Class | `risk-class/` | 8 | Risk classification |
| Rules | `rules/` | 7 | Kloel rules module |
| Spine | `spine/` | 6 | Event spine (coverage audit, emitter) |
| Tipo Negócio | `tipo-negocio/` | 5 | Business type classification |
| Mercado Entrada | `mercado-entrada/` | 2 | Mercado Pago integration |
| Product Sub-Resources | `product-sub-resources/` | 15 | Product sub-resource controllers (plans, checkout, coupons, campaigns, etc.) |

### 3.8 External AI Modules (sibling to `kloel/`)

#### 3.8.1 Copilot (`backend/src/copilot/` — 9 files)
WhatsApp sales copilot suggesting reply messages:
- `copilot.service.ts` — Suggests replies based on conversation history + knowledge base
- `copilot.controller.ts` — REST endpoints for suggestions
- `copilot.gateway.ts` — WebSocket gateway for real-time suggestions

#### 3.8.2 Autopilot (`backend/src/autopilot/` — 26 files)
Automated marketing automation:
- `autopilot.service.ts` — Orchestrator delegating to analytics, cycle, ops
- `autopilot-analytics.service.ts` — Stats, impact, insights, money reports
- `autopilot-analytics-insights.service.ts` — AI-generated marketing insights
- `autopilot-analytics-report.service.ts` — Report generation
- `autopilot-cycle.service.ts` — Legacy execution cycle (conversation processing)
- `autopilot-cycle-executor.service.ts` — Per-conversation cycle execution
- `autopilot-cycle-money.service.ts` — Money-related cycle operations
- `autopilot-ops.service.ts` — Pipeline status, smoke tests, enqueue
- `autopilot-ops-conversion.service.ts` — Conversion operations
- `segmentation.service.ts` — Customer segmentation

#### 3.8.3 CIA (`backend/src/cia/` — 24 files)
**C**entral **I**ntelligence **A**ssistant — the user-facing AI intelligence hub:
- `cia.service.ts` — Surface: operational intelligence, human tasks, cognitive highlights
- `cia-runtime.service.ts` — Runtime state management with port/adapter architecture
- `cia-bootstrap.service.ts` — Cold-start bootstrapping for new workspaces
- `cia-chat-filter.service.ts` — Filters chat messages for CIA relevance
- `cia-send-helpers.service.ts` — Send message helpers
- `cia-backlog-run.service.ts` — Backlog processing
- `cia-remote-backlog.service.ts` — Remote backlog management
- `cia-runtime-state.service.ts` — Runtime state persistence
- `cia-inline-fallback.service.ts` — Fallback when CIA primary path fails

#### 3.8.4 AI Brain (`backend/src/ai-brain/` — 18 files)
Knowledge and media intelligence:
- `knowledge-base.service.ts` — RAG pipeline: URL scraping, chunking (1000 chars, 200 overlap), OpenAI embeddings, vector search
- `vector.service.ts` — OpenAI `text-embedding-3-small` embeddings
- `agent-assist.service.ts` — LLM-powered: sentiment analysis, conversation summary, reply suggestions, pitch generation — with wallet-based billing (`chargeAiUsageIfNeeded`)
- `hidden-data.service.ts` — Extracts hidden structured data from conversations
- `media-factory.service.ts` — Media generation/transformation

#### 3.8.5 Media / Audio / Video / Voice

| Module | Files | Purpose |
|---|---|---|
| `media/` | 12 | Media upload (docs), video job creation via BullMQ |
| `audio/` | 5 | Audio transcription via OpenAI Whisper (with retry + SSRF-safe) |
| `video/` | 5 | Video generation job management |
| `voice/` | 7 | Voice profile creation, TTS audio generation via BullMQ |

#### 3.8.6 Chat / Calendar / Dashboard / Alerts

| Module | Files | Purpose |
|---|---|---|
| `chat/` | 7 | Chat message CRUD with cursor pagination |
| `calendar/` | 7 | Calendar integration with provider settings |
| `dashboard/` | 8 | Home aggregation: operational health, response time, setup checkpoints |
| `alerts/` | 2 | WebSocket gateway for real-time operational alerts (Redis pub/sub) |
| `admin/chat/` | 7 | Admin chat: session management, workspace search tools |
| `admin/dashboard/` | 12 | Admin KPI dashboard: GMV, revenue, producers, breakdown queries |

---

## 4. Data Flow Architecture

### 4.1 Message Processing Pipeline (Simplified)

```
WhatsApp Webhook → WhatsAppBrainService
  → detects intent (purchase/interest/support/etc.)
  → MindService.tick() for cognitive update
  → CommercialDecisionOrchestratorService
    → gating → channel selection → scoring → compose → reply
  → UnifiedAgentService.processMessage()
    → context loading → LLM call → tool dispatch → response
```

### 4.2 Cognitive Tick (MIND)

```
MindProcessorService (BullMQ scheduler, interval ~30s)
  → MindService.tick(workspaceId)
    → MindPerceptionService.perceive(events)
    → MindPredictorService.predict(perceptions)
    → MindSurpriseService.detect(predictions, actuals)
    → MindBeliefService.update(surprises)
    → MindPolicyService.choose(context)
      → MindBanditService.register (multi-armed bandit)
    → MindEventProcessorService.emit(decisions)
```

### 4.3 Brain Runtime Loop

```
BrainRuntimeController.observe(events)
  → BrainRuntimeService.observeAndDecide(workspaceId, messages, capability, constraints)
    → BrainCommercialGraphService.buildWorkspaceGraph()
    → generate recommendations
    → build predecided actions
    → route to capability executor
  → BrainEventSpineService.write() for persistence
```

### 4.4 LLM Budget Enforcement

```
All LLM call sites → call estimateChatCostCents()
  → LLMBudgetService.chargeWorkspaceLlmCost(workspaceId, costCents)
    → Redis INCRBY atomic increment
    → if exceeds budget → ForbiddenException
  → (on success) OpenAI API call
```

---

## 5. Key Design Patterns

### 5.1 Cognitive Organism Architecture
The system implements a **cognitive organism** model from the project's architecture document:
- **Perception** (`MindPerceptionService`) — raw events → structured observations
- **Belief** (`MindBeliefService`) — Bayesian priors updated with evidence
- **Policy** (`MindPolicyService`) — optimal action selection
- **Surprise** (`MindSurpriseService`) — prediction error tracking for learning
- **Bandit** (`MindBanditService`) — Thompson sampling for exploration/exploitation

### 5.2 Layered Delegation (Camadas)
Each operational area has its own "camada" with graduated delegation:
```
manual → supervised → semi_autonomous → autonomous
```

### 5.3 Counterfactual Decision Evaluation
Every MIND decision records a baseline action alongside the chosen action. Outcomes are compared to compute **lift** — the improvement over the baseline.

### 5.4 Privacy-First Cross-Workspace Learning
The Wisdom layer uses **k-anonymity** and **differential privacy** to extract cross-workspace patterns without exposing identifiable data.

### 5.5 Fail-Closed LLM Budget
`LLMBudgetService` enforces per-workspace budget limits fail-closed — exceeding the budget returns `ForbiddenException` before any API call is made.

---

## 6. Improvement Suggestions

### 6.1 Structural

1. **Module boundary clarity**: 707 non-test files in a single NestJS module (`KloelModule`) with 100+ providers is a build-time and maintainability concern. Consider splitting into feature modules (e.g., `MindModule`, `BrainModule`, `MemoryModule`, `ToolsModule`).

2. **Duplicate "camada" patterns**: Many layers follow identical structural patterns (types → detector → ranker → deliverer). Consider extracting a shared "camada" base class/interface to reduce boilerplate.

3. **AGENT_RUNBOOK.md reference**: The `AGENTS.md` references `docs/ai/AGENT_RUNBOOK.md` — ensure this exists and is current.

### 6.2 Performance

4. **MIND tick frequency**: The processor runs every ~30s per workspace. At scale, consider adaptive tick frequency based on workspace activity level.

5. **LLM budget cache granularity**: The per-month Redis key approach is simple but doesn't handle mid-month plan upgrades. Consider sliding windows.

6. **Context formatter limits**: `KloelWorkspaceContextService` has hard-coded limits (e.g., `workspaceProductPlanLimit: 3`). These should be configurable or auto-tuned based on model context windows.

### 6.3 Coverage

7. **Autopilot legacy mode**: `autopilot-cycle.service.ts` has `ENABLE_LEGACY_BACKEND_AUTOPILOT` flag — determine if this can be removed or if migration to the Brain Runtime is complete.

8. **Brain vs Unified Agent**: There are two parallel LLM orchestration paths (Brain Runtime + Unified Agent). Clarify the relationship — is one replacing the other, or are they complementary?

9. **CIA dependency on MindService**: `CiaService` directly accesses `MindService.lift()` — ensure this coupling is intentional vs. going through an event-based interface.

### 6.4 Test Coverage

10. **Spec file ratio**: 368 spec files vs 707 source files (52% spec file ratio). While each service has a spec, the heavy use of `part2`, `part3`, `part4` naming suggests tests are growing organically. Consider test file consolidation for readability.

---

## 7. Start Here

For any agent beginning work in the Kloel AI layer, open these files first:

1. **`backend/src/kloel/kloel.module.ts`** — Master module showing all providers, controllers, and imports
2. **`backend/src/kloel/kloel.service.ts`** — Main orchestrator entry point
3. **`backend/src/kloel/unified-agent.service.ts`** — Primary LLM agent orchestrator
4. **`backend/src/kloel/mind/mind.service.ts`** — Cognitive tick loop — the "brain" of the system
5. **`backend/src/kloel/mind/mind.types.ts`** — Core cognitive types (MindTick, MindBelief, etc.)
6. **`backend/src/kloel/brain-runtime.service.ts`** — Brain runtime loop (observe → decide → execute)
7. **`backend/src/kloel/commercial-decision-orchestrator.service.ts`** — Inbound decision pipeline
8. **`backend/src/cia/cia.service.ts`** — CIA intelligence surface
9. **`backend/src/ai-brain/knowledge-base.service.ts`** — RAG pipeline
10. **`backend/src/kloel/llm-budget.service.ts`** — LLM cost enforcement

---

## 8. Key Architectural Files

| File | Why Critical |
|---|---|
| `kloel.module.ts` | Module composition — the dependency graph |
| `kloel.service.ts` | Orchestrator — think, chat, tool dispatch |
| `unified-agent.service.ts` | Primary LLM agent — context → LLM → tools → response |
| `mind.service.ts` | Cognitive tick loop |
| `brain-runtime.service.ts` | Brain observe→decide→execute |
| `commercial-decision-orchestrator.service.ts` | Inbound message routing decisions |
| `kloel-thinker.service.ts` | SSE streaming LLM loop |
| `kloel-reply-engine.service.ts` | Reply assembly with marketing skills |
| `kloel-composer.service.ts` | DALL-E/Anthropic/web search capabilities |
| `llm-budget.service.ts` | Fail-closed LLM cost enforcement |
| `memory-management.service.ts` | TTL/dedup/orphan cleanup via cron |
| `decision-outcome.service.ts` | Lift measurement infrastructure |
| `economic-hierarchy.ts` | Decision priority rules (compliance > margin > ...) |

---

*Document generated by scouting agent on 2026-05-19. Covers all subdirectories of `backend/src/kloel/` plus the 14 external AI-related modules.*
