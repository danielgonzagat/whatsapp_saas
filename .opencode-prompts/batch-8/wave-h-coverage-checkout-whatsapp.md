# Wave H/Coverage — Checkout + Whatsapp services without spec (~30 new specs)

## Mission

Create `.spec.ts` files for backend services that lack coverage. This batch covers Checkout + Whatsapp modules.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE WHATSAPP / AUTOPILOT, REGRA DE CHECKOUT, REGRA DE BANCO DE DADOS, REGRA DE QUALIDADE DE IA
3. `AGENTS.md`
4. Each target service file in full before writing its spec

## Discovery — find services without spec

```bash
cd /Users/danielpenin/whatsapp_saas/backend/src
# List services without matching .spec.ts in checkout/ and whatsapp/
find checkout whatsapp -name "*.service.ts" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Target areas

### Checkout (11 services without spec — top priority)

Per the inventory:
- `checkout-catalog-config.service.ts`
- `checkout-catalog.service.ts`
- `checkout-order-query.service.ts`
- `checkout-order.service.ts`
- `checkout-post-payment-effects.service.ts`
- `checkout-product-config.service.ts`
- `checkout-product.service.ts`
- `checkout-social-lead.service.ts`
- `checkout-social-recovery.service.ts`
- `checkout.service.ts`
- `facebook-capi.service.ts`

### WhatsApp (17 services without spec)

Per the inventory:
- `agent-events.service.ts`
- `cia-backlog-run.service.ts`
- `cia-bootstrap.service.ts`
- `cia-chat-filter.service.ts`
- `cia-inline-fallback.service.ts`
- `cia-remote-backlog.service.ts`
- `cia-runtime-state.service.ts`
- `cia-send-helpers.service.ts`
- `whatsapp-catchup-history.service.ts`
- `whatsapp-catchup-orchestrator.service.ts`
- `whatsapp-media.service.ts`
- `whatsapp-message-dispatcher.service.ts`
- `whatsapp-reconciler.service.ts`
- `whatsapp-send-rate-guard.service.ts`
- `whatsapp-session.service.ts`
- `whatsapp-watchdog-session.service.ts`
- `worker-runtime.service.ts`

Some may already have specs (created mid-flight by another subagent) — verify before creating to avoid duplicate.

## Spec template (must follow)

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
// ... other deps the service uses
import { TargetService } from './target.service';

describe('TargetService', () => {
  let service: TargetService;
  let prisma: { /* mock shape */ };

  beforeEach(async () => {
    prisma = {
      // mock methods the service uses (deepMockProxy preferred when available)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        // ... other deps
      ],
    }).compile();

    service = module.get<TargetService>(TargetService);
  });

  describe('publicMethod', () => {
    it('happy path: returns expected shape', async () => { /* ... */ });
    it('rejects cross-workspace access', async () => { /* ... */ });
    it('handles upstream error gracefully', async () => { /* ... */ });
  });
});
```

Coverage minimum per spec file: 70% lines, 65% branches.

## Special invariants

### Checkout
- Money in bigint cents (test reads return bigint from service)
- State machine: orders progress CREATED → AWAITING_PAYMENT → PAID → FULFILLED (or REFUNDED/CANCELLED). Test invalid transitions get rejected.
- Idempotency: same externalId twice = single order record
- Workspace isolation: every query filtered by workspaceId

### WhatsApp
- Workspace isolation always
- Idempotency on messageId (in/out)
- Provider routing (WAHA vs Meta Cloud API) preserved
- Session lifecycle (QR → CONNECTED → DISCONNECTED → RECONNECTING) state tested
- No raw token logging (only first 4 + last 4 masked)
- Handoff signal respected (if `handoff=true`, autopilot does NOT respond)

## Ownership set

ONLY:
- `backend/src/checkout/**/*.spec.ts` (CREATE new spec files)
- `backend/src/whatsapp/**/*.spec.ts` (CREATE new spec files)

DO NOT modify the source `.service.ts` files.

## Constraints (CLAUDE.md)

- NO bypass tokens
- NO commits — orchestrator commits after Tier-3 validation
- NO modifying protected files
- NO mocking real DB behavior (use mocked Prisma client per the existing pattern in the repo)

## Definition of Done

- Each target service has a matching `.spec.ts` with ≥3 tests
- `npx jest --testPathPatterns="(checkout|whatsapp)/.*spec"` exit 0
- ≥70% line / ≥65% branch coverage per spec file (run with `--coverage` and report)
- Report:
  - count of new spec files
  - per-file coverage %
  - any invariants tested
  - any hard-stops encountered

## Hard stop conditions

- A service has a real bug discovered while writing the spec — STOP, report P0
- A service depends on a real Redis/DB/Meta API that cannot be mocked — STOP, report integration gap
- Spec count would exceed time budget (target: at most 28 specs in this slice) — STOP, report partial completion with which services were covered
