# PULSE CONVERGENCE PLAN

- Generated: 2026-04-02T16:30:57.982Z
- Commit: 8be8098ea7fedddd2712a74805f16edaff1c21f0
- Status: PARTIAL
- Human Replacement: NOT_READY
- Blocking Tier: 0

## Summary

- Queue length: 11
- Scenario units: 8
- Security units: 0
- Gate units: 2
- Static units: 1
- Priorities: P0=5, P1=4, P2=1, P3=1
- Failing gates: staticPass, runtimePass, performancePass, customerPass, operatorPass, adminPass, soakPass
- Pending async expectations: 12

## Queue

| Order | Priority | Lane | Kind | Unit | Opened By |
|-------|----------|------|------|------|-----------|
| 1 | P0 | customer | SCENARIO | Recover Customer Auth Shell | browserPass, customer-auth-shell, customerPass |
| 2 | P0 | customer | SCENARIO | Recover Customer Product And Checkout | browserPass, customer-product-and-checkout, customerPass, payment-webhook-reconciliation |
| 3 | P0 | customer | SCENARIO | Recover Customer Whatsapp And Inbox | browserPass, conversation-reload, customer-whatsapp-and-inbox, customerPass, message-persistence |
| 4 | P0 | customer | SCENARIO | Recover System Payment Reconciliation | payment-webhook-replay, system-payment-reconciliation, wallet-ledger-reconciliation |
| 5 | P0 | customer | GATE | Clear Runtime Pass | runtimePass |
| 6 | P1 | operator-admin | SCENARIO | Recover Admin Settings Kyc Banking | admin-settings-kyc-banking, adminPass, browserPass, kyc-doc-processing, withdrawal-ledger-consistency |
| 7 | P1 | operator-admin | SCENARIO | Recover Admin Whatsapp Session Control | admin-whatsapp-session-control, adminPass, browserPass, provider-status-sync, session-reconnect |
| 8 | P1 | operator-admin | SCENARIO | Recover Operator Autopilot Run | job-enqueued, operator-autopilot-run, operatorPass, worker-health-visible |
| 9 | P1 | operator-admin | SCENARIO | Recover Operator Campaigns And Flows | flow-resume-after-wait, operator-campaigns-and-flows, operatorPass |
| 10 | P2 | reliability | GATE | Clear Performance Pass | performancePass |
| 11 | P3 | platform | STATIC | Reduce Remaining Static Critical And High Breakers | staticPass |

## 1. [P0] Recover Customer Auth Shell

- Kind: scenario
- Status: watch
- Lane: customer
- Failure Class: missing_evidence
- Summary: Scenario customer-auth-shell requires runtime probes that are not attached: auth-session.
- Target State: Scenario customer-auth-shell must pass end-to-end and leave no pending async expectations in world state.
- Gates: browserPass, customerPass
- Scenarios: customer-auth-shell
- Modules: auth, dashboard
- Routes: /dashboard
- Flows: auth-login
- Async Expectations: —
- Break Types: CACHE_STALE_AFTER_WRITE (3)
- Related Files: frontend/src/app/api/auth/whatsapp/send-code/route.ts, frontend/src/app/api/auth/whatsapp/verify/route.ts, frontend/src/components/kloel/auth/auth-modal.tsx
- Artifacts: PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Browser-required routes stay green: /dashboard.
  - Scenario customer-auth-shell reports status=passed in synthetic evidence.

## 2. [P0] Recover Customer Product And Checkout

- Kind: scenario
- Status: watch
- Lane: customer
- Failure Class: missing_evidence
- Summary: Scenario customer-product-and-checkout requires runtime probes that are not attached: backend-health, auth-session. Async expectations still pending: payment-webhook-reconciliation=missing_evidence.
- Target State: Scenario customer-product-and-checkout must pass end-to-end and leave no pending async expectations in world state.
- Gates: browserPass, customerPass
- Scenarios: customer-product-and-checkout
- Modules: billing, checkout, products
- Routes: /billing, /checkout, /products
- Flows: checkout-payment, product-create
- Async Expectations: payment-webhook-reconciliation
- Break Types: TRANSACTION_NO_ISOLATION (6), FACADE (4), EDGE_CASE_PAGINATION (3), NETWORK_OFFLINE_DATA_LOST (3), CICD_INCOMPLETE (2), CACHE_REDIS_STALE
- Related Files: backend/src/checkout/checkout-payment.service.ts (3), backend/src/kloel/product-sub-resources.controller.ts (3), backend/src/billing/payment-method.service.ts (2), frontend/src/app/(main)/checkout/[planId]/page.tsx (2), frontend/src/components/kloel/products/ProductNerveCenter.tsx (2), /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml, /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml, /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile, /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts, /Users/danielpenin/whatsapp_saas/e2e
- Artifacts: PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: payment-webhook-reconciliation.
  - Browser-required routes stay green: /billing, /checkout, /products.
  - Scenario customer-product-and-checkout reports status=passed in synthetic evidence.

