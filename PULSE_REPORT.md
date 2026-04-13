# PULSE REPORT — 2026-04-13T19:49:06.324Z

## Certification Status: PARTIAL

- Score: 48/100 (raw scan: 71/100)
- Environment: scan
- Commit: a0892ebee07af0656e7a7a815a48c0e5bcb27f8e
- Manifest: /Users/danielpenin/whatsapp_saas/pulse.manifest.json
- Project: KLOEL (kloel)
- Authority: advisory-only. PULSE informs, prioritizes, and injects context; it does not block execution on its own.

## Codebase Truth

- Frontend pages discovered: 96
- User-facing pages: 96
- Raw modules discovered: 32
- Raw mutation flow candidates: 146

## Resolved Manifest

- Resolved modules: 32/32
- Resolved flow groups: 47/47
- Grouped semantic flow groups: 39
- Shared capability groups: 15
- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0

## Health Score: 48/100
`██████████░░░░░░░░░░` 48%

## Advisory Gates

| Gate | Status | Failure Class | Reason |
|------|--------|---------------|--------|
| scopeClosed | PASS | — | All discovered surfaces are declared or explicitly excluded in the manifest. |
| adapterSupported | PASS | — | All declared stack adapters are supported by the current PULSE foundation. |
| specComplete | PASS | — | pulse.manifest.json is present and passed structural validation. |
| truthExtractionPass | PASS | — | Resolved manifest is aligned: 32 module(s), 47 flow group(s), no blocking drift. |
| staticPass | FAIL | product_failure | Static certification found 154 critical/high blocking finding(s). |
| runtimePass | FAIL | missing_evidence | Runtime evidence was not collected. Run PULSE with --deep or --total. |
| browserPass | PASS | — | Browser certification is not required in this environment. |
| flowPass | PASS | — | No critical flows are required in the current environment. |
| invariantPass | FAIL | product_failure | Invariant checks are failing: financial-audit-trail. |
| securityPass | FAIL | product_failure | Security certification found blocking findings. Blocking types: COOKIE_NOT_HTTPONLY. |
| isolationPass | PASS | — | No blocking tenant isolation findings are open. |
| recoveryPass | FAIL | product_failure | Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, MIGRATION_NO_ROLLBACK. |
| performancePass | FAIL | missing_evidence | Performance evidence was not exercised in scan mode. |
| observabilityPass | FAIL | product_failure | Observability certification found blocking findings. Blocking types: AUDIT_ADMIN_NO_LOG, AUDIT_DELETION_NO_LOG, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING. |
| customerPass | FAIL | missing_evidence | customer synthetic evidence is missing for: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox. |
| operatorPass | FAIL | missing_evidence | operator synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run. |
| adminPass | FAIL | missing_evidence | admin synthetic evidence is missing for: admin-settings-kyc-banking, admin-whatsapp-session-control. |
| soakPass | FAIL | missing_evidence | soak synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run, system-payment-reconciliation. |
| syntheticCoveragePass | PASS | — | Synthetic coverage maps 96/96 non-ops page(s) to declared scenarios. |
| evidenceFresh | PASS | — | Execution trace and attached evidence are internally coherent for this run. |
| pulseSelfTrustPass | PASS | — | All discovered parser checks loaded successfully. |

## Certification Tiers

- Target: GLOBAL
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
- Recovery: Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Customer: customer scenarios: 1 passed, 0 failed/checker-gap, 3 missing evidence.
- Operator: operator scenarios: 7 passed, 0 failed/checker-gap, 2 missing evidence.
- Admin: admin scenarios: 1 passed, 0 failed/checker-gap, 2 missing evidence.
- Soak: soak scenarios: 0 passed, 0 failed/checker-gap, 3 missing evidence.
- Synthetic Coverage: Synthetic coverage maps 96/96 non-ops page(s) to declared scenarios.
- Execution Trace: Execution completed: 111 phase(s) passed.
- Truth: Resolved manifest is aligned: 32 module(s), 47 flow group(s), no blocking drift.

## Human Replacement

- Status: NOT_READY
- Final target: GLOBAL
- Covered pages: 96/96
- Uncovered pages: 0
- Accepted critical flows remaining: 0
- Pending critical scenarios: 8
- Customer scenarios: 1/4 passed
- Operator scenarios: 7/9 passed
- Admin scenarios: 1/3 passed
- Soak scenarios: 0/3 passed

## Convergence Queue

- Queue length: 15
- Scenario units: 8
- Security units: 1
- Gate units: 5
- Static units: 1
- Priorities: P0=5, P1=4, P2=5, P3=1
- Pending async expectations: 12
- Artifact: PULSE_CONVERGENCE_PLAN.md
- CLI Directive: PULSE_CLI_DIRECTIVE.json
- Artifact Index: PULSE_ARTIFACT_INDEX.json

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
| ... | ... | ... | ... | 5 more units in PULSE_CONVERGENCE_PLAN.md | ... |

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

- truth | executed=true | Resolved manifest built from 96 page(s), 32 module(s), 47 flow group(s).
- Artifacts: PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, AUDIT_FEATURE_MATRIX.md, PULSE_REPORT.md | Metrics: unresolvedModules=0, unresolvedFlowGroups=0, orphanManualModules=0, orphanFlowSpecs=0

### staticPass

- artifact | executed=true | 154 critical/high blocking finding(s) remain in the scan graph.
- Artifacts: PULSE_REPORT.md, PULSE_CERTIFICATE.json | Metrics: blockingBreaks=154, totalBreaks=1190

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

- artifact | executed=true | Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.
- Artifacts: PULSE_RECOVERY_EVIDENCE.json | Metrics: backupManifestPresent=true, backupPolicyPresent=true, backupValidationPresent=true, restoreRunbookPresent=true, disasterRecoveryRunbookPresent=true, disasterRecoveryTestPresent=true, seedScriptPresent=true

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

