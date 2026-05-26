# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, its replacement, and migration
> status. New rows added as canonicalization migrations land.

| Deprecated locus | Replacement | Migrated since | Status |
|---|---|---|---|
| `clamp` in `kloel/commem/commem.types.ts` | `clamp` from `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` in `kloel/agency/agency.types.ts` | `clamp` + `clampScore` from `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` + `clampScore` + `daysSince` in `kloel/agency/types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` in `kloel/defens/types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` + `daysSince` in `kloel/channel/types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` in `kloel/evol/evol.types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` + `daysSince` in `kloel/postsale-consumers/postsale-consumers.types.ts` | `common/math.ts` + `spine-events.helpers.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` in `kloel/incent/types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clampScore` in `kloel/clarity/clarity.types.ts` | `common/math.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `clamp` in `kloel/evol/types.ts` (tuple-domain signature) | (stays local — different operator) | — | ⏸ kept local |
| `clampScore` in `kloel/healthy-money/healthy-money.types.ts` | (stays local — module-scoped Camada XIX) | — | ⏸ kept local |
| `normalizeEmail` in `auth/auth-service.helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `normalizeEmail` in `auth/auth.helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `normalizeEmail` in `checkout/checkout-social-lead.util.ts` | (stays local — null-on-empty semantics) | — | ⏸ kept local |
| `safeStr` in `kloel/kloel-lead-brain.helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `safeStr` in `kloel/kloel-lead-processor-helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `safeStr` in `kloel/kloel-workspace-context.helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `safeStr` in `kloel/product-sub-resources/helpers/common.helpers.ts` | `common/string.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `filterByWorkspace` in `kloel/channel/types.ts` | `kloel/spine-events.helpers.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `filterByWorkspace` in `kloel/defens/types.ts` | `kloel/spine-events.helpers.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `filterByWorkspace` + `filterByWorkspaceAndEntity` in `kloel/postsale-consumers/postsale-consumers.types.ts` | `kloel/spine-events.helpers.ts` | 2026-05-20 | ✅ migrated (re-export) |
| `formatCurrency` in `frontend/app/(main)/cia/utils.ts` | `frontend/lib/common/money.ts::formatBRL` | 2026-05-20 | ✅ migrated (re-export) |
| `formatCurrency` in `frontend/app/(main)/cia/page.helpers.ts` | `frontend/lib/common/money.ts::formatBRL` | 2026-05-20 | ✅ migrated (re-export) |
| `formatCurrency` in `frontend/app/(main)/autopilot/page.ui.tsx` | (stays local — plain string `'R$ '` format) | — | ⏸ kept local |
| `formatCurrency` in `frontend/components/kloel/settings/brain-settings-section.helpers.ts` | (stays local — `''` on non-number) | — | ⏸ kept local |
| `normalizePhone` (3 backend variants) | `phone.digits` / `phone.optional` / `phone.whatsapp` (facets to be created) | — | ⏳ planned (Round 4) |
| `Asaas` (any usage) | `Stripe` (cartão) / `MercadoPago` (PIX) | superseded ADR 0003 + ADR 0009 | ⛔ banned |
| `mercado_entrada.declared` event | `commerce.onboarding.declared` event | 2026-05-21 | ✅ migrated (event-rename, 8 string refs) |
| `asRecord` in `payments/ledger/connect-ledger-reconciliation.service.ts` | `common/types.ts::asRecord` | 2026-05-21 | ✅ migrated (Round 10) |
| `asRecord` in `payments/connect/connect-payout-approval.helpers.ts` | `common/types.ts::asRecord` | 2026-05-21 | ✅ migrated |
| `asRecord` in `payments/connect/connect-reversal.service.ts` | `common/types.ts::asRecord` | 2026-05-21 | ✅ migrated |
| `asRecord` in `kloel/email-workspace-delivery.ts` | `common/types.ts::asRecord` | 2026-05-21 | ✅ migrated |
| `asRecord` in `agent-runtime/agent-runtime.session-store.search.ts` | (stays local — returns `{}` not null) | — | ⏸ kept local |
| `asRecord` in `webhooks/webhooks.service.ts` | (stays local — accepts Arrays) | — | ⏸ kept local |
| `readString` in `common/request-logger.interceptor.ts` (S1) | `common/parse.ts::readString` | 2026-05-21 | ✅ migrated (Round 10) |
| `readString` in `common/idempotency.interceptor.ts` (S1) | `common/parse.ts::readString` | 2026-05-21 | ✅ migrated |
| `readString` in `flows/flows.gateway.ts` (S1) | `common/parse.ts::readString` | 2026-05-21 | ✅ migrated |
| `readString` in `whatsapp/providers/provider-registry-session.ts` (S1) | `common/parse.ts::readString` | 2026-05-21 | ✅ migrated |
| `readString` in `kloel/email-workspace-delivery.ts` (S2) | `common/parse.ts::readTrimmedString` (aliased back to `readString`) | 2026-05-21 | ✅ migrated |
| `readString` in `kloel/owner-criterion/observers/correction.observer.ts` (S4) | `common/parse.ts::readStringForce` (aliased) | 2026-05-21 | ✅ migrated |
| `readString` (S3, S5a/b, S6, S7 variants) | `common/parse.ts` family | — | ⏳ planned (Wave A.3) |
| `readNumber` (5 variants across 7 files) | `common/parse.ts::readNumber{,Loose,Or,Force}` + `readInt` | — | ⏳ planned (A2 audit ready) |
| `MockPrisma` / `PrismaMock` inline (~282 spec files) | `test/helpers/prisma.mock.ts::createPrismaMock` | — | ⏳ planned (A3 audit ready) |
| `FlexMock` local (6 spec files) | `test/helpers/prisma.mock.ts::FlexMock` | — | ⏳ planned (Wave B.2 in flight) |
| `makeEvent` Variants A+B (18 spec files) | `test/helpers/spine-event-factory.ts::makeEventFactory{,Ms}` | — | ⏳ planned (Wave B.1 in flight) |
| `buildService` (8 spec files) | (stays local — domain-specific constructor signatures) | — | ⏸ kept local |
| `FollowupListItem` in `kloel/{kloel-lead-processor.service,kloel.service}.ts` | `kloel/kloel.service.lists.helpers.ts::FollowupListItem` | 2026-05-26 | ✅ migrated (re-export; `import type + export type` where used locally) |
| `ChatMessage` in `kloel/{kloel-thread.service,kloel-lead-processor-helpers,kloel-lead-brain.helpers}.ts` | `kloel/kloel-thinker.types.ts::ChatMessage` | 2026-05-26 | ✅ migrated (re-export; 4 byte-identical defs collapsed to 1 canonical) |
| 9 `Autopilot*` types (`AutopilotStatus`/`Stats`/`Impact`/`Action`/`Insight`/`ConfigData`/`Pipeline`/`SystemHealth`/`SmokeTestResult`) in `frontend/app/(main)/autopilot/page.ui.tsx` | `frontend/app/(main)/autopilot/page.types.ts` | 2026-05-26 | ✅ migrated (re-export; 136 lines removed; verified byte-identical via md5sum) |
| `lib/api/autopilot.ts` Autopilot* types (Record<string,unknown> stubs) | (stays local — divergent: API-layer placeholder stubs, NOT the real shapes in page.types) | — | ⏸ kept local |
| `FeedbackInput` in `kloel/{clarity/clarity.types,incent/user-feedback-correction.service,team/team.types}.ts` | (stays local — 3 unrelated domains, same name, different shapes) | — | ⏸ kept local |
| `SessionStatus` in `whatsapp/providers/{provider-registry.types,waha-types,whatsapp-api.provider.types}.ts` | (stays local — 3 provider variants with different state unions) | — | ⏸ kept local |
| `ToolResult` in `kloel/{kloel-chat-tools.agent-runtime.helpers,kloel-tool-executor.types,kloel-whatsapp-tools.helpers}.ts` | (stays local — divergent stubs per tool family) | — | ⏸ kept local |
| `makePrismaStub` in `payments/{fraud,ledger}/.spec-helpers.ts` + `wallet/__test-support__/prepaid-wallet.controller.spec-helpers.ts` | (stays local — stubs for 3 different Prisma models: FraudBlacklist, ConnectAccountBalance, PrepaidWallet) | — | ⏸ kept local |
| `ClientContextBundle` in `kloel/agency/{agency.types,types}.ts` | (stays local — 2 variants in same dir with different fields) | — | ⏸ kept local |
| `HandoffPackage` in `kloel/{agency/types,team/team.types}.ts` | (stays local — agency-handoff vs team-handoff have completely different shapes) | — | ⏸ kept local |
| `ObservabilityModule` in `common/observability/` + `kloel/observability/` | (stays local — 2 distinct NestJS modules with different providers/exports) | — | ⏸ kept local |
| `PortfolioResult` in `kloel/agency/{agency.types,portfolio-assessment}.ts` | (stays local — references different state types: ConsolidatedPortfolioState vs PortfolioState) | — | ⏸ kept local |
| `LoginDto` / `RefreshDto` / `ChangePasswordDto` in `auth/dto/` + `admin/auth/dto/` (+ `kyc/dto/` for ChangePasswordDto) | (stays local — admin auth has stricter limits/regex by design; intentional security-tier boundary) | — | ⏸ kept local |
| `Fmt` in `frontend/app/(main)/analytics/analytics.design-tokens.ts` + `frontend/components/kloel/sites/SitesViewIcons.tsx` | (stays local — different formatting: locale vs K-suffix) | — | ⏸ kept local |
| `formatMoney` in `frontend/components/kloel/marketing/WhatsAppExperience.helpers.ts` + `frontend/components/kloel/settings/crm-settings-section.helpers.ts` + `frontend-admin/app/(admin)/produtos/page.helpers.ts` | (stays local — different fallback semantics: Intl.NumberFormat vs 'R$ 0,00' vs '—') | — | ⏸ kept local |
| `readText` in `common/utils.ts` + `member-area/member-area.helpers.ts` + `meta/read-model/meta-read-helpers.ts` | (stays local — different return types: string vs string\|undefined; different non-string handling) | — | ⏸ kept local |
| `clamp` in `kloel/evol/types.ts` (tuple-domain signature `clamp([min,max], value)`) | (stays local — different operator from `common/math.ts::clamp(value, min, max)`) | — | ⏸ kept local |
| 3 Autopilot leftover types (`MoneyReport`/`QueueStats`/`RevenueEvent`) in `frontend/app/(main)/autopilot/page.ui.tsx` | `frontend/app/(main)/autopilot/page.types.ts` | 2026-05-26 | ✅ migrated (re-export; aligns with the existing 9-Autopilot* pattern) |
| Orphan duplicate `useCheckoutExperienceHelpers.ts` (no-dot) | `useCheckoutExperience.helpers.ts` (with dot) | 2026-05-26 | ✅ removed (zero importers; 104 lines deleted) |
| Orphan `cia/page.sections.tsx` (245L) | `cia/components/{CiaHeader,CiaStats,CiaNow,CiaMoneyEvents,CiaInsights}.tsx` | 2026-05-26 | ✅ removed (all 5 exports had standalone twins; zero importers) |
| `formatCurrency`/`formatPhaseLabel`/`formatTs`/`workItemStateBadgeVariant`/`PATTERN_RE_2` in `cia/page.helpers.ts` | `cia/utils.ts` | 2026-05-26 | ✅ migrated (re-export; utils is canonical with 'use client' + 6 consumers) |
| `createClientRequestId` in `components/kloel/dashboard/KloelDashboard.helpers.ts` | `components/kloel/chat-container.helpers.ts` | 2026-05-26 | ✅ migrated (re-export from parent-dir canonical) |
| `AutopilotImpactLike` in `components/kloel/autopilot/AutopilotDecisionLog.tsx` | `components/kloel/autopilot/AutopilotPlanInspector.tsx` | 2026-05-26 | ✅ migrated (re-export; PlanInspector is canonical with 3 sibling importers) |
| `BrazilianBank` type in `hooks/useBrazilianBanks.ts` | `data/brazilian-banks.ts` | 2026-05-26 | ✅ migrated (re-export; data module is canonical) |
| `ChannelRealData` in marketing `WhatsAppExperience.{panel-tokens,controller}.ts` | `components/kloel/marketing/MarketingTypes.ts` | 2026-05-26 | ✅ migrated (re-export; MarketingTypes is canonical) |
| `EmailTemplatePreset` in `hooks/useEmailPresets.ts` | `components/kloel/marketing/MarketingTypes.ts` | 2026-05-26 | ✅ migrated (re-export) |
| `RTierDelta` + `commercialImpactWeight` + `tierToNumber` in `kloel/evol/evol.types.ts` | `kloel/evol/types.ts` | 2026-05-26 | ✅ migrated (re-export; types.ts has 13+ importers vs 3) |
| 9 WhatsApp tool `Args` interfaces in `kloel/kloel-whatsapp-tools.helpers.ts` | `kloel/kloel-tool-executor.types.ts` | 2026-05-26 | ✅ migrated (re-export; executor.types is canonical with 7 importers) |
| `RecommendedChannel` + `withinWindow` + `median` in `kloel/offer/offer.types.ts` | `kloel/insight/insight.types.ts` | 2026-05-26 | ✅ migrated (re-export; insight is canonical, 5 wow/* importers already use it) |
| `MindPolicyChooser` in `kloel/mind-{commercial,recovery}-decision-resolvers.ts` | `kloel/mind-catalog-decision-resolvers.ts` | 2026-05-26 | ✅ migrated (re-export; catalog is canonical, its spec already imports from it) |
| `unwrapApiPayload` inline in `components/kloel/products/ProductNerveCenterIATab.hooks.ts` | `components/kloel/products/product-nerve-center.shared.tsx` | 2026-05-26 | ✅ migrated (import; shared canonical with 8 sibling importers) |
| 3+ `SessionStatus` shapes in `whatsapp/providers/{provider-registry,waha-types,whatsapp-api.provider}.types.ts` | (stays local — divergent state-unions per provider; verified 2026-05-26) | — | ⏸ kept local |
| `PulseTruthSnapshotService` class in `kloel/{abi,pulse-gates}/pulse-truth-snapshot.service.ts` | (stays local — different snapshot shapes and signal sources; both wired into their own NestJS module) | — | ⏸ kept local |
| `AttributionGuardResult` + `AttributionViolation` in `kloel/commem/commem.types.ts` + `kloel/wisdom/wisdom-attribution.guard.ts` | (stays local — divergent shapes per domain) | — | ⏸ kept local |
| `normalizeJsonObjExt` + `resolveTimestampExt` in `whatsapp/whatsapp-{catchup,service}.helpers.ts` | (stays local — divergent JSON-string handling and field fallbacks) | — | ⏸ kept local |
| `TONE_OPTIONS` in `kloel/mind-decision-baselines.ts` + 2 frontend files | (stays local — completely different shapes: enum array vs labeled-tuple vs i18n-key strings) | — | ⏸ kept local |
| `pollUntil` in `worker/utils/async-sequence.ts` + `backend/src/common/async-sequence.ts` | (stays local — cross-workspace mirror; differs only in TS assertion noise) | — | ⏸ kept local |
| Local `isRecord` + `toErrorMessage` in `frontend/lib/kloel-conversations.ts` | (stays local — would create lib→components reverse-dependency) | — | ⏸ kept local |
| `CheckoutFormDraft` / draft helpers in `frontend/app/(checkout)/hooks/useCheckoutExperienceSocial.draft.ts` | (stays local — bound to `CheckoutExperienceForm` (social-helpers) vs `CheckoutExperienceFormState` (.types); unifying requires unified form type) | — | ⏸ kept local |
| `centsFromUnknown` in `kloel/kloel-tool-executor-crm.service.ts` | `kloel/kloel-chat-tools.service.ts::centsFromUnknown` | 2026-05-26 | ✅ migrated (exported) |
| `channelPriority` in `kloel/offer/offer-delivery.service.ts` | `kloel/insight/insight-delivery.service.ts::channelPriority` | 2026-05-26 | ✅ migrated (exported; matches RecommendedChannel canon home) |
| `REPO_ROOT` + `repoPath` in `kloel/kloel-code-tools.service.ts` | `kloel/kloel-code-analysis.service.ts` | 2026-05-26 | ✅ migrated (exported sandbox guard) |
| `decisionConfidence` + `PolicyDecisionResult` in `kloel/mind-{commercial,recovery}-decision-resolvers.ts` | `kloel/mind-catalog-decision-resolvers.ts` | 2026-05-26 | ✅ migrated (exported; matches MindPolicyChooser canon home) |
| `unwrapApiPayload` inline in `components/kloel/products/ProductNerveCenterIATab.hooks.ts` | `components/kloel/products/product-nerve-center.shared.tsx` | 2026-05-26 | ✅ migrated (import; shared canonical with 8 sibling importers) |
| `hashPii` in 3 ad-platform Conversions API services (google-ads/meta/tiktok) | NEW `backend/src/integrations/pii-hash.helper.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `buildRedirect` + `normalizeFrontendUrl` in 2 mailbox OAuth callback controllers | NEW `backend/src/marketing/mailbox-oauth-callback.helpers.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `handleMissingTokenCryptoKey` in 3 token-crypto files (google-ads/tiktok/mailbox) | NEW `backend/src/integrations/token-crypto-shared.helper.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `parseDateOrFail` in 2 controllers (admin-carteira/calendar) | NEW `backend/src/common/parse-date-or-fail.helper.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `readConfiguredValue` in 2 mailbox OAuth helpers | `backend/src/marketing/mailbox-oauth-callback.helpers.ts` (existing) | 2026-05-26 | ✅ migrated (added to existing shared helper) |
| `readConfig` in `lib/openai-models.ts` | `lib/llm-provider.ts::readConfig` | 2026-05-26 | ✅ migrated (exported; ai-models.ts kept local — protected file) |
| `readConfig` in `lib/ai-models.ts` | (stays local — protected file; identical impl, cannot edit) | — | ⏸ kept local |
| `bearerFromHeaderOrCookie` + `firstCookieBearer` + `readCookieValue` in 2 frontend api proxies | NEW `frontend/src/app/api/_lib/bearer-from-request.ts` | 2026-05-26 | ✅ migrated (extracted to shared lib; local `''` fallback shim preserved) |
| `buildDuplicateAwareKey` in 2 settings sections (attendance-rules/company-identity) | NEW `frontend/src/components/kloel/settings/duplicate-aware-key.helper.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `FieldLabel` JSX primitive in `vendas/SmartPayment{Form,Result}.tsx` | NEW `vendas/SmartPaymentFieldLabel.tsx` | 2026-05-26 | ✅ migrated (UI primitive; JSX byte-identical so zero pixel changes) |
| `ConnectedBadge` JSX primitive in `marketing/{Sms,TikTok}MarketingTab.tsx` | NEW `marketing/MarketingConnectedBadge.tsx` | 2026-05-26 | ✅ migrated (UI primitive; JSX byte-identical so zero pixel changes) |
| `isAuthRedirectLike` + `resolveWorkspaceHeader` in 2 api proxies | `frontend/src/app/api/_lib/bearer-from-request.ts` (existing) | 2026-05-26 | ✅ migrated (added to existing helper; local `readCookieValue` shim removed in both) |
| `readAppleClientId` + `parseAppleUser` + `AppleUserPayload` across 4 Apple OAuth routes | NEW `frontend/src/app/api/_lib/apple-auth.ts` | 2026-05-26 | ✅ migrated (regular auth start/callback + social-checkout start/callback share canonical) |
| `getServerApiBase` in 2 checkout server pages (`/[slug]/page.tsx`, `/r/[code]/page.tsx`) | NEW `frontend/src/app/(checkout)/server-api-base.ts` | 2026-05-26 | ✅ migrated (env-precedence + trailing-slash strip canonical) |
| backend↔worker cross-workspace mirrors (`async-sequence`, `resolve-redis-url`, `contracts/autopilot-jobs`, `constants/sales-templates`, `conversation-agent-state`) | (stays local — separate workspaces by design; ~80 dup symbols) | — | ⏸ kept local |
| `resolveEmailConfig` + `EmailConfig` type in worker `providers/{channel-dispatcher,email-provider}.ts` | NEW `worker/providers/email-config.helper.ts` | 2026-05-26 | ✅ migrated (extracted to shared helper) |
| `BG_CARD` / `BG_ELEVATED` / `BORDER` theme shortcuts in 3 module-shared.tsx files | (stays local — each is a 1-line `KLOEL_THEME.xxx` shorthand owned by its module; consolidation touches 36+ consumers for 6 lines of dup) | — | ⏸ kept local |

