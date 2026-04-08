# Tenant Isolation Audit (Invariant I4)

> Status: PR P2.5-1 — initial sweep landed 2026-04-08
> Owners: KLOEL engineering
> Related: ADR 0001 (WhatsApp source of truth), Big Tech hardening plan

## What this enforces

KLOEL is a multi-tenant SaaS. Every workspace stores its own contacts,
conversations, messages, flows, products, payments, and so on. A bug
that lets workspace A read or mutate workspace B's data would be a
data-confidentiality incident — exactly the class of catastrophic
issue that's expensive to detect after the fact and trivial to
introduce in everyday CRUD code.

**Invariant I4 (tenant isolation)** is the rule we enforce in code:

> Every Prisma query on a workspace-scoped model MUST filter by
> `workspaceId` in its `where` clause, OR be explicitly listed in
> the audit allowlist with a justification.

## How the static scanner works

`scripts/ops/check-tenant-filter.mjs` walks `backend/src/` and
`worker/`, finds every Prisma call that matches
`(this.)?prisma(Any)?.<model>.<method>(...)` or `tx.<model>.<method>(...)`,
extracts the `where` clause, and classifies each finding into one of:

| Bucket              | Meaning                                                                                                                                          | Action                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `OK_FILTERED`       | The query's `where` clause includes `workspaceId`.                                                                                               | None — this is the happy path.                                  |
| `OK_GLOBAL`         | Model is in the curated `GLOBAL_MODELS` set (refresh tokens, password resets, verification codes).                                               | None — these are intentionally cross-workspace.                 |
| `TRANSITIVE_REVIEW` | Model has no `workspaceId` field of its own (e.g. `CheckoutPayment` is scoped via its parent `CheckoutOrder`).                                   | Soft warning. Verify the parent relation enforces the boundary. |
| `PK_REVIEW`         | Query accesses by primary key (`findUnique`, `update by id`). The caller may have already loaded the record with a workspace-scoped query first. | Soft warning. Spot-check the caller.                            |
| `UNKNOWN_MODEL`     | Model name doesn't match anything in the schema. Likely a typo or a model that was deleted.                                                      | Hard warning. Fix the call site or update the script.           |
| `BUG`               | Model has a `workspaceId String` field but the query's `where` clause does not reference it.                                                     | Block CI until fixed or allowlisted.                            |

The script auto-loads the model classification from
`backend/prisma/schema.prisma` on every run, so as new workspace-scoped
models are added they're automatically protected — no manual list to
maintain.

## The allowlist

`scripts/ops/tenant-filter-allowlist.json` is the source of truth for
"we know about this query and it is correct". Each entry pins a
specific `(file, line, model)` triple and a free-text `reason`.

When a finding lands in the allowlist, **the reason MUST be a concrete
justification**:

```json
{
  "file": "backend/src/app.controller.ts",
  "line": 70,
  "model": "agent",
  "method": "count",
  "reason": "admin diagnostic /diag-db, gated by DIAG_TOKEN env var; intentionally counts all agents platform-wide"
}
```

The initial allowlist generated for PR P2.5-1 has placeholder reasons
(`"TODO — review and either fix or document why cross-tenant"`). Each
follow-up PR that touches one of these files should:

1. Either fix the query to include `workspaceId` and **delete the
   allowlist entry**, or
2. Replace the placeholder reason with a real justification.

Over time the allowlist shrinks. The number of entries with TODO
reasons is the working backlog for this audit.

## Categories of legitimate cross-tenant queries

These are the patterns that will accumulate in the allowlist with
real (non-TODO) reasons:

| Category                | Example                                      | Why it's safe                                   |
| ----------------------- | -------------------------------------------- | ----------------------------------------------- |
| Admin diagnostics       | `/diag-db` endpoint                          | Gated by env-token; intentionally platform-wide |
| Background cleanup jobs | `MemoryManagementService.cleanupAll()`       | System-level orphan removal                     |
| Auth pre-checks         | `checkEmail(email)`                          | Pre-signup; user has no workspace yet           |
| Cross-workspace OAuth   | `agent.findFirst({ where: { providerId } })` | OAuth identifier is globally unique by design   |
| Reconciliation jobs     | `LedgerReconciliationService`                | Scans across all workspaces by design           |

## Categories that should NEVER be in the allowlist

These are real bugs that must be fixed, not allowlisted:

- User-facing controllers that read or mutate workspace data without
  binding to the authenticated user's workspace
- Service methods called from request handlers that take a `workspaceId`
  parameter but don't include it in the query
- Aggregations on revenue/sales/usage that should be scoped per workspace

## Workflow

```bash
# Run the scan locally
node scripts/ops/check-tenant-filter.mjs

# Show full BUG list with file:line
node scripts/ops/check-tenant-filter.mjs --verbose

# Quick exit code only
node scripts/ops/check-tenant-filter.mjs --summary

# After fixing a query, regenerate the allowlist
echo '{"entries":[]}' > scripts/ops/tenant-filter-allowlist.json
node scripts/ops/check-tenant-filter.mjs --generate-allowlist > /tmp/allow.json
mv /tmp/allow.json scripts/ops/tenant-filter-allowlist.json

# CI runs:
node scripts/ops/check-tenant-filter.mjs --summary
# exits non-zero if there are unallowlisted BUGs
```

## Initial sweep numbers (2026-04-08)

| Bucket                                | Count     |
| ------------------------------------- | --------- |
| Total Prisma queries scanned          | 1378      |
| OK (filtered by workspaceId)          | 614 (45%) |
| OK (global model)                     | 8         |
| PK review (soft warning)              | 242       |
| Transitive review (soft warning)      | 416       |
| Unknown model                         | 5         |
| **BUG (workspace-scoped, no filter)** | **93**    |

All 93 BUGs are currently in the allowlist with TODO reasons. Each
must be triaged and either fixed or given a real justification before
the corresponding code path can be considered audited.

## Related work

- **PR P2.5-2** adds a runtime negative test matrix that creates two
  workspaces and asserts cross-tenant denials — defense in depth on
  top of the static scanner.
- **PR P2.5-3** extends the audit to Redis cache keys, distributed
  lock keys, and BullMQ job payloads.
