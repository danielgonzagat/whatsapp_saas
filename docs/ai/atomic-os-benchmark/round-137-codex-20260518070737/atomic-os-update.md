# Atomic OS Update From Round 137

## Loss Diagnosed

Atomic continued to beat Normal on facade size, inventory, largest-module pressure, and product churn, but still lost first durable write by about 263.434 s.

The prior `executionStartCapsule` was correct but too buried in the full policy. It told the worker where to start, but it did not reduce the worker's initial reading and policy summarization burden enough.

## Update Applied

`docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs` now emits:

- `atomicWorkerBrief.minimalDispatchBrief`

This brief is compiled dynamically from:

- executable first-batch recipe;
- execution start capsule;
- dependency bundle access mode;
- facade rewrite guard;
- validation commands.

It is not a fixed prompt or latency contract. It has no hardcoded file list, time budget, command count, or reusable architecture template.

## Intended Effect

The next Atomic worker should use the minimal brief as the primary execution surface:

1. make the first durable mutation from `firstDurableMutation.file`;
2. continue `firstBatchOrder`;
3. run the compiled validations;
4. consult the full policy only if the first mutation is refused, public API preservation is ambiguous, or validation fails.

This targets first-write overhead and policy-reading overhead without weakening Atomic OS safety invariants.

## Verification

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`: pass.
- Operational hardcode inventory: pass, `operationalHardcodeCount=0`.
- Recompiled policy exposes `atomicWorkerBrief.minimalDispatchBrief`.
