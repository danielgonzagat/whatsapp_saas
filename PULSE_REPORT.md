# PULSE REPORT — 2026-04-21T00:36:36.475Z

## Certification Status: CERTIFIED

- Score: 63/100 (raw scan: 63/100)
- Environment: total
- Commit: 8bc41c09a579317962c7c4c83182a2914d7d7ed2
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Codebase Truth

- Frontend pages discovered: 104
- User-facing pages: 102
- Raw modules discovered: 33
- Raw mutation flow candidates: 145

## Resolved Manifest

- Resolved modules: 33/33
- Resolved flow groups: 55/55
- Grouped semantic flow groups: 45
- Shared capability groups: 17
- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0

## Health Score: 63/100
`█████████████░░░░░░░` 63%

## Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 33 module(s), 55 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 309 critical/high blocking finding(s). |
| runtimePass | PASS | — | Runtime probes executed successfully. |
| browserPass | PASS | — | Synthetic Playwright scenarios executed successfully: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox. |
| flowPass | PASS | — | Flow evidence summary: 5 passed, 0 failed, 0 accepted, 0 missing evidence. |
| invariantPass | FAIL | product_failure | Invariant checks are failing: financial-audit-trail, payment-idempotency, wallet-balance-consistency. |
| securityPass | PASS | — | No blocking security findings are open in this run. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, MIGRATION_NO_ROLLBACK. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_ADMIN_NO_LOG, AUDIT_DELETION_NO_LOG, AUDIT_FINANCIAL_NO_TRAIL, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING. |
| customerPass | PASS | — | customer scenarios: 4 passed, 0 failed/checker-gap, 0 missing evidence. |
| operatorPass | PASS | — | operator scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence. |
| adminPass | PASS | — | admin scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence. |
| soakPass | PASS | — | soak scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 102/102 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | Execution trace and attached evidence are internally coherent for this run. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: TIER 1
- Blocking tier: 3

| Tier | Name | Status | Blocking Gates | Reason |
|------|------|--------|----------------|--------|
| 0 | Truth + Runtime Baseline | PASS | — | Truth + Runtime Baseline passed all hard gate requirements. |
| 1 | Customer Truth | PASS | — | Customer Truth passed all hard gate requirements. |
| 2 | Operator + Admin Replacement | PASS | — | Operator + Admin Replacement passed all hard gate requirements. |
| 3 | Production Reliability | FAIL | invariantPass, recoveryPass, observabilityPass | blocking gates: invariantPass, recoveryPass, observabilityPass |
| 4 | Final Human Replacement | FAIL | — | pending critical scenarios: admin-settings-kyc-banking, admin-whatsapp-session-control, operator-autopilot-run, operator-campaigns-and-flows, system-payment-... |

## Evidence Summary

- Runtime: Runtime probes executed successfully.
- Browser: Synthetic Playwright scenarios executed successfully: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox.
- Flows: Flow evidence summary: 5 passed, 0 failed, 0 accepted, 0 missing evidence.
- Invariants: Invariant evidence summary: 1 passed, 3 failed, 0 accepted, 0 missing evidence.
- Observability: Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Recovery: Recovery evidence is missing: backup-validation.
- Customer: customer scenarios: 4 passed, 0 failed/checker-gap, 0 missing evidence.
- Operator: operator scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence.
- Admin: admin scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence.
- Soak: soak scenarios: 0 passed, 0 failed/checker-gap, 0 missing evidence.
- Synthetic Coverage: Synthetic coverage maps 102/102 non-ops page(s) to declared scenarios.
- Execution Trace: Execution completed: 110 phase(s) passed.
- Truth: Resolved manifest is aligned: 33 module(s), 55 flow group(s), no blocking drift.

## Human Replacement

- Status: NOT_READY
- Final target: TIER 1
- Covered pages: 102/102
- Uncovered pages: 0
- Accepted critical flows remaining: 0
- Pending critical scenarios: 5
- Customer scenarios: 4/4 passed
- Operator scenarios: 0/9 passed
- Admin scenarios: 0/3 passed
- Soak scenarios: 0/3 passed

## Convergence Queue

- Queue length: 9
- Scenario units: 5
- Security units: 0
- Gate units: 3
- Static units: 1
- Priorities: P0=1, P1=4, P2=3, P3=1
- Pending async expectations: 9
- Artifact: PULSE_CONVERGENCE_PLAN.md

| Order | Priority | Lane | Kind | Unit | Opened By |
|-------|----------|------|------|------|-----------|
| 1 | P0 | customer | SCENARIO | Recover System Payment Reconciliation | system-payment-reconciliation, payment-webhook-replay, wallet-ledger-reconciliation |
| 2 | P1 | operator-admin | SCENARIO | Recover Admin Settings Kyc Banking | adminPass, browserPass, admin-settings-kyc-banking, kyc-doc-processing, withdrawal-ledger-consistency |
| 3 | P1 | operator-admin | SCENARIO | Recover Admin Whatsapp Session Control | adminPass, browserPass, admin-whatsapp-session-control, provider-status-sync, session-reconnect |
| 4 | P1 | operator-admin | SCENARIO | Recover Operator Autopilot Run | operatorPass, operator-autopilot-run, job-enqueued, worker-health-visible |
| 5 | P1 | operator-admin | SCENARIO | Recover Operator Campaigns And Flows | operatorPass, operator-campaigns-and-flows, flow-resume-after-wait |
| 6 | P2 | reliability | GATE | Clear Invariant Pass | invariantPass |
| 7 | P2 | reliability | GATE | Clear Observability Pass | observabilityPass |
| 8 | P2 | reliability | GATE | Clear Recovery Pass | recoveryPass |
| 9 | P3 | platform | STATIC | Reduce Remaining Static Critical And High Breakers | staticPass |

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

- truth | executed=true | Resolved manifest built from 104 page(s), 33 module(s), 55 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 309 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=309, totalBreaks=1454

### runtimePass

- runtime | executed=true | Runtime probes executed successfully.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: executedChecks=4, blockingBreakTypes=0
- runtime | executed=true | Backend health probe passed on /health/system (200).
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=backend-health, required=true, status=200, latencyMs=893, traceHeaderDetected=true
- runtime | executed=true | Auth probe obtained a token and reached /workspace/me successfully.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=auth-session, required=true, status=passed, latencyMs=4047, authStatus=200, workspaceIdDetected=true
- runtime | executed=true | Frontend responded with HTTP 200.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=frontend-reachability, required=false, status=200, latencyMs=235
- runtime | executed=true | Database connectivity passed via authenticated backend readback on workspace settings. Direct SQL probe failure: Direct SQL probe failed: getaddrinfo ENOTFOUND postgres.railway.internal
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=db-connectivity, required=false, status=passed, latencyMs=2390, proofMode=backend_readback, workspaceIdDetected=true, providerSettingsDetected=true, authStatus=200, settingsStatus=200

### browserPass

- browser | executed=true | Synthetic Playwright scenarios executed successfully: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_BROWSER_EVIDENCE.json | Metrics: attempted=true, failureCode=ok, totalPages=0, totalTested=3, passRate=100, blockingInteractions=0

### flowPass

- flow | executed=true | auth-login passed its declared oracle (auth-session) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_auth-login.json | Metrics: flowId=auth-login, status=passed, accepted=false
- flow | executed=true | product-create passed its declared oracle (entity-persisted) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_product-create.json | Metrics: flowId=product-create, status=passed, accepted=false
- flow | executed=true | checkout-payment passed its declared oracle (payment-lifecycle) in total mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_checkout-payment.json | Metrics: flowId=checkout-payment, status=passed, accepted=false
- flow | executed=true | wallet-withdrawal replay passed with transaction 0d702ee2-7223-485f-8f88-2989418591cf and ledger delta -1. Real withdrawal smoke remains opt-in.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_wallet-withdrawal.json | Metrics: flowId=wallet-withdrawal, status=passed, accepted=false
- flow | executed=true | whatsapp-message-send replay passed via seeded inbox conversation 7fa4911c-5c98-41ad-acf0-d2bd446532a8. Final outbound smoke remains opt-in.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_whatsapp-message-send.json | Metrics: flowId=whatsapp-message-send, status=passed, accepted=false

### invariantPass

- invariant | executed=true | workspace-isolation passed via evaluator workspace-isolation.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=workspace-isolation, status=passed, accepted=false
- invariant | executed=true | Blocking findings for financial-audit-trail: AUDIT_FINANCIAL_NO_TRAIL, AUDIT_DELETION_NO_LOG, AUDIT_ADMIN_NO_LOG.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=financial-audit-trail, status=failed, accepted=false
- invariant | executed=true | Blocking findings for payment-idempotency: IDEMPOTENCY_MISSING.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=payment-idempotency, status=failed, accepted=false
- invariant | executed=true | Blocking findings for wallet-balance-consistency: RACE_CONDITION_FINANCIAL.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=wallet-balance-consistency, status=failed, accepted=false

### recoveryPass

- artifact | executed=true | Recovery evidence is missing: backup-validation.
- Artifacts: PULSE_RECOVERY_EVIDENCE.json | Metrics: backupManifestPresent=true, backupPolicyPresent=true, backupValidationPresent=false, restoreRunbookPresent=true, disasterRecoveryRunbookPresent=true, disasterRecoveryTestPresent=true, seedScriptPresent=true

### observabilityPass

- artifact | executed=true | Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Artifacts: PULSE_OBSERVABILITY_EVIDENCE.json | Metrics: tracingHeadersDetected=true, requestIdMiddlewareDetected=true, structuredLoggingDetected=true, sentryDetected=true, alertingIntegrationDetected=true, healthEndpointsDetected=true, auditTrailDetected=true

### customerPass

- actor | executed=true | Playwright scenario customer-auth-shell passed.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-auth-shell, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=6957
- actor | executed=true | Playwright scenario customer-product-and-checkout passed.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-product-and-checkout, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=2, durationMs=10201
- actor | executed=true | Playwright scenario customer-whatsapp-and-inbox passed.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-whatsapp-and-inbox, actorKind=customer, critical=true, requested=true, runner=playwright-spec, status=passed, specsExecuted=1, durationMs=2184
- actor | executed=true | Derived scenario customer-onboarding-public-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=customer-onboarding-public-map, actorKind=customer, critical=false, requested=true, runner=derived, status=passed, specsExecuted=0, durationMs=0

### operatorPass

- actor | executed=false | Scenario operator-campaigns-and-flows was not requested in this synthetic run.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run was not requested in this synthetic run.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-ads-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-ads-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-canvas-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-canvas-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-tools-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-tools-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-sites-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-sites-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-partnerships-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-partnerships-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-sales-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-sales-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-media-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-media-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0

### adminPass

- actor | executed=false | Scenario admin-settings-kyc-banking was not requested in this synthetic run.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-settings-kyc-banking, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario admin-whatsapp-session-control was not requested in this synthetic run.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-whatsapp-session-control, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario admin-ops-surface-map was not requested in this synthetic run.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=admin-ops-surface-map, actorKind=admin, critical=false, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0