## 3. [P0] Recover Customer Whatsapp And Inbox

- Kind: scenario
- Status: watch
- Lane: customer
- Failure Class: missing_evidence
- Summary: Scenario customer-whatsapp-and-inbox requires runtime probes that are not attached: backend-health, auth-session. Async expectations still pending: message-persistence=missing_evidence, conversation-reload=missing_evidence.
- Target State: Scenario customer-whatsapp-and-inbox must pass end-to-end and leave no pending async expectations in world state.
- Gates: browserPass, customerPass
- Scenarios: customer-whatsapp-and-inbox
- Modules: inbox, marketing, whatsapp
- Routes: /inbox, /marketing, /whatsapp
- Flows: whatsapp-message-send
- Async Expectations: conversation-reload, message-persistence
- Break Types: CICD_INCOMPLETE (12), CACHE_STALE_AFTER_WRITE (2), DATA_ORDER_NO_PAYMENT, DOCKER_BUILD_FAILS, E2E_FLOW_NOT_TESTED, EDGE_CASE_PAGINATION
- Related Files: /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml (6), /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml (6), /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile, /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts, /Users/danielpenin/whatsapp_saas/e2e, /Users/danielpenin/whatsapp_saas/frontend/src, backend/src/inbox/inbox.service.ts, backend/src/kloel/product-sub-resources.controller.ts, frontend/src/app/api/auth/whatsapp/send-code/route.ts, frontend/src/app/api/auth/whatsapp/verify/route.ts
- Artifacts: PULSE_BROWSER_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_BROWSER_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_CUSTOMER_EVIDENCE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: conversation-reload, message-persistence.
  - Browser-required routes stay green: /inbox, /marketing, /whatsapp.
  - Scenario customer-whatsapp-and-inbox reports status=passed in synthetic evidence.

## 4. [P0] Recover System Payment Reconciliation

- Kind: scenario
- Status: watch
- Lane: customer
- Failure Class: missing_evidence
- Summary: Scenario system-payment-reconciliation requires runtime probes that are not attached: backend-health. Async expectations still pending: payment-webhook-replay=missing_evidence, wallet-ledger-reconciliation=missing_evidence.
- Target State: Scenario system-payment-reconciliation must pass end-to-end and leave no pending async expectations in world state.
- Gates: —
- Scenarios: system-payment-reconciliation
- Modules: billing, checkout, wallet
- Routes: /billing, /checkout, /wallet
- Flows: checkout-payment, wallet-withdrawal
- Async Expectations: payment-webhook-replay, wallet-ledger-reconciliation
- Break Types: TRANSACTION_NO_ISOLATION (6), NETWORK_OFFLINE_DATA_LOST (3), FACADE (2), CACHE_REDIS_STALE, DATA_ORDER_NO_PAYMENT
- Related Files: backend/src/checkout/checkout-payment.service.ts (3), backend/src/billing/payment-method.service.ts (2), frontend/src/app/(main)/checkout/[planId]/page.tsx (2), /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts, backend/src/kloel/payment.service.ts, backend/src/kloel/smart-payment.service.ts, frontend/src/app/(checkout)/components/CheckoutBlanc.tsx, frontend/src/app/(checkout)/components/CheckoutNoir.tsx, frontend/src/components/products/ProductCheckoutsTab.tsx
- Artifacts: PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: payment-webhook-replay, wallet-ledger-reconciliation.
  - Scenario system-payment-reconciliation reports status=passed in synthetic evidence.

## 5. [P0] Clear Runtime Pass