- artifact | executed=true | Execution in progress: 110 passed, 0 failed, 0 timed out, 1 running.
- Artifacts: PULSE_EXECUTION_TRACE.json, PULSE_REPORT.md, AUDIT_FEATURE_MATRIX.md, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_INVARIANT_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json, PULSE_OBSERVABILITY_EVIDENCE.json, PULSE_RECOVERY_EVIDENCE.json, PULSE_CODEBASE_TRUTH.json, PULSE_RESOLVED_MANIFEST.json, KLOEL_PRODUCT_MAP.md, PULSE_CONVERGENCE_PLAN.json, PULSE_CONVERGENCE_PLAN.md, PULSE_CUSTOMER_EVIDENCE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_ADMIN_EVIDENCE.json, PULSE_SOAK_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 1026 | 4 dead handlers |
| API Calls | 635 | 0 no backend |
| Backend Routes | 644 | 0 empty |
| Prisma Models | 110 | 0 orphaned |
| Facades | 5 | 5 critical, 0 warning |
| Proxy Routes | 61 | 5 no upstream |
| Security | - | 1 issues |
| Data Safety | - | 50 issues |
| Quality | - | 1112 issues |
| Unavailable Checks | - | 0 unavailable |
| Unknown Surfaces | - | 0 undeclared |

## Breaks (1190 total)

### ACCESSIBILITY_VIOLATION (15)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:2199 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:672 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:686 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:717 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:733 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2036 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2049 | \<input\> without associated label or aria-label |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:2560 | Icon-only \<button\> missing aria-label — inaccessible to screen readers |
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

### BACKUP_MISSING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| CRITICAL | .backup-manifest.json:0 | No recent DB backup found — backup manifest missing or older than 24 h |

### BROWSER_INCOMPATIBLE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:752 | CSS feature with limited browser support used without @supports fallback |
| WARNING | frontend/src/app/(checkout)/layout.tsx:0 | Root layout missing viewport meta tag — mobile users see desktop-scaled view |

### CACHE_REDIS_STALE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/billing/payment-method.service.ts:97 | Financial data cached in Redis without TTL — cache never expires, will always be stale |
| HIGH | backend/src/kloel/mercado-pago.service.ts:0 | Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data |

### CACHE_STALE_AFTER_WRITE (11)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(public)/reset-password/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
| HIGH | frontend/src/app/(public)/verify-email/page.tsx:0 | Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation |
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
| WARNING | backend/src/auth/auth.service.ts:16 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-auth.guard.ts:3 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/auth/jwt-config.ts:28 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/common/interfaces/jwt-payload.interface.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/cookie-consent/cookie-consent.controller.ts:2 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/flows/flows.gateway.ts:10 | JWT verification without clock skew tolerance — users may be spuriously logged out |
| WARNING | backend/src/inbox/inbox.gateway.ts:12 | JWT verification without clock skew tolerance — users may be spuriously logged out |

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

### DATA_ORDER_NO_PAYMENT (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:262 | Financial write without existence check in wallet.service.ts |

### DEAD_EXPORT (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/common/cost-alerting.service.ts:4 | Exported symbol 'CostAlertingService' has no references in other files |
| INFO | backend/src/common/ledger-reconciliation.service.ts:69 | Exported symbol 'LedgerReconciliationService' has no references in other files |
| INFO | backend/src/kloel/llm-budget.service.ts:157 | Exported symbol 'estimateChatCostCents' has no references in other files |

### DIVISION_BY_ZERO_RISK (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel-output-sanitizer.ts:2 | Division by variable without zero-check — potential division by zero in financial code |

### DOCKER_BUILD_FAILS (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 | No Dockerfile found for backend |

### E2E_FLOW_NOT_TESTED (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | /Users/danielpenin/whatsapp_saas/e2e:0 | E2E directory exists but no Playwright or Cypress config found — tests cannot run |
| HIGH | .github/workflows/:0 | E2E tests exist but are not included in CI pipeline — they will never catch regressions |

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

### EDGE_CASE_DATE (322)

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
| WARNING | backend/src/crm/neuro-crm.service.ts:419 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:74 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:142 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:144 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:146 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:147 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:148 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:149 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:154 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/dashboard.service.ts:415 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:31 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:37 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:43 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:59 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:90 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/dashboard/home-aggregation.util.ts:95 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/health/system-health.service.ts:30 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:48 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/health/system-health.service.ts:66 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/kloel/kloel.service.ts:788 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1218 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1248 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1269 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1370 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1395 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1498 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:1826 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2063 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2591 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:2722 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3596 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3739 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3760 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:3783 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/kloel.service.ts:4703 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/llm-budget.service.ts:131 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:186 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:209 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:418 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:482 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/memory-management.service.ts:537 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:377 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:389 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:761 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/kloel/mercado-pago.service.ts:897 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/meta/meta-whatsapp.service.ts:110 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:485 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/meta/webhooks/meta-webhook.controller.ts:202 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:235 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:243 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:336 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/partnerships/partnerships.service.ts:371 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:131 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:163 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:195 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:267 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:281 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:478 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/pulse/pulse.service.ts:544 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
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
| WARNING | backend/src/whatsapp/agent-events.service.ts:118 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:324 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:366 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:471 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:480 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:742 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2055 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2101 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2122 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2159 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/cia-runtime.service.ts:2226 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:80 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:260 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:273 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:330 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:348 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:709 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/inbound-processor.service.ts:242 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:90 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:96 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/internal-whatsapp-runtime.controller.ts:245 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/providers/provider-registry.ts:110 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:400 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:478 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:550 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:552 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:679 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1222 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1234 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1266 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1299 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1321 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1397 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-catchup.service.ts:1399 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:140 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:495 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:500 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:604 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:614 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:730 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:747 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:838 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp-watchdog.service.ts:887 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:505 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:551 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:614 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1401 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:1895 | new Date() from user input without validation — invalid dates produce Invalid Date silently |
| WARNING | backend/src/whatsapp/whatsapp.service.ts:2180 | new Date() from user input without validation — invalid dates produce Invalid Date silently |

### EDGE_CASE_FILE (7)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/ai-brain/knowledge-base.controller.ts:17 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:67 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/audio.controller.ts:77 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kloel/pdf-processor.controller.ts:16 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:18 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/kyc/kyc.controller.ts:19 | File upload without MIME type validation — any file type accepted |
| HIGH | backend/src/media/media.controller.ts:24 | File upload without size limit — large files may exhaust memory or storage |

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
| WARNING | backend/src/kloel/kloel-tool-router.ts:102 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/kloel/kloel.service.ts:1817 | catch block only logs without throw/return — error effectively swallowed |
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
| WARNING | backend/src/whatsapp/agent-events.service.ts:148 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | backend/src/whatsapp/agent-events.service.ts:178 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/db.ts:26 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/flow-engine-global.ts:211 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/queue.ts:286 | catch block only logs without throw/return — error effectively swallowed |
| WARNING | worker/queue.ts:400 | catch block only logs without throw/return — error effectively swallowed |

