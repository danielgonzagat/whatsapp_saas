# SLICE S1 — Galaxy Perfil + Dashboard (PARALLEL after S0)

## Escopo
Wire the Perfil + Dashboard cluster to real data. Map verdict: **already
structurally done** on the route-based path; remaining work is honest-empty
verification + (optional) entity-level nodes. In state-based (B), register the
perfil/dashboard screens into `SCREEN_BY_TYPE`.

## Arquivos (writes — DISJOINT)
- `domains/perfil/perfil.builder.ts` (body of `buildProfileNodesEdges@570`; keep
  `if`-gates; honest-empty)
- `domains/perfil/perfil.data.ts` (adapter → `useDashboardHome`/`useDashboardPostPayment`;
  profile via ContaView's hook / `onboarding-profile.controller.ts`)
- `domains/perfil/screens.ts` (SCREEN_BY_TYPE entries: profileSection/appNode→ContaView;
  dashboard→HomeView+DashboardPostPaymentPanel)

## Reads-only
`ContaView.tsx`, `HomeView.tsx`, `DashboardPostPaymentPanel`, `KloelGraph.static-nodes.ts`,
`useDashboardHome.ts`.

## Node → data
- perfil sun + children = STATIC route nodes (NO seed). `DEFAULT_ACCOUNT_DATA` does
  NOT exist — do not invent it.
- dashboard: `/dashboard/home`, `/dashboard/post-payment`, `/dashboard/stats` (all
  confirmed in `dashboard.controller.ts`).

## Overlay → component
perfil→`ContaView` (self-fetch); dashboard→`HomeView`+`DashboardPostPaymentPanel`
(real, honest-empty `'Nenhum evento pós-pagamento registrado'`).

## PROTOCOLO POR FATIA
1. STEP 0 verify: read `ContaView.tsx` (sections cover the 8 PROFILE_SECTIONS;
   self-fetches real profile, not a seed) + `HomeView.tsx` (no seed fallback).
2. `task_lock_acquire` on `domains/perfil/*` only.
3. honest-empty check: if HomeView/ContaView fall back to any seed → make it
   zero/`--`/empty-state.
4. (optional) entity-level perfil/consultar nodes: typed builder fed by real hooks,
   honest-empty, merged like product nodes — do NOT resurrect `.jsx` builders.
5. Byte-identity gate (domain) + `run_tsc`/`run_eslint`/affected vitest.
6. `task_update` + release + small commit.

## Stop conditions
ContaView/HomeView read seed and fixing requires a protected file · DECISÃO unresolved.

---
@import _PLAYBOOK.md
