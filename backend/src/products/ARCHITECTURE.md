# Products & Plans — the product catalog that everything commercial hangs off

This territory owns the **product catalog**: the things a workspace sells, the
priced **plans** under each product, and every per-product selling surface —
**coupons, commissions, affiliate config, AI sales config, URLs, reviews,
campaigns, checkouts**. A product is the root entity of KLOEL's commerce graph:
checkout, billing, affiliate, member-area and the AI sales agent all read from
it. Get this right and the rest of FASE 1 (Checkout, Wallet, Billing) has real
data to work with.

---

## What the user does

In the UI (`/produtos`) a workspace owner:

1. Creates a product (name, price, category, image, physical/digital format).
2. Opens the product and configures it across tabs — **General, Plans, Coupons,
   Commissions, URLs, Campaigns, Reviews, Checkouts, IA (AI config)**.
3. Publishes it (moves `status` DRAFT → APPROVED, `active = true`) so it can be
   sold through checkout.

The same catalog is also driven by the **AI sales agent (Kloel/Mind)**: when a
conversation needs a product created/edited, the agent calls a *capability*
(e.g. `products.create`, `plans.update`) which routes to the service layer
below — same DB, same audit trail, different entry door.

---

## End-to-end flow — the REAL path

There are **two front doors** to the same Prisma models. Knowing which is which
is the single most important fact about this territory.

### Door A — Human REST path (the `/produtos` UI)

UI tab → frontend api client → Nest controller → **direct Prisma** (via helpers) → DB.

Example: a user edits a product.

```
frontend/src/components/products/ProductGeneralTab.tsx
  -> frontend/src/lib/api/products.ts  (productApi.update → apiFetch PUT /products/:id)
     [no Next.js proxy route — apiFetch hits the backend origin directly]
  -> backend/src/kloel/product.controller.ts  @Put(':id') ProductController.updateProduct
  -> buildUpdateProductData(...) (product.controller.helpers.ts)
  -> this.prisma.product.update({ where: { id, workspaceId }, data })   // RAC_Product
  -> syncProductToMemory(...)  (Brain→Mind memory mirror)
  -> { product, success: true }  -> SWR cache invalidated -> UI re-renders
```

The HTTP controllers live in **`backend/src/kloel/`** and
**`backend/src/kloel/product-sub-resources/`**, NOT in this `products/` folder.
They talk to Prisma directly through small pure helpers (`*.helpers.ts`) and
`ensureWorkspaceProductAccess` for the ownership check. They do **not** call
`ProductService`.

| User action | Controller (route) | Prisma model |
|---|---|---|
| List / get / create / update / delete / stats / import / categories | `ProductController` (`/products*`) — `backend/src/kloel/product.controller.ts` | `Product` |
| Plans CRUD | `ProductPlanController` (`/products/:productId/plans*`) | `ProductPlan` |
| Coupons CRUD + validate | `ProductCouponController` (`/products/:productId/coupons*`) | `ProductCoupon` |
| Commissions CRUD | `ProductCommissionController` (`/products/:productId/commissions*`) | `ProductCommission` |
| Affiliate config / requests / links | `ProductAffiliateController` (`/products/:productId/affiliates*`) | `Product`, `AffiliateRequest`, `AffiliateLink` |
| AI sales config | `ProductAIConfigController` (`/products/:productId/ai-config`) | `ProductAIConfig` |
| URLs (sales pages, chat widget, AI-learning) | `ProductUrlController` (`/products/:productId/urls*`) → `ProductUrlService` | `ProductUrl` |
| Reviews | `ProductReviewController` (`/products/:productId/reviews*`) | `ProductReview` |
| Campaigns | `ProductCampaignController` (`/products/:productId/campaigns*`) | `ProductCampaign` |
| Checkouts | `ProductCheckoutController` (`/products/:productId/checkouts*`) | `ProductCheckout` |
| Category list (distinct) | `ProductCategoriesController` (`/product-categories`) → `ProductCategoriesService` — `backend/src/product-categories/` | `Product` (distinct `category`) |
| Admin cross-workspace view | `AdminProductsController` — `backend/src/admin/products/` | `Product` |

All controllers above are registered in
`backend/src/kloel/kloel.module.ts` (32 `Product*` references).

### Door B — AI / resolver path (this `products/` folder + `plans/`)

AI capability → resolver → **`ProductService` / `PlanService`** → Prisma → DB,
**plus** cognitive-spine + audit emission.

```
agent capability "products.create" / "plans.update"
  -> backend/src/kloel/capability-registry-v2/partitions/tier-1-products.ts (& tier-2-plans.ts)
  -> backend/src/kloel/domain-service-resolver.* (token-map → service+method)
  -> backend/src/products/product.service.ts  ProductService.create(workspaceId, dto, actor)
       actor defaults to { id: 'kloel-resolver' }
  -> assertWorkspaceId(...) ; this.prisma.product.create({ data: { ...dto, workspaceId, status:'DRAFT', active:false } })
  -> eventEmitter.emit('mind.product.observed', ...)         // cognitive spine
  -> audit.log({ action:'product.create', resource:'Product', ... })
  -> brainSpine?.recordCommercial({ eventType:'mind.product.observed', payload: buildCommercialPayload(product) })
  -> { success: true, product }
```

