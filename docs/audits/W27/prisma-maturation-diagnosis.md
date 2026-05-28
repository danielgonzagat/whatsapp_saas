# W27-A — Prisma maturation errors diagnosis (5 Sentry issues)

**Date:** 2026-05-26
**Investigator:** Claude Explore agent
**Sentry context:** 5 production `PrismaClientKnownRequestError` instances totaling ~1,440 events / 24h.

## Service 1 — `ConnectLedgerMaturationService.matureDueEntries`

**Sentry issue:** NODE-M (458 events / 24h)
**File:** `backend/src/payments/ledger/connect-ledger-maturation.service.ts:47-56`

**Prisma query:**
```ts
connectLedgerEntry.findMany({
  where: { type: 'CREDIT_PENDING', matured: false, scheduledFor: { lte: now } },
  orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
  select: { id: true },
  take: 500,
});
```

**Fields used:** `id`, `type`, `matured`, `scheduledFor`, `createdAt`

**Existing handlers (lines 66-82):** catches P2002 (idempotent skip) + P2025 (record disappeared).

**Hypothesis:** Most likely **P2021 column-not-found** on the `matured` boolean (line 50). If the production schema is missing this column, the findMany throws on every cron tick.

**Fix:**
1. Verify schema: `mcp__postgres__pg_query` SELECT column_name FROM information_schema.columns WHERE table_name='ConnectLedgerEntry'.
2. If `matured` missing, add migration:
   ```sql
   ALTER TABLE "ConnectLedgerEntry" ADD COLUMN "matured" BOOLEAN NOT NULL DEFAULT false;
   ```
3. Add P2021 handler in the same catch block.

**Risk:** Low. Default false is safe; existing P2002/P2025 paths cover the other races.

---

## Service 2 — `MarketplaceTreasuryMaturationService.matureDueCredits`

**Sentry issue:** NODE-P (445 events / 24h)
**File:** `backend/src/marketplace-treasury/marketplace-treasury-maturation.service.ts:64-79`

**Prisma query:**
```ts
marketplaceTreasuryLedger.findMany({
  where: {
    kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
    direction: 'credit',
    bucket: MarketplaceTreasuryBucket.PENDING,
    createdAt: { lte: dueBefore },
  },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  select: { id, currency, amountInCents, createdAt },
  take: 500,
});
```

**Fields used:** `id`, `kind`, `direction`, `bucket`, `createdAt`, `currency`, `amountInCents`

**Existing handlers:** Serializable transaction (line 89+) with synthetic idempotency markers (`mature:available:${id}`). Catches P2002 + P2025.

**Hypothesis:** P2022 **enum/column mismatch** on `direction` or `bucket`. If prod schema has stale enum values, the where-clause fails.

**Fix:**
1. Inspect column types: `pg_table_describe table=marketplace_treasury_ledger`.
2. Compare to schema.prisma enum `MarketplaceTreasuryBucket` + `direction` field.
3. Add P2021/P2022 handler.

**Risk:** Low. Existing transaction idempotency covers concurrent runs.

---

## Service 3 — `AgentRuntimeSchedulerService.listDueJobs`

**Sentry issue:** NODE-1D (224 events / 24h)
**File:** `backend/src/kloel/agent-runtime/agent-runtime.scheduler.ts:109-114`

**Prisma query:**
```ts
kloelMemory.findMany({
  where: { category: 'agent_job', type: 'scheduled' },
  orderBy: { updatedAt: 'asc' },
  take: Math.max(1, Math.min(limit, 100)),
  select: { id, workspaceId, key, value },
});
```

**Fields used:** `id`, `category`, `type`, `workspaceId`, `key`, `value`, `updatedAt`

**Existing handlers (lines 120-139):** Returns `[]` on any `PrismaClientKnownRequestError`; detects P2021/P2022 specifically.

**Hypothesis:** P2021 — **`kloelMemory` table or its `category`/`type` columns missing in prod**. The service already handles P2021 by returning `[]`, which is why the scheduler appears to "do nothing" silently — the errors fire but the loop swallows them.

**Fix:**
1. Confirm `kloelMemory` exists in prod (pg_count or pg_table_describe).
2. Confirm `category` + `type` columns exist.
3. Run `prisma migrate deploy` in prod if any migration is pending.

**Risk:** Medium. Silent failure means scheduled jobs don't run; add Datadog alert on empty result sets > 5 cycles.

---

## Service 4 — `AgentRuntimeJobRunnerService.runAllPendingAgentJobs`

