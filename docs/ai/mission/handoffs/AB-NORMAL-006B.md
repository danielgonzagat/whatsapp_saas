# AB-NORMAL-006B

- Status: accepted_as_input_with_main_lapida
- Worker: OpenCode NORMAL, `deepseek/deepseek-v4-pro`, worktree `/tmp/kloel-opencode-ab6b-20260516-1858-normal`.
- Prompt recebido: implementar `code_file_stat` no MCP sem atomic-edit, com primeira mutacao/prova em ate 3 minutos, validacao completa e handoff compacto.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados no worktree: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Hipotese inicial: `code_file_stat` deve dar metadados e hash para `expectedSha256` sem retornar conteudo.
- Decisao tomada: aceitar como insumo de escopo/teste; nao copiar diretamente porque o hash/bytes foram baseados em leitura UTF-8.
- Testes executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passed.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passed.
  - `node scripts/mcp/atomic-edit/build.mjs`: passed.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 116 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:58:00.000Z --strict-current-topology --json`: `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit`: passed.
- Evidencia antes/depois: antes nao havia ferramenta `code_file_stat`; depois o worktree NORMAL listou 29 ferramentas e cobriu fixture file, missing path, directory path e protected path.
- Benchmark: venceu em escopo menor (`server.ts` + `smoke.ts`) e melhor comparacao de hash que o ATOMIC; perdeu em rastreabilidade atomica.
- Risco residual: sem trace de edicao do patch e com hash por UTF-8, nao bytes brutos.
- Recomendacao: usar a cobertura NORMAL como piso minimo para o proximo worker ATOMIC, mas exigir hash por `Buffer` bruto.
