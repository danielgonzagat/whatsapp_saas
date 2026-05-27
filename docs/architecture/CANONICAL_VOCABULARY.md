# Kloel Canonical Vocabulary

> The single source of truth for naming. Every concept has **one canonical
> name** + a list of forbidden/deprecated aliases. Code, docs, prompts,
> events, schemas, and UI labels all reference these names.

Updated 2026-05-26 with OmniCore (ADR-0012) and Kloel Mind (ADR-0013) decisions.

## Domains (top-level)

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `Workspace` | `Tenant`, `Org`, `Account` (in scope context) | The multi-tenant unit |
| `Marketing` | `OmniCore`, `Omnichannel` (as umbrella concept) | Top-level umbrella; channels are sub-domain of marketing |
| `Channel` | `Provider` (when referring to the channel concept), `Platform` | A messaging surface (WhatsApp, Instagram, Facebook, Messenger, Email, TikTok) |
| `Mind` | `Brain`, `Cognitive`, `AI-Brain`, `CIA` (legacy adapter only) | The cognitive engine. ADR-0013 unifies these under `kloel/mind/`. |
| `UnifiedAgent` | `Agent` (when ambiguous) | Executor layer per ADR-0006. Distinct from `Mind`. |
| `Contact` | `Lead`, `Client`, `Customer`, `Prospect`, `User` (in messaging context) | General entity; `Lead`/`Customer` allowed only as funnel-stage labels |

## Channel terminology (ADR-0012)

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `ChannelKind` | `Provider` (channel-type sense), `Platform`, `Kind` | Enum: WHATSAPP / INSTAGRAM / FACEBOOK / MESSENGER / EMAIL / TIKTOK / INTERNAL_PARTNERSHIP / INTERNAL_ADMIN |
| `ChannelSendInput` | `MessagePayload`, `SendArgs`, `OutboundMessage` (as send-input concept) | Discriminated union in `backend/src/common/channel-dispatch/channel-dispatch.port.ts` |
| `ChannelDispatchPort` | `MessageDispatchPort`, `SendPort`, `OutboundPort` | The port interface every adapter implements |
| `ChannelDispatchRegistry` | `MessageDispatchRegistry`, `SendRegistry`, `OutboundRegistry` | The single public entry point for outbound message send |
| `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession` | Authoritative session entity across all messaging channels |
| `ChannelOnboarding` | `ChannelSetup`, `ChannelConnect`, `Connection setup` | Onboarding flow that registers a channel for a workspace |
| `*DispatchAdapter` | `*Provider` (when in port-adapter role), `*Sender` | Suffix `DispatchAdapter` for any class implementing `ChannelDispatchPort` |

## Message terminology

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `Message` | `ChatMessage`, `KloelMessage`, `FbMessage`, `PartnerMessage` (as concept) | The Prisma table fragmentation is real (5 tables) — ADR-0014 will unify schema; this canonical applies to TS types and APIs first. |
| `MessageDispatchService` | `WahaService.sendMessage`, `WhatsappApiService.sendText`, `MessageWorker.process` (in send role) | Public service-level entry; calls into `ChannelDispatchRegistry`. |
| `MessageDispatchAdapter` | `WhatsappDispatch`, `EmailDispatch` (when used unqualified) | Channel-specific implementation of `ChannelDispatchPort` |

## Cognitive terminology (ADR-0013)

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `MindService` | `BrainService`, `CognitiveService`, `KloelMindService`, `AIBrainService` | The single Mind entry point |
| `MindRuntime` | `BrainRuntime`, `CognitiveRuntime` | Runtime orchestrator within Mind |
| `MindEventSpine` | `BrainEventSpine`, `CognitiveSpine` | Event bus inside Mind; re-emits raw events as `mind.*` |
| `MindAutonomyCoordinator` | `BrainAutonomy`, `AutonomyService` (cognitive context) | Manages autonomy decisions |
| `MindCapabilityRegistry` | `BrainCapabilityRegistry`, `CapabilityRegistry` (cognitive context) | Registry of cognitive capabilities |
| `MindCapabilityExecutor` | `BrainCapabilityExecutor` | Executes cognitive capabilities |
| `MindCommercialGraph` | `BrainCommercialGraph`, `CommercialGraphService` (cognitive context) | Knowledge graph of commercial relationships |
| `MindKnowledgeBase` | `KnowledgeBaseService` (in ai-brain/) | Knowledge layer of Mind |
| `MindVectorStore` | `VectorService` (in ai-brain/) | Vector storage for Mind |
| `MindMediaFactory` | `MediaFactoryService` (in ai-brain/) | Media generation for Mind |
| `MindKnowledgeAssist` | `AgentAssistService` (in ai-brain/) | Knowledge-augmented assistance |
| `MindHiddenDataExtractor` | `HiddenDataExtractorService` (in ai-brain/) | Latent signal extraction |
| `MindSpineAudit` | `BrainSpineAuditService` (in brain/) | Audit of spine events |
| `MindLearningAdapter` (CIA-legacy) | `CiaService` | Learning adapter per ADR-0006; kept scoped under `kloel/mind/cia/` |
| `WhatsAppMindCoordinator` | `WhatsAppBrainService` | Per-channel cognitive coordinator |
| `LeadMindCoordinator` | `KloelLeadBrainService` | Per-lead cognitive coordinator |

