# Kloel Deprecation Map

> Tracks each symbol/access-pattern marked as deprecated, with its canonical
> replacement and migration status. "Deprecated for NEW code" means existing
> grandfathered call sites still compile, but a CI gate blocks any NEW use.

| Deprecated symbol / access pattern | Canonical replacement | Enforced by | Status |
|---|---|---|---|
| Raw `prisma.kloelMemory.*` (incl. `this.`-qualified) | `MindMemoryItemService.items` (`backend/src/kloel/mind/aliases/mind-memory-item.service.ts`) | `check:canonical-mind` (`scripts/ops/check-canonical-mind-access.mjs`) | Deprecated for NEW code — existing sites grandfathered; gate fails on new direct access |
| Raw `prisma.kloelMessage.*` (incl. `this.`-qualified) | `MindMessageService.items` (`backend/src/kloel/mind/aliases/mind-message.service.ts`) | `check:canonical-mind` | Deprecated for NEW code — grandfathered + gate-locked |
| Raw `prisma.chatMessage.*` (incl. `this.`-qualified) | `MindChatMessageService.items` (`backend/src/kloel/mind/aliases/mind-chat-message.service.ts`) — targets the SEPARATE `RAC_ChatMessage` table | `check:canonical-mind` | Deprecated for NEW code — grandfathered + gate-locked |
| `getWorkspaceId(req)` (`backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:20`) — non-validating, returns `''` on missing workspace | `resolveWorkspaceId(req)` (`backend/src/auth/workspace-access.ts:119`) — validates via `assertWorkspaceAccess` (throws) | Convention (commit `d8504661d`) | All 9 product-sub-resource controllers converged off it; helper still exported but no longer called by those controllers |

## Notes

- The three raw `prisma.*` deprecations have documented exempt escapes that the
  `check:canonical-mind` gate still permits: the alias services themselves, the
  `?? …prisma.<delegate>` DI-fallback idiom, transactional `tx.<delegate>` access
  inside a `$transaction(tx => …)` callback, the
  `= prisma.<delegate>` default-parameter idiom, and a small explicitly
  grandfathered set pinned in the gate script.
- `getWorkspaceId` is deprecated by convention, not by an automated gate. The
  remaining definition in `common.helpers.ts` and other unrelated
  `getWorkspaceId` helpers (e.g. `kloel/guards/kloel-security.guard.ts:45`,
  `partnerships/partnerships.controller.ts:44`) are out of scope for this
  convergence and untouched.
