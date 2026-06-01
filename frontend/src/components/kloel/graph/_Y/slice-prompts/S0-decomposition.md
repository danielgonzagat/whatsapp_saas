# SLICE S0 — Decomposition + byte-identity gate (SERIAL, Fase 0)

> RUN FIRST AND ALONE. No galaxy starts until this is byte-identity GREEN.
> Blocked until the owner resolves DECISÃO (state-based Opção C vs route-based A).

## Escopo
Carve the LITERAL `KloelGraphPrototype.jsx` (6576 lines, `whatsapp_saas-kg` /
`docs/ai/assets/kloelgraph-harness.html`) into per-domain modules WITHOUT changing
rendered output. Ship the byte-identity gate. Leave `SCREEN_BY_TYPE` empty (filled
by galaxies, wired in S8).

## Arquivos (writes)
- `engine/KloelGraphEngine.ts` (buildGraph@924, applyFilters@1094, computeLayout@1118,
  computeGalaxyAnchors@1188, nodeRadius@1218, physicsTick@1223 — PURE)
- `engine/KloelGraphCanvas.tsx` (GraphCanvas@3968, FloatingNav@4281, SettingsPanel@3902,
  ThemeToggle@4271, THEMES/ThemeProvider/FONT/MONO@12-53)
- `overlays/KloelGraphOverlayChrome.tsx` (KloelOverlay@5796)
- `overlays/KloelGraphNodePanel.tsx` (NodePanel@4441 router + AppNodePanel@3886 +
  KloelOverlayRouter@6077 + CoreSettingsPanel@5258; **empty** `SCREEN_BY_TYPE`)
- `state/useKloelGraphState.ts` (KloelInner@6287 + patch* + dynamicGraph@6392)
- `seeds/KloelGraph.seeds.ts`, `seeds/KloelGraph.builders.ts`, `seeds/KloelGraph.domain-constants.ts`
- `domains/<name>/` empty skeletons for all 7 galaxies
- `__tests__/KloelGraph.byte-identity.spec.ts`

## Reads-only
`KloelGraphPrototype.jsx` (literal), `docs/ai/assets/kloelgraph-harness.html`,
`docs/ai/KLOELGRAPH_CANONICAL_SCREEN_MAP.md`.

## PROTOCOLO POR FATIA
1. Confirm DECISÃO resolved (else STOP). Confirm canonical worktree = `whatsapp_saas-kg`.
2. `task_lock_acquire` on ALL graph-dir files (S0 owns the whole seam this phase).
3. Carve in ORDER (gate after EACH):
   (a) seeds + builders + domain-constants — byte-neutral by builder OUTPUT
   (b) engine pure — prove byte-identity of the GRAPH
   (c) Canvas / chrome — visual
   (d) NodePanel router shell with EMPTY SCREEN_BY_TYPE
   (e) KloelInner → state LAST (largest blast radius)
4. Byte-identity gate after each step: serialize per node `{id,parentId,type,label,
   subtitle,area,pos}` sorted `(area,parentId,id)`, FIXED SEED (zero `Math.random`
   @defaultPlan:123, fix alpha/t @physicsTick:1223), diff vs `harness.html`.
5. Chrome devtools pixel diff (full graph) GREEN.
6. `run_tsc` + `run_eslint` clean on carved modules (drop `@ts-nocheck`).
7. `task_update` + `task_lock_release`. Small commit per carve step.

## Stop conditions
DECISÃO unresolved · byte diff non-empty after a step · protected file required ·
another agent holds a lock on the seam.

---
@import _PLAYBOOK.md
(Embed `_PLAYBOOK.md` integral here when dispatching.)
