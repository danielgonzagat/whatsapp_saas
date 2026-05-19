# Round 106 Codex A/B Verdict

## Setup

- Normal worker: Goodall (`019e3791-3005-7940-98c8-53865600f103`)
- Atomic worker: Cicero (`019e3791-327a-7020-903c-18d5ae54fd23`)
- Normal worktree: `/private/tmp/kloel-ab106-normal-20260517171039`
- Atomic worktree: `/private/tmp/kloel-ab106-atomic-20260517171039`
- Target: `backend/src/kloel/kloel-chat-tools.service.ts`
- Class: `KloelChatToolsService`

## Executive Result

Normal wins R106 overall.

The Atomic namespace-import experiment reduced runtime import binding count in
the abstract plan, but produced a worse facade in real code because the facade
retained/recreated local type declarations. That violates the principle:
the public facade should not carry a larger type surface than the refactor
intention requires.

Do not scale complexity.

## Gates

- Expanded focused Jest: both lanes passed 4 suites / 33 tests.
- Typecheck impact: both lanes passed with 0 in-scope diagnostics.
- Global typecheck still reports 11 out-of-scope Google Ads diagnostics in both
  lanes.
- Spec diff: none in both lanes.
- Protected diff: none in both lanes.
- Public API: both lanes passed, 24/24 methods and constructor surface
  preserved.

## Scorecard Comparison

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| First observable write | 17:17:50 -0300 | 17:18:49 -0300 | Normal by 59s |
| Expanded focused Jest | 33/33 | 33/33 | tie |
| Typecheck in-scope diagnostics | 0 | 0 | tie |
| Public API structural audit | pass | pass | tie |
| Target facade lines | 218 | 310 | Normal by 92 |
| Changed inventory lines | 705 | 778 | Normal by 73 |
| Largest helper/module | 487 | 468 | Atomic by 19 |
| Product churn | 1391 | 1280 | Atomic by 111 |
| Net source delta | -269 | -196 | Normal by 73 |
| Trace count | 0 | 2 | Atomic |
| Trace economy | n/a | pass, 2 traces for 2 units | Atomic |

## What Normal Won

- First observable write.
- Facade LOC.
- Total changed inventory.
- Net source reduction.
- It matched Atomic on public API and behavior without trace proof.

## What Atomic Won

- Largest helper/module.
- Product churn.
- Traceability.
- Trace economy.

## Diagnosis

The post-R104 update was too narrow: it optimized import binding count but did
not account for type-surface pressure. Cicero used `namespace_owner_imports` but
kept 20 local interface declarations in the facade:

- `ToolResult`
- `ToolSaveProductArgs`
- `ToolDeleteProductArgs`
- `ToolToggleAutopilotArgs`
- `ToolSetBrandVoiceArgs`
- `ToolSetSalesPolicyArgs`
- `ToolRememberUserInfoArgs`
- `ToolCreateFlowArgs`
- `ToolDashboardSummaryArgs`
- `ToolCreateAgentJobArgs`
- `ToolSetAgentJobEnabledArgs`
- `ToolSearchAgentMemoryArgs`
- `ToolSearchAgentSessionsArgs`
- `ToolGetAgentArtifactArgs`
- `ToolUpsertAgentSkillArgs`
- `ToolRecordAgentSkillOutcomeArgs`
- `ToolRecordAgentDelegationArgs`
- `ToolRecordAgentEvidenceArgs`
- `ToolSearchAgentEvidenceArgs`
- `ToolListAgentEvidenceArgs`

This is facade type-surface debt. It explains why Atomic's facade grew to 310
lines despite fewer runtime import bindings.

## Atomic OS Update Applied After Round

- `refactor-scorecard.cjs` now supports
  `--enforce-facade-type-surface-release`.
- The new gate derives debt from the actual post-refactor state: if extraction
  created sibling source modules and the target facade still contains local
  interface/type declarations, the facade type surface did not release.
- `atomic-refactor-fastpath.cjs` now includes
  `--enforce-facade-type-surface-release` in the generated scorecard command.
- The import-pressure rule now says namespace imports are only valid when
  public signature types are imported or namespace-qualified from owner modules;
  local facade type declarations must not be kept or recreated.

Validation after update:

- `node --check` passed for `refactor-scorecard.cjs`.
- `node --check` passed for `atomic-refactor-fastpath.cjs`.
- New scorecard passes R106 Normal: `declarationCount=0`.
- New scorecard fails R106 Atomic: `declarationCount=20`.
- Fastpath replay includes `--enforce-facade-type-surface-release`.
- Atomic hardcode inventory remains clean:
  `operationalHardcodeCount=0`.
- `git diff --check` passed for updated tool and round surfaces.

## Next Loop Rule

Do not scale complexity. Repeat the same macro-refactor class with the new
facade type-surface gate. Atomic must beat Normal without retaining local DTO
types in the facade.
