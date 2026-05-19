## Summary

Fixed the worker lint debt on branch `codex/ab10-normal-20260516162150`.

Start: `2026-05-16 16:23:07 -03`  
End: `2026-05-16 16:25:10 -03`

Baseline lint: `npm --prefix worker run lint:check` failed with `88 errors` (`85` auto-fixable, `3` unused variables).

## Files Changed

- `worker/**`: ESLint/Prettier auto-fix for formatting and required `curly` blocks.
- `worker/test/channel-dispatcher.spec.ts`: removed unused `mailEnvBackup`.
- `worker/test/openai-models.spec.ts`: removed unused `envBackup`.
- `worker/test/opportunity-heuristic.spec.ts`: removed unused `emptyDemographics`.

Diff shortstat for `worker`: `24 files changed, 235 insertions(+), 134 deletions(-)`.

Editing methods used: normal CLI `eslint --fix` plus standard patch edits. No Atomic OS, atomic-edit, semantic-edit, commit, push, rebase, reset, checkout, clean, restore, or `git restore`.

## Validation

- `npm --prefix worker run lint:check`: passed.
- `npm --prefix worker run typecheck`: passed.
- `git diff --check -- worker`: passed.
- `npm --prefix worker test`: passed, `45` files / `431` tests.
- `npm --prefix worker run build`: passed.

## E2E/User Flow

Not applicable; this was lint debt cleanup under `worker/**` with no intended runtime behavior change.

## Risks / Not Done

- `AGENTS.md` was already modified before my edits; it is protected and I left it untouched.
- Test output includes expected warning/error logs from existing tests, but the suite passed.

## Next Step

None required for the requested lint gate.