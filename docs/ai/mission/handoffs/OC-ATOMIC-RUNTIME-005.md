# OC-ATOMIC-RUNTIME-005

- Status: accepted_with_orchestrator_cleanup
- Data: 2026-05-16
- Worker: OpenCode interativo, DeepSeek V4 Pro
- Prompt recebido: provar que `atomic_replace_literal` com `preview:true` nao escreve em disco apos o reparo do MCP.

## Escopo

- Arquivos lidos:
  - `AGENTS.md`
  - `scripts/decomp/opencode-subagent-delegation-rules.md`
  - `scripts/mcp/atomic-edit/server.ts`
  - `scripts/mcp/atomic-edit/.opencode-preview-fixture.ts`
- Arquivos alterados:
  - `scripts/mcp/atomic-edit/.opencode-preview-fixture.ts` temporario, removido pelo orquestrador apos a sessao.

## Hipotese

Depois do reparo, `atomic_replace_literal` deve aceitar `preview:true` e
`expectedSha256`, validar a troca proposta e retornar prova sem escrever a
proposta no arquivo alvo.

## Execucao

- `atomic_create_file` criou fixture com `export const TARGET = 'old';`.
- `atomic_replace_literal` com `preview:true` tentou trocar `'old'` por `'new'`.
- Verificacao no worker confirmou:
  - conteudo ainda continha `'old'`;
  - conteudo nao continha `'new'`.
- O hook bloqueou `rm` via shell; o worker esvaziou a fixture por operacao
  atomica e o orquestrador removeu o arquivo vazio gerado.

## Evidencia

- Trace de create: `.atomic/traces/op_1778963653214_8077bbeb.json`
- Trace de literal preview: `.atomic/traces/op_1778963663527_8bbdc61c.json`
- Trace de cleanup atomico: `.atomic/traces/op_1778963709749_bbbee307.json`
- Auditoria do orquestrador:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:33:24.000Z --strict-current-topology --json`
  - Resultado: `pass=true`, `currentTraceCount=11`, `currentTopologyCoverage=1`, `currentMissingTopology=[]`.
- Smoke pos-reparo:
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`
  - Resultado: 101 passed, 0 failed.

## Decisao

Aceito como prova N3/N4 local estreita do runtime OpenCode + MCP para a
invariante "preview nao escreve". Nao conta como prova de superioridade A/B
ampla do modo atomico.

## Risco Residual

- Self-termination do OpenCode ainda exigiu Ctrl-C do orquestrador.
- A prova cobre literal preview; a proxima rodada A/B ainda precisa medir tempo,
  memoria, diff, aceitacao independente, trace e handoff.

## Recomendacao

Antes de nova rodada A/B oficial, repetir canary atomic-only com:

- `atomic_replace_literal preview:true`
- `expectedSha256`
- trace `preview=true`
- trace `changed=false`
- `afterSha256` do conteudo persistido
- `proposedSha256` do conteudo proposto
