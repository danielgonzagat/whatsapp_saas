# Wave B / Slice 1 — TenantSweep-AuthService

## Mission

Eliminate ALL cross-tenant query bugs in `backend/src/auth/auth.service.ts`. Each
Prisma call that lacks `workspaceId` in its `where` clause (or an equivalent
authorization guarantee) is a tenant-isolation bug. The prior allowlist had 2
entries here (`auth.service.ts:230` and `auth.service.ts:307`) — those are the
visible tip; this slice audits the entire file and fixes every bug found.

## Ownership set (you MAY edit ONLY these files)

- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.service.spec.ts`
- `backend/src/common/decorators/admin-global-operation.decorator.ts` (CREATE if
  it does not yet exist; needed by methods that legitimately must operate
  across workspaces — e.g., platform admin lookups)
- `backend/src/common/decorators/__tests__/admin-global-operation.decorator.spec.ts`
  (CREATE the spec for the decorator)

Anything outside this set: STOP and report. Do NOT touch ratchet.json,
allowlist JSONs, governance docs, or shared infra files.

## Mandatory pre-read

1. `CLAUDE.md` — read REGRA DE BANCO DE DADOS + REGRA DE NÃO-INVENÇÃO sections.
2. `AGENTS.md` — read fully.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — read fully.
4. `backend/src/auth/auth.service.ts` — full read before any edit.
5. `backend/src/auth/auth.service.spec.ts` — full read.
6. `scripts/ops/check-tenant-filter.mjs` — to understand exactly what the
   workspace-filter checker recognizes as a valid filter.

## Pattern to apply

For each `prisma.<Model>.findFirst|findMany|updateMany|deleteMany|count` call
in `auth.service.ts`:

1. **If the operation is workspace-scoped** (normal user/customer flow):
   the `where` clause MUST include `workspaceId: <workspaceId>`. If a `findFirst`
   takes only an `id`, change it to `findFirst({ where: { id, workspaceId } })`.

2. **If the operation is platform-admin global** (system-wide lookup, e.g.,
   credential rotation, cross-workspace audit) — the method MUST be:
   - decorated with `@AdminGlobalOperation('<reason>')` (decorator you create)
   - protected by a guard that asserts the caller's role is platform-admin
   - covered by a spec that proves a non-admin caller gets `ForbiddenException`.

3. **NEVER** add a `// TODO — review` comment. Pick one of the two paths and
   commit to the fix.

## Forbidden moves

- Adding `// @ts-ignore`, `@ts-expect-error`, `as any`, `// eslint-disable*`,
  or any bypass token. (Gate-rules.mjs blocks them; you'll fail commit anyway.)
- Adding back entries to `scripts/ops/tenant-filter-allowlist.json` — that file
  was purged in Wave A and stays empty.
- Calling `prismaAny` for new code. Use the typed `this.prisma.<model>`.
- Catching errors with `catch (e: any)` — type as `unknown` and narrow.
- Decomposing the file into __companions__/ or __parts__/ — out of scope.
- Touching other services. If `auth.service.ts` calls into another service
  that has the same bug, fix only the consuming side here; the other service
  has its own slice.

## Validation gates (in order)

```bash
cd backend
# 1. Typecheck must not regress (current baseline 1013 errors; you may improve)
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

# 2. Lint of just your touched files
npx eslint src/auth/auth.service.ts src/auth/auth.service.spec.ts \
  src/common/decorators/admin-global-operation.decorator.ts \
  src/common/decorators/__tests__/admin-global-operation.decorator.spec.ts

# 3. Spec of just auth module (must pass)
npx jest --testPathPattern=auth

# 4. From repo root: workspace-filter checker must report 0 violations in
#    backend/src/auth/ (it may still report elsewhere — those are other slices)
cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/auth/ 2>&1 | tail -20
```

## Definition of done

- `node scripts/ops/check-tenant-filter.mjs --path backend/src/auth/` reports
  ZERO violations in this slice.
- Every workspace-scoped Prisma call in `auth.service.ts` has explicit
  `workspaceId` in `where`.
- Every platform-admin global Prisma call is decorated and guard-protected
  with spec evidence.
- `npx jest --testPathPattern=auth` passes (existing tests + your new ones).
- `npx tsc --noEmit` count does not increase (1013 baseline).
- `npx eslint` clean on your touched files.
- No bypass tokens introduced. No new `any`. No protected files touched.
- You committed NOTHING. The CEO orchestrator (Claude) commits after Tier-3
  validation. Hand back a JSON delivery report with:
  - files-touched list
  - before/after tenant-filter violation count for backend/src/auth/
  - before/after `npx tsc` error count (full repo)
  - before/after `npx eslint` violation count for touched files
  - test results summary
  - any blockers encountered

## Hard stop conditions

- If `auth.service.ts` references a Prisma model that doesn't exist in
  `backend/prisma/schema.prisma` — STOP, report.
- If a method legitimately needs cross-tenant access but the calling code
  doesn't have a `workspaceId` available — STOP, report (the calling context
  itself is the bug).
- If your changes would push file size over 600 lines — STOP, report (decomp
  is a different wave; do not silently restructure).
- If you find another tenant-isolation bug in a file outside your ownership
  set — note it in the report but DO NOT FIX (the other slice owns it).