**Sentry issue:** NODE-1C (224 events / 24h)
**File:** `backend/src/kloel/agent-runtime/agent-runtime.job-runner.ts:38-44, 129-151`

**Prisma queries:**
```ts
// listing query
mindOutboxEvent.findMany({
  where: { eventType: 'agent.job.due', status: 'pending' },
  distinct: ['workspaceId'],
  orderBy: { createdAt: 'asc' },
  take: 25,
  select: { workspaceId },
});

// claim query
mindOutboxEvent.updateMany({
  where: { id: { in: eventIds }, status: 'pending' },
  data: { status: 'processing', attempts: { increment: 1 } },
});
```

**Fields used:** `eventType`, `status`, `workspaceId`, `id`, `subject`, `payload`, `idempotencyKey`, `occurredAt`, `attempts`, `lastError`, `createdAt`

**Existing handlers:** **None visible** in lines 38-151. Errors bubble.

**Hypothesis:** P2021 on `attempts` field (line 137) — incrementing a column that doesn't exist in prod. The service has zero error boundary, so every cron tick that hits this state pages.

**Fix:**
1. Verify `MindOutboxEvent` table has `attempts INT DEFAULT 0`.
2. Wrap both queries in try/catch returning `[]` on P2021/P2022, like the sibling scheduler service does.

**Risk:** High. No error handling means job processing halts entirely on schema drift. Add boundary immediately even before confirming schema.

---

## Service 5 — `AdRulesEngineService.evaluateRulesWithObservability`

**Sentry issue:** NODE-1E (92 events / 24h)
**File:** `backend/src/kloel/ad-rules-engine.service.ts:89-104, 312-318`

**Prisma queries:**
```ts
// list active rules
adRule.findMany({
  where: { active: true },
  take: 200,
  select: { id, workspaceId, name, condition, action, alertMethod, alertTarget, active, fireCount, lastFiredAt },
});

// fire counter
adRule.updateMany({
  where: { id: rule.id, workspaceId: rule.workspaceId },
  data: { fireCount: { increment: 1 }, lastFiredAt: new Date() },
});
```

**Fields used:** `id`, `workspaceId`, `name`, `condition`, `action`, `alertMethod`, `alertTarget`, `active`, `fireCount`, `lastFiredAt`

**Existing handlers (lines 86-140):** generic try/catch around the per-rule loop, no Prisma error code classification.

**Hypothesis:** P2021 on `fireCount` column. The increment fails if the column is absent in prod.

**Fix:**
1. Verify `AdRule.fireCount` exists (`pg_table_describe adRule`).
2. Add Prisma error classification in the rule-evaluation catch.
3. Consider explicit upsert with retry-with-exponential-backoff for `fireCount` updates under high concurrency.

**Risk:** Medium.

---

## Summary table

| Service | Events/24h | Most likely error | Concrete fix | Risk |
|---|---:|---|---|---|
| connect-ledger-maturation | 458 | P2021 `matured` missing | ALTER TABLE add column + handler | Low |
| marketplace-treasury-maturation | 445 | P2022 enum/column mismatch | Schema inspect + handler | Low |
| agent-runtime.scheduler | 224 | P2021 `kloelMemory` table/columns | `prisma migrate deploy` | Medium |
| agent-runtime.job-runner | 224 | P2021 `attempts` field + no handler | Add boundary + verify column | **High** |
| ad-rules-engine | 92 | P2021 `fireCount` missing | Verify column + classify errors | Medium |

## Immediate next actions

1. **Run `mcp__postgres__pg_query`** to inspect prod schema for `ConnectLedgerEntry.matured`, `MarketplaceTreasuryLedger.{direction,bucket}`, `KloelMemory.{category,type}`, `MindOutboxEvent.attempts`, `AdRule.fireCount`.
2. **`prisma migrate status`** on prod — list pending migrations.
3. **Apply pending migrations** via `prisma migrate deploy` (idempotent).
4. **Add P2021/P2022 handlers** to the 2 services lacking them (job-runner + ad-rules-engine).
5. **Add Datadog alert** for `mindOutboxEvent` empty-result-set streaks.

These 5 services together account for **1,443 / 24h = ~60 events/hour** of production noise. Closing them should reduce Sentry signal substantially and unblock background-job processing.

## Related

- [[CANONICAL_DOMAINS]] — payments, marketplace-treasury, kloel.agent-runtime domains
- [[../../prisma/schema.prisma]] — source of model truth
- [[../../prisma/migrations/]] — applied migration history
