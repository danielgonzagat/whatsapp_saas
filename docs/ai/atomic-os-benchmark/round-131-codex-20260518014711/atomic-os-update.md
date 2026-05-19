# Atomic OS Update From Round 131

## Diagnosis

The Round 130 update succeeded mechanically. Atomic obeyed the generated policy
and the scorecard proved it: `processMessage` stayed in the facade with `210`
lines against the dynamic retained-root floor of `208`.

But this revealed a deeper selector problem. The `dominant_public_root_retention`
shape was chosen because it improved largest-module/modularity pressure, while
its retained root made the facade structurally unable to beat Normal on facade
size. The worker did not fail the policy; the policy was the losing decision.

## Update Applied

`atomic-refactor-fastpath.cjs` now treats facade pressure as a first-class
dynamic surface:

- Added `estimatedFacadePressure` to macro-shape ranking.
- Added `estimatedFacadePressure` to single-runtime, dependency-split,
  dominant-root-retention, and support-module candidates.
- Updated operational tradeoff detection so a candidate with surface-economy
  losses and no surface-economy wins is not selected just because it improves a
  different family.
- Updated the selector description so dominant public root retention cannot win
  only by modularity while losing facade/inventory economy.

This remains dynamic: the values are derived from observed target shape,
dependency count, public method count, retained facade pressure, selected product
source units, and policy candidates. No fixed latency budget, method name, path,
or line threshold was added.

## Update Validation

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`:
  pass.
- `node --check docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs`:
  pass.
- Operational hardcode inventory over benchmark tools:
  `operationalHardcodeCount=0`.

## Expected Effect

The next fast-path should stop preferring retained dominant root topology when
that topology would spend too much facade/inventory surface. Atomic should regain
the facade/inventory wins without losing the trace/proof advantages added in the
last rounds.
