# PULSE REPORT — 2026-04-02T01:15:13.795Z

## Certification Status: PARTIAL

- Score: 67/100 (raw scan: 84/100)
- Environment: total
- Commit: 91281ad3f780103d85fe70bd9c730e9cb5e6ecda
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Codebase Truth

- Frontend pages discovered: 99
- User-facing pages: 95
- Raw modules discovered: 33
- Raw mutation flow candidates: 146

## Resolved Manifest

- Resolved modules: 33/33
- Resolved flow groups: 46/46
- Grouped semantic flow groups: 39
- Shared capability groups: 14
- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0

## Health Score: 67/100
`█████████████░░░░░░░` 67%

## Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 33 module(s), 46 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 69 critical/high blocking finding(s). |
| runtimePass | PASS | — | Runtime probes executed successfully. |
| browserPass | FAIL | product_failure | Browser-required critical scenarios are failing: customer-auth-shell, customer-product-and-checkout, admin-settings-kyc-banking. |
| flowPass | PASS | — | Flow evidence summary: 5 passed, 0 failed, 0 accepted, 0 missing evidence. |
| invariantPass | PASS | — | Invariant evidence summary: 1 passed, 0 failed, 0 accepted, 0 missing evidence. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: LGPD_NON_COMPLIANT. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | PASS | — | Recovery and rollback requirements have no blocking findings in this run. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | PASS | — | Observability and audit requirements have no blocking findings in this run. |
| customerPass | FAIL | product_failure | customer synthetic scenarios are failing: customer-auth-shell, customer-product-and-checkout. |
| operatorPass | FAIL | product_failure | operator synthetic scenarios are failing: operator-campaigns-and-flows. |
| adminPass | FAIL | product_failure | admin synthetic scenarios are failing: admin-settings-kyc-banking. |
| soakPass | FAIL | product_failure | soak synthetic scenarios are failing: operator-campaigns-and-flows. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 44/44 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | Execution trace and attached evidence are internally coherent for this run. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: core-critical
- Blocking tier: 1

| Tier | Name | Status | Blocking Gates | Reason |
|------|------|--------|----------------|--------|
| 0 | Truth + Runtime Baseline | PASS | — | Truth + Runtime Baseline passed all hard gate requirements. |
| 1 | Customer Truth | FAIL | browserPass, customerPass | blocking gates: browserPass, customerPass |
| 2 | Operator + Admin Replacement | FAIL | operatorPass, adminPass | blocking gates: operatorPass, adminPass |
| 3 | Production Reliability | FAIL | securityPass | blocking gates: securityPass |
| 4 | Final Human Replacement | FAIL | soakPass | blocking gates: soakPass; critical async expectations still pending in world state |

## Evidence Summary

- Runtime: Runtime probes executed successfully.
- Browser: Synthetic Playwright scenarios executed with failures: customer-auth-shell, customer-product-and-checkout, operator-campaigns-and-flows, admin-settings-kyc-banking, operator-campaigns-and-flows.
- Flows: Flow evidence summary: 5 passed, 0 failed, 0 accepted, 0 missing evidence.
- Invariants: Invariant evidence summary: 1 passed, 0 failed, 0 accepted, 0 missing evidence.
- Observability: Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Recovery: Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Customer: customer scenarios: 1 passed, 2 failed/checker-gap, 0 missing evidence.
- Operator: operator scenarios: 1 passed, 1 failed/checker-gap, 0 missing evidence.
- Admin: admin scenarios: 1 passed, 1 failed/checker-gap, 0 missing evidence.
- Soak: soak scenarios: 1 passed, 1 failed/checker-gap, 0 missing evidence.
- Synthetic Coverage: Synthetic coverage maps 44/44 non-ops page(s) to declared scenarios.
- Execution Trace: Execution completed: 80 phase(s) passed.
- Truth: Resolved manifest is aligned: 33 module(s), 46 flow group(s), no blocking drift.

## Human Replacement

