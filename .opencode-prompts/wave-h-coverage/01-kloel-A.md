# Wave H / Coverage-KLOEL-A — 6 service specs

## Mission

Create comprehensive specs (`.spec.ts`) for 6 Kloel services currently lacking
test coverage. Per A.3 of mission anexo. Coverage threshold: 70% line, 65% branch.

## Services to cover

1. `ad-rules-engine.service.ts`
2. `audio.service.ts`
3. `conversational-onboarding-tools.service.ts`
4. `conversational-onboarding.service.ts`
5. `email-campaign.service.ts`
6. `guest-chat.service.ts`

(All under `backend/src/kloel/`.)

## Ownership set

For each service in the list:
- `backend/src/kloel/<service>.service.ts` — READ only (do not modify product code unless a clear bug requires it; if bug, report instead of fixing)
- `backend/src/kloel/<service>.service.spec.ts` — CREATE this file

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE API.
2. `AGENTS.md`.
3. Each of the 6 services in full.
4. An existing passing spec for reference (e.g. `backend/src/kloel/kloel.service.spec.ts` if available).
5. `backend/src/common/testing/prisma-mock.ts` — likely has `mockDeep<PrismaService>()` helper.

## Spec template (adapt per service)

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { XxxService } from './xxx.service';

describe('XxxService', () => {
  let service: XxxService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XxxService,
        { provide: PrismaService, useValue: prisma },
        // ... other deps mocked
      ],
    }).compile();
    service = module.get<XxxService>(XxxService);
  });

  describe('happyPath', () => {
    it('does the main operation correctly', async () => { /* ... */ });
  });

  describe('tenant isolation', () => {
    it('rejects cross-workspace access', async () => {
      prisma.<model>.findFirst.mockResolvedValueOnce(null);  // simulates wrong workspace
      await expect(service.method('id', 'wrong-ws')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upstream errors', () => {
    it('propagates Prisma errors gracefully', async () => {
      prisma.<model>.findMany.mockRejectedValueOnce(new Error('DB down'));
      await expect(service.method(...)).rejects.toThrow(/DB down|database/);
    });
  });

  describe('edge cases', () => {
    it('handles empty result set', async () => { /* ... */ });
    it('handles malformed input', async () => { /* ... */ });
  });
});
```

## Forbidden moves

- Mock TOO loosely (e.g., `prisma.X.findFirst.mockResolvedValue(anything)` without checking the arg). Always assert the `where` clause includes `workspaceId` when the service is workspace-scoped.
- Use `as any` to silence type errors in test setup. Use `mockDeep<T>()` (already typed) or define explicit mock objects with full types.
- Skip the tenant-isolation test even if the service "doesn't seem" to need it. If the service touches Prisma, it touches workspaceId.
- Bypass tokens.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/kloel/{ad-rules-engine,audio,conversational-onboarding-tools,conversational-onboarding,email-campaign,guest-chat}.service.spec.ts
npx jest --testPathPattern="kloel/(ad-rules-engine|audio|conversational-onboarding|email-campaign|guest-chat)" --coverage --collectCoverageFrom="backend/src/kloel/{ad-rules-engine,audio,conversational-onboarding-tools,conversational-onboarding,email-campaign,guest-chat}.service.ts"
```

Coverage report should show ≥70% lines, ≥65% branches per file.

## Definition of done

- 6 new `.spec.ts` files created.
- Each spec has ≥3 describe blocks, ≥6 it tests total.
- Each spec covers tenant-isolation explicitly (if applicable).
- `npx jest --coverage` shows ≥70%/≥65% per file.
- `npx tsc` no regress.
- `npx eslint` clean on new spec files.
- No bypass tokens.
- No commits (CEO commits).

## Hard stop conditions

- If a service has bug that prevents spec writing (e.g., dependency cycle) —
  STOP, report.
- If `mockDeep` / `jest-mock-extended` not in devDependencies — STOP, report.
- If a service requires real Redis/Postgres (not mockable) — STOP, report
  (integration test scope, not unit spec).
