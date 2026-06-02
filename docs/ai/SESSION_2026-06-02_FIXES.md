# Session 2026-06-02 — graph-recovery ship + product hardening

Branch `feat/kloelgraph-prototype-engine` → **PR #484** (base `main`).

## Delivered + verified live (real stack, magic-link login, Postgres `whatsapp_saas`, ws c16d5176)

1. **Shipped PR #484** — the 23-commit branch (never previously pushed) is on origin; full
   pre-push gauntlet green. Fixed the visual-contract blockers for real (hex→`rgb()` in
   `KloelGraphTheme`, pill/circle radii → `GRAPH_RADIUS` const, removed dead
   `KloelGraphPrototype.jsx`). All accumulated working-tree state consolidated into the PR.
2. **`fix(mind)`** — created missing `RAC_MindSelfModel` table (migration
   `20260602130000`). `MindProcessorService.snapshot()` had crashed every ~30s
   ("table does not exist"). Verified: 0 errors after apply, 8 snapshots written.
3. **`fix(sites)`** — created missing `RAC_Site` / `RAC_SiteDomain` / `RAC_SiteAppIntegration`
   tables + enums (migration `20260602130100`). `GET /sites` was **500 → 200**. Resolved
   ALL remaining schema↔DB drift (`prisma migrate diff` now empty).
4. **`fix(api)`** — a 287-route GET sweep found 5 endpoints returning **500** (a crash, not an
   honest state). All now return honest codes: `autopilot/next-best-action` 400 (missing param);
   `marketing/connect/google-ads/url` 503, `/customers` 400, `tiktok/url` 503 (unconfigured
   provider); `kloel/whatsapp` webhook verify 503. Verified live on a clean build.
5. **Régua (live, real DB):** product create+update→persist→reload; CRM deal create→persist;
   KYC profile no-secret-leak; CNPJ lookup returns real BrasilAPI data (UA fix); products 400
   on invalid price. The product engine is real (create → DB → persisted → reload reflects).

Sweep summary: **287 GET routes — 206×2xx, 0×404, 5×500 (all fixed)**. The 401/400/403/302/503
remainder are expected (admin auth, provider-setup-required, OAuth callbacks).

## NEXT (fully scoped — top verified gap from the parallel module audit)

**Checkout order bumps are unwired (CRITICAL).** Bumps configured by the seller are fetched
but never rendered or submitted, so upsells are impossible at checkout.

- **Already exists:** `components/OrderBumpCard.tsx` (full UI), bumps fetched into the plan
  (`CheckoutShell.tsx:163` `orderBumps: data.orderBumps`), `useCheckout.ts` `CreateOrderData`
  already has `acceptedBumps?: string[]` + `bumpTotalInCents?`. **Backend is
  server-authoritative**: `checkout-order.service.ts` computes `serverTotals` + builds bump
  line items server-side from `acceptedBumpIds` (`checkout-order-support.ts:131-176`) — so the
  charge cannot be wrong from the client; the frontend only needs to send the selected IDs.
- **Missing wiring (frontend only):**
  1. `useCheckoutExperience.ts` (531-line hook): add `selectedBumpIds` state + `toggleBump`,
     compute `bumpTotalInCents` from `plan.orderBumps` ∩ `selectedBumpIds`, add it into the
     displayed total (`useCheckoutExperience.helpers.ts:computeTotal`, line 173), and pass
     `acceptedBumps` + `bumpTotalInCents` into `buildOrderPayload` (call sites lines 326, 452).
  2. `checkout-order-submit.ts`: add `acceptedBumps?: string[]` + `bumpTotalInCents?` to
     `FinalizeCheckoutOrderArgs` (line 42) and include them in `buildOrderPayload`'s output (line 104).
  3. Render `<OrderBumpCard>` per `plan.orderBumps` in the payment step (Blanc + Noir variants)
     wired to `selectedBumpIds`/`toggleBump`.
  4. Repeat for the social path (`useCheckoutExperienceSocial`).
- **Validation:** extend `checkout-order-submit.test.ts` (assert `acceptedBumps` reaches the
  payload) + a component test (toggle bump → total updates). Then live E2E with a
  bump-configured product. **Not shipped this session** because it is the revenue/payment path
  and could not be E2E-validated without a browser (REGRA DE PAGAMENTOS / REGRA DE EVIDÊNCIA).
- **Not a bug:** seller-configured `fakeStockCount` (`CheckoutThemePage.tsx:77`) is a deliberate
  scarcity setting the seller chooses, not system-invented fake data — left as-is.
