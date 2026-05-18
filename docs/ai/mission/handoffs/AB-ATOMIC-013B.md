# AB-ATOMIC-013B Handoff

- Status: accepted_as_functional_winner_with_main_lapida
- Worker: OpenCode atomic-only
- Worktree: `/tmp/kloel-opencode-ab13-20260516-2216-atomic`
- Modelo: DeepSeek V4 Pro via OpenCode

## Objetivo

Implementar `atomic_replace_between_anchors` usando somente MCP/atomic tools.
A ferramenta deve preservar `startAnchorText` e `endAnchorText`, substituir
apenas a zona entre anchors, suportar `occurrence`, `expectedSha256` e
`preview`, e recusar selecoes ambiguas ou invalidas.

## Resultado

O worker adicionou a ferramenta em `scripts/mcp/atomic-edit/server.ts` e
adicionou cobertura em `scripts/mcp/atomic-edit/smoke.ts`. O delta foi aceito
como vencedor funcional da rodada e portado para o repo principal.

## Arquivos Alterados

- `scripts/mcp/atomic-edit/server.ts`: registra `atomic_replace_between_anchors`.
- `scripts/mcp/atomic-edit/smoke.ts`: tool count 34 e 12 checks comportamentais.

## Validacao No Worktree

- `node --check scripts/mcp/atomic-edit/server.ts`: passou.
- `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
- `node scripts/mcp/atomic-edit/build.mjs`: passou.
- `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `207 passed, 0 failed`.
- `node scripts/mcp/atomic-edit/worker-scope-check.mjs --repo . --allow scripts/mcp/atomic-edit/server.ts --allow scripts/mcp/atomic-edit/smoke.ts --require scripts/mcp/atomic-edit/server.ts --require scripts/mcp/atomic-edit/smoke.ts --json`: `ok=true`.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T01:16:00.000Z --strict-current-topology --json`: `pass=true`, `currentTopologyCoverage=1`, `previewHonestyPass=true`.
- `git diff --check -- scripts/mcp/atomic-edit`: passou.

## Validacao No Repo Principal

- `node --check scripts/mcp/atomic-edit/server.ts`: passou.
- `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
- `node scripts/mcp/atomic-edit/build.mjs`: passou.
- `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `207 passed, 0 failed`.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T01:16:00.000Z --strict-current-topology --json`: `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
- `git diff --check -- scripts/mcp/atomic-edit`: passou.

## Benchmark

- Venceu NORMAL em entrega funcional, cobertura de tarefa, rastreabilidade e
  validacao independente, porque NORMAL foi bloqueado pelo enforcement.
- Ainda nao prova superioridade ampla contra um modo normal competitivo, pois
  esta rodada usou NORMAL como controle negativo.

## Risco Residual

- A TUI nao autoencerrou limpa; o orquestrador encerrou processos depois do handoff.
- O MCP primario da sessao do orquestrador fechou transporte no main; o port foi
  feito por fallback atomico offline com hash guard.
- Uma insercao inicial no main carregou `\n` literal e foi reparada por
  substituicao atomica exata antes da validacao verde.

## Recomendacao

Na proxima rodada, manter canario de enforcement separado do benchmark
competitivo. O benchmark deve comparar estrategias atomicas, exigir payload
multiline seguro, handoff autoencerrado e `worker-scope-check` em worktree isolado.
