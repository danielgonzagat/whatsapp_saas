# SLICE S8 — Overlay / routing / deep-linking (SERIAL, after all galaxies GREEN)

## Escopo
Wire the per-domain `SCREEN_BY_TYPE` entries (registered by S1–S7) into the single
`overlays/KloelGraphNodePanel.tsx` router; finalize overlay lifecycle + deep-linking.

## Arquivos (writes)
- `overlays/KloelGraphNodePanel.tsx` (assemble `SCREEN_BY_TYPE` from all `domains/*/screens.ts`)
- `KloelGraphShell.tsx` (mount point — state-based B vs route-based A wiring)
- `KloelGraph.routes.ts` (path↔node resolver if route-based / URL-sync if state-based)

## Reads-only
all `domains/*/screens.ts`, `KloelGraphOverlay*`.

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on the 3 shared files (S8 owns them this phase).
2. Decision-dependent:
   - **B (state-based):** `KloelOverlayRouter@6074` single mount; select by
     `selectedNode.type`; URL-sync so deep links select the right node; NO new routes.
     Provider check: file-local `useTheme@43-53` vs `@/lib/design-tokens` compose fine;
     SSE/auth via global `tokenStorage`/`API_BASE` under `(main)`.
   - **A (route-based):** keep `openNode→router.push`; overlay renders route children.
3. Preserve PR#473 contract: `data-testid=kloel-graph-shell`, `/→/products?graph=1`
   rewrite, `closeOverlay` re-adds `?graph=1`. No restyle of chrome/inner screens.
4. Full byte-identity gate (all domains) + Chrome pixel diff vs `harness.html`.
5. `run_tsc`/`run_eslint`/full graph vitest. release + commit.

## Stop conditions
Byte diff non-empty · deep-link loses `?graph=` · provider conflict in B.

---
@import _PLAYBOOK.md