### soakPass

- actor | executed=false | Scenario operator-campaigns-and-flows was not requested in this synthetic run.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run was not requested in this synthetic run.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=skipped, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario system-payment-reconciliation was not requested in this synthetic run.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=system-payment-reconciliation, actorKind=system, critical=true, requested=false, runner=derived, status=skipped, specsExecuted=0, durationMs=0

### syntheticCoveragePass

- coverage | executed=true | Synthetic coverage maps 102/102 non-ops page(s) to declared scenarios.
- Artifacts: PULSE_SCENARIO_COVERAGE.json | Metrics: totalPages=104, userFacingPages=102, coveredPages=102, uncoveredPages=0

### evidenceFresh

- artifact | executed=true | Execution in progress: 109 passed, 0 failed, 0 timed out, 1 running.
- Artifacts: PULSE_EXECUTION_TRACE.json, PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CONVERGENCE_PLAN.json, PULSE_CONVERGENCE_PLAN.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 1066 | 3 dead handlers |
| API Calls | 582 | 0 no backend |
| Backend Routes | 718 | 0 empty |
| Prisma Models | 133 | 2 orphaned |
| Facades | 2 | 0 critical, 2 warning |
| Proxy Routes | 66 | 7 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 64 issues |
| Quality | - | 1260 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (1454 total)

### ACCESSIBILITY_VIOLATION (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/dashboard/KloelDashboard.tsx:1867 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:712 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:726 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:757 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:773 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2280 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2293 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:236 | \<input\> without associated label or aria-label |

### AUDIT_ADMIN_NO_LOG (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/accounts/admin-accounts.controller.ts:0 | Admin operation without audit log — privileged actions are unaccountable |
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | Admin operation without audit log — privileged actions are unaccountable |
| HIGH | backend/src/whatsapp/whatsapp-digits.util.ts:0 | Admin operation without audit log — privileged actions are unaccountable |
| HIGH | backend/src/whatsapp/whatsapp-normalization.util.ts:0 | Admin operation without audit log — privileged actions are unaccountable |

### AUDIT_DELETION_NO_LOG (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/permissions/admin-permissions.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |

### AUDIT_FINANCIAL_NO_TRAIL (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/payments/connect/connect-reversal.service.ts:0 | Financial operation without AuditLog write — cannot reconstruct transaction history |

### BACKUP_MISSING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No recent DB backup found — backup manifest missing or older than 24 h |
| CRITICAL | .backup-validation.log:0 | No backup restore-test validation log found — backup has never been verified |

### BROWSER_INCOMPATIBLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:1009 | CSS feature with limited browser support used without @supports fallback |
| WARNING | frontend/src/app/(checkout)/layout.tsx:0 | Root layout missing viewport meta tag — mobile users see desktop-scaled view |

### CACHE_REDIS_STALE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:97 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/common/ledger-reconciliation.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/payments/connect/connect-reversal.service.ts:177 | Financial data cached in Redis without TTL — cache never expires, will always be stale |

### CACHE_STALE_AFTER_WRITE (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/hooks/useCheckoutSocialIdentity.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(checkout)/hooks/useStripeCheckout.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/reset-password/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/verify-email/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/callback/apple/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/facebook/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/magic-link/request/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/magic-link/verify/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/verify/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/pulse/live/heartbeat/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/PulseFrontendHeartbeat.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/auth/auth-modal.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/landing/FloatingChat.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenterAvalTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenterCampanhasTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCampaignsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/cookie-consent.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/kloel-api.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CICD_INCOMPLETE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/.github/workflows/ci-cd.yml:0 | CI workflow missing lint gate |

### CLOCK_SKEW_TOO_STRICT (12)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/auth/admin-auth.controller.ts:95 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/admin/auth/admin-guards.module.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/admin/auth/admin-session-factory.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/admin/auth/guards/admin-auth.guard.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:9 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/common/interfaces/jwt-payload.interface.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/compliance/utils/jwt-set.validator.ts:4 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/cookie-consent/cookie-consent.controller.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COST_LLM_NO_LIMIT (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/chat/chat-tool.registry.ts:4 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:81 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/canvas.controller.ts:198 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:381 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:400 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:425 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:443 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/unified-agent.service.ts:1300 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/admin/chat/admin-chat.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/admin/chat/admin-chat.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/admin/chat/dto/send-message.dto.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/inbox/inbox.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/payment-webhook.controller.spec-helpers.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/cia-runtime.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/provider-registry.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.service.sendmessage.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |

### COST_STORAGE_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | File uploads accepted without per-workspace storage quota check |

### COVERAGE_CORE_LOW (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/coverage/coverage-summary.json:0 | Backend coverage report not found — run jest --coverage to generate |

### CRON_NO_ERROR_HANDLING (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:26 | Cron/Interval method has no try/catch — unhandled errors will crash the job silently |
| WARNING | backend/src/followup/followup.service.ts:42 | Cron/Interval method has no try/catch — unhandled errors will crash the job silently |
| WARNING | backend/src/payments/ledger/connect-ledger-maturation.service.ts:38 | Cron/Interval method has no try/catch — unhandled errors will crash the job silently |
| WARNING | backend/src/platform-wallet/platform-wallet-maturation.service.ts:45 | Cron/Interval method has no try/catch — unhandled errors will crash the job silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:578 | Cron/Interval method has no try/catch — unhandled errors will crash the job silently |

### CRUD_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/products:0 | CRUD CREATE — expected 200/201, got 0 |

### DATA_ORDER_NO_PAYMENT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:263 | Financial write without existence check in wallet.service.ts |
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/platform-wallet/platform-wallet.service.ts:118 | Financial write without existence check in platform-wallet.service.ts |
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/wallet/wallet.service.ts:51 | Financial write without existence check in wallet.service.ts |

### DATA_PRODUCT_NO_PLAN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/checkout/checkout-social-lead.service.ts:65 | Checkout/order creation without prior plan/product validation in checkout-social-lead.service.ts |

### DEAD_EXPORT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/cost-alerting.service.ts:5 | Exported symbol 'CostAlertingService' has no references in other files |
| INFO | backend/src/common/ledger-reconciliation.service.ts:86 | Exported symbol 'LedgerReconciliationService' has no references in other files |
| INFO | backend/src/kloel/llm-budget.service.ts:169 | Exported symbol 'estimateChatCostCents' has no references in other files |
| INFO | backend/src/payments/connect/connect-payout.service.ts:52 | Exported symbol 'ConnectPayoutsNotEnabledError' has no references in other files |
| INFO | backend/src/platform-wallet/platform-wallet.service.ts:86 | Exported symbol 'PlatformWalletInsufficientAvailableBalanceError' has no references in other files |

### DIVISION_BY_ZERO_RISK (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-code.util.ts:3 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout-order-support.ts:6 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout-plan-link.manager.ts:11 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout-shipping-profile.util.ts:1 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout-social-lead.service.ts:17 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout.controller.ts:32 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/checkout/checkout.service.ts:32 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/kloel-stream-writer.ts:14 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/marketing-skills/marketing-skill.context.ts:126 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/marketing-skills/marketing-skill.router.ts:5 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/pdf-processor.service.ts:10 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:30 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/site.controller.ts:20 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/thread-search.util.ts:1 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/unified-agent.service.ts:118 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/kloel/unified-agent.service.ts:120 | Division by variable without zero-check — potential division by zero in financial code |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:47 | Division by variable without zero-check — potential division by zero in financial code |

### DOCKER_BUILD_FAILS (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 | No Dockerfile found for backend |
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 | No Dockerfile found for frontend |

### DTO_NO_VALIDATION (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/auth/dto/change-password.dto.ts:12 | DTO class 'ChangePasswordDto' has 1 properties but no class-validator decorators |

### E2E_FLOW_NOT_TESTED (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

### EDGE_CASE_ARRAY (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/products/dto/moderate-product.dto.ts:13 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/admin/products/dto/moderate-product.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:38 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-product.dto.ts:12 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:254 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:330 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:336 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:342 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:17 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:21 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:41 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:46 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/log-execution.dto.ts:7 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:7 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:12 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:134 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:35 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

