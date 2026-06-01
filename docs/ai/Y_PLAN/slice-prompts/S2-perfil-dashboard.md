# SLICE S2 — PERFIL + DASHBOARD (HomeView) + métricas

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0. CONCORRÊNCIA: parallel (Fase 1).

## ESCOPO EXATO
This domain is SUBSTANTIALLY WIRED: node `dashboard`→`/dashboard`→HomeView (real
`useDashboardHome`, zero Math.random, honest states); `perfil`/`perfil-settings`→`/settings`
→ContaView; `perfil-account`→`/account`. The overlay already renders these real screens.
Work = (1) audit/clean residual seeds; (2) OPTIONAL real-data metric-node source; (3) neutralize
hardcoded `DEFAULT_FIRST_NAME 'Daniel'` fallback.

## DIRETÓRIO `adapters/` — S2 É O CRIADOR DESIGNADO (pre-flight gate §H.3)
`frontend/src/components/kloel/graph/adapters/` é criado UMA vez por **S2** (criador único).
S7 apenas ADICIONA um arquivo sob ele depois; `atomic_create_file` é idempotente → sem corrida
de mkdir.

## ARQUIVOS A EDITAR (body of the S0-created optional stub)
- `frontend/src/components/kloel/graph/adapters/dashboardMetricNodes.ts` — S0 created this as an
  EMPTY STUB exporting `buildDashboardMetricNodes` returning `[]`; fill the body if you ship the
  optional perfil/metric source: `buildDashboardMetricNodes(home)` from `useDashboardHome`; emits
  `type:'metric'` nodes parentId `dashboard`/`perfil`; **no data / loading / error → omit node
  (zero nodes, never seed)**. Plain-branch routes only until S9.
- spec for the adapter (honest-empty + error-path).

## ARQUIVOS A EDITAR (exclusivo deste domínio)
- `frontend/src/components/kloel/conta/ContaConstants.ts` — AUDIT `DEFAULT_*`/`_SEED`; if any
  feeds DISPLAYED user data (not empty-input default) → real `/auth/me` or honest state.
- `frontend/src/components/kloel/conta/ContaView.helpers.ts` — same audit.
- `frontend/src/components/kloel/settings/account-settings-section.parts.tsx` — same audit.
- `frontend/src/components/kloel/home/HomeView.helpers.ts` — `DEFAULT_FIRST_NAME 'Daniel'` →
  neutral fallback (e.g. derived from `useAuth().userName` or generic greeting).

## DO NOT EDIT
Chokepoints (`KloelGraphShell.tsx` etc. — S0 wires the optional source), `HomeView.tsx`,
`HomeKpiTiles.tsx`, `HomeRecentActivity.tsx`, `useDashboardHome.ts` (all read-only, already real),
`KloelGraphPrototype.jsx`.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_acquire` on the 4 domain files + your optional stub (no chokepoint).
2. **adapters/ dir:** as the designated owner (gate §H.3), ensure
   `frontend/src/components/kloel/graph/adapters/` exists (idempotent create).
3. Anchor: `codegraph_search` for `DEFAULT_`/`_SEED` in conta/settings; `code_read_symbol` each
   hit; classify default-vs-fake. `protocol_hub_openapi` to confirm `/auth/me`, `/dashboard/home`.
4. Edit only confirmed-fake seeds via `atomic_replace_literal`/`atomic_edit_symbol`. Fill the
   metric stub body only if Y wants visible metric nodes (honest-empty on loading/empty/error).
5. Gate: `run_tsc` + `run_vitest`/`run_jest` (`member-area-preview.test.ts`-style) + `affected_tests`.
5. Chrome: navigate, open `dashboard` node → overlay shows HomeView with real KPIs (loading→data);
   open `perfil` → ContaView. `take_screenshot` each; compare against `KloelGraphPrototype.jsx`
   DesempenhoPanel/CoreSettingsPanel for parity (visual acceptance checklist).
6. PULSE `pulse_scan_module` clean. Release locks. Commit `fix(perfil-dashboard): honest states, remove residual seeds`.

## REGRAS
- If a seed is a benign empty-input form default, LEAVE it (don't churn). Only convert
  display-data seeds. Never inject `MEMBER_AREAS_SEED`/`DEFAULT_WALLET`-class fakes.
- Visual parity: inner screen must match the prototype's panel (same casca, real data).

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests; CHROME chrome-devtools
navigate/take_screenshot/take_snapshot/list_console_messages; PULSE pulse_scan_module;
RUNTIME postgres pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy /
editar protegidos.)
