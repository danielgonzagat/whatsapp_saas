# SLICE S10 — Verify + integrate (SERIAL, last)

## Escopo
Final verification across the whole graph; flip the flag to remove the old sidebar
once the literal graph is the proven default shell.

## Arquivos (writes)
- `KloelGraphShell.spec.tsx`, `KloelGraph.routes.spec.ts`,
  `__tests__/KloelGraph.byte-identity.spec.ts` (update WITHOUT weakening assertions)
- the feature flag that hides the old sidebar (flip behind-the-flag → default)

## PROTOCOLO POR FATIA
1. `task_lock_acquire` on spec files + flag.
2. Full suite: `run_tsc` (frontend) + `run_eslint` + `run_vitest` (all graph specs) +
   Chrome pixel diff (all 7 galaxies + overlay) vs `harness.html`.
3. honest-empty E2E per domain: loading→scaffold-only; empty→honest copy; error→real
   error; ZERO seed leakage anywhere (devtools: no `Math.random` value reaching UI,
   no `api.anthropic.com`).
4. `pulse_scan_module` on the graph → no regression. PULSE health for the module.
5. Flip the flag: literal graph becomes default; old sidebar removed behind the flag.
6. `cd frontend && npm run lint && npm run build` clean.
7. Final commit; coordinate landing with the canonical worktree owner.

## Stop conditions
Any byte/pixel diff · any seed leak · build/typecheck/lint failure · PULSE regression ·
flag flip would orphan a live route.

---
@import _PLAYBOOK.md
