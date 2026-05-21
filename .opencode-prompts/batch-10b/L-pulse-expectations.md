# Wave L — PULSE pending expectations (11 → 0)

## Mission

Resolve the 11 PULSE pending expectations by adding observed evidence via Playwright/Jest/HTTP real specs.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE EVIDÊNCIA OBRIGATÓRIA
3. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`
4. `AGENTS.md`

## 11 expectations to resolve (per prompt section A.9)

1. `customer-whatsapp-and-inbox:message-persistence` — Playwright: open inbox → send msg → reload → see persisted. Spec: `e2e/specs/customer-whatsapp-and-inbox.spec.ts` (exists, complete)
2. `customer-whatsapp-and-inbox:conversation-reload` — switch conversation → back → state from server
3. `operator-campaigns-and-flows:flow-resume-after-wait` — campaign with wait-node 10s, pause worker, resume, complete. NEW spec: `e2e/specs/flow-resume-after-wait.spec.ts`
4. `operator-autopilot-run:job-enqueued` — click "Run Autopilot" → job in BullMQ → workspace.autopilotLastRun updated. Spec exists, complete
5. `operator-autopilot-run:worker-health-visible` — worker health indicator visible+updated
6. `admin-settings-kyc-banking:kyc-doc-processing` — admin upload KYC doc → pipeline → status → notification. Spec exists, complete
7. `admin-settings-kyc-banking:withdrawal-ledger-consistency` — withdraw → ledger entry → payout match → reconciliation green
8. `admin-whatsapp-session-control:session-reconnect` — kill session → admin reconnect → restored
9. `admin-whatsapp-session-control:provider-status-sync` — provider status change → frontend reflects without refresh
10. `system-payment-reconciliation:payment-webhook-replay` — webhook arrives 2x same idempotency key → processed once. Spec exists, complete
11. `system-payment-reconciliation:wallet-ledger-reconciliation` — payment → wallet credit → ledger entry → balance correct after reconciliation

## Ownership set

- `e2e/specs/customer-whatsapp-and-inbox.spec.ts` (complete it)
- `e2e/specs/flow-resume-after-wait.spec.ts` (CREATE)
- `e2e/specs/autopilot-run.spec.ts` (complete it)
- `e2e/specs/settings-kyc.spec.ts` (complete it)
- `e2e/specs/withdrawal-ledger-consistency.spec.ts` (CREATE)
- `e2e/specs/admin-whatsapp-session-control.spec.ts` (CREATE)
- `e2e/specs/system-payment-reconciliation.spec.ts` (complete it)
- `e2e/specs/wallet-ledger-reconciliation.spec.ts` (CREATE)
- `backend/src/payments/audit-trail.invariant.spec.ts` (CREATE — invariant test)

## Constraints

- NO bypass tokens
- NO commits
- Tests must use REAL flows (mock only what truly can't run in CI — e.g., Stripe webhook can be simulated)
- Each spec must have evidence emit to `PULSE_EXECUTION_MATRIX.json` (via the existing pulse:scenario-evidence helper)

## Definition of Done

- All 11 expectations have observed evidence specs
- `pnpm --filter e2e test` runs them all (may need CI env)
- Report per-expectation status

## Hard stop conditions

- An expectation requires Production env (Stripe live key, real Meta WhatsApp number) — STOP, report and create the spec gated on env presence
- A test would need >2h of infrastructure setup — STOP, report scope
