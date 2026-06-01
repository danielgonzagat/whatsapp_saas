# SLICE S1 — NODE BADGES + NODE-CANVAS A11Y (honest live counts on the 6 suns)

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0 (registry seam + optional badge field on sun descriptors).
ORDER: **S1 < S10 on NodeButton** — S1 is Fase 1, S10 is Fase 3; phase order
guarantees S1 < S10. S1 must RELEASE its NodeButton lock before Fase 3 begins.

## ESCOPO EXATO
Two things, both on `KloelGraphNodeButton.tsx`:
1. **Honest live-count badges** on the 6 non-product suns (perfil, criar, afiliar, educar,
   conectar, consultar, kloel) — e.g. wallet saldo, conversas count, afiliados count —
   loading (SWR `isLoading`), empty (`0` / "Nenhuma venda ainda"), error (degraded `--`).
   Preserve the node circle+label visual EXACTLY. Never a seed.
2. **Per-node a11y** (S1 owns NodeButton, so it owns node a11y): stable `role`, accurate
   `aria-label` (node name + live count when a badge is present), correct keyboard
   **tab-order** across the node canvas. S10 owns the OVERLAY a11y (focus-trap/aria-modal);
   S1 owns the NODE a11y — no overlap.

## ARQUIVOS A CRIAR
- `frontend/src/lib/kloel-graph/useGraphNodeBadges.ts` — thin SWR aggregation hook fanning out
  `useWallet` (saldo), `useDashboardHome` (desempenho), `conversations`, `usePartnerships`
  into per-sun counts. Reuse `swrFetcher`/`apiFetch`.
- `frontend/src/lib/kloel-graph/useGraphNodeBadges.spec.ts`.

## ARQUIVOS A EDITAR (serial on NodeButton; S0 already released it, S8/S10 are later phases)
- `frontend/src/components/kloel/graph/KloelGraphNodeButton.tsx` — (1) render optional `badge`
  with honest loading/empty/error; preserve circle+label geometry, colors, hover; (2) add
  per-node `role`, accurate `aria-label` (name + live count when badged), correct keyboard
  tab-order — no visual/geometry change.

## DO NOT EDIT
`KloelGraphShell.tsx` structure (S0 wires the hook), `KloelGraphTheme.tsx`,
`KloelGraphOverlay.tsx`, `KloelGraphPrototype.jsx`.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` + `atomic_lock_acquire` on `KloelGraphNodeButton.tsx`; **verify** the
   grant (S0 already released it; S8/S10 are later phases — no concurrent owner).
2. Anchor: `codegraph_node` on `KloelGraphNodeButton`, `useWallet`, `useDashboardHome`,
   `usePartnerships`; `code_outline` the NodeButton to find the label render site.
3. Build hook with `atomic_create_file`; edit NodeButton with `atomic_edit_symbol` (additive):
   badge render + per-node role/aria-label/tab-order.
4. Gate: `run_tsc` + `run_vitest`/`run_jest` on NodeButton + hook specs + an a11y spec
   (role/aria-label/tab-order); `affected_tests`. Desktop snapshot byte-identical.
5. Chrome: navigate, `take_screenshot` of a sun with badge in loading vs loaded vs error
   (force error by blocking the endpoint) — confirm geometry unchanged.
6. PULSE clean. Release locks. Commit `feat(kloelgraph): honest live-count node badges + node a11y`.

## REGRAS
- Badge is OPTIONAL polish. If a count has no real backend, render NOTHING (not `0`-as-seed).
- Geometry/visual of the node MUST be byte-identical (snapshot) when no badge present.
- Per-node a11y is additive — role/aria-label/tab-order add no visual change.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco PLAYBOOK DE MCPs em `S0-fundacao.md` — READ: codegraph/code_outline/
cognitive-hub/lsp-mesh; ACT: task-graph/atomic locks; EDIT: atomic-edit DEFAULT; VERIFY:
test-runner run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME: chrome-devtools
navigate/take_screenshot/list_console_messages; PULSE: pulse_scan_module; RUNTIME:
postgres pg_query read-only + railway get_logs. NUNCA --no-verify, NUNCA relaxar Codacy,
NUNCA editar protegidos.)