`ProductService` is re-exported from `backend/src/kloel/product.service.ts`
(one-line `export { ProductService } from '../products/product.service'`) so
historic imports keep working. `CheckoutService` (`backend/src/checkout/`) is
the other main consumer of `ProductService`.

`ProductService.update` is **dual-calling-convention**: `update(ws, productId,
dto, actor)` (direct) OR `update(ws, { productId, ...fields })` (resolver). The
many `setPixels / setShipping / setFulfillment / setSalesPage / updateUrls /
toggleAvailabilityFor / reviewAndPublish` methods are thin resolver-shaped
wrappers (`(ws, args)`) that all funnel into `update` so there is one write
path. Pixels/fulfillment overflow lands in the typed `Product.metadata` JSON
slot; the rest writes real columns.

`PlanService` (`backend/src/plans/plan.service.ts`) is the canonical plan write
service for Door B — `create / update / delete` plus fine-grained setters
(`setPaymentMethods / setInstallments / setCoupons / setShipping /
setAffiliateConfig / setOrderBump / setImage`) and `*FromArgs` resolver wrappers
+ `configure`. It scopes every read by `product: { workspaceId }`.

### UI states

`frontend/src/lib/api/products.ts` `productApi` invalidates the SWR `/products`
key after every mutation. The list controller returns `{ products, count }`
(honest empty `[]` for a fresh workspace — no fake data), `get` returns
`{ product }` or 404, mutations return `{ product, success: true }`.

---

## Canonical vocabulary

Cross-checked against `docs/architecture/SERVICE_CATALOG.md` and
`docs/architecture/CAPABILITY_MAP.md`.

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| The sellable item | **Product** (model) / `ProductService` (write service) | `SERVICE_CATALOG.md:209` marks `ProductService` *single canonical*. |
| Priced offer under a product | **ProductPlan** (model) / `PlanService` | `SERVICE_CATALOG.md:210/401` *single canonical*. UI/agent term "plan". |
| Discount code | **ProductCoupon** (`code` unique per product) | Distinct from workspace-level `CheckoutCoupon`; sync helper `syncWorkspaceCheckoutCouponForProduct` mirrors them. |
| Revenue share to partner | **ProductCommission** (role + percentage) | role ∈ COPRODUCER / MANAGER / AFFILIATE. |
| Per-product AI sales brain | **ProductAIConfig** (product-scoped) | NOT the workspace-scoped `AIConfigService` — `CAPABILITY_MAP.md:75` warns they are *not interchangeable*. |
| Sales-page / landing / AI-learn URL | **ProductUrl** / `ProductUrlService` | Canonical domain service used by BOTH controller and agent (anti-pattern 2.2 avoided). |
| Capability prefix (agent) | `products.*`, `plans.*` | tier-1-products.ts / tier-2-plans.ts. |
| Catalog category | **category** (free string on `Product`) | No separate category table — `ProductCategoriesService` returns `distinct category`. |

Lingering aliases / known gaps (from `CAPABILITY_MAP.md`): `get_product_urls`
(deprecated; no `list` on `ProductUrlService`), `products.set_ai_config`
(`ProductAIConfigService` is read-only `get`, lacks `update`),
`products.link_campaign` (no product↔campaign link method exists — flagged
NEEDS IMPLEMENTATION).

---

## Key services & single responsibility

| Service | File | Owns (one line) |
|---|---|---|
| `ProductService` | `backend/src/products/product.service.ts` | Product CRUD + image/publish/availability/delete; emits spine + audit (Door B). |
| `PlanService` | `backend/src/plans/plan.service.ts` | ProductPlan CRUD + price/recurrence/installment/coupon/orderbump setters (Door B). |
| `ProductUrlService` | `backend/src/kloel/product-sub-resources/product-url.service.ts` | The ONE place product-URL mutations run (REST + agent share it). |
| `ProductCategoriesService` | `backend/src/product-categories/product-categories.service.ts` | List distinct active categories for a workspace. |
| `ProductCouponDomainService` | `backend/src/kloel/product-coupon-domain.service.ts` | Coupon delete with audit + checkout-coupon sync. |
| Pure helpers | `backend/src/products/product.helpers.ts` | `buildListWhere`, `resolvePagination`, `buildCommercialPayload`, `assertWorkspaceId` — no I/O. |
| Controller helpers | `backend/src/kloel/product.controller.helpers.ts` | `buildCreateProductData`, `buildUpdateProductData`, `calculateProductStats`, list-where, import counting (Door A). |

---

## Data & events

