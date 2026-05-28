# OminiCore Dissolution Plan — PI Task K22

> **Status:** PLAN (zero code migration — analysis + classification only).
> **Author:** PI-K22 dissolution subagent.
> **Date:** 2026-05-28.
> **Source ADRs:** [`0012-kloel-omnicore-channel-unification.md`](../adr/0012-kloel-omnicore-channel-unification.md), [`0001-whatsapp-source-of-truth.md`](../adr/0001-whatsapp-source-of-truth.md).
> **Predecessor:** [`OMNICORE_MISSION_COMPLETE.md`](./OMNICORE_MISSION_COMPLETE.md) — `backend/src/whatsapp/` already dissolved into `marketing/channels/whatsapp/`.

---

## TL;DR

`backend/src/whatsapp/` is gone. But the dissolution is incomplete: **35 files in `backend/src/meta/`** (6,590 LOC), **30 scattered WhatsApp files** outside channels, and **8 worker WhatsApp files** duplicate capabilities already canonicalized in `backend/src/marketing/channels/whatsapp/` (150 files, 32,360 LOC). This plan classifies every file, maps the duplicate capability surface, and prescribes a 4-phase migration to reach the canonical end-state: **WhatsApp is a marketing channel — no other directory owns its runtime, webhooks, auth, or connection lifecycle.**

---

## 1. Full Inventory

### 1.1 `backend/src/marketing/channels/whatsapp/` — CANONICAL (150 files, 32,360 LOC)

| Sub-path | Files | LOC | Role |
|---|---|---|---|
| Root | 63 | ~14,000 | Core service (`whatsapp.service.ts` 1,800+ LOC), session, watchdog, catchup, dispatcher, reconciler, rate-guard, media, account-agent suite |
| `controllers/` | 6 | ~1,500 | WhatsAppApiController, WhatsAppCatalogController, WhatsAppMetaCompatController, WhatsappController, InternalWhatsAppRuntimeController |
| `providers/` | 20 | ~6,000 | WahaProvider, WhatsAppApiProvider, ProviderRegistry (messaging/op/session/contacts), waha-* helpers |
| Specs (`*.spec.ts`) | 61 | ~10,860 | Full test coverage of all services and providers |

**Key canonical symbols exported via `index.ts`:** `WhatsAppDispatchAdapter` (the single `ChannelDispatchPort` implementation for WhatsApp).

### 1.2 `backend/src/meta/` — PARTIALLY DISSOLVED (35 files, 6,590 LOC)

| File | Lines | Role | Duplicate of |
|---|---|---|---|
| `meta-whatsapp.service.ts` | 380 | Send text/media via Meta Graph API, connection discovery, phone number details | `whatsapp.service.ts` + `whatsapp-message-dispatcher.service.ts` |
| `meta-whatsapp.service.helpers.ts` | ~200 | Build Graph API payloads, resolve connections, parse phone details | `whatsapp-service.helpers.ts` + `whatsapp.service.normalizers.ts` |
| `meta-whatsapp.service.helpers.spec.ts` | ~100 | Helper specs | — |
| `meta-whatsapp.message.helpers.ts` | ~50 | Parse message ID from Meta response | `providers/provider-send-message.helpers.ts` |
| `meta-whatsapp.service.spec.ts` | ~250 | Service specs | — |
| `webhooks/meta-webhook.controller.ts` | ~160 | Meta marketing webhook receiver (signature verify, dedup) | `controllers/whatsapp-api.controller.ts` (also handles webhooks) |
| `webhooks/meta-webhook.controller.helpers.ts` | ~80 | Webhook helper utilities | `controllers/whatsapp-api.controller.helpers.ts` |
| `webhooks/meta-webhook.controller.helpers.spec.ts` | ~40 | Helper specs | — |
| `webhooks/meta-webhook.controller.spec.ts` | ~80 | Controller specs | — |
| `meta-webhook.controller.ts` | ~200 | Legacy Meta webhook (WhatsApp event handler) | `webhooks/whatsapp-api-webhook.controller.ts` (already disabled) |
| `meta-webhook.controller.spec.ts` | ~100 | Controller specs | — |
| `meta-webhook-heartbeat.helpers.ts` | ~40 | Webhook heartbeat payload builder | `whatsapp-watchdog.helpers.ts` |
| `meta-connection-state.service.ts` | ~180 | Track Meta connection lifecycle | `whatsapp-session.service.ts` |
| `meta-connection-state.service.spec.ts` | ~80 | Connection state specs | — |
| `meta-sdk.service.ts` | ~120 | Thin wrapper around Meta Graph API `fetch()` calls | `providers/waha-transport.ts` (transport layer) |
| `meta-sdk.service.spec.ts` | ~60 | SDK specs | — |
| `meta-token-crypto.ts` | ~40 | Encrypt/decrypt Meta access tokens | `mailbox-token-crypto.ts` (generic token crypto already exists) |
| `meta-input.util.ts` | ~30 | Input normalization utilities | `whatsapp-normalization.util.ts` |
| `oauth/meta-oauth-url.helpers.ts` | ~100 | OAuth redirect URL resolution | `marketing-connect/meta-connect.service.ts` (already handles OAuth flows) |
| `oauth/meta-oauth-url.helpers.spec.ts` | ~50 | OAuth URL specs | — |
| `oauth/meta-auth-helpers.ts` | ~80 | Auth helper utilities | — |
| `oauth/meta-auth-helpers.spec.ts` | ~40 | Auth helper specs | — |
| `oauth/meta-scopes.helpers.ts` | ~60 | Scope resolution per channel | — |
| `oauth/meta-embedded-signup.helpers.ts` | ~50 | Embedded signup URL builder | — |
| `meta-auth.controller.ts` | ~200 | Meta OAuth callback controller | `marketing-connect.controller.ts` (handles all channel connections) |
| `meta-auth.controller.spec.ts` | ~100 | Auth controller specs | — |
| `ads/meta-ads.controller.ts` | ~80 | Meta Ads API controller | `google-ads-marketing.controller.ts` (ads are a marketing concern) |
| `ads/meta-ads.controller.spec.ts` | ~50 | Ads controller specs | — |
| `ads/meta-ads.service.ts` | ~120 | Meta Ads service | `google-ads-marketing.service.ts` |
| `ads/meta-ads.service.spec.ts` | ~60 | Ads service specs | — |
| `ads/dto/meta-ads-insights-query.dto.ts` | ~30 | Ads DTO | — |
| `read-model/meta-read-helpers.ts` | ~50 | Read-model access patterns | — |
| `startup/meta-startup-check.ts` | ~80 | Startup environment validation | — |
| `startup/meta-startup-check.spec.ts` | ~50 | Startup check specs | — |
| `meta.module.ts` | 42 | NestJS module wiring Meta controllers/services | `marketing/channels/whatsapp/whatsapp.module.ts` + `marketing-connect/` |

