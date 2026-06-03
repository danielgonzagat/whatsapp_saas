# AB-ATOMIC-012

- Status: accepted_as_trace_evidence_rejected_as_best_functional_coverage
- Prompt recebido: mesma missao `atomic_insert_before_anchor`, mas usando somente MCP/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, config atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: o modo ATOMIC deveria manter rastreabilidade e entregar cobertura igual ou superior ao NORMAL.
- Decisao tomada: aceitar evidencia de runtime atomic-only e traces, mas rejeitar como melhor cobertura funcional da rodada.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `177 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:58:00.000Z --strict-current-topology --json` -> `pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: traces existem, auditoria corrente passou, mas o smoke comportamental de `atomic_insert_before_anchor` ficou incompleto.
- Benchmark: venceu NORMAL em rastreabilidade/prova atomic-only; perdeu em cobertura funcional, aceite comportamental e autoencerramento.
- Risco residual: o modo ATOMIC ainda precisa de template obrigatorio de aceite e controle para nao trocar cobertura de comportamento por apenas rastreabilidade.
- Recomendacao para proximo subagent: antes do handoff, comparar a lista de criterios da tarefa com testes executaveis e recusar a propria entrega se faltar smoke para qualquer criterio.
