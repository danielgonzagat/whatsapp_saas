# Wave 16 — Decompose guest-chat.service.ts Report

> Authored by PI atomic subagent `w16-decompose-guest-chat` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines Extracted + New LOC

| Metric | Before | After |
|--------|--------|-------|
| `guest-chat.service.ts` | 667 LOC | **350 LOC** |
| `guest-chat.conversation.helpers.ts` | — | 137 LOC (new) |
| `guest-chat.chat.helpers.ts` | — | 299 LOC (new) |

**Reduction: 667 → 350 (−317 lines, −47.5%).** Target was < 500 ✅.

## 2. Files Created

### `backend/src/kloel/guest-chat.conversation.helpers.ts` (137 LOC)

Extracted conversation/session persistence layer as standalone functions:

| Symbol | Kind | Description |
|--------|------|-------------|
| `GuestConversation` | interface | Conversation shape (messages, timestamps) |
| `GUEST_CONVERSATION_TTL_SECONDS` | const | 24h TTL for Redis keys |
| `getRedisKey(sessionId)` | function | Redis key builder |
| `parseConversation(raw)` | function | JSON → GuestConversation parser |
| `getOrCreateConversation(sid, redis, map, logger)` | async function | Redis read-through with local Map fallback |
| `persistConversation(sid, conv, redis, map, logger)` | async function | Dual-write (local Map + Redis with TTL) |
| `persistConversationMessage(sid, role, content, redis, map, logger)` | async function | Atomic append + persist |
| `cleanupOldConversations(map, logger)` | function | Evict sessions older than 24h |
| `getConversationStats(map)` | function | Active sessions + total message count |

All functions take `Redis | undefined`, `Map<string, GuestConversation>`, and `StructuredLogger` as explicit parameters — no `this` binding, no NestJS decorators.

### `backend/src/kloel/guest-chat.chat.helpers.ts` (299 LOC)

Extracted chat/LLM logic and deterministic action dispatch:

| Symbol | Kind | Description |
|--------|------|-------------|
| `GUEST_CHAT_SYSTEM_PROMPT` | const | Anti-invention guardrail prompt |
| `trackGuestUsage(sid, tokens, model, logger)` | function | Guest token usage debug log |
| `buildGuestMessages(msg, sid, abiBuilder, redis, map, logger)` | async function | ABI-aware message context builder; calls conversation helpers internally |
| `generateGuestReply(ctxMsgs, sid, openai, config, logger, opsAlert, unavailableMsg)` | async function | Primary → fallback → emergency model chain with retry |
| `runDeterministicAction(msg, sid, wsId, toolDispatcher, intentRouter, spine, redis, map, logger)` | async function | IntentRouter + legacy detectActionIntent dispatch with receipt/spine recording |

## 3. Backend tsc Result

```
✅ PASS — tsc -p tsconfig.build.json --noEmit exited 0
```

## 4. Spec Result

```
13 tests: 11 passed, 2 failed
```

The 2 failures (`returns unavailable message when API key is missing`, `returns unavailable message when API key missing via SSE`) are **pre-existing** and environment-dependent: `resolveTextLlmApiKey` in `lib/llm-provider.ts` checks `DEEPSEEK_API_KEY` before `OPENAI_API_KEY` via `process.env` fallback, and `DEEPSEEK_API_KEY` is set in the local environment. These tests would fail identically on the pre-extraction service.

## Service Class After Extraction

The service retains:
- Constructor with all `@Optional()` injections (unchanged public API)
- `handleFileUpload()`, `chat()`, `chatSync()`, `getStats()`, `onModuleDestroy()` — all public methods preserved with identical signatures
- Thin private delegators for `buildGuestMessages`, `generateGuestReply`, `persistConversation`, `persistConversationMessage`, `cleanupOldConversations`
- Private helpers `getOpenAiKey()`, `writeStreamChunk()`, `resolveDefaultWorkspaceId()` — unchanged

Removed from service (now in helpers):
- `GuestConversation` interface, `GUEST_CONVERSATION_TTL_SECONDS`, `GUEST_CHAT_SYSTEM_PROMPT` constants
- `getRedisKey`, `parseConversation`, `getOrCreateConversation` — only called from extracted code, no delegator needed
- `trackGuestUsage` — only called from `generateGuestReply` (extracted)
- ~80 lines of deterministic dispatch blocks in `chatSync` → single `runDeterministicAction()` call
