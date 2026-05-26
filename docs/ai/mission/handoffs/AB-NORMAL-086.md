# AB-NORMAL-086

- Status: accepted_baseline_functional_green_one_service_metric_win
- Prompt recebido: repetir a extracao bounded de `executeToolAction` para
  `unified-agent-tool-router.helpers.ts`, preservando `num` e
  `buildAgentToolEnvelope`, usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`
  e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck,
  diff-check, protected diff, suppression scan, helper no-`this.` scan,
  private-method scan e scope-preservation scan.
- Evidencia: eventos `112`, comandos `13`, failed commands `0`, input
  `68.965`, output `9.492`, reasoning `7.449`, service `565`, helper `282`,
  total Kloel lines `847`, source churn `498`, traces `0`,
  `scopePreservationPass=true`.
- Benchmark: venceu apenas `serviceLines`; perdeu eventos, tempo, comandos,
  tokens, linhas totais, churn e traceability.
- Risco residual: typecheck global falhou por ruido compartilhado de Google
  Ads/Prisma; total product surface ficou maior que ATOMIC.
- Recomendacao: usar a ideia de `toolRouterDeps()` como vantagem a converter em
  macro atomico.