### EDGE_CASE_DATE (401)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/accounts/admin-accounts.service.ts:101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/accounts/kyc/admin-kyc.service.ts:39 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/accounts/kyc/admin-kyc.service.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/accounts/kyc/admin-kyc.service.ts:89 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/auth/admin-auth.service.ts:264 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/auth/admin-auth.service.ts:293 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/auth/admin-auth.service.ts:333 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/auth/admin-auth.service.ts:359 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/carteira/admin-carteira.controller.ts:73 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/carteira/admin-carteira.controller.ts:74 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/chat/admin-chat.service.ts:286 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/chat/admin-chat.service.ts:295 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/chat/admin-chat.service.ts:324 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/clients/admin-clients.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/clients/admin-clients.service.ts:152 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/queries/producers.query.ts:28 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/queries/series.query.ts:55 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/queries/series.query.ts:95 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:45 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:51 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:57 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:62 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:63 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:68 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:70 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:86 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/dashboard/range.util.ts:137 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:118 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:119 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:162 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:210 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:282 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:302 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/destructive-intent.service.ts:320 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/destructive/handlers/force-logout-global.handler.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/notifications/admin-notifications.service.ts:143 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/notifications/admin-notifications.service.ts:153 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/sales/admin-sales.service.ts:44 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/sessions/admin-sessions.service.ts:69 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/support/admin-support.service.ts:199 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/transactions/admin-transactions.service.ts:216 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/admin/transactions/admin-transactions.service.ts:226 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.controller.ts:11 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:38 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:135 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:210 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:212 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:316 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:332 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:569 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:40 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/api-keys/api-keys.service.ts:71 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:77 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:235 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:254 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1103 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1150 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1167 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1372 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1469 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:255 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:342 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:514 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:551 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:569 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:576 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:588 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:631 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:681 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1246 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1251 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1266 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1302 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1306 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1724 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1771 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1825 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1855 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1934 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2187 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2217 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:172 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:177 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:229 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:393 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:476 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:488 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:522 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:99 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:100 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:150 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:507 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:514 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:731 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:809 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:159 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:166 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:224 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:254 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:261 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:37 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:38 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:51 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:52 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:326 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:327 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:435 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/campaigns/campaigns.service.ts:113 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-order-support.ts:238 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:55 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:209 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:502 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-public.controller.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-social-lead.service.ts:354 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:62 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:108 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:131 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:1359 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:1975 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:157 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:230 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:394 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:82 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:197 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:236 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:253 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:270 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:337 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:392 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:393 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:409 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:417 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/compliance/compliance.service.ts:425 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cookie-consent/cookie-consent.service.ts:29 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/crm.service.ts:551 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/neuro-crm.service.ts:515 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:78 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:155 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:157 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:158 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:159 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:160 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:165 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:428 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:50 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:56 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:62 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:80 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:111 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:437 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:438 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:495 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:525 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:136 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:166 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:223 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:42 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:61 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-delete.controller.ts:67 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/gdpr/data-export.controller.ts:78 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:33 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:86 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/smart-time.service.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:37 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:55 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:74 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/i18n/i18n.service.ts:365 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/inbox/inbox.service.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:70 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:115 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:91 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:621 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:622 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:61 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:95 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:134 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:169 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:295 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:302 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:313 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:328 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guards/kloel-security.guard.ts:276 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:84 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:274 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:275 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:896 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:942 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:955 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:1009 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:1079 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:1116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1969 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1999 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2020 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2030 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2043 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2126 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2291 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2628 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3760 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3900 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:4888 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:5033 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:5054 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:6012 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/llm-budget.service.ts:141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:196 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:223 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:452 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:522 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:581 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:159 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:231 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:233 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:323 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:341 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:648 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:1678 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:154 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:240 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:258 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:310 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:329 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:357 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:486 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:496 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:515 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:517 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1669 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2057 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3106 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3124 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3548 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3605 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3636 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3749 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3763 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3768 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3771 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3774 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3777 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3780 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3868 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3901 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4038 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4353 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4425 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4426 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4445 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:5181 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:192 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:212 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:248 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:68 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:93 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.controller.ts:100 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.service.ts:51 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:64 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:383 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:411 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:438 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/logging/structured-logger.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/marketing/marketing.controller.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:464 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:517 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:285 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:376 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:140 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:535 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:263 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:259 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:268 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:371 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:408 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/connect/connect-payout-approval.service.ts:265 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/connect/connect-payout-approval.service.ts:313 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/connect/connect-payout-approval.service.ts:390 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/connect/connect.service.ts:161 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/fraud/fraud.engine.ts:137 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/ledger/connect-ledger-maturation.service.ts:44 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:165 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/platform-wallet/platform-wallet-maturation.service.ts:51 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/platform-wallet/platform-wallet-maturation.service.ts:52 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/platform-wallet/platform-wallet-reconcile.service.ts:67 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/platform-wallet/platform-wallet-reconcile.service.ts:125 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:166 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:199 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:232 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:303 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:305 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:521 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:609 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:173 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:262 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:30 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:73 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:113 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:710 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:724 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:761 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:788 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:798 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:879 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:1035 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:1408 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:1461 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:1744 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:1757 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhook-dispatcher.service.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:230 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:244 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:475 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:483 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:242 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:510 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:591 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:668 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:690 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1059 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1060 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1176 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1251 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1610 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1621 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1643 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1650 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/agent-events.service.ts:160 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:343 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:385 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:491 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:500 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:765 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2122 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2172 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2232 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2305 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:80 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:270 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:283 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:342 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:360 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:751 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:265 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:95 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:259 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:177 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:441 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:525 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:601 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:603 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:743 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1371 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1383 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1415 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1448 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1470 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1546 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1548 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:125 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:524 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:529 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:713 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:723 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:801 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:818 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:914 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:967 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:569 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:654 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:718 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1528 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2037 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2375 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:26 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:72 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:82 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:15 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/media/media.controller.ts:21 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/media/media.controller.ts:23 | File upload without size limit — large files may exhaust memory or storage |

### EDGE_CASE_PAGINATION (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:75 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:76 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:136 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:137 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:180 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/carteira/admin-carteira.controller.ts:181 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/admin/dashboard/admin-dashboard.service.ts:0 | findMany() in reporting context without take/skip — may return all records and exhaust memory |
| HIGH | backend/src/admin/dashboard/queries/breakdowns.query.ts:0 | findMany() in reporting context without take/skip — may return all records and exhaust memory |
| HIGH | backend/src/admin/dashboard/queries/producers.query.ts:0 | findMany() in reporting context without take/skip — may return all records and exhaust memory |
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:65 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:296 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:298 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1160 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/payments/connect/connect.controller.ts:201 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/payments/connect/connect.controller.ts:202 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/accounts/dto/list-accounts.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/audit/dto/list-audit.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/audit/dto/list-audit.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/audit/dto/list-audit.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/audit/dto/list-audit.dto.ts:23 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/clients/dto/list-clients.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/clients/dto/list-clients.dto.ts:13 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/products/dto/list-products.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/products/dto/list-products.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/admin/support/dto/update-support-ticket-status.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/auth/dto/whatsapp-auth.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/auth/dto/whatsapp-auth.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/kyc-document-type.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:34 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:38 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/team/dto/invite-member.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |

### EMPTY_CATCH (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/inbox/inbox-events.service.ts:74 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel-conversation-store.ts:55 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel-conversation-store.ts:115 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:2619 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:254 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:289 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:324 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:649 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:330 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/queue.ts:467 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (31)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/auth/admin-jwt-secret.ts:16 | Environment variable CI is referenced but not documented in .env.example |
| WARNING | backend/src/admin/auth/guards/admin-auth.guard.ts:24 | Environment variable ADMIN_JWT_SECRET is referenced but not documented in .env.example |
| WARNING | backend/src/auth/auth.service.ts:115 | Environment variable RATE_LIMIT_DISABLED is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-payload.builder.ts:113 | Environment variable STRIPE_PUBLISHABLE_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-url.util.ts:53 | Environment variable CHECKOUT_DOMAIN is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/redis-url-predicates.ts:22 | Environment variable RAILWAY_PROJECT_ID is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/redis-url-predicates.ts:23 | Environment variable RAILWAY_ENVIRONMENT_ID is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/redis-url-predicates.ts:24 | Environment variable RAILWAY_SERVICE_ID is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/redis-url-predicates.ts:25 | Environment variable RAILWAY_DEPLOYMENT_ID is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/resolve-redis-url.ts:78 | Environment variable REDIS_MODE is referenced but not documented in .env.example |
| WARNING | backend/src/common/sales-templates.ts:81 | Environment variable DEFAULT_CALENDAR_LINK is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:5 | Environment variable SENTRY_RELEASE is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:7 | Environment variable VERCEL_GIT_COMMIT_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:8 | Environment variable GITHUB_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:13 | Environment variable SENTRY_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:165 | Environment variable AUDIO_FETCH_ALLOWLIST is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:168 | Environment variable R2_PUBLIC_URL is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/kloel-stream-writer.ts:33 | Environment variable KLOEL_STREAM_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/llm-budget.service.ts:147 | Environment variable LLM_BUDGET_DEFAULT_CENTS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:167 | Environment variable LLM_MAX_COMPLETION_TOKENS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:169 | Environment variable LLM_MAX_INPUT_CHARS is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-token-crypto.ts:6 | Environment variable PROVIDER_SECRET_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.controller.ts:51 | Environment variable PULSE_RUNTIME_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:636 | Environment variable PULSE_BACKEND_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:644 | Environment variable PULSE_STALE_SWEEP_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:652 | Environment variable PULSE_FRONTEND_PRUNE_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:673 | Environment variable RAILWAY_REPLICA_ID is referenced but not documented in .env.example |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:287 | Environment variable STRIPE_WEBHOOK_SECRETS is referenced but not documented in .env.example |
| WARNING | worker/processors/autopilot-processor.ts:202 | Environment variable AUTOPILOT_SHARENON_DIGIT_REPLY_LOCK_MS is referenced but not documented in .env.example |
| WARNING | worker/providers/whatsapp-engine.ts:98 | Environment variable WHATSAPP_ACTION_LOCK_TEST_ENFORCE is referenced but not documented in .env.example |
| WARNING | worker/pulse-runtime.ts:38 | Environment variable PULSE_WORKER_HEARTBEAT_MS is referenced but not documented in .env.example |

### FACADE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/payments/connect/connect-reversal.service.ts:143 | [hardcoded_data] Service method returns empty array/object instead of real data |
| WARNING | backend/src/pulse/pulse.service.ts:451 | [hardcoded_data] Service method returns empty array/object instead of real data |

### FINANCIAL_ERROR_SWALLOWED (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-post-payment-effects.service.ts:109 | catch block in financial code only logs — error swallowed without throw |
| CRITICAL | backend/src/checkout/checkout-post-payment-effects.service.ts:125 | catch block in financial code only logs — error swallowed without throw |
| CRITICAL | backend/src/payments/connect/connect-payout-approval.service.ts:260 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | backend/src/payments/ledger/connect-ledger-maturation.service.ts:63 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:101 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:324 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | backend/src/platform-wallet/platform-wallet-maturation.service.ts:123 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | backend/src/platform-wallet/platform-wallet-reconcile.service.ts:179 | catch block in financial code does not rethrow — caller unaware of failure |
| CRITICAL | worker/processors/checkout-social-lead-enrichment.ts:126 | catch block in financial code does not rethrow — caller unaware of failure |
| HIGH | backend/src/checkout/checkout-order-support.ts:294 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/wallet.service.ts:511 | catch in financial code handles error without rethrow |

### FINANCIAL_NO_RATE_LIMIT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/transactions/admin-transactions.controller.ts:33 | Financial route has no @Throttle rate-limit decorator |
| HIGH | backend/src/admin/transactions/admin-transactions.controller.ts:51 | Financial route has no @Throttle rate-limit decorator |

### FINANCIAL_NO_TRANSACTION (13)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/platform-wallet/platform-wallet.service.ts:203 | Financial function has 3 Prisma mutations without $transaction |
| CRITICAL | backend/src/platform-wallet/platform-wallet.service.ts:208 | Financial function has 3 Prisma mutations without $transaction |
| CRITICAL | backend/src/platform-wallet/platform-wallet.service.ts:229 | Financial function has 3 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:449 | Financial function has 3 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:457 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:462 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:519 | Financial function has 3 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:527 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:532 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:722 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:752 | Financial function has 2 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:778 | Financial function has 4 Prisma mutations without $transaction |
| CRITICAL | backend/src/webhooks/payment-webhook.controller.ts:786 | Financial function has 4 Prisma mutations without $transaction |

### FINDMANY_NO_PAGINATION (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/inbox/inbox.service.ts:428 | findMany() on Message without pagination (take/cursor) — unbounded query |
| HIGH | backend/src/kloel/kloel.service.ts:1353 | findMany() on ChatMessage without pagination (take/cursor) — unbounded query |
| HIGH | backend/src/kloel/kloel.service.ts:2540 | findMany() on ChatMessage without pagination (take/cursor) — unbounded query |
| HIGH | backend/src/kloel/kloel.service.ts:4968 | findMany() on ChatMessage without pagination (take/cursor) — unbounded query |

### HARDCODED_INTERNAL_URL (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/main.ts:277 | Hardcoded internal/infrastructure URL: https://kloel.vercel.app |
| WARNING | backend/src/main.ts:278 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/main.ts:279 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:559 | Hardcoded internal/infrastructure URL: http://localhost |

### HARDCODED_PROD_URL (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | frontend/src/lib/http.ts:97 | Hardcoded production URL: https://api.kloel.com |
| INFO | backend/src/billing/stripe.service.ts:46 | Hardcoded production URL: https://kloel.com |
| INFO | backend/src/main.ts:273 | Hardcoded production URL: https://auth.kloel.com |
| INFO | backend/src/main.ts:274 | Hardcoded production URL: https://pay.kloel.com |

