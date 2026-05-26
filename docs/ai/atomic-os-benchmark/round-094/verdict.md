# Round 094 OpenCode A/B Verdict

## Setup

- NORMAL worktree: `/private/tmp/kloel-ab094-normal-20260517192409`
- ATOMIC worktree: `/private/tmp/kloel-ab094-atomic-20260517192409`
- Target: `backend/src/kloel/unified-agent.service.ts`
- Helper target: `backend/src/kloel/unified-agent-tool-router.helpers.ts`
- Task: repeat Round 093 complexity and compact final router-cluster shape.

## Executive Result

NORMAL wins functionally.

ATOMIC won raw operational surfaces but failed the task. The macro preprompt
rejected a syntax-breaking callsite replacement before that broken replacement
reached disk, which is a real Atomic guard win. However, earlier partial edits
remained in the worktree and external validation failed.

No complexity escalation is allowed. Round 095 must repeat the same difficulty
after the Atomic policy/tooling fix for escaped multiline replacement text and
partial macro rollback/retry behavior.

## Gates

- NORMAL: task-functional. Jest focused passed, lint focused passed,
  `typecheckKloelErrors=0`, diff-check passed, protected diff empty, helper
  had no `this.`, router cluster exported and private methods removed.
- ATOMIC: rejected. Jest focused failed `12/13`, lint focused failed,
  `typecheckKloelErrors=4`, private router methods remained, and the helper
  partial state left `deps` unresolved.
- Global backend typecheck still had shared Google Ads/Prisma noise outside
  `src/kloel/**`; this does not rescue the ATOMIC in-scope failures.

## Scorecard

| Metric | NORMAL | ATOMIC | Winner |
| --- | ---: | ---: | --- |
| Task functional pass | true | false | NORMAL |
| Lane status | max_timeout | completed | ATOMIC |
| Events | 155 | 3 | ATOMIC |
| First action | 20.702s | 5.315s | ATOMIC |
| Commands | 15 | 1 | ATOMIC |
| Failed commands | 3 | 1 | ATOMIC |
| Input tokens | 93,002 | 52,012 | ATOMIC |
| Output tokens | 11,205 | 126 | ATOMIC |
| Reasoning tokens | 7,502 | 281 | ATOMIC |
| Traces | 0 | 6 | ATOMIC |
| Service lines | 558 | 738 | NORMAL |
| Total Kloel lines | 790 | 978 | NORMAL |
| Source churn | 509 | 243 partial | ATOMIC raw, not accepted |

## What NORMAL Won

- Delivered the actual behavior under the external acceptance gates.
- Produced zero in-scope typecheck errors.
- Removed the private router cluster and exported the helper.
- Kept the product shape valid where ATOMIC left partial state.

## What ATOMIC Won

- Preserved atomic-only discipline.
- Produced traces.
- Refused to persist the syntax-breaking replacement that contained escaped
  `\n` text instead of actual newlines.
- Used far fewer events, commands, tokens and first-action time.

## Atomic Defeats Formalized

- The Atomic prompt/tool policy emitted escaped multiline replacement text into
  code replacement strings.
- The macro lacked all-or-nothing rollback across the whole high-level
  extraction: helper/import edits landed before a later callsite replacement
  was refused.
- Cleanup steps after the macro did not run because the macro exited first.
- Operational speed does not count as victory when task-functional acceptance
  fails.

## Atomic OS Update

- `atomic-call.cjs` now supports opt-in decoded replacement text through
  `decodeEscapedCodeTextInReplacements` and
  `decodeEscapedNewlinesInReplacements`.
- `atomic_add_import` now supports `typeOnly`.
- `round-audit.cjs` now separates task-functional pass per lane so NORMAL can
  be accepted when only shared out-of-scope typecheck noise remains.

## Decision

Rejected Atomic win. Do not scale. Repeat the exact same OpenCode A/B
complexity in Round 095 with decoded/newline-safe replacements and idempotent
cleanup discipline.

## Evidence

- `docs/ai/atomic-os-benchmark/round-094/audit.json`
- `docs/ai/atomic-os-benchmark/round-094/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-094/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-094/opencode-watchdog-status.json`
- `docs/ai/atomic-os-benchmark/round-094/opencode-atomic-preprompt-output.log`
