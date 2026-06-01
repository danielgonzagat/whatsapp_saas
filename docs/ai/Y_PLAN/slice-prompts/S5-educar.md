# SLICE S5 — EDUCAR: Área de membros (Aprender/Ensinar) entity nodes

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
Node `educar`→`/produtos/area-membros` is ALREADY wired and the overlay renders the real
ProdutosAreaMembrosTab (+ AreaMembros* panels) and preview screens. Delta = ADDITIVE: derive
per-member-area ENTITY nodes from real data, mirroring products. The prototype's
`MEMBER_AREAS_SEED`/`areaStats`/`buildEducarNodesEdges`/`eu-aprender`/`eu-ensinar` live ONLY
in `KloelGraphPrototype.jsx` — DO NOT wire to them.

## ARQUIVOS A EDITAR (body of the S0-created stub — your own file, no chokepoint)
- `frontend/src/components/kloel/graph/educar-graph-adapter.ts` — S0 created this as an EMPTY
  STUB exporting `buildEducarGraphNodes` returning `[]`; you FILL the body:
  `buildEducarGraphNodes(areas, stats): KloelGraphNode[]` from `useMemberAreas()`+
  `useMemberAreaStats()`; per area → node `id:'ma-<id>'`, parentId `educar`, subtitle from stats.
  **Plain-branch route only** (`/produtos/area-membros`) until S9 lands; record `?areaId=` in
  the receipt if a drilldown is wanted later. Endpoints `/member-areas/*` (NEVER `/api/member-area/*`).

## ARQUIVOS A CRIAR
- `frontend/src/components/kloel/graph/educar-graph-adapter.spec.ts` — empty/loading/error/404 → `[]`
  (never throw, never seed).

## ARQUIVOS READ-ONLY (consume)
`frontend/src/hooks/useMemberAreas.ts`, `frontend/src/lib/api/member-area.ts`,
`frontend/src/lib/api/member-area-public.ts`, `ProdutosAreaMembrosTab.tsx` + `AreaMembros*` panels,
`area-membros/preview/[areaId]/*`, `(public)/area/[slug]/page.tsx`.

## DO NOT EDIT
Chokepoints (S0 wires the educarNodes slot), `KloelGraphOverlay.tsx`, `KloelGraphPrototype.jsx`.
NOTE: endpoints are `/member-areas/*` and `/member-areas/public/{slug}/*` (NEVER `/api/member-area/*`).

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on your OWN stub file + its spec (no chokepoint — S0 already created the
   stub and wired the Shell slot; you only fill the body).
2. Anchor: `codegraph_node` on `buildKloelGraphProductNodes` (shape ref), `useMemberAreas`,
   `useMemberAreaStats`; `protocol_hub_openapi` to confirm `/member-areas`, `/member-areas/stats`.
   Optional `pg_query` read-only for MemberArea rows.
3. FILL the S0 stub body via `atomic_edit_symbol`/`atomic_replace_body`; structure-match the
   product builder. `atomic_create_file` the spec. Assert hook error / 404 / loading /
   200-zero-rows ALL yield zero educar nodes (never throw to Shell, never seed).
4. Gate: `run_tsc` + `run_vitest`/`run_jest` on the spec + `affected_tests` — real output.
5. Chrome (after S0 wires slot): navigate, expand educar → real member areas appear; click one →
   overlay shows ProdutosAreaMembrosTab; open a preview node → MemberAreaContent/Skeleton. Empty
   backend → only `educar` node with honest "Nenhuma área ainda" subtitle. `take_screenshot`.
6. PULSE clean. Release locks. Commit `feat(educar): real-data member-area entity nodes`.

## REGRAS
- Honest empty: 0 areas / loading / error → emit ZERO entity nodes; reuse `MemberAreaSkeleton`
  inside the real screen for loading. Never inject `MEMBER_AREAS_SEED`.
- If Y requires visible Aprender-vs-Ensinar sub-branches (prototype `eu-aprender`/`eu-ensinar`),
  that is NEW static-node work → DELEGATE the static-nodes edit to S0; do not touch the chokepoint.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/click/take_screenshot/list_network_requests; PULSE pulse_scan_module; RUNTIME
postgres pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy / editar
protegidos.)
