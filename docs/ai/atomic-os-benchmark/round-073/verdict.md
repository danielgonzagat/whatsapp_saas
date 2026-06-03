# Round 073 Verdict

Status: `clean_atomic_win_with_remaining_losses`

Task: extract `UnifiedAgentService.actionSucceeded` and
`UnifiedAgentService.num` into
`backend/src/kloel/unified-agent-action.helpers.ts`.

Product parity:

- Normal and Atomic both produced the same focused behavior shape:
  `unified-agent.service.ts` reduced to 725 lines and
  `unified-agent-action.helpers.ts` created with 12 lines.
- Both touched exactly the same two Kloel files.
- Both had source churn 32: 16 insertions and 16 deletions.
- Both passed focused Jest: 13/13 tests.
- Both passed diff-check, protected-file check, trace isolation check, and
  suppression scan.
- Both hit the same unrelated global typecheck debt in Google Ads integration
  files, with no `src/kloel/**` type errors.

Atomic wins:

- Benchmark isolation: pass.
- Atomic mode cleanliness: pass.
- Worktree escape count: 0.
- Event rows: Atomic 6 vs Normal 37.
- Shell commands: Atomic 1 vs Normal 6.
- Failed commands: Atomic 0 vs Normal 1.
- Output tokens: Atomic 521 vs Normal 1,905.
- Reasoning tokens: Atomic 254 vs Normal 704.
- Trace/proof: Atomic 10 traces vs Normal 0.
- Total agent time from first step to final message: Atomic 69.2s vs Normal
  177.8s.

Normal wins:

- Input tokens: Normal 51,700 vs Atomic 62,882.
- Time to first tool action: Normal 8.4s vs Atomic 52.9s.

Diagnosis:

Atomic used the correct macro atom and won the overall useful surface, but still
fed too much command output back into the model. The macro operator prints full
operation payloads even when the worker only needs a compact result. That inflates
input tokens in the final response turn. First-action latency remains a separate
prompt/model-startup overhead to measure in the next round.

Decision:

Do not scale complexity yet. Round 073 is a clean win, but not a large-margin
win in every important metric. The next delta is to reduce Atomic macro output
surface with a compact report mode, then repeat the same benchmark.

Next action:

- Add compact macro reporting to `atomic-call.cjs`.
- Add first-action timing to `round-audit.cjs`.
- Repeat this exact task in Round 074 using the compact report mode.
