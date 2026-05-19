# Atomic OS Update After Round 128

## Defeat Converted

Round 128 showed that the Atomic policy selected the correct macro shape for inventory and churn, but retained too much body inside the dominant public root. Normal won facade size by making `processMessage` more compact.

The update adds dynamic retained-root internal compaction to `docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`.

## Dynamic Policy

When `dominant_public_root_retention` is selected, the fast-path now:

- preserves source offsets in symbol inventory;
- reads the retained public root text;
- derives internal sections from observed comment-section topology;
- computes the dynamic average section surface;
- selects sections above that observed average;
- adds those sections to the already selected helper/runtime owner;
- ranks the macro shape using `retainedRootLinesAfterInternalCompaction`.

No fixed section names, method names, file names, line ceilings, latency contracts, or static budgets were added.

## Replay Evidence

Replay file:

`atomic-fastpath-main-after-internal-root-compaction-update.json`

Observed result:

- preferred shape: `dominant_public_root_retention`;
- dominant root: `processMessage`;
- retained root before internal compaction: `321` lines;
- retained root after internal compaction: `208` lines;
- selected internal section: `3. Build messages array`;
- selected internal section surface: `113` lines;
- helper owner grew dynamically from `59` to `172` observed lines;
- operational hardcode inventory after update: `0`.

## Next Round Requirement

Round 129 must repeat the same complexity tier. Atomic should use the internal compaction plan during execution and must be judged against the same gates plus the previous losses:

- facade lines;
- first observable write;
- typecheck impact runtime;
- inventory;
- churn;
- trace economy;
- public API preservation;
- type-surface release.

