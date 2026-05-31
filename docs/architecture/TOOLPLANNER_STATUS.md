# ToolPlanner — Status &amp; Wiring Audit (PI-k2)

**Date:** 2026-05-28
**Classification:** PARTIAL WIRING

## Summary

`ToolPlannerModule` is imported in `KloelModule` and `ToolPlannerService` is
fully implemented, but **zero production code paths call it**. The intended
bridge — `IntentRouter.classify()` → `ToolPlannerService.validateInputs()` /
`buildReceipt()` / `verbalizeReceipt()` — was never wired. The guest-chat path
(`guest-chat.chat.helpers.ts:runDeterministicAction`) calls
`toolDispatcher.executeTool()` directly, bypassing ToolPlanner entirely.

## What Exists

### Module: `backend/src/kloel/toolplanner/toolplanner.module.ts`

```typescript
@Module({
  imports: [CapabilityRegistryV2Module],
  providers: [ToolPlannerService],
  exports: [ToolPlannerService],
})
export class ToolPlannerModule {}
```

Imported by `KloelModule` at line 228. The service is available in the DI
container but never injected.

### Service: `backend/src/kloel/toolplanner/toolplanner.service.ts`

Seven public methods, all fully implemented:

| Method | Purpose |
|---|---|
| `validateInputs(cap, inputs)` | Validates against capability `inputSchema`; returns missing required fields + prompts |
| `coerceInputs(cap, inputs)` | Type coercion: string→number, string→boolean, fuzzy enum matching |
| `buildConfirmationSummary(cap, inputs)` | PT-BR confirmation summary |
| `buildReceipt(cap, ctx, inputs, outputs, startedAt)` | Builds typed `ExecutionReceipt` with evidence URL interpolation, execution rail, audit log ID |
| `buildErrorReceipt(cap, ctx, inputs, error, startedAt)` | Builds failure `ExecutionReceipt` |
| `verbalizeReceipt(receipt)` | PT-BR human-readable receipt |
| `logAuditEntry(receipt)` | Structured audit log via NestJS Logger |

### Test: `backend/src/kloel/toolplanner/full-chain.integration.spec.ts`

Comprehensive integration spec testing the full
`IntentRouter → CapabilityRegistry → ToolPlanner` chain. Covers:

- Input validation (missing fields, PIX confirmation)
- Receipt building (all required fields, payment execution rail, error receipts)
- PT-BR verbalization (standard + PIX canonical proof fields)

**The spec does NOT run in CI** — it is not referenced in any Jest config
(`jest-e2e.json`, `package.json` scripts). It was written as a design-time
proof that the chain works.

## What's Missing: The Dead Path

In `guest-chat.chat.helpers.ts:runDeterministicAction`, when
`IntentRouterService.classify()` returns a non-chat intent, the flow is:

```
1. intentRouter.classify(message) → IntentClassification
2. Check missingInputs / requiresConfirmation
3. toolDispatcher.executeTool(workspaceId, tool, args)  ← skips ToolPlanner
4. writeOperationReceipt(buildReceipt(...))              ← uses OperationReceipt, not ExecutionReceipt
```

The ToolPlanner was designed to sit between steps 1 and 3:

```
1. intentRouter.classify(message) → IntentClassification
2. planner.validateInputs(cap, entities)          ← ToolPlanner
3. planner.buildConfirmationSummary(cap, entities) ← ToolPlanner
4. toolDispatcher.executeTool(workspaceId, tool, args)
5. planner.buildReceipt(cap, ctx, inputs, outputs) ← ToolPlanner
6. planner.verbalizeReceipt(receipt)              ← ToolPlanner
```

## Why It's Not a Mechanical Wiring

Two factors prevent a simple import-and-inject fix:

### 1. Parallel Receipt Systems

