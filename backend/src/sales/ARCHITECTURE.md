# Sales & Refunds — in-chat order creation (PIX / boleto / card) + gateway-real refunds

This territory delivers **selling directly inside a chat thread** and **refunding a paid
sale through the real payment gateway**. When the KLOEL AI brain (or a human via the
Vendas UI) closes a deal, this code turns a product + plan + buyer into a real payment
instrument (PIX copy-paste/QR, boleto barcode, or a Stripe card checkout link), persists
a `KloelSale` row, and later refunds it for real money — never a fake "refunded" flag.

> Scope note: WAHA is the deprecated WhatsApp transport and is intentionally **not** part
> of this territory (see `docs/adr/0001-whatsapp-source-of-truth.md`). The active WhatsApp
> source of truth is Meta Cloud API; sales code here is transport-agnostic.

---

## 1. What the user does

Two real user-facing capabilities:

1. **In-chat sale (the AI closes the deal).** A buyer chats on WhatsApp. The KLOEL brain
   decides to charge them, asks for name/email/CPF, and emits a payment instrument *in the
   chat thread*: a PIX copy-and-paste code + QR, a boleto barcode, or a Stripe card
   checkout URL. The buyer pays; a webhook later flips the sale to `paid`.
2. **Manage sales from the dashboard.** The operator opens **Vendas** in the app to list
   sales, see revenue stats + a 30-day chart, drill into one sale, manage physical-good
   **orders** (ship/deliver/return) and **subscriptions** (pause/resume/cancel/change-plan),
   and **refund a paid sale** — which now requires human approval and then issues a real
   Stripe refund before the row is marked refunded.

---

## 2. End-to-end flow

### A) In-chat sale creation (PIX shown; boleto/card are siblings)

```
WhatsApp buyer message
  -> KLOEL brain decides "charge now" (intent router emits capability sales.create_pix)
  -> kloel-tool-dispatcher.service.ts  (routes the tool call)
  -> kloel-tool-dispatcher.sales.handlers.ts : dispatchSalesTool()   (case 'sales.create_pix')
  -> SalesService.createPixOrder()            backend/src/sales/sales.service.ts:101
       -> createPixOrderV2() (preferred)  OR  createPixOrderLegacyV1()  (sales.service.v1-orders.ts)
       -> $transaction:
            prisma.kloelSale.create(...)                        // status 'pending'
            MercadoPagoPixChargeService.create(...)             // REAL PIX instrument
            prisma.kloelSale.update(externalPaymentId, link)
            auditSale(SALE_CREATED) + auditSale(PAYMENT_PENDING)
       -> emitSaleAndLog() -> SpineEmitterService.emit('sale.created' + 'payment.pending')
  -> ToolResult { saleId, pixCopiaECola, pixQrCode, qrCodeBase64, ... }  back into the chat
```

Honest-failure guard: if the gateway returns no real PIX instrument, `createPixOrderV2`
throws `ServiceUnavailableException` (503) and leaves the row `pending` — it **never**
fabricates a copy-paste/QR that can't be paid (`sales.service.ts:280`).

- **Boleto:** `SalesService.createBoletoOrder` -> `createBoletoOrderV1` ->
  `MercadoPagoBoletoChargeService.create`.
- **Card:** `SalesService.createStripeCardLink` -> `createStripeCardLinkV1` ->
  `StripeService` Checkout Session (returns `checkoutUrl`).

### B) Dashboard read paths (Vendas UI)

```
frontend/src/components/kloel/vendas/VendasView.tsx
  -> frontend/src/hooks/useSales.ts  (useSales / useSalesStats / useSalesChart / useSaleDetail)
  -> apiFetch / swrFetcher  (frontend/src/lib/api/core.ts) — direct to backend, no Next proxy
  -> GET /sales, /sales/stats, /sales/chart, /sales/:id
  -> SalesController                 backend/src/kloel/sales.controller.ts
  -> prisma.kloelSale.findMany / findFirst   (workspace-scoped)
  -> { sales, count } | stats | { chart } | { sale }
  -> UI renders list / KPIs / sparkline / detail
```

Orders (physical) and subscriptions are sibling controllers in the same `/sales` tree:
- `GET/PUT /sales/orders*` -> `SalesOrdersController` (`backend/src/kloel/sales-orders.controller.ts`) — list, stats, pipeline, ship, deliver, return, alerts.
- `GET/POST/PUT /sales/subscriptions*` -> `SalesSubscriptionsController` (`backend/src/kloel/sales-subscriptions.controller.ts`) — list, stats, pause, resume, cancel, change-plan.

### C) Refund a paid sale (the production refund path)