- Kind: gate
- Status: watch
- Lane: customer
- Failure Class: missing_evidence
- Summary: Runtime evidence was not collected. Run PULSE with --deep or --total.
- Target State: Gate runtimePass must return pass with fresh evidence on the current commit.
- Gates: runtimePass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: —
- Related Files: —
- Artifacts: PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_RUNTIME_PROBES.json
- Exit Criteria:
  - Gate runtimePass returns pass in the next certification run.

## 6. [P1] Recover Admin Settings Kyc Banking

- Kind: scenario
- Status: watch
- Lane: operator-admin
- Failure Class: missing_evidence
- Summary: Scenario admin-settings-kyc-banking requires runtime probes that are not attached: backend-health, auth-session. Async expectations still pending: kyc-doc-processing=missing_evidence, withdrawal-ledger-consistency=missing_evidence.
- Target State: Scenario admin-settings-kyc-banking must pass end-to-end and leave no pending async expectations in world state.
- Gates: adminPass, browserPass
- Scenarios: admin-settings-kyc-banking
- Modules: billing, settings, wallet
- Routes: /billing, /settings, /wallet
- Flows: wallet-withdrawal
- Async Expectations: kyc-doc-processing, withdrawal-ledger-consistency
- Break Types: EDGE_CASE_FILE (2), CACHE_REDIS_STALE, DATA_ORDER_NO_PAYMENT, TRANSACTION_NO_ISOLATION
- Related Files: backend/src/billing/payment-method.service.ts (2), backend/src/kyc/kyc.controller.ts (2), /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_FLOW_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: kyc-doc-processing, withdrawal-ledger-consistency.
  - Browser-required routes stay green: /billing, /settings, /wallet.
  - Scenario admin-settings-kyc-banking reports status=passed in synthetic evidence.

## 7. [P1] Recover Admin Whatsapp Session Control

- Kind: scenario
- Status: watch
- Lane: operator-admin
- Failure Class: missing_evidence
- Summary: Scenario admin-whatsapp-session-control requires runtime probes that are not attached: backend-health, auth-session. Async expectations still pending: session-reconnect=missing_evidence, provider-status-sync=missing_evidence.
- Target State: Scenario admin-whatsapp-session-control must pass end-to-end and leave no pending async expectations in world state.
- Gates: adminPass, browserPass
- Scenarios: admin-whatsapp-session-control
- Modules: settings, whatsapp
- Routes: /settings, /whatsapp
- Flows: —
- Async Expectations: provider-status-sync, session-reconnect
- Break Types: CICD_INCOMPLETE (12), EDGE_CASE_FILE (7), EDGE_CASE_PAGINATION (3), CACHE_STALE_AFTER_WRITE (2), DATA_ORDER_NO_PAYMENT, DOCKER_BUILD_FAILS
- Related Files: /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml (6), /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml (6), backend/src/kloel/product-sub-resources.controller.ts (3), backend/src/kloel/audio.controller.ts (2), backend/src/kyc/kyc.controller.ts (2), /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile, /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts, /Users/danielpenin/whatsapp_saas/e2e, /Users/danielpenin/whatsapp_saas/frontend/src, backend/src/ai-brain/knowledge-base.controller.ts
- Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_ADMIN_EVIDENCE.json, PULSE_BROWSER_EVIDENCE.json, PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: provider-status-sync, session-reconnect.
  - Browser-required routes stay green: /settings, /whatsapp.
  - Scenario admin-whatsapp-session-control reports status=passed in synthetic evidence.

## 8. [P1] Recover Operator Autopilot Run

- Kind: scenario
- Status: watch
- Lane: operator-admin
- Failure Class: missing_evidence
- Summary: Scenario operator-autopilot-run requires runtime probes that are not attached: backend-health. Async expectations still pending: job-enqueued=missing_evidence, worker-health-visible=missing_evidence.
- Target State: Scenario operator-autopilot-run must pass end-to-end and leave no pending async expectations in world state.
- Gates: operatorPass
- Scenarios: operator-autopilot-run
- Modules: analytics, autopilot, marketing
- Routes: /analytics, /autopilot
- Flows: —
- Async Expectations: job-enqueued, worker-health-visible
- Break Types: CICD_INCOMPLETE (12), E2E_FLOW_NOT_TESTED (2), COST_LLM_NO_LIMIT, FINDMANY_NO_PAGINATION
- Related Files: /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml (6), /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml (6), .github/workflows/, /Users/danielpenin/whatsapp_saas/e2e, backend/src/inbox/inbox.service.ts, backend/src/kloel/openai-wrapper.ts
- Artifacts: PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: job-enqueued, worker-health-visible.
  - Scenario operator-autopilot-run reports status=passed in synthetic evidence.

