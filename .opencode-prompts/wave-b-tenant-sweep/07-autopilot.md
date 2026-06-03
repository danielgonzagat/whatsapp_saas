# Wave B / Slice 7 — TenantSweep-AutopilotService + AutopilotProcessor

## Mission

Eliminate cross-tenant query bugs in `backend/src/autopilot/autopilot.service.ts`
(17 entries per A.1 of mission anexo) AND `worker/processors/autopilot-processor.ts`
(15 entries). Both files together control autopilot decisions and worker execution.

## Ownership set

- `backend/src/autopilot/autopilot.service.ts`
- `backend/src/autopilot/autopilot.service.spec.ts` (create if missing)
- `worker/processors/autopilot-processor.ts`
- `worker/processors/autopilot-processor.spec.ts` (create if missing)
- Any direct helper in `worker/processors/autopilot/` ONLY if imported by
  autopilot-processor.ts AND has tenant-isolation issue. List in report.

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE WHATSAPP / AUTOPILOT + REGRA DE QUALIDADE DE IA +
   REGRA DE BANCO DE DADOS.
2. `AGENTS.md`.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md`.
4. `backend/src/common/decorators/admin-global-operation.decorator.ts` (from
   Wave B/1 commit 3add61503 — reuse for cross-workspace admin operations).
5. Both target files in full.

## Special rules for autopilot

- `workspace findUnique` patterns are common — verify whether the lookup
  has implicit tenant context (workspace id IS the where clause). Per A.1,
  most are TRANSITIVE_REVIEW not BUG.
- Autopilot decisions MUST be auditable: every Prisma write related to a
  decision must record `workspaceId + correlationId + decisionTimestamp`.
- Handoff signal: when human takes over, autopilot must stop. Verify the
  related Prisma calls (autopilot session state).

## Pattern to apply

Same as previous Wave B slices: workspaceId in every workspace-scoped
Prisma `where`, or @AdminGlobalOperation decorator for legitimate global ops.

## Forbidden moves

- No bypass tokens, no new `any`.
- Don't decompose the service/processor (they may be at line-limit but decomp
  is Wave K).
- Don't touch other autopilot files outside ownership.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/autopilot/autopilot.service.ts src/autopilot/autopilot.service.spec.ts
npx jest --testPathPattern=autopilot/autopilot

cd ../worker
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint processors/autopilot-processor.ts processors/autopilot-processor.spec.ts
npx jest --testPathPattern=autopilot-processor

cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/autopilot/ 2>&1 | tail -10
node scripts/ops/check-tenant-filter.mjs --path worker/processors/autopilot 2>&1 | tail -10
```

## Definition of done

- Zero tenant-filter violations in both target files.
- Specs cover happy path + tenant isolation + decision audit trail.
- `npx tsc` no regress (both backend and worker).
- `npx eslint` clean on touched files.
- No bypass tokens, no `any`, no commits.

## Hard stop conditions

- If a worker Prisma call lacks workspaceId because the worker is invoked from
  a context without it — STOP, report (the calling code is the bug).
- If the calling job payload doesn't carry workspaceId — STOP, report (queue
  schema fix needed).
- File size pushes >800 — STOP, report.
