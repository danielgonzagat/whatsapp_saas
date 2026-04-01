# PULSE REPORT — 2026-04-01T21:47:30.089Z

## Certification Status: PARTIAL

- Score: 48/100 (raw scan: 49/100)
- Environment: deep
- Commit: 3ef9bf83462bd90645bc2cac8e3c5d56077a2aa9
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Codebase Truth

- Frontend pages discovered: 95
- User-facing pages: 93
- Raw modules discovered: 32
- Raw mutation flow candidates: 137

## Resolved Manifest

- Resolved modules: 32/32
- Resolved flow groups: 43/43
- Grouped semantic flow groups: 35
- Shared capability groups: 15
- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0

## Health Score: 48/100
`██████████░░░░░░░░░░` 48%

## Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 32 module(s), 43 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 645 critical/high blocking finding(s). |
| runtimePass | FAIL | product_failure | Runtime probes are failing: auth-session. |
| browserPass | PASS | — | Browser certification is not required in this environment. |
| flowPass | FAIL | product_failure | Critical flows are failing: checkout-payment, wallet-withdrawal. |
| invariantPass | FAIL | product_failure | Invariant checks are failing: financial-audit-trail, payment-idempotency, wallet-balance-consistency. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: LGPD_NON_COMPLIANT. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, DEPLOY_NO_ROLLBACK, DR_BACKUP_INCOMPLETE, DR_RPO_TOO_HIGH, MIGRATION_NO_ROLLBACK. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_DELETION_NO_LOG, AUDIT_FINANCIAL_NO_TRAIL, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING. |
| customerPass | FAIL | product_failure | customer synthetic scenarios are failing: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox. |
| operatorPass | FAIL | product_failure | operator synthetic scenarios are failing: operator-campaigns-and-flows, operator-autopilot-run. |
| adminPass | FAIL | product_failure | admin synthetic scenarios are failing: admin-settings-kyc-banking, admin-whatsapp-session-control. |
| soakPass | FAIL | product_failure | soak synthetic scenarios are failing: operator-campaigns-and-flows, operator-autopilot-run, system-payment-reconciliation. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 93/93 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | All certification artifacts in this run are fresh. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: GLOBAL
- Blocking tier: 0

| Tier | Name | Status | Blocking Gates | Reason |
|------|------|--------|----------------|--------|
| 0 | Truth + Runtime Baseline | FAIL | runtimePass | blocking gates: runtimePass |
| 1 | Customer Truth | FAIL | flowPass, customerPass | blocking gates: flowPass, customerPass |
| 2 | Operator + Admin Replacement | FAIL | operatorPass, adminPass | blocking gates: operatorPass, adminPass |
| 3 | Production Reliability | FAIL | invariantPass, securityPass, recoveryPass, observabilityPass | blocking gates: invariantPass, securityPass, recoveryPass, observabilityPass |
| 4 | Final Human Replacement | FAIL | soakPass | blocking gates: soakPass; pending critical scenarios: operator-autopilot-run; critical async expectations still pending in world state |

## Evidence Summary

- Runtime: Runtime probes failed: auth-session failed.
- Browser: Browser certification is not required in this environment.
- Flows: Flow evidence summary: 2 passed, 1 failed, 0 accepted, 1 missing evidence.
- Invariants: Invariant evidence summary: 1 passed, 3 failed, 0 accepted, 0 missing evidence.
- Observability: Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Recovery: Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Customer: customer scenarios: 1 passed, 3 failed/checker-gap, 0 missing evidence.
- Operator: operator scenarios: 7 passed, 1 failed/checker-gap, 1 missing evidence.
- Admin: admin scenarios: 1 passed, 2 failed/checker-gap, 0 missing evidence.
- Soak: soak scenarios: 0 passed, 2 failed/checker-gap, 1 missing evidence.
- Synthetic Coverage: Synthetic coverage maps 93/93 non-ops page(s) to declared scenarios.
- Truth: Resolved manifest is aligned: 32 module(s), 43 flow group(s), no blocking drift.

## Human Replacement

- Status: NOT_READY
- Final target: GLOBAL
- Covered pages: 93/93
- Uncovered pages: 0
- Accepted critical flows remaining: 0
- Pending critical scenarios: 1
- Customer scenarios: 1/4 passed
- Operator scenarios: 7/9 passed
- Admin scenarios: 1/3 passed
- Soak scenarios: 0/3 passed

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

- truth | executed=true | Resolved manifest built from 95 page(s), 32 module(s), 43 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 645 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=645, totalBreaks=991

### runtimePass

