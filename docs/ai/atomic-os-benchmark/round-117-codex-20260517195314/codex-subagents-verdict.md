# Round 117 Codex A/B Verdict

## Setup

- Normal worker: Ohm (`019e3826-50f5-7e43-9d23-cf5e83d3572c`)
- Atomic worker: Averroes (`019e3826-5355-7de0-b2ff-3b96d6991ac1`)
- Normal worktree: `/private/tmp/kloel-ab117-normal-20260517195314`
- Atomic worktree: `/private/tmp/kloel-ab117-atomic-20260517195314`
- Target: `backend/src/kloel/unified-agent.service.ts`
- Class: `UnifiedAgentService`
- Complexity tier: scaled orchestrator service split

## Executive Result

Atomic wins R117 only as a mixed result, not as dominance.

The R116 type-spillover fix worked: Atomic no longer touched
`unified-agent.types.ts`, and trace economy stayed clean. But Normal won the
facade/source-count/inventory/net-delta economy by choosing a single runtime
module and by moving `processIncomingMessage` out of the facade.

Atomic still won important structural and proof surfaces:

- first durable write;
- largest helper/module;
- product churn;
- Jest runtime;
- typecheck-impact runtime;
- traceability.

Do not scale complexity.

## Gates

- Expanded Jest: both lanes passed 5 suites / 132 tests.
- Typecheck impact: both lanes passed with 0 in-scope diagnostics.
- Global typecheck still reports the same 11 out-of-scope Google Ads
  diagnostics in both lanes.
- Spec diff: none in both lanes.
- Protected diff: none in both lanes.
- Public API: both lanes passed, 4/4 public methods and constructor surface
  preserved.
- Facade type surface: both lanes passed, 0 local type/interface declarations.
- Sibling reuse: both lanes passed the dynamic sibling-reuse audit.
- `git diff --check`: both lanes passed.

## Scorecard Comparison

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| First observable durable write | 20:02:31 -0300 | 20:01:38 -0300 | Atomic by 53s |
| Expanded focused Jest | 132/132, 14.420s | 132/132, 14.248s | Atomic by 0.172s |
| Typecheck in-scope diagnostics | 0 | 0 | tie |
| Typecheck-impact runtime | 7770ms | 7739ms | Atomic by 31ms |
| Public API structural audit | pass | pass | tie |
| Sibling reuse audit | pass | pass | tie |
| Facade type surface | pass, 0 decls | pass, 0 decls | tie |
| Changed source count | 2 | 3 | Normal by 1 |
| Target facade lines | 172 | 199 | Normal by 27 |
| Changed inventory lines | 859 | 882 | Normal by 23 |
| Largest helper/module | 687 | 433 | Atomic by 254 |
| Product churn | 1354 | 1309 | Atomic by 45 |
| Net source delta | +122 | +145 | Normal by 23 |
| Trace count | 0 | 3 | Atomic |
| Trace economy | n/a | pass, 3 traces for 3 product units | Atomic |

## What Normal Won

- Facade LOC.
- Changed source count.
- Changed inventory.
- Net source delta.

Normal created one broad sibling module:

- `unified-agent-runtime.service.ts`: 687 lines.

This was worse on largest-module pressure, but better on source-count and
inventory economy.

## What Atomic Won

- First durable write.
- Largest helper/module by a large margin.
- Product churn.
- Focused Jest runtime.
- Typecheck-impact runtime.
- Traceability and trace economy.
- It matched Normal on behavior tests, public API, protected diff, spec diff,
  facade type-surface release, and sibling reuse.

Atomic created two sibling modules:

- `unified-agent-process.ts`: 433 lines.
- `unified-agent-execute.ts`: 250 lines.

## Diagnosis

The R116 anti-spillover update fixed the previous loss, but the owner-map still
kept a public leaf wrapper in the facade:

- `processIncomingMessage` stayed in the facade in Atomic.
- The method delegates through `processMessage`.
- `processMessage` already had an owner module:
  `unified-agent-process.ts`.

That means the public leaf could be absorbed into the already-created process
owner with no new product source file. Normal did this by exporting
`processUnifiedAgentIncomingMessage` from its runtime module.

The Atomic update must therefore make public leaf retention dynamic:

- retain a public leaf only when no already-created owner can absorb it;
- if the leaf delegates through a method owned by a selected module, release
  the leaf into that same module;
- update the compact write targets so the worker sees the released leaf before
  first write.

This is not a fixed method-name rule. It is derived from the AST call graph and
the selected owner map.

## Atomic OS Update Applied

Updated `docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`.

Changes:

- retained public leaf symbols now carry their `calls` list;
- the executable owner-map derives `retainedReleaseBySymbol`;
- retained public leaves are released into an already-created owner module when
  their body delegates through that owner;
- `processIncomingMessage` now maps dynamically to
  `backend/src/kloel/unified-agent-process.ts` because it delegates through
  `processMessage`;
- compact execution brief `writeTargets` now include released leaf symbols, so
  the first batch sees the real module content before writing;
- the post-split compaction plan now explicitly names retained public leaf
  wrapper release as a dynamic compaction action.

## Validation Of Update

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`
  passed.
- Fastpath replay now maps:
  - `processIncomingMessage` -> `unified-agent-process.ts`
  - `processMessage` -> `unified-agent-process.ts`
  - `executeTool` -> `unified-agent-execute.ts`
  - `buildQuotedReplyPlan` -> facade retained
- Compact execution brief write targets now include `processIncomingMessage`
  inside `unified-agent-process.ts`.
- Operational hardcode inventory passed:
  `operationalHardcodeCount=0`.
- `git diff --check` passed.

## Next Loop Rule

Do not scale complexity. Repeat the same `UnifiedAgentService` tier in R118.

Atomic must preserve the largest-module and trace wins while recovering facade
LOC, changed inventory, changed source count, and net-delta economy.
