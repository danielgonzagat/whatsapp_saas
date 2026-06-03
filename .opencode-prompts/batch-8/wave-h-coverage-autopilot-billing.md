# Wave H/Coverage — Autopilot + Billing services without spec (~14 new specs)

## Mission

Create `.spec.ts` files for `backend/src/autopilot/` + `backend/src/billing/` services that lack coverage.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE QUALIDADE DE IA + REGRA DE PAGAMENTOS + REGRA DE WHATSAPP / AUTOPILOT
3. `AGENTS.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend/src
find autopilot billing -name "*.service.ts" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Target services

### Autopilot (8 services per inventory; 2-4 already covered by AUTOPILOT-A)

- `autopilot-cycle-money.service.ts`
- `autopilot-cycle.service.ts`
- `autopilot-ops-conversion.service.ts`
- `autopilot-ops.service.ts`
- Any others without spec

### Billing (6 services per inventory)

- `billing-checkout-helper.service.ts`
- `billing-checkout-webhook.service.ts`
- `billing-subscription.service.ts`
- `billing-webhook.service.ts`
- `billing.service.ts`
- `plan-limits.service.ts`

## Special invariants

### Autopilot
- **Decision audit trail**: every decision writes to `autopilotEvent` with `workspaceId` + `correlationId`
- **Handoff signal**: when `handoff=true`, no LLM call is made
- **Token budget**: `plan-limits.ensureTokenBudget(workspaceId)` is called before any LLM
- **No fabricated data**: LLM response is parsed and validated; if validation fails, fallback returns honest "low confidence" state, not a fabricated answer

### Billing
- **Bigint cents always** for money
- **Idempotent webhooks**: verify WebhookEvent unique constraint enforced
- **Append-only ledger**: test that no `prisma.ledgerEntry.update` is called
- **Plan-limits enforcement**: test that exceeded limits raise `PlanLimitException`

## Spec template

See batch-8/wave-h-coverage-checkout-whatsapp.md.

## Constraints (CLAUDE.md)

- NO bypass tokens
- NO commits
- NO modifying protected files
- NO real OpenAI calls in tests — mock `chatCompletionWithRetry`

## Definition of Done

- All target services without spec now have one
- ≥3 tests per spec
- `npx jest --testPathPatterns="(autopilot|billing)/" --coverage` exits 0 with ≥70% lines per touched file
- Report per-service coverage %

## Hard stop conditions

- Autopilot service requires real LLM call — STOP, report
- Billing service has a real money-handling bug discovered — STOP, report P0
- Plan-limits service requires real Redis for rate-limit — STOP, report integration gap
