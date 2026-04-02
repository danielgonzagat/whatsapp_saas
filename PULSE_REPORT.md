# PULSE REPORT — 2026-04-02T00:51:17.103Z

## Certification Status: PARTIAL

- Score: 52/100 (raw scan: 63/100)
- Environment: total
- Commit: 82ac073b99acf098f558454d8575e985278ca73d
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Codebase Truth

- Frontend pages discovered: 95
- User-facing pages: 93
- Raw modules discovered: 32
- Raw mutation flow candidates: 139

## Resolved Manifest

- Resolved modules: 32/32
- Resolved flow groups: 44/44
- Grouped semantic flow groups: 36
- Shared capability groups: 15
- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0

## Health Score: 52/100
`██████████░░░░░░░░░░` 52%

## Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 32 module(s), 44 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 395 critical/high blocking finding(s). |
| runtimePass | FAIL | missing_evidence | Runtime probe evidence is missing for: db-connectivity. |
| browserPass | FAIL | product_failure | Browser-required critical scenarios are failing: customer-auth-shell, customer-product-and-checkout, admin-settings-kyc-banking. |
| flowPass | PASS | — | Flow evidence summary: 5 passed, 0 failed, 0 accepted, 0 missing evidence. |
| invariantPass | PASS | — | Invariant evidence summary: 1 passed, 0 failed, 0 accepted, 0 missing evidence. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: LGPD_NON_COMPLIANT. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: DEPLOY_NO_ROLLBACK, MIGRATION_NO_ROLLBACK. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_FINANCIAL_NO_TRAIL. |
| customerPass | FAIL | product_failure | customer synthetic scenarios are failing: customer-auth-shell, customer-product-and-checkout. |
| operatorPass | FAIL | product_failure | operator synthetic scenarios are failing: operator-campaigns-and-flows. |
| adminPass | FAIL | product_failure | admin synthetic scenarios are failing: admin-settings-kyc-banking. |
| soakPass | FAIL | product_failure | soak synthetic scenarios are failing: operator-campaigns-and-flows. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 44/44 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | Execution trace and attached evidence are internally coherent for this run. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: core-critical
- Blocking tier: 0

| Tier | Name | Status | Blocking Gates | Reason |
|------|------|--------|----------------|--------|
| 0 | Truth + Runtime Baseline | FAIL | runtimePass | blocking gates: runtimePass |
| 1 | Customer Truth | FAIL | browserPass, customerPass | blocking gates: browserPass, customerPass |
| 2 | Operator + Admin Replacement | FAIL | operatorPass, adminPass | blocking gates: operatorPass, adminPass |
| 3 | Production Reliability | FAIL | securityPass, recoveryPass, observabilityPass | blocking gates: securityPass, recoveryPass, observabilityPass |
| 4 | Final Human Replacement | FAIL | soakPass | blocking gates: soakPass; critical async expectations still pending in world state |

## Evidence Summary

- Runtime: Runtime evidence is incomplete: db-connectivity missing evidence.
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
- Truth: Resolved manifest is aligned: 32 module(s), 44 flow group(s), no blocking drift.

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

- truth | executed=true | Resolved manifest built from 95 page(s), 32 module(s), 44 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 395 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=395, totalBreaks=776

### runtimePass

- runtime | executed=true | Runtime evidence is incomplete: db-connectivity missing evidence.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: executedChecks=3, blockingBreakTypes=0
- runtime | executed=true | Backend health probe passed on /health/system (200).
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=backend-health, required=true, status=200, latencyMs=1053, traceHeaderDetected=true
- runtime | executed=true | Auth probe obtained a token and reached /workspace/me successfully.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=auth-session, required=true, status=passed, latencyMs=744, authStatus=200, workspaceIdDetected=true
- runtime | executed=true | Frontend responded with HTTP 200.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=frontend-reachability, required=true, status=200, latencyMs=117
- runtime | executed=false | Database probe failed: pg package not installed. Run: npm install pg
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=db-connectivity, required=true, status=missing_evidence, latencyMs=1

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
- flow | executed=true | wallet-withdrawal replay passed with transaction 612506ad-dd13-44ba-bb61-570d474f1694 and ledger delta -1. Real withdrawal smoke remains opt-in.
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
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-auth-shell, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=1, durationMs=5674
- actor | executed=true | Playwright scenario customer-product-and-checkout failed with exit code 1.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-product-and-checkout, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=17514
- actor | executed=true | Playwright scenario customer-whatsapp-and-inbox passed.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-whatsapp-and-inbox, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=3140