### ENV_NOT_DOCUMENTED (32)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/auth/auth.service.ts:102 | Environment variable RATE_LIMIT_DISABLED is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-url.util.ts:41 | Environment variable NEXT_PUBLIC_CHECKOUT_DOMAIN is referenced but not documented in .env.example |
| WARNING | backend/src/checkout/checkout-public-url.util.ts:42 | Environment variable CHECKOUT_DOMAIN is referenced but not documented in .env.example |
| WARNING | backend/src/common/redis/resolve-redis-url.ts:59 | Environment variable REDIS_MODE is referenced but not documented in .env.example |
| WARNING | backend/src/common/sales-templates.ts:76 | Environment variable DEFAULT_CALENDAR_LINK is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:5 | Environment variable SENTRY_RELEASE is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:7 | Environment variable VERCEL_GIT_COMMIT_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:8 | Environment variable GITHUB_SHA is referenced but not documented in .env.example |
| WARNING | backend/src/instrument.ts:13 | Environment variable SENTRY_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:105 | Environment variable ASAAS_API_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/asaas.service.ts:110 | Environment variable ASAAS_ENVIRONMENT is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:162 | Environment variable AUDIO_FETCH_ALLOWLIST is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/audio.service.ts:165 | Environment variable R2_PUBLIC_URL is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/kloel-stream-writer.ts:34 | Environment variable KLOEL_STREAM_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/llm-budget.service.ts:137 | Environment variable LLM_BUDGET_DEFAULT_CENTS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:211 | Environment variable MERCADOPAGO_PLATFORM_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:215 | Environment variable MERCADOPAGO_INTEGRATOR_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:219 | Environment variable MERCADOPAGO_CORPORATION_ID is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:229 | Environment variable ENCRYPTION_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/mercado-pago.service.ts:230 | Environment variable PROVIDER_SECRET_KEY is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:259 | Environment variable LLM_MAX_COMPLETION_TOKENS is referenced but not documented in .env.example |
| WARNING | backend/src/kloel/openai-wrapper.ts:260 | Environment variable LLM_MAX_INPUT_CHARS is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:101 | Environment variable META_ACCESS_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:104 | Environment variable META_PHONE_NUMBER_ID is referenced but not documented in .env.example |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:107 | Environment variable META_WABA_ID is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.controller.ts:53 | Environment variable PULSE_RUNTIME_TOKEN is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:571 | Environment variable PULSE_BACKEND_HEARTBEAT_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:579 | Environment variable PULSE_STALE_SWEEP_MS is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:596 | Environment variable RAILWAY_REPLICA_ID is referenced but not documented in .env.example |
| WARNING | backend/src/pulse/pulse.service.ts:597 | Environment variable RAILWAY_SERVICE_ID is referenced but not documented in .env.example |
| WARNING | worker/providers/whatsapp-engine.ts:49 | Environment variable WHATSAPP_ACTION_LOCK_TEST_ENFORCE is referenced but not documented in .env.example |
| WARNING | worker/pulse-runtime.ts:36 | Environment variable PULSE_WORKER_HEARTBEAT_MS is referenced but not documented in .env.example |

### FACADE (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:463 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/app/(main)/checkout/[planId]/page.tsx:488 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:680 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/kloel/products/ProductNerveCenter.tsx:2309 | [fake_save] setTimeout resets state without API call — fake save feedback |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:588 | [fake_save] setTimeout resets state without API call — fake save feedback |

### FETCH_NO_TIMEOUT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:331 | fetch() call without AbortController/signal timeout |
| HIGH | backend/src/kloel/mercado-pago.service.ts:636 | fetch() call without AbortController/signal timeout |

### FINANCIAL_ERROR_SWALLOWED (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/checkout/checkout-order-support.ts:225 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/mercado-pago-wallet.controller.ts:88 | catch in financial code handles error without rethrow |
| HIGH | backend/src/kloel/wallet.service.ts:504 | catch in financial code handles error without rethrow |

### FINDMANY_NO_PAGINATION (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/inbox/inbox.service.ts:381 | findMany() on Message without pagination (take/cursor) — unbounded query |
| HIGH | backend/src/kloel/kloel.service.ts:3674 | findMany() on ChatMessage without pagination (take/cursor) — unbounded query |

### FLOATING_PROMISE (3)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel.service.ts:963 | .then() call without .catch() — unhandled promise rejection |
| HIGH | backend/src/kloel/kloel.service.ts:1634 | .then() call without .catch() — unhandled promise rejection |
| HIGH | backend/src/kloel/kloel.service.ts:1745 | .then() call without .catch() — unhandled promise rejection |

### HARDCODED_INTERNAL_URL (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/main.ts:160 | Hardcoded internal/infrastructure URL: http://localhost |
| WARNING | backend/src/meta/meta-whatsapp.service.ts:509 | Hardcoded internal/infrastructure URL: http://localhost |

### HARDCODED_PROD_URL (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | frontend/src/components/kloel/carteira.tsx:2752 | Hardcoded production URL: https://app.kloel.com |
| INFO | frontend/src/lib/http.ts:92 | Hardcoded production URL: https://api.kloel.com |
| INFO | backend/src/kloel/mercado-pago-wallet.controller.ts:38 | Hardcoded production URL: https://app.kloel.com |
| INFO | backend/src/kloel/mercado-pago.service.ts:474 | Hardcoded production URL: https://app.kloel.com |
| INFO | backend/src/main.ts:156 | Hardcoded production URL: https://pay.kloel.com |

### HYDRATION_MISMATCH (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | frontend/src/app/layout.tsx:65 | suppressHydrationWarning detected — indicates a known SSR/client mismatch |

### IDEMPOTENCY_MISSING (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/affiliate/affiliate.controller.ts:514 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/campaigns/campaigns.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/smart-payment.service.ts:0 | Retry logic around operations with external side effects without idempotency guard |
| HIGH | backend/src/kloel/wallet.controller.ts:129 | POST endpoint creates resource without idempotency — safe retry not possible |
| HIGH | backend/src/webhooks/asaas-webhook.controller.ts:0 | Webhook handler without idempotency check — duplicate webhooks will be processed twice |

### JSON_PARSE_UNSAFE (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:427 | JSON.parse() outside try/catch — throws SyntaxError on invalid input |
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
| HIGH | /Users/danielpenin/whatsapp_saas/frontend/src:0 | No error tracking (Sentry) in frontend |
| HIGH | /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts:0 | Financial service has no structured logging |

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