| | `ToolPlannerService` | `operation-receipt.helpers.ts` |
|---|---|---|
| Receipt type | `ExecutionReceipt` (capability-registry-v2 types) | `OperationReceipt` (ad-hoc interface) |
| Fields | `capabilityId`, `executionRail`, `evidenceUrl`, `domainEvents`, `idempotencyKey` | `toolName`, `entityType`, `nextActions` |
| Persistence | Logger only (`logAuditEntry`) | Filesystem (`WORLD_LEDGER.jsonl`) |
| Used by | Nobody | `guest-chat.chat.helpers.ts`, `worker/` |

These are two different contracts serving two different consumers.
Reconciling them requires deciding whether `WorldLedger` (filesystem) entries
should carry `ExecutionReceipt` fields, or whether `ToolPlannerService`
should emit to `WorldLedger`.

### 2. Operational Helpers Overlap

The `guest-chat.operational.helpers.ts` module already handles:

- Missing-input detection and prompts (`buildMissingInputsReply`)
- Pending action confirmation flow (`buildPendingActionConfirmation`)
- Input extraction (`extractOperationalInputs`)

`ToolPlannerService.validateInputs()` and `buildConfirmationSummary()`
duplicate these concerns with a different API surface
(capability-schema-driven vs. tool-name-driven).

## Proposed Wiring Plan

### Option A: Full Bridge (recommended for capability-driven execution)

1. Inject `ToolPlannerService` into the guest-chat path (requires making it
   available to `runDeterministicAction` — currently a standalone function,
   not a service method).
2. Replace the ad-hoc `missingInputs` check with
   `planner.validateInputs(cap, entities)`.
3. Replace `buildPendingActionConfirmation` with
   `planner.buildConfirmationSummary(cap, inputs)`.
4. Replace `operation-receipt.helpers:buildReceipt` with
   `planner.buildReceipt(cap, ctx, inputs, outputs, startedAt)`.
5. Add `planner.verbalizeReceipt(receipt)` after execution for PT-BR
   user-facing messages.
6. Unify `OperationReceipt` and `ExecutionReceipt` — eliminate one.

**Effort**: ~2-3 days. Touches `guest-chat.chat.helpers.ts`,
`guest-chat.operational.helpers.ts`, `operation-receipt.helpers.ts`, plus
worker consumers of `WorldLedger`.

### Option B: Drop ToolPlanner (if capability-driven execution is deferred)

1. Remove `ToolPlannerModule` from `KloelModule.imports`.
2. Move `full-chain.integration.spec.ts` to `docs/architecture/` as a design
   artifact.
3. Delete `backend/src/kloel/toolplanner/`.

**Effort**: 30 minutes. No production impact.

### Option C: Minimalist Bridge (keep both, connect only what's needed)

1. Inject `ToolPlannerService` into the guest-chat path.
2. Call only `planner.buildReceipt()` and `planner.verbalizeReceipt()` after
   `toolDispatcher.executeTool()`.
3. Keep `operation-receipt.helpers.ts` for the raw `WorldLedger` entry; emit
   the `ExecutionReceipt` as a parallel artifact.
4. Do NOT change validation/confirmation flow.

**Effort**: ~4 hours. Only adds, removes nothing.

## Recommendation

**Go with Option A** when the capability-driven execution path (IntentRouter →
CapabilityRegistry → ToolPlanner → ToolDispatcher) is prioritized. Until then,
the module is harmless — it's a DI no-op (0 runtime cost) with an unexecuted
test.

If `WorldLedger` persistence is not needed for the capability path, Option C
is a low-risk incremental step.

## References

- `backend/src/kloel/toolplanner/toolplanner.service.ts` — the service
- `backend/src/kloel/toolplanner/toolplanner.module.ts` — DI module
- `backend/src/kloel/toolplanner/full-chain.integration.spec.ts` — design-time
  integration spec
- `backend/src/kloel/intent-router/intent-router.service.ts` — "the
  ToolPlanner takes over" (comment only)
- `backend/src/kloel/guest-chat.chat.helpers.ts:runDeterministicAction` — the
  active path that bypasses ToolPlanner
- `backend/src/kloel/operation-receipt.helpers.ts` — parallel receipt system
  in active use
- `docs/architecture/CAPABILITY_MAP.md` — broader capability architecture