### operatorPass

- actor | executed=true | Playwright scenario operator-campaigns-and-flows failed with exit code 1.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=4078
- actor | executed=true | Playwright scenario operator-autopilot-run passed.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=2, durationMs=2509

### adminPass

- actor | executed=true | Playwright scenario admin-settings-kyc-banking failed with exit code 1.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-settings-kyc-banking, actorKind=admin, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=17021
- actor | executed=true | Playwright scenario admin-whatsapp-session-control passed.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-whatsapp-session-control, actorKind=admin, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=2615

### soakPass

- actor | executed=true | Playwright scenario operator-campaigns-and-flows failed with exit code 1.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=failed, specsExecuted=2, durationMs=4078
- actor | executed=true | Playwright scenario operator-autopilot-run passed.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=2, durationMs=2509

### syntheticCoveragePass

- coverage | executed=true | Synthetic coverage maps 44/44 non-ops page(s) to declared scenarios.
- Artifacts: PULSE_SCENARIO_COVERAGE.json | Metrics: totalPages=44, userFacingPages=44, coveredPages=44, uncoveredPages=0

### evidenceFresh

- artifact | executed=true | Execution in progress: 79 passed, 0 failed, 0 timed out, 1 running.
- Artifacts: PULSE_EXECUTION_TRACE.json, PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 992 | 2 dead handlers |
| API Calls | 612 | 0 no backend |
| Backend Routes | 621 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 3 | 3 critical, 0 warning |
| Proxy Routes | 49 | 1 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 33 issues |
| Quality | - | 726 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (776 total)

### AUDIT_FINANCIAL_NO_TRAIL (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/audit/audit.interceptor.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |
| CRITICAL | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |

### CACHE_REDIS_STALE (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/advanced-analytics.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/autopilot/autopilot.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:94 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/inbox/smart-routing.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/guest-chat.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/meta/meta-whatsapp.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/whatsapp/agent-events.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |

### CACHE_STALE_AFTER_WRITE (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/api/auth/anonymous/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/check-email/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/google/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/login/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/refresh/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/register/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/verify/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CICD_INCOMPLETE (27)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 | CI workflow missing lint gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 | CI workflow missing build gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 | CI workflow missing test gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 | CI workflow does not run Prisma migrations |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow missing lint gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow missing build gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow missing test gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow does not run on both push and pull_request |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow does not run Prisma migrations |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 | CI workflow does not cache dependencies |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 | CI workflow missing lint gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 | CI workflow missing build gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 | CI workflow missing test gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 | CI workflow does not run on both push and pull_request |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 | CI workflow does not run Prisma migrations |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow missing lint gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow missing build gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow missing test gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow does not run on both push and pull_request |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow does not run Prisma migrations |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 | CI workflow does not cache dependencies |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 | CI workflow missing lint gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 | CI workflow missing build gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 | CI workflow missing test gate |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 | CI workflow does not run on both push and pull_request |
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 | CI workflow does not run Prisma migrations |
| HIGH | /Users/danielpenin/whatsapp_saas:0 | No deployment configuration found |

### CLOCK_SKEW_TOO_STRICT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:28 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COST_LLM_NO_LIMIT (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/openai-wrapper.ts:204 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:205 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:221 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/mass-send/mass-send.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |

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

### DEPLOY_NO_ROLLBACK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | .github/workflows/:0 | No deployment rollback mechanism configured — bad deploy cannot be reverted quickly |

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

