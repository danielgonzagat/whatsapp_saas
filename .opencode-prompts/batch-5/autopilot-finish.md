# Wave H/Coverage-AUTOPILOT-A FINISH + Wave I/2 — finalize 4 failing tests

## Mission

Finalize the partial delivery from batch-4 fleet for autopilot:
1. `autopilot-cycle-executor.service.spec.ts` — 3 isNight tests fail in `decideAction`
2. `autopilot-analytics-report.service.spec.ts` — 1 "returns serialized events with contact enrichment" fails

Goal: all 4 tests pass without modifying source.

## Target files

- `backend/src/autopilot/autopilot-cycle-executor.service.spec.ts`
- `backend/src/autopilot/autopilot-analytics-report.service.spec.ts`

DO NOT touch the corresponding `.service.ts` (services compile and behave as designed).

## Method per file

### autopilot-cycle-executor.service.spec.ts

Failing tests:
- `decideAction › returns auto_reply_night when isNight and no buying signal` — Expected `auto_reply_night`, received `ai_chat`
- `decideAction › returns soft_close_night when isNight with buying signal` — Expected `soft_close_night`, received `send_offer_soft`
- `decideAction edge cases › prefers night+noBuying auto_reply_night over buying path` — Expected `auto_reply_night`, received `ai_chat`

Root cause: the test setup does not configure the night-hour determination correctly. Read `decideAction` in source to find what input field/config governs isNight, then make the test's `analysis`/`conv` arguments cause `isNight === true` in the actual code path.

Likely: `decideAction(analysis, conv, isNightFlag: boolean)` — the third positional argument controls night. Tests pass `false` as third arg but expect night behavior; pass `true`.

Verify with source read first; do not assume.

### autopilot-analytics-report.service.spec.ts

Failing test:
- `getRecentActions › returns serialized events with contact enrichment` — expected `{ contact: 'João', action: 'SEND_OFFER', intent: 'BUYING_INTENT', intentConfidence: 0.9, status: 'executed' }`, received the full enriched event object with `contact: 'c-1'`, `contactId: 'c-1'`, `contactPhone: null`, `createdAt`, `meta`, `nextRetryAt`, `reason`

Root cause analysis: spec used `expect(result[0]).toEqual(expect.objectContaining({...}))`. The shape mismatch indicates the contact mock returned `{ id: 'c-1', name: 'João' }` BUT the service's enrichment lookup did not find it (e.g., service queries by `id` but mock returns different key).

Read `getRecentActions` in source. Make sure:
1. Mock `contact.findMany` returns array of contacts with the exact fields the service reads
2. Contact map lookup key in service matches the mock's primary key
3. If the test expected enrichment to overwrite `contactId` with `name`, but source preserves both, update the expectation to use `expect.objectContaining({ contactId: 'c-1', action: 'SEND_OFFER', ... })` and just check the relevant subset

## Constraints (CLAUDE.md)

- NO `--no-verify`, NO `@ts-ignore`, NO `@ts-expect-error`, NO `biome-ignore`, NO `nosemgrep`, NO `eslint-disable`
- NO `any` cast as bypass — `as never as PrismaService` is the existing pattern
- NO modifying the actual service implementations
- NO commits — Claude (CEO orchestrator) will commit after Tier-3 validation
- LLM guard: chatCompletionWithRetry mocks must include id/created/model/object per OpenAI ChatCompletion strict type

## Definition of Done

- `npx jest src/autopilot/autopilot-cycle-executor.service.spec.ts src/autopilot/autopilot-analytics-report.service.spec.ts` exit 0
- ESLint clean on the 2 files
- No new tsc errors
- Report which testname:line was fixed and the one-line explanation

## Hard stop conditions

- A test reveals a real service bug — STOP, report P0 with file:line, do NOT amend the spec to mask the bug
- Service requires real LLM call (cannot mock) — STOP, report integration gap
