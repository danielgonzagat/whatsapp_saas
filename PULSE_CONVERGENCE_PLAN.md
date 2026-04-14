# PULSE CONVERGENCE PLAN

- Generated: 2026-04-14T04:41:17.432Z
- Commit: d1a47e13fe8d1465600a3c9e68dbd0e4d9928623
- Status: PARTIAL
- Human Replacement: NOT_READY
- Blocking Tier: 0

## Summary

- Queue length: 14
- Scenario units: 8
- Security units: 1
- Gate units: 4
- Static units: 1
- Priorities: P0=5, P1=4, P2=4, P3=1
- Failing gates: staticPass, runtimePass, invariantPass, securityPass, recoveryPass, observabilityPass, customerPass, operatorPass, adminPass, soakPass
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
| 10 | P2 | security | SECURITY | Clear Blocking Security And Compliance Findings | securityPass |
| 11 | P2 | reliability | GATE | Clear Invariant Pass | invariantPass |
| 12 | P2 | reliability | GATE | Clear Observability Pass | observabilityPass |
| 13 | P2 | reliability | GATE | Clear Recovery Pass | recoveryPass |
| 14 | P3 | platform | STATIC | Reduce Remaining Static Critical And High Breakers | staticPass |

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
- Break Types: UNSAFE_ANY_CAST (7), CACHE_STALE_AFTER_WRITE (3), BRUTE_FORCE_VULNERABLE, E2E_REGISTRATION_BROKEN, EDGE_CASE_STRING, FETCH_NO_TIMEOUT
- Related Files: backend/src/kloel/wallet.service.ts (7), backend/src/kloel/mercado-pago.service.ts (2), backend/src (POST /auth/login), backend/src/auth/auth.controller.ts, backend/src/auth/dto/whatsapp-auth.dto.ts, frontend/src/app/api/auth/whatsapp/send-code/route.ts, frontend/src/app/api/auth/whatsapp/verify/route.ts, frontend/src/components/kloel/auth/auth-modal.tsx
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
- Break Types: VISUAL_CONTRACT_GENERIC_SPINNER (38), VISUAL_CONTRACT_EMOJI_UI (9), TRANSACTION_NO_ISOLATION (8), CACHE_STALE_AFTER_WRITE (6), IDEMPOTENCY_MISSING (5), FACADE (4)
- Related Files: frontend/src/app/(main)/flow/page.tsx (5), frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), backend/src/kloel/kloel.service.ts (4), backend/src/kloel/mercado-pago.service.ts (4), frontend/src/app/(main)/webinarios/page.tsx (4), backend/src/checkout/checkout.service.ts (3), backend/src/kloel/product-sub-resources.controller.ts (3), frontend/src/app/(main)/funnels/page.tsx (3), backend/src/billing/payment-method.service.ts (2), backend/src/checkout/checkout-order-support.ts (2)
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
- Break Types: VISUAL_CONTRACT_GENERIC_SPINNER (38), VISUAL_CONTRACT_EMOJI_UI (9), CACHE_STALE_AFTER_WRITE (3), FINANCIAL_ERROR_SWALLOWED (3), FLOATING_PROMISE (3), IDEMPOTENCY_MISSING (3)
- Related Files: frontend/src/app/(main)/flow/page.tsx (5), frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), backend/src/kloel/kloel.service.ts (4), backend/src/kloel/mercado-pago.service.ts (4), frontend/src/app/(main)/webinarios/page.tsx (4), backend/src/whatsapp/providers/waha.provider.ts (3), frontend/src/app/(main)/funnels/page.tsx (3), backend/src/webhooks/asaas-webhook.controller.ts (2), frontend/src/app/(main)/autopilot/page.tsx (2), frontend/src/app/(main)/followups/page.tsx (2)
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
- Break Types: TRANSACTION_NO_ISOLATION (9), UNSAFE_ANY_CAST (7), MIGRATION_NO_ROLLBACK (4), FINANCIAL_ERROR_SWALLOWED (3), IDEMPOTENCY_MISSING (3), OBSERVABILITY_NO_ALERTING (3)
- Related Files: backend/src/kloel/wallet.service.ts (10), backend/src/checkout/checkout.service.ts (3), backend/src/billing/payment-method.service.ts (2), backend/src/checkout/checkout-order-support.ts (2), backend/src/kloel/mercado-pago-wallet.controller.ts (2), backend/src/kloel/smart-payment.service.ts (2), frontend/src/app/(main)/checkout/[planId]/page.tsx (2), frontend/src/components/products/ProductCheckoutsTab.tsx (2), /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts, /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet.service.ts
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
- Summary: Runtime probes were not executed in scan mode.
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
- Break Types: UNSAFE_ANY_CAST (7), VISUAL_CONTRACT_GENERIC_SPINNER (4), EDGE_CASE_FILE (3), AUDIT_ADMIN_NO_LOG (2), FINANCIAL_ERROR_SWALLOWED (2), MIGRATION_NO_ROLLBACK (2)
- Related Files: backend/src/kloel/wallet.service.ts (10), backend/src/kyc/kyc.controller.ts (3), backend/src/billing/payment-method.service.ts (2), backend/src/kloel/mercado-pago-wallet.controller.ts (2), frontend/src/components/kloel/settings/analytics-settings-section.tsx (2), frontend/src/components/kloel/settings/crm-settings-section.tsx (2), /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts, /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet.service.ts, backend/prisma/migrations/20260408210000_wallet_cents_additive/migration.sql, backend/prisma/migrations/20260408220000_wallet_ledger_append_only/migration.sql
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
- Break Types: EDGE_CASE_FILE (11), VISUAL_CONTRACT_EMOJI_UI (5), VISUAL_CONTRACT_GENERIC_SPINNER (4), EDGE_CASE_PAGINATION (3), IDEMPOTENCY_MISSING (3), AUDIT_ADMIN_NO_LOG (2)
- Related Files: frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), backend/src/kloel/product-sub-resources.controller.ts (3), backend/src/kyc/kyc.controller.ts (3), backend/src/whatsapp/providers/waha.provider.ts (3), backend/src/kloel/audio.controller.ts (2), backend/src/kloel/kloel.controller.ts (2), backend/src/kloel/mercado-pago-wallet.controller.ts (2), backend/src/kloel/mercado-pago.service.ts (2), backend/src/media/media.controller.ts (2), backend/src/webhooks/asaas-webhook.controller.ts (2)
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
- Break Types: VISUAL_CONTRACT_EMOJI_UI (5), VISUAL_CONTRACT_GENERIC_SPINNER (4), COST_LLM_NO_LIMIT (2), DOCKER_BUILD_FAILS (2), E2E_FLOW_NOT_TESTED (2), FINDMANY_NO_PAGINATION (2)
- Related Files: frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), frontend/src/app/(main)/autopilot/page.tsx (2), frontend/src/components/kloel/settings/analytics-settings-section.tsx (2), .github/workflows/, /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/Dockerfile, /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet-ledger.service.ts, /home/runner/work/whatsapp_saas/whatsapp_saas/backend/src/kloel/wallet.service.ts, /home/runner/work/whatsapp_saas/whatsapp_saas/e2e, /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src, /home/runner/work/whatsapp_saas/whatsapp_saas/frontend/src/Dockerfile
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
- Break Types: VISUAL_CONTRACT_GENERIC_SPINNER (38), VISUAL_CONTRACT_EMOJI_UI (9), QUEUE_NO_PROCESSOR (4), FINANCIAL_ERROR_SWALLOWED (3), FLOATING_PROMISE (3), ORDERING_WEBHOOK_OOO (3)
- Related Files: frontend/src/app/(main)/flow/page.tsx (5), frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), backend/src/kloel/mercado-pago.service.ts (4), frontend/src/app/(main)/webinarios/page.tsx (4), backend/src/kloel/kloel.service.ts (3), frontend/src/app/(main)/funnels/page.tsx (3), backend/src/campaigns/campaigns.service.ts (2), backend/src/webhooks/asaas-webhook.controller.ts (2), frontend/src/app/(main)/autopilot/page.tsx (2), frontend/src/app/(main)/followups/page.tsx (2)
- Artifacts: PULSE_CERTIFICATE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_OPERATOR_EVIDENCE.json, PULSE_RUNTIME_EVIDENCE.json, PULSE_SCENARIO_COVERAGE.json, PULSE_SOAK_EVIDENCE.json, PULSE_WORLD_STATE.json
- Exit Criteria:
  - Async expectations settle to satisfied: flow-resume-after-wait.
  - Scenario operator-campaigns-and-flows reports status=passed in synthetic evidence.

