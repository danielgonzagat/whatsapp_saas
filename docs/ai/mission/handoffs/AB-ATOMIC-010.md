# AB-ATOMIC-010

- Status: accepted_as_trace_only_failed_functional_acceptance
- Worktree: `/tmp/kloel-opencode-ab10-20260516-211321-atomic`
- Prompt recebido: implementar exatamente o mesmo `worker-scope-check` usando apenas MCP atomic-edit/atomic tools para mutacao.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/smoke.ts` e superficies atomic-only do worktree.
- Arquivos alterados: `scripts/mcp/atomic-edit/worker-scope-check.mjs`, `scripts/mcp/atomic-edit/smoke.ts`; setup `.opencode/**` do worktree nao conta como entrega.
- Hipotese inicial: rastreabilidade atomica deveria preservar escopo e produzir cobertura equivalente ao NORMAL.
- Decisao tomada: rejeitar como entrega funcional final; aceitar apenas a prova de runtime atomic-edit/traces.
- Testes executados pelo orquestrador: `node --check`, build atomic-edit, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, auditor `--strict-current-topology`.
- Evidencia: auditor da janela passou com `pass=true` e `currentTopologyCoverage=1`, mas smoke retornou `157 passed, 18 failed`; 11 falhas pertenciam ao bloco novo `worker-scope-check`.
- Resultado antes/depois: ATOMIC provou rastreabilidade, mas nao entregou comportamento correto da tarefa.
- Risco residual: MCP exposto ao orquestrador fechou transporte em `atomic_insert_at` para arquivo novo; falta `atomic_create_file` estavel/exposto no fluxo de orquestracao.
- Recomendacao: antes de nova escala, corrigir create-file atomico, autoencerramento e usar `worker-scope-check` como gate externo de aceite.
