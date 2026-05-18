# AB-ATOMIC-007

- Status: accepted_as_input_with_smoke_gap
- Workspace: `/tmp/kloel-opencode-ab7-20260516-1939-atomic`
- Modo: ATOMIC OpenCode, mutacao de codigo somente via MCP atomic-edit.
- Objetivo: implementar `atomic_rename_property_key` para a topologia `rename_property_keep_value`.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados no worktree: `scripts/mcp/atomic-edit/advanced.ts`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Resultado: aceito como melhor insumo tecnico, rejeitado como final porque o smoke independente falhou.
- Evidencia: `node scripts/mcp/atomic-edit/build.mjs` passou; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou `124 passed, 2 failed`.
- Venceu em: build verde antes da lapidacao, uso real do MCP atomic-edit e rastreabilidade por traces.
- Perdeu em: cobertura live inicial, tratamento de erro MCP por `isError:true`, reserved identifier guard e self-termination.
- Recomendacao: proximas tarefas atomicas devem provar casos MCP de erro e identifiers invalidos no proprio smoke antes de handoff.