```
Vendas UI "Reembolsar" button
  -> POST /sales/:id/refund   (header x-idempotency-key, body { approvalRequestId? })
  -> SalesController.refundSale()   backend/src/kloel/sales.controller.ts:172   (@Idempotent)
     1. load sale (workspace-scoped); 404 if missing; 400 if status != 'paid'
     2. if no approvalRequestId  -> create ApprovalRequest(kind 'sale:refund', state OPEN)
        and return { approvalRequired:true, approvalRequestId } — NO money moves yet
     3. with an APPROVED approvalRequestId:
        - if externalPaymentId starts with 'pi_'  -> stripe.refunds.create({payment_intent}, {idempotencyKey})
        - else  -> 400 'Somente pagamentos Stripe são suportados para estorno nesta versão.'
        - mark ApprovalRequest COMPLETED
        - Stripe path: set sale.status = 'refund_requested' (final flip waits on webhook), audit 'refund_requested'
        - manual/no-gateway path: set sale.status = 'refunded', audit 'refund'
```

There is **also** a separate, lower-level refund in `SalesService.refund()`
(`backend/src/sales/sales.service.ts:400`) → `runGatewayRefund()` (`:468`): money-first
(real `stripe.refunds.create` with `refundId` as idempotency key) **then** DB flip to
`refunded`, throwing `ServiceUnavailableException` when there is no `pi_` PaymentIntent.
See Honest status for why this one is **not** on the live HTTP path.

---

## 3. Canonical vocabulary

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| A single sale record | **KloelSale** (Prisma model) | DB table `RAC_KloelSale`. `amount` is `Float` (reais), NOT bigint cents. |
| In-chat sale creator | **SalesService** (`backend/src/sales/sales.service.ts`) | The territory's owning service. |
| HTTP sales API | **SalesController** (`backend/src/kloel/sales.controller.ts`) | Lives in `kloel/`, not `sales/`. |
| Physical-order API | **SalesOrdersController** | `/sales/orders*` (ship/deliver/return + alerts). |
| Subscription API | **SalesSubscriptionsController** | `/sales/subscriptions*`. |
| Payment instrument | PIX copy-paste / PIX QR / boleto barcode / Stripe checkout URL | |
| Gateway charge | **MercadoPagoPixChargeService** / **MercadoPagoBoletoChargeService** / **StripeService** | PIX+boleto = Mercado Pago; card + refund = Stripe. |
| Refund authorization | **ApprovalRequest** (kind `sale:refund`) | Human-in-the-loop gate before any Stripe refund. |
| Sale status values | `pending` \| `paid` \| `refund_requested` \| `refunded` \| `cancelled` \| `overdue` | String enum on `KloelSale.status`. |
| In-chat tool ids | `sales.create_pix` \| `sales.create_boleto` \| `sales.create_card_link` | Wired in `dispatchSalesTool`. |

**Lingering duplicate / alias to know:** there are **two refund implementations** —
`SalesController.refundSale` (live HTTP, approval-gated, Prisma+Stripe inline) and
`SalesService.refund` (service-level, money-first, only reachable internally via
`refundSubscription`). Capability ids `sales.refund` / `sales.cancel_subscription`
exist in the registry/intent-router but are **not** wired in `dispatchSalesTool` (which
only dispatches the three create tools).

---

## 4. Key services & single responsibility

| Service / file | Owns (one line) |
|---|---|
| `SalesService` (`sales.service.ts`) | In-chat order creation (PIX v2/legacy, boleto, card link), service-level refund, summary, subscription cancel/refund. |
| `sales.service.v1-orders.ts` | Standalone per-provider V1 create-order orchestrators (`createPixOrderLegacy`, `createBoletoOrder`, `createStripeCardLink`) under the 400-LOC governance cap. |
| `sales.service.v1-shared.ts` | Shared `SalesV1Deps` bundle + `emitSaleAndLog` (spine emit of `sale.created` + `payment.pending`). |
| `sales.service.pix-refund.helpers.ts` | Pure builders: PIX v2 sale data, `buildRefundId`, `resolveRefundAmountCents`, refund metadata. |
| `sales.helpers.shared.ts` | Spine envelope + audit-detail + log builders reused across PIX/boleto/card. |
| `sales.helpers.{pix,boleto,stripe}.ts` | Per-provider pure mapping helpers (amounts, descriptions, payloads). |
| `SalesController` (`kloel/sales.controller.ts`) | HTTP: list/stats/chart/detail + approval-gated Stripe refund. |
| `SalesOrdersController` (`kloel/sales-orders.controller.ts`) | HTTP: physical-goods order lifecycle + alerts. |
| `SalesSubscriptionsController` (`kloel/sales-subscriptions.controller.ts`) | HTTP: subscription lifecycle. |

---

## 5. Data & events

**Prisma models touched** (`backend/prisma/schema.prisma`):
- **KloelSale** (`:1902`, table `RAC_KloelSale`) — owned. `amount: Float`, `status`,
  `paymentMethod`, `paymentLink`, `externalPaymentId @unique`, `metadata: Json`,
  `@@index([workspaceId, status])`.
