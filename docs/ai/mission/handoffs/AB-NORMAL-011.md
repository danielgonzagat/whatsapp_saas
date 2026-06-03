# AB-NORMAL-011

- Status: accepted_as_best_functional_coverage_with_main_lapida
- Prompt recebido: endurecer `atomic_create_file` com `expectedSha256`, parent dirs, preview sem escrita, recusa non-empty, empty-file fill, protected refusal e smoke `.mjs`, usando OpenCode normal sem atomic-edit.
- Worktree: `/tmp/kloel-opencode-ab11-20260516-2135-normal`
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Hipotese inicial: criacao de arquivo precisa ser operador atomico de primeira classe para evitar fallback shell/heredoc em decomposicoes futuras.
- Decisao tomada: aceitar como melhor base funcional e de cobertura, mas nao como entrega direta; aplicar versao hibrida no repo principal.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `177 passed, 7 failed` no worktree; 7 falhas ambientais do bloco ESLint em worktree isolado.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: passou.
- Evidencia antes/depois: cobriu preview sem criar arquivo nem parent dir, commit criando parent dirs, existing non-empty refusal, empty fill, stale sha, correct sha, protected refusal e `.mjs`.
- Benchmark: venceu ATOMIC em cobertura funcional; empatou negativamente em self-termination porque tambem exigiu corte pelo orquestrador; perdeu em rastreabilidade de mutacao.
- Risco residual: entrega normal nao deixa traces MCP e inseriu bloco longo de smoke por fluxo de edicao normal.
- Recomendacao para proximo worker: manter este nivel de cobertura como piso obrigatorio do modo ATOMIC.
