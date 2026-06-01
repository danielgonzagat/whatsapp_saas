# SLICE S7 — CONSULTAR: Carteira + Analytics/Relatórios

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
All 9 `consultar-*` nodes (5 WALLET_TABS + 4 REPORT_TABS) ALREADY have correct real routes and
the real screens (CarteiraPage + 5 subroutes; AnalyticsPage + Vendas/Assinaturas/Abandonos/
Estornos tabs) ALREADY open in the overlay. `buildWalletNodesEdges`/`DEFAULT_WALLET`/
`ORDERS_SEED` live ONLY in `KloelGraphPrototype.jsx`. Delta = VERIFY each screen consumes real
data + has honest states; convert any residual fake INSIDE the real screen; OPTIONAL dynamic
wallet/report entity source.

## ARQUIVOS A EDITAR (exclusivo — only if a screen shows fake/placebo)
- `frontend/src/components/kloel/carteira.tsx` + `carteira/{CarteiraSaldoCard,CarteiraExtratoTable,
  CarteiraSaque,CarteiraTabAntecipacoes,carteira-recent-transactions,carteira-revenue-chart}.tsx`
  — verify real `wallet.ts` consumption + loading/empty/error; edit ONLY if fake present.
- `frontend/src/app/(main)/analytics/tabs/{VendasTab,AssinaturasTab,AbandonosTab,EstornosTab}.tsx`
  — verify `useReport(ep,filters)` real consumption + empty/error; edit ONLY if fake/missing state.

## ARQUIVOS A CRIAR (optional — diretório criado por S2)
- `frontend/src/components/kloel/graph/adapters/consultar-nodes.ts` — optional wallet/report
  dynamic-node adapter (`buildConsultarGraphNodes`), only if Y wants per-withdrawal/per-report
  nodes (consuming `/kloel/wallet/{ws}/transactions`); no data / loading / error → emit ZERO
  nodes. **O diretório `adapters/` é criado por S2** (pre-flight gate §H.3); S7 apenas ADICIONA
  este arquivo. `atomic_create_file` é idempotente → sem corrida de mkdir. Plain-branch routes
  only until S9.

## DO NOT EDIT
Chokepoints (`KloelGraphShell.tsx`/Overlay — overlay already correct, shared with all slices),
`analytics/page.tsx` (already tab-driven, only on bug), `KloelGraphPrototype.jsx`.
NOTE: wallet endpoints are `/kloel/wallet/{workspaceId}/*` (NOT `/wallet`); read `reports.ts`
body + exact `confirmTransaction` path before assuming.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on each screen file you actually edit (all disjoint from other slices).
2. Anchor: `codegraph_node` on `getWalletBalance`/`getWalletTransactions`/`getAnalyticsAdvanced`/
   `useReport`; `code_read_symbol` each carteira tab + each analytics tab to confirm real
   consumption; `protocol_hub_openapi` to confirm `/kloel/wallet/*`, `/analytics/*` controllers
   exist + auth/workspace guard. Read `lib/api/reports.ts` (body unread in maps).
3. Edit only confirmed-fake screens via `atomic_edit_symbol` → real endpoint or honest state.
4. Gate: `run_tsc` + `run_eslint` + `affected_tests` + `coverage_for_module` (wallet is financial —
   prefer high coverage on any touched wallet code; centavos as bigint, never float).
5. Chrome: backend up → navigate, open each consultar-wallet-* and consultar-report-* node →
   overlay shows real Carteira/Analytics tab with real data (loading→data; empty → "Nenhuma venda
   ainda"; error → error card). `take_screenshot` + `list_network_requests` (verify
   `/kloel/wallet/{ws}/balance|transactions`, `/analytics/advanced|reports` fire).
6. PULSE clean. Release locks. Commit `fix(consultar): verify wallet/analytics real data + honest states`.

## REGRAS
- Financial surface: never float for money; never fake "success" before real confirmation; wallet
  is append-only. Never inject `DEFAULT_WALLET`/`ORDERS_SEED`.
- Prefer ZERO edits if screens already real — this slice may be validation-only.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests/coverage_for_module; CHROME chrome-devtools
navigate/click/take_screenshot/list_network_requests; PULSE pulse_scan_module; RUNTIME postgres
pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy / editar protegidos.)
