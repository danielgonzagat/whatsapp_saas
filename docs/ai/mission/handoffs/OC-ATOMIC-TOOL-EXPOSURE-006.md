# OC-ATOMIC-TOOL-EXPOSURE-006

- Status: accepted_with_cleanup_gap
- Data: 2026-05-16 18:18 America/Sao_Paulo
- Modo: VALIDACAO / OPENCODE_RUNTIME / ATOMIC_TOOLING
- Modelo: OpenCode `deepseek/deepseek-v4-pro`, variant `max`
- Workspace: `/Users/danielpenin/whatsapp_saas`

## Objetivo Recebido

Provar, em OpenCode interativo real, que o worker ATOMIC enxerga e usa o MCP
`atomic-edit` para escrita de codigo, sem derivar para Bash/Node/native edit.

## Arquivos Lidos

- `opencode.json`
- `.opencode/plugins/workspace-gates.ts`
- `scripts/mcp/atomic-edit/atomic-only-hook.mjs`
- `scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts` (fixture temporario)

## Arquivos Alterados

- `scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts`
  - criado por `atomic_create_file`;
  - mantido intacto por `atomic_replace_literal preview:true`;
  - esvaziado por `atomic_delete_range`;
  - removido pelo orquestrador como residuo zero-byte gerado pelo canario.

## Hipotese Inicial

A falha da rodada `AB-ATOMIC-004` era de exposicao/contrato do worker ATOMIC.
No repo principal, com `opencode.json` e `workspace-gates` carregados, o
OpenCode deveria expor ferramentas atomicas reais e permitir uma prova estreita
de preview sem escrita.

## Decisao Tomada

Aceitar o canario como prova estreita de runtime. O bloqueio de exposicao MCP da
rodada 4 esta resolvido nesta janela controlada, mas ainda nao autoriza escalar
complexidade porque restam lacunas de self-termination e cleanup de arquivo
criado.

## Testes Executados

- `opencode mcp list`
  - Resultado: `atomic-edit connected`.
- `opencode debug config --print-logs --log-level DEBUG`
  - Resultado: `opencode.json` carregado, `workspace-gates` carregado,
    `permission.edit=deny`.
- OpenCode worker:
  - `atomic_create_file`: criou fixture com `export const CANARY = 'old';`.
  - `atomic_replace_literal preview:true`: propos `'old'` -> `'new'` sem
    escrita, com `changed=false`.
  - verificacao read-only: arquivo continuou com `'old'`, sem `'new'`.
  - `atomic_delete_range`: removeu o conteudo do fixture.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:13:00.000Z --strict-current-topology --json`
  - Resultado: `pass=true`, `traces=5`, `previewTraceCount=1`,
    `dishonestPreviewCount=0`, `previewHonestyPass=true`,
    `currentTopologyCoverage=1`, `staleTopologyEmitterSuspected=false`.
- `pgrep -fl 'opencode run|opencode serve'`
  - Resultado: sem processos ativos apos encerramento da TUI.
- `test ! -e scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts`
  - Resultado: fixture ausente apos cleanup.

## Evidencia Antes/Depois

- Antes: `AB-ATOMIC-004` nao viu ferramentas atomicas no tool list e tentou
  derivar para escrita Bash/Node proibida.
- Depois: `OC-ATOMIC-TOOL-EXPOSURE-006` usou ferramentas atomicas reais,
  produziu trace de preview honesto e manteve cobertura topologica corrente em
  100% na janela controlada.

## Risco Residual

- A TUI OpenCode nao autoencerrou apos o handoff; o orquestrador precisou
  encerrar PIDs especificos.
- `atomic_delete_range` remove conteudo, mas nao remove arquivo criado. Falta
  uma primitiva `atomic_delete_file` ou uma politica canonica de cleanup de
  fixtures gerados.
- A prova e estreita. Ela valida exposicao MCP e preview honesty, nao
  superioridade A/B ampla.

## Recomendacao Para Proximo Worker

Repetir a mesma classe de tarefa A/B da rodada 4, sem escalar complexidade. O
worker ATOMIC deve executar preflight curto de exposicao atomica, usar apenas
MCP/fallback atomico aprovado, entregar handoff persistido e autoencerrar a TUI
de forma limpa.
