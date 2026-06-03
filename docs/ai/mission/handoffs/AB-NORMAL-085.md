# AB-NORMAL-085

- Status: rejected_scope_preservation_fail_baseline_functional_only
- Prompt recebido: extrair apenas `UnifiedAgentService.executeToolAction` para
  `backend/src/kloel/unified-agent-tool-router.helpers.ts`, usando OpenCode
  normal sem atomic-edit.
- Arquivos lidos: prompt do round, `AGENTS.md`,
  `backend/src/kloel/unified-agent.service.ts`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`
  e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Hipotese inicial: o normal poderia manter aceite funcional e competir em
  shape de decomposicao de router.
- Decisao tomada: rejeitar como entrega equivalente por violacao de escopo; o
  lane passou Jest, mas removeu tambem `num` e `buildAgentToolEnvelope` do
  service, que nao eram parte da intencao.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck,
  diff-check, protected diff, suppression scan, helper no-`this.` scan,
  private-method scan e scope-preservation scan.
- Evidencia: eventos `136`, comandos `16`, failed commands `5`, input
  `81.616`, output `9.885`, reasoning `6.869`, service `568`, helper `233`,
  total Kloel lines `801`, source churn `492`, traces `0`.
- Benchmark: venceu apenas service line count bruto; perdeu preservacao de
  escopo, linhas totais, churn, tempo, comandos, failed commands, tokens e
  traceability.
- Risco residual: typecheck global falhou por ruido compartilhado de Google
  Ads/Prisma; `sharedTypecheckNoiseOnly=true`.
- Recomendacao: repetir o tier com gate explicito de preservar `num` e
  `buildAgentToolEnvelope`; nao usar este lane como baseline final equivalente.