---

## Byte-identical canonicalization sweep — COMPLETE 2026-05-26

After this round, the codebase has **zero remaining intra-workspace byte-identical
function/type/interface/enum duplicates** across backend/src, frontend/src,
and worker/. Verified via:

```
python3 scripts/canon-sweep.py  # checks sym_re + type_re + const_re
```

The 23 remaining duplicates are all **cross-workspace mirrors** (backend↔worker
for shared contracts like `contracts/autopilot-jobs`, `resolve-redis-url`,
`async-sequence`, `sales-templates`, `conversation-agent-state`). These are
intentional: each workspace is its own Node process with its own dependency
boundary, and there is no shared package in the monorepo to host them.

---

## Semantic canonicalization sweep — IN PROGRESS 2026-05-26

After byte-identical sweep completion, the next layer is SEMANTIC: same-name
helpers with similar intent but divergent bodies. Discovery delegated to PI
atomic subagent `w1-dup-hunter-semantic` (DeepSeek V4 Pro) which produced
[`docs/audits/WAVE1_SEMANTIC_DUPS.md`](audits/WAVE1_SEMANTIC_DUPS.md) with
18 ranked candidate groups.

| Symbol | Status | Migration |
|---|---|---|
| `clamp` × 12 (affil + healthymoney + checkout-shipping + mind-synthetic) | ✅ migrated | → `common/math.ts::clamp` |
| `sanitizeAppleError` / `sanitizeErrorMessage` / `sanitizeTikTokError` | ✅ migrated | → `auth/sanitize-auth-error.helper::sanitizeAuthError` |
| `trimToUndefined` × 2 (kyc + connect.service) | ✅ migrated | → `common/parse::readTrimmedString` (alias) |
| `sleep` × 3 (idempotency.guard + 2 whatsapp inbound-processor) | ✅ migrated | → `common/async-sequence::sleep` |
| `safeStr` × 8 (cia + whatsapp + 4 kloel + product-context-formatter) | ✅ migrated | → `common/string.ts::safeStr` |
| `digitsOnly`-local × 2 (kyc + connect.service, undefined-on-empty semantics) | ✅ migrated | → `common/phone.ts::digitsOrUndefined` (alias `digitsOnly`) |
| `extractErrorMessage` (google-auth variant) | ✅ migrated | → `auth/sanitize-auth-error.helper::sanitizeAuthError` (alias) |
| `safeString` (mind-verbalizer, bigint variant) | ✅ migrated | → `common/string::safeStr` (extended to accept bigint) |
| `normalizeProviderToken` (whatsapp/provider-env) | ✅ migrated | → `safeStr(...).trim().toLowerCase()` inline |
| `isValidDate` (dashboard/home-aggregation) | ✅ migrated | → `common/parse::isValidDate` (new) |
| 9 `Math.random()` ID generators (abi-ab/goal-field/guest-chat/incent/legit/mercado-entrada/mind-prediction) | ✅ migrated | → `common/random-id::randomIdSegment` (crypto.randomBytes-backed) |
| `readRecord` / `asRecord` / `asUnknownRecord` × 12 (4 shapes) | ⏳ pending | needs per-shape decision |
| `isRecord` × 6 (3 shapes) | ⏳ pending | type-of-guard shape divergence |
| `readText` × 4 (3 shapes) | ⏳ pending | divergent return types |
| `generateId` × 2 | ⏳ pending | replace with `crypto.randomUUID()` per Wave-2 audit |
| `removeUndefined` / `compactObject` × 2 | ⏳ pending |  |
| 4 NestJS orphan modules (email/post-sale/channel-survival/event-emit-audit-emitter) | ⏸ kept local | not wired into AppModule but might be planned activation; documented in `audits/WAVE2_ORPHAN_EXPORTS.md` |

