# AB-NORMAL-126

- Status: accepted_functional_baseline
- Prompt recebido: Round 126 NORMAL OpenCode, repeat seven-helper split de
  `UnifiedAgentService` com factory OpenCode e sem Atomic OS.
- Workspace:
  `/Users/danielpenin/kloel-ab-worktrees/kloel-ab126-normal-20260518105544`
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline NORMAL funcional completo.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, backend
  typecheck `0`, touched Kloel typecheck errors `0`, diff-check `0`,
  protected diff vazio, suppression/helper/private scans limpos.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-126/audit.json`
  - `docs/ai/atomic-os-benchmark/round-126/normal-external-validation.log`
  - `docs/ai/atomic-os-benchmark/round-126/typecheck-normal.log`
- Metricas: eventos `131`, primeira acao `16.225s`, agent time `1007.770s`,
  comandos `11`, failed commands `3`, input/output/reasoning
  `80.892/16.271/10.893`, service/total lines `352/1131`, source churn
  `1410`, traces `0`.
- Risco residual: custo operacional alto, uso pesado de native `write`/`edit`
  e zero trace atomico.
- Recomendacao: usar como baseline funcional para o Round 127.