- Status: NOT_READY
- Final target: core-critical
- Covered pages: 44/44
- Uncovered pages: 0
- Accepted critical flows remaining: 0
- Pending critical scenarios: 0
- Customer scenarios: 1/3 passed
- Operator scenarios: 1/2 passed
- Admin scenarios: 1/2 passed
- Soak scenarios: 1/2 passed

## Resolution Gaps

### Unresolved Modules

- None

### Orphan Manual Modules

- None

### Unresolved Flow Groups

- None

### Orphan Flow Specs

- None

### Legacy Manual Modules

- AI Brain
- Audio
- Copilot
- Diagnostics
- KYC
- Launch
- Member Area
- Ops Queues
- PDF Processor
- Pipeline
- Public API
- Reports
- Webinarios

### Excluded Modules

- None

### Excluded Flow Groups

- None

## Gate Evidence

### truthExtractionPass

- truth | executed=true | Resolved manifest built from 99 page(s), 33 module(s), 46 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 69 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=69, totalBreaks=446

### runtimePass

- runtime | executed=true | Runtime probes executed successfully.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: executedChecks=4, blockingBreakTypes=0
- runtime | executed=true | Backend health probe passed on /health/system (200).
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=backend-health, required=true, status=200, latencyMs=713, traceHeaderDetected=true
- runtime | executed=true | Auth probe obtained a token and reached /workspace/me successfully.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=auth-session, required=true, status=passed, latencyMs=763, authStatus=200, workspaceIdDetected=true
- runtime | executed=true | Frontend responded with HTTP 200.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=frontend-reachability, required=true, status=200, latencyMs=120
- runtime | executed=true | Database connectivity probe succeeded.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=db-connectivity, required=true, status=passed, latencyMs=2592, rows=1

### browserPass

- browser | executed=true | Synthetic Playwright scenarios executed with failures: customer-auth-shell, customer-product-and-checkout, operator-campaigns-and-flows, admin-settings-kyc-banking, operator-campaigns-and-flows.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json | Metrics: attempted=true, failureCode=ok, totalPages=0, totalTested=9, passRate=44, blockingInteractions=5

### flowPass

- flow | executed=true | auth-login passed its declared oracle (auth-session) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_auth-login.json | Metrics: flowId=auth-login, status=passed, accepted=false
- flow | executed=true | product-create passed its declared oracle (entity-persisted) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_product-create.json | Metrics: flowId=product-create, status=passed, accepted=false
- flow | executed=true | checkout-payment passed its declared oracle (payment-lifecycle) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_checkout-payment.json | Metrics: flowId=checkout-payment, status=passed, accepted=false
- flow | executed=true | wallet-withdrawal replay passed with transaction dd407d14-254d-4166-8203-26512358fb3e and ledger delta -1. Real withdrawal smoke remains opt-in.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_wallet-withdrawal.json | Metrics: flowId=wallet-withdrawal, status=passed, accepted=false
- flow | executed=true | whatsapp-message-send replay passed via seeded inbox conversation 7fa4911c-5c98-41ad-acf0-d2bd446532a8. Final outbound smoke remains opt-in.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_whatsapp-message-send.json | Metrics: flowId=whatsapp-message-send, status=passed, accepted=false

### invariantPass

- invariant | executed=true | wallet-balance-consistency passed via evaluator wallet-balance-consistency.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=wallet-balance-consistency, status=passed, accepted=false

### recoveryPass

- artifact | executed=true | Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Artifacts: PULSE_RECOVERY_EVIDENCE.json | Metrics: backupManifestPresent=true, backupPolicyPresent=true, backupValidationPresent=true, restoreRunbookPresent=true, disasterRecoveryRunbookPresent=true, disasterRecoveryTestPresent=true, seedScriptPresent=true

### observabilityPass

- artifact | executed=true | Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Artifacts: PULSE_OBSERVABILITY_EVIDENCE.json | Metrics: tracingHeadersDetected=true, requestIdMiddlewareDetected=true, structuredLoggingDetected=true, sentryDetected=true, alertingIntegrationDetected=true, healthEndpointsDetected=true, auditTrailDetected=true

### customerPass