**Prisma models owned** (all `@@map("RAC_*")`, all live tables confirmed):
`Product`, `ProductPlan`, `ProductCoupon`, `ProductCommission`,
`ProductAIConfig`, `ProductUrl`, `ProductReview`, `ProductCampaign`,
`ProductCheckout`. (`ProductCheckout` is shared with the checkout territory.)

**Events emitted** (commerce domain, see `protocol_hub_asyncapi commerce`):
`commerce.product.created`, `commerce.product.updated`,
`commerce.product.published`, `commerce.product.deleted` — emitted via
`emitCommerceAlias(...)` and the legacy `mind.product.observed` /
`mind.plan.observed` internal events. Each write also calls
`brainSpine?.recordCommercial(...)` to feed the cognitive belief/prediction
cycle, and `audit.log(...)` for the AuditLog trail.

**Events consumed:** none directly in this territory; downstream (checkout,
affiliate, member-area, Mind) consume the product events.

---

## Workspace isolation

Every product is rooted by `Product.workspaceId` (indexed
`@@index([workspaceId, active|category|status])`, unique `@@unique([workspaceId,
sku])`). Sub-resources (Plan/Coupon/Commission/Url/Review/AIConfig/Campaign)
have **no `workspaceId` column** — they inherit it through their `productId`
FK + `onDelete: Cascade`.

Isolation is enforced at the door:

- **Door A (REST):** `@UseGuards(JwtAuthGuard, WorkspaceGuard)` on every
  controller; sub-resource controllers call
  `ensureWorkspaceProductAccess(prisma, productId, getWorkspaceId(req))` which
  does `product.findFirst({ where: { id, workspaceId } })` and 404s if the
  product is not in the caller's workspace. Plan/coupon reads then scope by
  `productId`.
- **Door B (service):** `assertWorkspaceId(...)` then
  `assertOwnedProduct(...)` (Forbidden on cross-workspace) in `ProductService`;
  `PlanService` scopes every query with `product: { workspaceId }`.

---

## Honest status

Brutally honest, backed by live DB row counts (`pg_query`, read-only) and the
canonical artifacts.

**Works end-to-end in production (real data persisted):**

- Product CRUD, list, stats, get, categories, import — `RAC_Product` has **106
  rows** across workspaces. Door A is the proven path (UI → controller → Prisma).
- Plans — **65 rows** in `RAC_ProductPlan`. CRUD wired through both doors.
- Coupons — **58 rows** in `RAC_ProductCoupon`, with cross-product uniqueness
  check + checkout-coupon sync + `validate` endpoint (active/maxUses/expiry).
- URLs — **13 rows** in `RAC_ProductUrl`; single canonical `ProductUrlService`.
- Idempotency on create (name+workspace replay guard); transactions on
  plan/coupon update; audit on deletes.

**Built but unproven / facade-risk (schema + endpoints exist, ZERO production rows):**

- `RAC_ProductCommission` = **0 rows** — commission CRUD wired (and even invites
  partners via `PartnershipsService`), but never exercised in prod.
- `RAC_ProductAIConfig` = **0 rows** — AI sales config endpoint upserts fine,
  but no workspace has configured one. Note: the *agent* capability
  `products.set_ai_config` is broken (read-only service, no `update` — see
  `CAPABILITY_MAP.md:75`).
- `RAC_ProductReview` = **0 rows**, `RAC_ProductCampaign` = **0 rows** —
  endpoints exist; campaign↔product *linking* capability is explicitly NEEDS
  IMPLEMENTATION (`CAPABILITY_MAP.md:85`).

**Architectural debt (real, code-fixable):**

- **Two write doors to the same models.** Door A controllers bypass
  `ProductService`/`PlanService` and hit Prisma directly, so the cognitive-spine
  emit + canonical commerce-event + structured audit only fire when the *agent*
  writes — a human-driven update via the REST controller does NOT emit
  `commerce.product.updated` or feed the Brain. This is the biggest fidelity gap.
- Price is stored as `Float` (`Product.price`, `ProductPlan.price`) — acceptable
  for catalog display but the payments rule (centavos in `bigint`) means
  conversion happens downstream (`priceInCentsOf`). Not a bug here, but a seam.

PULSE: `pulse_health_by_module` returned no pre-scanned products artifact this
session (would need `pulse_scan_module products`), so PULSE evidence is
unavailable rather than green/red — recorded honestly.

---

## Start here

Read these three first and you understand the whole territory:

1. **`backend/src/products/product.service.ts`** — the canonical write service
   (Door B), shows the spine+audit pattern and the dual-calling-convention.
2. **`backend/src/kloel/product.controller.ts`** — the human REST door (Door A),
   the `/products` route surface and direct-Prisma reality.
3. **`backend/prisma/schema.prisma`** lines 1719–2400 — the `Product` model and
   all sub-resources; the relations there ARE the territory's shape.

Then skim `backend/src/kloel/product-sub-resources/` (one controller per
sub-resource) and `frontend/src/lib/api/products.ts` (the client contract).