### HYDRATION_MISMATCH (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/layout.tsx:71 | suppressHydrationWarning detected — indicates a known SSR/client mismatch |

### IDEMPOTENCY_MISSING (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/destructive/admin-destructive.controller.ts:48 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/admin/users/admin-users.controller.ts:41 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/affiliate/affiliate.controller.ts:563 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/app.module.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/canvas.controller.ts:85 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/wallet.controller.ts:124 | POST endpoint creates resource without idempotency — safe retry not possible |

### JSON_PARSE_UNSAFE (12)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/admin/accounts/admin-accounts.service.ts:115 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/admin/config/admin-config.service.ts:192 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/admin/transactions/admin-transactions.service.ts:407 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/checkout/checkout-payment.service.ts:61 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:407 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:435 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/webhooks/webhooks.service.ts:471 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:741 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:860 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:2185 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/processors/autopilot-processor.ts:2192 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | worker/providers/commercial-intelligence.ts:635 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |

### LICENSE_UNKNOWN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | .license-allowlist.json:0 | No license allowlist found — create .license-allowlist.json to document approved exceptions |

### LINT_VIOLATION (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/billing/billing.service.ts:295 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:296 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:297 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:298 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:299 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:300 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:321 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:322 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:323 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:324 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:325 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:326 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:327 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:328 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:329 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:330 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:331 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:332 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:333 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/billing/billing.service.ts:334 | Backend ESLint error (prettier/prettier) |
| INFO | backend/src/pulse/resolved-manifest-backfill.spec.ts:163 | Backend ESLint error (prettier/prettier) |

### MIGRATION_NO_ROLLBACK (14)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/prisma/migrations/20260406130000_add_checkout_links_and_kinds/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408190000_add_checkout_shipping_and_affiliate_config/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260414103000_sync_customer_subscription_and_order_alert_schema/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260414204000_add_checkout_social_identity/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260415120000_admin_identity_foundation/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260415200000_admin_destructive_intents/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260415210000_platform_wallet/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260415220000_admin_ai_chat/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260417220000_connect_ledger/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260417230000_prepaid_wallet/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260417240000_fraud_blacklist/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260419100000_compliance_module/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |

### MODEL_ORPHAN (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/prisma/schema.prisma:3181 | Model PlatformFee has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:3426 | Model FraudBlacklist has no service or controller accessing it |

### MONITORING_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |

### NETWORK_OFFLINE_DATA_LOST (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |
| HIGH | frontend/src/app/(checkout)/components/StripePaymentElement.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |

### NETWORK_SLOW_UNUSABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Page fetches async data but has no loading state — blank/broken UI on slow network |

### N_PLUS_ONE_QUERY (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/compliance/compliance.service.ts:102 | Prisma query inside loop — potential N+1 query problem |
| WARNING | backend/src/compliance/compliance.service.ts:112 | Prisma query inside loop — potential N+1 query problem |
| WARNING | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:128 | Prisma query inside loop — potential N+1 query problem |
| WARNING | backend/src/reports/reports.service.ts:150 | Prisma query inside loop — potential N+1 query problem |

### OBSERVABILITY_NO_ALERTING (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout-order-support.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout-post-payment-effects.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/payments/connect/connect-payout-approval.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/payments/connect/connect.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/payments/connect/connect.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/payments/stripe/stripe-webhook.processor.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |

### OBSERVABILITY_NO_TRACING (24)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/audio/transcription.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/auth.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/email.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/facebook-auth.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/google-auth.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/billing/billing.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/common/storage/storage.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/compliance/utils/jwt-set.validator.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/crm/crm.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/health/system-health.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/audio.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/site.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/marketing/marketing.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/media/media.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-auth.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-sdk.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |

### ORPHANED_FILE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/cost-alerting.service.ts:1 | File 'cost-alerting.service.ts' is not imported by any other backend file |

### PROXY_NO_UPSTREAM (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/api/auth/logout/route.ts:1 | Proxy POST /api/auth/logout -\> /auth/logout has no backend route |
| WARNING | frontend/src/app/api/compliance/deletion-status/[code]/route.ts:1 | Proxy GET /api/compliance/deletion-status/[code] -\> /compliance/deletion-status/${encodeURIComponent(String(code \|\| '').trim())} has no backend route |
| WARNING | frontend/src/app/api/kloel/download-image/route.ts:1 | Proxy GET /api/kloel/download-image -\> /storage/ has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy GET /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy POST /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy PUT /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy DELETE /api/marketing/:path -\> /marketing/:path has no backend route |

### QUEUE_NO_PROCESSOR (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/autopilot/autopilot.service.ts:1726 | Queue job 'process-campaign' is produced but has no worker processor |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:40 | Queue job 'send-webhook' is produced but has no worker processor |
| HIGH | worker/flow-engine-global.ts:308 | Queue job 'analyze-contact' is produced but has no worker processor |
| HIGH | worker/flow-engine-global.ts:988 | Queue job 'extract-facts' is produced but has no worker processor |
| HIGH | worker/providers/campaigns.ts:23 | Queue job 'process-campaign-action' is produced but has no worker processor |
| HIGH | worker/voice-processor.ts:196 | Queue job 'process-message' is produced but has no worker processor |

### RACE_CONDITION_DATA_CORRUPTION (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-social-lead.service.ts:196 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/checkout/checkout-social-lead.service.ts:284 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/checkout/checkout-social-recovery.service.ts:78 | Read-modify-write without transaction or optimistic lock — race condition possible |

### RACE_CONDITION_FINANCIAL (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/billing/stripe.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/connect/connect-payout.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/connect/connect-reversal.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/connect/connect.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/ledger/connect-ledger-maturation.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/payments/stripe/stripe-charge.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/platform-wallet/platform-payout.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |
| CRITICAL | backend/src/platform-wallet/platform-wallet-reconcile.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |

### RACE_CONDITION_OVERWRITE (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-social-recovery.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/payments/ledger/ledger.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/platform-wallet/platform-wallet.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/wallet/wallet.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |

### RELATION_NO_CASCADE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/prisma/schema.prisma:2973 | @relation without onDelete — cascade behavior unspecified |

### RESPONSE_INCONSISTENT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/product.controller.ts:443 | Controller mixes wrapped ({ data: … }) and raw return styles |
| INFO | backend/src/member-area/member-area.controller.ts:445 | Controller mixes wrapped ({ data: … }) and raw return styles |