- actor | executed=true | Playwright scenario customer-auth-shell failed with exit code 1.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-auth-shell, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=1, durationMs=5571
- actor | executed=true | Playwright scenario customer-product-and-checkout failed with exit code 1.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-product-and-checkout, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=18686
- actor | executed=true | Playwright scenario customer-whatsapp-and-inbox passed.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-whatsapp-and-inbox, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=5149

### operatorPass

- actor | executed=true | Playwright scenario operator-campaigns-and-flows failed with exit code 1.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=4516
- actor | executed=true | Playwright scenario operator-autopilot-run passed.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=2, durationMs=6123

### adminPass

- actor | executed=true | Playwright scenario admin-settings-kyc-banking failed with exit code 1.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-settings-kyc-banking, actorKind=admin, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=34499
- actor | executed=true | Playwright scenario admin-whatsapp-session-control passed.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-whatsapp-session-control, actorKind=admin, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=6711

### soakPass

- actor | executed=true | Playwright scenario operator-campaigns-and-flows failed with exit code 1.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=4516
- actor | executed=true | Playwright scenario operator-autopilot-run passed.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=2, durationMs=6123

### syntheticCoveragePass

- coverage | executed=true | Synthetic coverage maps 44/44 non-ops page(s) to declared scenarios.
- Artifacts: PULSE_SCENARIO_COVERAGE.json | Metrics: totalPages=44, userFacingPages=44, coveredPages=44, uncoveredPages=0

### evidenceFresh

- artifact | executed=true | Execution in progress: 79 passed, 0 failed, 0 timed out, 1 running.
- Artifacts: PULSE_EXECUTION_TRACE.json, PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 1021 | 2 dead handlers |
| API Calls | 622 | 0 no backend |
| Backend Routes | 621 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 3 | 3 critical, 0 warning |
| Proxy Routes | 52 | 1 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 33 issues |
| Quality | - | 396 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (446 total)

### CACHE_REDIS_STALE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:95 | Financial data cached in Redis without TTL — cache never expires, will always be stale |

### CACHE_STALE_AFTER_WRITE (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(public)/reset-password/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/verify-email/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/auth/auth-modal.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCampaignsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CLOCK_SKEW_TOO_STRICT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:28 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COST_LLM_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/openai-wrapper.ts:222 | LLM API call without per-workspace token budget check — runaway costs possible |

### COST_NO_TRACKING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/:0 | LLM API calls made without recording token usage per workspace — cannot bill or limit costs |
| HIGH | backend/src/:0 | No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit |

### COST_STORAGE_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | File uploads accepted without per-workspace storage quota check |

### DATA_ORDER_NO_PAYMENT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:132 | Financial write without existence check in wallet.service.ts |

### DEPLOY_NO_FEATURE_FLAGS (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | No feature flag system detected — risky features deployed to all users simultaneously |

### DOCKER_BUILD_FAILS (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 | No Dockerfile found for backend |
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 | No Dockerfile found for frontend |
| HIGH | /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 | docker-compose backend depends_on without healthcheck condition |
| HIGH | /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 | docker-compose worker depends_on without healthcheck condition |

### E2E_FLOW_NOT_TESTED (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | e2e:0 | No E2E test found for "Product creation" flow |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

### EDGE_CASE_ARRAY (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:165 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:170 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:175 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:13 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:16 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:36 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:93 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