### EDGE_CASE_ARRAY (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:18 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-order.dto.ts:25 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-product.dto.ts:7 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:120 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:130 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:162 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:167 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:172 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:11 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:14 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/log-execution.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:9 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:84 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:22 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

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
| WARNING | backend/src/autopilot/autopilot.service.ts:289 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:445 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:482 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:496 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:503 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:515 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:558 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:601 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1137 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1157 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1197 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1604 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1651 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1702 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1732 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1803 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2006 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2036 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/kloel/asaas.service.ts:338 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:435 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:637 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:72 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:532 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:533 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:50 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:85 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:164 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:289 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:296 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:307 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:322 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guards/kloel-security.guard.ts:219 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:82 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:257 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:258 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:633 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:676 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:713 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:789 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:846 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1606 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1709 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:185 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:208 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:417 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:481 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:536 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:81 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/kloel/unified-agent.service.ts:1825 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1952 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2795 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2813 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3228 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3281 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3310 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3423 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3437 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3442 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3445 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3448 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3451 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3454 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3540 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3573 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3706 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4017 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4072 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4073 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4092 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4797 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:194 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:195 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:214 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/meta/meta-whatsapp.service.ts:109 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:484 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:212 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:220 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:313 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:348 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/whatsapp/agent-events.service.ts:115 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:243 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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

### EDGE_CASE_FILE (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:100 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:103 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:23 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:59 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:69 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:16 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:44 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:79 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:81 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:142 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kyc/kyc.controller.ts:18 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:46 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:49 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:82 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:85 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/media/media.controller.ts:24 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/media/media.controller.ts:69 | File upload without MIME type validation — any file type accepted |

### EDGE_CASE_NUMBER (52)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:8 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:9 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:12 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:13 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:14 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:15 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:19 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:20 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:21 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:22 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:24 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:27 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:7 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:8 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:10 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:12 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:8 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:11 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:9 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:10 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:13 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:20 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:21 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:35 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:36 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:37 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:41 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:52 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:53 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:54 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:57 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:59 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:103 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:111 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:117 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:127 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:149 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:10 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:11 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:19 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:49 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:50 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:51 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:93 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:102 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:103 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:108 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:109 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:6 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |

### EDGE_CASE_PAGINATION (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/audit/audit.controller.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/autopilot/segmentation.controller.ts:38 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:340 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:341 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/flows/flows.controller.ts:241 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/leads.controller.ts:18 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/memory.controller.ts:86 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:212 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:214 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:881 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/wallet.controller.ts:110 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/meta/instagram/instagram.controller.ts:67 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:39 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:55 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (209)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/auth/dto/register.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:31 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:23 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:28 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:29 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:31 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:32 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:33 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:34 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:35 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:16 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-product.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-upsell.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:25 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:26 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:31 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:32 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:33 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:34 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:38 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:39 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:40 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:46 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:47 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:48 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:49 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:50 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:51 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:55 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:56 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:58 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:64 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:65 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:66 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:67 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:77 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:78 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:79 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:80 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:81 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:82 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:83 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:84 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:85 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:86 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:87 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:88 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:89 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:90 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:91 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:92 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:93 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:94 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:97 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:104 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:105 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:106 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:107 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:108 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:110 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:112 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:113 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:114 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:116 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:125 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:126 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:134 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:137 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:138 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:139 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:141 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:142 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:143 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:144 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:145 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:146 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:148 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:150 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:151 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:153 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:154 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:156 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:158 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:159 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/update-config.dto.ts:160 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/create-contact.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/crm/dto/upsert-contact.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/flow.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/log-execution.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/run-flow.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/flows/dto/save-flow-version.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:16 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:28 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:29 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:37 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:38 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:48 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:52 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:56 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:64 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:65 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:66 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:67 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:71 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:72 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:73 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:74 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:82 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:83 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:92 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:94 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:104 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:110 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/update-webinar.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/update-bank.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/launch/dto/create-launcher.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/media/dto/generate-video.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:3 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:9 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
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
| WARNING | backend/src/autopilot/autopilot.service.ts:327 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/autopilot/autopilot.service.ts:1914 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:342 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:436 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:476 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.guard.ts:59 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.interceptor.ts:31 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/followup/followup.service.ts:75 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/inbox-events.service.ts:70 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/omnichannel.service.ts:130 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:537 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:1046 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:227 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:270 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:311 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/unified-agent.service.ts:3249 | catch block only logs without throw/return — error effectively swallowed |
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
| WARNING | backend/src/whatsapp/agent-events.service.ts:145 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:175 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/asaas.service.ts:104 | Environment variable ASAAS_API_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:109 | Environment variable ASAAS_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:100 | Environment variable META_ACCESS_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:103 | Environment variable META_PHONE_NUMBER_ID is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:106 | Environment variable META_WABA_ID is referenced but not documented in .env.example |

