# ADR 0004 — CIA Legacy Decommission (Global Learning + Self-Improvement)

- **Status**: Accepted
- **Date**: 2026-05-12
- **Decider**: Daniel Penin
- **Authorized by**: Daniel
- **Scope**: worker/processors/cia/global-learning.ts, worker/processors/cia/self-improvement.ts,
  worker/processors/autopilot/cia-action-dispatch.ts, backend/src/kloel/mind.\*, backend/src/kloel/mind-controller.ts

---

## 1. Context

### 1.1 Why decommission

The KLOEL Organism Prompt (Parte 7.1) mandates a single brain/orchestrator for all commercial decisions.
Lacuna L4 in `docs/audit/lacunas-identificadas.md` (lines 136-159) documents the violation: CIA legacy modules
`global-learning.ts` and `self-improvement.ts` still decide in production,
operating a parallel brain that selects message variants for `payment_recovery` and `followup` flows independently of
the unified `commercial-decision-orchestrator` + `MindService` brain.

The lacuna states:

- `global-learning.ts` exports `buildGlobalStrategy` — a decisional function that computes aggressiveness, preferred length, best hour, and preferred variant family from cross-workspace aggregates.
- `self-improvement.ts` exports `pickVariant` — a Thompson-sampling (UCB1-like) function that selects the best message variant from `mindBanditArm` records.
- These form a parallel decision authority that violates Part 7 of the Organism Prompt: "Ha cerebro paralelo decidindo
  variantes de mensagem em producao."

### 1.2 What changes

1. `pickVariant` migrates from local `mindBanditArm` Thompson sampling to querying the unified
   `MindService.resolveBestVariant` (which uses `policy.choose` on `mindPolicy` + `mindBelief`).
2. `buildGlobalStrategy` is reduced to pure aggregation — it feeds the brain's training data (via Redis
   `cia:global-patterns:v1`) but no longer serves as decision authority.
3. The worker→backend boundary uses HTTP (`POST /mind/:workspaceId/variant-decision`),
   consistent with the existing `unified-agent-integrator` pattern.
4. Old `globalStrategy` data flow through BullMQ jobs is preserved as aggregation context, not as decision authority.

---

## 2. Function-by-function migration

### 2.1 global-learning.ts — exports

| Export                       | Classification                                                               | Migration                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `inferWorkspaceDomain`       | Pure utility (normalization)                                                 | **Unchanged.** Used by aggregation pipelines.                                                                               |
| `anonymizeDecisionLog`       | Pure utility (anonymization)                                                 | **Unchanged.** Used by aggregation pipelines.                                                                               |
| `computeGlobalPatterns`      | Pure aggregation                                                             | **Unchanged.** Feeds training data.                                                                                         |
| `persistGlobalPatterns`      | Persistence (Redis write)                                                    | **Unchanged.** Writes to `cia:global-patterns:v1`.                                                                          |
| `buildGlobalStrategy`        | **Decisional** (computes aggressiveness, preferredVariantFamily, confidence) | **Reduced to aggregation fallback.** No longer consumed as decision authority. Remains available for insight/observability. |
| `GlobalLearningSignal`       | Type                                                                         | Unchanged.                                                                                                                  |
| `GlobalLearningPattern`      | Type                                                                         | Unchanged.                                                                                                                  |
| `MindAggressivenessOverride` | Type                                                                         | Unchanged.                                                                                                                  |

### 2.2 self-improvement.ts — exports