### EDGE_CASE_DATE (274)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/analytics/analytics.controller.ts:10 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:11 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:108 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:124 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:290 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:396 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:40 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/api-keys/api-keys.service.ts:66 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:28 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:58 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1032 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1129 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:214 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:294 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:450 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:487 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:501 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:508 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:520 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:563 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:606 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1147 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1156 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1162 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1198 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1202 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1609 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1656 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1707 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1737 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1808 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2011 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2041 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:359 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:434 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:446 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:472 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:58 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:59 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:109 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:165 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:451 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:466 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:684 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:762 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:148 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:198 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:222 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:229 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:34 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:190 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:287 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/campaigns/campaigns.service.ts:94 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:113 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:210 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-public.controller.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:182 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:211 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:407 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:414 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:743 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:147 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:196 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/crm.service.ts:530 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/neuro-crm.service.ts:418 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:67 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:414 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:415 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:472 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:500 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:114 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:171 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:40 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:59 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:65 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-export.controller.ts:76 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:33 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:85 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/smart-time.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:34 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/i18n/i18n.service.ts:322 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/inbox/inbox.service.ts:138 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:54 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:99 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:339 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:436 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:538 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:638 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:72 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:534 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:535 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:50 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:85 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:164 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:289 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:296 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:307 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:322 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guards/kloel-security.guard.ts:219 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:83 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:258 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:259 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:633 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:676 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:713 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:789 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:846 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1606 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1709 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:186 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:209 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:418 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:482 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:83 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:229 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:158 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:473 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:1295 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:122 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:125 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:213 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:297 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:342 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:438 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:454 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1454 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1827 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1955 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2798 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2816 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3231 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3284 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3313 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3426 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3440 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3445 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3448 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3451 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3454 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3457 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3543 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3576 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3709 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4020 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4075 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4076 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4095 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4800 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:194 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:195 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:196 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:215 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:246 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:60 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:78 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.controller.ts:92 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.service.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:52 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:347 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:375 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:399 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/logging/structured-logger.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/marketing/marketing.controller.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:430 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:483 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:346 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:110 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:485 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:213 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:221 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:314 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:349 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:119 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:195 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:353 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:67 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:106 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:160 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:163 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:309 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:720 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:733 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhook-dispatcher.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:185 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:199 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:383 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:390 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:160 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:437 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:517 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:593 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:615 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:836 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:837 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:947 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:962 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1024 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1398 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1409 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1436 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1443 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/agent-events.service.ts:118 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:361 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:466 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:475 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:737 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2052 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2098 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2119 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2156 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2223 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:79 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:250 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:263 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:320 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:338 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:678 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:262 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:90 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:96 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:74 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:396 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:474 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:546 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:548 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:675 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1218 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1230 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1262 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1295 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1317 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1393 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1395 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:138 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:493 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:498 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:598 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:608 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:724 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:741 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:831 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:880 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:528 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:574 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:637 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1424 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1918 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2203 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (12)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:67 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:77 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:16 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:18 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:46 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:49 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:82 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:85 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/media/media.controller.ts:24 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/media/media.controller.ts:69 | File upload without MIME type validation — any file type accepted |

### EDGE_CASE_PAGINATION (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:212 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:214 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:881 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:56 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/scrapers/scrapers.controller.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:28 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/scrapers/scrapers.controller.ts:32 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |

### EMAIL_NO_AUTH (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |
| HIGH | backend/src/marketing/marketing.controller.ts:0 | Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM |

### EMPTY_CATCH (33)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/audit/audit.service.ts:90 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/autopilot/autopilot.service.ts:332 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/autopilot/autopilot.service.ts:1919 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:342 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:436 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:476 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.guard.ts:59 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.interceptor.ts:31 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/followup/followup.service.ts:75 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/inbox-events.service.ts:70 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/omnichannel.service.ts:130 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:539 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:1046 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:227 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:270 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:311 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/unified-agent.service.ts:3252 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/prisma/prisma.service.ts:38 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:152 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:162 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:189 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:151 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:166 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:188 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:218 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:311 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:339 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:385 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:397 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:523 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/webhooks.service.ts:348 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:148 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:178 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/asaas.service.ts:105 | Environment variable ASAAS_API_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:110 | Environment variable ASAAS_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:101 | Environment variable META_ACCESS_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:104 | Environment variable META_PHONE_NUMBER_ID is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:107 | Environment variable META_WABA_ID is referenced but not documented in .env.example |

### FACADE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:421 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:445 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:528 | [fake_save] setTimeout resets state without API call — fake save feedback |

### FINDMANY_NO_PAGINATION (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/inbox/inbox.service.ts:279 | findMany() on Message without pagination (take/cursor) — unbounded query |

### FLOATING_PROMISE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel.controller.ts:602 | .then() call without .catch() — unhandled promise rejection |

