# Wave H — Coverage-Cia (4 services CIA)

## Mission

Criar `.service.spec.ts` para 4 services CIA. Cada spec ≥3 testes.

**Targets**:
- `backend/src/cia/cia-runtime-state.service.ts`
- `backend/src/cia/cia-inline-fallback.service.ts`
- `backend/src/cia/cia-remote-backlog.service.ts`
- `backend/src/cia/cia-backlog-run.service.ts`

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md`
3. `backend/src/cia/cia-bootstrap.service.spec.ts` (já existe — copie o padrão de mock)
4. `backend/src/cia/cia-send-helpers.service.spec.ts` (já existe — copie padrão de Redis token)
5. Cada arquivo target inteiro

## Padrões já provados neste módulo

- Redis token: `'default_IORedisModuleConnectionToken'` para `@InjectRedis()`.
- `autopilotQueue` mock: `jest.mock('../queue/queue', () => ({ autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) } }))`.
- `forwardRef` deps: passar `{}` como mock se não chamado.

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/cia/<file>.spec.ts --silent
```

## Constraints

- NO bypass tokens
- NO source modifications
- NO commits
- Mock BullMQ + Redis + WhatsAppCatchupService + AgentEventsService

## Definition of Done

- 4 specs criados, todos passam jest, ≥12 testes total
