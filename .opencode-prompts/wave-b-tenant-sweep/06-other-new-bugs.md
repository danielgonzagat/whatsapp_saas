# Wave B / Slice 6 — TenantSweep-OtherNewBugs

## Mission

Eliminate the 6 NEW BUGs identified by `npm run check:tenant-filter` after Wave A
purged the allowlist. Each is a workspace-scoped Prisma query lacking
`workspaceId` filter. None of these files were in the prior 5 Wave B slices.

## Exact bugs to fix

1. `backend/src/admin/chat/admin-chat-session.service.ts:73` —
   `prisma.adminChatSession.findMany` without workspaceId
2. `backend/src/admin/chat/admin-chat.service.ts:296` —
   `prisma.adminChatSession.findMany` without workspaceId
3. `backend/src/gdpr/gdpr.service.ts:124` —
   `prisma.gdprRequest.findFirst` without workspaceId
4. `backend/src/gdpr/gdpr.service.ts:417` —
   `prisma.message.findMany` without workspaceId
5. `worker/campaign-processor.ts:180` —
   `prisma.contact.findMany` without workspaceId
6. `worker/providers/registry.ts:47` —
   `prisma.contact.findFirst` without workspaceId

## Ownership set (you MAY edit ONLY these files)

- `backend/src/admin/chat/admin-chat-session.service.ts`
- `backend/src/admin/chat/admin-chat-session.service.spec.ts` (create if missing)
- `backend/src/admin/chat/admin-chat.service.ts`
- `backend/src/admin/chat/admin-chat.service.spec.ts` (create if missing)
- `backend/src/gdpr/gdpr.service.ts`
- `backend/src/gdpr/gdpr.service.spec.ts` (create if missing)
- `worker/campaign-processor.ts`
- `worker/campaign-processor.spec.ts` (create if missing)
- `worker/providers/registry.ts`
- `worker/providers/registry.spec.ts` (create if missing)

Outside this set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE NÃO-INVENÇÃO.
2. `AGENTS.md` — full read.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full read.
4. Each of the 6 target files — full read.
5. `backend/src/common/decorators/admin-global-operation.decorator.ts` IF the
   AuthService slice (#1) already created it; reuse it.

## Special note on admin-chat services

The admin-chat services may be legitimately admin-global (admin sees all
workspace chats). If so:
- Decorate with `@AdminGlobalOperation('admin can audit chat sessions across workspaces')`
- Guard at controller level with platform-admin role check
- Spec proves: non-admin caller → ForbiddenException

If they should be workspace-scoped (admin operating within a workspace), add
`workspaceId` filter explicitly.

## Pattern to apply

Identical to Slices 1-5. Each Prisma call: either `workspaceId` filter or
`@AdminGlobalOperation` decorator + spec proof of guard.

## Forbidden moves

Same as Slices 1-5: no bypass tokens, no new any, no protected files,
no commits (CEO commits).

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/admin/chat/admin-chat-session.service.ts \
  src/admin/chat/admin-chat-session.service.spec.ts \
  src/admin/chat/admin-chat.service.ts \
  src/admin/chat/admin-chat.service.spec.ts \
  src/gdpr/gdpr.service.ts \
  src/gdpr/gdpr.service.spec.ts
npx jest --testPathPattern="admin/chat|gdpr"

cd ../worker
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint campaign-processor.ts campaign-processor.spec.ts \
  providers/registry.ts providers/registry.spec.ts
npx jest --testPathPattern="campaign-processor|providers/registry"

cd ..
node scripts/ops/check-tenant-filter.mjs 2>&1 | tail -20
```

## Definition of done

- `node scripts/ops/check-tenant-filter.mjs` shows **0 NEW BUGs** (the 6 are
  gone).
- Each touched service has spec covering happy + cross-workspace rejection.
- `npx tsc` does not regress.
- `npx eslint` clean on touched files.
- No bypass tokens, no new any, no protected files.
- No commits. JSON delivery report.

## Hard stop conditions

- If a model referenced isn't in `backend/prisma/schema.prisma` — STOP, report.
- If admin-chat services need a schema change to add workspaceId column — STOP,
  report (schema migration is separate scope).
- If worker `campaign-processor` is invoked from a context that doesn't have
  workspaceId in scope — STOP, report (calling code is the bug).