### OBSERVABILITY_NO_TRACING (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
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
| HIGH | worker/voice-processor.ts:165 | Queue job 'process-message' is produced but has no worker processor |

### RACE_CONDITION_OVERWRITE (1)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/mercado-pago.service.ts:0 | Update without optimistic lock version check — concurrent updates may silently overwrite each other |

### RESPONSE_INCONSISTENT (2)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/kloel/product.controller.ts:354 | Controller mixes wrapped ({ data: … }) and raw return styles |
| INFO | backend/src/member-area/member-area.controller.ts:421 | Controller mixes wrapped ({ data: … }) and raw return styles |

### ROUTE_NO_CALLER (13)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/gdpr/data-delete.controller.ts:21 | POST /gdpr/delete is not called by any frontend code |
| INFO | backend/src/gdpr/data-export.controller.ts:17 | POST /gdpr/export is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:657 | GET /kloel/threads/search is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:810 | POST /kloel/threads/:id/messages is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:62 | POST /kloel/upload is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:28 | GET /launch/launchers is not called by any frontend code |
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
| WARNING | frontend/src/app/(public)/reset-password/page.tsx:123 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:52 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:107 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:17 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/landing/ThanosSection.tsx:110 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterAfterPayTab.tsx:33 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:478 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:410 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:100 | setTimeout used without clearTimeout — potential stale closure / state update after unmount |

### TOFIX_WITHOUT_PARSE (6)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | backend/src/kloel/kloel-context-formatter.ts:161 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago-order.util.ts:75 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:131 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:1159 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
| HIGH | backend/src/kloel/mercado-pago.service.ts:1160 | .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat |
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
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:835 | form "form" has dead handler |
| WARNING | frontend/src/components/kloel/landing/FloatingChat.tsx:657 | clickable "(sem texto)" has dead handler |

### UNBOUNDED_RESULT (17)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/src/checkout/checkout.service.ts:230 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/common/ledger-reconciliation.service.ts:81 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/crm/crm.service.ts:463 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/dashboard/dashboard.service.ts:173 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/flows/flows.service.ts:385 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:959 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:1741 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:3674 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:3838 | findMany without take — may return all rows and cause OOM or slow response |
| WARNING | backend/src/kloel/kloel.service.ts:4197 | findMany without take — may return all rows and cause OOM or slow response |
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
| WARNING | backend/src/kloel/kloel.service.ts:963 | .then() without .catch() — unhandled promise rejection |
| WARNING | backend/src/kloel/kloel.service.ts:1634 | .then() without .catch() — unhandled promise rejection |
| WARNING | backend/src/kloel/kloel.service.ts:1745 | .then() without .catch() — unhandled promise rejection |

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

### VISUAL_CONTRACT_EMOJI_UI (5)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:206 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/canvas/CanvasEditor.tsx:1392 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:70 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:398 | Emoji found in product UI code, violating the restrained Kloel visual contract. |
| HIGH | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:553 | Emoji found in product UI code, violating the restrained Kloel visual contract. |

### VISUAL_CONTRACT_FONT_BELOW_MIN (4)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:305 | Chat body typography drops below 16px, violating the minimum readability contract. |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:311 | Chat body typography drops below 16px, violating the minimum readability contract. |
| HIGH | frontend/src/components/kloel/UniversalComposer.tsx:160 | Chat body typography drops below 16px, violating the minimum readability contract. |
| HIGH | frontend/src/components/kloel/UniversalComposer.tsx:248 | Chat body typography drops below 16px, violating the minimum readability contract. |

### VISUAL_CONTRACT_GENERIC_SPINNER (38)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| HIGH | frontend/src/app/(main)/autopilot/page.tsx:1011 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/autopilot/page.tsx:1595 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:304 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:336 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:342 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:430 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/flow/page.tsx:463 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/followups/page.tsx:222 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/followups/page.tsx:379 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:167 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:229 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/funnels/page.tsx:310 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/leads/page.tsx:332 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:447 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:797 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:985 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(main)/webinarios/page.tsx:1069 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/app/(public)/onboarding-chat/page.tsx:543 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/AgentDesktopViewer.tsx:246 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:102 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/Primitives.tsx:166 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/UniversalComposer.tsx:229 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/analytics-settings-section.tsx:109 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/analytics-settings-section.tsx:126 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:342 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/settings/crm-settings-section.tsx:356 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/kloel/test-kloel-modal.tsx:77 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:708 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/plans/PlanAIConfigTab.tsx:1590 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCheckoutsTab.tsx:105 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCommissionsTab.tsx:102 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductCouponsTab.tsx:84 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:86 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductGeneralTab.tsx:370 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:96 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductPlansTab.tsx:461 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductReviewsTab.tsx:57 | Generic spinner detected where the visual contract requires branded loading treatment. |
| HIGH | frontend/src/components/products/ProductUrlsTab.tsx:187 | Generic spinner detected where the visual contract requires branded loading treatment. |

### VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS (516)

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
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:103 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:104 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/CountdownTimer.tsx:125 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/ExitIntentPopup.tsx:112 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/FloatingBar.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:41 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/OrderBumpCard.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/StockCounter.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:117 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:129 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:131 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:167 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/components/checkout-theme-shared.tsx:183 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/success/page.tsx:80 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:141 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:165 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:166 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(checkout)/order/[orderId]/upsell/page.tsx:170 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/app/(main)/canvas/layout.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:99 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:118 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:119 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/modelos/page.tsx:136 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/canvas/projetos/page.tsx:99 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:174 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:203 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:221 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:508 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/checkout/[planId]/page.tsx:616 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/fale/page.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:41 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:110 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:270 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:304 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/launchpad/page.tsx:442 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/page.tsx:158 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/recupere/page.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/ferramentas/ver-todas/page.tsx:132 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:180 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:181 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:182 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:183 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/flow/page.tsx:362 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:169 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:229 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:250 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:292 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx:372 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(main)/scrapers/page.tsx:50 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:180 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/(public)/verify-email/page.tsx:243 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:55 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:64 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/global-error.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:14 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:15 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/globals.css:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/layout.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/layout.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/loading.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/app/not-found.tsx:57 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasEditor.tsx:62 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CanvasIcons.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:65 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:89 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:100 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/CreateModal.tsx:101 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorErrorBoundary.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorErrorBoundary.tsx:14 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/EditorTopBar.tsx:56 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatCard.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/FormatPills.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:59 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:60 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/canvas/MockupSVGs.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:226 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:230 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:255 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:273 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/checkout/KloelChatBubble.tsx:298 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/components/flow/nodes/AINode.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/AINode.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/AINode.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/AINode.tsx:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ActionNode.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ActionNode.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ActionNode.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ActionNode.tsx:44 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ConditionNode.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ConditionNode.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ConditionNode.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ConditionNode.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/ConditionNode.tsx:63 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/DelayNode.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/DelayNode.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/DelayNode.tsx:43 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/DelayNode.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/EndNode.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/EndNode.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/InputNode.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/InputNode.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/InputNode.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/InputNode.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/InputNode.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/MessageNode.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/MessageNode.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/MessageNode.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/MessageNode.tsx:31 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/StartNode.tsx:32 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/StartNode.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:28 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/flow/nodes/WaitForReplyNode.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/icons/WhatsAppIcon.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:353 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:367 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:397 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentCursor.tsx:416 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:159 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:162 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:163 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:169 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AgentDesktopViewer.tsx:188 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/AssistantResponseChrome.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/ErrorBoundary.tsx:117 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:388 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:564 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:580 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:607 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/KloelBrand.tsx:608 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MediaPreviewBox.tsx:175 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:214 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/MessageActionBar.tsx:297 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Pagination.tsx:56 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Pagination.tsx:89 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Pagination.tsx:90 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Pagination.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Pagination.tsx:113 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Primitives.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/StatusDot.tsx:4 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/StatusDot.tsx:5 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/StatusDot.tsx:6 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/StatusDot.tsx:7 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/StatusDot.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Stepper.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Stepper.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Stepper.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Stepper.tsx:83 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Stepper.tsx:85 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Toast.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Toast.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Toast.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Toast.tsx:74 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/ToolCard.tsx:29 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/ToolCard.tsx:30 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/ToolCard.tsx:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/UniversalComposer.tsx:211 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/Val.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:189 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:190 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:248 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:250 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/WhatsAppConsole.tsx:252 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:17 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:107 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:120 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/anuncios/AnunciosView.tsx:133 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/auth-provider.tsx:102 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:119 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:123 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:127 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/auth/kloel-auth-screen.tsx:131 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:266 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:268 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:269 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:273 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/carteira.tsx:274 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:352 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:353 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:354 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:355 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/conta/ContaView.tsx:863 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:15 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:510 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:513 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/CRMPipelineView.tsx:612 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/crm/ContactDetailDrawer.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/header-minimal.tsx:128 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/header-minimal.tsx:192 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:715 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:721 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:797 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:839 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/home/HomeScreen.tsx:842 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:272 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:284 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:305 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:312 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/landing/KloelLanding.tsx:313 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:133 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:140 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:147 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:154 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/MarketingView.tsx:161 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:506 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:583 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:602 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/onboarding-modal.tsx:93 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/onboarding-modal.tsx:162 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/onboarding-modal.tsx:195 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:401 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:402 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:403 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:809 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/parcerias/ParceriasView.tsx:874 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:46 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/plan-activation-success-modal.tsx:52 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenter.tsx:2417 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:720 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:736 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/ProductNerveCenterCheckoutsTab.tsx:749 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:18 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:19 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/products/product-nerve-center.shared.tsx:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:33 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:103 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:363 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:504 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/produtos/ProdutosView.tsx:513 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/account-settings-section.tsx:124 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/account-settings-section.tsx:346 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/activity-section.tsx:75 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/billing-settings-section.tsx:211 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:79 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:80 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:83 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/brain-settings-section.tsx:85 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:66 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/opening-message-card.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:79 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:81 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:82 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:91 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/settings/product-checkout-plans.tsx:94 | Hardcoded hex color outside the approved visual token set. |
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
| WARNING | frontend/src/components/kloel/test-kloel-modal.tsx:73 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeProvider.tsx:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/theme/ThemeToggle.tsx:108 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/trial-paywall-modal.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/trial-paywall-modal.tsx:84 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/trial-paywall-modal.tsx:101 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:165 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:168 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:172 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:175 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/kloel/vendas/VendasView.tsx:178 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:92 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:105 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanAffiliateTab.tsx:116 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:76 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:77 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:78 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:79 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanOrderBumpTab.tsx:80 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanPaymentTab.tsx:216 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanPaymentTab.tsx:224 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanPaymentTab.tsx:232 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanPaymentTab.tsx:433 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanShippingTab.tsx:652 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanStoreTab.tsx:296 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:12 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/plans/PlanThankYouTab.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:36 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:38 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:39 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutConfigPage.tsx:40 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:67 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:68 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:69 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:70 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/CheckoutLinksModal.tsx:71 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductAfterPayTab.tsx:14 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCampaignsTab.tsx:14 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductCheckoutsTab.tsx:166 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:11 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:13 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductIATab.tsx:14 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductPlansTab.tsx:335 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:35 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/components/products/ProductUrlsTab.tsx:37 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/hooks/useCheckoutEditor.ts:168 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/hooks/useCheckoutEditor.ts:170 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/hooks/useCheckoutEditor.ts:171 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:47 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:48 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:49 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:50 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/canvas-formats.ts:51 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:6 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:21 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:22 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/design-tokens.ts:23 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/BackgroundManager.ts:42 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/ShapeManager.ts:4 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/ShapeManager.ts:34 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:45 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:117 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/fabric/index.ts:126 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:24 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:25 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:26 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/lib/frontend-capabilities.ts:27 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:9 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:10 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:16 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:20 | Hardcoded hex color outside the approved visual token set. |
| WARNING | frontend/src/styles/polotno-terminator.css:26 | Hardcoded hex color outside the approved visual token set. |

---

## CORRECTION PROMPT

