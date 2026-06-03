# Wave B/4 — TenantSweep Affiliate + Reports + MemberArea (72 entries)

## Mission

Verify and complete tenant-isolation for 3 controllers/services:
- `backend/src/affiliate/affiliate.controller.ts` (25 entries originally)
- `backend/src/reports/reports.service.ts` (24 entries originally)
- `backend/src/member-area/member-area.controller.ts` (23 entries originally)

Wave A already purged the allowlist. Verify the code is actually tenant-safe and write cross-workspace specs.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE QUALIDADE DE IA
3. `AGENTS.md`
4. All 3 target files (full)
5. `backend/src/common/decorators/admin-global-operation.decorator.ts` (if exists, use it)

## Pattern

```ts
// query com workspaceId
where: { id, workspaceId }
// query transitiva (id pertence a parent)
const parent = await prisma.parent.findFirst({ where: { id: parentId, workspaceId } });
if (!parent) throw new NotFoundException();
// admin global (admin pode ver tudo) — DECORATOR EXPLÍCITO
@AdminGlobalOperation('reason')
```

## Ownership set

- `backend/src/affiliate/affiliate.controller.ts` + spec
- `backend/src/reports/reports.service.ts` + spec
- `backend/src/member-area/member-area.controller.ts` + spec

## Constraints + DoD + Hard stops

- NO bypass tokens, NO commits, NO protected files
- Each Prisma query workspaceId-scoped OR explicitly @AdminGlobalOperation
- Cross-workspace spec proves workspace-B's resource can't be accessed from workspace-A
- `npx jest src/(affiliate|reports|member-area)/` passes
- `npx tsc --noEmit` no new errors
