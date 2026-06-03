# Wave G / Slice 2 — Schema-Models-Prereq (ChatSession + GuestSession + PlanStatus)

## Mission

Create the 3 Prisma schema additions blocked by hard-stops in prior slices:

1. **`ChatSession` model** — blocked Wave G/Slice 1 (ChatPersistence-Backend)
2. **`GuestSession` model** — blocked Wave G/Slice 3 (FloatingChatGuestSession-Backend)
3. **`PlanStatus` enum + ProductPlan.status field** — blocked Wave F item 6 (products/[id]/plans/[planId]/page.tsx)

Each addition needs a Prisma migration + service stub if not present.

## Ownership set

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_add_chat_session_model/migration.sql` (CREATE)
- `backend/prisma/migrations/<timestamp>_add_guest_session_model/migration.sql` (CREATE)
- `backend/prisma/migrations/<timestamp>_add_plan_status_enum/migration.sql` (CREATE)
- `backend/src/kloel/chat-session.service.ts` (CREATE if missing — service stub with CRUD)
- `backend/src/kloel/chat-session.service.spec.ts` (CREATE)
- `backend/src/guest/guest-session.service.ts` (CREATE if missing)
- `backend/src/guest/guest-session.service.spec.ts` (CREATE)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS.
2. `AGENTS.md`.
3. `backend/prisma/schema.prisma` — full read.
4. Wave G/1 delivery (commit 84d6f0297) for context on what was done.

## Required schema additions

### ChatSession (new model)

```prisma
model ChatSession {
  id            String    @id @default(cuid())
  userId        String
  workspaceId   String
  deviceId      String
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @updatedAt
  expiresAt     DateTime?
  metadata      Json?

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId, deviceId])
  @@index([workspaceId, lastActiveAt])
}
```

### GuestSession (new model)

```prisma
model GuestSession {
  id            String    @id @default(cuid())
  cookieToken   String    @unique
  workspaceId   String?
  fingerprint   String?
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @updatedAt
  expiresAt     DateTime
  metadata      Json?

  workspace     Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)

  @@index([cookieToken])
  @@index([expiresAt])
}
```

### PlanStatus enum + ProductPlan.status

```prisma
enum PlanStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

// Modify existing ProductPlan model:
model ProductPlan {
  // ... existing fields ...
  status        PlanStatus @default(DRAFT)
  // Migration: data backfill — set existing active=true rows to ACTIVE,
  // active=false to ARCHIVED. Keep the existing 'active' Boolean for one
  // release cycle for backwards compatibility; remove in next migration.
}
```

## Service stubs

For ChatSession + GuestSession:
- CRUD: getOrCreate, listForUser, listForWorkspace, expire
- Tenant isolation enforced in every query (workspaceId in where)
- Idempotent getOrCreate (returns existing on (userId, workspaceId, deviceId) match)
- Specs covering happy + tenant-isolation + idempotency

## Forbidden moves

- DROP columns in any migration. Always ADD (forward-only).
- Backfill via `db push` instead of migration. ALWAYS use migrate dev/deploy.
- Add new `any`, bypass tokens, or protected file edits.

## Validation gates

```bash
cd backend
npx prisma validate
npx prisma migrate diff --from-schema-datasource backend/prisma/schema.prisma \
  --to-schema-datamodel backend/prisma/schema.prisma --script

# Each migration must be reviewable + reversible without data loss:
ls -la prisma/migrations/*add_chat_session* prisma/migrations/*add_guest_session* prisma/migrations/*add_plan_status*

# Specs
npx jest --testPathPattern="kloel/chat-session|guest/guest-session"

# Tsc no new errors
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

## Definition of done

- 3 new migration files (one per schema addition).
- `prisma validate` passes.
- ChatSessionService + GuestSessionService with CRUD + specs (≥6 tests each).
- ProductPlan has `status: PlanStatus` field with backfill migration.
- Specs covering tenant isolation pass.
- `npx tsc` no regress.
- No bypass tokens, no protected files outside ownership, no commits.

## Hard stop conditions

- If `User` model doesn't have the fields needed for the ChatSession relation —
  STOP, report.
- If `Workspace` model doesn't exist — STOP, report.
- If a migration would require data loss — STOP, report (need ADR before
  proceeding).

## Follow-up after this slice

Once this slice merges, the dependent slices can proceed:
- Wave G/1 (ChatPersistence): replace localStorage with ChatSessionService
- Wave G/3 (FloatingChatGuestSession): replace localStorage with cookie + GuestSessionService
- Wave F item 6 (products plans page): replace "EM BREVE" with real plan.status
