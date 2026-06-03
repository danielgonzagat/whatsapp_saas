# AB-ATOMIC-066

- Status: rejected_as_clean_win_needs_lapida
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` com `extract_symbols_to_file validate:true`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: chamada atomica com validacao embutida, validacao externa do coordenador, retry idempotente apos lapida.
- Evidencia: mutacao correta, trace isolation `ok=true`, mas primeira validacao morreu por timeout e retry inicial falhou porque os simbolos ja tinham sido movidos.
- Benchmark: nao aceito como vitoria limpa por timeout + falta de idempotencia de retry antes da lapida.
- Risco residual: comando longo precisa timeout maior e operador precisa reconhecer estado ja aplicado.
- Recomendacao: repetir apos idempotent retry e timeout maior.
