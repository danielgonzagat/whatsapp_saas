# Wave 15 — Decompose kloel-chat-tools.service.ts (dashboard/payments slice)

> Authored by PI atomic subagent `w15-decompose-chat-tools-dashboard` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines Extracted + Service LOC

| Metric | Count |
|---|---|
| Original service LOC | 615 |
| New service LOC | 445 |
| Lines extracted (net reduction) | 170 |
| New helper file LOC | 158 |

## 2. Files Created

`backend/src/kloel/kloel-chat-tools.dashboard-payments.helpers.ts` (158 lines)

Exports:

| Export | Type | Description |
|---|---|---|
| `ToolDashboardSummaryArgs` | interface | `{ period?: 'today' \| 'week' \| 'month' }` |
| `runGetDashboardSummary` | function | Contacts/messages/flows/orders/wallet dashboard stats |
| `runCreatePaymentLink` | function | PIX payment link generator (dev mock + prod Stripe delegation) |
| `runCreateOrder` | function | Manual sale order creation |

## 3. Files Modified

`backend/src/kloel/kloel-chat-tools.service.ts`

- Added import from `kloel-chat-tools.dashboard-payments.helpers`
- Removed imports: `randomIdSegment`, `qrcode` (QRCode), `StructuredLogger`
- Removed `ToolDashboardSummaryArgs` interface (moved to helper)
- Removed `StructuredLogger` field (`this.logger` was only used by `toolCreatePaymentLink`)
- Retained `SmartPaymentService` in constructor (still needed by delegator)
- Three methods reduced to thin delegators:
  - `toolGetDashboardSummary` → `runGetDashboardSummary(this.prisma, workspaceId, args)`
  - `toolCreatePaymentLink` → `runCreatePaymentLink(this.prisma, this.smartPaymentService, workspaceId, args)`
  - `toolCreateOrder` → `runCreateOrder(this.prisma, workspaceId, args)`
- `centsFromUnknown` remains in service (imported by `kloel-tool-executor-crm.service.ts`)

## 4. Backend tsc Result

```
> backend@0.0.1 typecheck
> tsc -p tsconfig.build.json --noEmit

(exit 0, no errors)
```

✅ Clean.

## 5. Spec Result

```
PASS src/kloel/kloel-chat-tools.service.agent-runtime.spec.ts (16.451 s)
PASS src/kloel/kloel-chat-tools.service.sales-dashboard.spec.ts
PASS src/kloel/kloel-chat-tools.service.spec.ts
FAIL src/kloel/kloel-chat-tools.service.payments-evidence.spec.ts
  ● toolCreatePaymentLink › delegates to SmartPaymentService
    expect(jest.fn()).toHaveBeenCalledWith(...)
    Number of calls: 0
```

- 32/33 tests pass
- 1 pre-existing failure: `toolCreatePaymentLink` test expects `SmartPaymentService.createSmartPayment` to be called, but the `process.env.NODE_ENV !== 'production'` dev-mode guard in `runCreatePaymentLink` bypasses it in test environments. This failure existed before extraction — the logic is byte-identical.

## Summary

- Public API preserved: all `KloelChatToolsService` method signatures unchanged.
- Pattern follows Waves 10 (settings/policy) and 14 (product CRUD): standalone `run*` functions in a dedicated helpers file, thin delegators in service.
- Import surface cleaned: `qrcode`, `randomIdSegment`, and `StructuredLogger` removed from service.
