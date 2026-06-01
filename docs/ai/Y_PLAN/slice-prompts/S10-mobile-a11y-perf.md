# SLICE S10 — MOBILE / A11Y / PERF

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0–S9. CONCORRÊNCIA: serial (touches shared canvas/overlay; a11y/perf only).

## SCOPE SPLIT WITH S1 (per-node vs overlay a11y)
S1 (Fase 1) owns the **per-NODE** a11y (role / aria-label / tab-order on
`KloelGraphNodeButton.tsx`) and ran before this phase, so its NodeButton lock is
already released. S10 owns the **OVERLAY** a11y (focus-trap, aria-modal, ESC,
focus-return). On NodeButton, S10 touches ONLY aria attributes NOT already handled by S1.

## OVERLAY DO-NOT-EDIT EXCEPTION (single written authorization)
`KloelGraphOverlay.tsx` is otherwise DO-NOT-EDIT (Anti-collision law §3). **This
prompt is the sole written authorization** for S10 to edit it, and ONLY for:
adding `aria-*` / `role` / `tabindex` attributes, a focus-trap, and a
`prefers-reduced-motion` guard. **Forbidden:** any change to style, layout, markup
structure, copy, or visible DOM. S10 MUST prove **zero visual diff** (pre/post
screenshot identical) as a slice gate — otherwise the protected visual-design
contract gate will (correctly) block S10.

## ESCOPO EXATO
Harden the live graph for mobile, accessibility, and performance WITHOUT changing the desktop
visual contract:
- **Mobile:** overlay 80vw×80vh already uses `min(...)` caps; verify it is usable on small
  viewports (scroll, reachable close button, canvas pan/zoom on touch). Add responsive
  refinements ONLY where broken — no desktop visual change.
- **A11y:** overlay already `role=dialog aria-modal aria-label`; add focus trap, ESC (verify),
  focus-return-to-node-on-close, `prefers-reduced-motion` for canvas animation, keyboard nav of
  nodes (KloelGraphNodeButton already has keyboard handling — verify + aria-label per node).
- **Perf:** memoize node-source outputs (galaxies already `useMemo`); verify large node counts
  (many products/conversations) don't jank; lazy-defer offscreen node work if needed.

## ARQUIVOS A EDITAR (additive, lock each — shared)
- `frontend/src/components/kloel/graph/KloelGraphOverlay.tsx` — A11Y ADDITIONS ONLY per the
  WRITTEN EXCEPTION above (aria/role/tabindex + focus-trap + reduced-motion; ZERO visual diff,
  screenshot-proven). CHOKEPOINT — lock + minimal.
- `frontend/src/components/kloel/graph/KloelGraphShell.tsx` — PERF ONLY (memoization, touch
  handlers if missing). CHOKEPOINT — lock + minimal.
- `frontend/src/components/kloel/graph/KloelGraphNodeButton.tsx` — overlay-related aria ONLY
  (per-node role/aria-label/tab-order already done by S1).
- CREATE perf/a11y/mobile-gesture specs under the graph dir.

## DO NOT EDIT
`KloelGraphTheme.tsx` (visual), `KloelGraphPrototype.jsx`. No change that alters desktop pixels.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`. Capture a BASELINE desktop screenshot of
   the Overlay + a perf baseline (assembled-graph render time; node count at which pan/zoom jank
   starts) so "no worse" is falsifiable.
1. `task_lock_acquire` + `atomic_lock_acquire` on each shared file before editing; **verify**
   the grant. S1's NodeButton lock is already released (Fase 1).
2. Anchor: `code_outline` overlay + shell + node button; `codegraph_callers` to gauge node-count
   blast radius.
3. Edit additively via `atomic_edit_symbol`. Overlay edits = aria/role/tabindex ONLY (zero
   visual change, per the written exception).
4. **Mobile spec:** define the numeric breakpoint (e.g. `< 768px` = mobile overlay mode) and the
   gesture model — **one-finger drag = pan, two-finger pinch = zoom** — proven by a touch E2E
   that distinguishes each gesture.
5. **Perf target:** memoize node sources; set a falsifiable target (assembled-graph render ≤
   captured baseline; documented node-count ceiling before virtualization; pan/zoom FPS) and
   assert against the baseline.
6. Gate: `run_tsc` + `run_eslint` + `run_vitest`/`run_jest` + `affected_tests` — real output.
7. Chrome: `mcp__chrome-devtools__emulate`/`resize_page` to the mobile breakpoint → overlay
   usable, one-finger pan vs two-finger pinch-zoom distinct; `lighthouse_audit` for Performance +
   Accessibility (a11y ≥ baseline); keyboard-only nav (`press_key` Tab/Enter/Escape) → focus trap
   + ESC close + focus return work; reduced-motion respected. `take_screenshot` desktop vs mobile;
   Overlay pre/post screenshot identical (zero visual diff). Un-bootable live check →
   EXTERNAL_BLOCKED + substitute, never green-by-absence.
8. PULSE clean. Release locks. Commit `perf(kloelgraph): mobile + a11y + perf hardening`.

## REGRAS
- Desktop visual MUST stay byte-identical (snapshot/screenshot diff = empty); Overlay pre/post
  screenshot identical. A11y/perf are additive.
- Mobile breakpoint is numeric; pan/zoom gestures specified + E2E-proven.
- Perf "no worse" is falsifiable against the captured baseline (render time + node-count ceiling).
- No `Math.random`, no new headers, no restyle of inner screens.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/emulate/resize_page/lighthouse_audit/press_key/take_screenshot; PULSE pulse_scan_module;
RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy /
editar protegidos.)
