# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, with its replacement and migration deadline.
> Populated 2026-05-26 from `DUPLICATION_REGISTER.md`, `SEND_MESSAGE_CANONICAL.md`,
> ADR-0012 (OmniCore), and ADR-0013 (Kloel Mind unification).

## Conventions

- **Deadline**: deletion target. Code is removed when deadline passes AND
  `scripts/ops/check-canonical-services.mjs` confirms 0 callers.
- **Status**: `proposed` (not yet aliased) / `aliased` (deprecated re-export
  in place) / `unwired` (no callers detected) / `removed` (final state).
- **Replacement**: file path of canonical symbol. Codemod can read this
  map and apply renames via `mcp__atomic-edit__atomic_rename_symbol_cross_file`.

## Channel dispatch (ADR-0012, SEND_MESSAGE_CANONICAL.md)

| # | Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|---|
| 1 | `sendMessage` in `backend/src/whatsapp/providers/provider-registry-messaging.ts:28` | `WhatsAppDispatchAdapter.send()` (new, `backend/src/common/channel-dispatch/adapters/`) | 2 weeks after Step 8 of SEND_MESSAGE_CANONICAL.md migration | proposed |
| 2 | `sendMessage` in `backend/src/whatsapp/providers/provider-send-message.helpers.ts:28` | `WhatsAppDispatchAdapter.send()` | 2 weeks after Step 8 | proposed |
| 3 | `sendMessage` in `backend/src/partnerships/partnerships.chat.helpers.ts:105` | `InternalPartnershipDispatchAdapter.send()` (new) | 2 weeks after Step 8 | proposed |
| 4 | `sendWhatsappMessage` in `frontend/src/lib/api/whatsapp.ts:424` | Inline `apiFetch('/whatsapp/:ws/send', ...)` (zero consumers detected) | Immediate on Step 9 | unwired |
| 5 | `sendWhatsappTemplate` in `frontend/src/lib/api/whatsapp.ts:444` | Inline `apiFetch` (zero consumers) | Immediate on Step 9 | unwired |
| 6 | `WhatsAppProviderRegistry.sendMessage()` in `backend/src/whatsapp/providers/provider-registry.ts:168` | `ChannelDispatchRegistry.send({ channelKind: WHATSAPP })` | After Steps 5–7 of SEND_MESSAGE_CANONICAL.md | proposed |

## Channel domain (ADR-0012)

| # | Deprecated path | Replacement | Deadline | Status |
|---|---|---|---|---|
| 7 | `backend/src/whatsapp/` (entire folder, top-level domain) | `backend/src/marketing/channels/whatsapp/` | Wave W4 (2 weeks after W3 alias lands) | proposed |
| 8 | `backend/src/whatsapp/whatsapp-normalization.util.ts` (`normalizePhone`, etc.) | `backend/src/common/phone/phone-normalization.util.ts` (canonical cross-channel) | After common util created | proposed |
| 9 | `SessionStatus` in `backend/src/whatsapp/providers/{provider-registry.types,waha-types,whatsapp-api.provider.types}.ts` (×3) | Single canonical type in `backend/src/marketing/channels/whatsapp/types.ts` | After W3 of ADR-0012 | proposed |
| 10 | `backend/src/meta/instagram/` (will be moved) | `backend/src/marketing/channels/instagram/` | Wave W3 of ADR-0012 | proposed |
| 11 | `backend/src/meta/messenger/` (will be moved) | `backend/src/marketing/channels/messenger/` | Wave W3 of ADR-0012 | proposed |

## Cognitive domain (ADR-0013 — Kloel Mind unification)

### Service renames (alias-first, 4-week window)

| # | Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|---|
| 12 | `BrainAutonomyService` (`backend/src/kloel/brain-autonomy.service.ts`) | `MindAutonomyCoordinator` | 4 weeks after M1 | aliased |
| 13 | `BrainCapabilityExecutorService` (`backend/src/kloel/brain-capability-executor.service.ts`) | `MindCapabilityExecutor` | 4 weeks after M1 | aliased |
| 14 | `BrainCapabilityRegistryService` (`backend/src/kloel/brain-capability-registry.service.ts`) | `MindCapabilityRegistry` | 4 weeks after M1 | aliased |
| 15 | `BrainCommercialGraphService` (`backend/src/kloel/brain-commercial-graph.service.ts`) | `MindCommercialGraph` | 4 weeks after M1 | aliased |
| 16 | `BrainEventSpineService` (`backend/src/kloel/brain-event-spine.service.ts`) | `MindEventSpine` | 4 weeks after M1 | aliased |
| 17 | `BrainRuntimeService` (`backend/src/kloel/brain-runtime.service.ts`) | `MindRuntime` | 4 weeks after M1 | aliased |
| 18 | `WhatsAppBrainService` (`backend/src/kloel/whatsapp-brain.service.ts`) | `WhatsAppMindCoordinator` | 4 weeks after M1 | aliased |
| 19 | `KloelLeadBrainService` (`backend/src/kloel/kloel-lead-brain.service.ts`) | `LeadMindCoordinator` | 4 weeks after M1 | aliased |
| 20 | `BrainSpineAuditService` (`backend/src/brain/brain-spine-audit.service.ts`) | `MindSpineAudit` in `backend/src/kloel/mind/observability/` | 4 weeks after M3 | aliased |

### Domain folder moves

| # | Deprecated path | Replacement | Deadline | Status |
|---|---|---|---|---|
| 21 | `backend/src/ai-brain/` (all 9 files / 5 services) | `backend/src/kloel/mind/knowledge/` | 4 weeks after M2 | aliased |
| 22 | `AgentAssistService` (`backend/src/ai-brain/agent-assist.service.ts`) | `MindKnowledgeAssist` | 4 weeks after M2 | aliased |
| 23 | `KnowledgeBaseService` (`backend/src/ai-brain/knowledge-base.service.ts`) | `MindKnowledgeBase` | 4 weeks after M2 | aliased |
| 24 | `MediaFactoryService` (`backend/src/ai-brain/media-factory.service.ts`) | `MindMediaFactory` | 4 weeks after M2 | aliased |
| 25 | `VectorService` (`backend/src/ai-brain/vector.service.ts`) | `MindVectorStore` | 4 weeks after M2 | aliased |
| 26 | `HiddenDataExtractorService` (`backend/src/ai-brain/hidden-data.service.ts`) | `MindHiddenDataExtractor` | 4 weeks after M2 | aliased |
| 27 | `backend/src/brain/` (1 file) | `backend/src/kloel/mind/observability/` | 4 weeks after M3 | aliased |
| 28 | `backend/src/cia/` (all 16 files / 11 services) | `backend/src/kloel/mind/cia/` (kept as learning adapter per ADR-0006) | 4 weeks after M4 | aliased |

### Event taxonomy

| # | Deprecated event name | Canonical | Deadline | Status |
|---|---|---|---|---|
| 29 | `kloel.message.created` | `mind.message.received` | 4 weeks after M6 | proposed |
| 30 | `kloel.action.executed` | `mind.action.executed` | 4 weeks after M6 | proposed |
| 31 | `kloel.product.created` | `mind.product.observed` (re-emitted by MindEventSpine from raw `product.created`) | 4 weeks after M6 | proposed |
| 32 | `kloel.plan.created` | `mind.plan.observed` | 4 weeks after M6 | proposed |

## Cross-cutting duplications (DUPLICATION_REGISTER.md top entries)

These are eligible for canonicalization but require per-case ADR or focused
PR before the deprecation alias lands. Listed for visibility:

