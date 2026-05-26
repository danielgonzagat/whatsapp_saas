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

**Status legend:**
- ✅ migrated (re-export): local export is now a re-export from canonical; callers unchanged, structure consolidated
- ⏸ kept local: divergent semantics or module-scoped; intentional duplication
- ⏳ planned: roadmap; not yet executed
- ⛔ banned: must not reappear; gates flag any reintroduction
