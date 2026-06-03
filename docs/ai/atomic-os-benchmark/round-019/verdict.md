# Atomic OS Benchmark - Round 019 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-018. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab019-normal-20260516180824`
- Atomic OS: `/private/tmp/kloel-ab019-atomic-20260516180824`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 19.71s.
- Atomic: 45 files passed, 431 tests passed, test duration 19.76s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 146s | 103s | Atomic by 43s |
| JSONL event rows | 57 | 50 | Atomic by 7 events |
| Completed shell commands | 20 | 18 | Atomic by 2 commands |
| Unique completed shell commands | 19 | 15 | Atomic by 4 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 1,098,213 | 563,836 | Atomic by 534,377 |
| Cached input tokens | 1,032,704 | 518,528 | Atomic by 514,176 |
| Output tokens | 5,852 | 4,433 | Atomic by 1,419 |
| Reasoning tokens | 2,822 | 2,013 | Atomic by 809 |
| Tool result chars | 0 | 922 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +246/-119 | 24 files, +255/-119 | Normal by 9 raw lines |
| External validation wall time | 41s | 41s | Tie |
| External test duration | 19.71s | 19.76s | Normal by 0.05s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

The post-round-018 update worked: Atomic now produced the named
`restoreOpenAiEnvs()` helper, matching the readability/topology improvement
that Normal had found in round 018:

```ts
function restoreOpenAiEnvs() {
  clearOpenAiEnvs();
  for (const [key, value] of Object.entries(envBackup)) {
    if (key.startsWith('OPENAI_') || key === 'VOICE_RESPONSE_AUDIO_REQUIRED') {
      process.env[key] = value;
    }
  }
}
```

Normal regressed to the broader process environment reset:

```ts
afterEach(() => {
  process.env = { ...envBackup };
});
```

So Atomic won semantic preservation and explicit intent, but paid 9 extra raw
diff lines for the helper.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 019 is a strong Atomic OS win in every operational model metric:

- faster internal completion;
- fewer events and commands;
- lower input/output/reasoning tokens;
- no built-in file-change editor items;
- structured trace proof;
- better semantic preservation than Normal.

It is still not enough to scale complexity because Atomic did not win every
important measurable front:

- Normal had 9 fewer raw changed lines.
- Normal external Vitest duration was 0.05s faster.
- Atomic still has unavoidable MCP payload where Normal has none.

Decision: do not scale task complexity yet. Update Atomic OS again to treat a
single-use helper as optional, not automatically superior: the next operator
should prefer the smallest faithful targeted restore unless reuse or repeated
intent justifies a named helper.
