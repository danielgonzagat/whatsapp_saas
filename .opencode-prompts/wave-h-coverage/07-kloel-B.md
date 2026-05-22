# Wave H / Coverage-KLOEL-B — 6 service specs

## Mission

Create specs for 6 Kloel services lacking coverage (batch B of Kloel coverage).

## Services

1. `kloel-business-config-tools.service.ts`
2. `kloel-chat-tools.service.ts`
3. `kloel-composer.service.ts`
4. `kloel-lead-brain.service.ts`
5. `kloel-lead-processor.service.ts`
6. `kloel-reply-engine.service.ts`

(All under `backend/src/kloel/`.)

## Ownership set

Per service: `backend/src/kloel/<name>.service.spec.ts` (CREATE).
Do NOT modify the service implementation.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE QUALIDADE DE IA.
2. `AGENTS.md`.
3. Each target service in full.
4. `backend/src/kloel/kloel.service.spec.types.ts` (created by B/2 — shared mock types).

## Spec template

See `.opencode-prompts/wave-h-coverage/01-kloel-A.md`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/kloel/{kloel-business-config-tools,kloel-chat-tools,kloel-composer,kloel-lead-brain,kloel-lead-processor,kloel-reply-engine}.service.spec.ts
npx jest --testPathPattern="kloel/kloel-(business-config|chat-tools|composer|lead-brain|lead-processor|reply-engine)" --coverage
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 6 new specs.
- Each ≥3 describe blocks, ≥6 it tests.
- Tenant-isolation tests where Prisma is touched.
- No bypass, no `any`, no commits.

## Hard stop conditions

- Service requires real LLM call — STOP, report (integration test scope).
- kloel-lead-brain has the pre-existing TS error downstream issue noted in
  Wave B/2 delivery — verify whether your spec can compile.