| Export                                              | Classification                                        | Migration                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickVariant`                                       | **Decisional** (Thompson sampling on `mindBanditArm`) | **Deprecated for decision authority.** Replaced by HTTP call to `MindService.resolveBestVariant`. Kept as fallback for when backend is unreachable. |
| `updateVariantOutcome`                              | Side-effect (writes `mindBanditArm` outcomes)         | **Deprecated.** Replaced by `policy.resolveOutcome` on `mindPolicy` rows. Kept as backward-compatible write.                                        |
| `computeLearningSnapshot`                           | Pure aggregation                                      | **Unchanged.** Reads `kloelMemory` for observability.                                                                                               |
| `recordDecisionLog`                                 | Persistence (writes `kloelMemory`)                    | **Unchanged.** Logs decisions for analytics.                                                                                                        |
| `ensureBanditArms`                                  | Side-effect (creates `mindBanditArm` rows)            | **Deprecated.** No longer needed when brain manages arms.                                                                                           |
| `DEFAULT_VARIANTS`                                  | Static data (variant key → text mapping)              | **Unchanged.** Shared mapping used by both old and new paths.                                                                                       |
| `VariantFamily`, `VariantOutcome`, `MessageVariant` | Types                                                 | Unchanged.                                                                                                                                          |

### 2.3 New backend surface

| Function                                   | Location                                | Maps to                                                                   |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| `resolveBestVariant`                       | `mind.service.ts`                       | `policy.choose({decisionType: 'flow_variant', options: variantIds, ...})` |
| `resolveBestVariantDecision`               | `mind-commercial-decision-resolvers.ts` | Delegates to `policy.choose` with action space = variant IDs              |
| `POST /mind/:workspaceId/variant-decision` | `mind-controller.ts`                    | HTTP boundary for worker calls                                            |

### 2.4 Caller evidence

**Before**: `cia-action-dispatch.ts:126` calls `pickVariant(prisma, workspaceId, family, data?.globalStrategy || null)` where `globalStrategy` was computed by `buildGlobalStrategy`.

**After**: `cia-action-dispatch.ts` calls `resolveBestVariantViaHttp({workspaceId, flow, variantIds, strategy})` which POSTs to `/mind/:workspaceId/variant-decision` and falls back to local `pickVariant` on HTTP failure.

---

## 3. Diff summary of pickVariant before/after

### Before (self-improvement.ts:152-179)

```typescript
export async function pickVariant(
  prisma: PrismaClient,
  workspaceId: string,
  family: VariantFamily,
  strategy?: VariantSelectionStrategy | null,
): Promise<MessageVariant> {
  // 1. Ensure bandit arms exist in mindBanditArm table
  // 2. Load all arms for this workspace + decisionType
  // 3. Thompson-sample (UCB1) locally
  // 4. Increment pulls counter
  // 5. Return winning variant text
}
```

### After (new flow via mind-client)

```typescript
// In cia-action-dispatch.ts:
// 1. Build variant IDs from DEFAULT_VARIANTS[family]
// 2. POST /mind/:workspaceId/variant-decision with {flow, variantIds}
// 3. Backend's policy.choose does Thompson sampling on mindBelief
// 4. Returns chosen variant key
// 5. Map key back to text via DEFAULT_VARIANTS
// 6. On HTTP failure: fallback to local pickVariant
```

### Key architectural change

- Decision moves from worker-local `mindBanditArm` table to backend's `mindBelief` + `mindPolicy` pipeline.
- The brain's Thompson sampling (via `policy.choose`) is now the single source of truth for all commercial decisions,
  including flow-variant selection.
- The `globalStrategy` parameter is passed to the backend as context (domain, intent hints) but the backend's brain,
  not the worker's CIA legacy, makes the final variant selection.

---

## 4. Regression test description

### Test: `worker/test/autopilot-core.companion.spec.ts`

**Purpose**: Verify that the variant decision flow works end-to-end through the HTTP boundary.

**Scenarios**:

1. `resolveBestVariantViaHttp` returns the correct variant when backend responds successfully.
2. Falls back to local `pickVariant` when backend is unreachable.
3. Falls back to local `pickVariant` when backend returns non-200.
4. Falls back to default first variant when both paths fail.

**How to run**:

```bash
cd worker && npx vitest run --reporter=verbose test/autopilot-core.companion.spec.ts
```

**CI integration**: This test uses `vi.fn()` mocks for `fetch`. No real network calls. No database dependencies.

---

## 5. Rollback procedure

Single revert commit that restores the previous state:

```bash
git revert <commit-sha-of-feat(mind)-add-resolvebestvariant>
git revert <commit-sha-of-refactor(worker)-autopilot-core-consults-brain>
```

The old `pickVariant` function is preserved (marked deprecated, not removed),
so rollback is instantaneous: just revert the caller in `cia-action-dispatch.ts` to use the old import path.
The `globalStrategy` parameter continues flowing through BullMQ unchanged.

### Files affected by rollback

- `worker/processors/autopilot/cia-action-dispatch.ts` — restore `pickVariant` import and call
- `backend/src/kloel/mind.service.ts` — optional: remove `resolveBestVariant` (no-op if unreferenced)
- `backend/src/kloel/mind-commercial-decision-resolvers.ts` — optional: remove resolver

### Risk if deployed broken

- If the backend endpoint is unreachable, the worker falls back to local `pickVariant` (preserved). No outage.
- If the backend returns wrong variant, the fallback is used. No outage, just potentially suboptimal variant selection.
- No financial risk (variants are message templates only).

---

## 6. References

- `docs/audit/lacunas-identificadas.md` — Lacuna L4 (lines 136-159)
- `CLAUDE.md` — Organism Prompt Part 7
- `backend/src/kloel/mind.service.ts` — unified brain service
- `backend/src/kloel/mind-policy.service.ts` — policy.choose Thompson sampling
- `backend/src/kloel/mind-controller.ts` — HTTP boundary
- `worker/processors/cia/global-learning.ts` — CIA legacy aggregation
- `worker/processors/cia/self-improvement.ts` — CIA legacy variant selection
- `worker/processors/autopilot/cia-action-dispatch.ts` — caller site
- `worker/providers/unified-agent-integrator.ts` — HTTP pattern reference
