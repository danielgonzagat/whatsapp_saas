# SLICE S9 — OVERLAY-BRIDGE / ROUTING (entity deep-links, back/forward, ?graph=1, ?node=)

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0 + galaxies (S3/S5/S6) + S8.
CONCORRÊNCIA: **Fase 2b — serial, ALONE, strictly AFTER S8.** S8 and S9 share
`KloelGraph.routes.spec.ts`, so the 2a→2b split guarantees no overlap. S9
acquires a lock ONLY on its own files (`KloelGraph.routes.ts` + `.routes.spec.ts`).

## ESCOPO EXATO
The overlay already renders real screens. This slice makes the **node↔URL round-trip** robust for
the new entity nodes the galaxies emit, plus history and graph-only/deep-link conventions:
- Entity deep-link resolvers: `?conversation=:id`, `?contact=:id`, `?deal=:id`, `?campaign=:id`,
  `?areaId=:id`, `?productId=:id`, `?affiliateId=:id` → resolve back to the open node so the canvas
  highlights it and `getKloelGraphOverlayLabel` is correct.
- `?graph=1` (graph-only / overlay hidden) verified for open AND close paths.
- `?node=` (optional) direct-open by node id.
- Browser back/forward: back from overlay → `?graph=1`; forward → re-open the node.

## ARQUIVOS A EDITAR (serial — S0 hands off the resolver scaffold)
- `frontend/src/components/kloel/graph/KloelGraph.routes.ts` — extend
  `resolveKloelGraphNodeForPathFromNodes` (currently special-cases `products`/`checkout`) with
  branches for `parts[0] === 'inbox'|'vendas'|'anuncios'|'produtos'|'parcerias'` reading the entity
  query. **CHOKEPOINT — lock.** Keep `products`/`checkout` cases verbatim. ≤400 lines.
- `frontend/src/components/kloel/graph/KloelGraph.routes.spec.ts` — cover each new resolver branch
  + the `?graph=1` / back-forward expectations.

## DO NOT EDIT
`KloelGraphOverlay.tsx` (already correct), `KloelGraphShell.tsx` open/close logic (already
`router.push` + `?graph=1` — only S8 micro-edited it), `KloelGraphPrototype.jsx`. If a galaxy's
entity-node route can simply equal the plain branch route (no drilldown needed), PREFER that and
add NO resolver branch (keeps the monolith untouched).

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`. Confirm Fase 2a (S8) is DONE and its
   `routes.spec` lock is RELEASED (`task_lock_status`) before locking.
1. **Read the S6 receipt** to learn which `/api/anuncios` option S6 took (proxy vs repoint)
   BEFORE adding the `anuncios` resolver branch.
2. `task_lock_acquire` + `atomic_lock_acquire` on S9's OWN files ONLY
   (`KloelGraph.routes.ts` + `KloelGraph.routes.spec.ts`); **verify** the grant.
3. Anchor: `code_read_symbol` `resolveKloelGraphNodeForPathFromNodes`, `resolveProductNode`,
   `resolveCheckoutNode`, `getKloelGraphOverlayLabel`; collect the exact entity routes S3/S5/S6/S8
   emit (read their builder modules).
4. Edit via `atomic_edit_symbol` mirroring the product/checkout resolver shape. Add a
   **fallback to the plain-branch route** when an entity branch does not resolve (the S0
   scaffold already stubs this) so the overlay highlight/label is never wrong during the window.
5. Gate: `run_tsc` + `run_jest`/`run_vitest` on routes.spec (incl the plain-branch-fallback
   case for an unresolved entity) + `affected_tests` — real output captured.
6. Chrome: navigate, open an entity node (e.g. a conversation) → URL shows `?conversation=:id`,
   overlay highlights the right node, label correct; press browser Back → `?graph=1` (overlay
   hidden, canvas shown); Forward → node re-opens. `?graph=1` direct nav shows graph-only.
   `take_screenshot` each state. Un-bootable live check → **EXTERNAL_BLOCKED** + substitute
   (unit round-trip + network 200/404), never green-by-absence.
7. PULSE clean. Release locks. Commit `feat(kloelgraph): entity deep-link routing + history`.

## REGRAS
- Prefer plain-branch routes (no resolver change) unless a galaxy genuinely needs entity focus.
- An unresolved entity branch MUST fall back to its plain-branch route (no wrong highlight).
- `anuncios` branch coupled to S6's recorded option.
- Resolver must be pure + deterministic; products/checkout behavior unchanged. routes.ts ≤400 lines.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/click/press_key/take_screenshot/list_network_requests; PULSE pulse_scan_module;
RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy /
editar protegidos.)
