# Wave 18 — Decompose partnerships.service.ts

> Authored by PI atomic subagent `w18-decompose-partnerships` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **Chat** method group (4 methods) from `PartnershipsService` into a sibling helper module `partnerships.chat.helpers.ts`.

The chat group was the most cohesive and self-contained extraction candidate: it depended only on `PrismaService` (no `Logger`, `ConfigService`, `EmailService`, or `AuditService`), and was clearly delimited by a `// ═══ CHAT ═══` section marker.

## Lines Extracted

| Metric | Before | After |
|--------|--------|-------|
| `partnerships.service.ts` | 599 LOC | 507 LOC |
| `partnerships.chat.helpers.ts` (new) | — | 121 LOC |
| Lines extracted from service | — | 92 LOC |
| Net LOC change (total) | 599 | 628 (+29) |

The +29 net increase is from JSDoc comments on each exported function and the import/export boilerplate — the actual logic is preserved verbatim, just relocated.

## Files Created

- `backend/src/partnerships/partnerships.chat.helpers.ts` — 121 LOC, 4 exported functions:
  - `getChatContacts(prisma, workspaceId)` — batch queries for partner contacts with unread counts and last messages
  - `getMessages(prisma, partnerId, cursor?)` — cursor-paginated partner messages
  - `sendMessage(prisma, partnerId, content, senderId, senderName)` — creates OWNER-sender message
  - `markAsRead(prisma, partnerId)` — marks unread PARTNER messages as read

## Public API Preserved

All 27 existing spec tests pass unchanged. The `PartnershipsService` class retains the same public method signatures — each chat method now delegates to its corresponding helper function:

```ts
async getChatContacts(workspaceId: string) {
  return getChatContacts(this.prisma, workspaceId);
}
```

The controller and all consumers are unaffected.

## Backend tsc Result

```
backend/tsconfig.json(14,5): error TS5101: Option 'baseUrl' is deprecated
```

**Pre-existing only.** No new type errors introduced. The `baseUrl` deprecation is a TypeScript 7.0 compatibility issue in `tsconfig.json` unrelated to this change.

## Spec Result

```
PASS src/partnerships/partnerships.service.spec.ts (10.502 s)
  PartnershipsService
    ✓ listCollaborators (x1)
    ✓ getCollaboratorStats (x1)
    ✓ inviteCollaborator (x3)
    ✓ removeCollaborator (x3)
    ✓ listAffiliates (x1)
    ✓ getAffiliateStats (x2)
    ✓ getAffiliateDetail (x2)
    ✓ createAffiliate (x7)
    ✓ getAffiliatePerformance (x2)
    ✓ getChatContacts (x3)
    ✓ sendMessage (x1)
    ✓ markAsRead (x1)

Test Suites: 1 passed, 1 total
Tests:       27 passed, 27 total
```

## Design Notes

- The chat helpers use `import type { PrismaService }` to avoid runtime import cycles while still getting full type checking — the helpers are pure functions that receive the Prisma client as a parameter.
- Each helper is independently testable with a mock Prisma client — no NestJS module setup required.
- Future candidate extractions: the **Collaborators** group (6 methods, ~100 LOC) and the **Affiliate performance** computation (`getAffiliatePerformance`, ~80 LOC of order-attribution logic) could be similarly extracted.