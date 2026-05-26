# Kloel Duplication Register

> Authored by PI atomic subagent `w5-duplication-register` (DeepSeek V4 Pro,
> ~72k events). Artifact #6 of the Architectural Semantic Canonicalization
> mission. Materialized 2026-05-26.


> Canonical registry of EVERY duplicated concept, function, service, event, type,
> or DTO across the codebase. Covers backend (`backend/src/`), frontend
> (`frontend/src/`, `frontend-admin/src/`), and worker (`worker/`).
>
> **Artifact #6** of the Architectural Semantic Canonicalization mission.
> Focuses on DISCOVERY. Cross-links to
> [`DEPRECATION_MAP.md`](./DEPRECATION_MAP.md) (focuses on MIGRATION).

## Summary

| Category | Entries | Status |
|---|---|---|
| Pending semantic duplications | 5 | ⏳ P0/P1 |
| normalizePhone cluster | 7 | ⏳ P1 |
| Number/money formatting clusters | 2 families (17 variants) | ⏳ P2 |
| Frontend component variants | 8 families | ⏳ P2 |
| Frontend type mirrors | 8 | ✅ / ⏸ |
| Backend type divergences | 10 | ⏸ kept local |
| Backend service/controller duplicates | 8 | ⏸ kept local |
| Admin ↔ frontend DTO mirrors | 22 | ⏸ kept local |
| sha256 hash cluster | 1 family (15+ sites) | ⏳ P2 |
| asString/readString cluster | 2 families | ⏳ P1 |
| Test infrastructure | 5 families | ⏳ planned |
| Cross-workspace mirrors | 6 families | ⏸ kept local |
| Orphan/unwired modules | 5 | ⏳ planned |
| Design token/constant clusters | 9 families | ⏸ kept local |
| Already resolved (✅) | 35 | ✅ migrated |
| Kept-local divergences (⏸) | 25 | ⏸ intentional |
| **Total** | **~150** | — |

## Status Legend

| Icon | Meaning |
|---|---|
| ⏳ | Pending — canonical home identified, work not yet executed |
| ✅ | Resolved — verified via DEPRECATION_MAP commit |
| ⏸ | Kept local — intentional divergence, documented justification |
| ⛔ | Banned — must not reappear |

Severity: **P0**=prod bug, **P1**=inconsistency risk, **P2**=architectural entropy, **P3**=light redundancy.---

## Part 1: Pending Semantic Duplications (P0/P1)

> From [`docs/audits/WAVE1_SEMANTIC_DUPS.md`](../audits/WAVE1_SEMANTIC_DUPS.md).

### DUP-001: readRecord / asRecord / asUnknownRecord — 4 shape families

- **Concept**: Coerce `unknown` → `Record<string, unknown>` with varying guards
- **Severity**: P1
- **Implementations found**:
  1. `backend/src/common/types.ts:39` — `asRecord` (Shape A: guarded, returns `null`)
  2. `backend/src/kloel/kloel-composer.service.ts:78` — `asUnknownRecord` (A)
  3. `backend/src/kloel/kloel-lead-processor-helpers.ts:12` — `asUnknownRecord` (A)
  4. `backend/src/kloel/agent-runtime/agent-runtime.session-store.search.ts:284` — `asRecord` (B: `{}`)
  5. `backend/src/kloel/agent-runtime/agent-runtime.pulse-self-model.ts:6` — `readRecord` (B)
  6. `backend/src/kloel/brain-runtime.service.ts:40` — `readRecord` (B)
  7. `backend/src/kloel/mind-policy.helpers.ts:128` — `readRecord` (B)
  8. `backend/src/meta/read-model/meta-read-helpers.ts:15` — `readRecord` (B, exported)
  9. `backend/src/kloel/unified-agent-actions-workspace.service.ts:26` — `readRecord` (C)
  10. `backend/src/webhooks/webhooks.service.ts:57` — `asRecord` (C, kept local)
  11. `backend/src/whatsapp/providers/provider-registry-session.ts:10` — `readRecord` (D)
  12. `backend/src/admin/chat/tools/overview.tools.ts:21` — `asRecord` (E: raw cast)
- **Divergence axis**: body (Array guard vs not), return type (`null` vs `{}`)
- **Canonical recommendation**: `common/types.ts::asRecord` (Shape A); Shape B use `?? {}`
- **Migration risk**: MEDIUM — Shape C/D accept `[]` as valid records
- **Status**: ⏳ pending migration

### DUP-002: isRecord — 3 shapes (6 files)

