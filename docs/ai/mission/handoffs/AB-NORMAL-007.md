# AB-NORMAL-007

- Status: rejected_as_final_accepted_as_test_input
- Workspace: `/tmp/kloel-opencode-ab7-20260516-1939-normal`
- Modo: NORMAL OpenCode, sem atomic-edit para mutacao de codigo.
- Objetivo: implementar `atomic_rename_property_key` para renomear chave de objeto preservando valor.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados no worktree: `scripts/mcp/atomic-edit/advanced.ts`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Resultado: patch nao aceito como final; build falhou porque `PropertyAssignment.setName` nao existe no `ts-morph` local.
- Evidencia: `node scripts/mcp/atomic-edit/build.mjs` falhou com `TS2551 Property 'setName' does not exist on type 'PropertyAssignment'`.
- Venceu em: cobertura live inicial do MCP e teste de valor preservado.
- Perdeu em: corretude compilavel, rastreabilidade atomica e aceite independente.
- Recomendacao: manter a exigencia de smoke live do NORMAL nas proximas rodadas, mas validar APIs reais antes do handoff.
