# AB-NORMAL-087 Handoff

- Status: accepted_baseline_functional_green_with_atomic_loss
- Prompt recebido: repetir router bounded com gate explicito de preservacao de escopo usando OpenCode normal sem atomic-edit.
- Worktree: `/private/tmp/kloel-ab087-normal-20260517170700`
- Arquivos lidos: `AGENTS.md`, prompt da rodada, `backend/src/kloel/unified-agent.service.ts`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Hipotese inicial: o normal poderia repetir o shape `toolRouterDeps()` e manter vantagem de service line count.
- Decisao tomada: baseline funcional aceito, mas perdeu a rodada para o ATOMIC em todas as metricas materiais exceto helper line count.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan e scope-preservation scan.
- Evidencia antes/depois: `executeToolAction` saiu do service; helper externo foi criado; `private num` e `private buildAgentToolEnvelope` permaneceram no service.
- Benchmark: eventos `114`, primeira acao `24.601ms`, tempo total `811.633ms`, comandos `14`, failed commands `5`, input/output/reasoning `72.417/10.141/11.206`, service `585`, helper `211`, total Kloel lines `796`, source churn `453`, traces `0`.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; sem erro Kloel associado ao round.
- Recomendacao: usar como baseline funcional do tier fechado; proxima rodada deve escalar apenas um degrau.
