# SLICE S5 — Galaxy Educar (Área de Membros) (PARALLEL after S0)

## Escopo
Most favorable case. Real side is 100% ready (`useMemberAreas`→`/member-areas`,
full `AreaMembros*` family with empty/loading/error). Work: (a) builder honest-empty
over `useMemberAreas`; (b) mount the real `AreaMembros` family in the overlay via a
wrapper (the Tab is NOT self-contained — needs props).

## Arquivos (writes — DISJOINT)
- `domains/educar/educar.builder.ts` (body of `buildEducarNodesEdges@421` over REAL
  `areas`; subtitle from list-item counts, NOT `useMemberAreaStats` which is aggregate)
- `domains/educar/educar.data.ts` (adapter `useMemberAreas`/`useMemberAreaStats` →
  `DisplayArea[]`+totalStudents/avgCompletion/productOptions; reuse ProdutosView's shape)
- `domains/educar/EducarOverlayPanel.tsx` (wrapper mounting `ProdutosAreaMembrosTab
  ({totalStudents,displayAreas,avgCompletion,mutateAreas:mutate,productOptions})`)
- `domains/educar/screens.ts` (SCREEN_BY_TYPE: memberArea→EducarOverlayPanel)

## Reads-only
`ProdutosAreaMembrosTab.tsx` + `AreaMembros{List,Overview,Students,Editor}Panel.tsx`,
`useMemberAreas.ts`, ProdutosView (where `DisplayArea[]` is assembled).

## Node → data
`buildEducarNodesEdges@421` over `educar.areas` from `useMemberAreas` (NOT
`MEMBER_AREAS_SEED@390`). Per area: `id=ma-${a.id}`, label=a.name, subtitle from REAL
counts. loading/empty/error → only `eu-ensinar` parent. Abandon `areaStats` on the
node path; aggregate stats go to the Overview panel only.

## Overlay → component
`memberArea`→`EducarOverlayPanel` (wrapper) → `ProdutosAreaMembrosTab` with all
required props. The wrapper is MANDATORY (Tab is prop-driven, uses
`useMemberAreaMutations` internally but does NOT list via `useMemberAreas`).

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on `domains/educar/*`.
2. Confirm which node-build path the live shell uses (static-nodes TS vs `.jsx`
   builder) before plugging the builder. ⚠️ codegraph index STALE (phantom
   `EducarScreen`) — read the file directly.
3. Build adapter + wrapper; mount Tab in overlay (no restyle).
4. honest-empty; byte-identity gate + tsc/eslint/vitest.
5. release + small commit.

## Stop conditions
Ambiguous node-build path unresolved by reading · DECISÃO unresolved.

---
@import _PLAYBOOK.md