### ROUTE_NO_CALLER (116)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:35 | GET /admin/accounts is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:47 | GET /admin/accounts/kyc/queue is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:54 | GET /admin/accounts/:workspaceId is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:61 | POST /admin/accounts/bulk/state is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:74 | POST /admin/accounts/:workspaceId/state is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:89 | POST /admin/accounts/:workspaceId/reset-password is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:100 | POST /admin/accounts/:workspaceId/impersonate is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:110 | POST /admin/accounts/agents/:agentId/kyc/approve is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:122 | POST /admin/accounts/agents/:agentId/kyc/reject is not called by any frontend code |
| INFO | backend/src/admin/accounts/admin-accounts.controller.ts:134 | POST /admin/accounts/agents/:agentId/kyc/reverify is not called by any frontend code |
| INFO | backend/src/admin/audit/admin-audit.controller.ts:19 | GET /admin/audit is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:43 | POST /admin/auth/login is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:51 | POST /admin/auth/change-password is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:69 | POST /admin/auth/mfa/setup is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:78 | POST /admin/auth/mfa/verify-initial is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:91 | POST /admin/auth/mfa/verify is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:104 | POST /admin/auth/refresh is not called by any frontend code |
| INFO | backend/src/admin/auth/admin-auth.controller.ts:112 | POST /admin/auth/logout is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:49 | GET /admin/carteira/balance is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:56 | GET /admin/carteira/ledger is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:81 | GET /admin/carteira/reconcile is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:88 | GET /admin/carteira/connect/accounts is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:121 | GET /admin/carteira/connect/reconcile is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:130 | GET /admin/carteira/payouts is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:169 | GET /admin/carteira/connect/payout-requests is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:186 | POST /admin/carteira/payouts is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:253 | POST /admin/carteira/connect/payout-requests/:approvalRequestId/approve is not called by any frontend code |
| INFO | backend/src/admin/carteira/admin-carteira.controller.ts:274 | POST /admin/carteira/connect/payout-requests/:approvalRequestId/reject is not called by any frontend code |
| INFO | backend/src/admin/chat/admin-chat.controller.ts:26 | POST /admin/chat/message is not called by any frontend code |
| INFO | backend/src/admin/chat/admin-chat.controller.ts:38 | GET /admin/chat/sessions is not called by any frontend code |
| INFO | backend/src/admin/chat/admin-chat.controller.ts:44 | GET /admin/chat/sessions/:id is not called by any frontend code |
| INFO | backend/src/admin/clients/admin-clients.controller.ts:18 | GET /admin/clients is not called by any frontend code |
| INFO | backend/src/admin/compliance/admin-compliance.controller.ts:18 | GET /admin/compliance/overview is not called by any frontend code |
| INFO | backend/src/admin/config/admin-config.controller.ts:21 | GET /admin/config/overview is not called by any frontend code |
| INFO | backend/src/admin/config/admin-config.controller.ts:28 | PATCH /admin/config/workspaces/:workspaceId is not called by any frontend code |
| INFO | backend/src/admin/dashboard/admin-dashboard.controller.ts:19 | GET /admin/dashboard/home is not called by any frontend code |
| INFO | backend/src/admin/destructive/admin-destructive.controller.ts:48 | POST /admin/destructive-intents is not called by any frontend code |
| INFO | backend/src/admin/destructive/admin-destructive.controller.ts:69 | GET /admin/destructive-intents/:id is not called by any frontend code |
| INFO | backend/src/admin/destructive/admin-destructive.controller.ts:75 | POST /admin/destructive-intents/:id/confirm is not called by any frontend code |
| INFO | backend/src/admin/destructive/admin-destructive.controller.ts:93 | POST /admin/destructive-intents/:id/undo is not called by any frontend code |
| INFO | backend/src/admin/marketing/admin-marketing.controller.ts:18 | GET /admin/marketing/overview is not called by any frontend code |
| INFO | backend/src/admin/notifications/admin-notifications.controller.ts:19 | GET /admin/notifications is not called by any frontend code |
| INFO | backend/src/admin/notifications/admin-notifications.controller.ts:26 | POST /admin/notifications/:notificationId/read is not called by any frontend code |
| INFO | backend/src/admin/notifications/admin-notifications.controller.ts:36 | PATCH /admin/notifications/preferences is not called by any frontend code |
| INFO | backend/src/admin/products/admin-products.controller.ts:32 | GET /admin/products is not called by any frontend code |
| INFO | backend/src/admin/products/admin-products.controller.ts:45 | GET /admin/products/:productId is not called by any frontend code |
| INFO | backend/src/admin/products/admin-products.controller.ts:52 | POST /admin/products/:productId/approve is not called by any frontend code |
| INFO | backend/src/admin/products/admin-products.controller.ts:67 | POST /admin/products/:productId/reject is not called by any frontend code |
| INFO | backend/src/admin/products/admin-products.controller.ts:82 | POST /admin/products/:productId/state is not called by any frontend code |
| INFO | backend/src/admin/reports/admin-reports.controller.ts:20 | GET /admin/reports/overview is not called by any frontend code |
| INFO | backend/src/admin/reports/admin-reports.controller.ts:27 | GET /admin/reports/export/csv is not called by any frontend code |
| INFO | backend/src/admin/sales/admin-sales.controller.ts:17 | GET /admin/sales/overview is not called by any frontend code |
| INFO | backend/src/admin/sessions/admin-sessions.controller.ts:19 | GET /admin/sessions/me is not called by any frontend code |
| INFO | backend/src/admin/sessions/admin-sessions.controller.ts:25 | GET /admin/sessions/user/:id is not called by any frontend code |
| INFO | backend/src/admin/sessions/admin-sessions.controller.ts:32 | DELETE /admin/sessions/:id is not called by any frontend code |
| INFO | backend/src/admin/support/admin-support.controller.ts:21 | GET /admin/support/overview is not called by any frontend code |
| INFO | backend/src/admin/support/admin-support.controller.ts:28 | GET /admin/support/:conversationId is not called by any frontend code |
| INFO | backend/src/admin/support/admin-support.controller.ts:35 | POST /admin/support/:conversationId/status is not called by any frontend code |
| INFO | backend/src/admin/support/admin-support.controller.ts:47 | POST /admin/support/:conversationId/reply is not called by any frontend code |
| INFO | backend/src/admin/transactions/admin-transactions.controller.ts:33 | GET /admin/transactions is not called by any frontend code |
| INFO | backend/src/admin/transactions/admin-transactions.controller.ts:51 | POST /admin/transactions/:orderId/operate is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:28 | GET /admin/users/me is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:34 | GET /admin/users is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:41 | POST /admin/users is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:55 | PATCH /admin/users/:id is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:72 | PUT /admin/users/:id/permissions is not called by any frontend code |
| INFO | backend/src/admin/users/admin-users.controller.ts:83 | GET /admin/users/:id/permissions is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:102 | POST /checkout/public/validate-coupon is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:121 | POST /checkout/public/order is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:147 | POST /checkout/public/upsell/:orderId/accept/:upsellId is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:153 | POST /checkout/public/upsell/:orderId/decline/:upsellId is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:179 | POST /checkout/public/social-capture/:leadId/google-profile is not called by any frontend code |
| INFO | backend/src/gdpr/data-delete.controller.ts:23 | POST /gdpr/delete is not called by any frontend code |
| INFO | backend/src/gdpr/data-export.controller.ts:19 | POST /gdpr/export is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:707 | GET /kloel/threads/search is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:868 | POST /kloel/threads/:id/messages is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:69 | POST /kloel/upload is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:31 | GET /launch/launchers is not called by any frontend code |
| INFO | backend/src/marketing/marketing.controller.ts:458 | GET /marketing/channels is not called by any frontend code |
| INFO | backend/src/marketplace/marketplace.controller.ts:13 | GET /marketplace/templates is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:52 | GET /meta/instagram/profile is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:82 | GET /meta/instagram/insights/account is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:53 | GET /payments/connect/:workspaceId/accounts is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:86 | POST /payments/connect/:workspaceId/accounts is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:128 | POST /payments/connect/:workspaceId/accounts/:accountBalanceId/onboarding-link is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:183 | GET /payments/connect/:workspaceId/reconcile is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:189 | GET /payments/connect/:workspaceId/payout-requests is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:207 | GET /payments/connect/:workspaceId/payouts is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:296 | GET /payments/connect/:workspaceId/ledger is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:382 | POST /payments/connect/:workspaceId/payouts is not called by any frontend code |
| INFO | backend/src/payments/connect/connect.controller.ts:459 | POST /payments/connect/:workspaceId/payout-requests is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:24 | GET /reports/vendas is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:30 | GET /reports/vendas/summary is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:60 | GET /reports/afiliados is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:66 | GET /reports/indicadores is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:72 | GET /reports/assinaturas is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:78 | GET /reports/indicadores-produto is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:90 | GET /reports/origem is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:130 | GET /reports/chargeback is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:119 | GET /whatsapp-api/session/diagnostics is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:125 | POST /whatsapp-api/session/force-check is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:137 | POST /whatsapp-api/session/force-reconnect is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:154 | POST /whatsapp-api/session/repair-config is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:180 | POST /whatsapp-api/session/link is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:485 | POST /whatsapp-api/session/pause-agent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:493 | POST /whatsapp-api/session/reconcile is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:501 | GET /whatsapp-api/session/proofs is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:511 | POST /whatsapp-api/session/stream-token is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:531 | POST /whatsapp-api/session/action-turn is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:627 | GET /whatsapp-api/catalog/contacts is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:638 | GET /whatsapp-api/catalog/ranking is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:651 | POST /whatsapp-api/catalog/refresh is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:663 | POST /whatsapp-api/catalog/score is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:696 | POST /whatsapp-api/session/recreate-if-invalid is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:732 | GET /whatsapp-api/check/:phone is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:759 | GET /whatsapp-api/provider-status is not called by any frontend code |

### SLOW_ENDPOINT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | scripts/pulse/parsers/performance-response-time.ts:0 | GET /health/system is slow (median 1020ms) |

### SLOW_QUERY (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/permissions/admin-permissions.service.ts:86 | findMany without select or include — returns all columns from DB |
| WARNING | backend/src/admin/users/admin-users.service.ts:91 | findMany without select or include — returns all columns from DB |
| WARNING | backend/src/crm/crm.service.ts:480 | findMany without select or include — returns all columns from DB |
| WARNING | backend/src/payments/connect/connect-payout-approval.service.ts:439 | findMany without select or include — returns all columns from DB |
| WARNING | backend/src/payments/connect/connect.service.ts:181 | findMany without select or include — returns all columns from DB |
| WARNING | backend/src/platform-wallet/platform-wallet.service.ts:169 | findMany without select or include — returns all columns from DB |