### 1.3 Scattered WhatsApp files — OUTSIDE canonical home (30 files)

| File | Lines | Current home | Canonical home after dissolution |
|---|---|---|---|
| `auth/auth-whatsapp-password.service.ts` | ~220 | `auth/` | Stays in `auth/` but imports from canonical for send |
| `auth/auth-whatsapp-password.service.spec.ts` | ~100 | `auth/` | Same as above |
| `auth/auth-service.whatsapp.ts` | ~30 | `auth/` | Thin delegator — stays in `auth/` but imports from canonical |
| `auth/dto/whatsapp-auth.dto.ts` | ~20 | `auth/` | `marketing/channels/whatsapp/dto/` |
| `webhooks/whatsapp-api-webhook.controller.ts` | 130 | `webhooks/` | **DELETE** — already disabled (legacy WAHA, no-op handler) |
| `webhooks/whatsapp-api-webhook.controller.spec.ts` | ~60 | `webhooks/` | **DELETE** with controller |
| `kloel/kloel-whatsapp-tools.service.ts` | ~200 | `kloel/` | `kloel/` (agent tool interface — stays in kloel, imports canonical service) |
| `kloel/kloel-whatsapp-tools.service.spec.ts` | ~300 | `kloel/` | — |
| `kloel/kloel-whatsapp-tools.service.chats.spec.ts` | ~150 | `kloel/` | — |
| `kloel/kloel-whatsapp-tools.service.media.spec.ts` | ~80 | `kloel/` | — |
| `kloel/kloel-whatsapp-tools.service.part2.spec.ts` | ~120 | `kloel/` | — |
| `kloel/kloel-whatsapp-tools.service.part3.spec.ts` | ~80 | `kloel/` | — |
| `kloel/kloel-whatsapp-tools.helpers.ts` | ~50 | `kloel/` | — |
| `kloel/channel-transport-whatsapp.provider.ts` | ~80 | `kloel/` | `kloel/` — thin transport adapter, imports canonical ProviderRegistry |
| `kloel/kloel-tool-dispatcher.whatsapp.handlers.ts` | ~40 | `kloel/` | `kloel/` — dispatcher handler, stays |
| `kloel/kloel-tool-executor-whatsapp.service.ts` | ~150 | `kloel/` | `kloel/` — executor service, stays |
| `kloel/kloel-tool-executor-whatsapp.service.spec.ts` | ~200 | `kloel/` | — |
| `kloel/kloel-tool-executor-whatsapp.service.media.spec.ts` | ~80 | `kloel/` | — |
| `kloel/whatsapp-brain.controller.ts` | ~60 | `kloel/` | `kloel/mind/` — cognitive controller, not channel runtime |
| `kloel/legit/whatsapp-policy.enforcer.ts` | ~80 | `kloel/legit/` | `kloel/legit/` — compliance policy, stays |
| `kloel/mind/coordination/whatsapp-mind-coordinator.service.ts` | ~200 | `kloel/mind/` | `kloel/mind/` — mind coordinator, stays |
| `kloel/mind/coordination/whatsapp-mind-coordinator.service.spec.ts` | ~150 | `kloel/mind/` | — |
| `kloel/unified-agent-actions-crm.connect-whatsapp.helpers.ts` | ~60 | `kloel/` | `kloel/` — CRM connect helpers, stays |
| `kloel/unified-agent-actions-crm.connect-whatsapp.helpers.spec.ts` | ~40 | `kloel/` | — |
| `kloel/whatsapp-emitter/whatsapp-event-emitter.module.ts` | ~30 | `kloel/whatsapp-emitter/` | `kloel/mind/events/` — event emission is cognitive, not channel |
| `kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts` | ~200 | `kloel/whatsapp-emitter/` | `kloel/mind/events/` |
| `kloel/whatsapp-emitter/whatsapp-event-emitter.service.spec.ts` | ~200 | `kloel/whatsapp-emitter/` | — |
| `prisma/checkout-paid-effects/whatsapp.ts` | ~80 | `prisma/checkout-paid-effects/` | `prisma/checkout-paid-effects/` — purchase effects, not channel runtime |
| `marketing/marketing-connect/whatsapp-summary.service.ts` | ~80 | `marketing/marketing-connect/` | **KEEP** — already in canonical marketing location |
| `marketing/marketing-connect/whatsapp-summary.service.spec.ts` | ~100 | `marketing/marketing-connect/` | **KEEP** |