## Wave 2 audit outputs (PI subagent delegations)

| Audit | Subagent | Report | Key takeaway |
|---|---|---|---|
| `prismaAny` migration | `w1-prismaAny-newcode` | [`WAVE1_PRISMAANY_AUDIT.md`](audits/WAVE1_PRISMAANY_AUDIT.md) | **Zero remaining call sites** — migration COMPLETE; CLAUDE.md's "133 usos" claim is stale |
| Webhook security | `w1-webhook-security-audit` | [`WAVE1_WEBHOOK_SECURITY_AUDIT.md`](audits/WAVE1_WEBHOOK_SECURITY_AUDIT.md) | 20 endpoints, 15 Grade A, 5 Grade B (idempotency gaps in WhatsAppApi/Email-Marketing/EmailInbound), 0 signature gaps |
| Tier-3 module reality | `w1-tier3-mapper` | [`WAVE1_TIER3_AUDIT.md`](audits/WAVE1_TIER3_AUDIT.md) | 4 modules CLAUDE.md calls Tier-3 are actually READY (Vendas/Canvas/Leads/Webinarios); 3 truly PARTIAL (Anuncios/Marketing/Sites); 1 SHELL_ONLY (Funnels) |
| Semantic dups | `w1-dup-hunter-semantic` | [`WAVE1_SEMANTIC_DUPS.md`](audits/WAVE1_SEMANTIC_DUPS.md) | 18 candidate groups ranked by canon value (above) |
| Math.random hunt | `w2-math-random-hunt` | [`WAVE2_MATH_RANDOM_AUDIT.md`](audits/WAVE2_MATH_RANDOM_AUDIT.md) | 12 prod sites; 2 CRITICAL in WISDOM differential privacy (**FIXED**); 9 predictable ID generators; 1 fake-PIX mock (already NODE_ENV-gated) |
| File-size audit | `w2-file-size-audit` | [`WAVE2_FILE_SIZE_AUDIT.md`](audits/WAVE2_FILE_SIZE_AUDIT.md) | Only 1 file over 800-LOC cap (kloel-chat-tools.service); 74 files in 500-800 danger zone; top-5 decomposition targets ranked by LOC × 90d-churn |
| Orphan exports | `w2-orphan-exports` | [`WAVE2_ORPHAN_EXPORTS.md`](audits/WAVE2_ORPHAN_EXPORTS.md) | 37 backend / 18 frontend / 12 worker; 4 unwired NestJS modules; ledger reconciliation types; agency/clarity interface returns |
| Checkout-to-ledger flow | `w3-checkout-flow` | [`WAVE3_CHECKOUT_FLOW_TRACE.md`](audits/WAVE3_CHECKOUT_FLOW_TRACE.md) | Full happy-path trace from /[slug]/page.tsx → Stripe → LedgerService → fulfillment; per-hop honest-state coverage matrix |
| LLM prompt hygiene | `w3-llm-prompt-audit` | [`WAVE3_LLM_PROMPT_AUDIT.md`](audits/WAVE3_LLM_PROMPT_AUDIT.md) | 37 prompt sites scored on CLAUDE.md's 10-dim quality contract; avg 4.8/10; **10 CRITICAL gaps** (guest-chat anti-invention, autopilot anti-invention, agent-assist max_tokens, worker AI guardrails) |
| Dead-handler hunt | `w3-dead-handler-hunt` | [`WAVE3_DEAD_HANDLERS.md`](audits/WAVE3_DEAD_HANDLERS.md) | 600+ buttons scanned; only 3 locations with 10+ dead buttons (Dominios edit/trash, Canvas template tags, Sites overview cards) — all in tier-3 SHELL_ONLY surfaces |
| Empty-return endpoints | `w3-empty-returns` | [`WAVE3_EMPTY_RETURNS.md`](audits/WAVE3_EMPTY_RETURNS.md) | 550 handlers across 130+ controllers — **ZERO stub endpoints**. CLAUDE.md's anti-pattern is already enforced; every `return []` is an honest empty-state or input-guard |