### SSR_UNSAFE_ACCESS (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/components/PixelTracker.tsx:133 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/app/(main)/pricing/page.tsx:46 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/app/(main)/pricing/page.tsx:50 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:32 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:36 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/components/kloel/marketing/MarketingView.tsx:42 | \`document\` accessed at module scope — crashes during SSR |
| HIGH | frontend/src/components/kloel/marketing/MarketingView.tsx:46 | \`document\` accessed at module scope — crashes during SSR |

### STRINGIFY_CIRCULAR_RISK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/financial-alert.service.ts:70 | JSON.stringify() on request/socket object — circular reference risk |

### TEST_NO_ASSERTION (41)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/ai-brain/agent-assist.service.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/checkout/checkout-code.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-marketplace-pricing.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-order-pricing.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-order-support.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-public.controller.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-shipping-profile.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout.module.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout.service.public.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/mercado-pago-checkout-policy.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/mercado-pago-quality.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/mercado-pago-webhook-signature.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/cia/cia.service.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/cart-recovery.service.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/cart-recovery.service.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/diagnostics.controller.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/guards/kloel-security.guard.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/kloel-context-formatter.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/kloel-id.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/kloel.controller.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/marketing-skills/marketing-skill.context.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/marketing-skills/marketing-skill.router.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/mercado-pago-order.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:95 | Hardcoded sleep of 10000ms in test — use jest.useFakeTimers() or await event instead |
| WARNING | backend/src/kloel/sales.controller.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/smart-payment.service.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/thread-search.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/payments/fraud/fraud.engine.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/webhooks/payment-webhook.controller.latest-charge.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/webhooks/payment-webhook.controller.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/app/(checkout)/hooks/checkout-order-submit.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/app/(checkout)/hooks/useCheckoutExperienceAutomation.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/app/(checkout)/hooks/useCheckoutExperienceAutomation.test.tsx:50 | Hardcoded sleep of 1800ms in test — use jest.useFakeTimers() or await event instead |
| WARNING | frontend/src/app/(checkout)/hooks/useCheckoutSocialIdentity.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/dashboard/KloelChatComposer.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.view-models.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/search/conversation-search-utils.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/theme/theme-provider.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |

### TIMEOUT_NO_CLEANUP (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts:200 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:122 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:55 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:231 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:16 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:111 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterAfterPayTab.tsx:37 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:511 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:288 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:132 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |

### TIMEZONE_REPORT_MISMATCH (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-social-recovery.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/payments/ledger/connect-ledger-maturation.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/platform-wallet/platform-wallet-maturation.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |

### TOFIX_WITHOUT_PARSE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel-context-formatter.ts:215 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |

### TRANSACTION_NO_ISOLATION (23)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:39 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:200 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-plan-link.manager.ts:217 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout.service.ts:153 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout.service.ts:486 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/payment.service.ts:149 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/payment.service.ts:305 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/smart-payment.service.ts:406 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/wallet.service.ts:89 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/wallet.service.ts:180 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/wallet.service.ts:288 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:50 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:106 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:173 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:244 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:317 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/payments/ledger/ledger.service.ts:389 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/platform-wallet/platform-wallet-maturation.service.ts:88 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/platform-wallet/platform-wallet.service.ts:240 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/platform-wallet/platform-wallet.service.ts:254 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/platform-wallet/platform-wallet.service.ts:319 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/wallet/wallet.service.ts:98 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/wallet/wallet.service.ts:162 | $transaction in financial file without isolationLevel specified |

### UI_DEAD_HANDLER (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/canvas/CreateModal.tsx:677 | clickable "))}" has dead handler |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:1141 | form "form" has dead handler |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:679 | clickable "(sem texto)" has dead handler |

### UNBOUNDED_RESULT (32)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/admin/audit/admin-audit.service.ts:117 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/dashboard/admin-dashboard.service.ts:193 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/marketing/admin-marketing.service.ts:81 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/marketing/admin-marketing.service.ts:160 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/notifications/admin-notifications.service.ts:96 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/permissions/admin-permissions.service.ts:86 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/sessions/admin-sessions.service.ts:17 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/sessions/admin-sessions.service.ts:33 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/admin/users/admin-users.service.ts:91 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/checkout/checkout-social-recovery.service.ts:29 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/checkout/checkout.service.ts:258 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:149 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/compliance/compliance.service.ts:145 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/crm/crm.service.ts:480 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/dashboard/dashboard.service.ts:184 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:408 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:1353 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:2540 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:4968 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:5126 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:5489 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/launch/launch.service.ts:37 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/partnerships/partnerships.service.ts:43 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/payments/connect/connect-payout-approval.service.ts:439 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/payments/connect/connect.service.ts:181 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:128 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/platform-wallet/platform-wallet.service.ts:169 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:90 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:131 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:229 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:302 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:433 | findMany without take — may return all rows and cause OOM or slow response |

### UNRESOLVED_TODO (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/webhooks/payment-webhook.controller.spec.ts:326 | TODO comment left unresolved |

### VISUAL_CONTRACT_EMOJI_UI (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:256 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:297 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:525 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/canvas/CanvasEditor.tsx:1529 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:71 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:400 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:249 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:483 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:989 | Emoji found in product UI code, violating the restrained Kloel visual contract. |

### VISUAL_CONTRACT_GENERIC_SPINNER (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/flow/page.tsx:312 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:356 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:443 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:486 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:565 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/followups/page.tsx:400 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:175 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:241 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:323 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/leads/page.tsx:354 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:409 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:103 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:168 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/UniversalComposer.tsx:258 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/analytics-settings-section.tsx:121 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:354 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:369 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/test-kloel-modal.tsx:94 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:1713 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:401 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:497 | Generic spinner detected where the visual contract requires branded loading treatment. |

### VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS (390)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:66 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:64 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:119 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:120 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:154 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:121 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:164 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:54 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/StockCounter.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-tokens.ts:112 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:88 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:105 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:106 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:109 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:120 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:55 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:87 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:32 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:131 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:158 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:159 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:163 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:56 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:58 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:314 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:316 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:394 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:401 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:932 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:116 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:181 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/layout.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/layout.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:124 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:125 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:143 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:144 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:113 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:158 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:191 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:209 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:639 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:732 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/fale/page.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:285 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:321 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:471 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:507 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:539 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/page.tsx:163 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/recupere/page.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/ver-todas/page.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:179 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:180 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:181 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:182 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:294 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/followups/page.tsx:230 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:342 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:107 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/vendas/gestao-vendas/page.tsx:99 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:88 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:90 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:318 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:358 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:372 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:79 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:150 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/onboarding-chat/page.tsx:343 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/onboarding-chat/page.tsx:432 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/pay/[id]/page.tsx:147 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:461 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:89 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:190 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:255 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:56 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:93 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:185 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:186 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:187 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:188 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:190 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/layout.tsx:61 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/layout.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/loading.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:58 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:478 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:508 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:524 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:78 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:100 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:116 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:158 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:174 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:112 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:125 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:148 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:97 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:98 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:252 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:256 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:288 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:308 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:333 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:97 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:118 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:130 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/common/CookieBanner.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:246 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:247 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:248 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:249 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:250 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:40 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/icons/WhatsAppIcon.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:287 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:301 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:331 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:350 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:167 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:170 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:173 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:181 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:200 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:230 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:407 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:456 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:488 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:189 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:40 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/PulseLoader.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/UniversalComposer.tsx:239 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:105 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:130 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:131 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:281 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:159 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:172 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:185 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/auth-provider.tsx:114 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:257 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:263 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:269 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:275 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:420 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:422 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:423 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:427 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:428 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:539 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:540 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:541 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:542 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:810 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:626 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:61 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:359 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:397 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:781 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:912 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:963 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:635 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:490 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:502 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:625 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:680 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:811 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:72 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:75 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:5 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:6 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:7 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:15 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:246 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:253 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:260 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:267 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:274 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:199 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:280 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:301 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:153 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:154 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:582 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:651 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:54 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:760 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:776 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:789 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.helpers.ts:256 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:548 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:690 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:699 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:763 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/account-settings-section.tsx:143 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:87 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:89 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:93 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/billing-settings-section.tsx:238 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:696 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:926 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:32 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:138 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:140 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:142 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:144 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/crm-settings-section.tsx:665 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:90 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:92 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:93 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:150 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:161 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:116 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:125 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/realtime-usage-card.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/realtime-usage-card.tsx:41 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:384 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:413 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:417 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:663 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:791 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeProvider.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeToggle.tsx:110 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:138 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:145 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:148 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:151 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:143 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:90 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:240 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:394 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:332 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:411 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:617 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:269 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:75 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCheckoutsTab.tsx:188 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:86 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductPlansTab.tsx:358 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/hooks/useCheckoutEditor.ts:247 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:64 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:66 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/BackgroundManager.ts:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/ShapeManager.ts:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:140 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:150 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:40 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:41 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/kloel-design-tokens.ts:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:44 | Hardcoded hex color outside the approved visual token set. |

### WEBHOOK_STRIPE_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/health/system-health.controller.ts:12 | Backend unreachable — GET /health/system timed out or connection refused |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/payments/connect/connect-reversal.service.ts:0 — Financial operation without AuditLog write — cannot reconstruct transaction history
   Evidence: Every financial mutation must write an AuditLog entry with before/after state, amount, and actor
2. [BACKUP_MISSING] .backup-manifest.json:0 — No recent DB backup found — backup manifest missing or older than 24 h
   Evidence: Backup manifest exists but lastBackup timestamp is stale (>24 h) or missing
3. [BACKUP_MISSING] .backup-validation.log:0 — No backup restore-test validation log found — backup has never been verified
   Evidence: A restore test must be performed and logged; create .backup-validation.log with timestamp + result
4. [RACE_CONDITION_FINANCIAL] backend/src/billing/stripe.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
5. [RACE_CONDITION_DATA_CORRUPTION] backend/src/checkout/checkout-social-lead.service.ts:196 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 196 followed by update at line 238 without $transaction or version check
6. [RACE_CONDITION_DATA_CORRUPTION] backend/src/checkout/checkout-social-lead.service.ts:284 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 284 followed by update at line 316 without $transaction or version check
7. [RACE_CONDITION_DATA_CORRUPTION] backend/src/checkout/checkout-social-recovery.service.ts:78 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 78 followed by update at line 106 without $transaction or version check
8. [RACE_CONDITION_FINANCIAL] backend/src/payments/connect/connect-payout.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
9. [RACE_CONDITION_FINANCIAL] backend/src/payments/connect/connect-reversal.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
10. [RACE_CONDITION_FINANCIAL] backend/src/payments/connect/connect.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
11. [RACE_CONDITION_FINANCIAL] backend/src/payments/ledger/connect-ledger-maturation.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
12. [RACE_CONDITION_FINANCIAL] backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
13. [RACE_CONDITION_FINANCIAL] backend/src/payments/stripe/stripe-charge.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
14. [RACE_CONDITION_FINANCIAL] backend/src/platform-wallet/platform-payout.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
15. [RACE_CONDITION_FINANCIAL] backend/src/platform-wallet/platform-wallet-reconcile.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
16. [FINANCIAL_ERROR_SWALLOWED] backend/src/checkout/checkout-post-payment-effects.service.ts:109 — catch block in financial code only logs — error swallowed without throw
   Evidence: } catch (error) {
17. [FINANCIAL_ERROR_SWALLOWED] backend/src/checkout/checkout-post-payment-effects.service.ts:125 — catch block in financial code only logs — error swallowed without throw
   Evidence: } catch (error) {
18. [FINANCIAL_ERROR_SWALLOWED] backend/src/payments/connect/connect-payout-approval.service.ts:260 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
19. [FINANCIAL_ERROR_SWALLOWED] backend/src/payments/ledger/connect-ledger-maturation.service.ts:63 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
20. [FINANCIAL_ERROR_SWALLOWED] backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:101 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
21. [FINANCIAL_ERROR_SWALLOWED] backend/src/payments/ledger/connect-ledger-reconciliation.service.ts:324 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
22. [FINANCIAL_ERROR_SWALLOWED] backend/src/platform-wallet/platform-wallet-maturation.service.ts:123 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
23. [FINANCIAL_ERROR_SWALLOWED] backend/src/platform-wallet/platform-wallet-reconcile.service.ts:179 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error) {
24. [FINANCIAL_ERROR_SWALLOWED] worker/processors/checkout-social-lead-enrichment.ts:126 — catch block in financial code does not rethrow — caller unaware of failure
   Evidence: } catch (error: unknown) {
25. [FINANCIAL_NO_TRANSACTION] backend/src/platform-wallet/platform-wallet.service.ts:203 — Financial function has 3 Prisma mutations without $transaction
   Evidence: await client.platformWallet.upsert({
26. [FINANCIAL_NO_TRANSACTION] backend/src/platform-wallet/platform-wallet.service.ts:208 — Financial function has 3 Prisma mutations without $transaction
   Evidence: await client.platformWalletLedger.create({
27. [FINANCIAL_NO_TRANSACTION] backend/src/platform-wallet/platform-wallet.service.ts:229 — Financial function has 3 Prisma mutations without $transaction
   Evidence: await client.platformWallet.update({
28. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:449 — Financial function has 3 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutPayment.updateMany({
29. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:457 — Financial function has 2 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutOrder.updateMany({
30. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:462 — Financial function has 2 Prisma mutations without $transaction
   Evidence: .updateMany({
31. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:519 — Financial function has 3 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutPayment.updateMany({
32. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:527 — Financial function has 2 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutOrder.updateMany({
33. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:532 — Financial function has 2 Prisma mutations without $transaction
   Evidence: .updateMany({
34. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:722 — Financial function has 2 Prisma mutations without $transaction
   Evidence: .updateMany({
35. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:752 — Financial function has 2 Prisma mutations without $transaction
   Evidence: .updateMany({
36. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:778 — Financial function has 4 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutOrder.updateMany({
37. [FINANCIAL_NO_TRANSACTION] backend/src/webhooks/payment-webhook.controller.ts:786 — Financial function has 4 Prisma mutations without $transaction
   Evidence: await this.prisma.checkoutOrder.updateMany({
38. [WEBHOOK_STRIPE_BROKEN] backend/src/health/system-health.controller.ts:12 — Backend unreachable — GET /health/system timed out or connection refused
   Evidence: Backend URL: http://127.0.0.1:3001, error: fetch failed
39. [AUDIT_DELETION_NO_LOG] backend/src/admin/permissions/admin-permissions.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
40. [AUDIT_DELETION_NO_LOG] backend/src/kloel/kloel.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
41. [AUDIT_ADMIN_NO_LOG] backend/src/admin/accounts/admin-accounts.controller.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
42. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/providers/waha.provider.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
43. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/whatsapp-digits.util.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
44. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/whatsapp-normalization.util.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
45. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
46. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/StripePaymentElement.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
47. [NETWORK_OFFLINE_DATA_LOST] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
48. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(checkout)/hooks/useCheckoutSocialIdentity.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
49. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(checkout)/hooks/useStripeCheckout.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
50. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/reset-password/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
51. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/verify-email/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
52. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/callback/apple/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
53. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/facebook/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
54. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/magic-link/request/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
55. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/magic-link/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
56. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
57. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
58. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/pulse/live/heartbeat/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
59. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/PulseFrontendHeartbeat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
60. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/auth/auth-modal.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
61. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/landing/FloatingChat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
62. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterAvalTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
63. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterCampanhasTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
64. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
65. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
66. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCampaignsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
67. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/cookie-consent.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
68. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/kloel-api.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
69. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:97 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
70. [CACHE_REDIS_STALE] backend/src/common/ledger-reconciliation.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
71. [CACHE_REDIS_STALE] backend/src/payments/connect/connect-reversal.service.ts:177 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
72. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas/.github/workflows/ci-cd.yml:0 — CI workflow missing lint gate
   Evidence: .github/workflows/ci-cd.yml: No lint step found (npm run lint). Code quality not enforced in CI.
73. [RACE_CONDITION_OVERWRITE] backend/src/checkout/checkout-social-recovery.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
74. [RACE_CONDITION_OVERWRITE] backend/src/payments/ledger/ledger.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
75. [RACE_CONDITION_OVERWRITE] backend/src/platform-wallet/platform-wallet.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
76. [RACE_CONDITION_OVERWRITE] backend/src/wallet/wallet.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
77. [COST_LLM_NO_LIMIT] backend/src/admin/chat/chat-tool.registry.ts:4 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: * A tool exposed to the admin AI chat LLM. Tools are either — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
78. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:81 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: let transcription: OpenAI.Audio.Transcriptions.TranscriptionVerbose; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
79. [COST_LLM_NO_LIMIT] backend/src/kloel/canvas.controller.ts:198 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: async generateText(@Request() req: AuthenticatedRequest, @Body() dto: GenerateCanvasTextDto) { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
80. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:381 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Chat.ChatCompletion> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
81. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:400 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
82. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:425 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | null | undefined, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
83. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:443 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: initialToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
84. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.service.ts:1300 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: let response: OpenAI.Chat.ChatCompletion; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
85. [COST_LLM_NO_LIMIT] backend/src/admin/chat/admin-chat.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
86. [COST_LLM_NO_LIMIT] backend/src/admin/chat/admin-chat.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
87. [COST_LLM_NO_LIMIT] backend/src/admin/chat/dto/send-message.dto.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
88. [COST_LLM_NO_LIMIT] backend/src/inbox/inbox.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
89. [COST_LLM_NO_LIMIT] backend/src/webhooks/payment-webhook.controller.spec-helpers.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
90. [COST_LLM_NO_LIMIT] backend/src/whatsapp/cia-runtime.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
91. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
92. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/waha.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
93. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.service.sendmessage.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
94. [CRUD_BROKEN] backend/src/products:0 — CRUD CREATE — expected 200/201, got 0
   Evidence: {"error":"fetch failed"}
95. [DATA_PRODUCT_NO_PLAN] /Users/danielpenin/whatsapp_saas/backend/src/checkout/checkout-social-lead.service.ts:65 — Checkout/order creation without prior plan/product validation in checkout-social-lead.service.ts
   Evidence: Function 'captureLead' performs a write operation without a findFirst/findUnique guard. An order could be created for a non-existent or inactive plan.
96. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:263 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'requestWithdrawal' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
97. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/platform-wallet/platform-wallet.service.ts:118 — Financial write without existence check in platform-wallet.service.ts
   Evidence: Function 'readBalance' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
98. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/wallet/wallet.service.ts:51 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'createTopupIntent' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
99. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260406130000_add_checkout_links_and_kinds/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
100. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408190000_add_checkout_shipping_and_affiliate_config/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
101. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
102. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
103. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260414103000_sync_customer_subscription_and_order_alert_schema/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
104. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260414204000_add_checkout_social_identity/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
105. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260415120000_admin_identity_foundation/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
106. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260415200000_admin_destructive_intents/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
107. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260415210000_platform_wallet/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
108. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260415220000_admin_ai_chat/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
109. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260417220000_connect_ledger/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
110. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260417230000_prepaid_wallet/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
111. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260417240000_fraud_blacklist/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
112. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260419100000_compliance_module/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
113. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
114. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
115. [DTO_NO_VALIDATION] backend/src/admin/auth/dto/change-password.dto.ts:12 — DTO class 'ChangePasswordDto' has 1 properties but no class-validator decorators
   Evidence: Add @IsString, @IsNumber, @IsOptional, etc. from 'class-validator' to each property
116. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
117. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
118. [EDGE_CASE_STRING] backend/src/admin/accounts/dto/list-accounts.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
119. [EDGE_CASE_STRING] backend/src/admin/audit/dto/list-audit.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
120. [EDGE_CASE_STRING] backend/src/admin/audit/dto/list-audit.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
121. [EDGE_CASE_STRING] backend/src/admin/audit/dto/list-audit.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
122. [EDGE_CASE_STRING] backend/src/admin/audit/dto/list-audit.dto.ts:23 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
123. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:75 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: skip: skip ? Number(skip) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
124. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:76 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: take: take ? Number(take) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
125. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:136 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: skip: skip ? Number(skip) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
126. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:137 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: take: take ? Number(take) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
127. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:180 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: skip: skip ? Number(skip) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
128. [EDGE_CASE_PAGINATION] backend/src/admin/carteira/admin-carteira.controller.ts:181 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: take: take ? Number(take) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
129. [EDGE_CASE_STRING] backend/src/admin/clients/dto/list-clients.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
130. [EDGE_CASE_STRING] backend/src/admin/clients/dto/list-clients.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
131. [EDGE_CASE_PAGINATION] backend/src/admin/dashboard/admin-dashboard.service.ts:0 — findMany() in reporting context without take/skip — may return all records and exhaust memory
   Evidence: Add take: and skip: to all findMany() calls; provide pagination for large datasets
132. [EDGE_CASE_PAGINATION] backend/src/admin/dashboard/queries/breakdowns.query.ts:0 — findMany() in reporting context without take/skip — may return all records and exhaust memory
   Evidence: Add take: and skip: to all findMany() calls; provide pagination for large datasets
133. [EDGE_CASE_PAGINATION] backend/src/admin/dashboard/queries/producers.query.ts:0 — findMany() in reporting context without take/skip — may return all records and exhaust memory
   Evidence: Add take: and skip: to all findMany() calls; provide pagination for large datasets
134. [EDGE_CASE_STRING] backend/src/admin/products/dto/list-products.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
135. [EDGE_CASE_STRING] backend/src/admin/products/dto/list-products.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
136. [EDGE_CASE_STRING] backend/src/admin/support/dto/update-support-ticket-status.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
137. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
138. [EDGE_CASE_STRING] backend/src/auth/dto/whatsapp-auth.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
139. [EDGE_CASE_STRING] backend/src/auth/dto/whatsapp-auth.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
140. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:65 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
141. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:26 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
142. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:72 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
143. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:82 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
144. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:15 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
145. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:296 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
146. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:298 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
147. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:1160 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
148. [EDGE_CASE_STRING] backend/src/kyc/dto/kyc-document-type.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
149. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
150. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:21 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
151. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:23 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
152. [EDGE_CASE_PAGINATION] backend/src/payments/connect/connect.controller.ts:201 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: skip: skip ? Number(skip) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
153. [EDGE_CASE_PAGINATION] backend/src/payments/connect/connect.controller.ts:202 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: take: take ? Number(take) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
154. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
155. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
156. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
157. [EDGE_CASE_STRING] backend/src/team/dto/invite-member.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
158. [FINANCIAL_ERROR_SWALLOWED] backend/src/checkout/checkout-order-support.ts:294 — catch in financial code handles error without rethrow
   Evidence: } catch (error) {
159. [FINANCIAL_ERROR_SWALLOWED] backend/src/kloel/wallet.service.ts:511 — catch in financial code handles error without rethrow
   Evidence: } catch (err) {
160. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout-code.util.ts:3 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const A_Z0_9_RE = /[^A-Z0-9]/g;
161. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout-order-support.ts:6 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
162. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout-plan-link.manager.ts:11 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U0300__U036F_RE = /[\u0300-\u036f]/g;
163. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout-shipping-profile.util.ts:1 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
164. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout-social-lead.service.ts:17 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
165. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout.controller.ts:32 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U0300__U036F_RE = /[\u0300-\u036f]/g;
166. [DIVISION_BY_ZERO_RISK] backend/src/checkout/checkout.service.ts:32 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
167. [TOFIX_WITHOUT_PARSE] backend/src/kloel/kloel-context-formatter.ts:215 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: `  - média recente: ${averageRating.toFixed(1)}/5`,
168. [DIVISION_BY_ZERO_RISK] backend/src/kloel/kloel-stream-writer.ts:14 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U2028_U2029_RE = /[<>&\u2028\u2029]/g;
169. [DIVISION_BY_ZERO_RISK] backend/src/kloel/marketing-skills/marketing-skill.context.ts:126 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: socialLeadCount > 0 ? Number(((paidOrderCount / socialLeadCount) * 100).toFixed(2)) : null;
170. [DIVISION_BY_ZERO_RISK] backend/src/kloel/marketing-skills/marketing-skill.router.ts:5 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const DIACRITICS_RE = /[\u0300-\u036f]/g;
171. [DIVISION_BY_ZERO_RISK] backend/src/kloel/pdf-processor.service.ts:10 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9]/g;
172. [DIVISION_BY_ZERO_RISK] backend/src/kloel/product-sub-resources.controller.ts:30 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U0300__U036F_RE = /[\u0300-\u036f]/g;
173. [DIVISION_BY_ZERO_RISK] backend/src/kloel/site.controller.ts:20 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U0300__U036F_RE = /[\u0300-\u036f]/g;
174. [DIVISION_BY_ZERO_RISK] backend/src/kloel/thread-search.util.ts:1 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const U0300__U036F_RE = /[\u0300-\u036f]/g;
175. [DIVISION_BY_ZERO_RISK] backend/src/kloel/unified-agent.service.ts:118 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const JSON_RE = /```json/gi;
176. [DIVISION_BY_ZERO_RISK] backend/src/kloel/unified-agent.service.ts:120 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
177. [DIVISION_BY_ZERO_RISK] backend/src/webhooks/payment-webhook.controller.ts:47 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const D_RE = /\D/g;
178. [FINANCIAL_NO_RATE_LIMIT] backend/src/admin/transactions/admin-transactions.controller.ts:33 — Financial route has no @Throttle rate-limit decorator
   Evidence: @Get() — financial endpoints must have @Throttle()
