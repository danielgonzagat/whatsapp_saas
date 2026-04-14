# PULSE REPORT — 2026-04-14T09:40:57.190Z

## Certification Status: PARTIAL

- Score: 52/100 (raw scan: 71/100)
- Environment: deep
- Commit: e4ca881b2d83eda1f98a6bf99dd3baf16a49dc3c
- Manifest: /home/runner/work/whatsapp_saas/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)

## Codebase Truth

- Frontend pages discovered: 96
- User-facing pages: 96
- Raw modules discovered: 32
- Raw mutation flow candidates: 148

## Resolved Manifest

- Resolved modules: 32/32
- Resolved flow groups: 49/49
- Grouped semantic flow groups: 41
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
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 32 module(s), 49 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 169 critical/high blocking finding(s). |
| runtimePass | FAIL | missing_evidence | Runtime probes were not executed in scan mode. |
| browserPass | PASS | — | Browser certification is not required in this environment. |
| flowPass | PASS | — | No critical flows are required in the current environment. |
| invariantPass | FAIL | product_failure | Invariant checks are failing: financial-audit-trail. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: COOKIE_NOT_HTTPONLY. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, MIGRATION_NO_ROLLBACK. |
| performancePass | PASS | — | Performance budgets have no blocking findings in this run. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_ADMIN_NO_LOG, AUDIT_DELETION_NO_LOG, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING. |
| customerPass | FAIL | missing_evidence | customer synthetic evidence is missing for: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox. |
| operatorPass | FAIL | missing_evidence | operator synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run. |
| adminPass | FAIL | missing_evidence | admin synthetic evidence is missing for: admin-settings-kyc-banking, admin-whatsapp-session-control. |
| soakPass | FAIL | missing_evidence | soak synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run, system-payment-reconciliation. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 96/96 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | Execution trace and attached evidence are internally coherent for this run. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: TIER 0
- Blocking tier: 0

| Tier | Name | Status | Blocking Gates | Reason |
|------|------|--------|----------------|--------|
| 0 | Truth + Runtime Baseline | FAIL | runtimePass | blocking gates: runtimePass |
| 1 | Customer Truth | FAIL | customerPass | blocking gates: customerPass |
| 2 | Operator + Admin Replacement | FAIL | operatorPass, adminPass | blocking gates: operatorPass, adminPass |
| 3 | Production Reliability | FAIL | invariantPass, securityPass, recoveryPass, observabilityPass | blocking gates: invariantPass, securityPass, recoveryPass, observabilityPass |
| 4 | Final Human Replacement | FAIL | soakPass | blocking gates: soakPass; pending critical scenarios: admin-settings-kyc-banking, admin-whatsapp-session-control, customer-auth-shell, customer-product-and-c... |

## Evidence Summary

- Runtime: Runtime probes were not executed in scan mode.
- Browser: Browser certification is not required in this environment.
- Flows: No flow specs are required in the current environment.
- Invariants: Invariant evidence summary: 0 passed, 1 failed, 0 accepted, 0 missing evidence.
- Observability: Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Recovery: Recovery evidence is missing: backup-validation.
- Customer: customer scenarios: 1 passed, 0 failed/checker-gap, 3 missing evidence.
- Operator: operator scenarios: 7 passed, 0 failed/checker-gap, 2 missing evidence.
- Admin: admin scenarios: 1 passed, 0 failed/checker-gap, 2 missing evidence.
- Soak: soak scenarios: 0 passed, 0 failed/checker-gap, 3 missing evidence.
- Synthetic Coverage: Synthetic coverage maps 96/96 non-ops page(s) to declared scenarios.
- Execution Trace: Execution completed: 110 phase(s) passed.
- Truth: Resolved manifest is aligned: 32 module(s), 49 flow group(s), no blocking drift.

## Human Replacement

- Status: NOT_READY
- Final target: TIER 0
- Covered pages: 96/96
- Uncovered pages: 0
- Accepted critical flows remaining: 0
- Pending critical scenarios: 8
- Customer scenarios: 1/4 passed
- Operator scenarios: 7/9 passed
- Admin scenarios: 1/3 passed
- Soak scenarios: 0/3 passed

## Convergence Queue

- Queue length: 14
- Scenario units: 8
- Security units: 1
- Gate units: 4
- Static units: 1
- Priorities: P0=5, P1=4, P2=4, P3=1
- Pending async expectations: 12
- Artifact: PULSE_CONVERGENCE_PLAN.md

| Order | Priority | Lane | Kind | Unit | Opened By |
|-------|----------|------|------|------|-----------|
| 1 | P0 | customer | SCENARIO | Recover Customer Auth Shell | browserPass, customerPass, customer-auth-shell |
| 2 | P0 | customer | SCENARIO | Recover Customer Product And Checkout | browserPass, customerPass, customer-product-and-checkout, payment-webhook-reconciliation |
| 3 | P0 | customer | SCENARIO | Recover Customer Whatsapp And Inbox | browserPass, customerPass, customer-whatsapp-and-inbox, conversation-reload, message-persistence |
| 4 | P0 | customer | SCENARIO | Recover System Payment Reconciliation | system-payment-reconciliation, payment-webhook-replay, wallet-ledger-reconciliation |
| 5 | P0 | customer | GATE | Clear Runtime Pass | runtimePass |
| 6 | P1 | operator-admin | SCENARIO | Recover Admin Settings Kyc Banking | adminPass, browserPass, admin-settings-kyc-banking, kyc-doc-processing, withdrawal-ledger-consistency |
| 7 | P1 | operator-admin | SCENARIO | Recover Admin Whatsapp Session Control | adminPass, browserPass, admin-whatsapp-session-control, provider-status-sync, session-reconnect |
| 8 | P1 | operator-admin | SCENARIO | Recover Operator Autopilot Run | operatorPass, operator-autopilot-run, job-enqueued, worker-health-visible |
| 9 | P1 | operator-admin | SCENARIO | Recover Operator Campaigns And Flows | operatorPass, operator-campaigns-and-flows, flow-resume-after-wait |
| 10 | P2 | security | SECURITY | Clear Blocking Security And Compliance Findings | securityPass |
| ... | ... | ... | ... | 4 more units in PULSE_CONVERGENCE_PLAN.md | ... |

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

- truth | executed=true | Resolved manifest built from 96 page(s), 32 module(s), 49 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 169 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=169, totalBreaks=1091

### runtimePass