## Identity / auth

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `AuthService` | `Login`, `Authenticator` (in auth flow context) | Single non-admin auth |
| `AdminAuthService` | (no aliases) | Distinct admin-only auth |
| `JwtAuthGuard` | `AuthGuard` (when used unqualified) | The non-admin guard |
| `WorkspaceGuard` | `TenantGuard`, `MultiTenantGuard` | Workspace isolation guard |
| `resolveWorkspaceId` | `getWorkspaceId`, `resolveWorkspaceHeader`, `resolveWorkspaceFromAuthPayload`, `resolveWorkspaceSelfIdentity`, `resolveWorkspaceTimezone` (when used as primary resolver) | Backend canonical; frontend canonical is `resolveWorkspaceFromAuthPayload`; worker has its own variants intentionally |

## Persistence / utilities

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `PrismaService` | `DatabaseService`, `DbService`, `Repository` (when used as DB-access) | Single Prisma client injectable |
| `normalizePhone` (canonical) | `normalizePhone` (×6 across files), `normalizeNumber`, `formatPhone`, `normalizePhoneDigits` | Canonical location: `backend/src/common/phone/phone-normalization.util.ts` (NEW — currently DUP-spread) |
| `formatBRL` (canonical) | `formatBRL` (×3) | Canonical: `backend/src/common/money.ts`. Frontend re-exports it. |
| `IdempotencyService` | `Idempotency` (when used as concept) | Single point for idempotency tokens |
| `IdempotencyGuard` | (no aliases) | Per-request guard wrapping the service |
| `forEachSequential` | (×3 across backend/frontend/worker) | Canonical: `backend/src/common/async-sequence.ts`. Cross-workspace dups documented in DEPRECATION_MAP. |

## Web boundary

| Canonical | Aliases to migrate | Notes |
|---|---|---|
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |
| `WebhookEvent` (Prisma) | (no aliases) | Single audit-trail table for inbound webhooks |
| `OutboxEvent` | `MindOutboxEvent` (as concept) | Outbound event audit |

## Event naming (ADR-0013, EVENT_TAXONOMY.md)

Convention: `<domain>.<entity>.<verb-past>`

- `mind.message.received` — replaces `kloel.message.created`
- `mind.action.executed` — replaces `kloel.action.executed`
- `mind.product.observed` — re-emitted from raw `product.created` by MindEventSpine
- `mind.plan.observed` — re-emitted from raw `plan.created`
- `channel.session.connected` — when a channel becomes ready for sending
- `channel.session.disconnected`
- `channel.message.sent` — successful outbound via `ChannelDispatchRegistry`
- `channel.message.failed`
- `channel.message.received` — inbound from any channel provider
- `checkout.created` / `checkout.completed` / `payment.approved` / `payment.failed`
- `campaign.action.scheduled` / `campaign.action.executed`

Raw CRUD events (`product.created`, `product.updated`, etc.) remain as **origin
events** emitted by CRUD services. The `MindEventSpine` re-emits each as
`mind.<origin>.observed`. Aliases are published in parallel for 4 weeks.

## How to add an entry

1. Find duplication: `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`.
2. Pick the canonical name (domain-clear, no abbreviation, suffix by role).
3. List all aliases.
4. Add row above.
5. Migration codemod reads this table for safe renames via
   `mcp__atomic-edit__atomic_rename_symbol_cross_file`.

## How this is enforced

- `scripts/ops/check-canonical-vocabulary.mjs` (gate) scans new code for
  alias names; emits warning the first 4 weeks, error after.
- Codacy custom rule (TODO) ratchets the count of alias occurrences down
  over time.
- New PR introducing a new term checks this file first; if absent, PR adds
  the row.
