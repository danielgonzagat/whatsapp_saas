# SLICE S3 — Galaxy Criar / Produtos (PARALLEL after S0)

## Escopo
Map verdict: **core already live** on the route-based engine (`useProducts` →
`mergeGraphProducts` → `buildKloelGraphProductNodes`; honest-empty by construction;
every product/`p_*`/plan/checkout/new node routes to a real screen). The ONLY
residual is real per-tab COUNT badges (optional). In state-based (B), register the
product screens into `SCREEN_BY_TYPE`.

## Arquivos (writes — DISJOINT)
- `domains/criar/product-nodes.ts` (body of `KloelGraph.product-nodes.ts`:
  `buildKloelGraphProductNodes@20`, `buildPlanGraphNodes@61`, `buildCheckoutGraphNodes@101`,
  9 nerve tab nodes@46-55)
- (optional) `domains/criar/useProductNerveCenter.ts` (SWR over `GET /products/:id/nerve-center`)
- (optional) `domains/criar/product-counts.ts` (adapter → per-tab subtitle counts, honest-empty)
- `domains/criar/screens.ts` (SCREEN_BY_TYPE: product/`p_*`→ProductNerveCenter; checkout→route)

## Reads-only
`ProdutosView.tsx`, `ProductNerveCenter*`, `/products/*` routes, `useProducts.ts`,
`lib/api/products.ts`.

## Node → data
Top-level product nodes: DONE + honest-empty (`buildKloelGraphProductNodes([])→[]`).
Per-tab counts: ONLY residual; need `useProductNerveCenter` (absent) + adapter; omit
counts while loading/error; NEVER from `defaultProductEditor`.

## Overlay → component
product/`p_*`→`/products/:id?tab=<id>`→`ProductNerveCenter({productId,initialTab,
initialPlanSub,initialComSub,initialModal,initialFocus,onBack})`; plan→`/products/:id/plans/:planId`;
checkout/order-bump→`/checkout/:id?focus=...`; new→`/products/new` wizard. Nerve-tab
1:1 deep-link round-trips via `resolveProductNode` (routes.ts L118-139).

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/criar/*` ONLY (do NOT touch shared routes/shell;
   8 worktree agents hold locks on `products.ts`/`ProductNerveCenterRoot`/`product-nerve-tabs.const.ts`).
2. If counts in scope: confirm `GET /products/:id/nerve-center` exists; build hook+adapter;
   thread counts into the 9 tab subtitles.
3. Byte-identity gate + tsc/eslint/vitest.
4. release + small commit.

## Stop conditions
`/products/:id/nerve-center` absent (drop counts, not a blocker) · real-screen edit
needed (coordinate with the 8 locked agents) · DECISÃO unresolved.

---
@import _PLAYBOOK.md