- **Concept**: Type predicate `(value: unknown): value is Record<…>`
- **Severity**: P1 (Shape C accepts arrays — inconsistency risk)
- **Implementations**:
  A: `audit/audit.interceptor.ts:26`, `common/idempotency.guard.ts:62`,
  `kloel/owner-criterion/observers/correction.observer.ts:36` (guarded, `!Array.isArray`)
  B: `kloel/kloel-tool-dispatcher.high-risk.helpers.ts:57` (`Boolean()` guard)
  C: `kloel/unified-agent-actions-crm-predecided.helpers.ts:20`,
  `kloel/unified-agent-actions-sales.service.ts:28` (NO Array guard)
- **Canonical recommendation**: Add `isRecord` to `common/types.ts` with Shape A body
- **Status**: ⏳ pending

### DUP-003: readText — 3 shapes (4 files)

- **Implementations**: `common/utils.ts:6` (A: `''`, coerces), `email-campaign.service.ts:21` (B: `string|undefined`),
  `member-area/member-area.helpers.ts:76` (B), `meta/read-model/meta-read-helpers.ts:1` (C: no coercion/trim)
- **Canonical recommendation**: A→`parse::readTrimmedStringOr`, B→`parse::readString`, C→`readString??''`
- **Status**: ⏳ pending

### DUP-004: generateId — 2 domains

- **Implementations**: `abi-ab/abi-ab-harness.service.ts:47`, `legit/constants.ts:104`
- **Canonical recommendation**: `crypto.randomUUID()` per Wave-2 audit
- **Status**: ⏳ pending

### DUP-005: removeUndefined / compactObject

- **Implementations**: `product-sub-resources/helpers/common.helpers.ts:137`, `payments/connect/connect.service.ts:39`
- **Canonical recommendation**: `common/object.ts::compactObject`
- **Status**: ⏳ pending---

## Part 2: normalizePhone Cluster

### DUP-006: normalizePhone — 7 implementations

- **Concept**: Strip non-digits from phone, varying guards
- **Severity**: P1
- **Implementations**:
  1. `auth/auth-whatsapp-password.service.ts:31` — `(phone: string): string` → `digitsOnly`
  2. `checkout/checkout-social-lead.util.ts:32` — `(value?: string|null)` → `digitsOrNull`
  3. `kloel/kloel.autonomy-proof.helpers.ts:86` — re-export `common/phone::digitsOnly`
  4. `prisma/checkout-paid-effects/whatsapp.ts:13` — `>= 10` length guard
  5. `whatsapp/inbound-processor.helpers.ts:19` — `(phone: string): string` → `whatsappDigits`
  6. `whatsapp/whatsapp-catchup.helpers.ts:7` — `normalizePhoneExt` → `whatsappDigits`
  7. `worker/processors/checkout-social-lead-enrichment.ts:200` — inline regex + null-on-empty
- **Divergence axis**: signature, body, return type (`string` vs `string|null`)
- **Canonical recommendation**: `common/phone.ts` facades exist; route callers per DEPRECATION_MAP Round 4
- **Status**: ⏳ planned (Round 4)

## Part 3: Number/Money Formatting

### DUP-007: Fmt (number formatting) — 5 variants

