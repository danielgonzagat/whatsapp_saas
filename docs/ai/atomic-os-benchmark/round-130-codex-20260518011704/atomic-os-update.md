# Atomic OS Update From Round 130

## Diagnosis

Round 130 proved that macro-trace consolidation fixed the previous raw trace
economy failure. Atomic generated `58` child traces, but the macro manifest
covered all of them and reduced the effective trust surface to `4` product batch
units.

The remaining defect is policy adherence. The dynamic fast-path selected
`dominant_public_root_retention` and identified `processMessage` as the dominant
public root that should remain in the facade after internal compaction. The
Atomic worker instead moved the full root into a new module and left a very small
facade delegation. That produced a compact facade, but it increased raw churn
and source-file count, and it ignored the planner's more precise operation.

## Update Required

Add scorecard enforcement for fast-path policy adherence:

- Load an optional fast-path policy JSON.
- When the preferred shape is `dominant_public_root_retention`, read the
  dominant root and retained line estimate from the policy.
- Parse the final target file and locate that public root method.
- Fail the scorecard if the method is missing or smaller than the dynamically
  derived retained-root line floor.
- Include the result in the scorecard output and in `ok`.

This is dynamic. It does not introduce a fixed latency contract or fixed method
name. The policy comes from the planner output generated for the current
worktree, target, class, and code shape.

## Expected Effect

The next Atomic worker should keep the dominant public root in the facade and
extract only the internal section selected by the planner. That should reduce:

- changed source count,
- raw churn,
- extra module creation,
- mismatch between plan and execution.

No complexity scaling until the same tier shows a full material Atomic win.

## Update Applied

- `refactor-scorecard.cjs` now supports `--fastpath-policy <json>` and
  `--enforce-fastpath-policy`.
- `atomic-refactor-fastpath.cjs` now accepts `--policy-path <json>` and embeds
  that policy path in generated scorecard commands.
- The adherence check is dynamic: it reads the current policy JSON, detects
  whether `dominant_public_root_retention` is selected, derives the dominant
  public root and retained-root line floor from that policy, then parses the
  final target AST.

## Update Validation

- `node --check docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs`:
  pass.
- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`:
  pass.
- R130 Atomic replay with policy enforcement: fail as intended,
  `processMessage` retained `34` lines vs dynamic floor `208`.
- R130 Normal replay with policy enforcement: fast-path policy check itself
  passed with `processMessage` at `240` lines, while other scorecard gates still
  kept the overall score red.
- Operational hardcode inventory over benchmark tools:
  `operationalHardcodeCount=0`.