- **CustomerSubscription** (`:2626`) — read/written by subscription cancel/refund.
- **ApprovalRequest** (`:1484`) — the refund human-approval gate.
- **AuditLog** — refund + sale audit trail.

**Events emitted** via `SpineEmitterService` (from `sales.service.v1-shared.ts`):
- `sale.created`
- `payment.pending`

These map to the canonical commerce spine taxonomy (`commerce.payment.initiated`,
`commerce.payment.refunded`, etc. — see `protocol_hub_asyncapi domain=commerce`). Note: no
explicit `payment.refunded`/`sale.refunded` spine emit is fired from the refund paths
today (the final `paid`→`refunded` transition is expected to arrive via the payment webhook).

---

## 6. Workspace isolation

Every query is workspace-scoped. The `workspaceId` is read from the JWT
(`req.user.workspaceId`) in the controllers and passed as the first argument into every
`SalesService` method. Concretely:
- Controllers gate with `@UseGuards(JwtAuthGuard)`; `listSales` returns an empty payload
  when `workspaceId` is absent rather than leaking cross-tenant rows.
- Every `prisma.kloelSale.findFirst/findMany/updateMany` filters by `{ id, workspaceId }`
  or `{ workspaceId }`. Subscription and approval lookups likewise filter by `workspaceId`.
- Refund approvals are matched on `{ id, workspaceId, kind:'sale:refund', entityId:id, state:'APPROVED' }`.

---

## 7. Honest status (what really works vs facade/gap)

**Works (real, end-to-end):**
- In-chat **PIX / boleto / card-link creation** is real: it persists a `KloelSale` and
  calls the real Mercado Pago / Stripe charge services inside a transaction, with audit +
  spine events. Gateway-empty results throw 503 instead of faking an instrument
  (`sales.service.ts:280`). Wired live through `dispatchSalesTool`.
- **Dashboard reads** (`/sales`, `/sales/stats`, `/sales/chart`, `/sales/:id`) are real
  Prisma queries, workspace-scoped, consumed by `useSales.ts` in `VendasView.tsx`.
- **HTTP refund** (`SalesController.refundSale`) is real and conservative: human-approval
  gate via `ApprovalRequest`, real `stripe.refunds.create` with idempotency key, DB flip
  to `refund_requested` (Stripe) only after the gateway call, `@Idempotent` replay-safe.

**Partial / gap (evidence cited):**
- **Two divergent refund implementations.** Live path = `SalesController.refundSale`
  (approval-gated, sets `refund_requested`). The cleaner money-first
  `SalesService.refund`/`runGatewayRefund` (sets `refunded`) has **no live runtime caller**
  — only internal `refundSubscription` reaches it; capability ids `sales.refund` /
  `sales.cancel_subscription` are declared in the registry/intent-router but **absent from
  `dispatchSalesTool`** (verified: `SALES_TOOL_NAMES` = only the 3 create tools). So
  AI-initiated refunds are unreachable, and the two paths disagree on the final status
  (`refunded` vs `refund_requested`).
- **Non-Stripe refunds rejected.** PIX/boleto sales (Mercado Pago `externalPaymentId`
  without `pi_`) cannot be refunded via either path — controller returns 400, service
  throws 503. This is honest (no fake refund) but a real capability gap given PIX/boleto
  are first-class sale methods here.
- **Money type mismatch.** `KloelSale.amount` is `Float` (reais), violating the repo's
  "centavos em bigint" payment baseline. `resolveRefundAmountCents` bridges via
  `Math.round(saleAmount*100)` — correct today but fragile vs the bigint contract.
- **No refund spine event.** Neither refund path emits a `payment.refunded`/`sale.refunded`
  spine event; downstream consumers rely on the payment webhook to observe the refund.

PULSE: no sales-specific module artifact was found via `pulse_health_by_module`
(303 artifacts, none name-matched "sales"); status above is from direct code reading.

---

## 8. Start here (newcomer reading order)

1. **`backend/src/sales/sales.service.ts`** — the heart: create-order entrypoints
   (`createPixOrder` → `createPixOrderV2`), `refund`/`runGatewayRefund`, subscription ops.
2. **`backend/src/kloel/sales.controller.ts`** — the live HTTP surface, especially
   `refundSale` (the real approval-gated Stripe refund the dashboard calls).
3. **`backend/src/kloel/kloel-tool-dispatcher.sales.handlers.ts`** — `dispatchSalesTool`,
   how the AI brain turns a chat decision into a real sale (and which tools are wired).

Supporting reads: `sales.service.v1-orders.ts` (provider orchestration),
`sales.service.pix-refund.helpers.ts` (refund builders), `frontend/src/hooks/useSales.ts`
+ `frontend/src/components/kloel/vendas/VendasView.tsx` (the UI side).
