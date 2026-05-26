# Wave 20 — Decompose Inbox Service Report

> Authored by PI atomic subagent `w20-decompose-inbox` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **conversation singleton-open (I14) and message persistence (I15) core** — seven symbols, ~174 LOC — from `inbox.service.ts` into a sibling `inbox.conversation.helpers.ts`, following the existing `omnichannel.helpers.ts` pattern (pure functions, no DI dependencies, logger passed as parameter).

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| `inbox.service.ts` LOC | **562** | **388** |
| Extracted LOC | — | ~174 |
| New file LOC | — | 200 |
| Reduction | — | **31%** |
| Public API surface | 9 methods | 9 methods (unchanged) |

## Files Created

### `backend/src/inbox/inbox.conversation.helpers.ts` (200 LOC)

Extracted symbols:

| Symbol | Kind | I14/I15 | Description |
|--------|------|---------|-------------|
| `GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS` | const | I14 | Max retry count for conversation creation race |
| `isQueuedSendResult` | function | — | Type guard for queued transport results |
| `normalizeDate` | function | — | Coerces `Date \| string \| null \| undefined` → `Date \| null` |
| `resolveConversationLastMessageAt` | function | I15 | Resolves the correct `lastMessageAt` after a message insert |
| `buildConversationUpdate` | function | I15 | Builds the `ConversationUpdateInput` (unread increment/reset) |
| `getOrCreateConversationWithClient` | async function | I14 | Transaction-aware conversation find-or-create with P2002 retry |
| `saveMessageInTx` | async function | I15 | Message insert + conversation metadata update inside a Prisma tx |

All functions accept an optional `Logger` parameter (defaults to `Logger('InboxConversationHelpers')`), eliminating the `this.logger` coupling.

### `backend/src/inbox/inbox.service.ts` → 388 LOC (was 562)

Removed code:
- Lines 13–27: `GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS` constant + `isQueuedSendResult` type guard
- Lines 85–160: `getOrCreateConversationWithClient` private method
- Lines 270–296: `resolveConversationLastMessageAt` + `buildConversationUpdate` private methods
- Lines 298–347: `saveMessageInTx` private method
- Lines 349–360: `normalizeDate` private method

Added import:
```typescript
import {
  isQueuedSendResult,
  normalizeDate,
  getOrCreateConversationWithClient,
  saveMessageInTx,
} from './inbox.conversation.helpers';
```

Thinned methods:
- `getOrCreateConversation` → delegates to imported `getOrCreateConversationWithClient(this.prisma, …, this.logger)`
- `saveMessage` → uses imported `normalizeDate()` and `saveMessageInTx(tx, data, messageCreatedAt, this.logger)`
- `replyToConversation` → uses imported `isQueuedSendResult()`

## Verification

### Backend tsc
```
npm --prefix backend run typecheck
→ tsc -p tsconfig.build.json --noEmit
→ Exit 0 ✓
```

### Inbox Specs (Jest)
```
PASS src/inbox/inbox.service.spec.ts      (I14 + I15 coverage)
PASS src/inbox/inbox.controller.spec.ts
PASS src/inbox/inbox-events.service.spec.ts
PASS src/inbox/omnichannel.service.spec.ts
PASS src/inbox/smart-routing.service.spec.ts

Test Suites: 5 passed, 5 total
Tests:       35 passed, 35 total
```

All I14 (Conversation Singleton-Open) and I15 (Inbound Message Atomicity) invariants verified:
- P2002 race retry + re-read ✓
- Non-P2002 error propagation ✓
- Retry exhaustion throw ✓
- Single `$transaction` wrapping message.create + conversation.update ✓
- WebSocket/webhook projections AFTER commit ✓
- Silent mode suppression ✓
- Transaction throw → no projections ✓

## Design Decisions

1. **Logger parameterization**: Instead of keeping `this.logger` coupling, extracted functions accept `logger: Logger = defaultLogger`. The service passes `this.logger` so log messages still originate from `InboxService`.

2. **No callback indirection**: `saveMessageInTx` calls `getOrCreateConversationWithClient` directly (same module), avoiding the extra parameter that would be needed if they lived in different files.

3. **Pattern match**: Follows `omnichannel.helpers.ts` conventions — pure functions, no DI imports beyond `Logger` and `Prisma`, exported flat (no barrel).

4. **Public API zero-diff**: All 9 public methods preserve identical signatures and return types. No callers outside this module needed changes.
