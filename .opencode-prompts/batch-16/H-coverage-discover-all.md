# Wave H — Auto-discover and cover all backend services without spec

## Mission

Find every backend service without a `.spec.ts` and create one. Each spec: ≥3 tests (happy path, tenant-isolation OR role guard, error/edge case).

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — relevant section per service module
3. `AGENTS.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend
find src -name "*.service.ts" -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

For each service found, write a complete spec.

## Spec template

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TargetService } from './target.service';

describe('TargetService', () => {
  let service: TargetService;
  let prisma: { /* mock */ };

  beforeEach(async () => {
    prisma = { /* method mocks */ };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TargetService);
  });

  it('happy path: returns expected shape', async () => { /* ... */ });
  it('enforces workspace isolation', async () => { /* ... */ });
  it('handles upstream error', async () => { /* ... */ });
});
```

## Ownership

ONLY new `.spec.ts` files. DO NOT modify source `.service.ts` files.

## Constraints

- NO bypass tokens
- NO commits — orchestrator commits
- Mock external services (OpenAI, BullMQ, Stripe, Meta API, Redis)

## Definition of Done

- Each discovered service without spec now has one
- `npx jest <new-spec-path>` passes for each
- Coverage ≥70% lines per touched file

## Hard stops

- Service has real bug discovered while writing spec — STOP, report P0
- Service requires real Redis/DB integration — STOP, document
- Discovery yields more than 50 services — STOP, prioritize top 50 by line count