179. [FINANCIAL_NO_RATE_LIMIT] backend/src/admin/transactions/admin-transactions.controller.ts:51 — Financial route has no @Throttle rate-limit decorator
   Evidence: @Post(':orderId/operate') — financial endpoints must have @Throttle()
180. [IDEMPOTENCY_MISSING] backend/src/admin/destructive/admin-destructive.controller.ts:48 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
181. [IDEMPOTENCY_MISSING] backend/src/admin/users/admin-users.controller.ts:41 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
182. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:563 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
183. [IDEMPOTENCY_MISSING] backend/src/app.module.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
184. [IDEMPOTENCY_MISSING] backend/src/campaigns/campaigns.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
185. [IDEMPOTENCY_MISSING] backend/src/kloel/canvas.controller.ts:85 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
186. [IDEMPOTENCY_MISSING] backend/src/kloel/smart-payment.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
187. [IDEMPOTENCY_MISSING] backend/src/kloel/wallet.controller.ts:124 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
188. [JSON_PARSE_UNSAFE] backend/src/admin/accounts/admin-accounts.service.ts:115 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonValue,
189. [JSON_PARSE_UNSAFE] backend/src/admin/config/admin-config.service.ts:192 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonValue,
190. [JSON_PARSE_UNSAFE] backend/src/admin/transactions/admin-transactions.service.ts:407 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: return JSON.parse(
191. [JSON_PARSE_UNSAFE] backend/src/checkout/checkout-payment.service.ts:61 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: return JSON.parse(
192. [JSON_PARSE_UNSAFE] backend/src/kloel/conversational-onboarding.service.ts:407 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const args = JSON.parse(toolCall.function.arguments);
193. [JSON_PARSE_UNSAFE] backend/src/kloel/conversational-onboarding.service.ts:435 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
194. [JSON_PARSE_UNSAFE] backend/src/webhooks/webhooks.service.ts:471 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const jsonPayload = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
195. [JSON_PARSE_UNSAFE] worker/processors/autopilot-processor.ts:741 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const parsed = JSON.parse(response.replace(JSON_FENCE_G_RE, '').replace(CODE_FENCE_RE, ''));
196. [JSON_PARSE_UNSAFE] worker/processors/autopilot-processor.ts:860 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const parsed = JSON.parse(raw) as {
197. [JSON_PARSE_UNSAFE] worker/processors/autopilot-processor.ts:2185 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: return JSON.parse(text);
198. [JSON_PARSE_UNSAFE] worker/processors/autopilot-processor.ts:2192 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: return JSON.parse(match[0]);
199. [JSON_PARSE_UNSAFE] worker/providers/commercial-intelligence.ts:635 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
200. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
201. [SSR_UNSAFE_ACCESS] frontend/src/app/(checkout)/components/PixelTracker.tsx:133 — `document` accessed at module scope — crashes during SSR
   Evidence: document.head.appendChild(s);
202. [SSR_UNSAFE_ACCESS] frontend/src/app/(main)/pricing/page.tsx:46 — `document` accessed at module scope — crashes during SSR
   Evidence: const link = document.createElement('a');
203. [SSR_UNSAFE_ACCESS] frontend/src/app/(main)/pricing/page.tsx:50 — `document` accessed at module scope — crashes during SSR
   Evidence: document.body.appendChild(link);
204. [SSR_UNSAFE_ACCESS] frontend/src/components/kloel/auth/kloel-auth-screen.tsx:32 — `document` accessed at module scope — crashes during SSR
   Evidence: const link = document.createElement('a');
205. [SSR_UNSAFE_ACCESS] frontend/src/components/kloel/auth/kloel-auth-screen.tsx:36 — `document` accessed at module scope — crashes during SSR
   Evidence: document.body.appendChild(link);
206. [SSR_UNSAFE_ACCESS] frontend/src/components/kloel/marketing/MarketingView.tsx:42 — `document` accessed at module scope — crashes during SSR
   Evidence: const link = document.createElement('a');
207. [SSR_UNSAFE_ACCESS] frontend/src/components/kloel/marketing/MarketingView.tsx:46 — `document` accessed at module scope — crashes during SSR
   Evidence: document.body.appendChild(link);
208. [OBSERVABILITY_NO_TRACING] backend/src/audio/transcription.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
209. [OBSERVABILITY_NO_TRACING] backend/src/auth/auth.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
210. [OBSERVABILITY_NO_TRACING] backend/src/auth/email.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
211. [OBSERVABILITY_NO_TRACING] backend/src/auth/facebook-auth.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
212. [OBSERVABILITY_NO_TRACING] backend/src/auth/google-auth.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
213. [OBSERVABILITY_NO_TRACING] backend/src/billing/billing.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
214. [OBSERVABILITY_NO_TRACING] backend/src/checkout/facebook-capi.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
215. [OBSERVABILITY_NO_TRACING] backend/src/common/storage/storage.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
216. [OBSERVABILITY_NO_TRACING] backend/src/compliance/utils/jwt-set.validator.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
217. [OBSERVABILITY_NO_TRACING] backend/src/crm/crm.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
218. [OBSERVABILITY_NO_TRACING] backend/src/health/system-health.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
219. [OBSERVABILITY_NO_TRACING] backend/src/kloel/audio.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
220. [OBSERVABILITY_NO_TRACING] backend/src/kloel/email-campaign.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
221. [OBSERVABILITY_NO_TRACING] backend/src/kloel/kloel.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
222. [OBSERVABILITY_NO_TRACING] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
223. [OBSERVABILITY_NO_TRACING] backend/src/kloel/site.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
224. [OBSERVABILITY_NO_TRACING] backend/src/marketing/marketing.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
225. [OBSERVABILITY_NO_TRACING] backend/src/media/media.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
226. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-auth.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
227. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-sdk.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
228. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/payment-webhook.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
229. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/webhooks.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
230. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/providers/waha.provider.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
231. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/whatsapp-watchdog.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
232. [OBSERVABILITY_NO_ALERTING] backend/src/billing/payment-method.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
233. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-order-support.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
234. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-post-payment-effects.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
235. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
236. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/facebook-capi.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
237. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
238. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
239. [OBSERVABILITY_NO_ALERTING] backend/src/payments/connect/connect-payout-approval.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
240. [OBSERVABILITY_NO_ALERTING] backend/src/payments/connect/connect.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
241. [OBSERVABILITY_NO_ALERTING] backend/src/payments/connect/connect.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
242. [OBSERVABILITY_NO_ALERTING] backend/src/payments/stripe/stripe-webhook.processor.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
243. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-social-recovery.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
244. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
245. [TIMEZONE_REPORT_MISMATCH] backend/src/payments/ledger/connect-ledger-maturation.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
246. [TIMEZONE_REPORT_MISMATCH] backend/src/platform-wallet/platform-wallet-maturation.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
247. [TRANSACTION_NO_ISOLATION] backend/src/billing/payment-method.service.ts:39 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
248. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:200 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
249. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-plan-link.manager.ts:217 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
250. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:153 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
251. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:486 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
252. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:428 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
253. [FINDMANY_NO_PAGINATION] backend/src/kloel/kloel.service.ts:1353 — findMany() on ChatMessage without pagination (take/cursor) — unbounded query
   Evidence: const rows = await this.prisma.chatMessage.findMany({
254. [FINDMANY_NO_PAGINATION] backend/src/kloel/kloel.service.ts:2540 — findMany() on ChatMessage without pagination (take/cursor) — unbounded query
   Evidence: const rows = await this.prisma.chatMessage.findMany({
255. [FINDMANY_NO_PAGINATION] backend/src/kloel/kloel.service.ts:4968 — findMany() on ChatMessage without pagination (take/cursor) — unbounded query
   Evidence: const messages = await this.prisma.chatMessage.findMany({
256. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:149 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
257. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:305 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
258. [TRANSACTION_NO_ISOLATION] backend/src/kloel/smart-payment.service.ts:406 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
259. [TRANSACTION_NO_ISOLATION] backend/src/kloel/wallet.service.ts:89 — $transaction in financial file without isolationLevel specified
   Evidence: const transaction = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
260. [TRANSACTION_NO_ISOLATION] backend/src/kloel/wallet.service.ts:180 — $transaction in financial file without isolationLevel specified
   Evidence: const outcome = await this.prisma.$transaction(
261. [TRANSACTION_NO_ISOLATION] backend/src/kloel/wallet.service.ts:288 — $transaction in financial file without isolationLevel specified
   Evidence: transaction = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
262. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:50 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
263. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:106 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
264. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:173 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
265. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:244 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
266. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:317 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
267. [TRANSACTION_NO_ISOLATION] backend/src/payments/ledger/ledger.service.ts:389 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
268. [TRANSACTION_NO_ISOLATION] backend/src/platform-wallet/platform-wallet-maturation.service.ts:88 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
269. [TRANSACTION_NO_ISOLATION] backend/src/platform-wallet/platform-wallet.service.ts:240 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (inner) => runOnce(inner));
270. [TRANSACTION_NO_ISOLATION] backend/src/platform-wallet/platform-wallet.service.ts:254 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
271. [TRANSACTION_NO_ISOLATION] backend/src/platform-wallet/platform-wallet.service.ts:319 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
272. [TRANSACTION_NO_ISOLATION] backend/src/wallet/wallet.service.ts:98 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
273. [TRANSACTION_NO_ISOLATION] backend/src/wallet/wallet.service.ts:162 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
274. [QUEUE_NO_PROCESSOR] backend/src/autopilot/autopilot.service.ts:1726 — Queue job 'process-campaign' is produced but has no worker processor
   Evidence: No 'case "process-campaign":' or 'job.name === "process-campaign"' found in worker — jobs will silently pile up
275. [QUEUE_NO_PROCESSOR] backend/src/webhooks/webhook-dispatcher.service.ts:40 — Queue job 'send-webhook' is produced but has no worker processor
   Evidence: No 'case "send-webhook":' or 'job.name === "send-webhook"' found in worker — jobs will silently pile up
276. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:308 — Queue job 'analyze-contact' is produced but has no worker processor
   Evidence: No 'case "analyze-contact":' or 'job.name === "analyze-contact"' found in worker — jobs will silently pile up
277. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:988 — Queue job 'extract-facts' is produced but has no worker processor
   Evidence: No 'case "extract-facts":' or 'job.name === "extract-facts"' found in worker — jobs will silently pile up
278. [QUEUE_NO_PROCESSOR] worker/providers/campaigns.ts:23 — Queue job 'process-campaign-action' is produced but has no worker processor
   Evidence: No 'case "process-campaign-action":' or 'job.name === "process-campaign-action"' found in worker — jobs will silently pile up
279. [QUEUE_NO_PROCESSOR] worker/voice-processor.ts:196 — Queue job 'process-message' is produced but has no worker processor
   Evidence: No 'case "process-message":' or 'job.name === "process-message"' found in worker — jobs will silently pile up
280. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:256 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📦) from product-facing UI and use text or SVG iconography instead.
281. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/app/(checkout)/components/CheckoutNoir.tsx:297 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📦) from product-facing UI and use text or SVG iconography instead.
282. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:525 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (©) from product-facing UI and use text or SVG iconography instead.
283. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:312 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
284. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:356 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
285. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:443 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
286. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:486 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
287. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:565 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
288. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/followups/page.tsx:400 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
289. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:175 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
290. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:241 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
291. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:323 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
292. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/leads/page.tsx:354 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
293. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(public)/onboarding-chat/page.tsx:409 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
294. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/canvas/CanvasEditor.tsx:1529 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↔) from product-facing UI and use text or SVG iconography instead.
295. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:103 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
296. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:168 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
297. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/UniversalComposer.tsx:258 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
298. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:71 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
299. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:400 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
300. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:249 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📱) from product-facing UI and use text or SVG iconography instead.
301. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:483 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📎) from product-facing UI and use text or SVG iconography instead.
302. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:989 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (🍄) from product-facing UI and use text or SVG iconography instead.
303. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/analytics-settings-section.tsx:121 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
304. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:354 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
305. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:369 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
306. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/test-kloel-modal.tsx:94 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
307. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/plans/PlanAIConfigTab.tsx:1713 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
308. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductGeneralTab.tsx:401 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
309. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductPlansTab.tsx:497 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
```