# AB-NORMAL-010

- Status: accepted_as_input_with_main_lapida
- Worktree: `/tmp/kloel-opencode-ab10-20260516-211321-normal`
- Prompt recebido: implementar `worker-scope-check` read-only e smoke Part H usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, regras OpenCode e `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/worker-scope-check.mjs`, `scripts/mcp/atomic-edit/smoke.ts`.
- Hipotese inicial: validar allowlist/required files por `git status --porcelain=v1` reduz colisao e overclaim de workers.
- Decisao tomada: usar como base funcional da versao principal, apos lapida do orquestrador.
- Testes executados pelo orquestrador: `node --check`, build atomic-edit, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, `git diff --check`.
- Evidencia: worktree NORMAL retornou `161 passed, 7 failed`; as 7 falhas eram ambientais do bloco ESLint do worktree, e o bloco novo `worker-scope-check` passou completo.
- Resultado antes/depois: antes nao havia gate read-only de escopo; depois ha CLI funcional validado no repo principal com smoke `168 passed, 0 failed`.
- Risco residual: worker nao autoencerrou no tempo alvo e nao deixou trace MCP de mutacao.
- Recomendacao: usar esta cobertura como piso minimo para o modo ATOMIC e exigir self-termination curta.