### HARDCODED_INTERNAL_URL (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/meta/meta-whatsapp.service.ts:509 | Hardcoded internal/infrastructure URL: http://localhost |

### IDEMPOTENCY_MISSING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/product.controller.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/sales.controller.ts:512 | POST endpoint creates resource without idempotency — safe retry not possible |

### LGPD_NON_COMPLIANT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | frontend/src/app/:0 | No privacy policy page found — LGPD requires accessible privacy notice |
| CRITICAL | frontend/src/app/:0 | No terms of service page found — required for user agreements and LGPD consent |

### LICENSE_UNKNOWN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | .license-allowlist.json:0 | No license allowlist found — create .license-allowlist.json to document approved exceptions |

### MONITORING_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |

### NEXTJS_NO_IMAGE_COMPONENT (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:155 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:242 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenter.tsx:688 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:351 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1272 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1338 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1346 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1781 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2104 | `<img>` used instead of Next.js `<Image>` — missing optimization |

### N_PLUS_ONE_QUERY (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:201 | Prisma query inside loop — potential N+1 query problem |

### ORPHANED_FILE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/dto/product-sub-resources.dto.ts:1 | File 'product-sub-resources.dto.ts' is not imported by any other backend file |

### PRISMA_ANY_ACCESS (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/asaas.service.ts:670 | Prisma accessed via untyped `prismaAny` or `(this.prisma as any)` — model not yet in generated schema |
| WARNING | backend/src/kloel/asaas.service.ts:679 | Prisma accessed via untyped `prismaAny` or `(this.prisma as any)` — model not yet in generated schema |

### PROXY_NO_UPSTREAM (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/api/auth/logout/route.ts:1 | Proxy POST /api/auth/logout -> /auth/logout has no backend route |

### RESPONSE_INCONSISTENT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/product.controller.ts:335 | Controller mixes wrapped ({ data: … }) and raw return styles |
| INFO | backend/src/member-area/member-area.controller.ts:412 | Controller mixes wrapped ({ data: … }) and raw return styles |

### ROUTE_NO_CALLER (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/gdpr/data-delete.controller.ts:21 | POST /gdpr/delete is not called by any frontend code |
| INFO | backend/src/gdpr/data-export.controller.ts:17 | POST /gdpr/export is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:611 | POST /kloel/threads/:id/messages is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:62 | POST /kloel/upload is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:45 | GET /meta/instagram/profile is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:73 | GET /meta/instagram/insights/account is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:441 | POST /whatsapp-api/session/pause-agent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:448 | POST /whatsapp-api/session/reconcile is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:455 | GET /whatsapp-api/session/proofs is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:464 | POST /whatsapp-api/session/stream-token is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:482 | POST /whatsapp-api/session/action-turn is not called by any frontend code |

### SLOW_QUERY (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/crm/crm.service.ts:462 | findMany without select or include — returns all columns from DB |

### STRINGIFY_CIRCULAR_RISK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/financial-alert.service.ts:83 | JSON.stringify() on request/socket object — circular reference risk |

### TEST_NO_ASSERTION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:87 | Hardcoded sleep of 10000ms in test — use jest.useFakeTimers() or await event instead |

### TIMEOUT_NO_CLEANUP (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:95 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:47 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/dashboard/KloelDashboard.tsx:479 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |

### TIMEZONE_REPORT_MISMATCH (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/smart-time/smart-time.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-public.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |

### TRANSACTION_NO_ISOLATION (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:37 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:51 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:104 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:174 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/payment.service.ts:128 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/smart-payment.service.ts:402 | $transaction in financial file without isolationLevel specified |

### UI_DEAD_HANDLER (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:630 | form "form" has dead handler |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:583 | clickable "(sem texto)" has dead handler |

### UNBOUNDED_RESULT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/crm/crm.service.ts:462 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:385 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/partnerships/partnerships.service.ts:20 | findMany without take — may return all rows and cause OOM or slow response |

### UNHANDLED_PROMISE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/kloel.controller.ts:602 | .then() without .catch() — unhandled promise rejection |

