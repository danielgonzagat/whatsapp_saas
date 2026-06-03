# Atomic OS Benchmark - Round 018 Verdict

Date: 2026-05-16

## Task

Same complexity as rounds 014-017. Both workers fixed the real `worker` ESLint
debt from the same base commit and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab018-normal-20260516180033`
- Atomic OS: `/private/tmp/kloel-ab018-atomic-20260516180033`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed external test result:

- Normal: 45 files passed, 431 tests passed, test duration 23.34s.
- Atomic: 45 files passed, 431 tests passed, test duration 23.78s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 152s | 137s | Atomic by 15s |
| JSONL event rows | 63 | 54 | Atomic by 9 events |
| Completed shell commands | 24 | 19 | Atomic by 5 commands |
| Unique completed shell commands | 21 | 16 | Atomic by 5 commands |
| MCP calls | 0 | 1 | Atomic trace path |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 1 | 0 | Atomic |
| Input tokens | 742,713 | 685,962 | Atomic by 56,751 |
| Cached input tokens | 700,288 | 589,824 | Atomic by 110,464 |
| Output tokens | 5,391 | 4,870 | Atomic by 521 |
| Reasoning tokens | 2,446 | 2,552 | Normal by 106 |
| Tool result chars | 0 | 922 | Normal by absence of MCP payload |
| Worker diff shortstat | 24 files, +259/-119 | 24 files, +251/-119 | Atomic by 8 raw lines |
| External validation wall time | 47s | 47s | Tie |
| External test duration | 23.34s | 23.78s | Normal by 0.44s |
| External validation result | pass | pass | Tie |

## Qualitative Evidence

Atomic OS improved over round 017 on payload: the ESLint operator returned only
922 chars of MCP text when residue was fully resolved, down from 2,800 chars in
round 017. The structured trace proof remained intact with 24 trace files.

Atomic also beat Normal on raw diff in this round:

- Normal worker diff: `24 files changed, 259 insertions(+), 119 deletions(-)`.
- Atomic worker diff: `24 files changed, 251 insertions(+), 119 deletions(-)`.

Normal still produced a better named local abstraction in
`worker/test/openai-models.spec.ts`:

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

Atomic preserved the same behavior with less raw surface but no named helper:

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

That means Atomic won compactness and traceability, while Normal had a small
readability/intent-label win in one test fixture.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Round 018 is a broad Atomic OS win, but not an overwhelming all-front win:

- Atomic won time, events, commands, input tokens, output tokens, raw diff,
  traceability, and editor discipline.
- Normal won reasoning tokens by 106, external test duration by 0.44s, and one
  qualitative readability detail via a named `restoreOpenAiEnvs` helper.
- External validation result was tied.

Decision: do not scale task complexity yet. Repeat the same complexity after
updating Atomic OS so its known-residue fix can preserve the product/test anchor
with a named helper when that is the highest faithful operation, not just the
shortest inline patch.
