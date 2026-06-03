# Round 010 Verdict - Worker lint cleanup

## Scope

- Task: remove real `worker/**` lint debt from a dirty repo snapshot.
- Normal lane: `/private/tmp/kloel-ab10-normal-20260516162150`
- Atomic lane: `/private/tmp/kloel-ab10-atomic-20260516162150`
- Both lanes started from the same base commit in isolated git worktrees.

## Effective Result

Both lanes completed the requested task and passed the same external verification:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test` (`45` files, `431` tests)
- `npm --prefix worker run build`

Both lanes avoided committing, pushing, reset, checkout, clean, restore, and protected-file edits. `AGENTS.md` was already dirty in both worktrees and was not changed by either lane.

## Raw Metrics

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Agent wall time | 123s | 214s | Normal |
| Event log lines | 63 | 73 | Normal |
| Command items | 44 | 32 | Atomic |
| Failed commands | 2 | 2 | Tie |
| MCP tool calls | 0 | 24 | Normal on overhead |
| Event errors | 1 | 1 | Tie |
| Input tokens | 1,132,409 | 2,075,823 | Normal |
| Cached input tokens | 1,065,600 | 1,949,952 | Normal |
| Output tokens | 4,821 | 7,669 | Normal |
| Reasoning tokens | 1,883 | 3,864 | Normal |
| Worker files changed | 24 | 24 | Tie |
| Insertions | 235 | 247 | Normal |
| Deletions | 134 | 119 | Atomic |
| Total changed lines | 369 | 366 | Atomic |
| Diff hash | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | `9e82e5837241bb36b291d93e9a9c98974b8c28f6320c0a838881faac6e9e3643` | n/a |

## Quality Delta

Atomic produced the better behavior-preserving cleanup in the three residual lint cases:

- `worker/test/channel-dispatcher.spec.ts`: preserved `mailEnvBackup` and used it in `afterEach`, restoring test env isolation.
- `worker/test/openai-models.spec.ts`: preserved `envBackup` and used it in `afterEach`, restoring OpenAI env isolation.
- `worker/test/opportunity-heuristic.spec.ts`: preserved `emptyDemographics` and added an assertion for the empty demographics contract.

Normal removed the same unused constants instead. That is faster and lint-correct, but weaker under the Atomic Product-Oriented Action Principle because it removes available behavior-preservation anchors instead of using them.

## Atomic Wins

- Fewer command items: `32` vs `44` (`27.3%` fewer).
- Fewer deletions: `119` vs `134` (`11.2%` fewer).
- Slightly smaller total line churn: `366` vs `369` (`0.8%` smaller).
- Stronger preservation topology for residual lint cleanup: preserve existing backup fixtures and turn them into explicit test isolation/proof.
- MCP traces were produced for atomic writes, unlike the normal lane.

## Normal Wins

- Faster completion: `123s` vs `214s` (`42.5%` faster than Atomic; Atomic took `74.0%` longer).
- Lower event surface: `63` vs `73` lines (`13.7%` lower).
- Lower input tokens: `1,132,409` vs `2,075,823` (`45.4%` lower; Atomic used `83.3%` more).
- Lower output tokens: `4,821` vs `7,669` (`37.1%` lower; Atomic used `59.1%` more).
- Lower reasoning tokens: `1,883` vs `3,864` (`51.3%` lower; Atomic used `105.2%` more).
- Fewer insertions: `235` vs `247` (`4.9%` fewer).
- No MCP overhead.

## New Atomic OS Defects Found

1. Trace locality defect: Atomic write traces were created under the main repo `.atomic/traces`, not under the atomic worker worktree. This weakens isolated continuation and benchmark attribution.
2. Residual lint guidance was useful but not decisive enough. The agent still spent too much navigation/token budget after the analyzer identified leftover unused variables.
3. The analyzer reduced event size after the previous fix, but the atomic lane still consumed much more input/output/reasoning than normal.

## Formal Conclusion

Atomic won quality of the residual behavior-preserving cleanup, deletion discipline, total changed line count, and command count. Normal still won the main operational benchmarks: speed, input tokens, output tokens, reasoning tokens, event surface, and insertion count.

This is not a huge Atomic victory. Complexity must not scale.

## Required Atomic OS Update Before Round 011

- Fix trace locality so traces are written relative to the target repo/worktree, not the MCP server launcher repo.
- Add focused residue action guidance for unused lint leftovers so the analyzer returns direct behavior-preserving candidate actions with file, symbol, and intended topology.
- Keep `code_outline` body-free and avoid reintroducing full-file payloads.