- **Concept**: Format number for display
- **Severity**: P2
- **Implementations**:
  1. `analytics/analytics.design-tokens.ts:28` — locale
  2. `anuncios/AnunciosShared.tsx:92` — M/K-suffix
  3. `carteira/carteira.helpers.ts:52` — abs BRL cents
  4. `marketing/MarketingShared.channels.tsx:44` — K-suffix
  5. `sites/SitesViewIcons.tsx:42` — K-suffix (byte-identical to #4)
- **Recommendation**: Merge #4/#5 to `lib/common/format.ts::fmtCompact`
- **Status**: ⏳ (K-suffix); ⏸ (rest)

### DUP-008: formatMoney / FmtMoney / fmtBRL — 13 variants

- **Concept**: Format BRL currency
- **Severity**: P2
- **Implementations**: 3× `FmtMoney`, 6× `fmtBRL`, 3× `formatMoney`/`formatMoneyBRL`,
  1× `Intl.NumberFormat` (WhatsAppExperience.helpers.ts)
- **Divergence axis**: fallback (`'R$ 0,00'` vs `'—'` vs none)
- **Canonical recommendation**: `lib/common/money.ts::formatBRL` canonical;
  body-identical callers re-import; settings/admin variants kept local
- **Already-migrated reference**: `formatCurrency` → `formatBRL` (DEPRECATION_MAP ✅)
- **Status**: ⏳ (body-identical); ⏸ (settings)

## Part 4: Frontend Component Variants

> Cross-ref [`FRONTEND_DEDUP_AUDIT.md`](./FRONTEND_DEDUP_AUDIT.md).

### DUP-009: Toggle — 6 implementations

- **Implementations**: Forms.tsx:380 (canonical, 70L), checkout-editor-shared,
  SitesViewControls, PlanAIConfig.toggle, ProductAfterPayTab, ProductIATab
- **Recommendation**: Extract `Toggle.tsx` with `accentColor?` (FRONTEND_DEDUP_AUDIT P1)
- **Status**: ⏳ pending

### DUP-010: Badge — 5 implementations

- **Implementations**: Primitives, vendas, sites, admin-ui, conta/StatusBadge
- **Recommendation**: Namespace per domain (FRONTEND_DEDUP_AUDIT P3)
- **Status**: ⏸ kept local

### DUP-011: StatCard — 10 implementations

- **Implementations**: Cards.tsx (canonical), 3 autopilot, AgentConsole, PlanInspector,
  AffiliateStats, 2 settings (byte-identical), admin-ui
- **Recommendation**: Merge settings twins (FRONTEND_DEDUP_AUDIT P2)
- **Status**: ⏳ (settings twins); ⏸ (rest)

### DUP-012: Card — 3 implementations

- **Status**: ⏸ kept local — separate design systems

### DUP-013: EmptyState — 3 tiers

- **Status**: ⏸ kept local — intentional tiers

### DUP-014: ProductCard — 3 implementations

- **Status**: ⏸ kept local — different contexts

### DUP-015: ConnectedBadge (✅ resolved)

- **Already-migrated reference**: DEPRECATION_MAP `ConnectedBadge` row
- **Status**: ✅ resolved

### DUP-016: FieldLabel (✅ resolved)

- **Already-migrated reference**: DEPRECATION_MAP `FieldLabel` row
- **Status**: ✅ resolved---

## Part 5: Frontend Type Mirrors

### DUP-017: PipelineStage — 4 files

- **Status**: ⏸ kept local — intentional API→hook→UI layering

### DUP-018: PipelineDeal — 3 files

- **Status**: ⏸ kept local — same layering

### DUP-019: Campaign — 3 files

- **Implementations**: `lib/api/campaigns` (canonical), `anuncios/anuncios-types`,
  `products/ProductCampaignsTab.constants`
- **Recommendation**: anuncios + products should extend API contract
- **Status**: ⏳ pending

### DUP-020: Message — 5 files

- **Implementations**: `lib/api/conversations` (canonical), `chat-message.types`,
  `FloatingChatRows`, `onboarding-chat`, `WhatsAppConsole` (alias)
- **Already-migrated reference**: `ChatMessage` → `kloel-thinker.types.ts` ✅
- **Status**: ⏳ (#2); ⏸ (#3,#4)

### DUP-021: ChannelKey — 4 files, 2 value sets

- **Implementations**: `channel-repertoire.config` (backend), `OfficialMarketingChannelPage.helpers`,
  `thanos-section.const`, `useSalesFlow`
- **Recommendation**: Merge #3/#4 (byte-identical 2-letter codes)
- **Status**: ⏳ (#3/#4); ⏸ (rest)

### DUP-022: Autopilot* types (✅ resolved)

- **Already-migrated reference**: DEPRECATION_MAP 9 Autopilot* rows
- **Status**: ✅ resolved (page.types/page.ui); ⏸ (lib/api stubs)

### DUP-023: statusTone — 3 files

- **Status**: ⏸ kept local — different domain status enums

### DUP-024: Ticker — 3 files

- **Status**: ⏸ kept local

## Part 6: Backend Type Divergences

### DUP-025: FeedbackInput — 3 files, different shapes

- **Implementations**: `clarity/clarity.types`, `incent/user-feedback-correction`, `team/team.types`
- **DEPRECATION_MAP**: ⏸ kept local — rename with domain prefix
- **Status**: ⏸ kept local

### DUP-026: Role — 3 files

- **Implementations**: `ecosys/ecosys.types`, `evol/types`, `role/types` (canonical)
- **Status**: ⏳ pending audit

### DUP-027: ToolResult — 3 files

- **DEPRECATION_MAP**: `9 WhatsApp tool Args` row (✅)
- **Status**: ✅ (#2/#3); ⏸ (#1)

### DUP-028: SessionStatus — 3 files

- **Implementations**: `provider-registry.types`, `waha-types`, `whatsapp-api.provider.types`
- **DEPRECATION_MAP**: ⏸ kept local — different state unions per provider
- **Status**: ⏸ kept local

### DUP-029: ClientContextBundle — 2 files in agency/

- **DEPRECATION_MAP**: ⏸ kept local
- **Status**: ⏸ kept local

### DUP-030: HandoffPackage — 2 files

- **DEPRECATION_MAP**: ⏸ kept local
- **Status**: ⏸ kept local

### DUP-031: PortfolioResult — 2 files

- **Status**: ⏸ kept local

### DUP-032: RankerResult — 2 files

- **Status**: ⏸ kept local

### DUP-033: ChannelHealth — 2 files

- **Status**: ⏸ kept local

### DUP-034: Same-name type pairs (OwnedAudience, DetectionInput, AttributionGuardResult)

- **DEPRECATION_MAP**: ⏸ kept local
- **Status**: ⏸ kept local---

## Part 7: Backend Service/Controller Duplications

### DUP-035: PipelineController — 2 controllers

- **Status**: ⏸ kept local — intentional admin/user separation

### DUP-036: PipelineService — 2 services

- **Status**: ⏸ kept local

### DUP-037: ObservabilityModule — 2 NestJS modules

- **DEPRECATION_MAP**: ⏸ kept local — different providers/exports
- **Status**: ⏸ kept local

### DUP-038: EmailInboundController — 2 controllers

- **Implementations**: `email/` (legacy, likely dead), `marketing/` (active)
- **Status**: ⏳ pending audit (likely delete legacy)

### DUP-039: ChannelSetupService — 2 services

- **Status**: ⏸ kept local

### DUP-040: PulseTruthSnapshotService — 2 implementations

- **DEPRECATION_MAP**: ⏸ kept local — different snapshot shapes
- **Status**: ⏸ kept local

### DUP-041: CiaRuntimeService — abstract + concrete (not a duplication)

- **Status**: ✅ not a duplication — intentional OOP pattern

### DUP-042: normalizeJsonObjExt / resolveTimestampExt — 2 whatsapp helpers

- **DEPRECATION_MAP**: ⏸ kept local
- **Status**: ⏸ kept local

## Part 8: Admin ↔ Frontend DTO Mirrors (DUP-043 to DUP-068)

> Intentional REST API boundary mirrors. NOT bugs — natural boundary.

| DUP | Name | Backend | Frontend-Admin |
|---|---|---|---|
| 043 | `ListAccountsResponse` | `admin/accounts/admin-accounts.service.ts` | `lib/api/admin-accounts-api.ts` |
| 044 | `AdminAccountDetail` | `admin/accounts/queries/detail-account.query.ts` | `lib/api/admin-accounts-api.ts` |
| 045 | `AdminAccountRow` | `admin/accounts/queries/list-accounts.query.ts` | `lib/api/admin-accounts-api.ts` |
| 046 | `LoginStateResponse` | `admin/auth/admin-auth.service.ts` | `lib/auth/admin-session-types.ts` |
| 047 | `MfaSetupPayload` | `admin/auth/admin-auth.service.ts` | `lib/auth/admin-session-types.ts` |
| 048 | `AuthenticatedSession` | `admin/auth/admin-auth.service.ts` | `lib/auth/admin-session-types.ts` |
| 049 | `SendMessageInput` | `admin/chat/admin-chat.service.ts` | `lib/api/admin-chat-api.ts` |
| 050 | `AdminClientRow` | `admin/clients/admin-client.types.ts` | `lib/api/admin-clients-api.ts` |
| 051 | `ListClientsResponse` | `admin/clients/admin-client.types.ts` | `lib/api/admin-clients-api.ts` |
| 052 | `AdminConfigWorkspaceRow` | `admin/config/admin-config.service.ts` | `lib/api/admin-config-api.ts` |
| 053 | `AdminConfigOverviewResponse` | `admin/config/admin-config.service.ts` | `lib/api/admin-config-api.ts` |
| 054 | `KpiRateValue` | `admin/dashboard/admin-dashboard.service.ts` | `lib/api/admin-dashboard-api.ts` |
| 055 | `KpiMoneyValue` | `admin/dashboard/kpi-math.util.ts` | `lib/api/admin-dashboard-api.ts` |
| 056 | `KpiNumberValue` | `admin/dashboard/kpi-math.util.ts` | `lib/api/admin-dashboard-api.ts` |
| 057 | `GatewayBreakdownRow` | `admin/dashboard/queries/breakdowns.query.ts` | `lib/api/admin-dashboard-api.ts` |
| 058 | `MethodBreakdownRow` | `admin/dashboard/queries/breakdowns.query.ts` | `lib/api/admin-dashboard-api.ts` |
| 059 | `GmvDailyPoint` | `admin/dashboard/queries/series.query.ts` | `lib/api/admin-dashboard-api.ts` |
| 060 | `RevenueDailyPoint` | `admin/dashboard/queries/series.query.ts` | `lib/api/admin-dashboard-api.ts` |
| 061 | `AdminHomePeriod` | `admin/dashboard/range.util.ts` | `lib/api/admin-dashboard-api.ts` |
| 062 | `AdminHomeCompare` | `admin/dashboard/range.util.ts` | `lib/api/admin-dashboard-api.ts` |
| 063 | `AdminProductDetail` | `admin/products/queries/detail-product.query.ts` | `lib/api/admin-products-api.ts` |
| 064 | `AdminProductRow` | `admin/products/queries/list-products.query.ts` | `lib/api/admin-products-api.ts` |

- **Severity**: P3 — legitimate REST boundary
- **Status**: ⏸ kept local (all 22)

### DUP-065: LoginDto / RefreshDto / ChangePasswordDto — auth vs admin

- **DEPRECATION_MAP**: ⏸ kept local — intentional security-tier boundary
- **Status**: ⏸ kept local

### DUP-066: CalendarEvent — backend vs frontend

- **Status**: ⏸ kept local — API boundary

### DUP-067: WaitForReplyNodeData — backend vs frontend

- **Status**: ⏸ kept local — runtime vs editor

### DUP-068: DestructiveIntentView / NotConfiguredException

- **Status**: ⏸ (#1); ⏳ (#2 should import from integrations/exceptions)---

## Part 9: sha256 Hash Cluster

### DUP-069: sha256 — 15+ call sites, 4 variant groups

- **Concept**: SHA-256 hashing with per-site encoding/normalization divergence
- **Severity**: P2
- **Variant groups**:
  - **Hex digest standalone**: throttler/route-class.guard, admin-crypto (`sha256Hex`),
    facebook-capi (lowercase+trim), pii-hash.helper ✅, evidence-store, genesis-event
  - **hashOpaqueToken** (3 body-identical): auth-service.helpers, auth-verification,
    auth-partner — extract to `common/crypto.ts`
  - **deriveKey** (3 raw-digest, ✅ unified): google-ads/meta/tiktok token-crypto →
    `token-crypto-shared.helper.ts`
  - **Specialized**: idempotency-fingerprint (slice 32), google-ads.helpers (base64url),
    memory-curator (slice 24), mind-concepts (multi-update), lineage-ledger,
    commercial-decision-orchestrator/telemetry (multi-update), payment.controller (slice 32)
- **Divergence axis**: encoding (hex/base64url/raw), normalization, truncation
- **Already-migrated reference**: `hashPii` + `handleMissingTokenCryptoKey` (DEPRECATION_MAP ✅)
- **Status**: ⏳ (hashOpaqueToken); ⏸ (rest)

## Part 10: asString / readString Clusters

### DUP-070: asString — 5 implementations, 3 shapes

- **Concept**: Coerce `unknown` → `string | null`
- **Severity**: P1 (divergent trim/empty handling)
- **Implementations**:
  1. `common/types.ts:49` — `asString` (no trim, empty→null) — canonical
  2. `checkout/mercado-pago-webhook.controller.ts:22` — trim + empty→null
  3. `kloel/agent-runtime/agent-runtime.session-store.search.ts:290` — trim + empty→null
  4. `auth/workspace-access.ts:81` — `asStringOrUndefined` → use `parse::readString`
  5. `worker/providers/tools-registry.ts:29` — raw string → use `parse::readStringForce`
- **Status**: ⏳ pending

### DUP-071: readString — 1 remaining local after Round 10

- **Canonical**: `common/parse.ts` — `readString`, `readStringOrNull`, `readStringForce`,
  `readStringOr`, `readStringOrUntrimmed`, `readStringProperty`, `readStringArray`,
  `readStringArrayOr`
- **Remaining local**: `prisma/checkout-paid-effects/shared.ts:39` — returns `null`
  → use `common/parse::readStringOrNull`
- **Already-migrated reference**: 6 readString variants → Round 10 (DEPRECATION_MAP ✅)
- **Status**: ⏳ (1 remaining)

## Part 11: Test Infrastructure

### DUP-072: makeEvent — 2 variants (~29 spec files)

- **DEPRECATION_MAP**: ⏳ planned Wave B.1
- **Status**: ⏳ planned

### DUP-073: MockPrisma / PrismaMock — ~50 spec files

- **DEPRECATION_MAP**: ⏳ planned Wave A.3
- **Status**: ⏳ planned

### DUP-074: FlexMock — ~20 spec files

- **DEPRECATION_MAP**: ⏳ planned Wave B.2
- **Status**: ⏳ planned

### DUP-075: buildService — ~20 spec files

- **DEPRECATION_MAP**: ⏸ kept local — domain-specific constructor signatures
- **Status**: ⏸ kept local

### DUP-076: makePrismaStub — 3 test-helper files

- **DEPRECATION_MAP**: ⏸ kept local — different Prisma models
- **Status**: ⏸ kept local---

## Part 12: Cross-Workspace Mirrors

> Byte-identical or near-identical files across workspaces without shared package.
> ~80 symbols total; 6 key families below.

### DUP-077: async-sequence — backend ↔ frontend ↔ worker

- **Implementations**: `backend/src/common/async-sequence.ts`,
  `frontend/src/lib/async-sequence.ts`, `worker/utils/async-sequence.ts`
- **DEPRECATION_MAP**: ⏸ kept local — separate workspaces
- **Status**: ⏸ kept local

### DUP-078: resolve-redis-url — backend ↔ worker

- **Status**: ⏸ kept local

### DUP-079: contracts/ — backend ↔ worker (3 families)

- **Implementations**: `autopilot-jobs`, `sales-templates`, `conversation-agent-state`
- **Risk**: Producer/consumer drift if one copy updated without the other
- **Recommendation**: Manual sync protocol — always update BOTH copies
- **Status**: ⏸ kept local

### DUP-080: formatBRL — backend ↔ frontend

- **Status**: ⏸ kept local

### DUP-081: forEachSequential / findFirstSequential — frontend ↔ backend

- **Status**: ⏸ kept local

### DUP-082: checkEmail — auth vs health probe

- **Status**: ⏸ kept local — different concerns

## Part 13: Orphan/Unwired Modules

> From [`docs/audits/WAVE2_ORPHAN_EXPORTS.md`](../audits/WAVE2_ORPHAN_EXPORTS.md).

### DUP-083: 4 empty NestJS modules never wired into AppModule

- **Implementations**: `email/email.module.ts` (EmailModule),
  `post-sale/post-sale.module.ts` (PostSaleModule),
  `kloel/channel-survival/channel-survival.module.ts` (ChannelSurvivalModule),
  `kloel/event-emit-audit-emitter/event-emit-audit-emitter.module.ts`
- **Status**: ⏳ pending audit

### DUP-084: Ledger reconciliation types — never imported

- **Implementations**: `common/ledger-reconciliation.service.ts` — 4 types
- **Status**: ⏳ pending audit

### DUP-085: executeUnifiedAgentToolAction — zero callers

- **Implementations**: `kloel/unified-agent-tool-router.ts:18`
- **Status**: ⏳ pending audit

### DUP-086: Agency/Clarity/Coldstart/Commem orphan interfaces — 18 total

- **Status**: ⏸ kept local — documentation value

### DUP-087: Frontend orphan exports — 18 verified

- **Implementations**: gerencieFeatures, recupereFeatures, impulsioneFeatures,
  faleFeatures, webinarPageStyles, CANVAS_DEFAULT_PALETTE, MachineRail,
  createAnonymousSessionId, EXTERNAL_BRAND_TOKENS, CANVAS_PRODUCT_TEMPLATES,
  CapabilityFeature/CapabilityGroup, useBrazilianBanks, useAppleDiagnostic,
  useCommandPalette
- **Status**: ⏳ pending audit

## Part 14: Design Token / Constant Clusters

### DUP-088: BG_CARD / BG_ELEVATED / BORDER — 3 module-shared.tsx

- **DEPRECATION_MAP**: ⏸ kept local — 36+ consumers for 6 lines
- **Status**: ⏸ kept local

### DUP-089: TONE_OPTIONS — 3 files

- **Status**: ⏸ kept local

### DUP-090: PATTERN_RE / D_RE / S_RE / WHITESPACE_RE — 50+ files

- **Status**: ⏸ kept local — low ROI extraction

### DUP-091: EMBER / SORA / MONO / FONT_MONO — 13-24 files each

- **Status**: ⏸ kept local — per-module design token re-exports

### DUP-092: PROCESSOR_VERSION / SCHEMA_VERSION — not duplications

- **Status**: ✅ each processor has its own version

### DUP-093: insufficientWalletMessage — 2 files

- **Status**: ⏳ pending audit

### DUP-094: ValidateCouponDto — 2 files

- **Status**: ⏳ pending audit

### DUP-095: GoogleTokenResponse — 2 files

- **Status**: ⏳ pending audit

### DUP-096: assertAgentCanAuthenticate / buildAuthLogMessage — auth helpers

- **Severity**: P1 — two near-identical auth helper files
- **Status**: ⏳ pending audit

### DUP-097: readConfig — 2 files, one protected

- **DEPRECATION_MAP**: ✅ / ⏸ kept local
- **Status**: ✅ resolved (llm-provider); ⏸ kept local (ai-models)---

## Part 15: Already-Resolved Duplications (✅)

> From [`DEPRECATION_MAP.md`](./DEPRECATION_MAP.md). Migrations 2026-05-20 through 2026-05-26.

| DUP | What | Canonical | Commit |
|---|---|---|---|
| R01 | `clamp` × 12 | `common/math.ts::clamp` | afb2378c9 |
| R02 | `safeStr` × 8 | `common/string.ts::safeStr` | 71a5f3549 |
| R03 | `sanitize*Error` × 3 | `auth/sanitize-auth-error.helper` | 75c3aa3d7 |
| R04 | `trimToUndefined` × 2 | `common/parse::readTrimmedString` | 591412996 |
| R05 | `sleep` × 3 | `common/async-sequence::sleep` | fe6887773 |
| R06 | `digitsOnly`-local × 2 | `common/phone::digitsOrUndefined` | 1703d9b80 |
| R07 | `extractErrorMessage` | `auth/sanitize-auth-error.helper` | 611fea372 |
| R08 | 9 `Math.random()` ID gens | `common/random-id::randomIdSegment` | edc6269dc |
| R09 | `safeString` (bigint) | `common/string::safeStr` (extended) | 56c8052f0 |
| R10 | `normalizeProviderToken` | `safeStr(…).trim().toLowerCase()` inline | 53b0cec71 |
| R11 | `isValidDate` | `common/parse::isValidDate` | f5579e55e |

### Byte-identical sweep completions (DUP-R12 to R35)

| DUP | What | Canonical |
|---|---|---|
| R12 | `clamp` in 8 kloel types files | `common/math.ts` |
| R13 | `normalizeEmail` in auth | `common/string.ts` |
| R14 | `safeStr` in 4 kloel helpers | `common/string.ts` |
| R15 | `filterByWorkspace` in 3 kloel types | `spine-events.helpers.ts` |
| R16 | `formatCurrency` in frontend | `lib/common/money.ts::formatBRL` |
| R17 | `asRecord` in 3 payments + 1 kloel | `common/types.ts::asRecord` |
| R18 | `readString` S1-S7 variants | `common/parse.ts` family |
| R19 | `FollowupListItem` × 3 | `kloel.service.lists.helpers.ts` |
| R20 | `ChatMessage` × 4 | `kloel-thinker.types.ts` |
| R21 | 9 Autopilot* types | `autopilot/page.types.ts` |
| R22 | 9 WhatsApp tool Args | `kloel-tool-executor.types.ts` |
| R23 | `RecommendedChannel` + helpers | `insight/insight.types.ts` |
| R24 | `MindPolicyChooser` × 3 | `mind-catalog-decision-resolvers.ts` |
| R25 | `unwrapApiPayload` inline | `product-nerve-center.shared.tsx` |
| R26 | `centsFromUnknown` × 2 | `kloel-chat-tools.service.ts` |
| R27 | `channelPriority` × 2 | `insight-delivery.service.ts` |
| R28 | `REPO_ROOT` + `repoPath` | `kloel-code-analysis.service.ts` |
| R29 | `decisionConfidence` + `PolicyDecisionResult` | `mind-catalog-decision-resolvers.ts` |
| R30 | `hashPii` 3-way | `integrations/pii-hash.helper.ts` |
| R31 | `buildRedirect` + `normalizeFrontendUrl` | `mailbox-oauth-callback.helpers.ts` |
| R32 | `handleMissingTokenCryptoKey` 3-way | `token-crypto-shared.helper.ts` |
| R33 | `parseDateOrFail` 2-way | `common/parse-date-or-fail.helper.ts` |
| R34 | Frontend api proxy auth | `_lib/bearer-from-request.ts` |
| R35 | Apple OAuth frontend 4-way | `_lib/apple-auth.ts` |---

## Part 16: Kept-Local Divergences (⏸)

> Catalogued for completeness. Justification in [`DEPRECATION_MAP.md`](./DEPRECATION_MAP.md).

| DUP | Name | Files | Why kept local |
|---|---|---|---|
| K01 | `clamp` tuple-domain | `kloel/evol/types.ts` | Different operator `clamp([min,max], v)` |
| K02 | `clampScore` | `healthy-money/healthy-money.types.ts` | Camada XIX scoped |
| K03 | `normalizeEmail` | `checkout/checkout-social-lead.util.ts` | Null-on-empty semantics |
| K04 | `formatCurrency` | `autopilot/page.ui.tsx` | Plain `'R$ '` format |
| K05 | `formatCurrency` | `settings/brain-settings-section.helpers.ts` | `''` on non-number |
| K06 | `asRecord` | `agent-runtime.session-store.search.ts` | Returns `{}` not `null` |
| K07 | `asRecord` | `webhooks/webhooks.service.ts` | Accepts Arrays |
| K08 | `FeedbackInput` × 3 | clarity / incent / team | 3 unrelated domains |
| K09 | `SessionStatus` × 3 | whatsapp providers | Different state-unions |
| K10 | `ToolResult` | agent-runtime helpers | Different tool family |
| K11 | `makePrismaStub` × 3 | fraud / ledger / wallet | Different Prisma models |
| K12 | `ClientContextBundle` × 2 | agency dir | Different fields |
| K13 | `HandoffPackage` × 2 | agency / team | Agency vs team handoff |
| K14 | `ObservabilityModule` × 2 | common / kloel | Different providers/exports |
| K15 | `PortfolioResult` × 2 | agency dir | Different state types |
| K16 | `LoginDto` / `RefreshDto` / `ChangePasswordDto` | auth / admin / kyc | Security-tier boundary |
| K17 | `Fmt` × 5 | various frontend | Domain-specific conventions |
| K18 | `formatMoney` × 3 settings | crm / analytics / billing | Different fallback semantics |
| K19 | `readText` × 3 | common / member-area / meta | Different return types |
| K20 | `normalizeJsonObjExt` | whatsapp helpers | Divergent JSON handling |
| K21 | `TONE_OPTIONS` × 3 | mind-decision / 2 frontend | Completely different shapes |
| K22 | `readConfig` | `lib/ai-models.ts` | Protected file |
| K23 | `buildService` × 20 | various specs | Domain-specific constructors |
| K24 | backend↔worker mirrors (~80) | 5 contract families | Separate workspaces |
| K25 | `BG_CARD` / `BG_ELEVATED` / `BORDER` | 3 module-shared.tsx | 36+ consumers for 6 lines |

---

## Cross-References

- [`DEPRECATION_MAP.md`](./DEPRECATION_MAP.md) — migration tracking
- [`docs/audits/WAVE1_SEMANTIC_DUPS.md`](../audits/WAVE1_SEMANTIC_DUPS.md) — DUP-001 to DUP-005
- [`FRONTEND_DEDUP_AUDIT.md`](./FRONTEND_DEDUP_AUDIT.md) — DUP-009 to DUP-016
- [`GRAPHIFY_DUPLICATES.md`](./GRAPHIFY_DUPLICATES.md) — 1028 symbol-level groups
- [`docs/audits/WAVE2_ORPHAN_EXPORTS.md`](../audits/WAVE2_ORPHAN_EXPORTS.md) — DUP-083 to DUP-087
- [`docs/audits/WAVE2_MATH_RANDOM_AUDIT.md`](../audits/WAVE2_MATH_RANDOM_AUDIT.md) — DUP-004 / DUP-R08

## Regeneration

Manually curated. Automated scans that feed it:

```sh
node tools/canonicalize/scan.mjs
node tools/canonicalize/graphify-driven-dedup.mjs
python3 scripts/canon-sweep.py
```

**Canonicalization frontier as of 2026-05-26:**
- ✅ Byte-identical intra-workspace duplicates: **ZERO remaining**
- ⏳ Semantic duplicates (same intent, divergent bodies): **~10 families pending**
- ⏸ Cross-workspace mirrors: **~80 symbols, intentionally kept separate**
- ⏸ Kept-local divergences: **25 documented, each with justification**
