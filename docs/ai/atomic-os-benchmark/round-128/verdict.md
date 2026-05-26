# Round 128 Verdict

## Status

- Verdict: NORMAL wins functional contract; ATOMIC rejected.
- Complexity tier: seven-helper split of `backend/src/kloel/unified-agent.service.ts`.
- Evidence level: N4 local A/B, with isolated worktrees, OpenCode event logs, external validation logs, and `round-audit.cjs` re-run after parser repair.

## Functional Gates

- NORMAL: accepted as functional baseline despite lane `max_timeout`. External validation passed focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`, protected diff empty, suppression scan empty, helper `this.` scan empty, runtime `ToolArgs` scan empty, and service residue scan empty.
- ATOMIC: rejected. Preprompt exit `1`; focused Jest failed `2/13`, focused ESLint failed with Prettier errors, backend typecheck failed with two `toolRouterDeps` property errors, and service residue scan found `toolRouterDeps` in the facade.

## Benchmark Wins

- NORMAL wins: functional contract, final service residue discipline, complete external validation.
- ATOMIC wins: lane completion, mode discipline, events `3` vs `213`, first action `2.900s` vs `18.289s`, agent time `203.469s` vs `1,501.568s`, commands `1` vs `15`, failed commands `1` vs `5`, input/output/reasoning tokens `62,829/197/292` vs `89,772/20,179/19,138`, traceability `62` vs `0`, total Kloel lines `944` vs `994`, source churn `1,047` vs `1,469`.
- ATOMIC did not win the round because functional acceptance outranks operational speed and traceability.

## Root Cause

- The Round 128 fast-path introduced two identical `toolRouterDeps: this.toolRouterDeps` handoffs, then attempted to replace both with a single `atomic_replace_text` call carrying `expectedCount: 2`.
- The MCP `atomic_replace_text` requires a unique match or explicit `occurrence`; `expectedCount` was wrapper-local policy and was not expanded before the MCP call.
- `set -e` stopped the fast-path at that ambiguous replacement, leaving the service in partial state before dependency inlining, property removal, assignment removal, import removal, layout fix, and final validation.

## Tooling Delta

- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` now expands `atomic_replace_text` with `expectedCount > 1` into sequential occurrence-1 atomic replacements after verifying the exact observed occurrence count.
- `docs/ai/atomic-os-benchmark/tools/round-audit.cjs` now parses bracket-style external logs such as `[jest exit=0]`, `[eslint exit=0]`, `[diff-check exit=0]`, and bracketed section headings, so scorecards reflect the external validation evidence.

## Evidence

- `docs/ai/atomic-os-benchmark/round-128/audit.json`
- `docs/ai/atomic-os-benchmark/round-128/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-128/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-128/opencode-watchdog-status.json`
- `docs/ai/atomic-os-benchmark/round-128/opencode-atomic-preprompt-output.log`

## Decision

- Do not scale complexity.
- Round 129 repeats the same seven-helper tier after fixing `expectedCount` handling and audit parsing.
