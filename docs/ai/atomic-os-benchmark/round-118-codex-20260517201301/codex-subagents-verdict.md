# Round 118 Codex A/B Verdict

## Setup

- Normal worker: Pasteur (`019e3838-5740-79e3-918d-ea50d0effa85`)
- Atomic worker: Banach (`019e3838-596e-7012-b46b-efb0f84d2087`)
- Normal worktree: `/private/tmp/kloel-ab118-normal-20260517201301`
- Atomic worktree: `/private/tmp/kloel-ab118-atomic-20260517201301`
- Target: `backend/src/kloel/unified-agent.service.ts`
- Class: `UnifiedAgentService`
- Complexity tier: scaled orchestrator service split

## Executive Result

Atomic achieved a near-sweep in R118, but not total dominance.

Atomic won:

- first durable write;
- focused Jest runtime;
- typecheck-impact runtime;
- changed source count;
- changed inventory;
- largest helper/module;
- product churn;
- net source delta;
- traceability and trace economy.

Normal still won:

- target facade LOC.

Do not scale complexity yet. The remaining Atomic loss is specific and
actionable: repeated dependency-object literals in the facade.

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
- Main workspace target contamination: no remaining `unified-agent*` diff after
  worker self-repair.

## Scorecard Comparison

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| First observable durable write | 20:21:39 -0300 | 20:18:54 -0300 | Atomic by 165s |
| Expanded focused Jest | 132/132, 14.742s | 132/132, 14.053s | Atomic by 0.689s |
| Typecheck in-scope diagnostics | 0 | 0 | tie |
| Typecheck-impact runtime | 7488ms | 7300ms | Atomic by 188ms |
| Public API structural audit | pass | pass | tie |
| Sibling reuse audit | pass | pass | tie |
| Facade type surface | pass, 0 decls | pass, 0 decls | tie |
| Changed source count | 4 | 3 | Atomic by 1 |
| Target facade lines | 161 | 178 | Normal by 17 |
| Changed inventory lines | 919 | 895 | Atomic by 24 |
| Largest helper/module | 488 | 468 | Atomic by 20 |
| Product churn | 1406 | 1386 | Atomic by 20 |
| Net source delta | +182 | +158 | Atomic by 24 |
| Trace count | 0 | 3 | Atomic |
| Trace economy | n/a | pass, 3 traces for 3 product units | Atomic |

## What Normal Won

Normal won only target facade LOC.

Normal's facade was shorter because it created cached owner instances:

- `UnifiedAgentMessageProcessor`
- `UnifiedAgentToolRouter`

That avoided repeating the same dependency object literal in multiple public
facade methods.

## What Atomic Won

Atomic won all other measured material surfaces:

- faster first write;
- fewer changed source files;
- lower final changed inventory;
- smaller largest module;
- lower churn;
- lower net source delta;
- faster focused Jest;
- faster typecheck-impact audit;
- proof traces with trace economy pass.

The R117 update worked: `processIncomingMessage` moved into the process owner,
and no type-only spillover file was created.

## Diagnosis

Atomic still repeated owner dependency objects in the facade:

- `processIncomingMessage` and `processMessage` both delegate to
  `unified-agent-process.ts`;
- both public methods rebuild a similar dependency object inline;
- the owner-map already knows they share the same owner.

The correct dynamic behavior is:

- detect repeated `ownerFile` in public method delegations;
- compile an owner-local dependency bundle or cached delegate plan;
- preserve constructor shape and public signatures;
- reduce facade LOC only if it does not add source-count, type-spillover, spec
  diff, protected diff, or public API change.

This is not a fixed service/class rule. It is derived from the owner-map.

## Atomic OS Update Applied

Updated `docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`.

Changes:

- added `facadeDependencyBundleReusePlan`;
- derives reusable owners from repeated `ownerFile` method delegations;
- exposes `dependencyBundleReusePlan` in the compiled facade rewrite plan;
- exposes the same plan in `dynamicDominanceObjective`;
- updates the compactness guard to collapse repeated owner dependency objects
  into one owner-local bundle/delegate when available;
- adds a post-split compaction action for repeated-owner dependency reuse.

For the current tier, replay now derives:

- reusable owner: `backend/src/kloel/unified-agent-process.ts`;
- methods: `processIncomingMessage`, `processMessage`;
- action: build one owner-local dependency bundle or cached delegate instead of
  repeating the same object literal per method.

## Validation Of Update

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`
  passed.
- Fastpath replay emits `dependencyBundleReusePlan.available=true`.
- Fastpath replay identifies `unified-agent-process.ts` as a repeated-owner
  facade compaction candidate.
- Operational hardcode inventory passed:
  `operationalHardcodeCount=0`.
- `git diff --check` passed.

## Next Loop Rule

Do not scale complexity. Repeat the same `UnifiedAgentService` tier in R119.

Atomic must keep the broad R118 wins while eliminating the remaining facade LOC
loss.
