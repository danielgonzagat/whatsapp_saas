# Wave H / Coverage-WHATSAPP-A — 6 service specs

## Mission

Create specs for 6 WhatsApp services lacking coverage.

## Services

1. `agent-events.service.ts`
2. `cia-backlog-run.service.ts`
3. `cia-bootstrap.service.ts`
4. `cia-chat-filter.service.ts`
5. `cia-inline-fallback.service.ts`
6. `cia-remote-backlog.service.ts`

(All under `backend/src/whatsapp/`.)

## Ownership set

For each service: create `backend/src/whatsapp/<name>.service.spec.ts`.
Do NOT modify the service implementation. If you find a bug, report it.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE WHATSAPP / AUTOPILOT + REGRA DE BANCO DE DADOS.
2. `AGENTS.md`.
3. `docs/adr/0001-whatsapp-source-of-truth.md` for context.
4. Each target service in full.

## Special rules for WhatsApp specs

- Mock provider clients (WAHA, Meta Cloud API) at HTTP boundary.
- Test idempotency: same external `messageId` arriving twice → persisted once.
- Test tenant isolation: messages of workspace A never visible to workspace B.
- NEVER include message body in test assertions log (privacy).

## Spec template

See `wave-h-coverage/01-kloel-A.md`.

## Forbidden moves

- Real HTTP calls to Meta/WAHA.
- Log message body in any output.
- Bypass tokens, new `any`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/whatsapp/{agent-events,cia-backlog-run,cia-bootstrap,cia-chat-filter,cia-inline-fallback,cia-remote-backlog}.service.spec.ts
npx jest --testPathPattern="whatsapp/(agent-events|cia-)" --coverage --collectCoverageFrom="backend/src/whatsapp/{agent-events,cia-backlog-run,cia-bootstrap,cia-chat-filter,cia-inline-fallback,cia-remote-backlog}.service.ts"
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 6 new specs.
- Each ≥3 describe blocks, ≥6 it tests.
- Each covers tenant-isolation + idempotency where applicable.
- No real network calls.
- No message body in logs.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass, no commits.

## Hard stop conditions

- Service depends on real Redis/Queue for non-trivial behavior — STOP,
  report (integration test scope).