- runtime | executed=false | Runtime probes were not executed in scan mode.
- Artifacts: PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json | Metrics: executedChecks=0, blockingBreakTypes=0

### browserPass

- browser | executed=false | Browser certification is not required in this environment.
- Artifacts: (none) | Metrics: attempted=false, failureCode=ok, totalPages=0, totalTested=0, passRate=0, blockingInteractions=0

### flowPass


### invariantPass

- invariant | executed=true | Blocking findings for financial-audit-trail: AUDIT_DELETION_NO_LOG, AUDIT_ADMIN_NO_LOG.
- Artifacts: PULSE_INVARIANT_EVIDENCE.json | Metrics: invariantId=financial-audit-trail, status=failed, accepted=false

### recoveryPass

- artifact | executed=true | Recovery evidence is missing: backup-validation.
- Artifacts: PULSE_RECOVERY_EVIDENCE.json | Metrics: backupManifestPresent=true, backupPolicyPresent=true, backupValidationPresent=false, restoreRunbookPresent=true, disasterRecoveryRunbookPresent=true, disasterRecoveryTestPresent=true, seedScriptPresent=true

### observabilityPass

- artifact | executed=true | Observability evidence found tracing, alerting, health endpoints, and audit hooks.
- Artifacts: PULSE_OBSERVABILITY_EVIDENCE.json | Metrics: tracingHeadersDetected=false, requestIdMiddlewareDetected=true, structuredLoggingDetected=true, sentryDetected=true, alertingIntegrationDetected=true, healthEndpointsDetected=true, auditTrailDetected=true

### customerPass

- actor | executed=false | Scenario customer-auth-shell requires runtime probes that are not attached: auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-auth-shell, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario customer-product-and-checkout requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-product-and-checkout, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario customer-whatsapp-and-inbox requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=customer-whatsapp-and-inbox, actorKind=customer, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario customer-onboarding-public-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_CUSTOMER_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=customer-onboarding-public-map, actorKind=customer, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0

### operatorPass

- actor | executed=false | Scenario operator-campaigns-and-flows requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run requires runtime probes that are not attached: backend-health.
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

- actor | executed=false | Scenario admin-settings-kyc-banking requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-settings-kyc-banking, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario admin-whatsapp-session-control requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=admin-whatsapp-session-control, actorKind=admin, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=true | Derived scenario admin-ops-surface-map passed via runtime/browser/flow dependencies.
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json | Metrics: scenarioId=admin-ops-surface-map, actorKind=admin, critical=false, requested=false, runner=derived, status=passed, specsExecuted=0, durationMs=0

### soakPass

- actor | executed=false | Scenario operator-campaigns-and-flows requires runtime probes that are not attached: backend-health, auth-session.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-campaigns-and-flows, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario operator-autopilot-run requires runtime probes that are not attached: backend-health.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=operator-autopilot-run, actorKind=operator, critical=true, requested=false, runner=playwright-spec, status=missing_evidence, specsExecuted=0, durationMs=0
- actor | executed=false | Scenario system-payment-reconciliation requires runtime probes that are not attached: backend-health.
- Artifacts: PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json | Metrics: scenarioId=system-payment-reconciliation, actorKind=system, critical=true, requested=false, runner=derived, status=missing_evidence, specsExecuted=0, durationMs=0

### syntheticCoveragePass

- coverage | executed=true | Synthetic coverage maps 96/96 non-ops page(s) to declared scenarios.
- Artifacts: PULSE_SCENARIO_COVERAGE.json | Metrics: totalPages=96, userFacingPages=96, coveredPages=96, uncoveredPages=0

### evidenceFresh

- artifact | executed=true | Execution in progress: 109 passed, 0 failed, 0 timed out, 1 running.
- Artifacts: PULSE_EXECUTION_TRACE.json, PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CONVERGENCE_PLAN.json, PULSE_CONVERGENCE_PLAN.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 1031 | 4 dead handlers |
| API Calls | 634 | 0 no backend |
| Backend Routes | 644 | 0 empty |
| Prisma Models | 110 | 0 orphaned |
| Facades | 5 | 5 critical, 0 warning |
| Proxy Routes | 61 | 5 no upstream |
| Security | - | 1 issues |
| Data Safety | - | 49 issues |
| Quality | - | 1013 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (1091 total)

### ACCESSIBILITY_VIOLATION (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:2172 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:693 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:707 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:738 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:754 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2037 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2050 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2561 | Icon-only \<button\> missing aria-label — inaccessible to screen readers |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:213 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCheckoutsTab.tsx:246 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCommissionsTab.tsx:226 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCommissionsTab.tsx:241 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCommissionsTab.tsx:254 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCouponsTab.tsx:249 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/products/ProductCouponsTab.tsx:281 | \<input\> without associated label or aria-label |

### AUDIT_ADMIN_NO_LOG (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | Admin operation without audit log — privileged actions are unaccountable |
| HIGH | backend/src/whatsapp/whatsapp-normalization.util.ts:0 | Admin operation without audit log — privileged actions are unaccountable |

### AUDIT_DELETION_NO_LOG (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel.service.ts:0 | Data deletion/anonymization without audit log — cannot prove LGPD compliance |

### BACKUP_MISSING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No recent DB backup found — backup manifest missing or older than 24 h |
| CRITICAL | .backup-validation.log:0 | No backup restore-test validation log found — backup has never been verified |

### BROWSER_INCOMPATIBLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:778 | CSS feature with limited browser support used without @supports fallback |
| WARNING | frontend/src/app/(checkout)/layout.tsx:0 | Root layout missing viewport meta tag — mobile users see desktop-scaled view |

### BRUTE_FORCE_VULNERABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src (POST /auth/login):0 | No rate limiting on POST /auth/login — brute-force attack is possible |

### CACHE_REDIS_STALE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:97 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/mercado-pago.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |

### CACHE_STALE_AFTER_WRITE (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(public)/reset-password/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/verify-email/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
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
| HIGH | frontend/src/lib/mercado-pago.ts:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |

### CLOCK_SKEW_TOO_STRICT (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:17 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:28 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/common/interfaces/jwt-payload.interface.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/cookie-consent/cookie-consent.controller.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |

### COOKIE_NOT_HTTPONLY (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/cookie-consent/cookie-consent.controller.ts:67 | Cookie set without httpOnly: true — vulnerable to XSS theft |

### COST_LLM_NO_LIMIT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/whatsapp/providers/provider-registry.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages |

### COST_STORAGE_NO_LIMIT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/:0 | File uploads accepted without per-workspace storage quota check |

### COVERAGE_CORE_LOW (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/coverage/coverage-summary.json:0 | Backend coverage report not found — run jest --coverage to generate |

### CRUD_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/products:0 | CRUD CREATE — expected 200/201, got 0 |

### DATA_ORDER_NO_PAYMENT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet.service.ts:262 | Financial write without existence check in wallet.service.ts |

### DEAD_EXPORT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/cost-alerting.service.ts:4 | Exported symbol 'CostAlertingService' has no references in other files |
| INFO | backend/src/common/ledger-reconciliation.service.ts:69 | Exported symbol 'LedgerReconciliationService' has no references in other files |
| INFO | backend/src/kloel/llm-budget.service.ts:157 | Exported symbol 'estimateChatCostCents' has no references in other files |

### DOCKER_BUILD_FAILS (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/Dockerfile:0 | No Dockerfile found for backend |
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src/Dockerfile:0 | No Dockerfile found for frontend |

### E2E_FLOW_NOT_TESTED (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

### E2E_REGISTRATION_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/auth/auth.controller.ts:36 | POST /auth/register did not return 201 |

### EDGE_CASE_ARRAY (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/dto/create-coupon.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:194 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:199 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/checkout/dto/update-config.dto.ts:204 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:13 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:16 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:32 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/flow.dto.ts:36 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/flows/dto/save-flow-version.dto.ts:5 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/kloel/dto/product-sub-resources.dto.ts:93 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |
| WARNING | backend/src/partnerships/dto/create-affiliate.dto.ts:28 | @IsArray() without @ArrayMaxSize — user can send array with 10k+ elements |

### EDGE_CASE_DATE (325)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/analytics/analytics.controller.ts:10 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:11 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:13 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:108 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:124 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:285 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/analytics.service.ts:391 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:19 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/analytics/smart-time/smart-time.service.ts:41 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/api-keys/api-keys.service.ts:66 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:28 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/app.controller.ts:58 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:985 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/auth/auth.service.ts:1082 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:215 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:295 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:451 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:488 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:502 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:509 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:521 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:564 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:607 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1141 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1146 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1155 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1161 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1197 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1608 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1655 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1706 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1736 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:1805 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2012 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/autopilot.service.ts:2042 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:359 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:434 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:446 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/autopilot/segmentation.service.ts:472 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:66 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:67 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:117 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:173 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:459 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:467 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:474 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:692 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/billing.service.ts:770 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:150 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:157 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:207 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:231 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/billing/plan-limits.service.ts:238 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:34 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:35 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:47 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.controller.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:190 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:191 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/calendar/calendar.service.ts:287 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/campaigns/campaigns.service.ts:95 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-order-support.ts:172 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:200 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:262 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-payment.service.ts:273 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-public.controller.ts:38 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:297 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:568 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:601 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:847 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:1292 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/checkout/checkout.service.ts:1906 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:147 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cia/cia.service.ts:196 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:162 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:292 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/cookie-consent/cookie-consent.service.ts:26 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/crm.service.ts:532 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/crm/neuro-crm.service.ts:420 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:74 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:146 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:147 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:148 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:154 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:415 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:32 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:38 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:44 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:60 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:91 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:96 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/health/system-health.service.ts:37 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:55 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:73 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/i18n/i18n.service.ts:356 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/inbox/inbox.service.ts:224 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:54 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/ad-rules-engine.service.ts:99 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:339 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:436 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:538 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/asaas.service.ts:638 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/cart-recovery.service.ts:72 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:535 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:536 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/kloel/guest-chat.service.ts:265 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/guest-chat.service.ts:266 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:832 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:877 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:890 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:943 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:1012 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.controller.ts:1049 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:789 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1173 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1203 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1224 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1234 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1247 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1355 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1380 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1475 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1802 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2038 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2566 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2697 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3569 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3712 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3733 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3755 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:4675 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/llm-budget.service.ts:131 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:186 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:209 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:418 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:482 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:381 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:393 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:765 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:901 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/middleware/audit-log.middleware.ts:83 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/order-alerts.service.ts:229 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/payment.service.ts:160 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:524 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/product-sub-resources.controller.ts:1341 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:125 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:128 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:216 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:300 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:345 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:441 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/sales.controller.ts:457 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1444 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1817 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:1945 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2788 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:2806 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3221 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3274 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3303 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3416 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3430 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3435 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3438 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3441 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3444 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3447 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3533 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3566 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:3699 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4010 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4065 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4066 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4085 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/unified-agent.service.ts:4790 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:193 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:194 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:195 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:214 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/wallet.controller.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:60 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/webinar.controller.ts:78 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.controller.ts:100 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/whatsapp-brain.service.ts:49 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:53 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:348 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:376 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kyc/kyc.service.ts:400 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/logging/structured-logger.ts:17 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/marketing/marketing.controller.ts:181 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:439 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/member-area/member-area.controller.ts:492 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-auth.controller.ts:346 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:114 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:489 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:202 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:235 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:243 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:336 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:371 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:151 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:183 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:215 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:285 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:287 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:301 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:499 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:572 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/queue/queue.ts:217 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:18 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:19 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/reports/reports.service.ts:438 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:68 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/team/team.service.ts:107 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:167 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:314 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:708 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:721 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhook-dispatcher.service.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:187 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/webhooks/webhooks.controller.ts:201 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/whatsapp/agent-events.service.ts:120 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:337 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:379 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:484 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:493 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:755 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2065 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2111 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2132 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2169 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2236 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:80 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:273 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:330 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:348 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:709 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:246 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:90 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:96 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:110 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:405 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:483 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:555 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:557 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:684 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1227 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1239 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1271 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1304 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1326 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1402 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1404 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:143 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:498 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:503 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:607 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:617 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:733 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:750 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:841 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:890 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:505 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:551 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:614 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1401 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1895 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2180 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:70 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:80 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/kloel.controller.ts:24 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/kloel.controller.ts:28 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:15 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:18 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/media/media.controller.ts:21 | File upload without size limit — large files may exhaust memory or storage |
| HIGH | backend/src/media/media.controller.ts:23 | File upload without size limit — large files may exhaust memory or storage |

### EDGE_CASE_PAGINATION (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/common/middleware/prompt-sanitizer.middleware.ts:27 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:260 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:262 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |
| HIGH | backend/src/kloel/product-sub-resources.controller.ts:924 | Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed |

### EDGE_CASE_STRING (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/auth/dto/whatsapp-auth.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/kyc/dto/kyc-document-type.dto.ts:4 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:20 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:21 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/reports/dto/report-filters.dto.ts:22 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |
| HIGH | backend/src/team/dto/invite-member.dto.ts:7 | @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB |

### EMPTY_CATCH (38)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/audit/audit.service.ts:90 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/autopilot/autopilot.service.ts:333 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/autopilot/autopilot.service.ts:1922 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:760 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:775 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:883 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:927 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/checkout/checkout-webhook.controller.ts:942 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/common/idempotency.guard.ts:202 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/followup/followup.service.ts:75 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/inbox-events.service.ts:70 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/inbox/omnichannel.service.ts:130 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/conversational-onboarding.service.ts:540 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel-conversation-store.ts:46 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel-conversation-store.ts:89 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel-tool-router.ts:114 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:1793 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/llm-budget.service.ts:112 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:230 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:273 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/sales.controller.ts:314 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/unified-agent.service.ts:3242 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/prisma/prisma.service.ts:38 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:155 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:170 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:192 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:222 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:316 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:344 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:390 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/payment-webhook.controller.ts:402 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/webhooks/webhooks.service.ts:348 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:150 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:180 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/db.ts:26 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:211 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/queue.ts:289 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/queue.ts:403 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (33)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:102 | Environment variable RATE_LIMIT_DISABLED is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-url.util.ts:43 | Environment variable NEXT_PUBLIC_CHECKOUT_DOMAIN is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-url.util.ts:44 | Environment variable CHECKOUT_DOMAIN is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/resolve-redis-url.ts:74 | Environment variable REDIS_MODE is referenced but not documented in .env.example |
| WARNING | backend/src/common/sales-templates.ts:76 | Environment variable DEFAULT_CALENDAR_LINK is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:5 | Environment variable SENTRY_RELEASE is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:7 | Environment variable VERCEL_GIT_COMMIT_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:8 | Environment variable GITHUB_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:13 | Environment variable SENTRY_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:105 | Environment variable ASAAS_API_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:110 | Environment variable ASAAS_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:164 | Environment variable AUDIO_FETCH_ALLOWLIST is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:167 | Environment variable R2_PUBLIC_URL is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/kloel-stream-writer.ts:31 | Environment variable KLOEL_STREAM_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/llm-budget.service.ts:137 | Environment variable LLM_BUDGET_DEFAULT_CENTS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:215 | Environment variable MERCADOPAGO_PLATFORM_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:219 | Environment variable MERCADOPAGO_INTEGRATOR_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:223 | Environment variable MERCADOPAGO_CORPORATION_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:233 | Environment variable ENCRYPTION_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:234 | Environment variable PROVIDER_SECRET_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:259 | Environment variable LLM_MAX_COMPLETION_TOKENS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:260 | Environment variable LLM_MAX_INPUT_CHARS is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:105 | Environment variable META_ACCESS_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:108 | Environment variable META_PHONE_NUMBER_ID is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:111 | Environment variable META_WABA_ID is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.controller.ts:46 | Environment variable PULSE_RUNTIME_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:599 | Environment variable PULSE_BACKEND_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:607 | Environment variable PULSE_STALE_SWEEP_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:615 | Environment variable PULSE_FRONTEND_PRUNE_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:632 | Environment variable RAILWAY_REPLICA_ID is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:633 | Environment variable RAILWAY_SERVICE_ID is referenced but not documented in .env.example |
| WARNING | worker/providers/whatsapp-engine.ts:49 | Environment variable WHATSAPP_ACTION_LOCK_TEST_ENFORCE is referenced but not documented in .env.example |
| WARNING | worker/pulse-runtime.ts:38 | Environment variable PULSE_WORKER_HEARTBEAT_MS is referenced but not documented in .env.example |

### FACADE (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:462 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:487 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:686 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:2315 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:590 | [fake_save] setTimeout resets state without API call — fake save feedback |

### FETCH_NO_TIMEOUT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:335 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercado-pago.service.ts:640 | fetch() call without AbortController/signal timeout |

### FINANCIAL_ERROR_SWALLOWED (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-order-support.ts:225 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/mercado-pago-wallet.controller.ts:88 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/wallet.service.ts:499 | catch in financial code handles error without rethrow |

### FINDMANY_NO_PAGINATION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/inbox/inbox.service.ts:381 | findMany() on Message without pagination (take/cursor) — unbounded query |
| HIGH | backend/src/kloel/kloel.service.ts:3647 | findMany() on ChatMessage without pagination (take/cursor) — unbounded query |

### FLOATING_PROMISE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel.service.ts:918 | .then() call without .catch() — unhandled promise rejection |
| HIGH | backend/src/kloel/kloel.service.ts:1611 | .then() call without .catch() — unhandled promise rejection |
| HIGH | backend/src/kloel/kloel.service.ts:1721 | .then() call without .catch() — unhandled promise rejection |

### HARDCODED_INTERNAL_URL (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/main.ts:162 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:513 | Hardcoded internal/infrastructure URL: http://localhost |

### HARDCODED_PROD_URL (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | frontend/src/components/kloel/carteira.tsx:2887 | Hardcoded production URL: https://app.kloel.com |
| INFO | frontend/src/lib/http.ts:95 | Hardcoded production URL: https://api.kloel.com |
| INFO | backend/src/kloel/mercado-pago-wallet.controller.ts:38 | Hardcoded production URL: https://app.kloel.com |
| INFO | backend/src/kloel/mercado-pago.service.ts:478 | Hardcoded production URL: https://app.kloel.com |
| INFO | backend/src/main.ts:158 | Hardcoded production URL: https://pay.kloel.com |

### IDEMPOTENCY_MISSING (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/affiliate/affiliate.controller.ts:522 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/wallet.controller.ts:129 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |

### JSON_PARSE_UNSAFE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:431 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
| HIGH | backend/src/kloel/wallet-ledger.service.ts:91 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |

### LICENSE_UNKNOWN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | .license-allowlist.json:0 | No license allowlist found — create .license-allowlist.json to document approved exceptions |

### MIGRATION_NO_ROLLBACK (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/prisma/migrations/20260406130000_add_checkout_links_and_kinds/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408190000_add_checkout_shipping_and_affiliate_config/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |
| HIGH | backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql:0 | Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback |

### MONITORING_MISSING (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |
| HIGH | /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts:0 | Financial service has no structured logging |

