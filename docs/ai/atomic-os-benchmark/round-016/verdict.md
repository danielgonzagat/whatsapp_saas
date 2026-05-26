# Atomic OS Benchmark - Round 016 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014 and 015. Both workers fixed the real `worker`
ESLint debt from the same base worktree state and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab016-normal-20260516173600`
- Atomic OS: `/private/tmp/kloel-ab016-atomic-20260516173600`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 25.99s.
- Atomic: 45 files passed, 431 tests passed, test duration 26.42s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 206s | 160s | Atomic by 46s |
| JSONL event rows | 83 | 49 | Atomic by 34 events |
| Unique shell commands | 33 | 17 | Atomic by 16 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 2 | 0 | Atomic |
| Input tokens | 755,769 | 563,507 | Atomic by 192,262 |
| Cached input tokens | 662,784 | 512,384 | Atomic by 150,400 |
| Output tokens | 7,400 | 4,872 | Atomic by 2,528 |
| Reasoning tokens | 3,594 | 2,758 | Atomic by 836 |
| Tool result chars | 0 | 5,493 | Normal by absence of tool payload |
| Worker diff shortstat | 24 files, +253/-119 | 24 files, +251/-119 | Atomic by 2 raw lines |
| External test duration | 25.99s | 26.42s | Normal by 0.43s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic OS won the preservation/topology result:

- It applied one direct atomic analyzer transaction without a preview roundtrip.
- It wrote 24 traces.
- It restored only OpenAI/voice env keys from `envBackup`.
- It avoided broad `process.env` reset.

Normal CLI still reached a valid result, but its OpenAI env restoration was
broader:

```ts
function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, envBackup);
}
```

That passes tests, but its mutation surface is larger than the intent: the
intent is to isolate OpenAI/voice env variables for this spec, not reset the
entire process environment.

Atomic's version is semantically narrower:

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

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 016 is a strong Atomic OS win in operational behavior:

- faster overall completion;
- fewer events;
- fewer commands;
- fewer input/output/reasoning tokens;
- fewer raw changed lines;
- better semantic preservation;
- structured trace proof;
- no direct analyzer writes.

It is not yet enough to scale complexity because:

- the raw diff margin was only 2 lines;
- the normal external test run was 0.43s faster;
- one successful round is not enough to call the superiority "muuuuito"
  larger and stable at this complexity.

Decision: do not scale task complexity yet. Repeat the same complexity and
update Atomic OS to reduce its remaining tool payload and validation/runtime
overhead while preserving the narrower mutation topology.