## 9. [P1] Recover Operator Campaigns And Flows

- Kind: scenario
- Status: watch
- Lane: operator-admin
- Failure Class: missing_evidence
- Summary: Scenario operator-campaigns-and-flows requires runtime probes that are not attached: backend-health, auth-session. Async expectations still pending: flow-resume-after-wait=missing_evidence.
- Target State: Scenario operator-campaigns-and-flows must pass end-to-end and leave no pending async expectations in world state.
- Gates: operatorPass
- Scenarios: operator-campaigns-and-flows
- Modules: campaigns, crm, flows, followups
- Routes: /campaigns, /flow, /followups
- Flows: —
- Async Expectations: flow-resume-after-wait
- Break Types: CICD_INCOMPLETE (12), CACHE_STALE_AFTER_WRITE, E2E_FLOW_NOT_TESTED
- Related Files: /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml (6), /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml (6), .github/workflows/, frontend/src/components/products/ProductCampaignsTab.tsx
- Artifacts: PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: flow-resume-after-wait.
  - Scenario operator-campaigns-and-flows reports status=passed in synthetic evidence.

## 10. [P2] Clear Performance Pass

- Kind: gate
- Status: watch
- Lane: reliability
- Failure Class: missing_evidence
- Summary: Performance evidence was not exercised in scan mode.
- Target State: Gate performancePass must return pass with fresh evidence on the current commit.
- Gates: performancePass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: —
- Related Files: —
- Artifacts: PULSE_CERTIFICATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json
- Exit Criteria:
  - Gate performancePass returns pass in the next certification run.

## 11. [P3] Reduce Remaining Static Critical And High Breakers

- Kind: static
- Status: open
- Lane: platform
- Failure Class: product_failure
- Summary: Static certification found 54 critical/high blocking finding(s). Top structural types: CICD_INCOMPLETE (12), EDGE_CASE_FILE (7), CACHE_STALE_AFTER_WRITE (6), TRANSACTION_NO_ISOLATION (6), FACADE (5), EDGE_CASE_PAGINATION (4), EDGE_CASE_STRING (3), NETWORK_OFFLINE_DATA_LOST (3).
- Target State: Static certification should have no remaining critical/high blockers outside the scenario and security queues.
- Gates: staticPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: CICD_INCOMPLETE (12), EDGE_CASE_FILE (7), CACHE_STALE_AFTER_WRITE (6), TRANSACTION_NO_ISOLATION (6), FACADE (5), EDGE_CASE_PAGINATION (4), EDGE_CASE_STRING (3), NETWORK_OFFLINE_DATA_LOST (3), E2E_FLOW_NOT_TESTED (2), CACHE_REDIS_STALE
- Related Files: /Users/danielpenin/whatsapp_saas/.github/workflows/claude-code-review.yml (6), /Users/danielpenin/whatsapp_saas/.github/workflows/claude.yml (6), backend/src/checkout/checkout-payment.service.ts (3), backend/src/kloel/product-sub-resources.controller.ts (3), backend/src/reports/dto/report-filters.dto.ts (3), backend/src/billing/payment-method.service.ts (2), backend/src/kloel/audio.controller.ts (2), backend/src/kyc/kyc.controller.ts (2), frontend/src/app/(main)/checkout/[planId]/page.tsx (2), frontend/src/components/kloel/products/ProductNerveCenter.tsx (2), .github/workflows/, /Users/danielpenin/whatsapp_saas/backend/src/Dockerfile, /Users/danielpenin/whatsapp_saas/backend/src/kloel/wallet.service.ts, /Users/danielpenin/whatsapp_saas/e2e, /Users/danielpenin/whatsapp_saas/frontend/src
- Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Exit Criteria:
  - Blocking static break inventory reaches zero for the tracked set (54 currently open).
  - staticPass returns pass in the next certification run.
