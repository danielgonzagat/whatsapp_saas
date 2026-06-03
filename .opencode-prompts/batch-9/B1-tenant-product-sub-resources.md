# Wave B/1 — TenantSweep ProductSubResourcesController (60 entries)

## Mission

Eliminate ALL 60 tenant-isolation allowlist entries for `backend/src/kloel/product-sub-resources.controller.ts`. Each entry is a Prisma query missing `workspaceId` filter.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS (workspace isolation mandatory)
3. `AGENTS.md`
4. `backend/src/kloel/product-sub-resources.controller.ts` (full)
5. `scripts/ops/tenant-filter-allowlist.json` (entries with file=product-sub-resources.controller.ts)

## Pattern

For each Prisma query (`findFirst`, `findMany`, `updateMany`, `deleteMany`, `count`, `aggregate`):

```ts
// PADRÃO: query com workspaceId obrigatório
const result = await this.prisma.X.findFirst({
  where: { id, workspaceId },
});

// PADRÃO: query transitiva (id pertence a parent que é do workspace)
const parent = await this.prisma.parent.findFirst({
  where: { id: parentId, workspaceId },
});
if (!parent) throw new NotFoundException();
const child = await this.prisma.child.findFirst({
  where: { id: childId, parentId: parent.id },
});

// PADRÃO: admin global (admin pode ver tudo) — DECORATOR EXPLÍCITO
@AdminGlobalOperation('Listar workspaces para auditoria')
async adminListWorkspaces() {
  return this.prisma.workspace.findMany();
}
```

Create `backend/src/common/decorators/admin-global-operation.decorator.ts` if it doesn't exist:

```ts
import { SetMetadata } from '@nestjs/common';
export const ADMIN_GLOBAL_OPERATION = 'ADMIN_GLOBAL_OPERATION';
export const AdminGlobalOperation = (reason: string) =>
  SetMetadata(ADMIN_GLOBAL_OPERATION, reason);
```

## Ownership set

- `backend/src/kloel/product-sub-resources.controller.ts`
- `backend/src/kloel/product-sub-resources.controller.spec.ts` (CREATE if missing)
- `backend/src/common/decorators/admin-global-operation.decorator.ts` (CREATE if missing)

## Constraints

- NO bypass tokens
- NO commits — Claude (CEO) commits after Tier-3 validation
- NO modifying protected files (CLAUDE.md, AGENTS.md, ops/*.json, .husky/, .github/workflows/ci-cd.yml, eslint configs, scripts/pulse/no-hardcoded-reality-audit.ts)
- Workspace isolation is the LAW — every entry must be either workspaceId-scoped or explicitly decorated

## Definition of Done

- All 60 tenant-filter-allowlist entries for this file resolved (workspaceId added OR @AdminGlobalOperation decorator applied)
- New cross-workspace spec: try to access workspace-B's resource from workspace-A → expect NotFoundException or ForbiddenException
- `cd /Users/danielpenin/whatsapp_saas && grep -c "product-sub-resources.controller" scripts/ops/tenant-filter-allowlist.json` returns 0
- `cd backend && npx tsc --noEmit 2>&1 | grep "product-sub-resources" | wc -l` returns 0 (no new tsc errors)
- `npx jest src/kloel/product-sub-resources.controller.spec.ts` exits 0

## Hard stop conditions

- A query genuinely needs cross-workspace access — STOP, document with @AdminGlobalOperation + reason, do NOT silently leave it without decorator
- Service signature change would cascade to 10+ callers — STOP, report scope expansion