```
Fix the following blocking issues found by PULSE certification:

1. [BACKUP_MISSING] .backup-manifest.json:0 — No recent DB backup found — backup manifest missing or older than 24 h
   Evidence: Backup manifest exists but lastBackup timestamp is stale (>24 h) or missing
2. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:463 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: const clearTimer = setTimeout(() => setHighlightedSection(null), 2600);
3. [FACADE] frontend/src/app/(main)/checkout/[planId]/page.tsx:488 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
4. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:680 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(() => setProductSaved(false), 2000);
5. [FACADE] frontend/src/components/kloel/products/ProductNerveCenter.tsx:2309 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: setTimeout(() => setPlanSaved(false), 2000);
6. [FACADE] frontend/src/components/plans/PlanAIConfigTab.tsx:588 — [fake_save] setTimeout resets state without API call — fake save feedback
   Evidence: savedTimer.current = setTimeout(() => setSaved(false), 3000);
7. [AUDIT_DELETION_NO_LOG] backend/src/kloel/kloel.service.ts:0 — Data deletion/anonymization without audit log — cannot prove LGPD compliance
   Evidence: Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })
8. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/providers/waha.provider.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
9. [AUDIT_ADMIN_NO_LOG] backend/src/whatsapp/whatsapp-normalization.util.ts:0 — Admin operation without audit log — privileged actions are unaccountable
   Evidence: Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip
10. [NETWORK_OFFLINE_DATA_LOST] frontend/src/components/products/ProductCheckoutsTab.tsx:0 — Payment/checkout form has no offline protection — user loses entered data on connection drop
   Evidence: Save form progress to localStorage on every field change; restore on mount; show offline indicator
11. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/reset-password/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
12. [CACHE_STALE_AFTER_WRITE] frontend/src/app/(public)/verify-email/page.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
13. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/auth/auth-modal.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
14. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/landing/FloatingChat.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
15. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterAvalTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
16. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterCampanhasTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
17. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterComissaoTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
18. [CACHE_STALE_AFTER_WRITE] frontend/src/components/kloel/products/ProductNerveCenterIATab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
19. [CACHE_STALE_AFTER_WRITE] frontend/src/components/products/ProductCampaignsTab.tsx:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
20. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/api/cookie-consent.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
21. [CACHE_STALE_AFTER_WRITE] frontend/src/lib/mercado-pago.ts:0 — Write operation (POST/PUT/DELETE) without SWR cache invalidation — stale data shown after mutation
   Evidence: Add mutate(key) or useSWRConfig().mutate() after successful write to refresh affected cache keys
22. [CACHE_REDIS_STALE] backend/src/billing/payment-method.service.ts:97 — Financial data cached in Redis without TTL — cache never expires, will always be stale
   Evidence: Set EX (expire) on all Redis cache writes; financial data should use ≤60s TTL
23. [CACHE_REDIS_STALE] backend/src/kloel/mercado-pago.service.ts:0 — Service writes to both Redis and DB but never invalidates Redis cache — reads return stale data
   Evidence: After DB write, call redis.del(key) or redis.expire(key, 0) to invalidate affected cache entries
24. [RACE_CONDITION_OVERWRITE] backend/src/kloel/mercado-pago.service.ts:0 — Update without optimistic lock version check — concurrent updates may silently overwrite each other
   Evidence: Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts
25. [COOKIE_NOT_HTTPONLY] backend/src/cookie-consent/cookie-consent.controller.ts:67 — Cookie set without httpOnly: true — vulnerable to XSS theft
   Evidence: response.cookie(COOKIE_NAME, serialized, {
26. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/provider-registry.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
27. [COST_LLM_NO_LIMIT] backend/src/whatsapp/providers/waha.provider.ts:0 — WhatsApp messages sent without per-workspace daily rate limit — Autopilot can send unlimited messages
   Evidence: Add a daily message counter per workspace; enforce plan-based limit (e.g., 1000 messages/day on free plan)
28. [DATA_ORDER_NO_PAYMENT] /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts:262 — Financial write without existence check in wallet.service.ts
   Evidence: Function 'requestWithdrawal' creates or updates a financial record without first validating the referenced entity exists. This can create orphaned payment records.
29. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260406130000_add_checkout_links_and_kinds/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
30. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408190000_add_checkout_shipping_and_affiliate_config/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
31. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
32. [MIGRATION_NO_ROLLBACK] backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql:0 — Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback
   Evidence: Detected destructive SQL in migration.sql; create a .down.sql that reverses these changes
33. [DOCKER_BUILD_FAILS] /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile:0 — No Dockerfile found for backend
   Evidence: backend/Dockerfile does not exist. Cannot build production Docker image.
34. [E2E_FLOW_NOT_TESTED] /Users/danielpenin/whatsapp_saas/e2e:0 — E2E directory exists but no Playwright or Cypress config found — tests cannot run
   Evidence: Create playwright.config.ts or cypress.config.ts at the root to enable E2E test execution
35. [E2E_FLOW_NOT_TESTED] .github/workflows/:0 — E2E tests exist but are not included in CI pipeline — they will never catch regressions
   Evidence: Add an E2E test step to your GitHub Actions / CI workflow that runs on every PR
36. [EDGE_CASE_FILE] backend/src/ai-brain/knowledge-base.controller.ts:17 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
37. [EDGE_CASE_STRING] backend/src/auth/dto/whatsapp-auth.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
38. [EDGE_CASE_PAGINATION] backend/src/common/middleware/prompt-sanitizer.middleware.ts:27 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: /act\s+as\s+if\s+you\s+have\s+no\s+(rules?|restrictions?|limits?)/gi, — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
39. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:67 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
40. [EDGE_CASE_FILE] backend/src/kloel/audio.controller.ts:77 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
41. [EDGE_CASE_FILE] backend/src/kloel/pdf-processor.controller.ts:16 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
42. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:260 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: salesLimit: parseNumber(body.salesLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
43. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:262 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: approvedLimit: parseNumber(body.approvedLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
44. [EDGE_CASE_PAGINATION] backend/src/kloel/product-sub-resources.controller.ts:924 — Pagination parameter parsed without bounds clamping — page=-1 or limit=99999 allowed
   Evidence: messageLimit: parseNumber(body.messageLimit), — clamp: const take = Math.min(Math.max(limit || 20, 1), 100)
45. [EDGE_CASE_STRING] backend/src/kyc/dto/kyc-document-type.dto.ts:4 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
46. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:18 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
47. [EDGE_CASE_FILE] backend/src/kyc/kyc.controller.ts:19 — File upload without MIME type validation — any file type accepted
   Evidence: Add fileFilter to reject non-image/non-document files; check mimetype whitelist
48. [EDGE_CASE_FILE] backend/src/media/media.controller.ts:24 — File upload without size limit — large files may exhaust memory or storage
   Evidence: Add limits: { fileSize: 5 * 1024 * 1024 } to multer options (5MB example)
49. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:20 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
50. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:21 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
51. [EDGE_CASE_STRING] backend/src/reports/dto/report-filters.dto.ts:22 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
52. [EDGE_CASE_STRING] backend/src/team/dto/invite-member.dto.ts:7 — @IsString() without @MaxLength — unbounded string input; very long strings may crash or pollute DB
   Evidence: Add @MaxLength(255) or appropriate limit; add @IsNotEmpty() to reject empty strings
53. [FINANCIAL_ERROR_SWALLOWED] backend/src/checkout/checkout-order-support.ts:225 — catch in financial code handles error without rethrow
   Evidence: } catch (error) {
54. [FINANCIAL_ERROR_SWALLOWED] backend/src/kloel/mercado-pago-wallet.controller.ts:88 — catch in financial code handles error without rethrow
   Evidence: } catch (error) {
55. [FINANCIAL_ERROR_SWALLOWED] backend/src/kloel/wallet.service.ts:504 — catch in financial code handles error without rethrow
   Evidence: } catch (err) {
56. [TOFIX_WITHOUT_PARSE] backend/src/kloel/kloel-context-formatter.ts:161 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: `  - média recente: ${averageRating.toFixed(1)}/5`,
57. [DIVISION_BY_ZERO_RISK] backend/src/kloel/kloel-output-sanitizer.ts:2 — Division by variable without zero-check — potential division by zero in financial code
   Evidence: const EMOJI_GLUE_REGEX = /\u200D|\uFE0F|\u20E3/gu;
58. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago-order.util.ts:75 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: return (Math.max(0, Math.round(Number(value || 0))) / 100).toFixed(2);
59. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:131 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: return (Math.max(0, value) / 100).toFixed(2);
60. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:1159 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: amount: response.transaction_amount?.toFixed(2),
61. [TOFIX_WITHOUT_PARSE] backend/src/kloel/mercado-pago.service.ts:1160 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: paid_amount: response.transaction_details?.total_paid_amount?.toFixed(2),
62. [TOFIX_WITHOUT_PARSE] backend/src/kloel/wallet.service.ts:89 — .toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat
   Evidence: `Split: R$ ${saleAmount.toFixed(2)} -> Líquido: R$ ${netAmount.toFixed(2)} ` +
63. [FETCH_NO_TIMEOUT] backend/src/kloel/mercado-pago.service.ts:331 — fetch() call without AbortController/signal timeout
   Evidence: const response = await fetch('https://api.mercadopago.com/oauth/token', { — wrap with AbortController and setTimeout to avoid hanging requests
64. [FETCH_NO_TIMEOUT] backend/src/kloel/mercado-pago.service.ts:636 — fetch() call without AbortController/signal timeout
   Evidence: const response = await fetch('https://api.mercadopago.com/v1/payment_methods', { — wrap with AbortController and setTimeout to avoid hanging requests
65. [IDEMPOTENCY_MISSING] backend/src/affiliate/affiliate.controller.ts:514 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
66. [IDEMPOTENCY_MISSING] backend/src/campaigns/campaigns.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
67. [IDEMPOTENCY_MISSING] backend/src/kloel/smart-payment.service.ts:0 — Retry logic around operations with external side effects without idempotency guard
   Evidence: Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries
68. [IDEMPOTENCY_MISSING] backend/src/kloel/wallet.controller.ts:129 — POST endpoint creates resource without idempotency — safe retry not possible
   Evidence: Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent
69. [IDEMPOTENCY_MISSING] backend/src/webhooks/asaas-webhook.controller.ts:0 — Webhook handler without idempotency check — duplicate webhooks will be processed twice
   Evidence: Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)
70. [JSON_PARSE_UNSAFE] backend/src/kloel/mercado-pago.service.ts:427 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
71. [JSON_PARSE_UNSAFE] backend/src/kloel/wallet-ledger.service.ts:91 — JSON.parse() outside try/catch — throws SyntaxError on invalid input
   Evidence: ? (JSON.parse(JSON.stringify(entry.metadata)) as Prisma.InputJsonValue)
72. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:963 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((rows: Array<{ id: string }>) => rows.length); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
73. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:1634 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((thread: { id: string } | null) => (thread ? 1 : 0)); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
74. [FLOATING_PROMISE] backend/src/kloel/kloel.service.ts:1745 — .then() call without .catch() — unhandled promise rejection
   Evidence: .then((rows: Array<{ id: string }>) => rows.length); — add .catch(err => this.logger.error(err)) or use async/await with try/catch
75. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/frontend/src:0 — No error tracking (Sentry) in frontend
   Evidence: Frontend has no Sentry.init() call. Client-side errors are not captured or reported.
76. [MONITORING_MISSING] /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts:0 — Financial service has no structured logging
   Evidence: wallet-ledger.service.ts: No Logger usage found. Financial operations (payments, withdrawals) must be logged for audit and debugging.
77. [OBSERVABILITY_NO_TRACING] backend/src/whatsapp/providers/waha.provider.ts:0 — Outbound HTTP call without correlation ID header — cannot trace request through external services
   Evidence: Add X-Request-ID header to all outbound HTTP calls using the request context correlation ID
78. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout-order-support.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
79. [OBSERVABILITY_NO_ALERTING] backend/src/checkout/checkout.service.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
80. [OBSERVABILITY_NO_ALERTING] backend/src/kloel/mercado-pago-wallet.controller.ts:0 — Payment/financial error caught without external alert — payment failures may go unnoticed for hours
   Evidence: Add Sentry.captureException(err) or custom alert in payment error catch blocks
81. [ORDERING_WEBHOOK_OOO] backend/src/checkout/mercado-pago-webhook-signature.util.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
82. [ORDERING_WEBHOOK_OOO] backend/src/common/utils/webhook-challenge-response.util.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
83. [ORDERING_WEBHOOK_OOO] backend/src/webhooks/asaas-webhook.controller.ts:0 — Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state
   Evidence: Check event.dateCreated/timestamp before applying; reject events older than current entity state
84. [TRANSACTION_NO_ISOLATION] backend/src/billing/payment-method.service.ts:39 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(
85. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-payment.service.ts:183 — $transaction in financial file without isolationLevel specified
   Evidence: const payment = await this.prisma.$transaction(
86. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-plan-link.manager.ts:195 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(async (tx) => {
87. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout-webhook.controller.ts:555 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
88. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:125 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
89. [TRANSACTION_NO_ISOLATION] backend/src/checkout/checkout.service.ts:448 — $transaction in financial file without isolationLevel specified
   Evidence: return this.prisma.$transaction(async (tx) => {
90. [FINDMANY_NO_PAGINATION] backend/src/inbox/inbox.service.ts:381 — findMany() on Message without pagination (take/cursor) — unbounded query
   Evidence: return this.prisma.message.findMany({
91. [FINDMANY_NO_PAGINATION] backend/src/kloel/kloel.service.ts:3674 — findMany() on ChatMessage without pagination (take/cursor) — unbounded query
   Evidence: const messages = await this.prisma.chatMessage.findMany({
92. [TRANSACTION_NO_ISOLATION] backend/src/kloel/payment.service.ts:129 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
93. [TRANSACTION_NO_ISOLATION] backend/src/kloel/smart-payment.service.ts:403 — $transaction in financial file without isolationLevel specified
   Evidence: await this.prisma.$transaction(
94. [TRANSACTION_NO_ISOLATION] backend/src/kloel/wallet.service.ts:185 — $transaction in financial file without isolationLevel specified
   Evidence: const outcome = await this.prisma.$transaction(
95. [QUEUE_NO_PROCESSOR] backend/src/campaigns/campaigns.service.ts:113 — Queue job 'process-campaign' is produced but has no worker processor
   Evidence: No 'case "process-campaign":' or 'job.name === "process-campaign"' found in worker — jobs will silently pile up
96. [QUEUE_NO_PROCESSOR] backend/src/webhooks/webhook-dispatcher.service.ts:36 — Queue job 'send-webhook' is produced but has no worker processor
   Evidence: No 'case "send-webhook":' or 'job.name === "send-webhook"' found in worker — jobs will silently pile up
97. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:189 — Queue job 'analyze-contact' is produced but has no worker processor
   Evidence: No 'case "analyze-contact":' or 'job.name === "analyze-contact"' found in worker — jobs will silently pile up
98. [QUEUE_NO_PROCESSOR] worker/flow-engine-global.ts:809 — Queue job 'extract-facts' is produced but has no worker processor
   Evidence: No 'case "extract-facts":' or 'job.name === "extract-facts"' found in worker — jobs will silently pile up
99. [QUEUE_NO_PROCESSOR] worker/providers/campaigns.ts:22 — Queue job 'process-campaign-action' is produced but has no worker processor
   Evidence: No 'case "process-campaign-action":' or 'job.name === "process-campaign-action"' found in worker — jobs will silently pile up
100. [QUEUE_NO_PROCESSOR] worker/voice-processor.ts:165 — Queue job 'process-message' is produced but has no worker processor
   Evidence: No 'case "process-message":' or 'job.name === "process-message"' found in worker — jobs will silently pile up
101. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:132 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
102. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:187 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const walletTx = (await (tx as any).kloelWalletTransaction.findUnique({
103. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:209 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: const statusFlip = await (tx as any).kloelWalletTransaction.updateMany({
104. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:216 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await (tx as any).kloelWallet.update({
105. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:229 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
106. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:238 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
107. [UNSAFE_ANY_CAST] backend/src/kloel/wallet.service.ts:311 — `as any` cast in financial/auth code — type safety bypassed
   Evidence: await this.walletLedger.appendWithinTx(tx as any, {
108. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/app/(checkout)/hooks/useCheckoutExperience.ts:206 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (©) from product-facing UI and use text or SVG iconography instead.
109. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/autopilot/page.tsx:1011 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
110. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/autopilot/page.tsx:1595 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
111. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:304 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
112. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:336 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
113. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:342 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
114. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:430 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
115. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/flow/page.tsx:463 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
116. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/followups/page.tsx:222 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
117. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/followups/page.tsx:379 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
118. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:167 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
119. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:229 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
120. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/funnels/page.tsx:310 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
121. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/leads/page.tsx:332 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
122. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:447 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
123. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:797 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
124. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:985 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
125. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(main)/webinarios/page.tsx:1069 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
126. [VISUAL_CONTRACT_FONT_BELOW_MIN] frontend/src/app/(public)/onboarding-chat/page.tsx:305 — Chat body typography drops below 16px, violating the minimum readability contract.
   Evidence: Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.
127. [VISUAL_CONTRACT_FONT_BELOW_MIN] frontend/src/app/(public)/onboarding-chat/page.tsx:311 — Chat body typography drops below 16px, violating the minimum readability contract.
   Evidence: Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.
128. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/app/(public)/onboarding-chat/page.tsx:543 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
129. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/canvas/CanvasEditor.tsx:1392 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↔) from product-facing UI and use text or SVG iconography instead.
130. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/AgentDesktopViewer.tsx:246 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
131. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:102 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
132. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/Primitives.tsx:166 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
133. [VISUAL_CONTRACT_FONT_BELOW_MIN] frontend/src/components/kloel/UniversalComposer.tsx:160 — Chat body typography drops below 16px, violating the minimum readability contract.
   Evidence: Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.
134. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/UniversalComposer.tsx:229 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
135. [VISUAL_CONTRACT_FONT_BELOW_MIN] frontend/src/components/kloel/UniversalComposer.tsx:248 — Chat body typography drops below 16px, violating the minimum readability contract.
   Evidence: Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.
136. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:70 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
137. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/cookies/CookiePolicyPage.tsx:398 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (↗) from product-facing UI and use text or SVG iconography instead.
138. [VISUAL_CONTRACT_EMOJI_UI] frontend/src/components/kloel/marketing/WhatsAppExperience.tsx:553 — Emoji found in product UI code, violating the restrained Kloel visual contract.
   Evidence: Remove emoji glyphs (📱) from product-facing UI and use text or SVG iconography instead.
139. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/analytics-settings-section.tsx:109 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
140. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/analytics-settings-section.tsx:126 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
141. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:342 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
142. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/settings/crm-settings-section.tsx:356 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
143. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/kloel/test-kloel-modal.tsx:77 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
144. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/plans/PlanAIConfigTab.tsx:708 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
145. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/plans/PlanAIConfigTab.tsx:1590 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
146. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCheckoutsTab.tsx:105 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
147. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCommissionsTab.tsx:102 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
148. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductCouponsTab.tsx:84 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
149. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductGeneralTab.tsx:86 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
150. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductGeneralTab.tsx:370 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
151. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductPlansTab.tsx:96 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
152. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductPlansTab.tsx:461 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
153. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductReviewsTab.tsx:57 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
154. [VISUAL_CONTRACT_GENERIC_SPINNER] frontend/src/components/products/ProductUrlsTab.tsx:187 — Generic spinner detected where the visual contract requires branded loading treatment.
   Evidence: Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.
```