### NETWORK_OFFLINE_DATA_LOST (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:0 | Payment/checkout form has no offline protection — user loses entered data on connection drop |

### NETWORK_SLOW_UNUSABLE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:0 | Page fetches async data but has no loading state — blank/broken UI on slow network |

### N_PLUS_ONE_QUERY (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:212 | Prisma query inside loop — potential N+1 query problem |
| WARNING | backend/src/reports/reports.service.ts:111 | Prisma query inside loop — potential N+1 query problem |

### OBSERVABILITY_NO_ALERTING (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-order-support.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/checkout/checkout.service.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |
| HIGH | backend/src/kloel/mercado-pago-wallet.controller.ts:0 | Payment/financial error caught without external alert — payment failures may go unnoticed for hours |

### OBSERVABILITY_NO_TRACING (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/audio.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/kloel/mercado-pago.service.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |
| HIGH | backend/src/whatsapp/providers/waha.provider.ts:0 | Outbound HTTP call without correlation ID header — cannot trace request through external services |

### ORDERING_WEBHOOK_OOO (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/mercado-pago-webhook-signature.util.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/common/utils/webhook-challenge-response.util.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state |

### ORPHANED_FILE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/cost-alerting.service.ts:1 | File 'cost-alerting.service.ts' is not imported by any other backend file |

