# AB-NORMAL-001 Handoff

- Status: accepted_with_failed_hidden_acceptance
- Timestamp: 2026-05-16 14:33 America/Sao_Paulo
- Workspace: `/tmp/kloel-opencode-ab-20260516-141634/normal`
- Modelo: `deepseek/deepseek-v4-pro`
- Modo: OpenCode padrao sem atomic-edit MCP.

## Objetivo Recebido

Reparar `scripts/mcp/atomic-edit/audit-atomicity.mjs` para separar falha de enforcement de ratio advisory, adicionar `--strict-ratio`, preservar falhas por fallback/coarse e validar com smoke.

## Arquivos Lidos

- `AGENTS.md`
- `scripts/decomp/opencode-subagent-delegation-rules.md`
- `scripts/mcp/atomic-edit/audit-atomicity.mjs`

## Arquivos Alterados

- `scripts/mcp/atomic-edit/audit-atomicity.mjs`
- `opencode.json` e `.opencode/plugin/workspace-gates.ts` foram alterados/removidos apenas no worktree isolado para configurar o grupo NORMAL.

## Decisao

Entrega nominal aceita pelo worker, mas rejeitada como completa pelo orquestrador: o teste sintetico independente de coarse offender provou que a deteccao de `coarse_unjustified` foi enfraquecida.

## Validacao

- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: exit 0 no caminho nominal.
- `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`: exit 1 no caminho nominal strict.
- `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 73 passed, 0 failed no worktree.
- Teste sintetico `native-edit` coarse: falhou o aceite esperado; retornou exit 0 quando deveria retornar exit 1.
- Teste sintetico fallback: retornou exit 1 corretamente.

## Benchmarks

- Tempo produtivo na tela OpenCode: ~5m33s.
- Diff alvo: `37 insertions / 15 deletions`.
- Word-diff alvo: 4.660 bytes.
- RSS OpenCode na amostra comparavel: ~443.904KB.

## Risco Residual

Sem hard-case sintetico obrigatorio, o worker normal declarou aceite completo mesmo enfraquecendo enforcement. Nao usar self-report como criterio final.

## Recomendacao

Na proxima rodada A/B, incluir testes sinteticos obrigatorios de coarse offender, fallback offender e atomic-positive no prompt e na validacao independente.