### FACADE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:420 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:444 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:527 | [fake_save] setTimeout resets state without API call — fake save feedback |

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
| WARNING | backend/src/meta/meta-whatsapp.service.ts:508 | Hardcoded internal/infrastructure URL: http://localhost |

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

### MIGRATION_NO_ROLLBACK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | .github/workflows/:0 | CI runs Prisma migrations without taking a DB backup first |

### MONITORING_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |

### NEXTJS_NO_IMAGE_COMPONENT (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:155 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:242 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenter.tsx:687 | `<img>` used instead of Next.js `<Image>` — missing optimization |
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
| WARNING | backend/src/kloel/asaas.service.ts:669 | Prisma accessed via untyped `prismaAny` or `(this.prisma as any)` — model not yet in generated schema |
| WARNING | backend/src/kloel/asaas.service.ts:678 | Prisma accessed via untyped `prismaAny` or `(this.prisma as any)` — model not yet in generated schema |

### PROXY_NO_UPSTREAM (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/api/auth/logout/route.ts:1 | Proxy POST /api/auth/logout -> /auth/logout has no backend route |

### RACE_CONDITION_DATA_CORRUPTION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/kloel/conversational-onboarding.service.ts:457 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:1719 | Read-modify-write without transaction or optimistic lock — race condition possible |

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
| INFO | backend/src/meta/instagram/instagram.controller.ts:72 | GET /meta/instagram/insights/account is not called by any frontend code |
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

### TIMEOUT_NO_CLEANUP (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
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
| HIGH | backend/src/billing/payment-method.service.ts:36 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:51 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:104 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:174 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/payment.service.ts:128 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/smart-payment.service.ts:402 | $transaction in financial file without isolationLevel specified |

### UI_DEAD_HANDLER (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:677 | form "form" has dead handler |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:476 | clickable "(sem texto)" has dead handler |

### UNBOUNDED_RESULT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/crm/crm.service.ts:462 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:385 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/partnerships/partnerships.service.ts:19 | findMany without take — may return all rows and cause OOM or slow response |

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

1. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/audit/audit.interceptor.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
2. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
3. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No privacy policy page found — LGPD requires accessible privacy notice
   Evidence: Expected one of: /app/privacy/page.tsx, /app/politica-de-privacidade/page.tsx, /app/privacy-policy/page.tsx
4. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No terms of service page found — required for user agreements and LGPD consent
   Evidence: Expected one of: /app/terms/page.tsx, /app/termos/page.tsx, /app/terms-of-service/page.tsx, /app/termos-de-uso/page.tsx
5. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/conversational-onboarding.service.ts:457 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 457 followed by update at line 498 without $transaction or version check
6. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:1719 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1719 followed by update at line 1820 without $transaction or version check
7. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:420 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
8. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:444 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000)
9. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:527 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(()=>setProductSaved(false),2000);
10. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/anonymous/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
11. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/check-email/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
12. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/google/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
13. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/login/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
14. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/refresh/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
15. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/register/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
16. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
17. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
18. [CACHE_REDIS_STALE] backend/src/analytics/advanced-analytics.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
19. [CACHE_REDIS_STALE] backend/src/autopilot/autopilot.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
20. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
21. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:94 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
22. [CACHE_REDIS_STALE] backend/src/inbox/smart-routing.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
23. [CACHE_REDIS_STALE] backend/src/kloel/asaas.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
24. [CACHE_REDIS_STALE] backend/src/kloel/guest-chat.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
25. [CACHE_REDIS_STALE] backend/src/kloel/memory-management.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
26. [CACHE_REDIS_STALE] backend/src/meta/meta-whatsapp.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
27. [CACHE_REDIS_STALE] backend/src/partnerships/partnerships.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
28. [CACHE_REDIS_STALE] backend/src/whatsapp/agent-events.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
29. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/codeql.yml: No lint step found (npm run lint). Code quality not enforced in CI.
30. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 — CI workflow missing build gate
   Evidence: .github/workflows/codeql.yml: No build step found (npm run build). Build failures not caught before deploy.
31. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 — CI workflow missing test gate
   Evidence: .github/workflows/codeql.yml: No test step found (npm test). Tests not run before deployment.
32. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/codeql.yml:0 — CI workflow does not run Prisma migrations
   Evidence: .github/workflows/codeql.yml: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.
33. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/dependabot-auto-merge.yml: No lint step found (npm run lint). Code quality not enforced in CI.
34. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow missing build gate
   Evidence: .github/workflows/dependabot-auto-merge.yml: No build step found (npm run build). Build failures not caught before deploy.
35. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow missing test gate
   Evidence: .github/workflows/dependabot-auto-merge.yml: No test step found (npm test). Tests not run before deployment.
36. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow does not run on both push and pull_request
   Evidence: .github/workflows/dependabot-auto-merge.yml: push=false, pull_request=true. PRs or pushes not fully covered.
37. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow does not run Prisma migrations
   Evidence: .github/workflows/dependabot-auto-merge.yml: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.
38. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/dependabot-auto-merge.yml:0 — CI workflow does not cache dependencies
   Evidence: .github/workflows/dependabot-auto-merge.yml: No dependency caching found. CI will reinstall node_modules on every run (slow).
39. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/deploy-production.yml: No lint step found (npm run lint). Code quality not enforced in CI.
40. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 — CI workflow missing build gate
   Evidence: .github/workflows/deploy-production.yml: No build step found (npm run build). Build failures not caught before deploy.
41. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 — CI workflow missing test gate
   Evidence: .github/workflows/deploy-production.yml: No test step found (npm test). Tests not run before deployment.
42. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 — CI workflow does not run on both push and pull_request
   Evidence: .github/workflows/deploy-production.yml: push=false, pull_request=false. PRs or pushes not fully covered.
43. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-production.yml:0 — CI workflow does not run Prisma migrations
   Evidence: .github/workflows/deploy-production.yml: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.
44. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/deploy-staging.yml: No lint step found (npm run lint). Code quality not enforced in CI.
45. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow missing build gate
   Evidence: .github/workflows/deploy-staging.yml: No build step found (npm run build). Build failures not caught before deploy.
46. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow missing test gate
   Evidence: .github/workflows/deploy-staging.yml: No test step found (npm test). Tests not run before deployment.
47. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow does not run on both push and pull_request
   Evidence: .github/workflows/deploy-staging.yml: push=false, pull_request=false. PRs or pushes not fully covered.
48. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow does not run Prisma migrations
   Evidence: .github/workflows/deploy-staging.yml: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.
49. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/deploy-staging.yml:0 — CI workflow does not cache dependencies
   Evidence: .github/workflows/deploy-staging.yml: No dependency caching found. CI will reinstall node_modules on every run (slow).
50. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/nightly-ops-audit.yml: No lint step found (npm run lint). Code quality not enforced in CI.
51. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 — CI workflow missing build gate
   Evidence: .github/workflows/nightly-ops-audit.yml: No build step found (npm run build). Build failures not caught before deploy.
52. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 — CI workflow missing test gate
   Evidence: .github/workflows/nightly-ops-audit.yml: No test step found (npm test). Tests not run before deployment.
53. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 — CI workflow does not run on both push and pull_request
   Evidence: .github/workflows/nightly-ops-audit.yml: push=false, pull_request=false. PRs or pushes not fully covered.
54. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/nightly-ops-audit.yml:0 — CI workflow does not run Prisma migrations
   Evidence: .github/workflows/nightly-ops-audit.yml: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.
55. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas:0 — No deployment configuration found
   Evidence: Neither railway.toml/railway.json nor vercel.json/.vercel found. Deployment target is not declared.
56. [EMAIL_NO_AUTH] backend/src/campaigns/campaigns.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
57. [EMAIL_NO_AUTH] backend/src/kloel/email-campaign.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
58. [EMAIL_NO_AUTH] backend/src/marketing/marketing.controller.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
59. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:204 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
60. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:205 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
61. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:221 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: return payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
62. [COST_NO_TRACKING] backend/src/:0 — LLM API calls made without recording token usage per workspace — cannot bill or limit costs
   Evidence: After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp
63. [COST_NO_TRACKING] backend/src/:0 — No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit
   Evidence: Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner
