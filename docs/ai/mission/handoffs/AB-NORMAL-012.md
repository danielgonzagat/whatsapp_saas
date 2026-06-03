# AB-NORMAL-012

- Status: accepted_as_best_functional_coverage_with_main_lapida
- Prompt recebido: implementar `atomic_insert_before_anchor` com anchor preservada, occurrence, expectedSha256, preview e smoke completo, usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: o operador before-anchor fecha a familia de insercoes ancoradas e reduz drift de coordenadas em blocos longos.
- Decisao tomada: aceitar como melhor base funcional e de cobertura, mas nao como entrega direta; aplicar versao hibrida no repo principal e reparar `worker-scope-check` para ignorar `.atomic`.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `187 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: cobriu live insert, anchor preservada, preview, missing anchor, empty anchor, ambiguity, occurrence, out-of-range e stale sha.
- Benchmark: venceu ATOMIC em cobertura funcional e aceite comportamental; perdeu em rastreabilidade atomic-only e tambem falhou self-termination.
- Risco residual: entrega normal nao deixa traces MCP e precisou de lapidacao do orquestrador para remover contaminacao `.atomic` do scope gate.
- Recomendacao para proximo subagent: usar esse checklist como piso minimo obrigatorio do modo ATOMIC.