## 10. [P2] Clear Blocking Security And Compliance Findings

- Kind: security
- Status: open
- Lane: security
- Failure Class: product_failure
- Summary: Security certification found blocking findings. Blocking types: COOKIE_NOT_HTTPONLY. Top blocking types: COOKIE_NOT_HTTPONLY.
- Target State: Security gate must pass with no blocking compliance, auth, cookie, secret, or sensitive-data findings.
- Gates: securityPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: COOKIE_NOT_HTTPONLY
- Related Files: backend/src/cookie-consent/cookie-consent.controller.ts
- Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Exit Criteria:
  - Blocking security break types are cleared: COOKIE_NOT_HTTPONLY.
  - securityPass returns pass in the next certification run.

## 11. [P2] Clear Invariant Pass

- Kind: gate
- Status: open
- Lane: reliability
- Failure Class: product_failure
- Summary: Invariant checks are failing: financial-audit-trail. Current focus: financial-audit-trail:failed.
- Target State: Gate invariantPass must return pass with fresh evidence on the current commit.
- Gates: invariantPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: —
- Related Files: —
- Artifacts: PULSE_CERTIFICATE.json, PULSE_INVARIANT_EVIDENCE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_INVARIANT_EVIDENCE.json
- Exit Criteria:
  - Gate invariantPass returns pass in the next certification run.
  - Tracked gate focus is resolved: financial-audit-trail:failed.