## Wave 2/3 actions taken from audits

| Finding | Action | Commit |
|---|---|---|
| WISDOM Math.random for differential privacy | Replaced with crypto.randomBytes-backed secureUniform | ccedf980c |
| clamp dups (12 files) | Re-imported from common/math | afb2378c9 |
| sanitize*Error trio | Extracted to auth/sanitize-auth-error.helper | 75c3aa3d7 |
| trimToUndefined dups | Re-imported from common/parse::readTrimmedString | 591412996 |
| sleep dups | Re-imported from common/async-sequence | fe6887773 |
| digitsOrUndefined kyc/connect dups | Added to common/phone, both re-aliased | 1703d9b80 |
| safeStr × 8 dups | Re-imported from common/string | 71a5f3549 |
| extractErrorMessage (google-auth) | Aliased to sanitizeAuthError | 611fea372 |
| 9 Math.random ID generators | Replaced with randomIdSegment (CSPRNG) | edc6269dc |
| safeString → safeStr (bigint extension) | Extended common/string::safeStr | 56c8052f0 |
| normalizeProviderToken | Replaced w/ safeStr().trim().toLowerCase() | 53b0cec71 |
| isValidDate | Added to common/parse | f5579e55e |

What remains as future canonicalization work is **semantic** (same-name with
divergent bodies) requiring per-case judgement (see ⏸ kept-local rows above
for the catalogue and the table above for the pending migrations).

**Status legend:**
- ✅ migrated (re-export): local export is now a re-export from canonical; callers unchanged, structure consolidated
- ⏸ kept local: divergent semantics or module-scoped; intentional duplication
- ⏳ planned: roadmap; not yet executed
- ⛔ banned: must not reappear; gates flag any reintroduction
