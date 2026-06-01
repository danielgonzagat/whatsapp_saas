# SLICE S3 — AFILIAR (marketplace + meus afiliados entity nodes)

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
The afiliar sun + its 4 fixed sub-nodes are ALREADY wired to real routes that render real
screens (AfiliarSe, ParceriasShell) in the overlay. The delta is PURELY ADDITIVE: render the
afiliar branch's **marketplace-product** and **partner** ENTITY nodes from real data, exactly
the way products already do. The dead prototype `buildAffiliateNodesEdges`/`MARKETPLACE_SEED`/
`MY_AFFILIATES_SEED` live ONLY in `KloelGraphPrototype.jsx` — DO NOT wire to them.

## ARQUIVOS A EDITAR (body of the S0-created stub — your own file, no chokepoint)
- `frontend/src/components/kloel/graph/KloelGraph.affiliate-nodes.ts` — S0 created this as an
  EMPTY STUB exporting `buildKloelGraphAffiliateNodes` returning `[]`; you FILL the body:
  `buildKloelGraphAffiliateNodes(marketplace, myAffiliates): KloelGraphNode[]`, mirroring
  `KloelGraph.product-nodes.ts`. parentId `afiliar-marketplace` (per product), parentId
  `afiliar-afiliados` (per partner). **Plain-branch routes only** (`/produtos/afiliar-se`,
  `/parcerias/afiliados`) until S9 lands; record `?productId=`/`?affiliateId=` in the receipt
  if a drilldown is wanted later.

## ARQUIVOS A CRIAR
- `frontend/src/components/kloel/graph/KloelGraph.affiliate-nodes.spec.ts` — empty input → `[]`;
  non-empty → correct parentId/route/shape; **error/404/loading → `[]`** (never throw, never seed).

## ARQUIVOS READ-ONLY (consume)
`frontend/src/lib/api/affiliate.ts` (`affiliateApi.marketplace()`), `frontend/src/hooks/usePartnerships.ts`
(`useAffiliates`), `ProdutosAfiliarSeTab.tsx`, `parcerias/ParceriasShell.tsx`.

## DO NOT EDIT
Chokepoints (S0 wires the SWR + spread into `graphNodes` via the affiliateNodes slot).
`KloelGraphPrototype.jsx` (dead reference).

## SCOPE TRAP
Two "marketplace" surfaces: **affiliate marketplace** (`affiliateApi.marketplace` →
`/affiliate/marketplace`, THIS domain) vs **template marketplace** (`lib/api/marketplace.ts` →
`/marketplace/templates`, NOT this domain). Use the affiliate one.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on your OWN stub file + its spec (no chokepoint — S0 already created the
   stub and wired the Shell slot; you only fill the body).
2. Anchor: `codegraph_node` on `buildKloelGraphProductNodes` (copy its shape), `affiliateApi`,
   `useAffiliates`; `protocol_hub_openapi` to confirm `/affiliate/marketplace`,
   `/partnerships/affiliates`. Optional `pg_query` read-only to confirm AffiliateProduct rows.
3. FILL the S0 stub body via `atomic_edit_symbol`/`atomic_replace_body`; structure-match the
   product builder exactly. `atomic_create_file` the spec. Assert hook error / 404 / loading /
   200-zero-rows ALL yield zero affiliate nodes (never throw to Shell, never seed).
4. Gate: `run_tsc` + `run_vitest`/`run_jest` on the new spec + `affected_tests` — real output.
5. Chrome (after S0 wires the slot): navigate, expand afiliar → confirm real marketplace
   products + partners appear as nodes; click one → overlay shows AfiliarSe/Parcerias real
   screen. Empty backend → only the 4 static labels (honest). `take_screenshot`.
6. PULSE clean. Release locks. Commit `feat(afiliar): real-data marketplace + affiliate entity nodes`.

## REGRAS
- Honest empty: 0 marketplace products or 0 affiliates → emit ZERO entity nodes (static branch
  stays navigable). On error → emit ZERO. Never import `MARKETPLACE_SEED`/`MY_AFFILIATES_SEED`.
- Builder is a pure function; all loading/empty/error is owned by AfiliarSe/ParceriasShell.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests/coverage_for_module; CHROME
chrome-devtools navigate/take_snapshot/take_screenshot/list_network_requests; PULSE
pulse_scan_module; RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify /
relaxar Codacy / editar protegidos.)
