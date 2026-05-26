# Wave 18 — Decompose unified-agent.service.ts Report

> Authored by PI atomic subagent `w18-decompose-unified-agent` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the ABI build/cache fallback block (the Wave 12 Gap 2 wiring) from
`UnifiedAgentService.processMessage()` into a standalone helper module. This
is the cognitive state construction path — ABIBuilder → validation →
cache snapshot fallback → hardcoded zero-state.

## 1. Lines extracted + new LOC

| Metric | Before | After |
|--------|--------|-------|
| `unified-agent.service.ts` | **586 LOC** (21.2 KB) | **527 LOC** |
| New file | — | **83 LOC** |
| **Lines extracted** | — | **73 lines** of ABI/cache logic |
| Net reduction in service | — | **−59 lines** |

### What was extracted

The entire cognitive-state block inside `processMessage()`:

- Default `cognitiveState` initialization (abiStatus, audience, perceptionSnapshot)
- `BrainCapabilityExecutorService.buildCognitiveSubstrate()` call with try/catch
- `AbiBuilderService.build()` call
- `validateAbiPayload()` validation gate
- `AbiSnapshotCacheService.getCachedSnapshot()` fallback on build failure
- `AbiSnapshotCacheService.getCachedSnapshot()` fallback on validation failure
- Hardcoded zero-state fallback when no cache is available
- `AbiSnapshotCacheService.cacheSnapshot()` on success

Replaced with a single 8-line call:

```typescript
const cognitiveState = await buildAgentCognitiveState({
  workspaceId,
  currentInput,
  abiBuilder: this.abiBuilder,
  abiSnapshotCache: this.abiSnapshotCache,
  brainCapability: this.brainCapability,
  logger: this.logger,
});
```

## 2. Files created

- **`backend/src/kloel/unified-agent.cognitive-state.helpers.ts`** (83 LOC)
  - Exports `buildAgentCognitiveState(params)` — async function that constructs
    the cognitive state with full ABI build → validation → cache fallback pipeline
  - Takes `BuildAgentCognitiveStateParams` with optional injected services
    (`abiBuilder?`, `abiSnapshotCache?`, `brainCapability?`) and a `logger`
  - Imports `validateAbiPayload` from `./abi/abi-validator` (moved from service)

## 3. Backend tsc result

```
npm --prefix backend run typecheck
→ tsc -p tsconfig.build.json --noEmit
→ Exit 0 — clean, no errors
```

## 4. Spec result

| Test suite | Result |
|------------|--------|
| `unified-agent.service.spec.ts` | ✅ PASS (exit 0) |
| `unified-agent.service.part2.spec.ts` | ✅ PASS (exit 0) |
| `unified-agent.service.part3.spec.ts` | ✅ PASS (exit 0) |
| `unified-agent.service.part4.spec.ts` | ✅ PASS (exit 0) |

All existing specs pass with zero changes.

## Behavioral preservation

- The extracted function is **behaviorally identical** — same control flow, same
  `this.logger` → `logger` references, same cache/fallback logic.
- `cognitiveState` changed from `let` (reassignable) to `const` (assigned once
  from the helper return). This is safe because the helper now owns all mutation;
  the service only reads the result.
- The `import { validateAbiPayload }` was moved from the service to the helper —
  it was only used inside the ABI block.
- Constructor injections for `AbiBuilderService`, `AbiSnapshotCacheService`,
  and `BrainCapabilityExecutorService` remain in the service (needed to pass
  them through to the helper).

## Risk assessment

**LOW.** The extraction is a pure refactor with no behavioral change:
- No public API change on `UnifiedAgentService`
- No change to the LLM context construction (messages array, cognitiveState
  injection into the prompt — all preserved)
- Specs pass without modification
- TypeScript compiles without errors