64. [COST_LLM_NO_LIMIT] backend/src/mass-send/mass-send.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
65. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:132 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'requestWithdrawal' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
66. [DEPLOY_NO_ROLLBACK] .github/workflows/:0 — No deployment rollback mechanism configured — bad deploy cannot be reverted quickly
   Evidence: Configure Railway instant rollback or Docker image versioning with a CI step to revert to previous image tag
67. [MIGRATION_NO_ROLLBACK] .github/workflows/:0 — CI runs Prisma migrations without taking a DB backup first
   Evidence: Add a pg_dump step before prisma migrate deploy in CI/CD to enable point-in-time restore if migration fails
68. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
69. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
70. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 — docker-compose backend depends_on without healthcheck condition
   Evidence: docker-compose.yml: "backend" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
71. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 — docker-compose worker depends_on without healthcheck condition
   Evidence: docker-compose.yml: "worker" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
72. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
73. [E2E_FLOW_NOT_TESTED] e2e:0 — No E2E test found for "Product creation" flow
   Evidence: Add a Playwright/Cypress test that exercises the full Product creation user journey
74. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
75. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
76. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:100 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
77. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:103 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
78. [EDGE_CASE_PAGINATION] backend/src/audit/audit.controller.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit) : 50, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
79. [EDGE_CASE_STRING] backend/src/auth/dto/register.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
80. [EDGE_CASE_PAGINATION] backend/src/autopilot/segmentation.controller.ts:38 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: if (limit) overrides.limit = parseInt(limit, 10); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
81. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
82. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
83. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
84. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
85. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
86. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:31 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
87. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:340 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: page: page ? parseInt(page, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
88. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:341 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit: limit ? parseInt(limit, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
89. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
90. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
91. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
92. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
93. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
94. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
95. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
96. [EDGE_CASE_STRING] backend/src/checkout/dto/create-coupon.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
97. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:12 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
98. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
99. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:14 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
100. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:15 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
101. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
102. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
103. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
104. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
105. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
106. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
107. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
108. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
109. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:19 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
110. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:20 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
111. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:21 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
112. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:22 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
113. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:23 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
114. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:24 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
115. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:27 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
116. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
117. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:29 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
118. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
119. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:31 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
120. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
121. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:33 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
122. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
123. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:35 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
124. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
125. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:16 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
126. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
127. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
128. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:7 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
129. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
130. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:10 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
131. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:12 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
132. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
133. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
134. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
135. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
136. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
137. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
138. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:11 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
139. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
140. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
141. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
142. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
143. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
144. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
145. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
146. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:10 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
147. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
148. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
149. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
150. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
151. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
152. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:20 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
153. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:21 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
154. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:25 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
155. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:26 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
156. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
157. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:31 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
158. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
159. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:33 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
160. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
161. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:35 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
162. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:36 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
163. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:37 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
164. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
165. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:39 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
166. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:40 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
167. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:41 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
168. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:46 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
169. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:47 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
170. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:48 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
171. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:49 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
172. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:50 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
173. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:51 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
174. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:52 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
175. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:53 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
176. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:54 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
177. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:55 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
178. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:56 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
179. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:57 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
180. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:58 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
181. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:59 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
182. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:64 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
183. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:65 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
184. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:66 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
185. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:67 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
186. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:77 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
187. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:78 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
188. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:79 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
189. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:80 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
190. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:81 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
191. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:82 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
192. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:83 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
193. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:84 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
194. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:85 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
195. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:86 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
196. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:87 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
197. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:88 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
198. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:89 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
199. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:90 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
200. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:91 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
201. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:92 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
202. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:93 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
203. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:94 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
204. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:97 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
205. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:103 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
206. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:104 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
207. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:105 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
208. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:106 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
209. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:107 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
210. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:108 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
211. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:110 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
212. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:111 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
213. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:112 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
214. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:113 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
215. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:114 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
216. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:116 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
217. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:117 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
218. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:125 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
219. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:126 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
220. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:127 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
221. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:134 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
222. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:137 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
223. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:138 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
224. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:139 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
225. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:141 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
226. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:142 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
227. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:143 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
228. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:144 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
229. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:145 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
230. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:146 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
231. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:148 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
232. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:149 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
233. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:150 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
234. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:151 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
235. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:153 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
236. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:154 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
237. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:156 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
238. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:158 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
239. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:159 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
240. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:160 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
241. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
242. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
243. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
244. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
245. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
246. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
247. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
248. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
249. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
250. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
251. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
252. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
253. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
254. [EDGE_CASE_STRING] backend/src/flows/dto/log-execution.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
255. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
256. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
257. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
258. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
259. [EDGE_CASE_STRING] backend/src/flows/dto/save-flow-version.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
260. [EDGE_CASE_PAGINATION] backend/src/flows/flows.controller.ts:241 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: return this.flows.listExecutions(effectiveWorkspaceId, limit ? parseInt(limit) : 50); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
261. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:23 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
262. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
263. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
264. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:59 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
265. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:69 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
266. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
267. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
268. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:10 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
269. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:11 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
270. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:16 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
271. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
272. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
273. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:19 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
274. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
275. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:29 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
276. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
277. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
278. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:37 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
279. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
280. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:48 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
281. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:49 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
282. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:50 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
283. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:51 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
284. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:52 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
285. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:56 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
286. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:64 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
287. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:65 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
288. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:66 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
289. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:67 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
290. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:71 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
291. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:72 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
292. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:73 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
293. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:74 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
294. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:82 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
295. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:83 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
296. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:92 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
297. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:93 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
298. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:94 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
299. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:102 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
300. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:103 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
301. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:104 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
302. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:108 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
303. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:109 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
304. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:110 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
305. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
306. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
307. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
308. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
309. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
310. [EDGE_CASE_PAGINATION] backend/src/kloel/leads.controller.ts:18 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const parsedLimit = limit ? Number(limit) : undefined; — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
311. [EDGE_CASE_PAGINATION] backend/src/kloel/memory.controller.ts:86 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: return this.memoryService.listMemories(workspaceId, category, parseInt(page || '1')); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
312. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:16 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
313. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:44 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
314. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:212 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
315. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:214 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
316. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:881 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
317. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:79 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
318. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:81 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
319. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:142 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
320. [EDGE_CASE_PAGINATION] backend/src/kloel/wallet.controller.ts:110 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: return this.walletService.getTransactionHistory(workspaceId, parseInt(page || '1'), 20, type); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
321. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
322. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
323. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
324. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
325. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
326. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
327. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
328. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
329. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
330. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
331. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
332. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:46 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
333. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:49 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
334. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:82 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
335. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:85 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
336. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
337. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
338. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
339. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
340. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
341. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
342. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
343. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
344. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
345. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:69 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
346. [EDGE_CASE_PAGINATION] backend/src/meta/instagram/instagram.controller.ts:67 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit, 10) : 25, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
347. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:39 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
348. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:55 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
349. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
350. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
351. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
352. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
353. [EDGE_CASE_NUMBER] backend/src/partnerships/dto/create-affiliate.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
354. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
355. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
356. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
357. [EDGE_CASE_NUMBER] backend/src/pipeline/dto/create-deal.dto.ts:6 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
358. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
359. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
360. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
361. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
362. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
363. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
364. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
365. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
366. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
367. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
368. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
369. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
370. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
371. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
372. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
373. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:512 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
374. [FLOATING_PROMISE] backend/src/kloel/kloel.controller.ts:602 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((messages) => — add .catch(err => this.logger.error(err)) or use async/await with try/catch
375. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
376. [TIMEZONE_REPORT_MISMATCH] backend/src/analytics/smart-time/smart-time.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
377. [TIMEZONE_REPORT_MISMATCH] backend/src/billing/payment-method.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
378. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
379. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-public.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
380. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
381. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/smart-payment.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
382. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
383. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
384. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
385. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
386. [TRANSACTION_NO_ISOLATION] backend/src/billing/payment-method.service.ts:36 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
387. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:51 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
388. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:104 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
389. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:174 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
390. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:279 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
391. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:128 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
392. [TRANSACTION_NO_ISOLATION] backend/src/kloel/smart-payment.service.ts:402 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
393. [UNSAFE_ANY_CAST] backend/src/checkout/checkout.controller.ts:200 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: return this.checkoutService.updateConfig(planId, dto as any);
394. [UNSAFE_ANY_CAST] backend/src/kloel/payment.service.ts:130 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const sale = await (tx as any).kloelSale.findFirst({
395. [UNSAFE_ANY_CAST] backend/src/kloel/payment.service.ts:140 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await (tx as any).kloelSale.update({
```