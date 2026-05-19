# Atomic OS Update Need From Round 124

## What Improved

The retained-public-leaf economy gate from Round 123 worked.

Atomic kept:

- `processIncomingMessage`
- `buildQuotedReplyPlan`

inside the facade unless release was a measured economy win. That produced the best structural result:

- lower facade size;
- lower inventory;
- lower largest changed module;
- lower churn;
- lower net source delta;
- trace proof retained.

## Remaining Loss

Atomic still took longer to produce a durable first write.

Normal first durable write:

```txt
2026-05-18T01:28:56Z
```

Atomic first durable write:

```txt
2026-05-18T01:33:29Z
```

The issue is not correctness. It is that the compiled policy tells the worker what shape to choose, but the first observable write order is still too implicit. The worker can spend extra time arranging or validating mentally before writing.

## Required Direction

Update Atomic OS without fixed latency contracts:

- derive the first observable write unit from measured write targets;
- expose the first write target explicitly in the compiled brief;
- rank by measured target dominance release and dependency readiness;
- make the largest ready product batch the default first observable write;
- keep this dynamic, with no fixed seconds/tool-call budgets.

The goal is not to write faster by skipping proof. The goal is to remove ambiguity before the first write by compiling the first write unit from the current topology.

## Change Applied

`atomic-refactor-fastpath.cjs` now emits `firstObservableWritePlan`.

The plan is derived from:

- selected write targets;
- observed line surface;
- symbol count;
- product batch readiness.

For the current topology, it selects:

```txt
backend/src/kloel/unified-agent-process.ts
```

as the first durable write target because it has the largest measured release surface among ready product batch units.

## Validation

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`: pass.
- Operational hardcode inventory: `operationalHardcodeCount=0`.
- Fast-path replay confirms first batch order:

```txt
write_first_observable_selected_module -> unified-agent-process.ts
write_selected_module -> unified-agent-execute.ts
replace_facade -> unified-agent.service.ts
```
