# Atomic OS Benchmark - Round 021 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-020. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab021-normal-20260516183003`
- Atomic OS: `/private/tmp/kloel-ab021-atomic-20260516183003`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 23.57s.
- Atomic: 45 files passed, 431 tests passed, test duration 23.18s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 156s | 126s | Atomic by 30s |
| JSONL event rows | 67 | 51 | Atomic by 16 events |
| Completed shell commands | 25 | 19 | Atomic by 6 commands |
| Unique completed shell commands | 21 | 16 | Atomic by 5 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 700,609 | 601,451 | Atomic by 99,158 |
| Cached input tokens | 645,120 | 552,704 | Atomic by 92,416 |
| Output tokens | 6,332 | 4,621 | Atomic by 1,711 |
| Reasoning tokens | 3,343 | 2,579 | Atomic by 764 |
| Tool result chars | 0 | 769 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +255/-119 | 24 files, +251/-119 | Atomic by 4 raw lines |
| External validation wall time | 47s | 46s | Atomic by 1s |
| External test duration | 23.57s | 23.18s | Atomic by 0.39s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic preserved the narrower OpenAI/voice env restoration:

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

Normal's final report says it restored process env after each test and its diff
was larger overall. Atomic also kept trace proof: 24 trace files under
`.atomic/traces`.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 021 is the strongest Atomic OS win so far at this complexity:

- faster internal completion;
- fewer events and commands;
- lower input/output/reasoning tokens;
- fewer raw changed lines;
- faster external validation;
- faster external test duration;
- no built-in file-change editor items;
- structured trace proof;
- narrower semantic mutation surface than Normal.

It still does not satisfy the user's strict "wins literally everything with
huge margin" escalation bar because Normal has no MCP payload at all while
Atomic still emits 769 chars of tool result text.

Decision: do not scale task complexity yet. Update Atomic OS to emit an even
smaller resolved-success receipt for the ESLint analyzer transaction while
keeping trace files as the full evidence surface.