### 1.4 Worker WhatsApp files (8 files)

| File | Lines | Role | Classification |
|---|---|---|---|
| `worker/providers/whatsapp-engine.ts` | ~400 | Core WhatsApp engine in worker runtime | **DUPLICATE_RESOLVE** — shadows backend `whatsapp.service.ts` |
| `worker/providers/whatsapp-engine.helpers.ts` | ~100 | Engine helpers | **MERGE** into canonical helpers |
| `worker/providers/whatsapp-api-provider.ts` | ~200 | Worker-side WhatsApp API provider | **DUPLICATE_RESOLVE** — shadows backend `providers/whatsapp-api.provider.ts` |
| `worker/providers/unified-whatsapp-provider.ts` | ~150 | Unified provider abstraction | **DUPLICATE_RESOLVE** — shadows backend `provider-registry.ts` |
| `worker/providers/whatsapp-provider-resolver.ts` | ~50 | Provider resolution logic | **MERGE** into canonical provider registry |
| `worker/test/whatsapp-engine.spec.ts` | ~250 | Engine specs | **KEEP** (tests the worker engine) |
| `worker/test/whatsapp-engine.helpers.spec.ts` | ~100 | Helper specs | **KEEP** |
| `worker/test/whatsapp-api-provider.spec.ts` | ~150 | Provider specs | **KEEP** |

---

## 2. Capability Equivalence Matrix

Seven core WhatsApp capabilities exist in two (or more) trees. The canonical implementation is always in `marketing/channels/whatsapp/`.

