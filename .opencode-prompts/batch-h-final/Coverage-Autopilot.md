# Wave H — Coverage-Autopilot (4 services)

## Mission

Criar `.service.spec.ts` para cada um destes 4 services no backend. Cada spec ≥3 testes (happy path + tenant-isolation + erro upstream/edge).

**Targets**:
- `backend/src/autopilot/autopilot-cycle.service.ts`
- `backend/src/autopilot/autopilot-cycle-money.service.ts`
- `backend/src/autopilot/autopilot-ops.service.ts`
- `backend/src/autopilot/autopilot-ops-conversion.service.ts`

## Pre-read (mandatório)

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` (regras do projeto, especialmente REGRA DE BANCO DE DADOS + REGRA DE API)
3. `backend/src/billing/plan-limits.service.spec.ts` (template padrão)
4. Cada arquivo target inteiro (ler 100% antes de escrever spec)

## Pattern

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { Target } from './target.service';

describe('Target', () => {
  let service: Target;
  let prisma: { /* mocks: jest.Mock por método usado */ };
  beforeEach(async () => {
    prisma = { /* ... */ };
    const module: TestingModule = await Test.createTestingModule({
      providers: [Target, { provide: PrismaService, useValue: prisma }, /* outros mocks */],
    }).compile();
    service = module.get(Target);
  });
  it('happy path', async () => { /* ... */ });
  it('enforces workspace isolation', async () => { /* ... */ });
  it('handles upstream error', async () => { /* ... */ });
});
```

## Mocking BullMQ queues

Esses services importam `autopilotQueue` de `../queue/queue`. Mockar via `jest.mock('../queue/queue', () => ({ autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) } }))` no topo do spec.

## Mocking Redis

`createRedisClient` de `../common/redis/redis.util`: `jest.mock('../common/redis/redis.util', () => ({ createRedisClient: () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), decr: jest.fn(), expire: jest.fn() }), isRedisConfigured: () => true }))`.

## Validation

Para cada spec criado:
```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/autopilot/<file>.spec.ts --silent
```
Deve passar TODOS os testes.

## Ownership

Apenas criar arquivos `.spec.ts` novos nos 4 paths acima. NÃO modifique source `.service.ts`. NÃO toque outros arquivos.

## Constraints

- NO bypass tokens (`as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, eslint-disable, biome-ignore, nosemgrep)
- NO commits — orquestrador commits
- Mock externals (BullMQ, Redis, Stripe, Meta API, OpenAI, child services)

## Definition of Done

- 4 `.spec.ts` criados
- Cada um passa `npx jest <path>` standalone
- Cada um cobre happy path + tenant isolation + erro upstream
- Total ≥12 testes