## 12. [P2] Clear Observability Pass

- Kind: gate
- Status: open
- Lane: reliability
- Failure Class: product_failure
- Summary: Observability certification found blocking findings. Blocking types: AUDIT_ADMIN_NO_LOG, AUDIT_DELETION_NO_LOG, OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING.
- Target State: Gate observabilityPass must return pass with fresh evidence on the current commit.
- Gates: observabilityPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: —
- Related Files: —
- Artifacts: PULSE_CERTIFICATE.json, PULSE_OBSERVABILITY_EVIDENCE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_OBSERVABILITY_EVIDENCE.json
- Exit Criteria:
  - Gate observabilityPass returns pass in the next certification run.

## 13. [P2] Clear Recovery Pass

- Kind: gate
- Status: open
- Lane: reliability
- Failure Class: product_failure
- Summary: Recovery certification found blocking findings. Blocking types: BACKUP_MISSING, MIGRATION_NO_ROLLBACK.
- Target State: Gate recoveryPass must return pass with fresh evidence on the current commit.
- Gates: recoveryPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: —
- Related Files: —
- Artifacts: PULSE_CERTIFICATE.json, PULSE_RECOVERY_EVIDENCE.json
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_RECOVERY_EVIDENCE.json
- Exit Criteria:
  - Gate recoveryPass returns pass in the next certification run.

## 14. [P3] Reduce Remaining Static Critical And High Breakers

- Kind: static
- Status: open
- Lane: platform
- Failure Class: product_failure
- Summary: Static certification found 169 critical/high blocking finding(s). Top structural types: VISUAL_CONTRACT_GENERIC_SPINNER (38), CACHE_STALE_AFTER_WRITE (15), EDGE_CASE_FILE (11), TRANSACTION_NO_ISOLATION (9), VISUAL_CONTRACT_EMOJI_UI (9), UNSAFE_ANY_CAST (7), EDGE_CASE_STRING (6), QUEUE_NO_PROCESSOR (6).
- Target State: Static certification should have no remaining critical/high blockers outside the scenario and security queues.
- Gates: staticPass
- Scenarios: —
- Modules: —
- Routes: —
- Flows: —
- Async Expectations: —
- Break Types: VISUAL_CONTRACT_GENERIC_SPINNER (38), CACHE_STALE_AFTER_WRITE (15), EDGE_CASE_FILE (11), TRANSACTION_NO_ISOLATION (9), VISUAL_CONTRACT_EMOJI_UI (9), UNSAFE_ANY_CAST (7), EDGE_CASE_STRING (6), QUEUE_NO_PROCESSOR (6), TOFIX_WITHOUT_PARSE (6), FACADE (5)
- Related Files: backend/src/kloel/wallet.service.ts (10), backend/src/kloel/mercado-pago.service.ts (9), backend/src/kloel/kloel.service.ts (5), frontend/src/app/(main)/flow/page.tsx (5), frontend/src/components/kloel/marketing/WhatsAppExperience.tsx (5), frontend/src/app/(main)/webinarios/page.tsx (4), backend/src/checkout/checkout.service.ts (3), backend/src/kloel/product-sub-resources.controller.ts (3), backend/src/kyc/kyc.controller.ts (3), backend/src/reports/dto/report-filters.dto.ts (3), backend/src/whatsapp/providers/waha.provider.ts (3), frontend/src/app/(main)/funnels/page.tsx (3), frontend/src/components/plans/PlanAIConfigTab.tsx (3), backend/src/billing/payment-method.service.ts (2), backend/src/campaigns/campaigns.service.ts (2)
- Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Validation Artifacts: PULSE_CERTIFICATE.json, PULSE_REPORT.md
- Exit Criteria:
  - Blocking static break inventory reaches zero for the tracked set (168 currently open).
  - staticPass returns pass in the next certification run.