| # | Symbol(s) | Files | Resolution path |
|---|---|---|---|
| 33 | `CheckoutService` (×2) | `backend/src/checkout/checkout.service.ts`, `backend/src/kloel/checkout.service.ts` | **Decide canonical**: `backend/src/checkout/` is canonical (older, broader caller graph). `kloel/checkout.service.ts` becomes adapter or removed. See "Wave W22 — 4 P0 dups" below. |
| 34 | `PipelineService` / `PipelineController` (×2) | `backend/src/admin/pipeline/*`, `backend/src/pipeline/*` | **NOT yet aliased.** Admin variant is admin-scoped (208 LOC, registered in `AdminPipelineModule` at `backend/src/admin/admin.module.ts:21`). Product variant is the multi-tenant canon (143 LOC). Resolution: rename admin variant to `AdminPipelineService` + `AdminPipelineController` in a follow-up PR — codemod must update the module, controller route prefix, and any spec that references the class. NO @deprecated applied this session (both are live). |
| 35 | `MercadoPagoWebhookController` (×2) | `backend/src/checkout/mercado-pago-webhook.controller.ts`, `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts` | Canonical: `backend/src/payments/mercadopago/`. Checkout variant deletes after caller migration. |
| 36 | `EmailInboundController` (×2) | `backend/src/email/email-inbound.controller.ts`, `backend/src/marketing/email-inbound.controller.ts` | Canonical: `backend/src/marketing/email-inbound.controller.ts` (consistent with ADR-0012 OmniCore). `email/` variant deletes after caller migration. |
| 37 | `LoginDto` / `RefreshDto` / `ChangePasswordDto` (×2 each) | `backend/src/auth/dto/*` + `backend/src/admin/auth/dto/*` (or `kyc/dto/`) | Decide: are admin/main auth flows distinct? If yes, prefix admin variant `AdminLoginDto`. If shape identical, consolidate. |
| 38 | `forEachSequential` / `findFirstSequential` / `pollUntil` / `resolveRedisUrl` / `safeResolve` / `renderTemplate` / `toPrismaJsonValue` / `maskRedisUrl` / `RedisConfigurationError` (×2-3 each) | `backend/src/common/*`, `worker/utils/*` | Either single shared package OR keep parallel with explicit JSDoc cross-link. Decide cross-boundary policy. |
| 39 | `normalizePhone` / `normalizeNumber` / `formatPhone` / `normalizePhoneDigits` (×6+) | `backend/src/whatsapp/*`, `backend/src/autopilot/*`, `backend/src/meta/meta-whatsapp.service.ts`, `backend/src/checkout/checkout-order-support.ts`, `frontend/src/app/(main)/followups/followups.helpers.ts`, `worker/processors/checkout-social-lead-enrichment.ts` | Canonical: `backend/src/common/phone/phone-normalization.util.ts` (NEW). All call sites migrate via codemod. |
| 40 | `ChannelSendResult` / `ChannelCapability` (×2 each) | `backend/src/common/channel-dispatch/channel-dispatch.port.ts`, `backend/src/kloel/channel-transport.types.ts` | Canonical: `backend/src/common/channel-dispatch/`. `kloel/channel-transport.types.ts` becomes thin re-export. |
| 41 | `OmnichannelService` (`backend/src/inbox/`) + `OmnichannelContactResolutionService` (`backend/src/omnichannel/`) | `backend/src/inbox/omnichannel.service.ts`, `backend/src/omnichannel/contact-resolution.service.ts` | Both kept (different responsibilities) but **document the boundary** in SERVICE_CATALOG. |
| 42 | `CiaRuntimeService` (×2) | `backend/src/cia/cia-runtime.abstract.ts`, `backend/src/cia/cia-runtime.service.ts` | Already correct (abstract + impl). No action. |
| 43 | `PulseTruthSnapshotService` (×2) | `backend/src/kloel/abi/pulse-truth-snapshot.service.ts`, `backend/src/kloel/pulse-gates/pulse-truth-snapshot.service.ts` | Investigate intent: are they intentionally separate (ABI vs gates) or accidental fork? |

## Risks flagged during canonicalization

From `SEND_MESSAGE_CANONICAL.md` §5 Risk Register:

| Risk | Action |
|---|---|
| R2: `AuthWhatsappPasswordService` + `AuthVerificationService` not registered in `auth.module.ts` — appear dead | **Verify** dead-code status via runtime coverage; if confirmed, delete (separate PR). |
| R5: `AdminChatService.sendMessage()` is copilot interface, NOT a channel send | **Revise** Step 3 of SEND_MESSAGE_CANONICAL.md: do NOT wrap as `InternalAdminDispatchAdapter`. |
| R6: `BrainCapabilityExecutorService.sendMessageViaChannel` returns `queued:true` only — may not deliver | **Investigate** if brain-sourced messages reach the channel. |
| R7: No `EmailDispatchAdapter` exists yet | ✅ **Built** in Wave W1 of ADR-0012 at `backend/src/marketing/channels/email/email-dispatch.adapter.ts` — resolves mailbox via @Optional injection of Gmail / Microsoft / IMAP-SMTP, tries in priority order, surfaces first non-not_connected result. |

## How to add an entry

1. Confirm the deprecation is decided in an ADR or in a canonical inventory doc.
2. Apply `@deprecated` JSDoc to the symbol in source, pointing to replacement file:line.
3. Add row above with status `aliased`.
4. When deadline passes and `check-canonical-services.mjs` shows 0 callers, delete + set status `removed`.
5. Keep removed rows in this table for 90 days as historical record, then archive to `DEPRECATION_HISTORY.md`.