### PRISMA_ANY_ACCESS (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/common/ledger-reconciliation.service.ts:81 | Prisma accessed via untyped \`prismaAny\` or \`(this.prisma as any)\` — model not yet in generated schema |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:227 | Prisma accessed via untyped \`prismaAny\` or \`(this.prisma as any)\` — model not yet in generated schema |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:243 | Prisma accessed via untyped \`prismaAny\` or \`(this.prisma as any)\` — model not yet in generated schema |
| WARNING | backend/src/kloel/asaas.service.ts:670 | Prisma accessed via untyped \`prismaAny\` or \`(this.prisma as any)\` — model not yet in generated schema |
| WARNING | backend/src/kloel/asaas.service.ts:679 | Prisma accessed via untyped \`prismaAny\` or \`(this.prisma as any)\` — model not yet in generated schema |

### PROXY_NO_UPSTREAM (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/api/auth/logout/route.ts:1 | Proxy POST /api/auth/logout -\> /auth/logout has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy GET /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy POST /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy PUT /api/marketing/:path -\> /marketing/:path has no backend route |
| WARNING | frontend/src/app/api/marketing/[...path]/route.ts:1 | Proxy DELETE /api/marketing/:path -\> /marketing/:path has no backend route |

### QUEUE_NO_PROCESSOR (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/campaigns/campaigns.service.ts:113 | Queue job 'process-campaign' is produced but has no worker processor |
| HIGH | backend/src/webhooks/webhook-dispatcher.service.ts:36 | Queue job 'send-webhook' is produced but has no worker processor |
| HIGH | worker/flow-engine-global.ts:189 | Queue job 'analyze-contact' is produced but has no worker processor |
| HIGH | worker/flow-engine-global.ts:809 | Queue job 'extract-facts' is produced but has no worker processor |
| HIGH | worker/providers/campaigns.ts:22 | Queue job 'process-campaign-action' is produced but has no worker processor |
| HIGH | worker/voice-processor.ts:167 | Queue job 'process-message' is produced but has no worker processor |

### RACE_CONDITION_OVERWRITE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |

### RESPONSE_INCONSISTENT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/product.controller.ts:354 | Controller mixes wrapped ({ data: … }) and raw return styles |
| INFO | backend/src/member-area/member-area.controller.ts:421 | Controller mixes wrapped ({ data: … }) and raw return styles |

### ROUTE_NO_CALLER (14)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/gdpr/data-delete.controller.ts:21 | POST /gdpr/delete is not called by any frontend code |
| INFO | backend/src/gdpr/data-export.controller.ts:17 | POST /gdpr/export is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:657 | GET /kloel/threads/search is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:810 | POST /kloel/threads/:id/messages is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:66 | POST /kloel/upload is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:28 | GET /launch/launchers is not called by any frontend code |
| INFO | backend/src/marketing/marketing.controller.ts:420 | GET /marketing/channels is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:49 | GET /meta/instagram/profile is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:77 | GET /meta/instagram/insights/account is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:466 | POST /whatsapp-api/session/pause-agent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:473 | POST /whatsapp-api/session/reconcile is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:480 | GET /whatsapp-api/session/proofs is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:489 | POST /whatsapp-api/session/stream-token is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:507 | POST /whatsapp-api/session/action-turn is not called by any frontend code |

### SLOW_QUERY (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/crm/crm.service.ts:463 | findMany without select or include — returns all columns from DB |

### STRINGIFY_CIRCULAR_RISK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/financial-alert.service.ts:83 | JSON.stringify() on request/socket object — circular reference risk |

### TEST_NO_ASSERTION (16)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/checkout-marketplace-pricing.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-order-pricing.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-order-support.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-public.controller.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout-shipping-profile.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/checkout/checkout.service.public.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/kloel-context-formatter.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/mercado-pago-order.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:0 | jest.mock() used without mock restoration — may cause test pollution across suites |
| WARNING | backend/src/kloel/openai-wrapper.spec.ts:95 | Hardcoded sleep of 10000ms in test — use jest.useFakeTimers() or await event instead |
| WARNING | backend/src/kloel/thread-search.util.spec.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.view-models.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/search/conversation-search-utils.test.ts:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |
| WARNING | frontend/src/components/kloel/theme/theme-provider.test.tsx:0 | Financial test file has no error/rejection case tests — happy path only is insufficient |

### TIMEOUT_NO_CLEANUP (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:114 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:52 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:86 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:19 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:110 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterAfterPayTab.tsx:33 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:499 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:411 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:94 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |

### TOFIX_WITHOUT_PARSE (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel-context-formatter.ts:161 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago-order.util.ts:77 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:135 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:1163 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:1164 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/wallet.service.ts:89 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |

### TRANSACTION_NO_ISOLATION (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:39 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-payment.service.ts:183 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-plan-link.manager.ts:195 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout-webhook.controller.ts:555 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout.service.ts:125 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/checkout/checkout.service.ts:448 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/payment.service.ts:129 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/smart-payment.service.ts:403 | $transaction in financial file without isolationLevel specified |
| HIGH | backend/src/kloel/wallet.service.ts:185 | $transaction in financial file without isolationLevel specified |

### UI_DEAD_HANDLER (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(main)/products/new/page.tsx:1825 | clickable "(sem texto)" has dead handler |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:638 | clickable "))}" has dead handler |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:861 | form "form" has dead handler |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:628 | clickable "(sem texto)" has dead handler |

### UNBOUNDED_RESULT (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/checkout.service.ts:230 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:81 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/crm/crm.service.ts:463 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/dashboard/dashboard.service.ts:173 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:385 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:914 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:1717 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:3647 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:3810 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:4169 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/launch/launch.service.ts:9 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/partnerships/partnerships.service.ts:43 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:60 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:92 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:178 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:246 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/reports/reports.service.ts:372 | findMany without take — may return all rows and cause OOM or slow response |

### UNHANDLED_PROMISE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/kloel/kloel.service.ts:918 | .then() without .catch() — unhandled promise rejection |
| WARNING | backend/src/kloel/kloel.service.ts:1611 | .then() without .catch() — unhandled promise rejection |
| WARNING | backend/src/kloel/kloel.service.ts:1721 | .then() without .catch() — unhandled promise rejection |

### UNSAFE_ANY_CAST (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/wallet.service.ts:132 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:187 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:209 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:216 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:229 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:238 | \`as any\` cast in financial/auth code — type safety bypassed |
| HIGH | backend/src/kloel/wallet.service.ts:311 | \`as any\` cast in financial/auth code — type safety bypassed |

### VISUAL_CONTRACT_EMOJI_UI (9)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:206 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/canvas/CanvasEditor.tsx:1392 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:70 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:398 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:36 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:37 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:38 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:39 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:40 | Emoji found in product UI code, violating the restrained Kloel visual contract. |

### VISUAL_CONTRACT_GENERIC_SPINNER (38)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/autopilot/page.tsx:1011 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/autopilot/page.tsx:1595 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:301 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:331 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:337 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:420 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:449 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/followups/page.tsx:211 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/followups/page.tsx:368 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:151 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:213 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:294 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/leads/page.tsx:313 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:447 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:797 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:985 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:1069 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:379 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/AgentDesktopViewer.tsx:246 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:102 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:166 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/UniversalComposer.tsx:249 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/analytics-settings-section.tsx:109 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/analytics-settings-section.tsx:126 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:342 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:356 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/test-kloel-modal.tsx:77 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:710 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:1592 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:105 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCommissionsTab.tsx:102 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCouponsTab.tsx:84 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:86 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:370 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:96 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:461 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductReviewsTab.tsx:57 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductUrlsTab.tsx:187 | Generic spinner detected where the visual contract requires branded loading treatment. |

### VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS (397)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutBlanc.tsx:72 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:61 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:66 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutNoir.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutShell.tsx:87 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutShell.tsx:88 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutShell.tsx:94 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutShell.tsx:120 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CheckoutShell.tsx:121 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:109 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:110 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:143 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:106 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:146 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:41 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/StockCounter.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:120 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:132 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:134 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:170 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:186 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:61 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/boleto/page.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:93 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:94 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:97 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/pix/page.tsx:108 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:54 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:83 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:86 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:182 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:183 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:187 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/analytics/page.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:314 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:316 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:390 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:397 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/autopilot/page.tsx:910 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:32 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:40 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:107 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/inicio/page.tsx:171 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/layout.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/layout.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:118 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:119 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:136 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:137 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:99 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:173 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:202 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:220 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:615 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:704 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/fale/page.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:270 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:304 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:442 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:476 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:507 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/page.tsx:158 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/recupere/page.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/ver-todas/page.tsx:132 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:176 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:177 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:178 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:179 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:284 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/followups/page.tsx:209 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:292 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:104 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/vendas/gestao-vendas/page.tsx:96 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/video/page.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:277 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:315 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/webinarios/page.tsx:329 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:53 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:123 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/whatsapp/page.tsx:128 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/onboarding-chat/page.tsx:322 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/onboarding-chat/page.tsx:400 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/pay/[id]/page.tsx:139 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/privacy/page.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:442 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:180 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:243 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:55 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:191 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:192 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:193 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:194 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:196 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/loading.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:403 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:433 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:449 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:296 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:297 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:298 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:101 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:142 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:157 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:56 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:113 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:129 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:151 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:95 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:96 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:228 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:232 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:257 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:275 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:300 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:88 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:109 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:116 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/SocialProofToast.tsx:124 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/common/CookieBanner.tsx:86 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:236 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:237 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:238 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:239 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/FlowBuilder.tsx:240 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:32 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/icons/WhatsAppIcon.tsx:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:335 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:349 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:379 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:398 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:159 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:162 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:163 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:169 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:188 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:392 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:568 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:615 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:646 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:175 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:214 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/PulseLoader.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/UniversalComposer.tsx:231 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:192 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:258 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:283 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:284 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:630 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:108 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:121 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:134 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/auth-provider.tsx:102 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:129 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:133 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:137 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:732 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:266 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:268 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:269 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:273 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:274 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:354 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:355 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:356 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:357 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:865 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:15 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:612 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:58 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:335 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:369 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:783 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:902 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:953 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:588 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:327 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:339 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:485 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:536 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:665 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:72 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:74 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:75 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:5 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:6 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:7 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:15 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/thanos-icons.ts:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:134 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:148 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:162 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:484 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:561 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:580 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:401 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:402 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:403 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:809 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:874 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:741 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:757 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:770 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:104 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:364 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:505 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:514 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/account-settings-section.tsx:155 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:75 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/billing-settings-section.tsx:211 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:741 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:964 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:131 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:133 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:135 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/contract.tsx:137 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/crm-settings-section.tsx:638 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:78 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:79 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:130 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/kloel-status-card.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/missing-steps-card.tsx:72 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:102 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:110 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/realtime-usage-card.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/realtime-usage-card.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/system-alerts-card.tsx:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:195 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:224 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:228 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:472 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/sites/SitesView.tsx:628 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeProvider.tsx:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeToggle.tsx:108 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:165 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:168 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:172 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:175 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:178 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:130 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:142 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:83 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:229 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:363 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:307 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:382 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:563 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:254 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:64 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCheckoutsTab.tsx:166 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductPlansTab.tsx:335 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/hooks/useCheckoutEditor.ts:168 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/BackgroundManager.ts:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/ShapeManager.ts:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:117 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:126 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:44 | Hardcoded hex color outside the approved visual token set. |

### WEBHOOK_ASAAS_BROKEN (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | backend/src/health/system-health.controller.ts:12 | Backend unreachable — GET /health/system timed out or connection refused |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [BACKUP_MISSING] .backup-manifest.json:0 — No recent DB backup found — backup manifest missing or older than 24 h
   Evidence: Backup manifest exists but lastBackup timestamp is stale (>24 h) or missing
2. [BACKUP_MISSING] .backup-validation.log:0 — No backup restore-test validation log found — backup has never been verified
   Evidence: A restore test must be performed and logged; create .backup-validation.log with timestamp + result
3. [E2E_REGISTRATION_BROKEN] backend/src/auth/auth.controller.ts:36 — POST /auth/register did not return 201
   Evidence: Status: 0, Body: {"error":"fetch failed"}
4. [BRUTE_FORCE_VULNERABLE] backend/src (POST /auth/login):0 — No rate limiting on POST /auth/login — brute-force attack is possible
   Evidence: Fired 20 rapid login requests. Received 0 HTTP 429 responses. All statuses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]. The auth throttle (5 req/min) does not appear to be active. Configure @nestjs/throttler on the auth controller.
5. [WEBHOOK_ASAAS_BROKEN] backend/src/health/system-health.controller.ts:12 — Backend unreachable — GET /health/system timed out or connection refused
   Evidence: Backend URL: http://localhost:3001, error: fetch failed
6. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:462 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
7. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:487 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
8. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:686 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(() => setProductSaved(false), 2000);
9. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:2315 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(() => setPlanSaved(false), 2000);
10. [FACADE] frontend/src/components/plans/PlanAIConfigTab.tsx:590 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: savedTimer.current = setTimeout(() => setSaved(false), 3000);
11. [AUDIT_DELETION_NO_LOG] backend/src/kloel/kloel.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
12. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/providers/waha.provider.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
13. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/whatsapp-normalization.util.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
14. [NETWORK_OFFLINE_DATA_LOST] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
15. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/reset-password/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
16. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/verify-email/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
17. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/send-code/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
18. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/auth/whatsapp/verify/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
19. [CACHE_STALE_AFTER_WRITE] frontend/src/app/api/pulse/live/heartbeat/route.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
20. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/PulseFrontendHeartbeat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
21. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/auth/auth-modal.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
22. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/landing/FloatingChat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
23. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterAvalTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
24. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterCampanhasTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
25. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
26. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
27. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCampaignsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
28. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/cookie-consent.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
29. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/mercado-pago.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
30. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:97 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
31. [CACHE_REDIS_STALE] backend/src/kloel/mercado-pago.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
32. [RACE_CONDITION_OVERWRITE] backend/src/kloel/mercado-pago.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
33. [COOKIE_NOT_HTTPONLY] backend/src/cookie-consent/cookie-consent.controller.ts:67 — Cookie set without httpOnly: true — vulnerable to XSS theft
   Evidence: response.cookie(COOKIE_NAME, serialized, {
34. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
35. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/waha.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
36. [CRUD_BROKEN] backend/src/products:0 — CRUD CREATE — expected 200/201, got 0
   Evidence: {"error":"fetch failed"}
37. [DATA_ORDER_NO_PAYMENT] /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet.service.ts:262 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'requestWithdrawal' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
38. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260406130000_add_checkout_links_and_kinds/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
39. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408190000_add_checkout_shipping_and_affiliate_config/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
40. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
41. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
42. [DOCKER_BUILD_FAILS] /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
43. [DOCKER_BUILD_FAILS] /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src/Dockerfile:0 — No Dockerfile found for frontend
   Evidence: frontend/Dockerfile does not exist. Cannot build production Docker image.
44. [E2E_FLOW_NOT_TESTED] /home/runner/work/whatsapp_saas/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
45. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
46. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
47. [EDGE_CASE_STRING] backend/src/auth/dto/whatsapp-auth.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
48. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:27 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
49. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:70 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
50. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:80 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
51. [EDGE_CASE_FILE] backend/src/kloel/kloel.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
52. [EDGE_CASE_FILE] backend/src/kloel/kloel.controller.ts:28 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
53. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:15 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
54. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:260 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
55. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:262 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
56. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:924 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
57. [EDGE_CASE_STRING] backend/src/kyc/dto/kyc-document-type.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
58. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
59. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
60. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
61. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:21 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
62. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:23 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
63. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
64. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
65. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
66. [EDGE_CASE_STRING] backend/src/team/dto/invite-member.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
67. [FINANCIAL_ERROR_SWALLOWED] backend/src/checkout/checkout-order-support.ts:225 — catch in financial code handles error without rethrow
   Evidence: } catch (error) {
68. [FINANCIAL_ERROR_SWALLOWED] backend/src/kloel/mercado-pago-wallet.controller.ts:88 — catch in financial code handles error without rethrow
   Evidence: } catch (error) {
69. [FINANCIAL_ERROR_SWALLOWED] backend/src/kloel/wallet.service.ts:499 — catch in financial code handles error without rethrow
   Evidence: } catch (err) {
70. [TOFIX_WITHOUT_PARSE] backend/src/kloel/kloel-context-formatter.ts:161 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: `  - média recente: ${averageRating.toFixed(1)}/5`,
71. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago-order.util.ts:77 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: return (Math.max(0, Math.round(Number(value || 0))) / 100).toFixed(2);
72. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:135 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: return (Math.max(0, value) / 100).toFixed(2);
73. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:1163 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: amount: response.transaction_amount?.toFixed(2),
74. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:1164 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: paid_amount: response.transaction_details?.total_paid_amount?.toFixed(2),
75. [TOFIX_WITHOUT_PARSE] backend/src/kloel/wallet.service.ts:89 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: `Split: R$ ${saleAmount.toFixed(2)} -> Líquido: R$ ${netAmount.toFixed(2)} ` +
76. [FETCH_NO_TIMEOUT] backend/src/kloel/mercado-pago.service.ts:335 — fetch() call without AbortController/signal timeout
   Evidence: const response = await fetch('https://api.mercadopago.com/oauth/token', { — wrap with AbortController and setTimeout to avoid hanging requests
77. [FETCH_NO_TIMEOUT] backend/src/kloel/mercado-pago.service.ts:640 — fetch() call without AbortController/signal timeout
   Evidence: const response = await fetch('https://api.mercadopago.com/v1/payment_methods', { — wrap with AbortController and setTimeout to avoid hanging requests
78. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:522 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
79. [IDEMPOTENCY_MISSING] backend/src/campaigns/campaigns.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
80. [IDEMPOTENCY_MISSING] backend/src/kloel/smart-payment.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
81. [IDEMPOTENCY_MISSING] backend/src/kloel/wallet.controller.ts:129 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
82. [IDEMPOTENCY_MISSING] backend/src/webhooks/asaas-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
83. [JSON_PARSE_UNSAFE] backend/src/kloel/mercado-pago.service.ts:431 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
84. [JSON_PARSE_UNSAFE] backend/src/kloel/wallet-ledger.service.ts:91 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue)
85. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:918 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((rows: Array<{ id: string }>) => rows.length); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
86. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:1611 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((thread: { id: string } | null) => (thread ? 1 : 0)); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
87. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:1721 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((rows: Array<{ id: string }>) => rows.length); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
88. [MONITORING_MISSING] /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
89. [MONITORING_MISSING] /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts:0 — Financial service has no structured logging
   Evidence: wallet-ledger.service.ts: No Logger usage found. Financial operations (payments, withdrawals) must be logged for audit and debugging.
90. [OBSERVABILITY_NO_TRACING] backend/src/kloel/audio.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
91. [OBSERVABILITY_NO_TRACING] backend/src/kloel/mercado-pago.service.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
92. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/providers/waha.provider.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
93. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-order-support.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
94. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
95. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/mercado-pago-wallet.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
96. [ORDERING_WEBHOOK_OOO] backend/src/checkout/mercado-pago-webhook-signature.util.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
97. [ORDERING_WEBHOOK_OOO] backend/src/common/utils/webhook-challenge-response.util.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
98. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/asaas-webhook.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
99. [TRANSACTION_NO_ISOLATION] backend/src/billing/payment-method.service.ts:39 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
100. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:183 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
101. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-plan-link.manager.ts:195 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
102. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-webhook.controller.ts:555 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
103. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:125 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
104. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:448 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
105. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:381 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
106. [FINDMANY_NO_PAGINATION] backend/src/kloel/kloel.service.ts:3647 — findMany() on ChatMessage without pagination (take/cursor) — unbounded query
   Evidence: const messages = await this.prisma.chatMessage.findMany({
107. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:129 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
108. [TRANSACTION_NO_ISOLATION] backend/src/kloel/smart-payment.service.ts:403 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
109. [TRANSACTION_NO_ISOLATION] backend/src/kloel/wallet.service.ts:185 — $transaction in financial file without isolationLevel specified
   Evidence: const outcome = await this.prisma.$transaction(
110. [QUEUE_NO_PROCESSOR] backend/src/campaigns/campaigns.service.ts:113 — Queue job 'process-campaign' is produced but has no worker processor
   Evidence: No 'case "process-campaign":' or 'job.name === "process-campaign"' found in worker — jobs will silently pile up
111. [QUEUE_NO_PROCESSOR] backend/src/webhooks/webhook-dispatcher.service.ts:36 — Queue job 'send-webhook' is produced but has no worker processor
   Evidence: No 'case "send-webhook":' or 'job.name === "send-webhook"' found in worker — jobs will silently pile up
112. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:189 — Queue job 'analyze-contact' is produced but has no worker processor
   Evidence: No 'case "analyze-contact":' or 'job.name === "analyze-contact"' found in worker — jobs will silently pile up
113. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:809 — Queue job 'extract-facts' is produced but has no worker processor
   Evidence: No 'case "extract-facts":' or 'job.name === "extract-facts"' found in worker — jobs will silently pile up
114. [QUEUE_NO_PROCESSOR] worker/providers/campaigns.ts:22 — Queue job 'process-campaign-action' is produced but has no worker processor
   Evidence: No 'case "process-campaign-action":' or 'job.name === "process-campaign-action"' found in worker — jobs will silently pile up
115. [QUEUE_NO_PROCESSOR] worker/voice-processor.ts:167 — Queue job 'process-message' is produced but has no worker processor
   Evidence: No 'case "process-message":' or 'job.name === "process-message"' found in worker — jobs will silently pile up
116. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:132 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
117. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:187 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const walletTx = (await (tx as any).kloelWalletTransaction.findUnique({
118. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:209 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const statusFlip = await (tx as any).kloelWalletTransaction.updateMany({
119. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:216 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await (tx as any).kloelWallet.update({
120. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:229 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
121. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:238 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
122. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:311 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
123. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:206 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (©) from product-facing UI and use text or SVG iconography instead.
124. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/autopilot/page.tsx:1011 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
125. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/autopilot/page.tsx:1595 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
126. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:301 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
127. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:331 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
128. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:337 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
129. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:420 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
130. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:449 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
131. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/followups/page.tsx:211 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
132. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/followups/page.tsx:368 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
133. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:151 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
134. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:213 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
135. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:294 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
136. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/leads/page.tsx:313 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
137. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:447 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
138. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:797 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
139. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:985 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
140. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:1069 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
141. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(public)/onboarding-chat/page.tsx:379 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
142. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/canvas/CanvasEditor.tsx:1392 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↔) from product-facing UI and use text or SVG iconography instead.
143. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/AgentDesktopViewer.tsx:246 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
144. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:102 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
145. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:166 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
146. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/UniversalComposer.tsx:249 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
147. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:70 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
148. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:398 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
149. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:36 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📸) from product-facing UI and use text or SVG iconography instead.
150. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:37 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (🎬) from product-facing UI and use text or SVG iconography instead.
151. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:38 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (🎙) from product-facing UI and use text or SVG iconography instead.
152. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:39 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (💬) from product-facing UI and use text or SVG iconography instead.
153. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:40 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📊) from product-facing UI and use text or SVG iconography instead.
154. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/analytics-settings-section.tsx:109 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
155. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/analytics-settings-section.tsx:126 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
156. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:342 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
157. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:356 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
158. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/test-kloel-modal.tsx:77 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
159. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/plans/PlanAIConfigTab.tsx:710 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
160. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/plans/PlanAIConfigTab.tsx:1592 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
161. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCheckoutsTab.tsx:105 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
162. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCommissionsTab.tsx:102 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
163. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCouponsTab.tsx:84 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
164. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductGeneralTab.tsx:86 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
165. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductGeneralTab.tsx:370 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
166. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductPlansTab.tsx:96 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
167. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductPlansTab.tsx:461 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
168. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductReviewsTab.tsx:57 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
169. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductUrlsTab.tsx:187 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
```