# Atomic OS Benchmark - Round 017 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-016. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab017-normal-20260516174651`
- Atomic OS: `/private/tmp/kloel-ab017-atomic-20260516174651`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 24.63s.
- Atomic: 45 files passed, 431 tests passed, test duration 24.75s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 168s | 132s | Atomic by 36s |
| JSONL event rows | 70 | 46 | Atomic by 24 events |
| Completed shell commands | 25 | 16 | Atomic by 9 commands |
| Unique completed shell commands | 22 | 13 | Atomic by 9 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 3 | 0 | Atomic |
| Input tokens | 833,039 | 480,830 | Atomic by 352,209 |
| Cached input tokens | 777,856 | 434,176 | Atomic by 343,680 |
| Output tokens | 6,011 | 4,423 | Atomic by 1,588 |
| Reasoning tokens | 3,156 | 2,519 | Atomic by 637 |
| Tool result chars | 0 | 2,800 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +246/-119 | 24 files, +251/-119 | Normal by 5 raw lines |
| External validation wall time | 53s | 54s | Normal by 1s |
| External test duration | 24.63s | 24.75s | Normal by 0.12s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic OS kept the stronger preservation topology:

- one direct atomic analyzer transaction;
- 24 traces;
- no built-in file change items;
- zero unresolved residue after known anchor preservation fixes;
- targeted OpenAI/voice env restoration instead of resetting the entire process
  environment.

Normal CLI reached a valid result, and this time it did preserve the unused
anchors. Its OpenAI env restoration was smaller in raw lines but broader in
semantic surface:

```ts
afterEach(() => {
  process.env = { ...envBackup };
});
```

Atomic's result was larger in raw lines but narrower in behavior:

```ts
afterEach(() => {
  clearOpenAiEnvs();
  Object.entries(envBackup).forEach(([key, value]) => {
    if (key.startsWith('OPENAI_') || key === 'VOICE_RESPONSE_AUDIO_REQUIRED') {
      process.env[key] = value;
    }
  });
});
```

This is a useful distinction for the loop: raw line count alone favored Normal,
but the mutation topology favored Atomic because only the OpenAI/voice env
surface was restored.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 017 is another strong Atomic OS operational win:

- faster internal completion;
- fewer events;
- fewer commands;
- fewer input/output/reasoning tokens;
- no built-in file-change editor items;
- structured trace proof;
- better semantic preservation.

It is still not enough to scale complexity because Atomic did not win every
important measurable front:

- Normal had 5 fewer raw changed lines.
- Normal external validation finished 1s faster.
- Normal external Vitest duration was 0.12s faster.
- Atomic still paid 2,800 chars of MCP tool result payload.

Decision: do not scale task complexity yet. Update Atomic OS to reduce the
remaining tool payload and repeat the same complexity before any escalation.
