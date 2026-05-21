# Wave B / Slice 2 — TenantSweep-KloelService

## Mission

Eliminate cross-tenant query bugs in `backend/src/kloel/kloel.service.ts`.
The prior allowlist had multiple entries pointing here including `chatThread
findFirst|2`, `chatThread findFirst|3`, `contact count|2`. Audit the entire
file and fix every cross-tenant query.

## Ownership set (you MAY edit ONLY these files)

- `backend/src/kloel/kloel.service.ts`
- `backend/src/kloel/kloel.service.spec.ts` (create if missing)
- Any direct helper file already imported by kloel.service.ts that lives in
  `backend/src/kloel/` AND has fewer than 5 unique consumers. List each in
  your delivery report.

Outside this set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS section.
2. `AGENTS.md` — full read.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full.
4. `backend/src/kloel/kloel.service.ts` — full read.
5. `backend/src/common/decorators/admin-global-operation.decorator.ts` — if it
   exists by the time you start (Slice 1 may have created it). Reuse it.

## Pattern to apply

Identical to Slice 1 (AuthService). For each Prisma call without explicit
`workspaceId` filter: either add `workspaceId` or annotate the method as
platform-admin global with the decorator + guard + spec.

## Forbidden moves

Identical to Slice 1.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/kloel/kloel.service.ts src/kloel/kloel.service.spec.ts
npx jest --testPathPattern=kloel/kloel
cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/kloel/ 2>&1 | tail -20
```

## Definition of done

- Zero tenant-filter violations in `backend/src/kloel/kloel.service.ts`.
- All Prisma calls workspace-scoped OR @AdminGlobalOperation-annotated.
- Specs cover happy path + tenant-isolation + at least one upstream error.
- `npx tsc` count does not regress.
- `npx eslint` clean on touched files.
- No bypass tokens. No new any. No protected files.
- No commits. CEO commits. Deliver JSON report.

## Hard stop conditions

- `kloel.service.ts` is over 600 lines AND your changes would push above 800 —
  STOP, report (decomp is separate wave).
- If a Prisma model referenced is orphan (not in schema.prisma) — STOP, report.
- If a method has implicit tenant context via a session or token that the
  Prisma call isn't using — STOP and explain; the calling code's contract
  is the bug.
