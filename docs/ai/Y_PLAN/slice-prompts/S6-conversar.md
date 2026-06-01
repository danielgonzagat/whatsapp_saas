# SLICE S6 — CONVERSAR (Inbox/CRM/Contatos/Anúncios/Autopilot/Vendas/Leads/Followups/Marketing)

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
The conectar/Conversar sun + sub-nodes are ALREADY wired to real routes whose real screens
(InboxWorkspace, CRMPipelineView, AnunciosView, AutopilotPage, VendasView, …) render in the
overlay with real hooks. Delta = (1) make Conversar nodes DATA-DRIVEN
(conversation/contact/deal/campaign entity nodes from real data, mirroring products); (2) close
the **`/api/anuncios/*` proxy GAP**. The prototype `buildConversarNodesEdges`/`CONVERSAR_BRANCHES`/
inline panels live ONLY in `KloelGraphPrototype.jsx`/`kloelgraph-harness.html` — DO NOT wire to them.

## DECISÃO A REGISTRAR PARA S9 (faça isto no recibo da fatia)
`useAnuncios` chama `/api/anuncios/status`, que **dá 404 hoje** (proxy AUSENTE). Escolha e
**registre no recibo** qual opção você tomou, pois S9 acopla o branch `anuncios` do resolver a
ela: **(A) criar `/api/anuncios/[...path]` proxy** (preferida; espelha marketing) OU
**(B) repointar `useAnuncios` para `/marketing`** (só se A for inviável). S9 lê este recibo
antes de adicionar o branch `anuncios`.

## ARQUIVOS A EDITAR (body of the S0-created stub — your own file, no chokepoint)
- `frontend/src/components/kloel/graph/KloelGraph.conversar-nodes.ts` — S0 created this as an
  EMPTY STUB exporting `buildKloelGraphConversarNodes` returning `[]`; you FILL the body:
  `buildKloelGraphConversarNodes(data): KloelGraphNode[]` from `listConversations`, `useCRM`
  (deals/contacts), `useAnuncios` (campaigns); children of `conectar-inbox`/`conectar-crm`/
  `conectar-anuncios`. **Plain-branch routes only** (`/inbox`, `/vendas/pipeline`, `/anuncios`)
  until S9 lands; record `?conversation=`/`?contact=`/`?deal=`/`?campaign=` in the receipt.

## ARQUIVOS A CRIAR
- `frontend/src/components/kloel/graph/KloelGraph.conversar-nodes.spec.ts` — empty/error/404/
  loading → `[]`; pre-proxy test (anuncios 404 → zero anuncios nodes, inbox/crm intact);
  post-proxy test.
- `frontend/src/app/api/anuncios/[...path]/route.ts` — MISSING proxy; mirror
  `frontend/src/app/api/marketing/[...path]/route.ts` **including its error state** (on upstream
  timeout/5xx propagate the real backend status/error — no fake fallback, no fake 200).
  (OR repoint `useAnuncios` to `/marketing` — option B; record the choice.)

## ARQUIVOS READ-ONLY (consume)
`frontend/src/lib/api/conversations.ts`, `frontend/src/hooks/useCRM.ts`,
`frontend/src/hooks/useAnuncios.ts`, `frontend/src/app/api/marketing/[...path]/route.ts` (proxy template).

## DO NOT EDIT
Chokepoints (S0 wires conversarNodes slot + S9 adds the entity resolver branch),
`MainAppLayoutShell.tsx` (it is CORRECT — the map's "line-19 bug" was a confirmed false alarm),
`KloelGraphPrototype.jsx`.

## CONTATOS DECISION
No `/contacts` route exists — contact = drawer inside CRM. Contact node →
`/vendas/pipeline?contact=:id` (opens ContactDetailDrawer). Confirm UX with orchestrator.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on your OWN stub + spec + the new proxy file (no chokepoint — S0 already
   created the stub and wired the slot; S9 adds the resolver branch later from your receipt).
2. Anchor: `codegraph_node` on `buildKloelGraphProductNodes` (shape ref), `listConversations`,
   `useCRM`, `useAnuncios`; `protocol_hub_openapi` to confirm `/inbox/*`, `/crm/*`, `/anuncios`;
   `glob`/`codegraph_files` to CONFIRM `/api/anuncios/*` truly absent.
3. **Pre-proxy error test FIRST** (before the proxy exists): with `/api/anuncios/*` still 404,
   assert the builder yields ZERO anuncios nodes while inbox/crm nodes stay intact — proving it
   distinguishes error from empty and never throws/seeds.
4. FILL the S0 stub body via `atomic_edit_symbol`/`atomic_replace_body`; `atomic_create_file`
   the spec + the anuncios proxy (mirror marketing proxy verbatim, including its error state).
   Then add the post-proxy test (proxy present → real data, still honest-empty on error).
5. Gate: `run_tsc` + `run_eslint` + `run_vitest`/`run_jest` + `affected_tests` — real output.
5. Chrome: backend up → navigate, expand conectar → real conversations/deals/campaigns appear;
   click → overlay shows the real screen focused on the entity. With anuncios proxy in place,
   AnunciosView loads real data (not error). Empty/down backend → static labels only + the inner
   screen's honest empty/error (InboxNotAuthenticatedView, NoPipelinesEmptyState).
   `take_screenshot` + `list_network_requests` (verify `/api/anuncios/status` now 200, not 404).
6. PULSE clean. Release locks. Commit `feat(conversar): data-driven nodes + anuncios proxy`.

## REGRAS
- Honest empty: emit ZERO entity nodes on empty/error/404/loading; inner screens own
  loading/empty/error. Never recreate `buildConversarNodesEdges` with in-memory seed.
- The anuncios proxy is a real functional fix (frontend hits a 404 today) AND must propagate
  upstream error/status with no fake fallback (error-state acceptance).
- Record the chosen option (A proxy / B repoint) in the receipt for S9 to couple the resolver.
- Plain-branch routes only (no entity query) until S9; record params in the receipt.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/click/take_screenshot/list_network_requests/list_console_messages; PULSE
pulse_scan_module; RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify /
relaxar Codacy / editar protegidos.)
