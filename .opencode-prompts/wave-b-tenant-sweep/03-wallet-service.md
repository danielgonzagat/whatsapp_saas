# Wave B / Slice 3 — TenantSweep-WalletService

## Mission

Eliminate cross-tenant query bugs in `backend/src/kloel/wallet.service.ts`.
Wallet is FINANCIAL surface — any cross-tenant query is a critical risk
(viewing or moving another workspace's money). Every bug here is severity-1.

## Ownership set

- `backend/src/kloel/wallet.service.ts`
- `backend/src/kloel/wallet.service.spec.ts` (create if missing)
- Direct wallet helpers in `backend/src/kloel/` (wallet-balance.ts,
  wallet-confirm.ts, wallet-reconciliation.ts, wallet-sale.ts,
  wallet-withdrawal.ts, wallet.errors.ts) — IF they exist when you start.

Outside this set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE + REGRA DE BANCO
   DE DADOS sections fully.
2. `AGENTS.md` — full read.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full.
4. `docs/adr/0003-stripe-connect-platform-model.md` — context.
5. `backend/src/kloel/wallet.service.ts` — full read.
6. Any wallet-* helper in your ownership set — full read each.

## Special rules for financial code

- Money MUST be `bigint` cents. Never `number` for value.
- Append-only ledger semantics: NEVER update an existing LedgerEntry — write
  a compensating entry.
- Every mutation must be inside `prisma.$transaction` if it touches multiple
  rows.
- Every external-facing mutation must accept and verify an `Idempotency-Key`.
- The spec MUST include at minimum:
  - happy-path debit/credit
  - cross-tenant rejection (wallet of another workspace not accessible)
  - duplicate idempotency-key returns same result, no double-spend
  - concurrent withdrawal race condition does not double-debit

## Pattern to apply

For each Prisma call: add `workspaceId` to `where`. For platform-admin
operations (system reconciliation, payout settlement), use the
@AdminGlobalOperation decorator from Slice 1. Reject every doubt: if a call
COULD operate across tenants without explicit auth, it's a bug.

## Forbidden moves

- Float for money. Any `Number(x)` or `x * 100` arithmetic on money is a fail.
- `prisma.<model>.update` on a LedgerEntry. Append a compensating entry
  instead.
- Catching errors with `any`. Type as `unknown` and narrow.
- Bypass tokens. No new `any`.
- Touching files outside ownership.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/kloel/wallet.service.ts src/kloel/wallet.service.spec.ts \
  src/kloel/wallet-*.ts 2>/dev/null
npx jest --testPathPattern=kloel/wallet
cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/kloel/wallet 2>&1 | tail -20
```

## Definition of done

- Zero tenant-filter violations across wallet files.
- All financial mutations transactional + idempotent + append-only.
- Spec covers happy + tenant-isolation + idempotency + concurrency.
- `npx tsc` does not regress.
- `npx eslint` clean.
- No new any, no bypass tokens, no protected files touched.
- No commits. CEO commits. JSON report includes the financial-invariant
  evidence (the 4 spec scenarios above must show in test output).

## Hard stop conditions

- Any wallet-* helper has a Prisma `update` on LedgerEntry → STOP, report:
  this is a financial-integrity violation requiring ADR before patch.
- Any wallet method that mutates without `$transaction` → STOP, report.
- Any wallet method that mutates without `Idempotency-Key` verification at
  the controller layer → STOP, report (might be a controller-side fix).
- File exceeds 600 lines OR your changes push it past 800 → STOP, report.
