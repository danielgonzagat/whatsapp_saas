# SLICE S4 — CRIAR: Produtos + ProductNerveCenter (10 abas) + wizard

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
Product/plan/checkout/order-bump nodes are ALREADY data-driven and LIVE
(`buildKloelGraphProductNodes` ← `useProducts` + `/checkout/products`); the overlay already
renders `/products/[id]` (ProductNerveCenter, 10 real tabs) + `/products/new` wizard. This
slice = VALIDATE E2E + close 3 gaps, NOT build.
- **GAP-1 (tab consistency):** align `PRODUCT_GRAPH_TABS` (KloelGraph.product-nodes.ts, 10 incl
  `checkouts`) with `PRODUCT_NERVE_TABS` (`product-nerve-tabs.const.ts`). RUN
  `product-nerve-tabs.graph-contract.spec.ts`; if divergent, align (minimal, keep order/labels).
- **GAP-2 (honest loading):** optional honest "carregando produtos…"/error indicator for product
  nodes while `useProducts` loads — DELEGATE the shell edit to S0 (do not touch the chokepoint).
- **GAP-3 (EN/PT):** node `criar`→`/products` vs `criar-produtos-legacy`→`/produtos`. Confirm
  canonical with owner; do NOT duplicate the experience.

## ARQUIVOS A EDITAR (exclusivo — only the failing/mock surface)
- `frontend/src/components/kloel/products/ProductNerveCenter{Aval,AfterPay,Campanhas,IA}Tab.tsx`
  — ONLY a tab that still renders internal mock → convert to setup-required/empty honest state
  (read its `.hooks.ts` first to know if a backend exists). If all real, edit NOTHING.
- `frontend/src/components/kloel/products/product-nerve-tabs.const.ts` — ONLY if GAP-1 confirms
  divergence; align, do not weaken (it is UI-config, protected by intent).
RUN/UPDATE: `product-nerve-tabs.graph-contract.spec.ts` (only if the legit contract changes).

## DO NOT EDIT
`KloelGraph.product-nodes.ts` (read-only reference), chokepoints (GAP-2 delegated to S0),
`KloelGraphPrototype.jsx`.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on each tab file you actually edit.
2. Anchor: `codegraph_node` on `buildKloelGraphProductNodes`, `PRODUCT_NERVE_TABS`,
   `PRODUCT_GRAPH_TABS`; `code_read_symbol` each Aval/AfterPay/Campanhas/IA tab + its `.hooks.ts`;
   `protocol_hub_openapi` to confirm which `/products/:id/...` sub-endpoints exist.
3. RUN `run_jest`/`run_vitest` on `product-nerve-tabs.graph-contract.spec.ts` FIRST — it tells
   you if GAP-1 is real.
4. Edit only confirmed-mock tabs via `atomic_edit_symbol` → honest setup-required/empty.
5. Gate: `run_tsc` + `run_eslint` + `affected_tests`.
6. Chrome: backend up → navigate, confirm real products appear as nodes (0 products → only
   `criar` node, honest empty); click product → overlay shows ProductNerveCenter; cycle the 10
   tabs (verify each mock tab's loading/empty/error/success honest states); open `/products/new`
   wizard. `take_screenshot` + `list_network_requests` (verify `/products`, `/checkout/products`,
   `/products/:id/urls`, `/products/:id/coupons` fire). Un-bootable live check →
   EXTERNAL_BLOCKED + substitute evidence, never green-by-absence.
7. PULSE clean. Release locks. Commit `fix(criar-produtos): align tabs + honest states, validate E2E`.

## REGRAS
- Prefer ZERO module creation. Every edit additive and minimal. Never seed.
- KloelGraphShell is a multi-worktree chokepoint — GAP-2 is S0's edit, never yours.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/click/take_screenshot/list_network_requests/list_console_messages; PULSE
pulse_scan_module; RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify /
relaxar Codacy / editar protegidos.)
