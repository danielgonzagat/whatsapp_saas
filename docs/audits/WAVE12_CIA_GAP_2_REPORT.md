# Wave 12 — CIA Gap 2: ABI Snapshot Cache

> Authored by PI atomic subagent `w12-cia-gap-2-abi-cache` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/abi/abi-snapshot-cache.service.ts` | **NEW** — AbiSnapshotCacheService (Redis-backed ABI snapshot cache, TTL 300s) |
| `backend/src/kloel/abi/abi-snapshot-cache.service.spec.ts` | **NEW** — 8 unit tests covering cache/retrieve, Redis failures, null injection |
| `backend/src/kloel/abi/abi.module.ts` | Added `AbiSnapshotCacheService` to providers + exports |
| `backend/src/kloel/unified-agent.service.ts` | Injected `AbiSnapshotCacheService`; on success → `cacheSnapshot()`; on build/validation failure → `getCachedSnapshot()` before zero-state fallback |
| `backend/src/kloel/intent-router/intent-router.service.ts` | Fixed pre-existing missing `},` (TS1136) to allow tsc to pass |

## 2. Test Results

```
AbiSnapshotCacheService
  with a working Redis
    ✓ caches a snapshot and retrieves it
    ✓ returns null when no snapshot cached
    ✓ uses the correct key prefix and TTL
    ✓ survives Redis write failure gracefully
    ✓ survives Redis read failure gracefully
    ✓ returns null on read when Redis returns null
  without Redis (null injection)
    ✓ cacheSnapshot returns silently without Redis
    ✓ getCachedSnapshot returns null without Redis

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

Existing ABI tests (builder + validator) also all pass (26 tests).

## 3. Backend tsc Result

Only pre-existing errors remain in files not touched by this PR (`brain-runtime.service.ts`, `capability-registry-v2.const.ts`, `capability-registry-v2.service.ts`, `kloel.module.ts`, `toolplanner.service.ts`). The `intent-router.service.ts` syntax error (missing `},`) was fixed in this PR to unblock compilation. **No new tsc errors introduced.**

## 4. New Service Full Source

```typescript
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { StructuredLogger } from '../../logging/structured-logger';
import type { CognitiveStateAbi } from './abi-schema';

const SNAPSHOT_KEY_PREFIX = 'abi:snap:';
const SNAPSHOT_TTL_SECONDS = 300;

@Injectable()
export class AbiSnapshotCacheService {
  private readonly logger = StructuredLogger.from(AbiSnapshotCacheService.name);

  constructor(@Optional() @InjectRedis() private readonly redis?: Redis) {}

  async cacheSnapshot(workspaceId: string, payload: CognitiveStateAbi): Promise<void> {
    if (!this.redis) return;
    try {
      const key = `${SNAPSHOT_KEY_PREFIX}${workspaceId}`;
      await this.redis.set(key, JSON.stringify(payload), 'EX', SNAPSHOT_TTL_SECONDS);
    } catch (err: unknown) {
      this.logger.warn(
        `Cache write failed for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getCachedSnapshot(workspaceId: string): Promise<CognitiveStateAbi | null> {
    if (!this.redis) return null;
    try {
      const key = `${SNAPSHOT_KEY_PREFIX}${workspaceId}`;
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as CognitiveStateAbi;
    } catch (err: unknown) {
      this.logger.warn(
        `Cache read failed for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
```

## 5. Redis Outage Resilience

**Confirmed**: Redis failure NEVER breaks message delivery.

- `cacheSnapshot()`: guarded by `try/catch` + early return on null Redis → write failure is silently logged, not re-thrown
- `getCachedSnapshot()`: guarded by `try/catch` + early return `null` on null Redis → read failure returns `null`, and the caller in `unified-agent.service.ts` falls through to the existing hardcoded zero-state
- In `unified-agent.service.ts`, the `void this.abiSnapshotCache?.cacheSnapshot(...)` call is fire-and-forget (not awaited), so a slow/crashing Redis write does not block the LLM call
- If cache miss occurs on both build failure and validation failure, the original hardcoded zero-state `cognitiveState` is used as the ultimate fallback — exactly as before this PR

### Fallback decision tree

```
ABI build
  ├─ status='ok' + validation PASS → use fresh ABI + cache snapshot (fire-and-forget)
  ├─ status='ok' + validation FAIL → try cached snapshot
  │   ├─ cache hit → use cached snapshot
  │   └─ cache miss / Redis down → use hardcoded zero-state (unchanged behavior)
  └─ status='lineage_compromised' → try cached snapshot
      ├─ cache hit → use cached snapshot
      └─ cache miss / Redis down → use hardcoded zero-state (unchanged behavior)
```
