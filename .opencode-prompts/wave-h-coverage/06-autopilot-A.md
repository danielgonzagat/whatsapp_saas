# Wave H / Coverage-AUTOPILOT-A — 4 service specs

## Mission

Create specs for 4 Autopilot services lacking coverage.

## Services

1. `autopilot-analytics-insights.service.ts`
2. `autopilot-analytics-report.service.ts`
3. `autopilot-analytics.service.ts`
4. `autopilot-cycle-executor.service.ts`

(All under `backend/src/autopilot/`.)

## Ownership set

For each service: `backend/src/autopilot/<name>.service.spec.ts` (CREATE).
Do NOT modify the service implementation.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE WHATSAPP / AUTOPILOT + REGRA DE QUALIDADE DE IA.
2. `AGENTS.md`.
3. Each target service in full.

## Autopilot-specific spec rules

- Autopilot decisions are auditable — verify decision logs are persisted
  with workspaceId + correlationId.
- Cycle executor must respect handoff signal — verify "stop after handoff".
- Analytics services aggregate cross-workspace? If yes, must be admin-global.

## Spec template

See `.opencode-prompts/wave-h-coverage/01-kloel-A.md`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/autopilot/{autopilot-analytics-insights,autopilot-analytics-report,autopilot-analytics,autopilot-cycle-executor}.service.spec.ts
npx jest --testPathPattern="autopilot/autopilot-(analytics|cycle-executor)" --coverage
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 4 new specs.
- Coverage thresholds met.
- No bypass, no `any`, no commits.

## Hard stop conditions

- Service requires real LLM call (can't mock OpenAI/Anthropic) — STOP, report.