- runtime | executed=true | Runtime probes failed: auth-session failed.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: executedChecks=2, blockingBreakTypes=0
- runtime | executed=true | Backend health probe reached /health/system with status 404.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=backend-health, required=true, status=404, latencyMs=267, traceHeaderDetected=false
- runtime | executed=false | Auth probe failed: Auth failed. Login: 404 {"status":"error","code":404,"message":"Application not found","request_id":"SEhDytSfQ2KxXIbZnpoFkQ". Register: 404 {"status":"error","code":404,"message":"Application not fo...
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=auth-session, required=true, status=failed, latencyMs=524
- runtime | executed=true | Frontend responded with HTTP 200.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=frontend-reachability, required=false, status=200, latencyMs=74
- runtime | executed=false | Database probe failed: pg package not installed. Run: npm install pg
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: probeId=db-connectivity, required=false, status=missing_evidence, latencyMs=1

### browserPass

- browser | executed=false | Browser certification is not required in this environment.
- Artifacts: (none) | Metrics: attempted=false, failureCode=ok, totalPages=0, totalTested=0, passRate=0, blockingInteractions=0

### flowPass

- flow | executed=true | auth-login passed its declared oracle (auth-session) in deep mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_auth-login.json | Metrics: flowId=auth-login, status=passed, accepted=false
- flow | executed=true | product-create passed its declared oracle (entity-persisted) in deep mode.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_product-create.json | Metrics: flowId=product-create, status=passed, accepted=false
- flow | executed=true | Blocking findings for checkout-payment: ORDERING_WEBHOOK_OOO.
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_checkout-payment.json | Metrics: flowId=checkout-payment, status=failed, accepted=false
- flow | executed=false | wallet-withdrawal could not authenticate or reach runtime prerequisites: Auth failed. Login: 404 {"status":"error","code":404,"message":"Application not found","request_id":"0QLSdakjQG-xJyTcn6XIxQ". Register: 404 {"status":"error","code":404,"message":"Application not found","request_id":"UEmNcJcxSVCNnOQ49I3ezw".
- Artifacts: PULSE_FLOW_EVIDENCE.json, PULSE_FLOW_wallet-withdrawal.json | Metrics: flowId=wallet-withdrawal, status=missing_evidence, accepted=false

### invariantPass

- invariant | executed=true | workspace-isolation passed via evaluator workspace-isolation.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=workspace-isolation, status=passed, accepted=false
- invariant | executed=true | Blocking findings for financial-audit-trail: AUDIT_FINANCIAL_NO_TRAIL, AUDIT_DELETION_NO_LOG.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=financial-audit-trail, status=failed, accepted=false
- invariant | executed=true | Blocking findings for payment-idempotency: IDEMPOTENCY_FINANCIAL, IDEMPOTENCY_MISSING, IDEMPOTENCY_JOB, ORDERING_WEBHOOK_OOO.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=payment-idempotency, status=failed, accepted=false
- invariant | executed=true | Blocking findings for wallet-balance-consistency: RACE_CONDITION_FINANCIAL, STATE_PAYMENT_INVALID.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=wallet-balance-consistency, status=failed, accepted=false

### recoveryPass

- artifact | executed=true | Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Artifacts: PULSE_RECOVERY_EVIDENCE.json | Metrics: backupManifestPresent=true, backupPolicyPresent=true, backupValidationPresent=true, restoreRunbookPresent=true, disasterRecoveryRunbookPresent=true, disasterRecoveryTestPresent=true, seedScriptPresent=true

### observabilityPass

- artifact | executed=true | Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Artifacts: PULSE_OBSERVABILITY_EVIDENCE.json | Metrics: tracingHeadersDetected=false, requestIdMiddlewareDetected=true, structuredLoggingDetected=true, sentryDetected=true, alertingIntegrationDetected=true, healthEndpointsDetected=true, auditTrailDetected=true

### customerPass

- actor | executed=false | Scenario customer-auth-shell is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-auth-shell, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario customer-product-and-checkout is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-product-and-checkout, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario customer-whatsapp-and-inbox is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-whatsapp-and-inbox, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario customer-onboarding-public-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=customer-onboarding-public-map, actorKind=customer, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0

### operatorPass

- actor | executed=false | Scenario operator-campaigns-and-flows is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run is declared but no synthetic actor run was requested for it in this invocation.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-ads-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-ads-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-canvas-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-canvas-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-tools-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-tools-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-sites-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-sites-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-partnerships-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-partnerships-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-sales-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-sales-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario operator-media-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_OPERATOR_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=operator-media-surface-map, actorKind=operator, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0

### adminPass

- actor | executed=false | Scenario admin-settings-kyc-banking is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-settings-kyc-banking, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario admin-whatsapp-session-control is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-whatsapp-session-control, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario admin-ops-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=admin-ops-surface-map, actorKind=admin, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0

### soakPass

- actor | executed=false | Scenario operator-campaigns-and-flows is blocked by runtime probe failures: auth-session.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=failed, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run is declared but no synthetic actor run was requested for it in this invocation.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario system-payment-reconciliation is blocked by flow failures: checkout-payment, wallet-withdrawal.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=system-payment-reconciliation, actorKind=system, critical=true, requested=false, runner=derived, status=failed, specsExecuted=0, durationMs=0

### syntheticCoveragePass

- coverage | executed=true | Synthetic coverage maps 93/93 non-ops page(s) to declared scenarios.
- Artifacts: PULSE_SCENARIO_COVERAGE.json | Metrics: totalPages=95, userFacingPages=93, coveredPages=93, uncoveredPages=0

### evidenceFresh

- artifact | executed=true | Certification artifacts were generated in the current run.
- Artifacts: PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 973 | 1 dead handlers |
| API Calls | 618 | 0 no backend |
| Backend Routes | 619 | 0 empty |
| Prisma Models | 107 | 0 orphaned |
| Facades | 3 | 3 critical, 0 warning |
| Proxy Routes | 48 | 0 no upstream |
| Security | - | 0 issues |
| Data Safety | - | 2 issues |
| Quality | - | 977 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (991 total)

### ACCESSIBILITY_VIOLATION (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1026 | <input> without associated label or aria-label |

### AUDIT_DELETION_NO_LOG (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/analytics/advanced-analytics.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/auth/auth.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/guest-chat.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/kloel/memory.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/whatsapp/agent-events.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |
| HIGH | backend/src/whatsapp/cia-runtime.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |

### AUDIT_FINANCIAL_NO_TRAIL (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | AuditLog written outside $transaction — audit record may exist for a rolled-back operation |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | AuditLog written outside $transaction — audit record may exist for a rolled-back operation |
| CRITICAL | backend/src/kloel/smart-payment.service.ts:0 | AuditLog written outside $transaction — audit record may exist for a rolled-back operation |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:0 | AuditLog written outside $transaction — audit record may exist for a rolled-back operation |
| CRITICAL | backend/src/audit/audit.interceptor.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |
| CRITICAL | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Potentially sensitive fields (password/token/CPF) may be logged in AuditLog |

### BACKUP_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No recent DB backup found — backup manifest missing or older than 24 h |

### BROWSER_INCOMPATIBLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:594 | CSS feature with limited browser support used without @supports fallback |
| WARNING | frontend/src/app/(checkout)/layout.tsx:0 | Root layout missing viewport meta tag — mobile users see desktop-scaled view |

### BRUTE_FORCE_VULNERABLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src (POST /auth/login):0 | No rate limiting on POST /auth/login — brute-force attack is possible |
| CRITICAL | backend/src (POST /auth/login):0 | Unexpected success responses during brute-force simulation on POST /auth/login |

### CACHE_REDIS_STALE (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/advanced-analytics.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/autopilot/autopilot.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/billing/payment-method.service.ts:86 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/inbox/smart-routing.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/guest-chat.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/meta/meta-whatsapp.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |
| HIGH | backend/src/whatsapp/agent-events.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |

### CACHE_STALE_AFTER_WRITE (52)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/hooks/useCheckout.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/canvas/inicio/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/inbox/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/products/new/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(main)/whatsapp/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/anonymous/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/check-email/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/google/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/login/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/refresh/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/register/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/api/auth/whatsapp/verify/route.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/canvas/CanvasEditor.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/checkout/KloelChatBubble.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/anuncios/AnunciosView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/chat-container.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/conta/ContaView.tsx:1839 | SWR cache key is not scoped to workspace — cross-tenant cache leakage risk |
| HIGH | frontend/src/components/kloel/dashboard/KloelDashboard.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/home/HomeScreen.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/landing/FloatingChat.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/marketing/MarketingView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/produtos/ProdutosView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/sites/SitesView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/kloel/vendas/VendasView.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanAffiliateTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanPaymentTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanPaymentTab.tsx:0 | Financial write without any cache invalidation strategy — user may see wrong balance |
| HIGH | frontend/src/components/plans/PlanShippingTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanStoreTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/plans/PlanThankYouTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/CheckoutConfigPage.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductAfterPayTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCommissionsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductCouponsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductIATab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductReviewsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/components/products/ProductUrlsTab.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useCanvasAI.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/hooks/useConversationHistory.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/anonymous-session.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/core.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/api/kloel-api.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/lib/media-upload.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CICD_INCOMPLETE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas:0 | No deployment configuration found |

### CLOCK_SKEW_TOO_STRICT (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:8 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:30 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COST_LLM_NO_LIMIT (105)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/agent-assist.service.ts:23 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:61 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:87 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/agent-assist.service.ts:117 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/hidden-data.service.ts:30 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/media-factory.service.ts:21 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/media-factory.service.ts:49 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/ai-brain/vector.service.ts:24 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/audio.controller.ts:37 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/transcription.service.ts:70 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/audio/transcription.service.ts:97 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:854 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:1866 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/autopilot/autopilot.service.ts:2055 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/campaigns/campaigns.service.ts:354 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/copilot/copilot.service.ts:78 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/copilot/copilot.service.ts:174 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/crm/neuro-crm.service.ts:150 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/crm/neuro-crm.service.ts:206 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/flows/flow-optimizer.service.ts:51 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/i18n/i18n.service.ts:214 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/i18n/i18n.service.ts:287 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:44 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:56 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:143 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/audio.service.ts:167 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/canvas.controller.ts:170 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/canvas.controller.ts:184 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:19 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:356 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:358 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:408 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:410 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/guest-chat.service.ts:141 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1137 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1138 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1139 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1237 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1240 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/kloel.service.ts:1249 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/memory.service.ts:43 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:127 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:130 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:133 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:143 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:145 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:154 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:189 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:193 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:221 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:222 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/openai-wrapper.ts:238 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/pdf-processor.service.ts:56 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/site.controller.ts:72 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/site.controller.ts:103 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/smart-payment.service.ts:93 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/smart-payment.service.ts:291 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/kloel/unified-agent.service.ts:3376 | LLM API call without per-workspace token budget check — runaway costs possible |
| HIGH | backend/src/:0 | No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget |
| HIGH | backend/src/analytics/smart-time/smart-time.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/autopilot/autopilot.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/billing/billing.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/billing/plan-limits.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/cia/cia.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/flows/flows.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/inbox/inbox.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/asaas.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/kloel.autonomy-proof.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/kloel.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/middleware/audit-log.middleware.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/unified-agent.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/kloel/unified-agent.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/lib/env.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/mass-send/mass-send.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/mass-send/mass-send.worker.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/instagram/instagram.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/instagram/instagram.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/messenger/messenger.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/messenger/messenger.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/meta/meta-whatsapp.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/notifications/notifications.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/partnerships/partnerships.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/public-api/public-api.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/cia-runtime.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/cia-runtime.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/inbound-processor.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/inbound-processor.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/provider-registry.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/provider-registry.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/whatsapp-api.provider.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp-catchup.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.controller.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.service.spec.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/whatsapp.service.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |

### COST_NO_TRACKING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/:0 | LLM API calls made without recording token usage per workspace — cannot bill or limit costs |
| HIGH | backend/src/:0 | No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit |

### COST_STORAGE_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | File uploads accepted without per-workspace storage quota check |

### COVERAGE_CORE_LOW (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/coverage/coverage-summary.json:0 | Backend coverage report not found — run jest --coverage to generate |

### DEPENDENCY_VULNERABLE (10)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | worker/package.json:0 | CRITICAL vulnerability in basic-ftp [transitive] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in @types/expr-eval [DIRECT DEPENDENCY] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in axios [DIRECT DEPENDENCY] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in expr-eval [DIRECT DEPENDENCY] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in minimatch [transitive] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in nodemailer [DIRECT DEPENDENCY] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in picomatch [transitive] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in rollup [transitive] (worker) |
| HIGH | worker/package.json:0 | HIGH vulnerability in undici [transitive] (worker) |
| HIGH | .github/dependabot.yml:0 | No automated dependency update tool configured (Dependabot or Renovate) |

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

### DR_BACKUP_INCOMPLETE (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | POSTGRES backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | REDIS backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | S3 backup not configured — data store at risk of permanent loss |
| CRITICAL | .backup-manifest.json:0 | SECRETS backup not configured — data store at risk of permanent loss |

### DR_RPO_TOO_HIGH (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | Backup frequency not configured — RPO (Recovery Point Objective) is undefined |

### E2E_FLOW_NOT_TESTED (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | e2e:0 | No E2E test found for "Product creation" flow |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

### EDGE_CASE_ARRAY (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:25 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/create-order.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
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
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:90 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:22 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

### EDGE_CASE_DATE (271)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/analytics/analytics.controller.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.controller.ts:20 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:11 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:213 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:440 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:39 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/api-keys/api-keys.service.ts:66 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:28 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:60 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:219 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:309 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:473 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:510 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:528 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:538 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:551 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:594 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:641 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1206 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1212 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1221 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1227 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1263 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1267 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1685 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1732 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1786 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1817 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1895 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2118 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2148 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:362 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:443 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:456 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:487 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:64 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:65 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:125 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:183 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:482 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:491 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:498 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:729 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:811 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:208 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:215 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:44 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:45 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:57 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:58 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:299 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/campaigns/campaigns.service.ts:99 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:105 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:181 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-public.controller.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:172 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:413 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:423 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:755 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:156 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/crm.service.ts:470 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/neuro-crm.service.ts:457 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:69 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:419 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:421 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:484 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/flows/flows.service.ts:512 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:155 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:183 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/followup/followup.service.ts:205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:33 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/money-machine.service.ts:87 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/growth/smart-time.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:33 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/i18n/i18n.service.ts:332 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/inbox/inbox.service.ts:146 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:53 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:100 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:354 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:446 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:533 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:635 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:73 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:578 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:579 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:57 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:103 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:183 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:312 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:330 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/diagnostics.controller.ts:345 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guards/kloel-security.guard.ts:231 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:84 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:277 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:278 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:617 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:659 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:696 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:800 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:858 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1672 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1778 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:162 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:187 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:402 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:455 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:92 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:240 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:164 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:501 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:1473 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:123 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:126 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:223 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:315 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:364 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:464 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:480 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1541 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1952 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2084 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2986 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3004 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3447 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3501 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3525 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3638 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3652 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3657 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3660 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3663 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3666 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3669 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3758 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3791 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3932 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4252 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4319 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4320 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4339 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:5071 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:210 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:211 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:212 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:240 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:272 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:59 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:81 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.controller.ts:97 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.service.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:52 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:372 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:400 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:424 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/logging/structured-logger.ts:21 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/marketing/marketing.controller.ts:121 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:434 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:487 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:274 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:366 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:116 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:523 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:208 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:240 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:248 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:355 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:356 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:396 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:216 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:15 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:354 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:79 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:118 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/asaas-webhook.controller.ts:168 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:161 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:343 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:781 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:794 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:205 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:219 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:409 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.service.ts:416 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:167 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:471 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:554 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:637 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:659 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:890 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:891 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1006 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1024 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1095 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1483 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1494 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1522 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/account-agent.service.ts:1530 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/agent-events.service.ts:126 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:368 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:410 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:520 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:529 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:812 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2236 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2289 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2312 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2349 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2424 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:98 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:299 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:312 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:369 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:387 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:771 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:301 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:97 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:103 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:266 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:77 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:544 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:616 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:619 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:759 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1349 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1362 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1395 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1430 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1453 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1535 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:161 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:542 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:657 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:667 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:792 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:816 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:921 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:974 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:598 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:660 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:729 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1590 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2134 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2434 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:104 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:107 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:23 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/audio.controller.ts:39 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:59 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:69 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:16 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:50 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:88 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:90 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/upload.controller.ts:157 | File upload without size limit — large files may exhaust memory or storage |
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
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:19 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:20 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:21 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:22 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:25 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:26 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:27 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:28 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:29 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:31 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:34 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:13 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:14 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:16 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
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
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:16 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:17 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:24 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:25 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:55 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:56 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:57 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:99 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:108 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:109 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:114 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:115 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/partnerships/dto/create-affiliate.dto.ts:18 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |
| HIGH | backend/src/pipeline/dto/create-deal.dto.ts:6 | @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation |

### EDGE_CASE_PAGINATION (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/audit/audit.controller.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/autopilot/segmentation.controller.ts:50 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:359 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/checkout/checkout.controller.ts:360 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/flows/flows.controller.ts:257 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/leads.controller.ts:18 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/memory.controller.ts:104 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:225 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:227 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:990 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/wallet.controller.ts:121 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/meta/instagram/instagram.controller.ts:82 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:39 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/ops/ops.controller.ts:55 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (208)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/auth/dto/register.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:8 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:12 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/campaigns/dto/create-campaign.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:5 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:6 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-bump.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-coupon.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:17 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:18 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:24 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:30 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:35 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:37 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:38 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:39 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:40 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:41 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-order.dto.ts:42 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-pixel.dto.ts:16 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:10 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:11 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/checkout/dto/create-plan.dto.ts:19 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
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
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:14 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:15 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:23 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:34 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:35 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:36 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:42 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:43 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:44 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:54 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:58 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:62 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:70 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:71 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:72 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:73 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:77 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:78 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:79 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:80 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:88 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:89 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:98 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:100 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:110 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kloel/dto/product-sub-resources.dto.ts:116 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
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

### EMPTY_CATCH (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/common/idempotency.guard.ts:75 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.interceptor.ts:37 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/asaas.service.ts:109 | Environment variable ASAAS_API_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:115 | Environment variable ASAAS_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:104 | Environment variable META_ACCESS_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:108 | Environment variable META_PHONE_NUMBER_ID is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:112 | Environment variable META_WABA_ID is referenced but not documented in .env.example |

### FACADE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:315 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:339 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:499 | [fake_save] setTimeout resets state without API call — fake save feedback |

### FINDMANY_NO_PAGINATION (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/inbox/inbox.service.ts:295 | findMany() on Message without pagination (take/cursor) — unbounded query |

### HARDCODED_INTERNAL_URL (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/meta/meta-whatsapp.service.ts:549 | Hardcoded internal/infrastructure URL: http://localhost |

### IDEMPOTENCY_FINANCIAL (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/billing/payment-method.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/checkout/checkout.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/checkout/checkout.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |
| CRITICAL | backend/src/kloel/payment.service.ts:0 | Asaas payment call without idempotency key — Asaas supports idempotency but it is not used |
| CRITICAL | backend/src/reports/reports.service.ts:0 | Payment creation endpoint without idempotency key — network retry causes double charge |

### IDEMPOTENCY_JOB (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/health/health.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/mass-send/mass-send.worker.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/metrics/queue-health.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/ops/ops.controller.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:0 | BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry |

### IDEMPOTENCY_MISSING (41)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/affiliate/affiliate.controller.ts:750 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:61 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:70 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/api-keys/api-keys.controller.ts:29 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/audio/audio.controller.ts:17 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/campaigns/campaigns.controller.ts:30 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/checkout/checkout-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/flows/flow-template.controller.ts:27 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/flows/flows.controller.ts:126 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/flows/flows.controller.ts:282 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/followup/followup.controller.ts:42 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/ad-rules.controller.ts:44 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/canvas.controller.ts:58 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:485 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:595 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.controller.ts:634 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1151 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1258 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1361 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1538 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:1748 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:2004 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:2093 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product.controller.ts:334 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/product.controller.ts:606 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:198 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:246 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/sales.controller.ts:294 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/site.controller.ts:135 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/wallet.controller.ts:140 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/kloel/webinar.controller.ts:40 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:268 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:411 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/member-area/member-area.controller.ts:551 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/meta/webhooks/meta-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/reports/reports.controller.ts:155 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:30 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |
| HIGH | backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |

### LGPD_NON_COMPLIANT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | frontend/src/app/:0 | No privacy policy page found — LGPD requires accessible privacy notice |
| CRITICAL | frontend/src/app/:0 | No terms of service page found — required for user agreements and LGPD consent |

### LICENSE_UNKNOWN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | .license-allowlist.json:0 | No license allowlist found — create .license-allowlist.json to document approved exceptions |

### LINT_VIOLATION (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | frontend/src/components/kloel/vendas/VendasView.tsx:674 | Frontend ESLint error (react-hooks/static-components) |

### MIGRATION_NO_ROLLBACK (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/prisma/migrations/20251209150035_init_baseline/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | .github/workflows/:0 | CI runs Prisma migrations without taking a DB backup first |

### MONITORING_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |

### NETWORK_OFFLINE_DATA_LOST (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |
| HIGH | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |

### NETWORK_SLOW_UNUSABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Page fetches async data but has no loading state — blank/broken UI on slow network |

### NEXTJS_NO_IMAGE_COMPONENT (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/products/ProductNerveCenter.tsx:636 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:350 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1270 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1336 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1344 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:1769 | `<img>` used instead of Next.js `<Image>` — missing optimization |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2092 | `<img>` used instead of Next.js `<Image>` — missing optimization |

### N_PLUS_ONE_QUERY (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:218 | Prisma query inside loop — potential N+1 query problem |

### OBSERVABILITY_NO_ALERTING (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |

### OBSERVABILITY_NO_TRACING (21)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/audio/transcription.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/auth.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/auth/email.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/billing/billing.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/checkout/facebook-capi.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/common/storage/storage.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/crm/crm.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/health/system-health.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/asaas.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/audio.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/email-campaign.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/middleware/audit-log.middleware.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/site.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/marketing/marketing.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/media/media.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-auth.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/meta/meta-sdk.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/payment-webhook.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/whatsapp-watchdog.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |

### ORDERING_WEBHOOK_OOO (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/meta/meta.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhook-settings.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhooks.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/webhooks.module.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |

### ORPHANED_FILE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/dto/product-sub-resources.dto.ts:1 | File 'product-sub-resources.dto.ts' is not imported by any other backend file |

### RACE_CONDITION_DATA_CORRUPTION (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/billing/payment-method.service.ts:33 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/conversational-onboarding.service.ts:475 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/memory-management.service.ts:482 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/order-alerts.service.ts:233 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/payment.service.ts:142 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:1844 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:1967 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:2063 | Read-modify-write without transaction or optimistic lock — race condition possible |
| CRITICAL | backend/src/kloel/unified-agent.service.ts:3486 | Read-modify-write without transaction or optimistic lock — race condition possible |

### RACE_CONDITION_FINANCIAL (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/kloel/asaas.service.ts:0 | Wallet/balance operations without $transaction — double-spend race condition possible |

### RACE_CONDITION_OVERWRITE (12)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/billing.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/billing/payment-method.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/ad-rules-engine.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/cart-recovery.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/conversational-onboarding.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/kloel.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/memory-management.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/order-alerts.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/payment.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |

### ROUTE_NO_CALLER (8)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/upload.controller.ts:71 | POST /kloel/upload is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:49 | GET /meta/instagram/profile is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:87 | GET /meta/instagram/insights/account is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:498 | POST /whatsapp-api/session/pause-agent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:505 | POST /whatsapp-api/session/reconcile is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:515 | GET /whatsapp-api/session/proofs is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:524 | POST /whatsapp-api/session/stream-token is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:544 | POST /whatsapp-api/session/action-turn is not called by any frontend code |

### STATE_PAYMENT_INVALID (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/checkout/checkout-payment.service.ts:181 | Payment status set to PAID without verifying PROCESSING intermediate state |

### STRINGIFY_CIRCULAR_RISK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/financial-alert.service.ts:89 | JSON.stringify() on request/socket object — circular reference risk |

### TEST_NO_ASSERTION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:90 | Hardcoded sleep of 10000ms in test — use jest.useFakeTimers() or await event instead |

### TIMEOUT_NO_CLEANUP (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/dashboard/KloelDashboard.tsx:404 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |

### TIMEZONE_REPORT_MISMATCH (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/analytics/smart-time/smart-time.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/checkout/checkout-public.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/payment.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/smart-payment.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/kloel/wallet.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.controller.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |
| HIGH | backend/src/reports/reports.service.ts:0 | Financial file stores dates without explicit UTC — reports will differ by server timezone |

### UI_DEAD_HANDLER (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:677 | form "form" has dead handler |

### UNBOUNDED_RESULT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/crm/crm.service.ts:421 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:390 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/partnerships/partnerships.service.ts:24 | findMany without take — may return all rows and cause OOM or slow response |

### UNRESOLVED_TODO (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/ai-brain/agent-assist.service.ts:33 | TODO comment left unresolved |
| INFO | backend/src/ai-brain/agent-assist.service.ts:68 | TODO comment left unresolved |
| INFO | backend/src/autopilot/autopilot.service.ts:1872 | TODO comment left unresolved |
| INFO | backend/src/campaigns/campaigns.service.ts:358 | TODO comment left unresolved |
| INFO | backend/src/crm/neuro-crm.service.ts:154 | TODO comment left unresolved |
| INFO | backend/src/i18n/i18n.service.ts:5 | TODO comment left unresolved |
| INFO | backend/src/kloel/audio.service.ts:71 | TODO comment left unresolved |
| INFO | backend/src/kloel/guest-chat.service.ts:8 | TODO comment left unresolved |
| INFO | backend/src/kloel/memory.service.ts:48 | TODO comment left unresolved |
| INFO | backend/src/kloel/pdf-processor.service.ts:69 | TODO comment left unresolved |
| INFO | backend/src/kloel/unified-agent.service.ts:1391 | TODO comment left unresolved |

### UNSAFE_ANY_CAST (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout.controller.ts:216 | `as any` cast in financial/auth code — type safety bypassed |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/checkout/checkout-payment.service.ts:0 — AuditLog written outside $transaction — audit record may exist for a rolled-back operation
   Evidence: Wrap both the financial operation and the AuditLog.create() inside prisma.$transaction()
2. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/payment.service.ts:0 — AuditLog written outside $transaction — audit record may exist for a rolled-back operation
   Evidence: Wrap both the financial operation and the AuditLog.create() inside prisma.$transaction()
3. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/smart-payment.service.ts:0 — AuditLog written outside $transaction — audit record may exist for a rolled-back operation
   Evidence: Wrap both the financial operation and the AuditLog.create() inside prisma.$transaction()
4. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/unified-agent.service.ts:0 — AuditLog written outside $transaction — audit record may exist for a rolled-back operation
   Evidence: Wrap both the financial operation and the AuditLog.create() inside prisma.$transaction()
5. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/audit/audit.interceptor.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
6. [AUDIT_FINANCIAL_NO_TRAIL] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Potentially sensitive fields (password/token/CPF) may be logged in AuditLog
   Evidence: Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits
7. [BACKUP_MISSING] .backup-manifest.json:0 — No recent DB backup found — backup manifest missing or older than 24 h
   Evidence: Backup manifest exists but lastBackup timestamp is stale (>24 h) or missing
8. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No privacy policy page found — LGPD requires accessible privacy notice
   Evidence: Expected one of: /app/privacy/page.tsx, /app/politica-de-privacidade/page.tsx, /app/privacy-policy/page.tsx
9. [LGPD_NON_COMPLIANT] frontend/src/app/:0 — No terms of service page found — required for user agreements and LGPD consent
   Evidence: Expected one of: /app/terms/page.tsx, /app/termos/page.tsx, /app/terms-of-service/page.tsx, /app/termos-de-uso/page.tsx
10. [RACE_CONDITION_DATA_CORRUPTION] backend/src/billing/payment-method.service.ts:33 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 33 followed by update at line 59 without $transaction or version check
11. [RACE_CONDITION_FINANCIAL] backend/src/kloel/asaas.service.ts:0 — Wallet/balance operations without $transaction — double-spend race condition possible
   Evidence: All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment
12. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/conversational-onboarding.service.ts:475 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 475 followed by update at line 527 without $transaction or version check
13. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/memory-management.service.ts:482 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 482 followed by update at line 493 without $transaction or version check
14. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/order-alerts.service.ts:233 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 233 followed by update at line 238 without $transaction or version check
15. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/payment.service.ts:142 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 142 followed by update at line 149 without $transaction or version check
16. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:1844 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1844 followed by update at line 1947 without $transaction or version check
17. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:1967 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 1967 followed by update at line 1982 without $transaction or version check
18. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:2063 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 2063 followed by update at line 2073 without $transaction or version check
19. [RACE_CONDITION_DATA_CORRUPTION] backend/src/kloel/unified-agent.service.ts:3486 — Read-modify-write without transaction or optimistic lock — race condition possible
   Evidence: findFirst/findUnique at line 3486 followed by update at line 3504 without $transaction or version check
20. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — POSTGRES backup not configured — data store at risk of permanent loss
   Evidence: Add "postgres": true to backup manifest after setting up automated backup for this data store
21. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — REDIS backup not configured — data store at risk of permanent loss
   Evidence: Add "redis": true to backup manifest after setting up automated backup for this data store
22. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — S3 backup not configured — data store at risk of permanent loss
   Evidence: Add "s3": true to backup manifest after setting up automated backup for this data store
23. [DR_BACKUP_INCOMPLETE] .backup-manifest.json:0 — SECRETS backup not configured — data store at risk of permanent loss
   Evidence: Add "secrets": true to backup manifest after setting up automated backup for this data store
24. [DR_RPO_TOO_HIGH] .backup-manifest.json:0 — Backup frequency not configured — RPO (Recovery Point Objective) is undefined
   Evidence: Set BACKUP_FREQUENCY_MINUTES env var or add frequencyMinutes to manifest; target ≤60 min for financial data
25. [IDEMPOTENCY_FINANCIAL] backend/src/billing/payment-method.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
26. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout-payment.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
27. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout-payment.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
28. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
29. [IDEMPOTENCY_FINANCIAL] backend/src/checkout/checkout.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
30. [IDEMPOTENCY_FINANCIAL] backend/src/kloel/payment.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
31. [IDEMPOTENCY_FINANCIAL] backend/src/kloel/payment.service.ts:0 — Asaas payment call without idempotency key — Asaas supports idempotency but it is not used
   Evidence: Pass the idempotency key to Asaas via X-Idempotency-Key header to prevent double-charge at provider level
32. [IDEMPOTENCY_FINANCIAL] backend/src/reports/reports.service.ts:0 — Payment creation endpoint without idempotency key — network retry causes double charge
   Evidence: Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key
33. [DEPENDENCY_VULNERABLE] worker/package.json:0 — CRITICAL vulnerability in basic-ftp [transitive] (worker)
   Evidence: Range: <5.2.0 | fix: run npm audit fix
34. [BRUTE_FORCE_VULNERABLE] backend/src (POST /auth/login):0 — No rate limiting on POST /auth/login — brute-force attack is possible
   Evidence: Fired 20 rapid login requests. Received 0 HTTP 429 responses. All statuses: [404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404]. The auth throttle (5 req/min) does not appear to be active. Configure @nestjs/throttler on the auth controller.
35. [BRUTE_FORCE_VULNERABLE] backend/src (POST /auth/login):0 — Unexpected success responses during brute-force simulation on POST /auth/login
   Evidence: 20 out of 20 rapid login requests returned non-401/non-400/non-429 status. Statuses: [404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 404]. Investigate whether auth bypass is possible.
36. [STATE_PAYMENT_INVALID] backend/src/checkout/checkout-payment.service.ts:181 — Payment status set to PAID without verifying PROCESSING intermediate state
   Evidence: data: { status: 'PAID', paidAt: new Date() }, — payment must transition PENDING → PROCESSING → PAID, never jump directly
37. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:315 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
38. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:339 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000)
39. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:499 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(()=>setProductSaved(false),2000);
40. [AUDIT_DELETION_NO_LOG] backend/src/ai-brain/knowledge-base.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
41. [AUDIT_DELETION_NO_LOG] backend/src/analytics/advanced-analytics.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
42. [AUDIT_DELETION_NO_LOG] backend/src/auth/auth.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
43. [AUDIT_DELETION_NO_LOG] backend/src/kloel/conversational-onboarding.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
44. [AUDIT_DELETION_NO_LOG] backend/src/kloel/guest-chat.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
45. [AUDIT_DELETION_NO_LOG] backend/src/kloel/memory-management.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
46. [AUDIT_DELETION_NO_LOG] backend/src/kloel/memory.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
47. [AUDIT_DELETION_NO_LOG] backend/src/whatsapp/agent-events.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
48. [AUDIT_DELETION_NO_LOG] backend/src/whatsapp/cia-runtime.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
49. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
50. [NETWORK_OFFLINE_DATA_LOST] frontend/src/app/(checkout)/components/CheckoutNoir.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
51. [NETWORK_OFFLINE_DATA_LOST] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
52. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(checkout)/hooks/useCheckout.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
53. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/canvas/inicio/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
54. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/canvas/modelos/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
55. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/inbox/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
56. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/products/new/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
57. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/webinarios/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
58. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(main)/whatsapp/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
59. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/onboarding-chat/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
60. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/anonymous/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
61. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/check-email/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
62. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/google/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
63. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/login/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
64. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/refresh/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
65. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/register/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
66. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
67. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
68. [CACHE_STALE_AFTER_WRITE] frontend/src/components/canvas/CanvasEditor.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
69. [CACHE_STALE_AFTER_WRITE] frontend/src/components/checkout/KloelChatBubble.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
70. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/anuncios/AnunciosView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
71. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/chat-container.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
72. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/conta/ContaView.tsx:1839 — SWR cache key is not scoped to workspace — cross-tenant cache leakage risk
   Evidence: Key '/team' should include workspaceId: `/api/resource/${workspaceId}`
73. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/dashboard/KloelDashboard.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
74. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/home/HomeScreen.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
75. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/landing/FloatingChat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
76. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/marketing/MarketingView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
77. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
78. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/produtos/ProdutosView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
79. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/sites/SitesView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
80. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/vendas/VendasView.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
81. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanAIConfigTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
82. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanAffiliateTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
83. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanPaymentTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
84. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanPaymentTab.tsx:0 — Financial write without any cache invalidation strategy — user may see wrong balance
   Evidence: After wallet/payment mutations, call mutate() immediately to show updated balance
85. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanShippingTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
86. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanStoreTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
87. [CACHE_STALE_AFTER_WRITE] frontend/src/components/plans/PlanThankYouTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
88. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/CheckoutConfigPage.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
89. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductAfterPayTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
90. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
91. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCommissionsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
92. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCouponsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
93. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductGeneralTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
94. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductIATab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
95. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductPlansTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
96. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductReviewsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
97. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductUrlsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
98. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useCanvasAI.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
99. [CACHE_STALE_AFTER_WRITE] frontend/src/hooks/useConversationHistory.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
100. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/anonymous-session.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
101. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/core.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
102. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/kloel-api.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
103. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/media-upload.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
104. [CACHE_REDIS_STALE] backend/src/analytics/advanced-analytics.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
105. [CACHE_REDIS_STALE] backend/src/autopilot/autopilot.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
106. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
107. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:86 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
108. [CACHE_REDIS_STALE] backend/src/inbox/smart-routing.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
109. [CACHE_REDIS_STALE] backend/src/kloel/asaas.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
110. [CACHE_REDIS_STALE] backend/src/kloel/guest-chat.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
111. [CACHE_REDIS_STALE] backend/src/kloel/memory-management.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
112. [CACHE_REDIS_STALE] backend/src/meta/meta-whatsapp.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
113. [CACHE_REDIS_STALE] backend/src/partnerships/partnerships.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
114. [CACHE_REDIS_STALE] backend/src/whatsapp/agent-events.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
115. [CICD_INCOMPLETE] /Users/danielpenin/whatsapp_saas:0 — No deployment configuration found
   Evidence: Neither railway.toml/railway.json nor vercel.json/.vercel found. Deployment target is not declared.
116. [EMAIL_NO_AUTH] backend/src/campaigns/campaigns.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
117. [EMAIL_NO_AUTH] backend/src/kloel/email-campaign.service.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
118. [EMAIL_NO_AUTH] backend/src/marketing/marketing.controller.ts:0 — Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM
   Evidence: Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately
119. [RACE_CONDITION_OVERWRITE] backend/src/billing/billing.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
120. [RACE_CONDITION_OVERWRITE] backend/src/billing/payment-method.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
121. [RACE_CONDITION_OVERWRITE] backend/src/checkout/checkout-payment.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
122. [RACE_CONDITION_OVERWRITE] backend/src/checkout/checkout.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
123. [RACE_CONDITION_OVERWRITE] backend/src/kloel/ad-rules-engine.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
124. [RACE_CONDITION_OVERWRITE] backend/src/kloel/cart-recovery.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
125. [RACE_CONDITION_OVERWRITE] backend/src/kloel/conversational-onboarding.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
126. [RACE_CONDITION_OVERWRITE] backend/src/kloel/kloel.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
127. [RACE_CONDITION_OVERWRITE] backend/src/kloel/memory-management.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
128. [RACE_CONDITION_OVERWRITE] backend/src/kloel/order-alerts.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
129. [RACE_CONDITION_OVERWRITE] backend/src/kloel/payment.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
130. [RACE_CONDITION_OVERWRITE] backend/src/kloel/wallet.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
131. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:23 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
132. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:61 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
133. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:87 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
134. [COST_LLM_NO_LIMIT] backend/src/ai-brain/agent-assist.service.ts:117 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
135. [COST_LLM_NO_LIMIT] backend/src/ai-brain/hidden-data.service.ts:30 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
136. [COST_LLM_NO_LIMIT] backend/src/ai-brain/media-factory.service.ts:21 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.images.generate({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
137. [COST_LLM_NO_LIMIT] backend/src/ai-brain/media-factory.service.ts:49 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
138. [COST_LLM_NO_LIMIT] backend/src/ai-brain/vector.service.ts:24 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.embeddings.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
139. [COST_LLM_NO_LIMIT] backend/src/audio/audio.controller.ts:37 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
140. [COST_LLM_NO_LIMIT] backend/src/audio/transcription.service.ts:70 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/audio/transcriptions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
141. [COST_LLM_NO_LIMIT] backend/src/audio/transcription.service.ts:97 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/audio/transcriptions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
142. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:854 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
143. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:1866 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
144. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.service.ts:2055 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
145. [COST_LLM_NO_LIMIT] backend/src/campaigns/campaigns.service.ts:354 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
146. [COST_LLM_NO_LIMIT] backend/src/copilot/copilot.service.ts:78 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
147. [COST_LLM_NO_LIMIT] backend/src/copilot/copilot.service.ts:174 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await client.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
148. [COST_LLM_NO_LIMIT] backend/src/crm/neuro-crm.service.ts:150 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
149. [COST_LLM_NO_LIMIT] backend/src/crm/neuro-crm.service.ts:206 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
150. [COST_LLM_NO_LIMIT] backend/src/flows/flow-optimizer.service.ts:51 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
151. [COST_LLM_NO_LIMIT] backend/src/i18n/i18n.service.ts:214 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
152. [COST_LLM_NO_LIMIT] backend/src/i18n/i18n.service.ts:287 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
153. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:44 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: transcription = await this.openai.audio.transcriptions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
154. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:56 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: transcription = await this.openai.audio.transcriptions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
155. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:143 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
156. [COST_LLM_NO_LIMIT] backend/src/kloel/audio.service.ts:167 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.audio.speech.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
157. [COST_LLM_NO_LIMIT] backend/src/kloel/canvas.controller.ts:170 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await openai.images.generate({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
158. [COST_LLM_NO_LIMIT] backend/src/kloel/canvas.controller.ts:184 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: async generateText( — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
159. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:19 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const ONBOARDING_TOOLS: OpenAI.ChatCompletionTool[] = [ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
160. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:356 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
161. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:358 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: messages: messages as unknown as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
162. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:408 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const finalResponse = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
163. [COST_LLM_NO_LIMIT] backend/src/kloel/conversational-onboarding.service.ts:410 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: messages: messages as unknown as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
164. [COST_LLM_NO_LIMIT] backend/src/kloel/guest-chat.service.ts:141 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const completion = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
165. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1137 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: assistantMessage as unknown as OpenAI.ChatCompletionMessageParam, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
166. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1138 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ...(toolMessages as unknown as OpenAI.ChatCompletionMessageParam[]), — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
167. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1139 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ] as OpenAI.ChatCompletionMessageParam[], — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
168. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1237 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: AsyncIterable<OpenAI.ChatCompletionChunk> — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
169. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1240 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: this.openai.chat.completions.create( — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
170. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:1249 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ) as Promise<AsyncIterable<OpenAI.ChatCompletionChunk>>, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
171. [COST_LLM_NO_LIMIT] backend/src/kloel/memory.service.ts:43 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.embeddings.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
172. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:127 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
173. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:130 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Chat.ChatCompletion> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
174. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:133 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: () => client.chat.completions.create(normalizedParams, requestOptions), — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
175. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:143 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Embeddings.EmbeddingCreateParams, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
176. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:145 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
177. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:154 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Audio.Speech.SpeechCreateParams, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
178. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:189 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
179. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:193 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): Promise<OpenAI.Chat.ChatCompletion> { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
180. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:221 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
181. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:222 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
182. [COST_LLM_NO_LIMIT] backend/src/kloel/openai-wrapper.ts:238 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: return payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming; — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
183. [COST_LLM_NO_LIMIT] backend/src/kloel/pdf-processor.service.ts:56 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
184. [COST_LLM_NO_LIMIT] backend/src/kloel/site.controller.ts:72 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: 'https://api.openai.com/v1/chat/completions', — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
185. [COST_LLM_NO_LIMIT] backend/src/kloel/site.controller.ts:103 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await fetch('https://api.anthropic.com/v1/messages', { — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
186. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:93 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const aiResponse = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
187. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:291 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: const response = await this.openai.chat.completions.create({ — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
188. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.service.ts:3376 — LLM API call without per-workspace token budget check — runaway costs possible
   Evidence: response: OpenAI.Chat.Completions.ChatCompletion, — check workspace.llmTokensUsed < workspace.llmTokenLimit before calling
189. [COST_NO_TRACKING] backend/src/:0 — LLM API calls made without recording token usage per workspace — cannot bill or limit costs
   Evidence: After each LLM call, record: workspaceId, model, promptTokens, completionTokens, totalTokens, cost, timestamp
190. [COST_LLM_NO_LIMIT] backend/src/:0 — No per-workspace LLM token budget enforcement found — one workspace can exhaust entire monthly budget
   Evidence: Add workspace.llmTokensRemaining check before LLM calls; set plan-based limits in workspace settings
191. [COST_NO_TRACKING] backend/src/:0 — No cost alerting for LLM usage — workspace owner not notified when approaching monthly limit
   Evidence: Trigger notification at 80% and 95% of monthly LLM budget; send email/WhatsApp alert to workspace owner
192. [COST_LLM_NO_LIMIT] backend/src/analytics/smart-time/smart-time.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
193. [COST_LLM_NO_LIMIT] backend/src/autopilot/autopilot.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
194. [COST_LLM_NO_LIMIT] backend/src/billing/billing.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
195. [COST_LLM_NO_LIMIT] backend/src/billing/plan-limits.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
196. [COST_LLM_NO_LIMIT] backend/src/cia/cia.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
197. [COST_LLM_NO_LIMIT] backend/src/flows/flows.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
198. [COST_LLM_NO_LIMIT] backend/src/inbox/inbox.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
199. [COST_LLM_NO_LIMIT] backend/src/kloel/asaas.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
200. [COST_LLM_NO_LIMIT] backend/src/kloel/email-campaign.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
201. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.autonomy-proof.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
202. [COST_LLM_NO_LIMIT] backend/src/kloel/kloel.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
203. [COST_LLM_NO_LIMIT] backend/src/kloel/middleware/audit-log.middleware.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
204. [COST_LLM_NO_LIMIT] backend/src/kloel/smart-payment.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
205. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
206. [COST_LLM_NO_LIMIT] backend/src/kloel/unified-agent.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
207. [COST_LLM_NO_LIMIT] backend/src/lib/env.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
208. [COST_LLM_NO_LIMIT] backend/src/mass-send/mass-send.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
209. [COST_LLM_NO_LIMIT] backend/src/mass-send/mass-send.worker.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
210. [COST_LLM_NO_LIMIT] backend/src/meta/instagram/instagram.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
211. [COST_LLM_NO_LIMIT] backend/src/meta/instagram/instagram.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
212. [COST_LLM_NO_LIMIT] backend/src/meta/messenger/messenger.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
213. [COST_LLM_NO_LIMIT] backend/src/meta/messenger/messenger.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
214. [COST_LLM_NO_LIMIT] backend/src/meta/meta-whatsapp.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
215. [COST_LLM_NO_LIMIT] backend/src/notifications/notifications.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
216. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
217. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
218. [COST_LLM_NO_LIMIT] backend/src/partnerships/partnerships.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
219. [COST_LLM_NO_LIMIT] backend/src/public-api/public-api.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
220. [COST_LLM_NO_LIMIT] backend/src/webhooks/asaas-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
221. [COST_LLM_NO_LIMIT] backend/src/webhooks/payment-webhook.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
222. [COST_LLM_NO_LIMIT] backend/src/webhooks/webhooks.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
223. [COST_LLM_NO_LIMIT] backend/src/whatsapp/cia-runtime.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
224. [COST_LLM_NO_LIMIT] backend/src/whatsapp/cia-runtime.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
225. [COST_LLM_NO_LIMIT] backend/src/whatsapp/controllers/whatsapp-api.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
226. [COST_LLM_NO_LIMIT] backend/src/whatsapp/inbound-processor.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
227. [COST_LLM_NO_LIMIT] backend/src/whatsapp/inbound-processor.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
228. [COST_LLM_NO_LIMIT] backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
229. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
230. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
231. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/whatsapp-api.provider.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
232. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/whatsapp-api.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
233. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp-catchup.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
234. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp-watchdog.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
235. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.controller.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
236. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.service.spec.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
237. [COST_LLM_NO_LIMIT] backend/src/whatsapp/whatsapp.service.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
238. [DEPLOY_NO_ROLLBACK] .github/workflows/:0 — No deployment rollback mechanism configured — bad deploy cannot be reverted quickly
   Evidence: Configure Railway instant rollback or Docker image versioning with a CI step to revert to previous image tag
239. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20251209150035_init_baseline/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
240. [MIGRATION_NO_ROLLBACK] .github/workflows/:0 — CI runs Prisma migrations without taking a DB backup first
   Evidence: Add a pg_dump step before prisma migrate deploy in CI/CD to enable point-in-time restore if migration fails
241. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
242. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
243. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:29 — docker-compose backend depends_on without healthcheck condition
   Evidence: docker-compose.yml: "backend" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
244. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/docker-compose.yml:61 — docker-compose worker depends_on without healthcheck condition
   Evidence: docker-compose.yml: "worker" uses depends_on without "condition: service_healthy". The service may start before the database is ready, causing connection errors.
245. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
246. [E2E_FLOW_NOT_TESTED] e2e:0 — No E2E test found for "Product creation" flow
   Evidence: Add a Playwright/Cypress test that exercises the full Product creation user journey
247. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
248. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
249. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:104 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
250. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:107 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
251. [EDGE_CASE_PAGINATION] backend/src/audit/audit.controller.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit) : 50, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
252. [EDGE_CASE_STRING] backend/src/auth/dto/register.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
253. [EDGE_CASE_PAGINATION] backend/src/autopilot/segmentation.controller.ts:50 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: if (limit) overrides.limit = parseInt(limit, 10); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
254. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
255. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
256. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
257. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
258. [EDGE_CASE_STRING] backend/src/campaigns/dto/create-campaign.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
259. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:359 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: page: page ? parseInt(page, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
260. [EDGE_CASE_PAGINATION] backend/src/checkout/checkout.controller.ts:360 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit: limit ? parseInt(limit, 10) : undefined, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
261. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
262. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
263. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
264. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
265. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
266. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-bump.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
267. [EDGE_CASE_STRING] backend/src/checkout/dto/create-bump.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
268. [EDGE_CASE_STRING] backend/src/checkout/dto/create-coupon.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
269. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:19 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
270. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:20 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
271. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:21 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
272. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-coupon.dto.ts:22 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
273. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
274. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
275. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
276. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
277. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
278. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
279. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
280. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:25 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
281. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:26 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
282. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:27 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
283. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:28 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
284. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:29 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
285. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
286. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:31 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
287. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-order.dto.ts:34 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
288. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:35 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
289. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
290. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:37 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
291. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
292. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:39 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
293. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:40 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
294. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:41 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
295. [EDGE_CASE_STRING] backend/src/checkout/dto/create-order.dto.ts:42 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
296. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
297. [EDGE_CASE_STRING] backend/src/checkout/dto/create-pixel.dto.ts:16 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
298. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
299. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
300. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
301. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:14 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
302. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:16 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
303. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-plan.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
304. [EDGE_CASE_STRING] backend/src/checkout/dto/create-plan.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
305. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
306. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
307. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
308. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:8 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
309. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
310. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-product.dto.ts:11 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
311. [EDGE_CASE_STRING] backend/src/checkout/dto/create-product.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
312. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
313. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
314. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
315. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
316. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
317. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:9 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
318. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:10 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
319. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
320. [EDGE_CASE_STRING] backend/src/checkout/dto/create-upsell.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
321. [EDGE_CASE_NUMBER] backend/src/checkout/dto/create-upsell.dto.ts:13 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
322. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
323. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:19 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
324. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:20 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
325. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:21 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
326. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:25 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
327. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:26 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
328. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:30 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
329. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:31 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
330. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
331. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:33 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
332. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
333. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:35 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
334. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:36 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
335. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:37 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
336. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:38 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
337. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:39 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
338. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:40 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
339. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:41 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
340. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:46 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
341. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:47 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
342. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:48 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
343. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:49 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
344. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:50 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
345. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:51 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
346. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:52 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
347. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:53 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
348. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:54 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
349. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:55 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
350. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:56 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
351. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:57 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
352. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:58 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
353. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:59 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
354. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:64 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
355. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:65 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
356. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:66 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
357. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:67 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
358. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:77 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
359. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:78 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
360. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:79 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
361. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:80 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
362. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:81 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
363. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:82 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
364. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:83 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
365. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:84 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
366. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:85 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
367. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:86 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
368. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:87 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
369. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:88 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
370. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:89 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
371. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:90 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
372. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:91 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
373. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:92 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
374. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:93 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
375. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:94 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
376. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:97 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
377. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:103 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
378. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:104 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
379. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:105 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
380. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:106 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
381. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:107 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
382. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:108 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
383. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:110 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
384. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:111 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
385. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:112 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
386. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:113 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
387. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:114 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
388. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:116 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
389. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:117 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
390. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:125 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
391. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:126 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
392. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:127 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
393. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:134 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
394. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:137 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
395. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:138 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
396. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:139 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
397. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:141 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
398. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:142 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
399. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:143 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
400. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:144 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
401. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:145 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
402. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:146 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
403. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:148 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
404. [EDGE_CASE_NUMBER] backend/src/checkout/dto/update-config.dto.ts:149 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
405. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:150 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
406. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:151 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
407. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:153 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
408. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:154 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
409. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:156 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
410. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:158 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
411. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:159 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
412. [EDGE_CASE_STRING] backend/src/checkout/dto/update-config.dto.ts:160 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
413. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:26 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
414. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
415. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
416. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
417. [EDGE_CASE_STRING] backend/src/crm/dto/create-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
418. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
419. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
420. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
421. [EDGE_CASE_STRING] backend/src/crm/dto/upsert-contact.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
422. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
423. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
424. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
425. [EDGE_CASE_STRING] backend/src/flows/dto/flow.dto.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
426. [EDGE_CASE_STRING] backend/src/flows/dto/log-execution.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
427. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
428. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
429. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
430. [EDGE_CASE_STRING] backend/src/flows/dto/run-flow.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
431. [EDGE_CASE_STRING] backend/src/flows/dto/save-flow-version.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
432. [EDGE_CASE_PAGINATION] backend/src/flows/flows.controller.ts:257 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit) : 50, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
433. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:23 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
434. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
435. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:39 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
436. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:59 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
437. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:69 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
438. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
439. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:15 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
440. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:16 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
441. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:17 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
442. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
443. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:23 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
444. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:24 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
445. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:25 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
446. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:34 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
447. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:35 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
448. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:36 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
449. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:42 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
450. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:43 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
451. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:44 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
452. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:54 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
453. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:55 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
454. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:56 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
455. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:57 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
456. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:58 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
457. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:62 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
458. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:70 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
459. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:71 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
460. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:72 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
461. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:73 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
462. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:77 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
463. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:78 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
464. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:79 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
465. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:80 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
466. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:88 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
467. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:89 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
468. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:98 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
469. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:99 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
470. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:100 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
471. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:108 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
472. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:109 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
473. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:110 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
474. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:114 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
475. [EDGE_CASE_NUMBER] backend/src/kloel/dto/product-sub-resources.dto.ts:115 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
476. [EDGE_CASE_STRING] backend/src/kloel/dto/product-sub-resources.dto.ts:116 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
477. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
478. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
479. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:13 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
480. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
481. [EDGE_CASE_STRING] backend/src/kloel/dto/update-webinar.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
482. [EDGE_CASE_PAGINATION] backend/src/kloel/leads.controller.ts:18 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const parsedLimit = limit ? Number(limit) : undefined; — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
483. [EDGE_CASE_PAGINATION] backend/src/kloel/memory.controller.ts:104 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: parseInt(page || '1'), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
484. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:16 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
485. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:50 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
486. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:225 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
487. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:227 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
488. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:990 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
489. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:88 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
490. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:90 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
491. [EDGE_CASE_FILE] backend/src/kloel/upload.controller.ts:157 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
492. [EDGE_CASE_PAGINATION] backend/src/kloel/wallet.controller.ts:121 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: parseInt(page || '1'), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
493. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
494. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
495. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
496. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
497. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
498. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
499. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
500. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:17 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
501. [EDGE_CASE_STRING] backend/src/kyc/dto/update-bank.dto.ts:18 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
502. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
503. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
504. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:46 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
505. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:49 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
506. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:82 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
507. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:85 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
508. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
509. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
510. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
511. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
512. [EDGE_CASE_STRING] backend/src/launch/dto/create-launcher.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
513. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
514. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
515. [EDGE_CASE_STRING] backend/src/media/dto/generate-video.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
516. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
517. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:69 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
518. [EDGE_CASE_PAGINATION] backend/src/meta/instagram/instagram.controller.ts:82 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: limit ? parseInt(limit, 10) : 25, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
519. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:39 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
520. [EDGE_CASE_PAGINATION] backend/src/ops/ops.controller.ts:55 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: const jobs = await dlq.getJobs(['waiting', 'failed'], 0, Number(limit) - 1); — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
521. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
522. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
523. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
524. [EDGE_CASE_STRING] backend/src/partnerships/dto/create-affiliate.dto.ts:14 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
525. [EDGE_CASE_NUMBER] backend/src/partnerships/dto/create-affiliate.dto.ts:18 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
526. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:3 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
527. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
528. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
529. [EDGE_CASE_NUMBER] backend/src/pipeline/dto/create-deal.dto.ts:6 — @IsNumber/@IsInt without @Min/@Max — allows 0, -1, Infinity; financial fields need range validation
   Evidence: Add @Min(0) for prices/quantities; @Max() for rate limits; @IsPositive() for amounts
530. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
531. [EDGE_CASE_STRING] backend/src/pipeline/dto/create-deal.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
532. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:5 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
533. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:6 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
534. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
535. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:8 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
536. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:9 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
537. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:10 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
538. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:11 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
539. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:12 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
540. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
541. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:24 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
542. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:28 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
543. [EDGE_CASE_STRING] backend/src/scrapers/scrapers.controller.ts:32 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
544. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:750 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
545. [IDEMPOTENCY_MISSING] backend/src/ai-brain/knowledge-base.controller.ts:61 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
546. [IDEMPOTENCY_MISSING] backend/src/ai-brain/knowledge-base.controller.ts:70 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
547. [IDEMPOTENCY_JOB] backend/src/ai-brain/knowledge-base.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
548. [IDEMPOTENCY_MISSING] backend/src/api-keys/api-keys.controller.ts:29 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
549. [IDEMPOTENCY_MISSING] backend/src/audio/audio.controller.ts:17 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
550. [IDEMPOTENCY_MISSING] backend/src/campaigns/campaigns.controller.ts:30 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
551. [IDEMPOTENCY_JOB] backend/src/campaigns/campaigns.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
552. [IDEMPOTENCY_MISSING] backend/src/checkout/checkout-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
553. [IDEMPOTENCY_MISSING] backend/src/flows/flow-template.controller.ts:27 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
554. [IDEMPOTENCY_MISSING] backend/src/flows/flows.controller.ts:126 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
555. [IDEMPOTENCY_MISSING] backend/src/flows/flows.controller.ts:282 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
556. [IDEMPOTENCY_MISSING] backend/src/followup/followup.controller.ts:42 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
557. [IDEMPOTENCY_JOB] backend/src/health/health.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
558. [IDEMPOTENCY_MISSING] backend/src/kloel/ad-rules.controller.ts:44 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
559. [IDEMPOTENCY_MISSING] backend/src/kloel/canvas.controller.ts:58 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
560. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:485 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
561. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:595 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
562. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.controller.ts:634 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
563. [IDEMPOTENCY_MISSING] backend/src/kloel/kloel.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
564. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:1151 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
565. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:1258 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
566. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:1361 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
567. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:1538 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
568. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:1748 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
569. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:2004 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
570. [IDEMPOTENCY_MISSING] backend/src/kloel/product-sub-resources.controller.ts:2093 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
571. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:334 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
572. [IDEMPOTENCY_MISSING] backend/src/kloel/product.controller.ts:606 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
573. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:198 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
574. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:246 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
575. [IDEMPOTENCY_MISSING] backend/src/kloel/sales.controller.ts:294 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
576. [IDEMPOTENCY_MISSING] backend/src/kloel/site.controller.ts:135 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
577. [IDEMPOTENCY_MISSING] backend/src/kloel/wallet.controller.ts:140 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
578. [IDEMPOTENCY_MISSING] backend/src/kloel/webinar.controller.ts:40 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
579. [IDEMPOTENCY_JOB] backend/src/mass-send/mass-send.worker.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
580. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:268 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
581. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:411 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
582. [IDEMPOTENCY_MISSING] backend/src/member-area/member-area.controller.ts:551 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
583. [IDEMPOTENCY_MISSING] backend/src/meta/webhooks/meta-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
584. [IDEMPOTENCY_JOB] backend/src/metrics/queue-health.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
585. [IDEMPOTENCY_JOB] backend/src/ops/ops.controller.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
586. [IDEMPOTENCY_MISSING] backend/src/reports/reports.controller.ts:155 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
587. [IDEMPOTENCY_JOB] backend/src/webhooks/webhook-dispatcher.service.ts:0 — BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry
   Evidence: Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds
588. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhook-settings.controller.ts:30 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
589. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhook-settings.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
590. [IDEMPOTENCY_MISSING] backend/src/webhooks/webhooks.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
591. [IDEMPOTENCY_MISSING] backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
592. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
593. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in @types/expr-eval [DIRECT DEPENDENCY] (worker)
   Evidence: Range: >=1.1.0 | fix: upgrade to @types/expr-eval@1.0.2
594. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in axios [DIRECT DEPENDENCY] (worker)
   Evidence: Range: 1.0.0 - 1.13.4 | fix: run npm audit fix
595. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in expr-eval [DIRECT DEPENDENCY] (worker)
   Evidence: Range: * | fix: upgrade to @types/expr-eval@1.0.2
596. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in minimatch [transitive] (worker)
   Evidence: Range: <=3.1.3 | fix: run npm audit fix
597. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in nodemailer [DIRECT DEPENDENCY] (worker)
   Evidence: Range: <=8.0.3 | fix: upgrade to nodemailer@8.0.4
598. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in picomatch [transitive] (worker)
   Evidence: Range: <=2.3.1 || 4.0.0 - 4.0.3 | fix: run npm audit fix
599. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in rollup [transitive] (worker)
   Evidence: Range: 4.0.0 - 4.58.0 | fix: run npm audit fix
600. [DEPENDENCY_VULNERABLE] worker/package.json:0 — HIGH vulnerability in undici [transitive] (worker)
   Evidence: Range: 7.0.0 - 7.23.0 | fix: run npm audit fix
601. [DEPENDENCY_VULNERABLE] .github/dependabot.yml:0 — No automated dependency update tool configured (Dependabot or Renovate)
   Evidence: Create .github/dependabot.yml or renovate.json to get automated PRs for security patches
602. [OBSERVABILITY_NO_TRACING] backend/src/ai-brain/knowledge-base.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
603. [OBSERVABILITY_NO_TRACING] backend/src/audio/transcription.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
604. [OBSERVABILITY_NO_TRACING] backend/src/auth/auth.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
605. [OBSERVABILITY_NO_TRACING] backend/src/auth/email.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
606. [OBSERVABILITY_NO_TRACING] backend/src/billing/billing.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
607. [OBSERVABILITY_NO_TRACING] backend/src/checkout/facebook-capi.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
608. [OBSERVABILITY_NO_TRACING] backend/src/common/storage/storage.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
609. [OBSERVABILITY_NO_TRACING] backend/src/crm/crm.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
610. [OBSERVABILITY_NO_TRACING] backend/src/health/system-health.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
611. [OBSERVABILITY_NO_TRACING] backend/src/kloel/asaas.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
612. [OBSERVABILITY_NO_TRACING] backend/src/kloel/audio.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
613. [OBSERVABILITY_NO_TRACING] backend/src/kloel/email-campaign.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
614. [OBSERVABILITY_NO_TRACING] backend/src/kloel/middleware/audit-log.middleware.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
615. [OBSERVABILITY_NO_TRACING] backend/src/kloel/site.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
616. [OBSERVABILITY_NO_TRACING] backend/src/marketing/marketing.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
617. [OBSERVABILITY_NO_TRACING] backend/src/media/media.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
618. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-auth.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
619. [OBSERVABILITY_NO_TRACING] backend/src/meta/meta-sdk.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
620. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/payment-webhook.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
621. [OBSERVABILITY_NO_TRACING] backend/src/webhooks/webhooks.controller.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
622. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/whatsapp-watchdog.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
623. [OBSERVABILITY_NO_ALERTING] backend/src/billing/payment-method.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
624. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
625. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/facebook-capi.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
626. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
627. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/smart-payment.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
628. [TIMEZONE_REPORT_MISMATCH] backend/src/analytics/smart-time/smart-time.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
629. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
630. [TIMEZONE_REPORT_MISMATCH] backend/src/checkout/checkout-public.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
631. [ORDERING_WEBHOOK_OOO] backend/src/checkout/checkout.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
632. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/payment.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
633. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/smart-payment.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
634. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
635. [TIMEZONE_REPORT_MISMATCH] backend/src/kloel/wallet.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
636. [ORDERING_WEBHOOK_OOO] backend/src/meta/meta.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
637. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.controller.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
638. [TIMEZONE_REPORT_MISMATCH] backend/src/reports/reports.service.ts:0 — Financial file stores dates without explicit UTC — reports will differ by server timezone
   Evidence: Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ
639. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhook-dispatcher.service.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
640. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhook-settings.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
641. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhooks.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
642. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/webhooks.module.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
643. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/whatsapp-api-webhook.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
644. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:295 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
645. [UNSAFE_ANY_CAST] backend/src/checkout/checkout.controller.ts:216 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: return this.checkoutService.updateConfig(planId, dto as any);
```