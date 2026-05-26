# WAVE 15 — CIA Gap 5: Spine Event Persistence to Redis Stream

> Authored by PI atomic subagent `w15-cia-gap-5-spine-persistence` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/spine/spine-emitter.service.ts` | Added Redis Stream XADD (fire-and-forget) in `emit()`, added `replayFromStream()` method, added `@InjectRedis()` injection |
| `backend/src/kloel/spine/spine-emitter.service.spec.ts` | Added 10 new tests covering Redis persistence and replay |

No new files created. No new dependencies — `ioredis` and `@nestjs-modules/ioredis` were already in `package.json`.

## 2. Test Result

```
Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total (12 original + 10 new)
```

### New tests (10):

| # | Test | Verifies |
|---|------|----------|
| 1 | `emit() writes envelope to Redis Stream with correct args` | XADD key, MAXLEN ~5000, auto-ID `*`, field `event`, JSON payload |
| 2 | `emit() still writes to ring buffer alongside Redis` | Dual-write: ring + Redis |
| 3 | `emit() resolves even when Redis xadd rejects` | Fire-and-forget — Redis failure does NOT throw |
| 4 | `emit() does not call xadd when workspaceId is undefined` | No workspace → no stream key |
| 5 | `emit() does not call xadd when redis is absent (no DI)` | Graceful no-op without Redis |
| 6 | `replayFromStream calls xrange with correct key and defaults` | XRANGE `spine:events:<ws>` `-` `+` |
| 7 | `replayFromStream uses since as xrange start when provided` | Cold-start hydration with cursor |
| 8 | `replayFromStream returns empty array when redis is absent` | No Redis → `[]` |
| 9 | `replayFromStream returns empty array on xrange error` | Error resilience |
| 10 | `replayFromStream skips entries with missing event field` | Per-entry parse hardening |

## 3. Backend tsc Result

**PASS** — No new type errors introduced. The 6 pre-existing errors in unrelated files (`mind-policy.service.ts`, `operation-receipt.helpers.ts`, `toolplanner.service.ts`, `wisdom-relevance-filter.service.ts`, Prisma-generated types) remain and are not within scope.

## 4. Why Redis Stream over PostgreSQL Append-Only Table

| Dimension | Redis Stream | PostgreSQL Append-Only Table |
|-----------|-------------|------------------------------|
| **Write latency** | O(1) in-memory append + async disk flush. Sub-ms. | Requires INSERT + index update + WAL flush. 1–5 ms. |
| **Fire-and-forget model** | XADD returns immediately. `.catch()` handles errors. | DB error can throw inside the transaction boundary of the caller. |
| **Failure isolation** | Redis failure is fully fire-and-forget. `void promise.catch()` — zero impact on the business path. | If PG is unavailable, the emit() call would need to choose between throwing (unacceptable per contract) or queueing a retry (adds complexity). |
| **Operational simplicity** | Redis is already deployed and configured globally in `AppModule`. The `@InjectRedis()` pattern is used in 40+ services. Zero new infrastructure. | PG is also available, but writing high-frequency append-only events to it increases write pressure on the primary DB that serves all transactional queries. |
| **MAXLEN ~ cap** | Native `XADD ... MAXLEN ~ 5000` — approximate capping with constant memory. No GC cron. | Requires a periodic DELETE or partition rotation to cap. |
| **Replay ergonomics** | `XRANGE key - +` is a single O(n) command. | `SELECT ... ORDER BY` with correct index. Works fine, but adds a table + migration. |
| **Stream consumer groups** | Future: fan-out to multiple consumers (audit, analytics, MIND cold-start) via `XREADGROUP`. | Would need a separate queue table or NOTIFY/LISTEN. |

**Decision**: Redis Stream. It satisfies the fire-and-forget constraint (emit MUST never throw), leverages existing infrastructure, and provides a natural path to consumer groups for future cross-worker event fan-out.

## 5. Memory Budget

### Per workspace (MAXLEN ~5000)

Each envelope serialized to JSON:

| Field | Typical size |
|-------|-------------|
| `eventId` | 44 B (`evt_` + UUID) |
| `eventName` | ~40 B |
| `timestamp` / `occurredAt` | 2 × 24 B |
| `workspaceId` | ~12 B |
| `entityRef` | ~100 B |
| `truthMode` | ~12 B |
| `provenance` | ~150 B |
| `valence` | ~12 B |
| `payload` | 100–500 B (varies by event type) |
| `correlationId` | ~38 B |
| JSON overhead (keys, braces) | ~200 B |
| **Per envelope** | **~700–1200 B** |

**5000 events × 1 KB ≈ 5 MB per workspace** (pre-compaction).

With Redis `MAXLEN ~ 5000`, the approximate cap means the stream may briefly hold slightly more than 5000 entries before trimming. Worst case: ~6 MB per active workspace.

For 100 active workspaces: ~500–600 MB total Redis memory for the spine stream layer. This is well within the typical Redis deployment budget (1–2 GB instance).

### Comparison to ring buffer

The in-memory ring buffer in the Node.js process uses ~5 MB per worker (5000 envelopes × 1 KB, single global ring). This PR does not change the ring — it adds Redis as a persistent backing store.

## Design Notes

### Fire-and-forget contract

```typescript
if (this.redis && envelope.workspaceId) {
  void this.redis
    .xadd(`spine:events:${envelope.workspaceId}`, 'MAXLEN', '~', SPINE_STREAM_MAXLEN, '*', 'event', JSON.stringify(envelope))
    .catch((err: unknown) => {
      this.logger.warn(`Redis xadd failed for workspace ${envelope.workspaceId}: ${(err as Error).message}`);
    });
}
```

- `void` signals intentional non-awaited promise.
- `.catch()` handles rejection — no unhandled rejection, no throw.
- `workspaceId` guard — events without a workspace (global/system events) skip Redis.
- `redis` guard — graceful no-op when Redis is not injected (tests, optional dependency).

### replayFromStream (cold-start hydration)

```typescript
async replayFromStream(workspaceId: string, since?: string): Promise<SpineEventEnvelope[]>
```

- Uses `XRANGE` for time-range scans. `since` enables incremental hydration.
- Per-entry `JSON.parse` errors are caught and skipped — a single malformed entry does not break the entire replay.
- Returns `[]` on Redis absence or failure — caller handles empty gracefully.
- **Does NOT repopulate the ring buffer** — that is deferred to a future PR (the task specifies this).

### Backward compatibility

- `redis` parameter is `@Optional()` — all existing tests and direct instantiations continue to work unchanged.
- The `build()` test helper updated to accept optional third arg for Redis mock.