| Capability | Canonical (`marketing/channels/whatsapp/`) | Shadow (`backend/src/meta/`) | Shadow (other) | Verdict |
|---|---|---|---|---|
| **MessageDispatch** | `WhatsAppDispatchAdapter` → `WhatsappService.sendMessage` → `WhatsappMessageDispatcherService` → `ProviderRegistry` → `{WahaProvider, WhatsAppApiProvider}` | `MetaWhatsAppService.sendTextMessage` / `.sendMediaMessage` (direct Graph API POST, bypasses DI chain) | Worker `whatsapp-engine.ts` (separate queue-based dispatch) | **DUPLICATE_RESOLVE** — Meta service is a bypass; worker engine is a parallel path |
| **WebhookReceiver** | `WhatsAppApiController` (controllers/) | `meta-webhook.controller.ts` + `webhooks/meta-webhook.controller.ts` | `webhooks/whatsapp-api-webhook.controller.ts` (disabled legacy) | **DELETE** legacy WAHA; **DUPLICATE_RESOLVE** Meta webhooks → canonical controller |
| **SessionLifecycle** | `whatsapp-session.service.ts` + `whatsapp-watchdog.service.ts` + `whatsapp-watchdog-session.service.ts` + `whatsapp-watchdog-recovery.service.ts` | `meta-connection-state.service.ts` (tracks token, expiry, status) | — | **MERGE** — Meta connection state is a subset of session lifecycle |
| **Templates** | `whatsapp.service.catalog.ts` + `whatsapp-catalog-contact-collector.ts` | — | — | **KEEP** — canonical only; Meta has no template management |
| **MediaUpload** | `whatsapp-media.service.ts` | `MetaWhatsAppService.sendMediaMessage` (sends media URL, doesn't upload) | Worker `whatsapp-engine.ts` media handling | **KEEP** canonical media service; **MERGE** Meta media-send into canonical dispatch |
| **Reactions** | Handled via `inbound-processor.service.ts` (inbound message classification) | — | — | **KEEP** — canonical only |
| **ChannelStatus** | `whatsapp-session.service.ts` → `ProviderSessionSnapshot` | `MetaWhatsAppService.getPhoneNumberDetails` (returns status, phone, pushName, degradedReason) | `workspaces/provider-status.util.ts` (generic provider status) | **DUPLICATE_RESOLVE** — canonicalize status through session service + provider settings |

### Cross-channel equivalence (OmniCore 5 channels)

The `ChannelDispatchPort` interface already unifies dispatch across all 5 channels. The dissolution ensures WhatsApp-specific code doesn't create a parallel universe:

| Channel | Canonical Adapter | Backend service | Controller (webhook) | Meta dependency |
|---|---|---|---|---|
| **WhatsApp** | `WhatsAppDispatchAdapter` | `WhatsappService` | `WhatsAppApiController` | `MetaWhatsAppService` (to be dissolved) |
| **Instagram** | `InstagramDispatchAdapter` | `InstagramService` | `InstagramController` | Shared Meta token via `MetaModule` |
| **Messenger** | `MessengerDispatchAdapter` | `MessengerService` | `MessengerController` | Shared Meta token via `MetaModule` |
| **Facebook** | `FacebookDispatchAdapter` | (thin — adapter calls SDK directly) | — | Shared Meta token via `MetaModule` |
| **Email** | `EmailDispatchAdapter` | `EmailMarketingService` | `EmailMarketingWebhookController` | None |
| **Internal-Partnership** | `InternalPartnershipDispatchAdapter` | (thin) | — | None |
| **TikTok** | (no adapter yet) | `TikTokMarketingService` | `tiktok-webhook.controller.ts` | TikTok OAuth |

---

## 3. Per-File Classification

### 3.1 KEEP — Canonical files (no action needed)

All 150 files under `backend/src/marketing/channels/whatsapp/` are **KEEP** — they are the canonical home. Plus these scattered files that are already correctly placed:

| File | Reason |
|---|---|
| `marketing/marketing-connect/whatsapp-summary.service.ts` | Already in marketing |
| `marketing/marketing-connect/whatsapp-summary.service.spec.ts` | Already in marketing |
| `prisma/checkout-paid-effects/whatsapp.ts` | Purchase effects belong in prisma domain |
| `kloel/legit/whatsapp-policy.enforcer.ts` | Compliance policy — cognitive domain |
| `kloel/mind/coordination/whatsapp-mind-coordinator.service.ts` + spec | Mind coordination — cognitive domain |
| `kloel/whatsapp-emitter/` (2 files + spec) | Event emission — cognitive domain (rename to `mind/events/` in Phase 4) |

### 3.2 MERGE — Move into canonical (Phase 1–2)

| From | To | Reason |
|---|---|---|
| `meta/meta-connection-state.service.ts` → | `marketing/channels/whatsapp/whatsapp-connection-state.service.ts` | Session lifecycle canonicalization |
| `meta/meta-connection-state.service.spec.ts` → | `marketing/channels/whatsapp/whatsapp-connection-state.service.spec.ts` | Spec follows service |
| `meta/meta-sdk.service.ts` → | `marketing/channels/whatsapp/providers/meta-graph-api.transport.ts` | Transport layer lives with providers |
| `meta/meta-sdk.service.spec.ts` → | `marketing/channels/whatsapp/providers/meta-graph-api.transport.spec.ts` | Spec follows transport |
| `meta/meta-input.util.ts` → | `marketing/channels/whatsapp/meta-input.util.ts` | Normalization utility |
| `meta/read-model/meta-read-helpers.ts` → | `marketing/channels/whatsapp/meta-read-helpers.ts` | Read-model access patterns |
| `meta/startup/meta-startup-check.ts` → | `marketing/channels/whatsapp/meta-startup-check.ts` | Startup validation |
| `meta/startup/meta-startup-check.spec.ts` → | `marketing/channels/whatsapp/meta-startup-check.spec.ts` | Spec follows |
| `meta/meta-token-crypto.ts` → | `marketing/channels/whatsapp/providers/meta-token-crypto.ts` | Token crypto lives with provider layer |
| `meta/meta-webhook-heartbeat.helpers.ts` → | `marketing/channels/whatsapp/meta-webhook-heartbeat.helpers.ts` | Heartbeat belongs to watchdog |
| `worker/providers/whatsapp-engine.helpers.ts` → | `marketing/channels/whatsapp/` (merge into `whatsapp-service.helpers.ts`) | Consolidate helper logic |
| `worker/providers/whatsapp-provider-resolver.ts` → | `marketing/channels/whatsapp/providers/` (merge into `provider-registry.ts`) | Single provider resolution |

### 3.3 DELETE — Legacy/Obsolete

| File | Reason |
|---|---|
| `webhooks/whatsapp-api-webhook.controller.ts` | **Already disabled** — legacy WAHA no-op handler. 130 LOC of dead code. |
| `webhooks/whatsapp-api-webhook.controller.spec.ts` | Spec for dead controller |
| `meta/meta-webhook.controller.ts` | Legacy Meta webhook — superseded by `controllers/whatsapp-api.controller.ts` |
| `meta/meta-webhook.controller.spec.ts` | Spec for legacy webhook |

### 3.4 DUPLICATE_RESOLVE — Canonicalize (Phase 1–2)

| File | Duplicates | Resolution |
|---|---|---|
| `meta/meta-whatsapp.service.ts` (380 LOC) | `whatsapp.service.ts` + `whatsapp-message-dispatcher.service.ts` | **Extract unique logic into canonical, delete the rest.** The unique value is `discoverWhatsAppAssets` (business discovery) and `getPhoneNumberDetails` (status). `sendTextMessage`/`sendMediaMessage` are bypass duplicates of the canonical dispatch chain. |
| `meta/meta-whatsapp.service.helpers.ts` | `whatsapp-service.helpers.ts` + `whatsapp.service.normalizers.ts` | **Merge unique helpers** (`buildResolvedMetaConnection`, `buildPhoneNumberDetailsFromGraphResponse`) into canonical. Delete duplicate payload builders. |
| `meta/meta-whatsapp.message.helpers.ts` | `providers/provider-send-message.helpers.ts` | **Merge** `parseMessageIdFromResponse` into canonical message helpers. |
| `meta/webhooks/meta-webhook.controller.ts` | `controllers/whatsapp-api.controller.ts` | **Merge signature verification + dedup logic** into canonical webhook controller. |
| `meta/webhooks/meta-webhook.controller.helpers.ts` | `controllers/whatsapp-api.controller.helpers.ts` | **Merge** into canonical helpers. |
| `meta/meta-auth.controller.ts` | `marketing-connect.controller.ts` | **Merge** OAuth callback handling into marketing-connect controller. |
| `meta/oauth/meta-oauth-url.helpers.ts` | `marketing-connect/meta-connect.service.ts` | **Merge** URL resolution into connect service. |
| `meta/oauth/meta-auth-helpers.ts` | `marketing-connect/` | **Merge** auth helpers. |
| `meta/oauth/meta-scopes.helpers.ts` | `marketing-connect/` | **Merge** scope resolution. |
| `meta/oauth/meta-embedded-signup.helpers.ts` | `marketing-connect/` | **Merge** embedded signup builder. |
| `worker/providers/whatsapp-engine.ts` | `whatsapp.service.ts` | **Worker engine stays in worker** but MUST use the same provider registry DI import as backend. The engine should delegate send to `ProviderRegistry.sendMessage` rather than duplicating the dispatch chain. |
| `worker/providers/whatsapp-api-provider.ts` | `providers/whatsapp-api.provider.ts` | **Worker should import from canonical** — no separate provider fork. |
| `worker/providers/unified-whatsapp-provider.ts` | `providers/provider-registry.ts` | **Worker should use canonical ProviderRegistry** — no separate registry fork. |

### 3.5 REPATH — Stay in domain, import canonical

| File | Action | New import path |
|---|---|---|
| `auth/auth-whatsapp-password.service.ts` | Stays in `auth/`, imports from canonical | `from '../../marketing/channels/whatsapp/whatsapp.service'` for send |
| `auth/auth-service.whatsapp.ts` | Stays in `auth/` | Same as above |
| `auth/dto/whatsapp-auth.dto.ts` → | `marketing/channels/whatsapp/dto/` | DTO lives with channel |
| `kloel/kloel-whatsapp-tools.service.ts` | Stays in `kloel/` | Imports already use canonical paths (verified) |
| `kloel/channel-transport-whatsapp.provider.ts` | Stays in `kloel/` | Imports already use canonical paths (verified) |
| `kloel/kloel-tool-dispatcher.whatsapp.handlers.ts` | Stays in `kloel/` | Imports already use canonical paths (verified) |
| `kloel/kloel-tool-executor-whatsapp.service.ts` | Stays in `kloel/` | Imports already use canonical paths (verified) |
| `kloel/whatsapp-brain.controller.ts` → | `kloel/mind/` | Rename to reflect cognitive domain |
| `kloel/whatsapp-emitter/` → | `kloel/mind/events/` | Rename to reflect event taxonomy |

---

## 4. Migration Plan — 4 Phases

### Phase 1 — Merge Meta Business Logic into Marketing/Channels/WhatsApp (14 files)

**Goal:** All WhatsApp business logic lives under `marketing/channels/whatsapp/`. `meta/` shrinks to Meta Ads only.

**Dependency order (forward → reverse):**

| Step | Action | Dependencies |
|---|---|---|
| 1.1 | Move `meta-input.util.ts` → `marketing/channels/whatsapp/` | None |
| 1.2 | Move `meta-token-crypto.ts` → `marketing/channels/whatsapp/providers/` | None |
| 1.3 | Move `meta-sdk.service.ts` → `marketing/channels/whatsapp/providers/meta-graph-api.transport.ts` | None (imports only `fetch`) |
| 1.4 | Move `read-model/meta-read-helpers.ts` → `marketing/channels/whatsapp/` | None |
| 1.5 | Merge `meta/meta-whatsapp.service.helpers.ts` → canonical (extract unique logic) | Depends on 1.1, 1.2, 1.3 |
| 1.6 | Merge `meta/meta-whatsapp.message.helpers.ts` → canonical | Depends on 1.5 |
| 1.7 | Merge `meta/meta-whatsapp.service.ts` → canonical (THE BIG ONE) | Depends on 1.5, 1.6 |
| 1.8 | Merge `meta/meta-connection-state.service.ts` → canonical | Depends on 1.7 |
| 1.9 | Merge `meta/meta-webhook-heartbeat.helpers.ts` → canonical | Depends on 1.8 |
| 1.10 | Move `startup/meta-startup-check.ts` → canonical | Depends on 1.7 |
| 1.11 | Merge `meta/webhooks/meta-webhook.controller.ts` → canonical controllers | Depends on 1.7 |
| 1.12 | Merge `meta/webhooks/meta-webhook.controller.helpers.ts` → canonical | Depends on 1.11 |
| 1.13 | Merge `meta/meta-auth.controller.ts` → `marketing-connect.controller.ts` | Depends on 1.7 |
| 1.14 | Merge `meta/oauth/*` (4 files) → `marketing-connect/` | Depends on 1.13 |

**Post-Phase 1 gate:** `meta/` contains only `meta.module.ts`, `ads/` subtree, and `meta-webhook.controller.ts` (legacy — slated for deletion in Phase 2).

### Phase 2 — Delete Legacy Artifacts (4 files)

| Step | File | Precondition |
|---|---|---|
| 2.1 | `meta/meta-webhook.controller.ts` + spec | All inbound webhook traffic routes through canonical `WhatsAppApiController` |
| 2.2 | `webhooks/whatsapp-api-webhook.controller.ts` + spec | Already disabled — safe immediate delete |

### Phase 3 — Worker Alignment (4 service files + audits)

**Goal:** Worker uses canonical provider registry from backend. No duplicate dispatch logic.

| Step | Action | Risk |
|---|---|---|
| 3.1 | Audit worker `whatsapp-engine.ts` vs canonical `whatsapp.service.ts` | **HIGH** — worker runs in separate process; must not break queue |
| 3.2 | Replace worker `whatsapp-api-provider.ts` with import from canonical | Needs worker build to resolve `backend/` imports |
| 3.3 | Replace worker `unified-whatsapp-provider.ts` with canonical `ProviderRegistry` | Same build concern |
| 3.4 | Merge `whatsapp-provider-resolver.ts` into canonical `provider-registry.ts` | Provider resolution must handle both backend and worker contexts |

### Phase 4 — Scattered File Repathing (no logic changes)

| Step | File | Action |
|---|---|---|
| 4.1 | `kloel/whatsapp-emitter/` | Rename → `kloel/mind/events/` |
| 4.2 | `kloel/whatsapp-brain.controller.ts` | Move → `kloel/mind/` |
| 4.3 | `auth/dto/whatsapp-auth.dto.ts` | Move → `marketing/channels/whatsapp/dto/` |
| 4.4 | All remaining scattered files | Verify already import from canonical; add lint rule |

---

## 5. Anti-Regression Gates

One gate per canonical dispatcher/normalizer/resolver. Each gate is a CI script that fails if a forbidden import pattern is detected.

| Gate ID | Rule | Script | Blocked Pattern |
|---|---|---|---|
| **GATE-WA-001** | No direct Meta Graph API send outside canonical | `scripts/ops/check-no-direct-meta-send.mjs` | `fetch(…graph.facebook.com…/messages…)` outside `marketing/channels/whatsapp/providers/` |
| **GATE-WA-002** | No Meta token crypto outside canonical | `scripts/ops/check-no-meta-token-crypto.mjs` | `encryptMetaToken`/`decryptMetaToken` import outside `marketing/channels/whatsapp/providers/` |
| **GATE-WA-003** | Canonical session status only via session service | `scripts/ops/check-session-status-source.mjs` | `metaConnection.findFirst` outside `whatsapp-session.service.ts` or `whatsapp-connection-state.service.ts` |
| **GATE-WA-004** | Phone number normalization only via canonical | `scripts/ops/check-phone-normalization.mjs` | `digitsOnly` import from non-canonical path for WhatsApp numbers |
| **GATE-WA-005** | Provider resolution only via ProviderRegistry | `scripts/ops/check-provider-resolution.mjs` | Direct `new WahaProvider` or `new WhatsAppApiProvider` outside `provider-registry.ts` |
| **GATE-WA-006** | Webhook signature verification only via canonical | `scripts/ops/check-webhook-signature.mjs` | `x-hub-signature-256` verification outside `whatsapp-api.controller.ts` or `meta-marketing` webhook handler |
| **GATE-WA-007** | No meta-whatsapp.service import from non-meta paths | `scripts/ops/check-meta-whatsapp-imports.mjs` | `from '.*/meta/meta-whatsapp'` outside `meta/` directory (Phase 1 transitional guard) |

**Gates GATE-WA-001 through GATE-WA-006 are permanent.** GATE-WA-007 is transitional — it becomes a DELETE gate once Phase 1 completes and the file is removed.

---

## 6. ADR Draft — ADR-0016: OminiCore Meta Dissolution

```
# ADR-0016: OminiCore Meta Dissolution

**Status:** PROPOSED
**Date:** 2026-05-28
**Supersedes:** ADR-0012 §"Meta module permanence" (open question)

## Context

ADR-0012 dissolved `backend/src/whatsapp/` into `marketing/channels/whatsapp/`
but left `backend/src/meta/` intact as a transitional measure. The Meta module
now contains 35 files (6,590 LOC) that duplicate capabilities already
canonicalized in the marketing channels tree — particularly message dispatch,
webhook reception, session lifecycle, and OAuth connection flows.

## Decision

`backend/src/meta/` will be dissolved. Its contents will be redistributed:

1. **WhatsApp runtime logic** (`meta-whatsapp.service.ts`, its helpers,
   connection state, webhooks) → `marketing/channels/whatsapp/`
2. **OAuth connection flows** → `marketing/marketing-connect/`
3. **Meta Ads** (`ads/`) → retain at `marketing/ads/meta-ads/` (ads are a
   marketing subdomain, not a channel concern)
4. **Meta SDK** (`meta-sdk.service.ts`) → `marketing/channels/whatsapp/providers/`
   as the Graph API transport layer
5. **Legacy webhook controller** → DELETE

The `@Global()` decorator on `MetaModule` will be removed. Services that need
cross-module access (e.g., Meta token resolution for Instagram + Messenger)
will be exported from `MarketingChannelsModule` instead.

## Consequences

- Single source of truth for WhatsApp message dispatch: the canonical
  `WhatsappService` → `WhatsappMessageDispatcherService` → `ProviderRegistry`
  chain.
- No more dual webhook receiver paths. One controller handles all WhatsApp
  webhooks (both WAHA-legacy — already disabled — and Meta-current).
- Connection lifecycle is tracked in one place, eliminating the
  `MetaConnectionStateService` vs `WhatsappSessionService` divergence.
- Worker runtime alignment becomes possible: the worker can import the same
  `ProviderRegistry` the backend uses, instead of maintaining a parallel
  provider hierarchy.

## Rejected Alternatives

- **Keep `meta/` as a "Meta SDK" abstraction layer.** Rejected because the
  SDK surface is thin (120 LOC of `fetch` wrappers) and doesn't warrant a
  top-level domain. Transport belongs with providers.
- **Merge `meta/` into `kloel/`.** Rejected because Meta is an external
  integration concern, not a cognitive one. Marketing owns the channel
  surface; Meta is the transport, not the intelligence.
```

---

## 7. Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Meta Graph API `fetch()` calls move to new transport path → break at runtime | **MEDIUM** | The `meta-sdk.service.ts` is a thin wrapper; move is mechanical. Gate GATE-WA-001 catches any direct `fetch()` to graph.facebook.com outside canonical. |
| `MetaWhatsAppService` consumers (campaigns, channel-transport) break during merge | **HIGH** | Phase 1 step 1.7 is the critical merge. All 9 external consumers must be identified and updated in lock-step. The existing `WhatsAppDispatchAdapter` already provides the canonical send interface — consumers should migrate to it before the merge. |
| Worker imports canonical backend code → bundle bloat or unresolved deps | **MEDIUM** | Worker currently has its own `whatsapp-engine.ts`. Phase 3 may require a shared `@kloel/whatsapp-providers` package or a build-time resolution strategy. Defer if infeasible. |
| `@Global()` MetaModule removal breaks Instagram/Messenger token access | **LOW** | Instagram and Messenger already import from `MetaModule`; after dissolution, they'll import from `MarketingChannelsModule`. The export surface is identical. |
| Legacy `meta-webhook.controller.ts` still receives live traffic | **MEDIUM** | Verify via CloudWatch/Sentry that zero production traffic hits this endpoint before deletion. Add a 1-week dual-path log gate. |
| Auth WhatsApp OTP service breaks | **LOW** | `auth-whatsapp-password.service.ts` already calls Meta Graph API directly (not through `MetaWhatsAppService`). After Phase 1, it will use the canonical send path via `WhatsappService.sendMessage`. |

---

## 8. Verification Checklist (Pre-Execution)

Before any migration commit:

- [ ] `grep -rEn "MetaWhatsAppService" backend/src --include='*.ts' | grep -v '\.spec\.' | grep -v 'meta/'` — identify all external consumers
- [ ] `grep -rEn "meta-whatsapp\.service" backend/src --include='*.ts' | grep import` — exact import sites
- [ ] `grep -rEn "MetaConnectionStateService" backend/src --include='*.ts' | grep import` — connection state consumers
- [ ] `grep -rEn "from ['\"].*meta/meta-sdk" backend/src --include='*.ts'` — SDK consumers outside meta
- [ ] `cd backend && npm run typecheck` — must be green before Phase 1
- [ ] `cd backend && npm test -- --testPathPattern='(whatsapp|meta|marketing)'` — baseline green
- [ ] `git status --porcelain | grep -E 'meta/|marketing/channels/whatsapp'` — no concurrent edits

---

## 9. File Count Summary

| Category | Files | LOC |
|---|---|---|
| Canonical (`marketing/channels/whatsapp/`) | 150 | 32,360 |
| Meta to dissolve (`meta/`) | 35 | 6,590 |
| Scattered WhatsApp (non-channels, non-meta) | 30 | ~2,500 |
| Worker WhatsApp | 8 | ~1,400 |
| **Total inventory** | **223** | **~42,850** |
| Post-dissolution canonical | ~175 | ~37,000 |
| Post-dissolution deleted | ~15 | ~1,500 |
| Post-dissolution repathed (no logic change) | ~33 | ~4,350 |

---

## 10. Canonical End-State

```
backend/src/marketing/
├── channels/
│   └── whatsapp/                         # ← SINGLE source of truth
│       ├── whatsapp.service.ts           #   Core service
│       ├── whatsapp-message-dispatcher.service.ts
│       ├── whatsapp-session.service.ts
│       ├── whatsapp-connection-state.service.ts   # ← FROM meta/
│       ├── whatsapp-watchdog.service.ts
│       ├── whatsapp-watchdog-session.service.ts
│       ├── whatsapp-watchdog-recovery.service.ts
│       ├── whatsapp-reconciler.service.ts
│       ├── whatsapp-send-rate-guard.service.ts
│       ├── whatsapp-media.service.ts
│       ├── whatsapp-catchup.service.ts
│       ├── whatsapp-catchup-orchestrator.service.ts
│       ├── whatsapp-catchup-history.service.ts
│       ├── whatsapp-dispatch.adapter.ts
│       ├── whatsapp-service.helpers.ts
│       ├── whatsapp-service.normalizers.ts
│       ├── whatsapp-normalization.util.ts
│       ├── whatsapp-digits.util.ts
│       ├── meta-input.util.ts            # ← FROM meta/
│       ├── meta-read-helpers.ts          # ← FROM meta/
│       ├── meta-startup-check.ts         # ← FROM meta/
│       ├── meta-webhook-heartbeat.helpers.ts  # ← FROM meta/
│       ├── whatsapp.module.ts
│       ├── whatsapp.tokens.ts
│       ├── provider-settings.types.ts
│       ├── account-agent.service.ts
│       ├── agent-conversation-state.util.ts
│       ├── agent-events.service.ts
│       ├── inbound-processor.service.ts
│       ├── controllers/
│       │   ├── whatsapp-api.controller.ts   # ← absorbs Meta webhook logic
│       │   └── ...
│       ├── providers/
│       │   ├── provider-registry.ts
│       │   ├── meta-graph-api.transport.ts  # ← FROM meta/meta-sdk.service.ts
│       │   ├── meta-token-crypto.ts         # ← FROM meta/
│       │   ├── whatsapp-api.provider.ts
│       │   ├── waha.provider.ts
│       │   └── ...
│       └── dto/
│           ├── whatsapp-auth.dto.ts         # ← FROM auth/dto/
│           └── ...
├── marketing-connect/
│   ├── meta-connect.service.ts    # ← absorbs meta/oauth/* + meta-auth.controller
│   └── ...
├── ads/
│   └── meta-ads/                  # ← FROM meta/ads/
│       ├── meta-ads.controller.ts
│       ├── meta-ads.service.ts
│       └── dto/
└── ...
```

`backend/src/meta/` → **EMPTY**. `@Global()` MetaModule → **REMOVED**.

---

*PI-K22 dissolution plan. Zero code migrated. Ready for execution wave assignment.*
