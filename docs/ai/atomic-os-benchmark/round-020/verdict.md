# Atomic OS Benchmark - Round 020 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-019. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab020-normal-20260516181523`
- Atomic OS: `/private/tmp/kloel-ab020-atomic-20260516181523`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 20.23s.
- Atomic: 45 files passed, 431 tests passed, test duration 20.29s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 140s | 118s | Atomic by 22s |
| JSONL event rows | 71 | 57 | Atomic by 14 events |
| Completed shell commands | 28 | 19 | Atomic by 9 commands |
| Unique completed shell commands | 25 | 16 | Atomic by 9 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 831,042 | 514,575 | Atomic by 316,467 |
| Cached input tokens | 735,104 | 468,352 | Atomic by 266,752 |
| Output tokens | 5,894 | 4,491 | Atomic by 1,403 |
| Reasoning tokens | 2,717 | 2,026 | Atomic by 691 |
| Tool result chars | 0 | 922 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +250/-119 | 24 files, +251/-119 | Normal by 1 raw line |
| External validation wall time | 41s | 41s | Tie |
| External test duration | 20.23s | 20.29s | Normal by 0.06s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

The post-round-019 update restored the smallest faithful targeted OpenAI env
cleanup for Atomic:

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

Normal used a broader environment reset:

```ts
afterEach(() => {
  process.env = { ...envBackup };
});
```

Atomic therefore preserved the smaller semantic surface, while Normal won raw
line count by 1 line.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 020 is another broad Atomic OS win:

- faster internal completion;
- fewer events and commands;
- lower input/output/reasoning tokens;
- no built-in file-change editor items;
- structured trace proof;
- narrower semantic mutation surface than Normal.

It is still not an all-front overwhelming win:

- Normal had 1 fewer raw changed line.
- Normal external Vitest duration was 0.06s faster.
- Atomic still carries 922 chars of MCP tool payload.

Decision: do not scale task complexity yet. The next loop should continue at
this complexity and focus on proving repeatable margin rather than treating the
0.06s external timing gap as meaningful superiority.