### UNRESOLVED_TODO (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/ai-brain/agent-assist.service.ts:34 | TODO comment left unresolved |
| INFO | backend/src/i18n/i18n.service.ts:5 | TODO comment left unresolved |
| INFO | backend/src/kloel/audio.service.ts:68 | TODO comment left unresolved |
| INFO | backend/src/kloel/guest-chat.service.ts:9 | TODO comment left unresolved |
| INFO | backend/src/kloel/unified-agent.service.ts:1302 | TODO comment left unresolved |

### UNSAFE_ANY_CAST (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout.controller.ts:200 | `as any` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/payment.service.ts:130 | `as any` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/payment.service.ts:140 | `as any` cast in financial/auth code — type safety bypassed |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No privacy policy page found — LGPD requires accessible privacy notice
   Evidence: Expected one of: /app/privacy/page.tsx, /app/politica-de-privacidade/page.tsx, /app/privacy-policy/page.tsx
2. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No terms of service page found — required for user agreements and LGPD consent
   Evidence: Expected one of: /app/terms/page.tsx, /app/termos/page.tsx, /app/terms-of-service/page.tsx, /app/termos-de-uso/page.tsx
3. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:421 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
4. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:445 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000)
5. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:528 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(()=>setProductSaved(false),2000);
6. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/reset-password/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
7. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/verify-email/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
8. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/auth/auth-modal.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
9. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCampaignsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
10. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:95 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
11. [EMAIL_NO_AUTH] backend/src/campaigns/campaigns.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
12. [EMAIL_NO_AUTH] backend/src/kloel/email-campaign.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
13. [EMAIL_NO_AUTH] backend/src/marketing/marketing.controller.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
14. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:222 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: return payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
15. [COST_NO_TRACKING] backend/src/:0 — LLM API calls made without recording token usage per workspace — cannot bill or limit costs
   Evidence: After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp
16. [COST_NO_TRACKING] backend/src/:0 — No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit
   Evidence: Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner
17. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:132 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'requestWithdrawal' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
18. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
19. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
20. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 — docker-compose backend depends_on without healthcheck condition
   Evidence: docker-compose.yml: "backend" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
21. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 — docker-compose worker depends_on without healthcheck condition
   Evidence: docker-compose.yml: "worker" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
22. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
23. [E2E_FLOW_NOT_TESTED] e2e:0 — No E2E test found for "Product creation" flow
   Evidence: Add a Playwright/Cypress test that exercises the full Product creation user journey
24. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
25. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
26. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
27. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:67 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
28. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:77 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
29. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:16 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
30. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:212 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
31. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:214 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
32. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:881 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
33. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
34. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
35. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:46 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
36. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:49 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
37. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:82 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
38. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:85 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
39. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
40. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:69 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
41. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:56 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
42. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
43. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
44. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
45. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
46. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
47. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:512 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
48. [FLOATING_PROMISE] backend/src/kloel/kloel.controller.ts:602 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((messages) => — add .catch(err => this.logger.error(err)) or use async/await with try/catch
49. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
50. [TIMEZONE_REPORT_MISMATCH] backend/src/analytics/smart-time/smart-time.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
51. [TIMEZONE_REPORT_MISMATCH] backend/src/billing/payment-method.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
52. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
53. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-public.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
54. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
55. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/smart-payment.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
56. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
57. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
58. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
59. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
60. [TRANSACTION_NO_ISOLATION] backend/src/billing/payment-method.service.ts:37 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
61. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:51 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
62. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:104 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
63. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:174 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
64. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:279 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
65. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:128 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
66. [TRANSACTION_NO_ISOLATION] backend/src/kloel/smart-payment.service.ts:402 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
67. [UNSAFE_ANY_CAST] backend/src/checkout/checkout.controller.ts:200 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: return this.checkoutService.updateConfig(planId, dto as any);
68. [UNSAFE_ANY_CAST] backend/src/kloel/payment.service.ts:130 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const sale = await (tx as any).kloelSale.findFirst({
69. [UNSAFE_ANY_CAST] backend/src/kloel/payment.service.ts:140 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await (tx as any).kloelSale.update({
```