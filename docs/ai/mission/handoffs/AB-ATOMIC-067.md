# AB-ATOMIC-067

- Status: accepted_functional_but_failed_command_loss
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` com `extract_symbols_to_file validate:true`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: duas chamadas atomic-call por erro de JSON escapado na primeira; validacao externa repetiu Jest/typecheck/diff/protected/scan/trace.
- Evidencia: funcional verde, `atomicModeClean=true`, trace isolation `ok=true`, service `708`, helper `29`, source churn `31`.
- Benchmark: venceu economia operacional e trace, mas perdeu failed commands (`1` vs `0`).
- Risco residual: transporte shell JSON pode quebrar a primeira tentativa.
- Recomendacao: reparar parser CLI e repetir.
