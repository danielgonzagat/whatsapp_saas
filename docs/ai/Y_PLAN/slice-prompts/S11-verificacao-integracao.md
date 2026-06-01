# SLICE S11 — VERIFICAÇÃO + INTEGRAÇÃO (last, serial)

WORKTREE: `/Users/danielpenin/whatsapp_saas` @ `feat/kloelgraph-prototype-engine`
DEPENDS-ON: S0–S10. CONCORRÊNCIA: serial (final).

## ESCOPO EXATO
Prove the whole Y is green end-to-end and integrate cleanly:
- Full gate green across the monorepo: `run_tsc` (frontend) 0, `run_eslint` 0, `run_jest` +
  `run_vitest` (all graph + galaxy specs), `test_summary`.
- Chrome E2E per galaxy: open every sun, expand entity nodes (real data), click into the overlay,
  confirm the real screen renders with honest loading/empty/error; back/forward; `?graph=1`.
- PULSE clean: `pulse_scan` + `pulse_health_by_module` for the graph + each galaxy module → no new
  breaks; `pulse_report`.
- Integration: confirm `isKloelGraphEnabled()` default (flag) and remove/retire the legacy sidebar
  path behind the flag in `MainAppLayoutShell.tsx` ONLY if Y mandates it (else leave the rollback
  flag intact). Update `docs/ai/KLOELGRAPH_CANONICAL_SCREEN_MAP.md` + VISUAL_ACCEPTANCE_CHECKLIST.

## ARQUIVOS A EDITAR
- `frontend/src/components/kloel/layouts/MainAppLayoutShell.tsx` — FLAG CLEANUP ONLY (retire legacy
  AppShell path) if mandated; otherwise read-only. Lock.
- `docs/ai/KLOELGRAPH_CANONICAL_SCREEN_MAP.md`, `docs/ai/KLOELGRAPH_VISUAL_ACCEPTANCE_CHECKLIST.md`
  — mark verified rows with evidence (screenshots, network 200s).
- Test/evidence artifacts under `docs/ai/Y_PLAN/`.

## DO NOT EDIT
Any galaxy builder / chokepoint graph file (frozen by now), `KloelGraphPrototype.jsx`, protected
files.

## PROTOCOLO POR FATIA
0. **Pre-flight:** health-probe; no `awk`+`strftime`.
1. `task_lock_status` to confirm all prior slices released their locks (incl across sibling
   worktrees on the 5 chokepoints); `task_stats`.
2. `run_tsc` + `run_eslint` + `run_jest` + `run_vitest` + `test_summary` + `coverage_for_module`
   on graph + wallet (financial) — real output captured. Fix only RED that this integration
   surfaces (do not refactor).
3. **Chrome full sweep — ALL 4 honest states per galaxy:** for each sun (perfil, criar, afiliar,
   educar, conectar, consultar, kloel) navigate → screenshot → expand entity nodes → click →
   overlay real screen → verify **loading + empty + error + success** (not only success) → close
   → `?graph=1`; `?node=`; back/forward. `lighthouse_audit` overall.
   `list_console_messages` (zero errors). `list_network_requests` (real endpoints, no 404 incl
   `/api/anuncios/*`).
4. `pulse_scan` + `pulse_health_by_module` (graph + each galaxy) → clean; `pulse_report`.
5. Flag cleanup (if mandated) via `atomic_edit_symbol` on `MainAppLayoutShell.tsx`; re-run gates.
   (S6 confirmed `MainAppLayoutShell` line-19 is a FALSE alarm — flag cleanup is the only reason
   to touch it.)
6. Update canonical map + acceptance checklist with evidence. Release locks. Commit
   `chore(kloelgraph): full verification + integration, flag cleanup`.

## FALLBACK HONESTO E2E (pré-declarado)
Se o runner não subir frontend+backend+DB, o gate Chrome E2E é marcado **EXTERNAL_BLOCKED**
com substituto documentado: unit + vitest + snapshot byte-level de `graphNodes` por galáxia +
PULSE + contagem de network 200/404. **NUNCA** marcar verde um E2E que não rodou. A mesma regra
vale para o check de imagem do S8 e qualquer asserção live-only.

## REGRAS
- Declare DONE only with evidence (gate output + screenshots + PULSE clean + network 200s) OR
  EXTERNAL_BLOCKED with the documented substitute — never green-by-absence. Never "deve
  funcionar"/"provavelmente". If unvalidated: "implementado, mas ainda não validado".
- Per galaxy, verify all 4 honest states (loading/empty/error/success), not only success.
- Preserve the rollback flag unless Y explicitly mandates removing it.

---
## PLAYBOOK DE MCPs (integral)
(idêntico ao bloco em `S0-fundacao.md`: READ codegraph/code_outline/cognitive-hub/lsp-mesh;
ACT task-graph/atomic locks; EDIT atomic-edit DEFAULT; VERIFY test-runner
run_tsc/run_eslint/run_jest/run_vitest/affected_tests/test_summary/coverage_for_module; CHROME
chrome-devtools navigate/click/take_screenshot/lighthouse_audit/list_console_messages/
list_network_requests; PULSE pulse_scan/pulse_health_by_module/pulse_report; RUNTIME postgres
pg_query read-only + railway get_logs. NUNCA --no-verify / relaxar Codacy / editar protegidos.)
