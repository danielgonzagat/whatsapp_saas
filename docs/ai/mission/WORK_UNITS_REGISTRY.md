# Work Units Registry

## ORCH-ATOMIC-AB-BENCH-126

- Status: rejected_atomic_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers em `UnifiedAgentService` apos o
  hard-gate de residuo estrutural do service, provando se o ATOMIC fecha o
  contrato funcional contra baseline NORMAL completo.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab126-normal-20260518105544`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab126-atomic-20260518105544`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; passou o contrato externo completo.
  - ATOMIC: rejeitado por falha de politica de validacao intermediaria; abortou
    apos extrair apenas runtime helper e deixou residuos estruturais no service.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-126/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-126/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-126/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-126/typecheck-normal.log`.
  - `docs/ai/atomic-os-benchmark/round-126/typecheck-atomic.log`.
  - `docs/ai/atomic-os-benchmark/round-126/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-126.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-126.md`.
- Gates externos:
  - NORMAL: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
    touched Kloel typecheck errors `0`, diff-check `0`, protected diff vazio,
    suppression/helper/private scans limpos.
  - ATOMIC: focused Jest `13/13`, backend typecheck `0`, touched Kloel
    typecheck errors `0`, diff-check `0`, protected diff vazio,
    suppression/helper scans limpos, mas focused ESLint `1` e private/residual
    service scan vermelho.
- Vitorias ATOMIC: completion, `atomicModeClean=true`, native file violations
  `0`, eventos `3` vs `131`, primeira acao `3.028s` vs `16.225s`, agent time
  `63.744s` vs `1.007.770s`, comandos `1` vs `11`, failed commands `1` vs
  `3`, input/output/reasoning `52.936/176/158` vs `80.892/16.271/10.893`,
  traces `11` vs `0`.
- Vitoria NORMAL: unico lane task-functional; removeu todos os residuos
  estruturais do service e passou lint final.
- Derrota atomica formalizada: `runKloelUnifiedAgentValidation` rodou focused
  ESLint como gate final durante extracao parcial. Isso transformou um erro
  intermediario corrigivel em abort prematuro da macro-transacao.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  agora executa focused ESLint dentro de `runKloelUnifiedAgentValidation` so
  quando `includeEslint === true` ou em perfil final com
  `enforceFinalServiceResidue`; o service-residue final gate continua duro.
- Nivel de prova: N4 local para derrota funcional atomica e reparo de politica
  intermediaria; N4 comparavel de superioridade atomica no tier sete helpers
  segue pendente.
- Risco residual: o reparo ainda precisa ser provado em nova rodada OpenCode
  com a mesma tarefa.
- Criterio de revalidacao: Round 127 deve repetir a mesma complexidade; ATOMIC
  so pode ser aceito se `atomicTaskFunctionalPass=true`, lint final verde,
  residual service scan limpo e `atomicModeClean=true`.

## ORCH-ATOMIC-AB-BENCH-125

- Status: rejected_atomic_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers em `UnifiedAgentService` com NORMAL
  compacto para obter baseline completo e julgar o ATOMIC contra uma lane
  factory-mode funcional.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-normal-20260518101630`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab125-atomic-20260518101630`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; passou o contrato externo completo.
  - ATOMIC: rejeitado por residuo estrutural `toolRouterDeps` no service,
    apesar de vencer custo/tempo/churn/trace.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-125/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-125/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-125/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-125/typecheck-normal.log`.
  - `docs/ai/atomic-os-benchmark/round-125/typecheck-atomic.log`.
  - `docs/ai/atomic-os-benchmark/round-125/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-125.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-125.md`.
- Gates externos:
  - NORMAL: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
    diff-check `0`, protected diff vazio, suppression scan limpo, helper
    `this.` scan limpo, private/residual service scan limpo.
  - ATOMIC: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
    diff-check `0`, protected diff vazio, suppression scan limpo, helper
    `this.` scan limpo, mas private/residual service scan encontrou
    `toolRouterDeps` em 5 pontos.
- Vitorias ATOMIC: primeira acao `3.269s` vs `27.763s`, agent time
  `227.626s` vs `1.228.031s`, eventos `3` vs `160`, comandos `1` vs `13`,
  failed commands `0` vs `3`, input tokens `62.593` vs `81.394`,
  output/reasoning tokens `124/401` vs `18.914/15.508`, service lines `383`
  vs `441`, total Kloel lines `951` vs `1.075`, source churn `1.054` vs
  `1.212`, traces `63` vs `0`, `atomicModeClean=true`.
- Vitoria NORMAL: unico lane task-functional; removeu residuo `toolRouterDeps`
  que o ATOMIC deixou no service.
- Derrota atomica formalizada: `validate_kloel_unified_agent` nao continha
  hard gate padrao para residuos de facade do service e aceitou preprompt exit
  `0` com `toolRouterDeps` presente.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  agora roda focused ESLint dentro de `validate_kloel_unified_agent` e injeta
  checks padrao para `toolRouterDeps`, `routerDeps`, `get routerDeps`,
  `validateAbiPayload`, `forEachSequential(`, `buildPredecidedActionDraft(` e
  `executePredecidedAgentActions`.
- Nivel de prova: N4 local para derrota funcional atomica e reparo do
  validador; N4 comparavel de superioridade atomica no tier sete helpers ainda
  pendente.
- Risco residual: o reparo precisa ser provado em um novo A/B OpenCode, nao so
  por probe pos-fato no worktree rejeitado.
- Criterio de revalidacao: Round 126 deve repetir a mesma tarefa com toolchain
  sincronizada; ATOMIC so pode ser aceito se o service-residue gate passar e
  nenhuma metrica material ficar pior que NORMAL.

## ORCH-ATOMIC-AB-BENCH-124

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers em `UnifiedAgentService` com
  `lineBudgetChecks` e `sourceChurnBudgetChecks` advisory, provando que o
  hardcode operacional do Round 123 foi removido sem enfraquecer gates
  funcionais.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab124-normal-20260518095022`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab124-atomic-20260518095022`
- Resultado dos workers:
  - NORMAL: rejeitado como baseline completo; atingiu `max_timeout` e deixou
    `1` erro de typecheck em arquivo tocado.
  - ATOMIC: aceito como recuperacao limpa de politica advisory; completou com
    preprompt exit `0` e todos os gates focados verdes.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-124/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-124/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-124/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-124/typecheck-normal.log`.
  - `docs/ai/atomic-os-benchmark/round-124/typecheck-atomic.log`.
  - `docs/ai/atomic-os-benchmark/round-124/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-124.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-124.md`.
- Gates externos:
  - NORMAL: focused Jest `13/13`, focused ESLint `0`, diff-check `0`,
    protected diff vazio e scans estruturais verdes, mas touched Kloel
    typecheck errors `1`.
  - ATOMIC: focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck
    errors `0`, diff-check `0`, protected diff vazio, suppression scan limpo,
    helper `this.` scan limpo, private helper residual scan limpo, public API/
    incoming/tool-call/predecided scans limpos.
- Vitorias ATOMIC aceitas: completion, primeira acao `3.850s` vs `25.049s`,
  agent time `228.352s` vs `1.201.138s`, eventos `3` vs `107`, comandos `1`
  vs `12`, failed commands `0` vs `6`, input tokens `62.598` vs `74.875`,
  output/reasoning tokens `151/281` vs `14.221/19.036`, typecheck tocado
  `0` vs `1`, traces `63` vs `0`, `atomicModeClean=true`.
- Vitorias NORMAL: nenhuma aceita, porque a lane ficou incompleta e vermelha
  em typecheck tocado.
- Metricas de shape registradas sem comparacao final: ATOMIC service/total
  lines `383/951` e churn `1054`; NORMAL service/total lines `444/1040` e
  churn `1121`, mas `shapeComparisonEligible=false`.
- Ferramenta/politica validada: budgets line/churn advisory preservam a
  medicao (`951/940`, `1054/1010`) sem derrubar a lane quando o gate e
  explicitamente advisory; funcionalidade e seguranca continuam hard gates.
- Nivel de prova: N4 local para recuperacao de politica atomica no tier sete
  helpers; N4 comparavel contra NORMAL completo ainda pendente.
- Risco residual: o baseline NORMAL precisa completar sem timeout e sem erro de
  typecheck tocado antes de escalar.
- Criterio de revalidacao: Round 125 deve repetir a mesma tarefa com prompt
  NORMAL compacto/timeout-aware, mantendo ATOMIC atomic-only e validacao externa
  simetrica; nao escalar ainda.

## ORCH-ATOMIC-AB-BENCH-123

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar controladamente para sete helpers em `UnifiedAgentService`,
  extraindo tambem o branch de `predecidedActions.length > 0` para
  `unified-agent-predecided-processing.helpers.ts`.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab123-normal-20260518091851`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab123-atomic-20260518091851`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; perdeu todas as metricas materiais.
  - ATOMIC: vitoria comparativa forte aceita, mas nao zero-loss limpo porque o
    preprompt saiu `1` por budget absoluto fixo.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-123/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-123/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-123/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-123/typecheck-normal.log`.
  - `docs/ai/atomic-os-benchmark/round-123/typecheck-atomic.log`.
  - `docs/ai/atomic-os-benchmark/round-123/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-123.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-123.md`.
- Gates externos: focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, diff-check `0`, protected diff vazio, suppression scan
  limpo, helper `this.` scan limpo, private helper residual scan limpo,
  public API/incoming/tool-call/predecided scans limpos; typecheck global ainda
  vermelho apenas por ruido Google Ads/Prisma fora de `src/kloel/**`.
- Vitorias ATOMIC: eventos `3` vs `101`, primeira acao `2.955s` vs `13.719s`,
  agent time `205.358s` vs `1.158.972s`, comandos `1` vs `12`, failed commands
  `1` vs `4`, input tokens `53.161` vs `101.442`, output/reasoning tokens
  `158/175` vs `14.802/17.431`, service lines `383` vs `410`, total Kloel
  lines `951` vs `1007`, source churn `1054` vs `1108`, traces `63` vs `0`,
  `atomicModeClean=true`.
- Vitorias NORMAL: nenhuma metrica material nao empatada.
- Derrota atomica formalizada: `lineBudgetChecks`/`sourceChurnBudgetChecks`
  estavam como hard gate absoluto (`940/1010`), logo reprovaram um resultado
  menor que o baseline NORMAL.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  ganhou suporte a budget advisory (`advisory`, `mode: advisory` ou
  `severity: advisory`) para line/churn checks; funcionalidade, governance,
  diff, scans e testes continuam gates duros.
- Nivel de prova: N4 local para funcionalidade e comparacao de shape/custo no
  tier sete helpers, exceto fechamento zero-loss limpo porque o preprompt
  atomico teve exit `1`.
- Risco residual: global typecheck segue vermelho fora do escopo; Round 124
  precisa provar que a remocao do hardcode operacional nao mascara regressao.
- Criterio de revalidacao: repetir a mesma tarefa no Round 124 com budgets
  advisory e so escalar se ATOMIC sair com preprompt exit `0` e mantiver zero
  perdas materiais.

## ORCH-ATOMIC-AB-BENCH-122

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de seis helpers em `UnifiedAgentService` apos a
  compactacao do output do preprompt atomico, provando que a derrota de input
  tokens do Round 121 foi removida.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab122-normal-20260518085114`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab122-atomic-20260518085114`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito, mas sem vitoria material.
  - ATOMIC: vitoria forte zero-loss aceita; fecha o tier seis helpers para
    escalada controlada.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-122/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-122/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-122/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-122/typecheck-normal.log`.
  - `docs/ai/atomic-os-benchmark/round-122/typecheck-atomic.log`.
  - `docs/ai/atomic-os-benchmark/round-122/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-122.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-122.md`.
- Gates externos: focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, diff-check `0`, protected diff vazio, suppression scan
  limpo, helper `this.` scan limpo, private helper residual scan limpo,
  public API/incoming/tool-call-processing scans limpos; typecheck global ainda
  vermelho apenas por ruido Google Ads/Prisma fora de `src/kloel/**`.
- Vitorias ATOMIC: eventos `3` vs `122`, primeira acao `2.979s` vs `13.347s`,
  agent time `199.780s` vs `1.015.369s`, comandos `1` vs `14`, failed commands
  `0` vs `4`, input tokens `62.863` vs `94.838`, output/reasoning tokens
  `141/452` vs `13.584/13.578`, service lines `413` vs `434`, total Kloel
  lines `888` vs `923`, source churn `899` vs `960`, traces `56` vs `0`,
  `atomicModeClean=true`.
- Vitorias NORMAL: nenhuma metrica material nao empatada.
- Nivel de prova: N4 local para funcionalidade e comparacao de shape/custo no
  tier seis helpers, com worktrees isolados, gates focados e audit reproduzivel.
- Risco residual: global typecheck segue vermelho fora do escopo; a proxima
  escala pode revelar novo limite de macro-operador.
- Criterio de revalidacao: Round 123 deve escalar um degrau e so permitir nova
  escala se ATOMIC repetir zero-loss com gates externos verdes.

## ORCH-ATOMIC-AB-BENCH-121

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar controladamente o A/B para seis helpers em
  `UnifiedAgentService`, extraindo tambem o loop de tool calls para
  `unified-agent-tool-call-processing.helpers.ts`.
- Workspaces:
  - NORMAL:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab121-normal-20260518082636`
  - ATOMIC:
    `/Users/danielpenin/kloel-ab-worktrees/kloel-ab121-atomic-20260518082636`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; ganhou apenas input tokens.
  - ATOMIC: vitoria forte aceita, mas nao zero-loss por derrota em input tokens.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-121/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-121/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-121/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-121/verdict.md`.
  - `docs/ai/mission/handoffs/AB-NORMAL-121.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-121.md`.
- Gates externos: focused Jest `13/13`, focused ESLint `0`,
  touched Kloel typecheck errors `0`, diff-check `0`, protected diff vazio,
  helper `this.` scan limpo, public API/incoming/tool-call-processing scans
  limpos; typecheck global ainda vermelho apenas por ruido Google Ads/Prisma.
- Vitorias ATOMIC: eventos `3` vs `122`, primeira acao `4.401s` vs `17.709s`,
  agent time `254.037s` vs `871.830s`, comandos `1` vs `12`, failed commands
  `0` vs `4`, output/reasoning tokens `204/299` vs `15.467/6.749`, service
  lines `413` vs `424`, total Kloel lines `888` vs `922`, source churn `899`
  vs `949`, traces `56` vs `0`, `atomicModeClean=true`.
- Vitoria NORMAL: input tokens `77.601` vs `96.974`.
- Derrota atomica formalizada: `preprompt-shell` devolvia o log completo do
  macro (`136.518` bytes) ao modelo, desperdicando input tokens apesar de ja
  persistir o log em arquivo.
- Ferramenta atualizada: `opencode-round-watchdog.cjs` agora devolve apenas
  resumo compacto em sucesso e guarda o log completo em
  `opencode-atomic-preprompt-output.log`; falha ainda recebe tail limitado.
- Nivel de prova: N4 local para funcionalidade e comparacao de shape/custo no
  tier seis helpers, exceto input tokens onde ATOMIC ainda perdeu.
- Risco residual: global typecheck segue vermelho fora do escopo; Round 122
  precisa provar que a compactacao reduz input tokens sem perda funcional.
- Criterio de revalidacao: repetir a mesma tarefa no Round 122 e so escalar se
  ATOMIC vencer ou empatar todas as metricas materiais, incluindo input tokens.

## ANAT-PULSE-GRAPH-001

- Status: validated
- Modo: ANATOMICO
- Patologia: PULSE ausente/incompleto no grafo Obsidian.
- Classe anatomica: ORFAO FALSO de tomografia; a maquina PULSE existia no repo, mas `.pulse/**` estava excluido do mirror.
- Escopo tocado:
  - `scripts/obsidian-mirror-daemon-constants.mjs`
  - `scripts/__parts__/obsidian-mirror-daemon-utils.mjs`
  - `scripts/__parts__/obsidian-mirror-daemon-content.mjs`
  - vault mirror em `~/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo/_source/`
- Antes:
  - Manifest: `.pulse/**` = 0.
  - `.pulse/current/PULSE_PROPERTY_EVIDENCE.json` nao aparecia como no do grafo.
- Depois:
  - Manifest: `.pulse/**` = 91.
  - Manifest: `source/pulse-machine` = 697.
  - Manifest total reconciliado: 5.591 arquivos.
  - Arquivos grandes PULSE viram notas `metadata_only` com hash real e sem copiar corpo gigante; 20 entradas `metadata_only`.
- Evidencia:
  - `node scripts/obsidian-mirror-daemon.mjs --rebuild --force`: primeira reconciliacao 5.586 updated, 0 errors; apos ledger/docs, 5.591 updated, 0 errors.
  - `node scripts/obsidian-mirror-daemon.mjs --validate`: 5.591 OK.
  - Revalidacao delta 2026-05-16 12:10 encontrou drift de `AGENTS.md` no mirror (`5590 OK, 1 changed`); `--rebuild --force` reconciliou 5.591 entradas e `--validate` voltou a `5591 OK`.
  - Manifest: `.pulse/**` = 91, `scripts/pulse/**` = 536, `backend/src/pulse/**` = 26, root `PULSE_*` = 44.
- Nivel de prova: N4 anatomico, porque houve medicao antes/depois reproduzivel no organismo real do mirror.
- Risco residual:
  - Bridge live do Obsidian indisponivel nesta sessao; cache visual pode precisar reload manual/app quando o bridge voltar.
  - Arquivos `.pulse/**` sem extensao ou padroes pulados continuam fora se forem filtrados por politica de mirror; isso e aceitavel enquanto a maquina principal aparece.
- Criterio de revalidacao:
  - `node scripts/obsidian-mirror-daemon.mjs --validate`
  - consultar manifest e exigir `.pulse/** > 0` e `source/pulse-machine > 0`.

## ANAT-PULSE-RUNTIME-002

- Status: validated_parcial
- Modo: ANATOMICO / VALIDACAO
- Problema: probe runtime PULSE apontava para `GET /health/liveness`, rota que em producao caia no handler protegido e retornava 401.
- Antes: `PULSE_RUNTIME_EVIDENCE.json` tinha 4 probes executados, 3 passed, 1 failed.
- Depois: `health-liveness` aponta para `GET /health/live`; `PULSE_BACKEND_URL=https://api.kloel.com npm run pulse:probes` passou com 4/4.
- Revalidacao delta 2026-05-16 12:10: `PULSE_BACKEND_URL=https://api.kloel.com npm run pulse:probes` escreveu `.pulse/current/PULSE_RUNTIME_EVIDENCE.json` com `4/4 probes executed, 4 passed, 0 failed (100% coverage)`.
- Nivel de prova: N3/N4 estreito para runtime health probes contra servico real; nao e certificacao global PULSE.
- Risco residual: `npm run pulse:json` foi interrompido apos travar sem saida; certificacao global continua nao declaravel.

## ANAT-PULSE-FINAL-003

- Status: in_progress
- Modo: VALIDACAO / ANATOMICO
- Problema: rota formal `production-final --final --json` parecia travar sem saida, e health probes 4/4 estavam sendo confundidos com readiness global.
- Hipotese testada: o comando nao necessariamente trava; pode estar rodando fases longas sem stdout e sem trace canônico em `.pulse/current`.
- Reproducao:
  - Primeira tentativa com limite 180s: log stdout/stderr ficou com 0 bytes; processo foi encerrado pelo limite local; nenhum processo residual.
  - Segunda tentativa com `PULSE_EXECUTION_TRACE_PATH=.pulse/current/PULSE_EXECUTION_TRACE.live.json PULSE_PERFECTNESS_DEBUG=1` e limite 300s: trace mostrou progresso real ate `scan:certification:parity-and-vision`.
  - Terceira tentativa com o mesmo trace e limite 600s: `parity-and-vision` concluiu, mas `scan:perfectness` ainda estava running no limite.
  - Reproducao isolada de `buildExecutionHarness(process.cwd())`: concluiu em 130.482ms, sem travar, gerando 904 targets / 904 generated tests / 555 executable targets.
- Evidencia:
  - `scan:core-parsers`: passed em 33.829ms.
  - `scan:truth`: passed em 97.183ms.
  - `scan:certification:final`: passed em 26.316ms, `NOT_CERTIFIED`, score 55.
  - `scan:certification:parity-and-vision`: ainda running quando o limite local de 300s encerrou a tentativa; stdout ainda 0 bytes.
  - Tentativa 600s: `scan:certification:parity-and-vision` passed em 223.957ms; `scan:perfectness` running no encerramento; log mostrava inicio de `execution-harness`.
  - Execucao isolada de `execution-harness`: status 0, `durationMs=130482`, `totalTargets=904`, `generatedTestCount=904`, `executableTargets=555`.
- Nivel de prova: N3 diagnostico local; nao certifica production-final.
- Decisao:
  - Nao declarar `production-final` travado apenas por stdout vazio.
  - Nao declarar PULSE global pronto; a propria certificacao final parcial continua `NOT_CERTIFIED`.
- Risco residual:
  - Trace padrao local vai para estado de aplicacao fora de `.pulse/current` quando `PULSE_EXECUTION_TRACE_PATH` nao e definido; isso reduz fiscalizacao por artefato repo-local.
  - A fase `perfectness` agrega modulos lentos sem stdout suficiente; `execution-harness` sozinho consome ~130s e o formal completo precisa de budget maior que 600s ou de split por modulo.
- Proxima validacao:
  - Rodar a mesma rota com `PULSE_EXECUTION_TRACE_PATH=.pulse/current/PULSE_EXECUTION_TRACE.live.json` e budget de 15-20 minutos, ou instrumentar progresso/timeout por modulo de `scan:perfectness` sem tocar governance/protegidos.
  - Registrar se `scan:perfectness` conclui, falha ou ultrapassa um limite reprodutivel.

## META-MISSION-LEDGER-001

- Status: in_progress
- Modo: DOCUMENTACAO DE ESTADO
- Objetivo: inicializar ledger, registry, scope tree, graveyard e handoffs sem inventar progresso.
- Evidencia atual: estes arquivos em `docs/ai/mission/`.
- Validacao recebida: dois workers OpenCode de PULSE readiness aceitos; workers sem handoff rejeitados; mirror Obsidian reconciliado e validado em 2026-05-16 12:43 com 5.592 fontes.
- Proxima validacao: apos qualquer novo boletim/ledger, revalidar mirror e garantir que `docs/ai/mission/**` nao fique divergente.

## ORCH-OPENCODE-HANDOFF-001

- Status: validated
- Modo: DOCUMENTACAO DE ESTADO / DELEGACAO
- Objetivo: provar que OpenCode interativo consegue produzir auditoria util e que entregas sem handoff sao rejeitadas.
- Antes:
  - `SUBAGENT_HANDOFFS.md` nao tinha handoffs aceitos.
  - Primeira onda tinha workers sem handoff final ou com saida parcial.
- Depois:
  - `OC-PULSE-READINESS-001` aceito como auditoria PULSE readiness.
  - `OC-PULSE-READINESS-002` aceito como auditoria PULSE readiness independente.
  - Micro-onda 2026-05-16 13:30: 4/4 workers OpenCode em `deepseek/deepseek-v4-pro` entregaram handoff persistido e foram aceitos.
  - Workers `OC-LEDGER-AUDIT-001`, `OC-OBSIDIAN-GRAPH-001`, `OC-ORCHESTRATION-001`, `OC-PRODUCT-PROOF-001`, `OC-OBSIDIAN-GRAPH-002` e `OC-PRODUCT-PROOF-002` rejeitados por ausencia de handoff persistido/final aceitavel.
- Evidencia:
  - Handoffs persistidos em `docs/ai/mission/handoffs/OC-SWARM-CONTEXT-AUDIT-001.md`, `OC-SWARM-LEASE-COLLISION-001.md`, `OC-SWARM-OPENCODE-RUNTIME-001.md` e `OC-SWARM-MISSION-ROUTER-001.md`.
  - `ps -axo pid,ppid,stat,command | rg -i 'opencode|deepseek' || true`: nenhum worker OpenCode restante apos limpeza.
  - Handoffs aceitos em `SUBAGENT_HANDOFFS.md`.
- Nivel de prova: N3 operacional para micro-onda local; nao e prova de escala 20-50.
- Risco residual:
  - Worker de runtime tentou ler config externa de OpenCode e encontrou prompt de permissao; a leitura foi recusada pelo orquestrador, e o handoff foi aceito com essa ressalva.
  - Host local 16GB esta com pressao de memoria/swap; escalar localmente para 20-50 workers e inseguro.
  - Lease topology PULSE ainda tem monolito de ~580 arquivos e leases phantom; nao ha seguranca operacional para implementacao paralela massiva.
  - Sem handoff persistido, worker nao conta como entrega aceita.
- Criterio de revalidacao:
  - Disparar nova micro-onda 3-5 read-only com contratos mais estreitos.
  - Exigir handoff final em arquivo/saida antes de aceitar qualquer resultado.

## ORCH-ATOMIC-AB-BENCH-079

- Status: validated_confirm_before_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de metodos de classe com dependencia de instancia apos a derrota atomica do Round 078.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab079-normal-20260517143719`
  - ATOMIC: `/private/tmp/kloel-ab079-atomic-20260517143719`
- Problema real escolhido: extrair `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` de `UnifiedAgentService` para helper externo, preservando comportamento e convertendo `this.agentRuntime` em parametro explicito.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional, Jest `13/13`, helper sem `this.`, private methods removidos, mas usou native file tools, teve 1 comando falho e gerou zero traces.
  - ATOMIC: aceito como vitoria decisiva, preprompt macro exit `0`, Jest `13/13`, helper sem `this.`, private methods removidos, `atomicModeClean=true` e `.atomic/traces=12`.
- Vitorias NORMAL:
  - Baseline funcional valido.
  - Formato multiline mais legivel no helper, ainda sem scorecard formal.
- Vitorias ATOMIC:
  - Eventos `3` vs `98`.
  - Primeira acao `6.939ms` vs `22.533ms`.
  - Tempo total `56.641ms` vs `386.740ms`.
  - Comandos `1` vs `11`.
  - Failed commands `0` vs `1`.
  - Input/output/reasoning tokens `53.610/105/98` vs `67.401/5.601/2.215`.
  - Service/helper/source churn `701/40/86` vs `704/49/100`.
  - Traceabilidade `12` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-079/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-079/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-079/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-079/verdict.md`.
- Nivel de prova: N3/N4 local para a classe de benchmark; N4 limitado por repetibilidade em worktrees isolados e validacao focada, mas typecheck global permanece ruidoso fora do escopo.
- Risco residual:
  - `round-audit.cjs` ainda transforma ruido typecheck compartilhado em `functionalPass=false`.
  - A vitoria precisa ser repetida uma vez antes de escalar, porque o Round 078 imediatamente anterior foi uma derrota funcional.
- Criterio de revalidacao:
  - Round 080 com a mesma tarefa, mesmos gates e mesmo operador.
  - Escalar somente se ATOMIC mantiver aceite focado verde, `atomicModeClean=true`, zero failed commands, trace isolation e nenhuma derrota operacional medida.

## ORCH-ATOMIC-AB-BENCH-080

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: confirmar estabilidade do tier de dependencia de instancia antes de escalar.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab080-normal-20260517145141`
  - ATOMIC: `/private/tmp/kloel-ab080-atomic-20260517145141`
- Problema real escolhido: repetir a extracao de `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para helper externo com dependencia explicita de `AgentRuntimeContextService`.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional, mas sem vitoria medida.
  - ATOMIC: aceito como fechamento do tier; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu todas as metricas operacionais medidas.
- Vitorias NORMAL:
  - Nenhuma metrica medida no scorecard do Round 080.
- Vitorias ATOMIC:
  - Eventos `3` vs `92`.
  - Primeira acao `6.122ms` vs `21.380ms`.
  - Tempo total `58.938ms` vs `380.512ms`.
  - Comandos `1` vs `13`.
  - Failed commands `0` vs `1`.
  - Input/output/reasoning tokens `53.587/168/129` vs `82.302/5.419/3.380`.
  - Service/helper/source churn `701/40/86` vs `704/49/100`.
  - Traceabilidade `12` vs `0` e disciplina atomic-only limpa.
- Ferramenta atualizada:
  - `round-audit.cjs` agora separa `taskFunctionalPass`, `globalFunctionalPass`, `sharedTypecheckNoiseOnly`, `typecheckErrorCount` e `typecheckKloelErrorCount`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-080/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-080/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-080/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-080/verdict.md`.
- Nivel de prova: N4 local para o tier de benchmark, com repeticao em dois worktrees isolados (Rounds 079/080) e validacao focada reproduzivel.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - O proximo tier pode revelar limites de per-method adapters em extracao mista.
- Criterio de revalidacao:
  - Round 081 deve escalar um degrau para extracao mista de metodos puros e metodos dependentes de instancia, sem abrir escopo para `executeToolAction` inteiro ainda.

## ORCH-ATOMIC-AB-BENCH-081

- Status: validated_confirm_before_next_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: testar per-method adapters em uma extracao mista de metodos puros e metodos dependentes de instancia.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab081-normal-20260517150722`
  - ATOMIC: `/private/tmp/kloel-ab081-atomic-20260517150722`
- Problema real escolhido: extrair `actionSucceeded`, `num`, `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para `backend/src/kloel/unified-agent-private.helpers.ts`.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional, mas com cinco failed commands e sem vitoria medida.
  - ATOMIC: aceito como vitoria decisiva do tier misto; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu todas as metricas operacionais medidas.
- Vitorias NORMAL:
  - Nenhuma metrica medida no scorecard.
- Vitorias ATOMIC:
  - Eventos `3` vs `100`.
  - Primeira acao `5.386ms` vs `17.360ms`.
  - Tempo total `60.741ms` vs `371.223ms`.
  - Comandos `1` vs `13`.
  - Failed commands `0` vs `5`.
  - Input/output/reasoning tokens `54.405/101/285` vs `82.722/5.798/2.071`.
  - Service/source churn `690/116` vs `693/134`.
  - Traceabilidade `19` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-081/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-081/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-081/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-081/verdict.md`.
- Nivel de prova: N4 local para primeira execucao do tier misto; precisa de repeticao antes de fechar o tier.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - Ainda nao ha prova de decomposicao do router `executeToolAction`.
- Criterio de revalidacao:
  - Round 082 deve repetir o mesmo tier misto.
  - Escalar para router apenas se ATOMIC mantiver aceite focado verde, `atomicModeClean=true`, zero failed commands e nenhuma derrota operacional medida.

## ORCH-ATOMIC-AB-BENCH-082

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: confirmar o tier misto single-target antes de escalar para multi-modulo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab082-normal-20260517151801`
  - ATOMIC: `/private/tmp/kloel-ab082-atomic-20260517151801`
- Problema real escolhido: repetir extracao de `actionSucceeded`, `num`, `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para `backend/src/kloel/unified-agent-private.helpers.ts`.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional, mas sem vitoria medida.
  - ATOMIC: aceito como fechamento do tier; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu todas as metricas operacionais medidas.
- Vitorias NORMAL:
  - Nenhuma metrica medida no scorecard.
- Vitorias ATOMIC:
  - Eventos `3` vs `99`.
  - Primeira acao `4.909ms` vs `19.520ms`.
  - Tempo total `61.403ms` vs `442.439ms`.
  - Comandos `1` vs `13`.
  - Failed commands `0` vs `1`.
  - Input/output/reasoning tokens `54.377/112/296` vs `74.125/5.902/3.282`.
  - Service/source churn `690/116` vs `692/132`.
  - Traceabilidade `19` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-082/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-082/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-082/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-082/verdict.md`.
- Nivel de prova: N4 local para o tier misto single-target, repetido em Rounds 081/082.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - Multi-modulo ainda nao provado.
- Criterio de revalidacao:
  - Round 083 deve escalar para duas transacoes atomicas coordenadas: helpers puros em um modulo e runtime helpers em outro.

## ORCH-ATOMIC-AB-BENCH-083

- Status: validated_confirm_before_next_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: testar o tier multi-modulo: separar metodos puros e metodos runtime de `UnifiedAgentService` em helpers distintos.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab083-normal-20260517153044`
  - ATOMIC: `/private/tmp/kloel-ab083-atomic-20260517153044`
- Problema real escolhido:
  - Extrair `actionSucceeded` e `num` para `backend/src/kloel/unified-agent-action.helpers.ts`.
  - Extrair `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional e venceu apenas service line count por uma linha.
  - ATOMIC: aceito como vitoria operacional de primeira passada; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu quase todas as metricas.
- Vitorias NORMAL:
  - Service line count `688` vs `689`.
- Vitorias ATOMIC:
  - Eventos `3` vs `188`.
  - Primeira acao `5.222ms` vs `22.469ms`.
  - Tempo total `68.738ms` vs `857.071ms`.
  - Comandos `1` vs `25`.
  - Failed commands `0` vs `3`.
  - Input/output/reasoning tokens `54.959/185/386` vs `75.502/11.080/9.250`.
  - Source churn `118` vs `136`.
  - Traceabilidade `22` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-083/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-083/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-083/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-083/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-083.md` e `docs/ai/mission/handoffs/AB-ATOMIC-083.md`.
- Nivel de prova: N4 local para primeira execucao multi-modulo, com dois worktrees isolados e validacao focada externa; precisa de repeticao antes de fechar o tier.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - ATOMIC ainda perdeu service line count por uma linha.
- Atualizacao aplicada:
  - `extract_class_methods_to_file` agora compacta tambem o gap terminal de quatro quebras antes do `}` final da classe.
  - Probe descartavel confirmou service `688` linhas apos as duas transacoes multi-modulo, empatando o NORMAL, com validacao focada embutida verde.
- Criterio de revalidacao:
  - Round 084 deve repetir exatamente o tier multi-modulo.
  - Escalar somente se ATOMIC empatar/vencer service line count e manter aceite focado verde, `atomicModeClean=true`, zero failed commands, trace isolation e margem operacional ampla.

## ORCH-ATOMIC-AB-BENCH-084

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: confirmar o tier multi-modulo apos o reparo de gap terminal do operador.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab084-normal-20260517155640`
  - ATOMIC: `/private/tmp/kloel-ab084-atomic-20260517155640`
- Problema real escolhido:
  - Repetir a extracao de `actionSucceeded` e `num` para `unified-agent-action.helpers.ts`.
  - Repetir a extracao de `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para `unified-agent-runtime-context.helpers.ts`.
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional, mas sem vitoria medida.
  - ATOMIC: aceito como fechamento zero-loss do tier multi-modulo; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu todas as metricas operacionais relevantes.
- Vitorias NORMAL:
  - Nenhuma metrica medida; empatou apenas failed commands `0/0` e touched files `3/3`.
- Vitorias ATOMIC:
  - Eventos `3` vs `107`.
  - Primeira acao `5.203ms` vs `20.598ms`.
  - Tempo total `60.055ms` vs `499.020ms`.
  - Comandos `1` vs `13`.
  - Input/output/reasoning tokens `55.031/106/243` vs `85.304/6.181/4.888`.
  - Service line count `688` vs `692`.
  - Source churn `119` vs `132`.
  - Traceabilidade `22` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-084/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-084/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-084/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-084/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-084.md` e `docs/ai/mission/handoffs/AB-ATOMIC-084.md`.
- Nivel de prova: N4 local para o tier multi-modulo, com repeticao em Round083/084 e validacao focada externa.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - O proximo salto deve continuar bounded; ainda nao ha prova de router completo.
- Criterio de revalidacao:
  - Escalar no Round 085 para uma decomposicao parcial controlada maior que o tier multi-modulo, sem atacar o router inteiro.
  - Se ATOMIC perder qualquer metrica relevante, formalizar derrota e converter em operador/politica antes de nova escala.

## ORCH-ATOMIC-AB-BENCH-085

- Status: validated_repeat_same_tier_before_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: testar um degrau bounded de router extraction, movendo apenas `executeToolAction` para helper externo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab085-normal-20260517161619`
  - ATOMIC: `/private/tmp/kloel-ab085-atomic-20260517161619`
- Problema real escolhido:
  - Extrair `UnifiedAgentService.executeToolAction` para `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
  - Preservar `num` e `buildAgentToolEnvelope` no service, porque nao eram parte da intencao desta rodada.
- Resultado dos workers:
  - NORMAL: passou Jest focado `13/13`, mas foi rejeitado como entrega equivalente porque removeu tambem `num` e `buildAgentToolEnvelope` do service.
  - ATOMIC: aceito como primeira vitoria do tier router bounded; passou aceite focado, manteve `atomicModeClean=true`, preservou helpers nao-alvo e gerou traces.
- Vitorias NORMAL:
  - Service line count bruto `568` vs `584`, mas essa vitoria e classificada como nao-decisiva porque veio de superficie fora do escopo.
- Vitorias ATOMIC:
  - Scope preservation `true` vs `false`.
  - Total Kloel lines `792` vs `801`.
  - Eventos `3` vs `136`.
  - Primeira acao `5.006ms` vs `20.699ms`.
  - Tempo total `53.732ms` vs `704.773ms`.
  - Comandos `1` vs `16`.
  - Failed commands `0` vs `5`.
  - Input/output/reasoning tokens `52.895/180/173` vs `81.616/9.885/6.869`.
  - Source churn `445` vs `492`.
  - Traceabilidade `7` vs `0` e disciplina atomic-only limpa.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-085/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-085/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-085/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-085/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-085.md` e `docs/ai/mission/handoffs/AB-ATOMIC-085.md`.
- Ferramenta atualizada:
  - `round-audit.cjs` agora mede `totalKloelLines`, `toolRouterHelperLines`, `scopePreservationPass` e `scopePreservationWinner`, para impedir que um lane ganhe por reduzir o arquivo principal mexendo fora da intencao.
- Nivel de prova: N3/N4 local para primeira execucao router bounded, com worktrees isolados e validacao externa; repetir antes de escalar porque o baseline normal nao foi equivalente.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - O tier ainda precisa de uma repeticao onde ambos lanes tenham gate explicito de preservacao de escopo.
- Criterio de revalidacao:
  - Round 086 deve repetir a mesma tarefa com gate explicito: remover apenas `executeToolAction`, preservar `num` e `buildAgentToolEnvelope`, manter touched Kloel files `2`, Jest focado verde, scope preservation pass e `atomicModeClean=true`.
  - Escalar somente se ATOMIC repetir vitoria ampla sem derrota material.

## ORCH-ATOMIC-AB-BENCH-086

- Status: validated_repeat_same_tier_one_metric_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o router bounded com gate explicito de preservacao de escopo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab086-normal-20260517164000`
  - ATOMIC: `/private/tmp/kloel-ab086-atomic-20260517164000`
- Resultado dos workers:
  - NORMAL: aceito como baseline funcional e agora preservou `num`/`buildAgentToolEnvelope`; venceu apenas `serviceLines`.
  - ATOMIC: aceito como vitoria ampla com uma perda material restante em `serviceLines`.
- Vitorias NORMAL:
  - Service line count `565` vs `584`, por agrupar dependencias em `toolRouterDeps()`.
- Vitorias ATOMIC:
  - Eventos `3` vs `112`.
  - Primeira acao `5.221ms` vs `31.586ms`.
  - Tempo total `65.755ms` vs `748.290ms`.
  - Comandos `1` vs `13`.
  - Input/output/reasoning tokens `53.003/126/455` vs `68.965/9.492/7.449`.
  - Total Kloel lines `792` vs `847`.
  - Source churn `445` vs `498`.
  - Traceabilidade `7` vs `0` e disciplina atomic-only limpa.
- Empates:
  - Jest focado, scope preservation, failed commands `0/0`, touched files `2/2`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-086/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-086/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-086/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-086/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-086.md` e `docs/ai/mission/handoffs/AB-ATOMIC-086.md`.
- Ferramenta atualizada:
  - `atomic-call.cjs` adicionou `requiredTextChecks`.
  - `extract_class_methods_to_file` adicionou `postRemovalReplacements`, permitindo inserir adapters compactos no source apos remover o metodo.
  - Probe descartavel de dependency-builder passou Jest `13/13`, preservou helpers e reduziu ATOMIC para `570` service lines / `791` total lines.
- Nivel de prova: N4 local para repeticao do tier com baseline equivalente; ainda nao fecha o tier porque ha perda material em service line count.
- Criterio de revalidacao:
  - Round 087 deve repetir a mesma tarefa usando dependency-builder + callsite predecided compacto.
  - Escalar somente se ATOMIC empatar/vencer `serviceLines` e mantiver todas as vitorias/empates restantes.

## ORCH-ATOMIC-AB-BENCH-087

- Status: validated_atomic_zero_loss_router_bounded_tier
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o router bounded com dependency-builder atomico, `postRemovalReplacements` e callsite compacto para eliminar a perda de `serviceLines`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab087-normal-20260517170700`
  - ATOMIC: `/private/tmp/kloel-ab087-atomic-20260517170700`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; passou Jest focado e preservou `num`/`buildAgentToolEnvelope`, mas teve cinco failed commands e perdeu todas as metricas materiais exceto helper line count.
  - ATOMIC: aceito como fechamento zero-loss do tier router bounded; passou aceite focado, preservou escopo, manteve `atomicModeClean=true` e gerou traces.
- Vitorias NORMAL:
  - Helper line count `211` vs `221`; nao e material porque veio junto de service maior, total maior, churn maior, failed commands e ausencia de trace.
- Vitorias ATOMIC:
  - Service line count `562` vs `585`.
  - Total Kloel lines `783` vs `796`.
  - Source churn `432` vs `453`.
  - Eventos `3` vs `114`.
  - Primeira acao `7.438ms` vs `24.601ms`.
  - Tempo total `65.986ms` vs `811.633ms`.
  - Comandos `1` vs `14`.
  - Failed commands `0` vs `5`.
  - Input/output/reasoning tokens `53.093/116/175` vs `72.417/10.141/11.206`.
  - Traceabilidade `8` vs `0` e disciplina atomic-only limpa.
- Empates:
  - Jest focado, scope preservation e touched files `2/2`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-087/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-087/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-087/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-087/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-087.md` e `docs/ai/mission/handoffs/AB-ATOMIC-087.md`.
- Nivel de prova: N4 local para fechamento do tier router bounded, com baseline equivalente, worktrees isolados, validacao externa, scope preservation e repeticao apos lapida de ferramenta.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - Escala local massiva 20-50 segue bloqueada por limites de host; a escala permitida agora e de complexidade da tarefa em dois lanes.
- Criterio de revalidacao:
  - Round 088 deve escalar um degrau controlado de router/decomposicao, mantendo dois OpenCode workers simultaneos, worktrees isolados, validacao externa, `atomicModeClean=true`, zero regressao de escopo e handoffs persistidos.

## ORCH-ATOMIC-AB-BENCH-088

- Status: validated_atomic_zero_loss_router_cluster_tier
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau alem do Round 087, extraindo o cluster router `executeToolAction`, `num` e `buildAgentToolEnvelope` para helper externo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab088-normal-20260517171947`
  - ATOMIC: `/private/tmp/kloel-ab088-atomic-20260517171947`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito; passou aceite focado e corrigiu seu proprio erro `exactOptionalPropertyTypes`, mas perdeu todas as metricas materiais.
  - ATOMIC: aceito como vitoria zero-loss do tier router cluster; passou aceite focado, manteve `atomicModeClean=true`, preservou escopo residual e gerou traces.
- Vitorias NORMAL:
  - Nenhuma metrica material medida; empatou apenas aceite funcional e touched files.
- Vitorias ATOMIC:
  - Service line count `544` vs `568`.
  - Helper line count `232` vs `234`.
  - Total Kloel lines `776` vs `802`.
  - Source churn `459` vs `497`.
  - Eventos `3` vs `112`.
  - Primeira acao `6.217ms` vs `23.804ms`.
  - Tempo total `73.333ms` vs `652.667ms`.
  - Comandos `1` vs `12`.
  - Failed commands `0` vs `1`.
  - Input/output/reasoning tokens `55.827/201/522` vs `73.895/11.225/5.874`.
  - Traceabilidade `15` vs `0` e disciplina atomic-only limpa.
- Empates:
  - Jest focado, typecheck Kloel sem erro, protected diff, scans de escopo e touched files `2/2`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-088/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-088/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-088/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-088/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-088.md` e `docs/ai/mission/handoffs/AB-ATOMIC-088.md`.
- Nivel de prova: N4 local para o tier router cluster, com worktrees isolados, validacao externa, baseline funcional equivalente e vitoria atomica sem perda material.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - Escala local massiva 20-50 segue bloqueada por limites de host; a proxima escala continua sendo complexidade da tarefa.
- Criterio de revalidacao:
  - Round 089 pode escalar um degrau controlado de decomposicao no mesmo organismo, mantendo dois workers, isolamento, handoff e validacao externa.

## ORCH-ATOMIC-AB-BENCH-089

- Status: validated_atomic_functional_win_with_lint_residual
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau alem do Round 088, extraindo o cluster router mais `actionSucceeded` para helper externo e preservando `buildAgentRuntimeContext` / `recordAgentRuntimeTurn`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab089-normal-20260517173646`
  - ATOMIC: `/private/tmp/kloel-ab089-atomic-20260517173646`
- Resultado dos workers:
  - NORMAL: baseline funcional aceito pela validacao externa, mas atingiu `max_timeout` do watchdog e acumulou failed commands.
  - ATOMIC: aceito como vitoria funcional do tier; passou aceite focado, manteve `atomicModeClean=true`, gerou traces e venceu quase todas as metricas materiais.
- Vitorias NORMAL:
  - Lint extra nos dois arquivos tocados teve menos residuos (`5` erros vs `15` no ATOMIC), embora ambos tenham falhado lint.
- Vitorias ATOMIC:
  - Watchdog `completed` vs `max_timeout`.
  - Helper line count `240` vs `245`.
  - Total Kloel lines `778` vs `783`.
  - Source churn `477` vs `500`.
  - Eventos `3` vs `136`.
  - Primeira acao `5.478ms` vs `19.864ms`.
  - Tempo total `70.511ms` vs `885.733ms`.
  - Comandos `1` vs `19`.
  - Failed commands `0` vs `5`.
  - Input/output/reasoning tokens `56.188/192/18` vs `92.021/11.444/6.693`.
  - Traceabilidade `18` vs `0` e disciplina atomic-only limpa.
- Empates:
  - Jest focado, typecheck Kloel sem erro, protected diff, scans de escopo, touched files `2/2` e service lines `538/538`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-089/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-089/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-089/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-089/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-089.md` e `docs/ai/mission/handoffs/AB-ATOMIC-089.md`.
- Nivel de prova: N3/N4 local para o tier router+classifier; vitoria funcional com worktrees isolados e validacao externa, mas sem zero-loss por lint extra.
- Risco residual:
  - Global typecheck continua vermelho fora do escopo por Google Ads/Prisma.
  - Lint extra falhou em ambos os lanes; o ATOMIC teve mais residuos de formatacao.
- Derrota atomica formalizada:
  - `extract_class_methods_to_file` ainda nao aplicava formatacao/lint atomica apos gerar helper.
- Ferramenta atualizada:
  - `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` agora aceita `formatWithEslint` / `lintFix` / `autoFixLint` e chama `atomic_apply_eslint_dry_run_fixes` antes da validacao.
- Criterio de revalidacao:
  - Round 090 deve repetir exatamente a mesma dificuldade com `formatWithEslint=true`; nao escalar ate o ATOMIC vencer tambem o eixo lint ou registrar claramente qualquer residuo restante.

## ORCH-GITNEXUS-DEEPSEEK-001

- Status: validated
- Modo: VALIDACAO / DELEGACAO
- Objetivo: configurar DeepSeek V4 Pro como LLM operacional das integracoes GitNexus disponiveis sem gravar segredo no repo, e validar comportamento real.
- Escopo tocado:
  - Config local de usuario do GitNexus fora do repositorio.
  - Repo temporario de smoke em `/private/tmp/`.
- Antes:
  - GitNexus podia analisar o repo, mas nao havia prova nesta sessao de LLM DeepSeek funcionando no fluxo de wiki/generation.
- Depois:
  - Config GitNexus local resolve provider `custom`, model `deepseek-v4-pro`, base URL DeepSeek `/v1`, com chave presente fora do repo.
  - LLM direct smoke retornou exatamente `OK`.
  - Fluxo real `gitnexus wiki` em repo temporario gerou wiki completa com 2 paginas.
- Evidencia:
  - `resolveLLMConfig` + `callLLM`: `ok=true`, `model=deepseek-v4-pro`, `content=OK`, `elapsedMs=3208`.
  - `gitnexus analyze . --skip-agents-md` no repo temporario: 2 nodes, 1 edge.
  - `gitnexus wiki . --force --concurrency 1`: `Wiki generated successfully (77.5s)`, `Pages: 2`, artefatos `overview.md`, `greeting.md`, `index.html`, `meta.json`.
- Nivel de prova: N3 operacional; execucao real de cliente LLM e fluxo GitNexus wiki sem usuario final.
- Risco residual:
  - `npx -y gitnexus@latest doctor` e `--version` falharam por erro do wrapper npm (`Cannot destructure property 'package' of 'node.target' as it is null`), mas a CLI cacheada executou `analyze` e `wiki` com sucesso.
  - Segredo vive em config local de usuario, nao em docs/ledger/repo.
- Criterio de revalidacao:
  - Rodar novo `gitnexus wiki` pequeno ou direct `callLLM` sem imprimir segredo.

## ORCH-LEASE-TOPOLOGY-001

- Status: validated_parcial
- Modo: VALIDACAO / ANATOMICO
- Objetivo: auditar se a topologia de leases/context fabric permite enxame OpenCode produtivo sem colisao.
- Evidencia:
  - `OC-SWARM-CONTEXT-AUDIT-001`: contexto fresco, GitNexus ready, Beads ready, mas escala 20-50 rejeitada por handoff historico baixo, lease grande e risco de conflito operacional.
  - `OC-SWARM-LEASE-COLLISION-001`: 10 leases, `pulse-worker-01` com 580 arquivos, cinco phantom leases com 0 owned files, quatro leases pequenos disjuntos; nenhum protected file nos owned sets.
- Nivel de prova: N3 auditoria operacional por artefatos reais.
- Decisao:
  - Nao escalar implementacao massiva ate quebrar o monolito, expirar phantoms e reduzir readOnly bloat.
  - Proxima onda pode usar apenas workers read-only ou dominios pequenos/disjuntos.
- Risco residual: a geracao PULSE pode sobrescrever qualquer ajuste manual de lease; precisa corrigir a fonte geradora antes de contar como cura.

## ORCH-RUNTIME-CAPACITY-001

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO
- Objetivo: medir capacidade local para manter pool OpenCode supervisionado.
- Evidencia:
  - `OC-SWARM-OPENCODE-RUNTIME-001`: OpenCode 1.14.48, modelo DeepSeek V4 Pro disponivel, atomic-edit MCP conectado.
  - Host com 16GB RAM, swap ~91% usado durante auditoria, poucos MB/centenas de MB livres conforme snapshot; 5 processos `.opencode` consumindo centenas de MB cada.
  - Apos limpeza do orquestrador, `ps ... | rg 'opencode (serve|run)'` retornou vazio.
- Nivel de prova: N3 operacional.
- Decisao:
  - Capacidade local atual nao sustenta 20-50 workers ativos simultaneos com seguranca.
  - Para o alvo massivo, usar host dedicado >=32GB ou liberar RAM/swap antes de nova onda.
- Risco residual: metricas de memoria variam; revalidar antes de qualquer nova onda.

## ORCH-OPENCODE-ATOMIC-ONLY-001

- Status: validated
- Modo: VALIDACAO / DELEGACAO
- Objetivo: garantir que OpenCode so possa mutar codigo pelo modo atomico, sem native `Write`/`Edit`/Bash mutation em arquivos de codigo.
- Antes:
  - Worker `OC-ATOMIC-ONLY-VALIDATION-001` provou falha critica: native `write`, Bash Python `Path.write_text`, Bash Node `fs.writeFileSync` e `rm` em `.ts` foram permitidos.
  - `.opencode/plugin/workspace-gates.ts` existia, mas o formato exportado nao era plugin OpenCode valido; OpenCode carregava a instrucao atomica como guia, nao como gate operacional.
- Reparos:
  - `scripts/mcp/atomic-edit/atomic-only-hook.mjs` passou a detectar mutacoes Bash por `sed -i`, `perl -i`, `awk > code`, `tee code`, redirecionamento para codigo, `cp/mv/install` para codigo, `rm/unlink/truncate/touch` de codigo e writes runtime de Python/Node/Ruby/PHP/Deno/Bun.
  - `.opencode/plugins/workspace-gates.ts` passou a exportar plugin OpenCode valido para `tool.execute.before`, normalizando args OpenCode e chamando `atomic-only-hook.mjs` + gates de preflight.
  - `.opencode/plugin/workspace-gates.ts` virou reexport compat do plugin valido.
  - `opencode.json` passou a resolver `permission.edit` como `deny`.
- Depois:
  - `opencode debug config --print-logs --log-level DEBUG` mostrou plugin carregado sem erro e `permission.edit: "deny"`.
  - Worker `OC-ATOMIC-ONLY-VALIDATION-002`, rodando com `--dangerously-skip-permissions`, teve native code mutation negada e Bash Python code write negado.
  - Arquivo de bypass `scripts/mcp/atomic-edit/.opencode-native-bypass-test.ts` permaneceu ausente.
- Evidencia:
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 83 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: `atomic_edit_ratio=0.5616`, `fallback_rate=0`, `coarse_unjustified=0`, `pass=false` por threshold historico de ratio acumulado.
  - Direct hook negou Bash Python write, Bash Node write, `rm` e native `Edit` em `.ts`; leitura Bash Python sem mutacao permitida.
  - Worker 002 confirmou denial no runtime OpenCode e ausencia do arquivo de bypass.
- Nivel de prova: N4 local para enforcement OpenCode em runtime real reproduzivel; nao e prova de escala massiva 20-50.
- Risco residual:
  - `permission.edit=deny` impede handoff via native `Write`; workers devem entregar handoff por saida final ou via caminho permitido sem snippets de mutacao de codigo no heredoc.
  - O plugin precisa permanecer carregado por `opencode debug config`; se OpenCode mudar API de plugin/hook, revalidar antes de escalar.
  - `audit-atomicity` ainda nao passa o threshold historico de ratio acumulado, mas nao encontrou fallback nem coarse edit injustificado; nao usar esse score sozinho como prova de runtime OpenCode.
- Criterio de revalidacao:
  - `opencode debug config --print-logs --log-level DEBUG | rg -n "workspace-gates|permission|error=|failed" -C 2`
  - Worker canario com `--dangerously-skip-permissions` deve tentar native write e Bash Python write em `.ts`; ambos devem ser negados e o arquivo nao deve existir.

## ORCH-ATOMIC-AB-BENCH-001

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: executar A/B real com dois workers OpenCode simultaneos em worktrees isolados, mesma missao complexa, NORMAL sem atomic-edit vs ATOMIC somente com atomic-edit.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab-20260516-141634/normal`
  - ATOMIC: `/tmp/kloel-opencode-ab-20260516-141634/atomic`
- Problema real escolhido: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` falhava por `atomic_edit_ratio` baixo mesmo quando `fallback_rate=0` e `coarse_unjustified=0`; a tarefa era separar enforcement de ratio advisory e adicionar `--strict-ratio`.
- Resultado dos workers:
  - NORMAL: completou nominalmente em ~5m33s produtivos; diff alvo `37 insertions / 15 deletions`; word-diff 4.660 bytes; adicionou `strictRatio` no JSON; falhou o teste sintetico independente de coarse offender.
  - ATOMIC: completou nominalmente em ~4m24s produtivos; diff alvo `35 insertions / 14 deletions`; word-diff 4.901 bytes; usou MCP atomic-edit; falhou o mesmo teste sintetico independente de coarse offender.
- Vitorias NORMAL:
  - Incluiu `strictRatio` no JSON de saida na primeira entrega.
  - Menor word-diff no alvo medido, embora com mais linhas alteradas.
  - Menor memoria total se o MCP atomic-edit externo for contabilizado junto ao processo ATOMIC.
- Vitorias ATOMIC:
  - Menor tempo produtivo de tela (~69s mais rapido; ~20,7%).
  - Menor RSS do processo OpenCode na amostra comparavel (~406.800KB vs ~443.904KB), sem contar MCP externo.
  - Mutacoes de codigo rastreadas por MCP atomic-edit e gates atomic-only; sem native code mutation no alvo.
  - Diff alvo ligeiramente menor por linhas (`35/14` vs `37/15`).
- Derrota comum:
  - Ambos enfraqueceram a deteccao de `coarse_unjustified` ao tratar relacao numerica como prova atomica; teste sintetico `native-edit` com `changedChars=5`, `lineRewriteSurfaceChars=120`, `lineRewriteAvoided=false` retornou exit 0 nos dois worktrees antes do reparo principal.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/audit-atomicity.mjs` agora separa `enforcementPass`, `ratioPass` e `pass`.
  - `--strict-ratio` torna ratio baixo bloqueante; modo normal mantem ratio como advisory quando enforcement passa.
  - Coarse/fallback real continuam hard-fail.
  - Trace atomico positivo e aceito somente quando `operator` comeca por `atomic`, `fallback=false` e `expansionFactorAvoided > 1`.
- Evidencia pos-reparo:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: exit 0, `enforcementPass=true`, `ratioPass=false`, `pass=true`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`: exit 1, `enforcementPass=true`, `ratioPass=false`, `pass=false`.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 86 passed, 0 failed.
  - Teste sintetico coarse `native-edit`: exit 1, `coarse_unjustified=1`, `enforcementPass=false`.
  - Teste sintetico fallback: exit 1, `fallback_rate=1`, `enforcementPass=false`.
  - Teste sintetico atomic-positive: exit 0, `atomic_edit_ratio=1`, `enforcementPass=true`.
- Nivel de prova: N3 operacional local; prova real de workers + validacao sintetica independente, mas ainda nao e prova estatistica nem vitoria ampla do atomic.
- Risco residual:
  - A rodada usou uma unica tarefa; nao sustenta conclusao universal.
  - `opencode run --interactive` manteve tela ativa apos conclusao, exigindo kill de processos ja concluidos para liberar RAM.
  - O worktree ATOMIC carrega diffs de setup atomic-only alem do alvo por partir de HEAD sem os reparos locais ja feitos no main workspace.
- Criterio para proxima rodada:
  - A missao deve incluir testes sinteticos de hard-fail antes do aceite.
  - Vitoria atomica so pode ser declarada se superar NORMAL em tempo, taxa de aceite independente, ausencia de regressao semantica, superficie de diff, rastreabilidade e validacao, nao apenas em um eixo.

## ORCH-ATOMIC-AB-BENCH-002

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B real em worktrees isolados com a mesma missao complexa, agora exigindo `--self-test` no auditor de atomicidade.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab2-20260516-143948/normal`
  - ATOMIC: `/tmp/kloel-opencode-ab2-20260516-143948/atomic`
- Problema real escolhido: o auditor precisava de self-test nativo para impedir que a falha escondida da rodada 1 voltasse.
- Resultado dos workers:
  - NORMAL: criou um caminho `auditDir` compartilhado e self-test com traces sinteticos; passou validacoes principais no worktree; mutou mais codigo, usou escrita temporaria em disco e deixou bug potencial no output textual (`offenders` vs `worstOffenders`).
  - ATOMIC: usou ferramentas atomicas e self-test em memoria; passou o proprio self-test e smoke; duplicou a logica do caminho real, marcou o caso `native-coarse` como `fallback=true` e contaminou `.atomic/traces` do worktree com artefato sintetico, fazendo o audit default falhar.
- Vitorias NORMAL:
  - Melhor intuicao arquitetural de compartilhar caminho de auditoria.
  - Hard-case `native-coarse` com `fallback=false` apareceu corretamente no self-test do worker.
  - Nao ficou bloqueado pelo gate atomic-only para gerar artefatos de teste.
- Vitorias ATOMIC:
  - Self-test em memoria, sem dependencia de diretorio temporario.
  - Menor invasao inicial e uso visivel de ferramentas atomicas.
  - A falha sob atomic-only revelou requisito real: validacao de ferramenta precisa funcionar sem Bash write de artefatos.
- Derrotas atomicas formalizadas:
  - Duplicacao de logica entre self-test e caminho real.
  - Caso `native-coarse` nao representava a falha critica porque usou `fallback=true`.
  - Loop de validacao ficou preso sob restricoes atomic-only.
  - Artefato sintetico persistido em `.atomic/traces` contaminou o audit real do worktree.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/audit-atomicity.mjs` agora tem `evaluateTrace` e `auditTraces` compartilhados pelo caminho real e pelo self-test.
  - `--self-test` roda inteiramente em memoria e cobre native coarse sem fallback, fallback real e atomic positive.
  - O output textual usa `report.traces` e `report.worstOffenders`, removendo dependencia de variaveis internas antigas.
- Evidencia pos-reparo:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`: exit 0, `selfTestPass=true`, 3/3.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test`: exit 0, `self-test: PASS (3/3)`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: exit 0, `enforcementPass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `ratioPass=false`, `pass=true`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`: exit 1 esperado, `pass=false` por ratio historico.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 88 passed, 0 failed.
  - `git diff --check`: limpo.
- Nivel de prova: N3 operacional local; prova de comparacao real + self-test reproduzivel, ainda sem superioridade ampla do atomic.
- Criterio para proxima rodada:
  - Usar `--self-test` como pre-aceite obrigatorio.
  - Escolher tarefa de topologia de preservacao que force anchor map: renomear propriedade mantendo valor, trocar callee mantendo args, wrapper mantendo conteudo ou mover simbolo preservando corpo.
  - Medir contaminacao de trace, self-termination, taxa de aceite independente e prova de preservacao, alem de tempo/diff/memoria.

## ORCH-ATOMIC-AB-BENCH-003

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B real em worktrees isolados com a mesma missao complexa, agora exigindo metricas de topologia de preservacao no auditor de atomicidade.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab3-20260516-1508/normal`
  - ATOMIC: `/tmp/kloel-opencode-ab3-20260516-1508/atomic`
- Problema real escolhido: o auditor precisava medir se cada trace prova a topologia da mudanca: unidade alvo, impacto semantico, zonas preservadas e zonas modificadas.
- Resultado dos workers:
  - NORMAL: smoke 73/73; nao deixou traces atomicos reais no worktree; implementou campo `topology` fora do contrato real do MCP e `--strict-topology` nao foi provado pelo self-test.
  - ATOMIC: self-test proprio passou e gerou traces atomicos, mas smoke no worktree ficou 86/88; falhou por ambiente ESLint no worktree e por trace sem topologia real. Hidden validation `--self-test --strict-topology --json` retornou exit 1.
- Vitorias NORMAL:
  - Menor friccao de ambiente no worktree isolado.
  - Smoke nominal 73/73 sem falha.
  - Implementacao nao contaminou `.atomic/traces` do worktree normal.
- Vitorias ATOMIC:
  - Gerou evidencia de trace real, ao contrario do normal.
  - Escolheu um contrato mais proximo do principio de topologia do que o campo `topology` do normal.
  - Expos a falha que importa para a proxima melhoria: o runtime ainda precisa elevar coverage topologico real.
- Derrotas atomicas formalizadas:
  - Self-termination ruim: ambos exigiram encerramento do orquestrador apos produzir codigo.
  - Smoke ATOMIC falhou 2/88 no worktree isolado.
  - Self-test ATOMIC acoplou caso sem topologia ao modo estrito e quebrou reexecucao.
  - Topologia real dos traces acumulados ainda e baixa no repo principal.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/audit-atomicity.mjs` agora mede topologia pelo contrato real de trace no nivel raiz (`targetUnit`, `semanticImpact`, `preservedZones`, `modifiedZones`).
  - Adicionou compatibilidade defensiva para tentativas anteriores `preservationTopology` e `topology`.
  - Adicionou `--strict-topology`, `topologyCoverage`, `missingTopology`, `topologyPass` e self-test em memoria com `expectedTopologyPass`.
  - O self-test ficou isolado de flags globais para validar o auditor; a auditoria real continua falhando em strict quando traces historicos nao cumprem o criterio.
- Evidencia pos-reparo:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`: exit 0, `selfTestPass=true`, 4/4.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --strict-topology --json`: exit 0, `selfTestPass=true`, 4/4.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --strict-ratio --json`: exit 0, `selfTestPass=true`, 4/4.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: exit 0, `enforcementPass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `topologyCoverage=0.3272`, `topologyPass=false`, `pass=true`, `missingTopologyCount=218` em 324 traces.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-topology --json`: exit 1 esperado por traces historicos sem topologia.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`: exit 1 esperado por ratio historico.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 90 passed, 0 failed.
  - `git diff --check -- scripts/mcp/atomic-edit/audit-atomicity.mjs`: limpo.
- Nivel de prova: N3 operacional local; comparacao real + auditoria de traces, mas ainda sem superioridade ampla do atomic.
- Criterio para proxima rodada:
  - Nao escalar complexidade.
  - Proxima melhoria deve aumentar cobertura topologica real e reduzir a lacuna `missingTopology` sem apagar historico; parte da lacuna vem de servidores MCP long-running antigos ainda emitindo trace sem topologia.
  - A proxima A/B deve medir se o modo atomic vence normal em trace completo, self-termination, tempo, smoke, diff e aceite independente.

## ORCH-ATOMIC-TOPOLOGY-CURRENT-004

- Status: validated_parcial
- Modo: VALIDACAO / ATOMIC_TOOLING
- Objetivo: tornar o auditor de atomicidade confiavel como juiz do loop A/B, separando divida topologica historica de divida corrente e impedindo truncamento de relatorio JSON grande.
- Problema real escolhido:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` produzia stdout cortado em 65.536 bytes quando o relatorio crescia, porque o script chamava `process.exit()` logo depois de `console.log(JSON.stringify(...))`.
  - Traces atuais ainda apareciam sem topologia mesmo depois de `dist/trace.js` conter `targetUnit`, `semanticImpact`, `preservedZones` e `modifiedZones`, indicando emissores MCP long-running/stale.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/audit-atomicity.mjs` agora usa `writeJsonAndExit(...)` com callback de `process.stdout.write` para relatorios JSON grandes.
  - O auditor adicionou `--strict-current-topology`, `topologySchemaFirstSeenAt`, `currentTraceCount`, `currentTopologyCoverage`, `currentTopologyPass`, `currentMissingTopology`, `legacyMissingTopology` e `staleTopologyEmitterSuspected`.
  - O total `missingTopology` continua visivel; o novo split nao apaga divida historica, apenas separa o que e legado do que continua sendo emitido depois da primeira topologia valida.
- Evidencia pos-reparo:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`: exit 0, `selfTestPass=true`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`: stdout parseavel completo; exit 0, `pass=true`, `currentTraceCount=418`, `currentTopologyCoverage=0.689`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-current-topology --json`: exit 1 esperado, `currentMissingTopologyCount=130`, `staleTopologyEmitterSuspected=true`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-topology --json`: exit 1 esperado, `missingTopologyCount=312`, `legacyMissingTopologyCount=189`.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 98 passed, 0 failed.
  - `git diff --check -- scripts/mcp/atomic-edit/audit-atomicity.mjs docs/ai/mission`: limpo.
- Nivel de prova: N3 operacional local; prova de auditor e runtime MCP fresco, mas ainda nao prova que todos os servidores long-running foram reciclados.
- Decisao:
  - Nao escalar complexidade da tarefa A/B enquanto `currentTopologyPass=false`.
  - Nao encerrar processos MCP/worker sem dono claro apenas para limpar o numero; primeiro isolar lifecycle/canario e registrar handoff.
- Proxima validacao:
  - Identificar e encerrar somente emissores stale pertencentes a rodadas ja finalizadas, ou reiniciar sessoes controladas para provar que traces novos chegam com topologia.
  - Reexecutar `--strict-current-topology --json`; aceite so quando `currentMissingTopologyCount=0` para o periodo controlado.

## ORCH-ATOMIC-AB-DIAG-CODEX-004

- Status: rejected_as_official_benchmark / diagnostic_only
- Modo: VALIDACAO / ATOMIC_TOOLING
- Objetivo observado: comparar NORMAL vs ATOMIC em tarefa real de lint em `worker/**`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab13-normal-20260516170548`
  - ATOMIC: `/private/tmp/kloel-ab13-atomic-20260516170548`
- Motivo da rejeicao oficial:
  - Os processos ativos eram `codex exec`, nao workers OpenCode interativos.
  - Nao houve handoff persistido capturado.
  - O auditor do worktree estava antigo e ainda lia `docs/ai/traces` em vez de `.atomic/traces`, portanto o proprio worker nao mediu a prova atomica que gerou.
- Evidencia util apesar da rejeicao:
  - Ambos os worktrees passaram `npm --prefix worker run lint:check`.
  - Ambos passaram `npm --prefix worker run typecheck`.
  - Ambos passaram `git diff --check -- worker`.
  - Ambos passaram `npm --prefix worker test` com 45 files / 431 tests.
  - Ambos passaram `npm --prefix worker run build`.
  - NORMAL diff alvo: 24 files, 246 insertions, 126 deletions; word-diff 32.308 bytes.
  - ATOMIC diff alvo: 24 files, 251 insertions, 119 deletions; word-diff 32.278 bytes.
  - ATOMIC gerou 24 traces `.atomic/traces` com `atomic_apply_eslint_dry_run_fixes`, `topologyCoverage=1`, `fallbackRate=0`, `coarseUnjustified=0`, `atomicEditRatio=0.4167`, `meanExpansion=1.24`.
- Vitorias NORMAL:
  - Menos linhas inseridas e menos delecoes liquidas no diff alvo.
  - Sem dependencia de leitura posterior de traces atomicos para validar a propria entrega.
- Vitorias ATOMIC:
  - Menor word-diff medido por 30 bytes.
  - Trace atomico completo para 24 arquivos, com topologia preservada em 100% dos traces gerados.
  - Aplicou a classe de mudanca como transacao de fix lint controlada por MCP, sem fallback/coarse unjustificado nos traces.
- Conclusao:
  - Nao ha vitoria ampla de nenhum lado.
  - Nao escalar complexidade.
  - Proxima rodada oficial deve usar OpenCode interativo, handoff persistido, auditor atualizado, canario `strict-current-topology` e coleta de stdout/stream para medir self-termination e tempo real.

## VAL-PULSE-PERFECTNESS-SPLIT-001

- Status: planned
- Modo: VALIDACAO
- Objetivo: perfilar `scan:perfectness` por submodulo usando trace/harness ja disponiveis, sem editar governance, e propor split ou budget reprodutivel.
- Arquivos permitidos: leitura de `scripts/pulse/**` e `.pulse/current/PULSE_EXECUTION_TRACE.live.json`; escrita somente de handoff em `docs/ai/mission/handoffs/VAL-PULSE-PERFECTNESS-SPLIT-001.md`.
- Nivel de prova alvo: N3.
- Validacao: correlacionar trace com nomes/linhas de modulo especificos e nao declarar travamento sem evidencia temporal.

## VAL-CERT-GAP-MAP-001

- Status: planned
- Modo: VALIDACAO
- Objetivo: mapear gaps do certificado PULSE e classificar o menor subconjunto que sobe score de 55 para 70+.
- Arquivos permitidos: leitura de `.pulse/current/PULSE_CERTIFICATE.json`, `.pulse/current/PULSE_PROOF_READINESS.json`, `.pulse/current/PULSE_MACHINE_READINESS.json`; escrita somente de handoff.
- Nivel de prova alvo: N3.
- Validacao: extracao consistente de artefatos e categorias low/medium/hard.

## ANAT-DIRTY-WORKTREE-001

- Status: planned
- Modo: ANATOMICO
- Objetivo: classificar worktree sujo, divergencia de branch e superficies protegidas modificadas sem tocar arquivos.
- Arquivos permitidos: leitura git/ops protected file list; escrita somente de handoff.
- Nivel de prova alvo: N4 anatomico para listagem reproduzivel.
- Validacao: `git status --porcelain` cruzado com `ops/protected-governance-files.json`.

## ATOM-MCP-LITERAL-PREVIEW-001

- Status: validated
- Modo: VALIDACAO / ATOMIC_TOOLING / OPENCODE_RUNTIME
- Objetivo: corrigir e provar que `atomic_replace_literal` respeita `preview:true` e `expectedSha256`, sem escrever em disco no dry-run e com trace honesto.
- Antes:
  - Canary OpenCode `OC-ATOMIC-RUNTIME-004` executou missao dry-run e mesmo assim alterou `scripts/mcp/atomic-edit/audit-atomicity.mjs`, mudando `MICRO_CHANGE` de `32` para `33`.
  - O schema/handler de `atomic_replace_literal` nao expunha `preview`/`expectedSha256` e chamava `commit(...)` sem dry-run.
  - O trace de preview nao distinguia proposta de escrita real.
- Reparos:
  - `scripts/mcp/atomic-edit/server.ts`: `atomic_replace_literal` aceita `preview` e `expectedSha256`, aplica `guardSha`, e propaga `a.preview ?? false` para `commit`.
  - `scripts/mcp/atomic-edit/trace.ts`: trace inclui `preview`, `changed`, `afterSha256` real do conteudo persistido e `proposedSha256` do conteudo proposto; descricoes de preview dizem que a mudanca nao foi escrita.
  - `scripts/mcp/atomic-edit/smoke.ts`: adiciona regressao para literal preview dry-run e para trace preview `changed=false`.
  - O orquestrador reparou o canary drift (`MICRO_CHANGE = 32`) por fallback atomico standalone com `sha256` guard.
- Depois:
  - OpenCode canary `OC-ATOMIC-RUNTIME-005` confirmou que `atomic_replace_literal preview:true` preserva o arquivo com `'old'` e nao grava `'new'`.
  - Traces novos desde `2026-05-16T20:33:24.000Z` passam `--strict-current-topology` com cobertura 1.
  - Traces de preview recentes carregam `preview=true`, `changed=false`, `afterSha256` do conteudo em disco e `proposedSha256` do conteudo proposto.
- Evidencia:
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 101 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:33:24.000Z --strict-current-topology --json`: `pass=true`, `currentTraceCount=11`, `currentTopologyCoverage=1`, `currentMissingTopology=[]`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`: `selfTestPass=true`.
  - `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs`: exit 0.
  - `git diff --check -- scripts/mcp/atomic-edit/trace.ts scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts scripts/mcp/atomic-edit/audit-atomicity.mjs`: exit 0.
- Nivel de prova: N3/N4 local para runtime MCP + OpenCode canary; ainda nao prova A/B ampla contra modo normal.
- Risco residual:
  - A sessao Codex atual ainda nao tem o MCP `atomic-edit__*` disponivel como ferramenta direta apos lifecycle antigo; o fallback standalone funcionou, mas a proxima sessao deve reconectar/validar o MCP nativo Codex.
  - Rodadas A/B antigas continuam parcialmente contaminadas por traces historicos; usar janelas `--since` para provas correntes.
- Criterio de revalidacao:
  - Rodar smoke completo e canary OpenCode com `atomic_replace_literal preview:true` + `expectedSha256`.
  - Exigir `currentTopologyCoverage=1` e preview trace com `changed=false` antes de nova rodada A/B oficial.

## ORCH-ATOMIC-AB-BENCH-004

- Status: validated_parcial / atomic_delivery_rejected
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B oficial com dois workers OpenCode simultaneos em worktrees isolados, mesma missao complexa, NORMAL sem atomic-edit vs ATOMIC atomic-only, agora exigindo auditoria de honestidade de preview trace.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab4-20260516-1746/normal`
  - ATOMIC: `/tmp/kloel-opencode-ab4-20260516-1746/atomic`
- Problema real escolhido: `scripts/mcp/atomic-edit/audit-atomicity.mjs` precisava impedir que trace `preview:true` parecesse escrita real. Um preview honesto deve ter `changed:false`, nao pode afirmar rollback disponivel e deve ser hard-fail quando desonesto.
- Resultado dos workers:
  - NORMAL: implementou uma versao parcial util da ideia e passou `node --check`, `--self-test --json` e `git diff --check` no worktree; usou nome `previewEnforcementPass`, nao `previewHonestyPass`; smoke do worktree ficou contaminado pelo setup incompleto da copia isolada.
  - ATOMIC: nao conseguiu operar atomicamente porque o OpenCode nao expôs ferramentas MCP `atomic-edit` no tool list; tentou derivar para escrita Bash/Node proibida; o orquestrador interrompeu a sessao e rejeitou a entrega.
- Vitorias NORMAL:
  - Entregou codigo funcional parcial para o conceito de preview honesty.
  - Self-test local incluiu preview honesto e preview desonesto.
  - Manteve `node --check` e diff-check verdes no alvo.
- Vitorias ATOMIC:
  - Identificou a falha operacional mais importante do loop: atomic-only nao e suficiente se o worker nao enxerga as ferramentas MCP e nao tem fallback atomico ergonomico aprovado.
  - O gate/orquestrador impediu que a tentativa Bash/Node proibida fosse aceita como entrega.
- Derrotas atomicas formalizadas:
  - Falha de exposicao de ferramenta: OpenCode ATOMIC listou `bash`, `glob`, `grep`, `read`, `task`, etc., mas nao apresentou `mcp__atomic-edit__*`.
  - Falha de contrato do worker: ao nao ver o MCP, o worker nao parou nem usou fallback standalone atomico aprovado; tentou planejar escrita por Bash/Node.
  - Falha de entrega: self-test do worktree ATOMIC permaneceu no estado antigo de 4 casos e nao provou preview honesty.
  - Falha de benchmark: ATOMIC nao venceu e nao autoriza escalada de complexidade.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/audit-atomicity.mjs` adicionou `traceIsDishonestPreview`, `previewTraceCount`, `dishonestPreviewCount`, `dishonestPreviews` e `previewHonestyPass`.
  - `pass` agora exige preview honesty como hard-gate.
  - `--self-test` em memoria cobre `honest-preview` e `dishonest-preview-looks-committed`.
  - O output humano lista previews desonestos antes de falhas de coarse edit.
- Evidencia pos-reparo:
  - `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs`: exit 0.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`: exit 0, `selfTestPass=true`, 6/6; `dishonest-preview-looks-committed` falha o audit como esperado com `dishonestPreviewCount=1`.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 102 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:52:09.000Z --strict-current-topology --json`: exit 0, `pass=true`, `currentTraceCount=8`, `currentTopologyCoverage=1`, `previewHonestyPass=true`, `dishonestPreviewCount=0`.
  - `git diff --check -- scripts/mcp/atomic-edit`: exit 0.
  - `pgrep -fl 'opencode run|opencode serve'`: sem processos ativos.
- Nivel de prova: N3 operacional local; prova de A/B real supervisionado + reparo validado no repo principal, mas nao prova superioridade atomica ampla.
- Decisao:
  - Nao escalar complexidade.
  - Nao aceitar entrega ATOMIC sem prova de que a mutacao veio por MCP `atomic-edit` ou fallback standalone atomico explicitamente aprovado, com dry-run/hash guards quando aplicavel.
- Criterio para proxima rodada:
  - Canary OpenCode deve provar que o worker ATOMIC enxerga e usa `mcp__atomic-edit__*` ou que o fallback standalone atomico esta declarado e auditado no contrato.
  - Gate deve bloquear Bash/Node/Python write de codigo e tambem bloquear plano de escrita nao-atomica, nao apenas execucao final.
  - Repetir uma tarefa da mesma classe de complexidade ate ATOMIC vencer NORMAL em aceite independente, corretude, trace completo, preview honesty, validacao, tempo, memoria, diff, handoff e self-termination.

## OC-ATOMIC-TOOL-EXPOSURE-006

- Status: validated_with_residual_cleanup_gap
- Modo: VALIDACAO / OPENCODE_RUNTIME / ATOMIC_TOOLING
- Objetivo: provar em OpenCode interativo real que o worker ATOMIC enxerga e usa ferramentas MCP `atomic-edit`, sem derivar para Bash/Node/native edit quando precisa escrever codigo.
- Workspace: `/Users/danielpenin/whatsapp_saas`
- Modelo: `deepseek/deepseek-v4-pro`, variant `max`.
- Ferramentas atomicas usadas pelo worker:
  - `atomic_create_file` para criar `scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts` com `export const CANARY = 'old';`.
  - `atomic_replace_literal` com `preview:true` para propor `'old'` -> `'new'` sem persistir.
  - `atomic_delete_range` para remover o conteudo do fixture.
- Evidencia antes/depois:
  - Antes da canary, a rodada A/B 4 ATOMIC havia falhado porque o worker nao enxergou ferramentas MCP atomicas e tentou derivar para Bash/Node proibido.
  - Depois da canary, OpenCode exibiu o runtime `DeepSeek V4 Pro · DeepSeek · max` e usou ferramentas atomicas reais.
  - Preview retornou `changed=false` e a verificacao read-only confirmou que o arquivo continuava com `'old'`, nao `'new'`.
  - `atomic_delete_range` deixou arquivo zero-byte; o orquestrador removeu o residuo temporario por cleanup externo, porque nao ha primitiva atomica explicita de delete-file.
- Validacao do orquestrador:
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:13:00.000Z --strict-current-topology --json`: exit 0, `traces=5`, `previewTraceCount=1`, `dishonestPreviewCount=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `pass=true`.
  - `pgrep -fl 'opencode run|opencode serve'`: sem processos ativos apos encerramento da TUI.
  - `test ! -e scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts`: exit 0.
- Nivel de prova: N3/N4 local estreito para exposicao MCP + preview honesty + topologia corrente em OpenCode; ainda nao prova superioridade A/B ampla.
- Risco residual:
  - A TUI nao autoencerrou apos o handoff; o orquestrador precisou encerrar PIDs especificos.
  - O cleanup atomico atual esvazia o arquivo, mas nao remove o arquivo criado; falta `atomic_delete_file` ou politica canonica de cleanup de fixtures.
- Decisao:
  - O bloqueio de exposicao MCP da rodada 4 esta resolvido para o repo principal nesta janela controlada.
  - Ainda nao escalar complexidade; repetir a mesma classe de tarefa A/B agora que o canario passou.
- Criterio para proxima rodada:
  - Dois worktrees oficiais OpenCode, mesma missao, NORMAL sem atomic-edit e ATOMIC atomic-only.
  - Preflight ATOMIC deve repetir canario curto ou carregar evidencias recentes de `atomic-edit connected`, `previewHonestyPass=true` e `currentTopologyCoverage=1`.
  - Medir aceite independente, corretude, prova de preservacao, preview honesty, validacao, tempo, memoria, diff, handoff e self-termination.

## ORCH-ATOMIC-AB-BENCH-005

- Status: validated_parcial / lapida_applied
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B oficial com dois workers OpenCode simultaneos em worktrees isolados, mesma missao, NORMAL sem atomic-edit vs ATOMIC atomic-only, agora atacando a lacuna de cleanup criada pelo canary `OC-ATOMIC-TOOL-EXPOSURE-006`.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab5-20260516-1820-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab5-20260516-1820-atomic`
- Problema real escolhido: o MCP tinha `atomic_create_file` e `atomic_delete_range`, mas nao tinha primitiva canonica para remover arquivo temporario criado por agente/canary; cleanup externo por shell ainda era residuo operacional.
- Resultado dos workers:
  - NORMAL: implementou `atomic_delete_file` com `preview`, `expectedSha256`, idempotencia, recusa de diretorio/governance e testes mais completos; passou validacao independente com smoke 110/0 apos corrigir o ambiente temporario.
  - ATOMIC: usou MCP atomic-edit real e gerou traces; implementou a ferramenta e passou validacao independente com smoke 107/0, mas deixou cobertura menor (sem stale sha no smoke) e posicionou o bloco de teste de forma menos limpa.
- Vitorias NORMAL:
  - Melhor cobertura inicial de aceite: preview trace, commit trace, idempotencia, diretorio, governance e stale `expectedSha256`.
  - Menor tempo produtivo observado (~7m27s vs ~9m55s).
  - Entrega mais imediatamente aproveitavel como insumo de teste.
- Vitorias ATOMIC:
  - Mutacao de codigo feita por MCP atomic-edit em runtime OpenCode real, com traces `.atomic`.
  - Respeitou atomic-only e nao tentou native/Bash write de codigo.
  - Design de resposta compacta para commit de delete ficou mais alinhado ao principio de nao ecoar arquivo inteiro deletado.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/server.ts`: adiciona `atomic_delete_file` com `resolveSafeTarget`, recusa de diretorio/governance, `preview`, `expectedSha256`, arquivo ausente como `changed:false`, preview trace honesto e commit com resposta compacta + trace persistido.
  - `scripts/mcp/atomic-edit/smoke.ts`: tool count 28 e regressao completa para preview nao deletar, trace preview honesto, commit deletar, trace commit honesto, idempotencia, diretorio recusado, governance recusada e stale sha recusado.
- Evidencia pos-lapida no repo principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 110 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:22:00.000Z --strict-current-topology --json`: exit 0, `pass=true`, `previewHonestyPass=true`, `dishonestPreviewCount=0`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit docs/ai/mission`: exit 0.
- Nivel de prova: N3/N4 local para MCP + OpenCode A/B supervisionado + smoke real no repo principal; ainda nao prova superioridade atomica ampla.
- Derrotas atomicas formalizadas:
  - ATOMIC nao venceu em tempo nesta rodada.
  - ATOMIC nao gerou cobertura de teste tao completa quanto NORMAL sem lapida do orquestrador.
  - ATOMIC ainda dependeu do orquestrador para combinar design de resposta compacta com cobertura de aceite forte.
- Decisao:
  - Nao escalar complexidade.
  - Proxima rodada deve manter a mesma faixa de dificuldade e exigir que o worker ATOMIC entregue cobertura de teste no mesmo nivel do NORMAL, nao apenas codigo mais rastreavel.
- Criterio para proxima rodada:
  - ATOMIC so pode vencer se superar NORMAL simultaneamente em aceite independente, cobertura de teste, corretude, trace completo, preview honesty, tempo, memoria, diff, handoff e self-termination.

## ORCH-ATOMIC-AB-BENCH-006

- Status: rejected_timeout_no_mutation
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B oficial em dificuldade equivalente implementando `code_file_stat`, uma ferramenta MCP read-only para metadados de arquivo sem expor conteudo.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab6-20260516-1840-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab6-20260516-1840-atomic`
- Problema real escolhido: agentes precisam obter `exists`, `kind`, `bytes`, `sha256` e `mtimeMs` para fluxos `expectedSha256` sem despejar conteudo do arquivo.
- Resultado dos workers:
  - NORMAL: ficou mais de 10 minutos em TUI/geracao sem implementar `code_file_stat`.
  - ATOMIC: ficou mais de 10 minutos em TUI/geracao sem implementar `code_file_stat`.
- Evidencia:
  - `ps` confirmou os PIDs ativos antes do encerramento: `15597`, `15603`, `15598`, `15604`.
  - `rg -n "code_file_stat|codeFileStat|file_stat" ...` nao encontrou implementacao em nenhum worktree.
  - `find .../.atomic -type f` nao encontrou traces atomicos da rodada.
  - `pgrep -fl 'opencode run|opencode serve'` retornou vazio apos `kill` dos PIDs exatos.
- Nivel de prova: N3 operacional para falha de orquestracao/runtime; nao mede superioridade tecnica de NORMAL nem ATOMIC.
- Derrotas atomicas formalizadas:
  - O prompt longo permitiu pensamento prolongado sem primeira mutacao/prova visivel.
  - O contrato nao tinha limite operacional de "primeira mutacao ou parar".
  - A rodada nao gerou handoff final persistido pelos workers.
- Decisao:
  - Nao escalar complexidade.
  - Repetir como AB6b na mesma tarefa, com prompt muito menor, limite de primeira mutacao/prova em ate 3 minutos e handoff compacto.
- Criterio para proxima rodada:
  - Se um worker nao produzir primeira mutacao/prova ou `ATOMIC_MCP_UNAVAILABLE` em ate 3 minutos, encerrar e classificar como timeout.
  - ATOMIC precisa usar MCP atomic-edit ou parar; NORMAL continua proibido de usar atomic-edit.

## ORCH-ATOMIC-AB-BENCH-006B

- Status: validated_parcial / lapida_applied
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir AB6 na mesma dificuldade com prompt curto e implementar `code_file_stat`, ferramenta MCP read-only para metadados de arquivo sem expor conteudo.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab6b-20260516-1858-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab6b-20260516-1858-atomic`
- Problema real escolhido: agentes precisam obter `exists`, `kind`, `bytes`, `sha256` e `mtimeMs` para fluxo `expectedSha256` sem despejar conteudo de arquivo em chat/log.
- Resultado dos workers:
  - NORMAL: implementou `code_file_stat` em `scripts/mcp/atomic-edit/server.ts` e testes em `scripts/mcp/atomic-edit/smoke.ts`; validacao independente passou com `116 passed, 0 failed`.
  - ATOMIC: usou MCP atomic-edit real, gerou traces e passou validacao independente com `118 passed, 0 failed`, mas expandiu escopo para `guard.ts` e a TUI teve timeout interno no smoke antes da validacao independente do orquestrador.
- Vitorias NORMAL:
  - Menor escopo de arquivo (`server.ts` + `smoke.ts`, sem helper novo em `guard.ts`).
  - Melhor teste inicial de hash que o ATOMIC, porque comparou o `sha256` retornado com leitura local da fixture.
  - Handoff final mais completo antes do encerramento da TUI, embora a sessao nao tenha autoencerrado.
- Vitorias ATOMIC:
  - Mutacao de codigo feita por MCP atomic-edit real com traces e `currentTopologyCoverage=1`.
  - Melhor prova operacional de modo atomico puro: `atomic_edit_symbol`, `atomic_add_import` e `atomic_replace_text` foram usados no worktree ATOMIC.
  - Smoke independente do worktree cobriu mais asserts totais (`118/0`) que o NORMAL (`116/0`), apesar de parte da cobertura ser menos forte semanticamente.
- Derrotas atomicas formalizadas:
  - Escopo expandido desnecessariamente para `guard.ts`.
  - Timeout interno no smoke durante a TUI, exigindo validacao externa do orquestrador.
  - Hash da ferramenta ainda era calculado por leitura UTF-8 no worker, nao por bytes brutos.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/server.ts`: adiciona `code_file_stat` read-only entre `code_read_symbol` e `atomic_edit_symbol`; retorna `changed:false`, `exists`, `kind`, `mtimeMs`, `bytes` e `sha256` para arquivos, sem conteudo; diretorios nao carregam `sha256`/`bytes`; missing e non-throwing; protegidos sao marcados `protected:true` sem `sha256`/`bytes`/conteudo.
  - `scripts/mcp/atomic-edit/smoke.ts`: tool count 29 e regressao para fixture hash por `Buffer` bruto, ausencia de `content/text/data/fullText`, missing path, directory path e protected path.
  - O patch principal usa `stat.size` para `bytes` e `crypto.createHash(...).update(Buffer)` para `sha256`, corrigindo a fraqueza dos dois workers.
- Evidencia pos-lapida no repo principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 116 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:58:00.000Z --strict-current-topology --json`: exit 0, `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
- Nivel de prova: N3/N4 local para MCP + OpenCode A/B supervisionado + smoke real no repo principal; ainda nao prova superioridade atomica ampla.
- Decisao:
  - Nao escalar complexidade.
  - Manter a proxima A/B na mesma faixa de dificuldade, preferencialmente cobrindo a topologia `rename_property_keep_value` do principio original.
- Criterio para proxima rodada:
  - ATOMIC precisa vencer NORMAL em aceite independente, cobertura de teste, corretude, trace completo, preview honesty, escopo, tempo, handoff e self-termination.
  - Se o worker ATOMIC expandir escopo sem necessidade ou deixar validacao principal para o orquestrador, registrar como derrota parcial mesmo com smoke verde.

## ORCH-ATOMIC-AB-BENCH-007

- Status: validated_parcial / lapida_applied
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B na mesma faixa de dificuldade implementando `atomic_rename_property_key`, operador semantico para renomear chave de objeto preservando o valor/inicializador.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab7-20260516-1939-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab7-20260516-1939-atomic`
- Problema real escolhido: cobrir a topologia do principio original "valor preservado, campo modificado" com ferramenta MCP canonica, preview/hash guard e smoke live.
- Resultado dos workers:
  - NORMAL: implementou funcao, registro MCP e testes live mais completos, mas falhou build em `advanced.ts` porque usou `PropertyAssignment.setName`, metodo inexistente em `ts-morph`.
  - ATOMIC: usou MCP atomic-edit real e chegou mais perto da implementacao correta; passou build, mas falhou smoke com `124 passed, 2 failed` por check de erro MCP para ambiguidade e por aceitar keyword como chave nova.
- Vitorias NORMAL:
  - Melhor cobertura live inicial: fixture MCP real, validacao de retorno humano e prova de valor preservado.
  - Capturou a necessidade de testar ambiguidade pela superficie MCP, nao so pela funcao auxiliar.
- Vitorias ATOMIC:
  - Mutacao de codigo feita por MCP atomic-edit real com traces.
  - Implementacao tecnica mais proxima: substituiu `nameNode` em vez de chamar `setName`.
  - Passou build antes da lapidacao do orquestrador.
- Derrotas atomicas formalizadas:
  - Nao fechou smoke completo sem intervencao.
  - Teste de ambiguidade assumia JSON `ok:false` sem considerar `isError:true` do MCP.
  - Nao restringiu keyword/reserved identifier no helper.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/advanced.ts`: adiciona `renamePropertyKey`, valida identificador novo por regex + reserved set, recusa ambiguidade/missing e preserva `initializerText` no detalhe da mutacao.
  - `scripts/mcp/atomic-edit/server.ts`: registra `atomic_rename_property_key` com `preview` e `expectedSha256` via `shaArg`, `guardSha` e `commitSemantic`.
  - `scripts/mcp/atomic-edit/smoke.ts`: tool count 30, smoke live de rename preservando valor, ambiguidade via `isError:true`, e testes auxiliares para scoped rename, string-literal key, ambiguous/missing/invalid/keyword.
- Evidencia pos-lapida no repo principal:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/server.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 125 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T22:39:00.000Z --strict-current-topology --json`: exit 0, `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/advanced.ts scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: exit 0.
- Nivel de prova: N3/N4 local para MCP + OpenCode A/B supervisionado + smoke real no repo principal; ainda nao prova superioridade atomica ampla.
- Decisao:
  - Nao escalar complexidade.
  - Manter a proxima A/B na mesma faixa de dificuldade, atacando outra topologia do principio original.
- Criterio para proxima rodada:
  - ATOMIC precisa vencer NORMAL tambem em cobertura live, self-termination e aceite independente, nao apenas em rastreabilidade.
  - Proximo contrato deve incluir caso MCP de erro (`isError:true`) e caso de validacao sem depender do orquestrador.

## ORCH-ATOMIC-AB-BENCH-008

- Status: validated_parcial / lapida_applied
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B na mesma faixa de dificuldade implementando `atomic_add_await_to_call`, operador semantico para adicionar wrapper `await` a uma chamada preservando callee, argumentos e texto da chamada.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab8-20260516-2022-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab8-20260516-2022-atomic`
- Problema real escolhido: cobrir a topologia do principio original "wrapper preservando conteudo/expressao" com ferramenta MCP canonica, preview/hash guard e smoke live.
- Resultado dos workers:
  - NORMAL: implementou helper, registro MCP e smoke; respeitou a proibicao de atomic-edit; terminou primeiro (~6m47s) e passou validacao independente com `131 passed, 0 failed`, mas nao deixou traces MCP.
  - ATOMIC: usou MCP atomic-edit real para mutar codigo, gerou 22 traces persistidos, passou validacao independente com `134 passed, 0 failed` e entregou cobertura semantica melhor para property-access callee, selector de desambiguacao e detalhe `callText`.
- Vitorias NORMAL:
  - Melhor tempo de conclusao e handoff mais rapido.
  - Implementacao suficiente para build/smoke sem dependencia de lapidacao imediata para compilar.
  - Menor custo operacional percebido na TUI.
- Vitorias ATOMIC:
  - Mutacao de codigo feita por MCP atomic-edit real com prova persistida.
  - Melhor cobertura semantica inicial: callee por texto exato ou nome de property access, selector para resolver ambiguidade e prova explicita do `callText` preservado.
  - Maior smoke independente no worktree (`134/0` contra `131/0`).
- Derrotas atomicas formalizadas:
  - Perdeu em velocidade para o NORMAL.
  - Nao recusou contexto nao-async por conta propria; essa lacuna foi detectada e corrigida pelo orquestrador.
  - O fluxo de integracao principal expôs fragilidade do uso de `insert_at` por coordenada: blocos foram inicialmente inseridos em escopos errados apos deslocamento de linha e precisaram de reparo forward por `replace-range`.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/advanced.ts`: adiciona `addAwaitToCall`, com resolucao por `callee`, `selector` opcional, recusa de missing/ambiguous/already-awaited e recusa de chamada fora de funcao/metodo `async`.
  - `scripts/mcp/atomic-edit/server.ts`: registra `atomic_add_await_to_call` com `preview` e `expectedSha256` via `shaArg`, `guardSha` e `commitSemantic`.
  - `scripts/mcp/atomic-edit/smoke.ts`: tool count 31, smoke live de `await compute(1, 2)`, testes auxiliares para escopo async, detalhe `callText`, missing, ambiguidade, selector, already-awaited, non-async refused e valid async accepted.
- Evidencia pos-lapida no repo principal:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/server.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 135 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T23:22:00.000Z --strict-current-topology --json`: exit 0, `pass=true`, `traces=17`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/advanced.ts scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: exit 0.
- Nivel de prova: N3/N4 local para MCP + OpenCode A/B supervisionado + smoke real no repo principal; ainda nao prova superioridade atomica ampla.
- Decisao:
  - Nao escalar complexidade.
  - Manter a proxima A/B na mesma faixa de dificuldade, atacando a derrota residual de insercao semanticamente ancorada antes de qualquer aumento de complexidade.
- Criterio para proxima rodada:
  - ATOMIC precisa vencer NORMAL tambem em tempo ou reduzir diferenca de tempo a margem irrelevante.
  - A ferramenta atomica deve evitar coordenada fragil para insercoes repetitivas em listas/blocos/smokes, preferindo ancoragem por simbolo, tool name, test name ou estrutura semanticamente identificavel.

## ORCH-ATOMIC-AB-BENCH-009

- Status: validated_parcial / lapida_applied
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B na mesma faixa de dificuldade implementando `atomic_insert_after_anchor`, operador de insercao ancorada por texto exato para evitar drift de coordenada.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab9-20260516-2048-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab9-20260516-2048-atomic`
- Problema real escolhido: AB8 expos que `insert_at` por linha/coluna pode cair no bloco errado apos deslocamento de linhas; a nova ferramenta deve preservar a ancora e inserir somente o texto novo.
- Resultado dos workers:
  - NORMAL: implementou a ferramenta em `server.ts` e cobertura live em `smoke.ts`; passou validacao independente com `145 passed, 0 failed` e chegou a handoff "ready as final patch".
  - ATOMIC: usou MCP atomic-edit real e gerou traces, mas demorou mais, expandiu escopo para `engine.ts`, ficou sem smoke comportamental da ferramenta e passou apenas `135 passed, 0 failed`.
- Vitorias NORMAL:
  - Melhor tempo e self-termination.
  - Escopo minimo: `server.ts` + `smoke.ts`, sem helper novo.
  - Melhor cobertura de aceite: insert live, preview, missing, ambiguous, occurrence, out-of-range e stale sha.
- Vitorias ATOMIC:
  - Mutacao de codigo feita por MCP atomic-edit real com traces.
  - Navegacao estruturada pelo MCP antes de editar.
- Derrotas atomicas formalizadas:
  - Violou o escopo editavel ao alterar `engine.ts`.
  - Nao fechou a cobertura comportamental obrigatoria para a ferramenta nova.
  - Perdeu em latencia/primeira mutacao e precisou ser encerrado pelo orquestrador.
- Reparo aplicado no repo principal:
  - `scripts/mcp/atomic-edit/server.ts`: adiciona `atomic_insert_after_anchor` com `anchorText`, `insertText`, `occurrence`, `expectedSha256` e `preview`; recusa ancora vazia, missing, ambiguity e occurrence fora de faixa; usa `applyEdits` na posicao calculada apos a ancora preservada.
  - `scripts/mcp/atomic-edit/smoke.ts`: tool count 32 e smoke live para insercao beta apos alpha, preview sem escrita, missing/empty/ambiguous/out-of-range recusados, occurrence correta e stale `expectedSha256` recusado.
- Evidencia pos-lapida no repo principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: exit 0.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: exit 0.
  - `node scripts/mcp/atomic-edit/build.mjs`: OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 145 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:00:00.000Z --strict-current-topology --json`: exit 0, `pass=true`, `traces=18`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: exit 0.
- Nivel de prova: N3/N4 local para MCP + OpenCode A/B supervisionado + smoke real no repo principal; ainda nao prova superioridade atomica ampla.
- Decisao:
  - Nao escalar complexidade.
  - Manter a proxima A/B na mesma faixa e corrigir a derrota operacional do ATOMIC antes de nova complexidade.
- Criterio para proxima rodada:
  - O prompt ATOMIC precisa ter escopo editavel hard-enforced e check de violacao de escopo antes do handoff.
  - O worker ATOMIC precisa entregar cobertura de smoke equivalente ou superior ao NORMAL, nao apenas traces.
  - A sessao deve autoencerrar ou produzir handoff final sem depender de kill do orquestrador.

## ORCH-ATOMIC-AB-BENCH-010

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: executar A/B real com dois workers OpenCode simultaneos em worktrees isolados para criar `worker-scope-check`, um gate read-only de escopo permitido/obrigatorio para futuras rodadas do Atomic OS.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab10-20260516-211321-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab10-20260516-211321-atomic`
- Antes:
  - AB9 mostrou que ATOMIC podia gerar traces, mas perdia para NORMAL em escopo minimo, smoke de aceite e self-termination.
  - Nao havia CLI local simples para validar se um worker tocou apenas arquivos permitidos e se arquivos obrigatorios foram realmente alterados.
- Resultado A/B:
  - NORMAL: implementou `worker-scope-check.mjs` + smoke Part H; excedeu corte operacional e precisou ser encerrado, mas o bloco novo passou completo. Smoke independente do worktree retornou `161 passed, 7 failed`; as 7 falhas eram ambientais do bloco ESLint do worktree, nao do novo `worker-scope-check`.
  - ATOMIC: usou MCP atomic-edit e gerou traces com auditoria corrente verde, mas deixou `worker-scope-check` funcionalmente quebrado em casos basicos. Smoke independente retornou `157 passed, 18 failed`, com 11 falhas novas no bloco Part H alem das mesmas 7 ambientais.
- Depois:
  - Repo principal recebeu versao hibrida baseada no NORMAL:
    - `scripts/mcp/atomic-edit/worker-scope-check.mjs`
    - `scripts/mcp/atomic-edit/smoke.ts`
  - CLI suporta `--repo`, repetidos `--allow`, repetidos `--require`, `--json`, human output, paths repo-relative, recusa absoluto/escape, detecta modified/untracked por `git status --porcelain=v1`, retorna nonzero em violacao/missing e nao modifica repo.
- Evidencia principal:
  - `node --check scripts/mcp/atomic-edit/worker-scope-check.mjs`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `168 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:00:00.000Z --strict-current-topology --json`: `pass=true`, `traces=27`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/worker-scope-check.mjs scripts/mcp/atomic-edit/smoke.ts`: passou.
- Nivel de prova: N3 operacional local; valida CLI e smoke reais no repo, mas nao prova escala massiva nem superioridade atomica ampla.
- Vitoria NORMAL:
  - Melhor correcao funcional do `worker-scope-check`.
  - Melhor cobertura de aceite no bloco Part H.
- Vitoria ATOMIC:
  - Melhor rastreabilidade e prova de mutacao por traces MCP.
  - Auditoria de traces da janela passou com topologia corrente completa.
- Derrotas ATOMIC formalizadas:
  - 11 falhas funcionais no bloco novo de smoke.
  - Sem self-termination.
  - Dependencia de MCP/operadores ainda fragil; o orquestrador viu `atomic_insert_at` fechar transporte ao tentar preencher arquivo novo e precisou usar fallback atomico standalone.
- Decisao:
  - Nao escalar complexidade.
  - Proxima rodada deve permanecer na mesma faixa e atacar `atomic_create_file` exposto/estavel, self-termination, primeira prova em ate 3 minutos e uso de `worker-scope-check` como aceite externo.
- Criterio de revalidacao:
  - Rodar `npx tsx scripts/mcp/atomic-edit/smoke.ts` e exigir `Part H` verde.
  - Rodar `worker-scope-check` em repo temporario com allowlist/required/violacao.
  - Em A/B futuro, executar `worker-scope-check` no worktree apos o worker encerrar, descontando apenas baseline de setup explicitamente registrado.

## ORCH-ATOMIC-AB-BENCH-011

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B na mesma faixa de dificuldade para estabilizar `atomic_create_file` como operador real de criacao de arquivo, evitando fallback shell/heredoc para arquivos novos.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab11-20260516-2135-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab11-20260516-2135-atomic`
- Antes:
  - AB10 provou que o orquestrador precisava de criacao atomica de arquivo nova/estavel para nao cair em fallback local ao criar `worker-scope-check.mjs`.
  - `atomic_create_file` nao aceitava `expectedSha256` no schema e nao tinha smoke completo para parent dirs, empty-file fill e stale sha em arquivo vazio.
- Resultado A/B:
  - NORMAL: implementou o delta funcional e cobertura mais completa; excedeu o corte operacional de ~10m30s e precisou ser encerrado. Validacao independente retornou `177 passed, 7 failed`, com as 7 falhas ambientais do bloco ESLint em worktree isolado, nao dos testes de `atomic_create_file`.
  - ATOMIC: usou MCP atomic-edit real para `server.ts` e `smoke.ts`, gerou traces e passou auditoria corrente (`pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`), mas tambem excedeu o corte e sua cobertura era mais fraca: nao provava criacao de parent dirs porque usava path sob diretorio ja existente. Validacao independente retornou `172 passed, 7 failed`, com as mesmas falhas ambientais.
- Depois:
  - Repo principal recebeu versao hibrida:
    - `scripts/mcp/atomic-edit/server.ts`: `atomic_create_file` aceita `expectedSha256` e chama `guardSha(before, a.expectedSha256)` antes de criar/preencher arquivo inexistente ou vazio, mantendo recusa de arquivo existente nao-vazio e governance.
    - `scripts/mcp/atomic-edit/smoke.ts`: cobertura completa de preview sem criar file/parent dir, commit criando parent dirs, non-empty refusal, empty fill, stale sha, correct sha, protected refusal e `.mjs` multi-line.
- Evidencia principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `184 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:00:00.000Z --strict-current-topology --json`: `pass=true`, `traces=41`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts scripts/mcp/atomic-edit/worker-scope-check.mjs docs/ai/mission`: passou.
- Nivel de prova: N3 operacional local; valida MCP, smoke real e auditoria corrente, mas ainda nao prova superioridade ampla do modo ATOMIC.
- Vitoria NORMAL:
  - Melhor cobertura funcional de aceite.
  - Prova real de parent-dir creation no smoke.
- Vitoria ATOMIC:
  - Melhor rastreabilidade e prova de mutacao por traces MCP.
  - Auditoria de topologia corrente verde.
- Derrotas ATOMIC formalizadas:
  - Cobertura de smoke incompleta para parent dirs.
  - Sem self-termination.
  - Ainda depende de macro-insercao de blocos longos de teste, que reduz a vantagem de granularidade.
- Decisao:
  - Nao escalar complexidade.
  - Proxima rodada deve manter dificuldade e atacar completude de smoke, granularidade de insercao de blocos longos e autoencerramento.
- Criterio de revalidacao:
  - Rodar `npx tsx scripts/mcp/atomic-edit/smoke.ts` e exigir `184 passed, 0 failed` ou superior.
  - Rodar auditor `--strict-current-topology` e exigir `fallback_rate=0`, `coarse_unjustified=0`, `currentTopologyCoverage=1`.
  - Em A/B futuro, provar parent-dir behavior no modo ATOMIC com teste equivalente ao NORMAL.

## ORCH-ATOMIC-AB-BENCH-012

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir A/B na mesma faixa de dificuldade para implementar `atomic_insert_before_anchor`, medindo se o modo ATOMIC ja supera o modo NORMAL em cobertura funcional, rastreabilidade, escopo, tempo e self-termination.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab12-20260516-2157-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab12-20260516-2157-atomic`
- Antes:
  - AB11 estabilizou `atomic_create_file`, mas ATOMIC ainda perdeu cobertura funcional e autoencerramento para NORMAL.
  - `worker-scope-check` tratava `.atomic` gerado por validacao como violacao de escopo, contaminando o aceite externo do worker.
- Resultado A/B:
  - NORMAL: entregou implementacao e smoke comportamental completo para `atomic_insert_before_anchor`; excedeu o corte operacional de ~8m27s e foi encerrado. Validacao independente retornou `187 passed, 7 failed`, sendo as 7 falhas ambientais de ESLint em worktree isolado.
  - ATOMIC: usou MCP atomic-edit real e passou auditoria corrente (`pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`), mas nao entregou smoke comportamental equivalente para a nova ferramenta. Validacao independente retornou `177 passed, 7 failed`, com as mesmas falhas ambientais.
- Depois:
  - Repo principal recebeu versao hibrida:
    - `scripts/mcp/atomic-edit/server.ts`: adiciona `atomic_insert_before_anchor`, com `anchorText`, `insertText`, `occurrence`, `expectedSha256`, `preview`, recusa de missing/empty/ambiguous/out-of-range/stale sha e insercao antes da ancora preservada.
    - `scripts/mcp/atomic-edit/smoke.ts`: adiciona cobertura de listagem, live insert, ancora preservada, preview sem escrita, missing, empty, ambiguous, occurrence, out-of-range, stale sha e `.atomic` ignorado no scope-check.
    - `scripts/mcp/atomic-edit/worker-scope-check.mjs`: ignora `.atomic` como artefato de prova gerado pelo proprio sistema atomico.
- Evidencia principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/worker-scope-check.mjs`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `195 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:00:00.000Z --strict-current-topology --json`: `pass=true`, `traces=58`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit docs/ai/mission`: passou.
  - `node scripts/mcp/atomic-edit/worker-scope-check.mjs --repo /tmp/kloel-opencode-ab12-20260516-2157-normal --allow scripts/mcp/atomic-edit/server.ts --allow scripts/mcp/atomic-edit/smoke.ts --require scripts/mcp/atomic-edit/server.ts --require scripts/mcp/atomic-edit/smoke.ts --json`: `ok=true`, violations vazias.
- Nivel de prova: N3 operacional local; valida ferramenta, smoke real, auditoria corrente e aceite externo, mas ainda nao prova superioridade ampla do modo ATOMIC.
- Vitoria NORMAL:
  - Melhor cobertura funcional de aceite.
  - Melhor comportamento testado da nova ferramenta.
- Vitoria ATOMIC:
  - Melhor rastreabilidade, prova de mutacao e auditoria de topologia corrente.
- Derrotas ATOMIC formalizadas:
  - Cobertura comportamental incompleta.
  - Sem self-termination.
  - Ainda depende de macro-insercoes longas em smoke quando deveria usar estrategia mais granular e checklist equivalente ao NORMAL.
- Decisao:
  - Nao escalar complexidade.
  - Proxima rodada deve manter dificuldade e atacar completude de smoke, granularidade de teste, autoencerramento e primeira prova em ate 3 minutos.
- Criterio de revalidacao:
  - Rodar `npx tsx scripts/mcp/atomic-edit/smoke.ts` e exigir `195 passed, 0 failed` ou superior.
  - Rodar auditor `--strict-current-topology` e exigir `fallback_rate=0`, `coarse_unjustified=0`, `currentTopologyCoverage=1`.
  - Em A/B futuro, o modo ATOMIC so vence se entregar smoke comportamental equivalente ou melhor que o NORMAL, alem da rastreabilidade.

## ORCH-ATOMIC-AB-BENCH-013B

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: rodar A/B com dois OpenCode workers simultaneos em worktrees isolados para implementar `atomic_replace_between_anchors`, medindo enforcement atomic-only, cobertura funcional, rastreabilidade e validacao independente.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab13-20260516-2216-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab13-20260516-2216-atomic`
- Antes:
  - AB12 estabilizou `atomic_insert_before_anchor`, mas o ATOMIC ainda precisava vencer cobertura funcional e self-termination, nao apenas rastreabilidade.
  - O runtime OpenCode ja estava configurado para negar edicao nativa de codigo; portanto o worker NORMAL desta rodada funcionou como controle negativo para provar que o modo nao atomico nao consegue mais mutar codigo.
- Resultado A/B:
  - NORMAL: tentativa de native edit em `scripts/mcp/atomic-edit/server.ts` foi negada pelo hook atomic-only. O worker finalizou handoff com `BLOCKED_BY_ATOMIC_ONLY_HOOK`, sem arquivos alterados e sem bypass por Bash/shell/script.
  - ATOMIC: usou MCP atomic-edit real e adicionou `atomic_replace_between_anchors` em `server.ts` e cobertura em `smoke.ts`. Validacao do worktree: `node --check` server/smoke passou, `node scripts/mcp/atomic-edit/build.mjs` passou, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `207 passed, 0 failed`, `worker-scope-check` = `ok=true`, auditor `--strict-current-topology` = `pass=true`, `currentTopologyCoverage=1`, `previewHonestyPass=true`, `git diff --check` limpo.
- Depois:
  - Repo principal recebeu o delta validado:
    - `scripts/mcp/atomic-edit/server.ts`: adiciona `atomic_replace_between_anchors`, preservando `startAnchorText` e `endAnchorText`, substituindo apenas a zona interna, com `occurrence`, `expectedSha256`, `preview`, recusa de anchors vazias, missing start/end, ambiguidade sem occurrence, occurrence fora de faixa e stale sha.
    - `scripts/mcp/atomic-edit/smoke.ts`: tool count 34, listagem da ferramenta e 12 checks comportamentais para live replace, preservacao de anchors, preview sem escrita, missing start, missing end, anchors vazias, ambiguidade, occurrence, out-of-range e stale sha.
- Evidencia principal no repo:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `207 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T01:16:00.000Z --strict-current-topology --json`: `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit`: passou.
- Nivel de prova: N3 operacional local; valida ferramenta, smoke real, auditoria corrente e enforcement atomic-only, mas nao prova superioridade ampla em todos os benchmarks porque o NORMAL nao pode mais competir escrevendo codigo.
- Vitoria NORMAL:
  - Nenhuma funcional. O modo normal so venceu em custo zero de mutacao porque foi bloqueado antes de produzir qualquer codigo.
- Vitoria ATOMIC:
  - Unico modo que conseguiu entregar codigo real sob as regras atuais.
  - Cobertura funcional completa para a tarefa desta rodada.
  - Rastreabilidade por traces, preview honesty e topologia corrente completa.
  - Enforcement atomic-only confirmado por bloqueio do controle normal.
- Derrotas ATOMIC formalizadas:
  - Ainda nao ha self-termination limpa de TUI; o orquestrador precisou encerrar processos `opencode run` por PID exato apos handoff.
  - O fallback offline do orquestrador precisou reparar uma insercao com `\\n` literal no main porque o MCP primario fechou transporte; isso reforca que o operador de insercao deve aceitar payload multiline sem armadilha de escape.
  - A comparacao deixa de medir "normal completando a tarefa" quando o normal e bloqueado; futuras rodadas precisam separar controle negativo de benchmark competitivo.
- Decisao:
  - Nao escalar complexidade ainda.
  - Proxima rodada deve manter complexidade semelhante, mas com dois eixos separados: (1) canario negative-control para provar que native edit continua bloqueado; (2) benchmark competitivo entre duas estrategias atomicas, medindo tempo, cobertura, tamanho de mutacao, traces, self-termination e ausencia de reparo do orquestrador.
- Criterio de revalidacao:
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` deve ficar `207 passed, 0 failed` ou superior.
  - Auditor `--strict-current-topology` deve manter `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - OpenCode normal deve continuar retornando `BLOCKED_BY_ATOMIC_ONLY_HOOK` para native code edit sem mutar arquivo.

## ORCH-ATOMIC-AB-BENCH-014

- Status: validated_parcial
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: rodar A/B com dois OpenCode workers simultaneos em worktrees isolados para implementar `atomic_replace_text_in_anchor_region`, medindo produtividade, cobertura, qualidade de topologia, validacao independente e completude de handoff.
- Workspaces:
  - NORMAL: `/tmp/kloel-opencode-ab14-20260516-2250-normal`
  - ATOMIC: `/tmp/kloel-opencode-ab14-20260516-2250-atomic`
- Antes:
  - AB13B provou enforcement atomic-only, mas nao comparou contra um NORMAL capaz de concluir a mesma tarefa.
  - A familia de operadores por ancora ainda nao tinha uma primitiva que preservasse anchors e substituisse somente `oldText` dentro de uma regiao delimitada.
- Resultado A/B:
  - NORMAL: usou native edit baseline, implementou `atomic_replace_text_in_anchor_region` em `server.ts` e adicionou smoke funcional em `smoke.ts`. Validacao independente: `node --check` server/smoke passou, `node scripts/mcp/atomic-edit/build.mjs` passou, `worker-scope-check` do worktree retornou `ok=true`, `git diff --check` passou. `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou `219 passed, 7 failed`; as 7 falhas eram ambientais do bloco ESLint por `@eslint/js` ausente no worktree, enquanto os testes novos da ferramenta passaram.
  - ATOMIC: alterou somente `server.ts`, nao adicionou smoke, nao fechou handoff final validavel e precisou ser encerrado apos ficar preso em planejamento/geracao. A implementacao parcial tinha uma decisao melhor que o NORMAL em matches nao sobrepostos (`tOffset += oldText.length` em vez de `t += 1`), mas nao foi aceitavel como entrega.
- Depois:
  - Repo principal recebeu versao hibrida:
    - `scripts/mcp/atomic-edit/server.ts`: adiciona `atomic_replace_text_in_anchor_region`, preservando `startAnchorText`/`endAnchorText`, substituindo somente `oldText` dentro da regiao selecionada, com `regionOccurrence`, `textOccurrence`, `expectedSha256`, `preview`, recusa de anchors/oldText vazios, missing start/end, missing oldText, ambiguidade sem occurrence, occurrence fora de faixa e stale sha.
    - `scripts/mcp/atomic-edit/smoke.ts`: tool count 35, listagem da ferramenta e cobertura live para replace, anchors preservadas, preview sem escrita, missing start/end, entradas vazias, oldText externo preservado, regiao ambigua, `regionOccurrence`, `textOccurrence`, out-of-range e stale sha.
    - Lapida do orquestrador: mensagens de erro da implementacao foram alinhadas aos nomes do schema (`startAnchorText`, `endAnchorText`) para o smoke ser contrato real.
- Evidencia principal:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `226 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T02:00:00.000Z --strict-current-topology --json`: `pass=true`, `traces=50`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `worker-scope-check` no main nao foi usado como prova de escopo porque o worktree principal ja estava sujo com muitas mudancas preexistentes; no worktree NORMAL isolado ele retornou `ok=true`.
- Nivel de prova: N3 operacional local; valida ferramenta, smoke real e integracao hibrida, mas prova tambem que o modo ATOMIC ainda nao supera o NORMAL em tarefas competitivas quando o NORMAL pode escrever.
- Vitoria NORMAL:
  - Melhor tempo ate entrega util.
  - Melhor cobertura funcional inicial.
  - Melhor completude de validacao e handoff.
  - Escopo correto (`server.ts` + `smoke.ts`) com `worker-scope-check` verde no worktree.
- Vitoria ATOMIC:
  - Melhor decisao algoritmica parcial para matches nao sobrepostos dentro da regiao.
  - A versao final do repo preserva o principio atomico por operacao de regiao, mas isso foi obtido pela lapidacao do orquestrador, nao por entrega completa do worker.
- Derrotas ATOMIC formalizadas:
  - Planejamento longo sem primeira mutacao/prova em tempo util.
  - Falta de smoke comportamental.
  - Falta de handoff final aceitavel.
  - Falta de self-termination limpa.
  - Nao venceu NORMAL em produtividade, cobertura ou aceite independente.
- Decisao:
  - Nao escalar complexidade.
  - Atualizar o protocolo do worker ATOMIC antes do proximo loop: primeira mutacao atomica em ate 3 minutos, dividir server/smoke em microtransacoes, checklist de aceite obrigatorio, sem narrativas longas antes do primeiro diff, handoff compacto e autoencerramento.
- Criterio de revalidacao:
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` deve ficar `226 passed, 0 failed` ou superior.
  - Proxima rodada so conta como vitoria ATOMIC se superar NORMAL em cobertura, tempo/convergencia, escopo, validacao independente, rastreabilidade e handoff final.

## ORCH-ATOMIC-AB-BENCH-045

- Status: validated_partial_loss_atomic
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a classe de complexidade escalada do round 44 com refactor behavior-preserving de `backend/src/kloel/unified-agent.service.ts`, medindo se o contrato absoluto de worktree + wrapper `atomic-call.cjs` bastava para o ATOMIC vencer NORMAL.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab045-normal-20260516230907`
  - ATOMIC: `/private/tmp/kloel-ab045-atomic-20260516230907`
- Antes:
  - Rounds 42 e 43 provaram vitoria ATOMIC repetida no tier de controle.
  - Round 44 escalou para refactor medio multi-arquivo e o ATOMIC perdeu parcialmente por overhead, tokens e erro de path relativo escrevendo traces no checkout coordenador.
- Resultado A/B:
  - NORMAL: decomposicao validada com `13/13` Jest, backend typecheck e diff-check verdes; service ficou com `345` linhas e largest helper `280`; venceu tempo/eventos/comandos/tokens.
  - ATOMIC: decomposicao validada com os mesmos gates; service ficou com `197` linhas, largest helper `366`, `0` native file-change items, `6` MCP calls e `14` traces de worktree; corrigiu a falha de wrong-root do round 44 porque nenhum ID de trace do worktree apareceu no checkout coordenador.
- Evidencia principal:
  - `node docs/ai/atomic-os-benchmark/tools/round-audit.cjs docs/ai/atomic-os-benchmark/round-045`: `functionalPass=true`, `serviceLineWinner=atomic`, `eventRowWinner=normal`, `shellCommandWinner=normal`, `inputTokenWinner=normal`, `outputTokenWinner=normal`, `reasoningTokenWinner=normal`, `traceWinner=atomic`.
  - `node docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs --worktree /private/tmp/kloel-ab045-atomic-20260516230907 --coordinator /Users/danielpenin/whatsapp_saas --since '2026-05-16 23:15:54 -0300' --json`: `ok=true`, `worktreeTraceCount=14`, `matchingTraceIds=[]`.
  - `node --check docs/ai/atomic-os-benchmark/tools/round-audit.cjs`: passou.
  - `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: passou.
  - `node --check docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs`: passou.
  - `git diff --check -- docs/ai/atomic-os-benchmark docs/ai/mission scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts scripts/mcp/atomic-edit/trace.ts`: passou.
- Nivel de prova: N3/N4 local para benchmark supervisionado e validacao externa; prova que o ATOMIC ainda nao domina o tier de refactor medio multi-arquivo.
- Vitoria NORMAL:
  - Menor duracao interna: `474s` vs `575s`.
  - Menos eventos: `112` vs `180`.
  - Menos comandos: `42` vs `74`.
  - Menos tokens: input `1,692,185` vs `5,167,577`, output `23,503` vs `33,010`, reasoning `8,063` vs `13,989`.
  - Largest helper menor: `280` vs `366`.
- Vitoria ATOMIC:
  - Facade muito menor: `197` vs `345` linhas.
  - Zero `file_change` nativo.
  - Rastreabilidade por `14` traces e `6` MCP calls.
  - Sem contaminacao de trace no checkout coordenador.
  - Mesma validacao funcional que NORMAL.
- Derrotas ATOMIC formalizadas:
  - Overhead de comandos/eventos/tokens ainda alto em refactor complexo.
  - Falhas de comando evitaveis (`atomic-call --help` e checagem shell de trace) contaminavam score antes da lapida.
  - Largest helper nao era alvo explicito e ficou maior que o NORMAL.
  - Ainda houve excesso de leituras e mensagens antes de convergir.
- Decisao:
  - Nao escalar complexidade.
  - Manter o tier `medium_refactor_multi_file_behavior_preservation` ate o ATOMIC vencer NORMAL com margem tambem em economia operacional.
- Atualizacao aplicada:
  - `docs/ai/atomic-os-benchmark/tools/round-audit.cjs`: parseia `*_exit` nos logs de validacao.
  - `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: `--help` retorna exit 0.
  - `docs/ai/atomic-os-benchmark/tools/trace-isolation-check.cjs`: novo helper para prova de isolamento de traces.
- Criterio de revalidacao:
  - Proxima rodada mesma complexidade deve passar Jest/typecheck/diff-check em ambos lanes.
  - ATOMIC precisa vencer ou empatar tempo, eventos, comandos, input/output/reasoning tokens, largest helper, validacao e traceabilidade.
  - `trace-isolation-check` deve retornar `ok=true`, `matchingTraceIds=[]`.

## ORCH-ATOMIC-AB-BENCH-055

- Status: validated_partial_loss_atomic
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir teste A/B OpenCode limpo apos corrigir o isolamento do watchdog, usando tarefa bounded de extracao de helper em `backend/src/kloel/unified-agent.service.ts`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab055-normal-20260517080746`
  - ATOMIC: `/private/tmp/kloel-ab055-atomic-20260517080746`
- Antes:
  - Rounds 046-051 foram invalidados por contaminacao de runners antigos/generic artifacts.
  - Rounds 052-053 travaram sem diff sob watchdog.
  - Round 054 provou bug de isolamento: OpenCode com apenas `cwd` resolveu read/MCP contra o checkout coordenador.
- Resultado A/B:
  - Ambos lanes passaram Jest focado `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
  - NORMAL venceu economia operacional e acabamento: `39` eventos vs `52`, `9` comandos vs `10`, `0` failed commands vs `1`, input `56,874` vs `58,417`, output `2,132` vs `2,828`, reasoning `1,099` vs `2,247`, service `712` vs `713` linhas.
  - ATOMIC venceu rastreabilidade/protecao: traces atomicos, `expectedSha256` stale recusado antes de escrever, mutacoes aceitas por atomic tools e isolamento de traces sem matching IDs.
- Evidencia principal:
  - `node docs/ai/atomic-os-benchmark/tools/round-audit.cjs docs/ai/atomic-os-benchmark/round-055`: `functionalPass=true`, winners operacionais todos `normal`, `traceWinner=atomic`.
  - `normal-external-validation.log`: Jest `13/13`, typecheck 0, diff-check 0, forbidden scan nos arquivos tocados exit 1.
  - `atomic-external-validation.log`: mesmos gates verdes; trace isolation `ok=true`, `matchingTraceIds=[]`, `.atomic`/`docs/ai/traces` gerados no worktree.
  - `node scripts/mcp/atomic-edit/smoke.mjs`: depois da lapida, `226 passed, 0 failed`.
- Nivel de prova: N3 operacional local; prova benchmark supervisionado, validacao externa e melhoria de ferramenta, mas ainda nao prova superioridade atomica no tier.
- Vitoria NORMAL:
  - Menos eventos, comandos, failed commands e tokens.
  - Melhor acabamento de import (`'` preservado) e sem blank gap extra.
  - Facade 1 linha menor.
- Vitoria ATOMIC:
  - Traceabilidade e recusa de write com hash stale.
  - Mutacoes por ferramentas atomicas e isolamento de trace.
- Derrotas ATOMIC formalizadas:
  - `atomic-call.cjs` exigia caminho absoluto e gerou failed command evitavel.
  - `atomic_add_import` nao preservava estilo de aspas local.
  - Overhead cognitivo/operacional ainda maior que o NORMAL.
- Atualizacao aplicada:
  - `opencode-round-watchdog.cjs`: passa `--dir <worktree>`.
  - `atomic-call.cjs`: resolve paths relativos contra o worktree atual e recusa escape.
  - `advanced.ts`: `atomic_add_import` preserva quote style.
  - `build.mjs`: copia `worker-scope-check.mjs` para `dist`, destravando smoke Part H.
- Criterio de revalidacao:
  - Round 056 deve repetir a mesma tarefa bounded.
  - ATOMIC precisa eliminar failed command, preservar single quotes, manter traceability e vencer/empatar economia operacional antes de escalar complexidade.

## ORCH-ATOMIC-AB-BENCH-056

- Status: validated_partial_loss_atomic_mode_violation
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded de `formatPromptValue` apos lapida do round 055, medindo se ATOMIC fecha a lacuna operacional contra NORMAL.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab056-normal-20260517084129`
  - ATOMIC: `/private/tmp/kloel-ab056-atomic-20260517084129`
- Resultado A/B:
  - Ambos lanes passaram Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
  - Empate funcional: ambos alteraram `backend/src/kloel/unified-agent.service.ts` e criaram `backend/src/kloel/unified-agent-runtime.helpers.ts`; service final `712` linhas nos dois.
  - NORMAL venceu economia operacional: `31` eventos vs `70`, `5` comandos vs `10`, input `56,279` vs `57,578`, output `2,219` vs `3,606`, reasoning `470` vs `4,573`.
  - ATOMIC venceu rastreabilidade: `6` MCP calls, `1` trace `.atomic`, `4` traces `docs/ai/traces`, trace isolation `ok=true`.
- Evidencia principal:
  - `node docs/ai/atomic-os-benchmark/tools/round-audit.cjs docs/ai/atomic-os-benchmark/round-056`: `functionalPass=true`, `atomicModeClean=false`, `traceWinner=atomic`, economia operacional `normal`.
  - `normal-external-validation.log`: Jest `13/13`, typecheck 0, diff-check 0, protected diff vazio.
  - `atomic-external-validation.log`: mesmos gates verdes; `trace_isolation_exit=0`, `worktree_dot_atomic_traces=1`, `worktree_docs_ai_traces=4`.
- Nivel de prova: N3 operacional local com validacao externa e eventos OpenCode persistidos.
- Vitoria NORMAL:
  - Menos eventos, comandos e tokens.
  - Menos raciocinio gasto para o mesmo resultado funcional.
- Vitoria ATOMIC:
  - Traces e isolamento de trace.
  - Mutacoes aceitas por atomic-edit tools.
- Derrotas ATOMIC formalizadas:
  - `atomicModeClean=false`: 5 native `read` tools e 1 shell hash read em arquivo de codigo.
  - Cleanup extra ainda necessario para import quote/blank gap porque o worktree nao recebeu fixes uncommitted.
  - Overhead operacional segue maior.
- Atualizacao aplicada:
  - `round-audit.cjs`: detecta violacoes de modo atomico e parseia trace counters novos.
  - `opencode-round-watchdog.cjs`: sincroniza toolchain atomica atual para o worktree ATOMIC antes do launch.
- Criterio de revalidacao:
  - Round 057 repete a mesma tarefa.
  - ATOMIC precisa passar funcionalmente, manter traces, apresentar `atomicModeClean=true` e reduzir/empatar economia operacional antes de qualquer escala de complexidade.

## ORCH-ATOMIC-AB-BENCH-057

- Status: validated_partial_loss_atomic
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded de `formatPromptValue` apos exigir `atomicModeClean=true` no lane ATOMIC.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab057-normal-20260517090124`
  - ATOMIC: `/private/tmp/kloel-ab057-atomic-20260517090124`
- Resultado A/B:
  - Ambos lanes passaram validacao externa: Jest focado `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
  - `atomicModeClean=true` apos correcao do auditor para nao contar `cat <<HEREDOC` de JSON como leitura shell de codigo.
  - NORMAL venceu economia: `52` eventos vs `55`, input tokens `53,679` vs `58,455`, reasoning `951` vs `7,773`, service final `712` vs `713` linhas.
  - ATOMIC venceu traceabilidade/disciplina: zero native file tool violations, trace isolation `ok=true`, `worktreeTraceCount=3`, `matchingTraceIds=[]`, comandos shell `15` vs `16`, output tokens `2,699` vs `3,071`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-057/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `traceWinner=atomic`, economia principal ainda `normal`.
  - `normal-external-validation.log`: Jest `13/13`, typecheck 0, diff-check 0.
  - `atomic-external-validation.log`: mesmos gates verdes; `trace_isolation_exit=0`, `.atomic/traces=3`.
  - `docs/ai/atomic-os-benchmark/round-057/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Menos eventos, input/reasoning tokens, failed commands e melhor acabamento final do service.
- Vitoria ATOMIC:
  - Modo atomico limpo, zero native file tools, trace isolado e menor output/comando shell.
- Derrotas ATOMIC formalizadas:
  - `atomic-call.cjs` era ergonomicamente rigido: `filePath`, `specifier` e `action` causaram schema failures.
  - `atomic_replace_text` ainda gerou falhas em cleanup de whitespace exato.
  - Overhead cognitivo segue muito maior que o NORMAL.
  - O host travou em ENOSPC por acumulo de worktrees antigas.
- Atualizacao aplicada:
  - `atomic-call.cjs`: normaliza aliases `filePath -> file`, `specifier -> module`, `action -> op`.
  - `round-audit.cjs`: ignora heredoc JSON como shell read.
  - Limpeza operacional: 125 worktrees antigas removidas com `git worktree remove --force`; disco livre subiu para ~34Gi.
- Criterio de revalidacao:
  - Round 058 repete a mesma tarefa/complexidade.
  - ATOMIC precisa manter `atomicModeClean=true`, reduzir failed commands a zero/paridade, remover a diferenca de linha residual e vencer/empatar economia operacional antes de escalar.

## ORCH-ATOMIC-AB-BENCH-058

- Status: rejected_scope_runaway_timeout
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded de `formatPromptValue` apos corrigir aliases iniciais do wrapper.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab058-normal-20260517091600`
  - ATOMIC: `/private/tmp/kloel-ab058-atomic-20260517091600`
- Resultado A/B:
  - Ambos lanes passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
  - Ambos lanes foram rejeitados como prova de superioridade porque deram `max_timeout` e expandiram escopo muito alem da tarefa.
  - NORMAL tocou 6 arquivos Kloel; ATOMIC tocou 5.
  - NORMAL churn em service `43/585`; ATOMIC churn `60/588`.
  - ATOMIC teve trace isolation `ok=true`, `.atomic/traces=13`, mas `atomicModeClean=false` apos reforco do auditor.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-058/audit.json`: `functionalPass=true`, `atomicModeClean=false`, `touchedFileWinner=atomic`, `sourceChurnWinner=normal`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-058/verdict.md`.
- Nivel de prova: N3 operacional local; prova funcional parcial, rejeitada como benchmark por escopo/timeout.
- Vitoria NORMAL:
  - Menor churn de service, menos comandos shell, menos output tokens.
- Vitoria ATOMIC:
  - Menos eventos, input/reasoning tokens, menos arquivos tocados e trace isolado.
- Derrotas ATOMIC formalizadas:
  - `head` leu arquivo de ferramenta.
  - Pipeline `atomic-call.cjs ... | head -5` podia mascarar exit code.
  - Aliases de schema ainda incompletos: `specifier -> selector`, `importName -> name`.
  - `expectedSha256` em `atomic_create_file` novo causou mismatch evitavel.
  - Escopo explodiu alem da intencao de dois arquivos.
- Atualizacao aplicada:
  - `round-audit.cjs`: detecta shell reads em tooling, pipelines mascarando atomic-call, touched file count e source churn.
  - `atomic-call.cjs`: adiciona aliases contextuais por ferramenta e remove `expectedSha256` de `atomic_create_file` wrapper calls.
- Criterio de revalidacao:
  - Round 059 deve repetir a mesma tarefa com contrato estrito: exatamente dois source files tocados, zero timeout, zero shell read/pipeline no ATOMIC, e economia operacional vencendo/empatando NORMAL.

## ORCH-ATOMIC-AB-BENCH-059

- Status: validated_atomic_win_not_margin_complete
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded de `formatPromptValue` com contrato estrito de dois arquivos e `atomicModeClean=true`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab059-normal-20260517093949`
  - ATOMIC: `/private/tmp/kloel-ab059-atomic-20260517093949`
- Resultado A/B:
  - Ambos lanes passaram validacao externa: Jest focado `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
  - Ambos tocaram exatamente dois arquivos Kloel: `unified-agent.service.ts` e `unified-agent-runtime.helpers.ts`.
  - `atomicModeClean=true`: zero native file tools, zero shell reads de codigo e zero pipeline mascarando `atomic-call`.
  - ATOMIC venceu eventos `29` vs `53`, input tokens `47,573` vs `54,501`, output tokens `2,280` vs `2,482`, reasoning tokens `1,598` vs `2,106`, source churn `26` vs `27`, traceability e isolamento de trace.
  - NORMAL venceu shell commands `9` vs `13` e service final por 1 linha (`712` vs `713`).
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-059/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `traceWinner=atomic`, `sourceChurnWinner=atomic`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-059/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Menos shell commands e 1 linha a menos no service final.
- Vitoria ATOMIC:
  - Modo atomico limpo, trace isolado, menos eventos, menos tokens, menos source churn e mesmo escopo funcional.
- Derrotas ATOMIC formalizadas:
  - Overhead de comando: uma chamada shell por operacao atomica.
  - Pequena diferenca residual de acabamento no service.
- Atualizacao aplicada:
  - `atomic-call.cjs`: modo `batch` para executar multiplas operacoes MCP em uma conexao/processo.
  - Validado com `node --check` e batch real `code_outline` + `code_read_symbol`.
- Criterio de revalidacao:
  - Round 060 repete a mesma tarefa/complexidade.
  - ATOMIC deve usar `batch`, manter `atomicModeClean=true`, vencer/empatar shell commands e eliminar ou justificar a diferenca residual de linha antes de escalar complexidade.

## ORCH-ATOMIC-AB-BENCH-060

- Status: rejected_atomic_idle_timeout
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded usando `atomic-call.cjs batch` para reduzir overhead de comandos.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab060-normal-20260517095407`
  - ATOMIC: `/private/tmp/kloel-ab060-atomic-20260517095407`
- Resultado A/B:
  - NORMAL completou exit 0, tocou 2 arquivos e passou validacao externa.
  - ATOMIC executou o batch inicial de leitura, ficou ocioso e foi encerrado por watchdog com `SIGTERM`.
  - Rodada rejeitada como prova porque o ATOMIC nao mutou codigo nem concluiu a mesma tarefa.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-060/opencode-watchdog-status.json`: NORMAL `completed`, ATOMIC `exited` `SIGTERM`.
  - `docs/ai/atomic-os-benchmark/round-060/audit.json`: `functionalPass=false`.
  - `docs/ai/atomic-os-benchmark/round-060/verdict.md`.
- Nivel de prova: N3 operacional local para a falha do harness/prompt; nao e prova de produto.
- Vitoria NORMAL:
  - Completou tarefa e validacao.
- Vitoria ATOMIC:
  - Usou `batch` corretamente no primeiro passo e manteve zero native file tools.
- Derrotas ATOMIC formalizadas:
  - Output do batch era JSON aninhado como string escapada.
  - Agente nao progrediu da leitura para mutacao antes do idle timeout.
- Atualizacao aplicada:
  - `atomic-call.cjs`: batch agora parseia outputs JSON em objetos antes de imprimir.
  - Validado com `node --check` e batch real `code_file_stat`.
- Criterio de revalidacao:
  - Round 061 repete a mesma tarefa/complexidade com output de batch parseado.
  - ATOMIC deve concluir mutacao e validacao, nao apenas leitura.

## ORCH-ATOMIC-AB-BENCH-061

- Status: validated_atomic_win_not_margin_complete
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded usando o operador atomico alto nivel `extract_symbol_to_file`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab061-normal-20260517100738`
  - ATOMIC: `/private/tmp/kloel-ab061-atomic-20260517100738`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions limpo.
  - Ambos tocaram exatamente dois arquivos Kloel.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=3`.
  - ATOMIC venceu eventos `27` vs `40`, input `47,625` vs `53,095`, output `1,386` vs `2,608`, source churn `26` vs `27` e trace/prova.
  - NORMAL venceu shell commands `7` vs `10`, reasoning `626` vs `1,487` e service final por 1 linha (`712` vs `713`).
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-061/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `traceWinner=atomic`, `sourceChurnWinner=atomic`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-061/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Menos shell commands, menos reasoning tokens e 1 linha a menos no service final.
- Vitoria ATOMIC:
  - Operador semantico alto nivel funcionou, modo atomico limpo, trace isolado, menos eventos/input/output/source churn.
- Derrotas ATOMIC formalizadas:
  - Preflights desnecessarios (`git status`, `ls`) antes do operador alto nivel.
  - `ls` falhou porque o helper ainda nao existia, gerando failed command evitavel.
  - Prompt ainda induz deliberacao demais.
- Atualizacao aplicada:
  - Nenhuma mudanca de codigo adicional necessaria apos round 061; a correcao e prompt/harness: primeira acao do ATOMIC deve ser o operador `extract_symbol_to_file`, sem preflight.
- Criterio de revalidacao:
  - Round 062 repete a mesma tarefa com prompt ATOMIC ultracurto.
  - ATOMIC precisa preservar vitorias em trace/eventos/tokens/churn e vencer/empatar comandos shell e reasoning.

## ORCH-ATOMIC-AB-BENCH-062

- Status: validated_atomic_win_residual_line_loss_before_lapida
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded com prompt ATOMIC ultracurto e `extract_symbol_to_file` como primeira acao.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab062-normal-20260517101409`
  - ATOMIC: `/private/tmp/kloel-ab062-atomic-20260517101409`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions limpo.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=3`.
  - ATOMIC venceu eventos `15` vs `61`, shell commands `6` vs `8`, input `46,622` vs `53,476`, output `939` vs `2,469`, reasoning `549` vs `910`, source churn `26` vs `27` e trace/prova.
  - NORMAL venceu apenas service line count por 1 linha (`712` vs `713`).
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-062/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `shellCommandWinner=atomic`, `reasoningTokenWinner=atomic`, `serviceLineWinner=normal`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-062/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Service line count por 1 linha antes da lapida.
- Vitoria ATOMIC:
  - Venceu todas as metricas operacionais principais restantes: eventos, comandos, input/output/reasoning, source churn, trace e disciplina atomica.
- Derrotas ATOMIC formalizadas:
  - Vao de linha extra apos remocao de simbolo.
- Atualizacao aplicada:
  - `extract_symbol_to_file` compacta `\\n\\n\\n/**` para `\\n\\n/**` apos remover o simbolo.
  - Probe descartavel confirmou `service_lines=712` e `diff_numstat 1/26`.
- Criterio de revalidacao:
  - Round 063 repete a mesma tarefa/complexidade.
  - ATOMIC precisa manter as vitorias do round 062 e remover a derrota de service line count.

## ORCH-ATOMIC-AB-BENCH-063

- Status: validated_atomic_zero_loss_current_tier
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao bounded apos `extract_symbol_to_file` compactar o gap pos-remocao.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab063-normal-20260517102243`
  - ATOMIC: `/private/tmp/kloel-ab063-atomic-20260517102243`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions limpo.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=4`, `matchingTraceIds=[]`.
  - ATOMIC venceu eventos `14` vs `34`, shell commands `6` vs `7`, input `47,555` vs `51,856`, output `897` vs `2,131`, reasoning `441` vs `737` e trace/prova.
  - ATOMIC empatou service line count `712` vs `712`, touched Kloel files `2` vs `2` e source churn `27` vs `27`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-063/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `serviceLineWinner=tie`, `sourceChurnWinner=tie`, todos os vencedores operacionais restantes = `atomic`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-063/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Nenhuma metrica medida vencida no tier atual; apenas empates em tamanho/churn/arquivos tocados.
- Vitoria ATOMIC:
  - Primeira rodada zero-loss do tier atual, com ganhos fortes em eventos/output/reasoning e prova atomica.
- Derrotas ATOMIC formalizadas:
  - Nenhuma derrota medida; margem ainda insuficiente em shell commands e input tokens para escalar complexidade com o padrao de "muita superioridade".
- Atualizacao aplicada:
  - `extract_symbol_to_file` ganhou validacao embutida do perfil `kloel-unified-agent-extract`.
  - Probe descartavel confirmou `ok=true`, todos os checks verdes, service `712` linhas e source diff `1/26`.
- Criterio de revalidacao:
  - Round 064 repete a mesma tarefa/complexidade com validacao embutida no operador ATOMIC.
  - ATOMIC precisa manter zero derrotas e aumentar margem em comandos/eventos/tokens antes de escalar.

## ORCH-ATOMIC-AB-BENCH-064

- Status: validated_atomic_zero_loss_margin_current_tier
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir o tier atual com validacao embutida no operador ATOMIC para medir margem real antes de escalar.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab064-normal-20260517103612`
  - ATOMIC: `/private/tmp/kloel-ab064-atomic-20260517103612`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions limpo.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=4`, `matchingTraceIds=[]`.
  - ATOMIC venceu eventos `6` vs `27`, shell commands `1` vs `5`, input `47,626` vs `50,700`, output `440` vs `1,779`, reasoning `207` vs `795` e trace/prova.
  - ATOMIC empatou service line count `712` vs `712`, touched Kloel files `2` vs `2` e source churn `27` vs `27`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-064/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `shellCommandWinner=atomic`, todos os vencedores operacionais = `atomic`, empates apenas em codigo final.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-064/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Nenhuma metrica medida vencida; apenas empates em tamanho/churn/arquivos tocados.
- Vitoria ATOMIC:
  - Zero derrotas e margem forte no tier atual: 4.5x menos eventos, 5x menos comandos, ~4x menos output e ~3.8x menos reasoning.
- Derrotas ATOMIC formalizadas:
  - Nenhuma derrota medida. Input tokens venceu com margem pequena por baseline fixo de contexto/modelo.
- Criterio de revalidacao:
  - Escalar um degrau de complexidade no round 065.
  - Manter A/B com worktrees isolados, validacao externa e trace isolation.

## ORCH-ATOMIC-AB-BENCH-065

- Status: validated_atomic_win_with_residual_service_line_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: escalar complexidade para extracao dupla de `isAllowedTool` e `formatPromptValue`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab065-normal-20260517104607`
  - ATOMIC: `/private/tmp/kloel-ab065-atomic-20260517104607`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions limpo.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=6`, `matchingTraceIds=[]`.
  - ATOMIC venceu eventos `6` vs `24`, shell commands `1` vs `5`, input `49,939` vs `50,893`, output `399` vs `1,761`, reasoning `229` vs `418`, source churn `30` vs `31` e trace/prova.
  - NORMAL venceu service line count por 1 linha (`708` vs `709`).
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-065/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `serviceLineWinner=normal`, demais vencedores operacionais principais = `atomic`.
  - `normal-external-validation.log` e `atomic-external-validation.log`: gates funcionais verdes.
  - `docs/ai/atomic-os-benchmark/round-065/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Service line count por 1 linha, causado por blank line residual no ATOMIC.
- Vitoria ATOMIC:
  - Venceu economia operacional, traceability, disciplina atomic-only e source churn.
- Derrotas ATOMIC formalizadas:
  - Gap residual `\\n\\n\\nconst ` apos remocao de dois simbolos.
- Atualizacao aplicada:
  - `extract_symbols_to_file` compacta tambem `\\n\\n\\nconst ` para `\\n\\nconst `.
  - Probe descartavel confirmou service `708`, helper `29`, validacao embutida verde.
- Criterio de revalidacao:
  - Round 066 repete a extracao dupla.
  - ATOMIC precisa remover a derrota de service line count e manter economia operacional.

## ORCH-ATOMIC-AB-BENCH-066

- Status: rejected_as_clean_win_but_useful_failure
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao dupla apos compactacao de gap para remover a ultima derrota do round 065.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab066-normal-20260517105619`
  - ATOMIC: `/private/tmp/kloel-ab066-atomic-20260517105619`
- Resultado A/B:
  - Ambos lanes produziram o shape correto, passaram Jest focado, diff-check, protected diff e scan de suppressions.
  - Backend typecheck falhou nos dois lanes por Prisma Client compartilhado stale, nao por diferenca de implementacao.
  - ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=7`, service `708` e helper `29`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-066/audit.json`: `functionalPass=false` por typecheck ruidoso comum; `atomicModeClean=true`; economia operacional majoritariamente atomica, mas reasoning venceu NORMAL.
  - `docs/ai/atomic-os-benchmark/round-066/verdict.md`.
  - Retry idempotente posterior no worktree ATOMIC retornou `ok=true` apos `npm --prefix backend run prisma:generate`.
- Nivel de prova: N3 operacional local rejeitado como clean win; aceito como detector de falha de idempotencia parcial.
- Vitoria NORMAL:
  - Reasoning tokens e ausencia de timeout na primeira tentativa.
- Vitoria ATOMIC:
  - Disciplina atomic-only, trace isolation, shape final correto e operador idempotente apos lapida.
- Derrotas ATOMIC formalizadas:
  - Timeout OpenCode durante validacao embutida apos mutacao completa.
  - `extract_symbols_to_file` nao aceitava retry quando a mutacao ja tinha concluido e os simbolos ja tinham sido removidos da fonte.
- Atualizacao aplicada:
  - `extract_symbols_to_file` agora aceita idempotencia de sucesso parcial quando o target contem todos os simbolos e a source ja importa o helper.
  - Prisma Client local foi regenerado para remover ruido compartilhado de typecheck.
- Criterio de revalidacao:
  - Round 067 repete a extracao dupla com backend typecheck limpo e idempotencia reparada.

## ORCH-ATOMIC-AB-BENCH-067

- Status: validated_functional_atomic_win_with_command_failure_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: repetir a extracao dupla apos reparo de idempotencia.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab067-normal-20260517111035`
  - ATOMIC: `/private/tmp/kloel-ab067-atomic-20260517111035`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff e scan de suppressions.
  - ATOMIC manteve `atomicModeClean=true` e trace isolation `ok=true`.
  - ATOMIC venceu eventos `10` vs `44`, comandos `2` vs `7`, input `51,207` vs `52,311`, output `619` vs `2,344`, reasoning `1,060` vs `2,456` e trace.
  - NORMAL venceu failed commands `0` vs `1`; codigo final empatou em service `708`, helper `29`, touched files `2` e source churn `31`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-067/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `failedCommandWinner=normal`.
  - `docs/ai/atomic-os-benchmark/round-067/verdict.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Zero failed commands.
- Vitoria ATOMIC:
  - Economia operacional, traceability e disciplina atomic-only.
- Derrotas ATOMIC formalizadas:
  - `atomic-call.cjs` nao parseava JSON shell-escaped pelo OpenCode (`{\\\"...`).
- Atualizacao aplicada:
  - `atomic-call.cjs` parseia JSON normal e shell-escaped.
  - `round-audit.cjs` mede failed commands e ignora scans `rg` sem match esperados.
- Criterio de revalidacao:
  - Round 068 repete a mesma complexidade e exige failed commands `0`.

## ORCH-ATOMIC-AB-BENCH-068

- Status: validated_atomic_zero_loss_scaled_tier
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: fechar o tier de extracao dupla apos parser shell-escaped.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab068-normal-20260517111944`
  - ATOMIC: `/private/tmp/kloel-ab068-atomic-20260517111944`
- Resultado A/B:
  - Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff e scan de suppressions.
  - ATOMIC manteve `atomicModeClean=true`, zero failed commands, zero native file tools, zero shell code reads, zero masked pipelines e trace isolation `ok=true`.
  - ATOMIC venceu eventos `6` vs `42`, comandos `1` vs `7`, input `51,002` vs `55,832`, output `395` vs `2,175`, reasoning `194` vs `843` e trace.
  - Empates: failed commands `0` vs `0`, service `708`, helper `29`, touched files `2` e source churn `31`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-068/audit.json`: `functionalPass=true`, `atomicModeClean=true`, `failedCommandWinner=tie`, todos os vencedores operacionais principais = `atomic`, empates apenas em codigo final.
  - `docs/ai/atomic-os-benchmark/round-068/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-068.md` e `docs/ai/mission/handoffs/AB-ATOMIC-068.md`.
- Nivel de prova: N3 operacional local com workers OpenCode, worktrees isolados, eventos persistidos e validacao externa.
- Vitoria NORMAL:
  - Nenhuma metrica medida vencida; apenas empates em codigo final.
- Vitoria ATOMIC:
  - Zero-loss no tier escalado, com vantagem de 7x em eventos, 7x em comandos, ~5.5x em output e ~4.3x em reasoning, mais trace/prova.
- Derrotas ATOMIC formalizadas:
  - Nenhuma derrota medida neste tier.
- Criterio de revalidacao:
  - Escalar no round 069 para macro-refactor mais dificil, como extracao de metodos de classe para helper externo.

## ORCH-ATOMIC-AB-BENCH-069

- Status: rejected_atomic_macro_method_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: escalar para extracao de metodos privados de classe para helper externo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab069-normal-20260517113500`
  - ATOMIC: `/private/tmp/kloel-ab069-atomic-20260517113500`
- Resultado A/B:
  - Ambos lanes completaram exit 0, produziram helper externo e passaram Jest focado `13/13`, diff-check, protected diff, suppression scan e trace isolation.
  - Backend typecheck falhou nos dois lanes por erro externo compartilhado em Google Ads/Prisma Client.
  - NORMAL venceu eventos `36` vs `79`, comandos `6` vs `22`, failed commands `1` vs `3`, input `52,794` vs `68,004`, output `1,886` vs `4,990`, reasoning `764` vs `9,027`, service `725` vs `727` e acabamento.
  - ATOMIC venceu source churn `30` vs `32` e trace (`.atomic/traces=8`, isolation `ok=true`).
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-069/audit.json`: `functionalPass=false` por ruido compartilhado de typecheck; `atomicModeClean=false`; Normal venceu a maioria dos benchmarks operacionais.
  - `docs/ai/atomic-os-benchmark/round-069/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-069.md` e `docs/ai/mission/handoffs/AB-ATOMIC-069.md`.
- Nivel de prova: N3 operacional local rejeitado como vitoria atomica; aceito como detector de lacuna macro-operacional.
- Vitoria NORMAL:
  - Eficiencia operacional, menor service final, menor raciocinio, menos comandos e zero fallback atomico.
- Vitoria ATOMIC:
  - Traceability e menor source churn, mas insuficiente para aceitar o tier.
- Derrotas ATOMIC formalizadas:
  - `code_outline` com bare path sem JSON.
  - `extract_symbols_to_file` nao converte metodo de classe para funcao top-level.
  - Fallback com `cat`/JSON temporario.
  - Indentacao/gap final pior que Normal.
- Criterio de revalidacao:
  - Atualizar Atomic OS com operador macro `extract_class_methods_to_file`, validacao dinamica por scan files e prompt minimo; repetir a mesma tarefa no Round 070 sem escalar.

## ORCH-ATOMIC-AB-BENCH-077

- Status: validated_atomic_decisive_win_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: fechar o tier de extracao de metodos privados de classe para helper externo apos melhorias de launcher/command layer.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab077-normal-20260517135211`
  - ATOMIC: `/private/tmp/kloel-ab077-atomic-20260517135211`
- Resultado A/B:
  - ATOMIC completou exit `0`; NORMAL atingiu `max_timeout` do watchdog apos ~600s.
  - Ambos lanes produziram o shape de dois arquivos e passaram Jest focado `13/13`, diff-check, protected diff, suppression scan e trace isolation.
  - Backend typecheck falhou nos dois lanes por ruido externo compartilhado em Google Ads/Prisma Client, sem erro de `src/kloel/**` associado ao round.
  - ATOMIC manteve `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline, zero worktree escape e `.atomic/traces=10`.
  - ATOMIC venceu eventos `3` vs `100`, primeira acao `6.103ms` vs `20.774ms`, tempo total `57.247ms` vs `577.539ms`, comandos `1` vs `14`, failed commands `0` vs `1`, input `53.003` vs `73.285`, output `91` vs `4.376`, reasoning `114` vs `1.522` e trace.
  - Empates: touched Kloel files `2`, source churn `32`, service `725`, helper `12`.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-077/audit.json`
  - `docs/ai/atomic-os-benchmark/round-077/verdict.md`
  - `docs/ai/atomic-os-benchmark/round-077/normal-external-validation.log`
  - `docs/ai/atomic-os-benchmark/round-077/atomic-external-validation.log`
- Nivel de prova: N3 operacional local com dois workers OpenCode simultaneos, worktrees isolados, logs de eventos, validacao externa e trace isolation.
- Vitoria NORMAL:
  - Nenhuma metrica medida vencida; apenas chegou ao shape funcional antes do timeout final.
- Vitoria ATOMIC:
  - Vitoria ampla em economia, primeira acao, tempo total, traceability, disciplina atomic-only e zero falhas de comando.
- Derrotas ATOMIC formalizadas:
  - Nenhuma derrota medida neste tier.
- Criterio de revalidacao:
  - Escalar um degrau de complexidade no proximo round; nao escalar de novo ate ATOMIC vencer a nova tarefa sem derrota medida ou ate converter cada derrota em ferramenta/politica.

## ORCH-ATOMIC-AB-BENCH-078

- Status: rejected_atomic_context_dependency_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK
- Objetivo: escalar complexidade para extracao de tres metodos privados com dependencia de instancia (`this.agentRuntime`) para helper externo.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab078-normal-20260517141423`
  - ATOMIC: `/private/tmp/kloel-ab078-atomic-20260517141423`
- Resultado A/B:
  - NORMAL produziu helper externo com parametro explicito `AgentRuntimeContextService | undefined`, removeu os tres private methods e passou Jest focado `13/13`.
  - ATOMIC executou o macro em preprompt com `atomicModeClean=true`, mas moveu o corpo dos metodos sem adaptar `this.agentRuntime`; Jest focado falhou `8 failed, 5 passed`.
  - Backend typecheck falhou nos dois por ruido externo compartilhado, mas o lane ATOMIC tambem teve erros Kloel `TS2554` nos callsites do round.
  - ATOMIC venceu eventos `3` vs `78`, primeira acao `7.489ms` vs `21.466ms`, tempo total `69.403ms` vs `542.501ms`, comandos `1` vs `10`, input/output/reasoning, trace e source churn.
  - NORMAL venceu failed commands `0` vs `1` e o aceite funcional.
- Evidencia principal:
  - `docs/ai/atomic-os-benchmark/round-078/audit.json`
  - `docs/ai/atomic-os-benchmark/round-078/verdict.md`
  - `docs/ai/atomic-os-benchmark/round-078/normal-external-validation.log`
  - `docs/ai/atomic-os-benchmark/round-078/atomic-external-validation.log`
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-078.md` e `docs/ai/mission/handoffs/AB-ATOMIC-078.md`
- Nivel de prova: N3 operacional local rejeitado como vitoria atomica; aceito como detector de lacuna de macro-operador.
- Vitoria NORMAL:
  - Comportamento validado, helper sem `this.`, private methods removidos e zero failed commands.
- Vitoria ATOMIC:
  - Economia bruta e traceability, mas insuficientes porque o comportamento quebrou.
- Derrotas ATOMIC formalizadas:
  - `extract_class_methods_to_file` nao adapta dependencias de instancia para parametros explicitos.
  - Validacao embutida nao tinha gate especifico de helper no-`this.`.
  - OpenCode exit 0 nao pode mascarar preprompt exit 1 como sucesso.
- Criterio de revalidacao:
  - Atualizar Atomic OS com adaptadores de metodo (`targetHeader`, parametro de assinatura e `bodyReplacements`) e repetir o mesmo tier no Round 079 sem escalar.

## ORCH-ATOMIC-AB-BENCH-090

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 089 com `formatWithEslint=true` para eliminar residuo de lint sem perder preservacao.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab090-normal-20260517180307`
  - ATOMIC: `/private/tmp/kloel-ab090-atomic-20260517180307`
- Resultado:
  - NORMAL passou aceite focado, Jest `13/13`, `typecheckKloelErrors=0`, mas falhou lint por erro preexistente de `no-unsafe-assignment`.
  - ATOMIC venceu custo operacional e disciplina, mas falhou aceitacao funcional estrita por 1 erro Kloel de typecheck e 1 erro Prettier residual.
- Vitorias NORMAL:
  - `typecheckKloelErrors=0` contra `1` do ATOMIC.
  - Service/helper/total Kloel lines menores: `538/232/770` contra `547/235/782`.
  - Preservou o cast `abi as unknown as Record<string, unknown>`.
- Vitorias ATOMIC:
  - Eventos `3` vs `139`; primeira acao `5.960ms` vs `24.589ms`; tempo total `122.313ms` vs `885.167ms`.
  - Comandos `1` vs `16`; failed commands `0` vs `4`.
  - Input/output/reasoning `56.069/238/662` vs `76.502/11.196/11.371`.
  - Source churn `493` vs `495`; traces `20` vs `0`; `atomicModeClean=true`.
- Derrota atomica: `formatWithEslint` acionou fixers ESLint amplos e removeu cast fora da intencao.
- Ferramenta atualizada: `atomic-call.cjs` agora usa `--fix-type layout` por padrao quando `formatWithEslint=true`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-090/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-090/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-090/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-090/verdict.md`.
- Nivel de prova: N3/N4 local para detectar regressao de ferramenta em worktrees isolados.
- Criterio de revalidacao:
  - Repetir mesma tarefa no Round 091, sem escalar.
  - Exigir `typecheckKloelErrors=0` no ATOMIC, import formatado, `atomicModeClean=true`, traces e vantagem operacional mantida.

## ORCH-ATOMIC-AB-BENCH-091

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 090 apos restringir `formatWithEslint=true` para layout-only.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab091-normal-20260517182930`
  - ATOMIC: `/private/tmp/kloel-ab091-atomic-20260517182930`
- Resultado:
  - NORMAL entrou em `idle_timeout` sem mutar `backend/src/kloel/**`; helper nao foi criado e private methods permaneceram.
  - ATOMIC completou, criou helper, removeu os private methods, passou Jest `13/13`, scans estruturais e `typecheckKloelErrors=0`.
  - Backend typecheck global continuou falhando nos dois por ruido compartilhado Google Ads/Prisma fora do escopo.
  - ATOMIC falhou lint focado por Prettier no import multiline apos `atomic_remove_import`; por isso `taskFunctionalPass=false`.
- Vitorias NORMAL:
  - Nenhuma vitoria produtiva; tokens/comandos/churn menores sao efeito de no-op por timeout.
- Vitorias ATOMIC:
  - Completion status, primeira acao, wall time efetivo, shape funcional, typecheck Kloel zero e traces.
- Derrotas ATOMIC formalizadas:
  - `round-audit.cjs` nao contava lint no aceite.
  - `atomic_remove_import` nao reformatava layout apos remover specifiers.
- Ferramentas atualizadas:
  - `round-audit.cjs` agora mede lane status, completion, timeout-aware wall time e lint status.
  - `round-audit.cjs` inclui lint em `taskFunctionalPass`.
  - `atomic-call.cjs` agora aplica layout-only ESLint dry-run apos fallback `atomic_remove_import`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-091/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-091/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-091/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-091/verdict.md`.
- Nivel de prova: N3/N4 local para detectar regressao de benchmark/tooling em worktrees isolados.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 092, sem escalar.
  - Exigir ATOMIC `lintStatus=0`, `typecheckKloelErrors=0`, `atomicModeClean=true`, traces e vantagem operacional.

## ORCH-ATOMIC-AB-BENCH-092

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 091 apos `atomic_remove_import` aplicar layout-only fix.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab092-normal-20260517184415`
  - ATOMIC: `/private/tmp/kloel-ab092-atomic-20260517184415`
- Resultado:
  - NORMAL novamente entrou em `idle_timeout` sem mutar `backend/src/kloel/**`.
  - ATOMIC completou, corrigiu o import formatting, passou Jest `13/13`, scans estruturais e `typecheckKloelErrors=0`.
  - ATOMIC ainda falhou lint focado por 1 `no-unsafe-assignment` preexistente no `JSON.parse` de `toolArgs`, dentro do metodo tocado.
- Vitorias ATOMIC:
  - Completion, primeira acao, wall time efetivo, input/output/reasoning, shape funcional, typecheck Kloel zero e traces.
- Derrotas ATOMIC formalizadas:
  - O gate de lint estrito exige reparar residuo preexistente quando ele fica no arquivo/metodo tocado.
  - O operador precisava de uma fase generica pos-lint para aplicar reparos sem hardcode de tarefa.
- Ferramenta atualizada:
  - `extract_class_methods_to_file` agora aceita `postLintReplacements` e roda uma segunda transacao layout-only apos essas substituicoes.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-092/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-092/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-092/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-092/verdict.md`.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 093, sem escalar.
  - Usar `postLintReplacements` para converter o parse de `toolArgs` para `unknown` + object guard.
  - Exigir ATOMIC `lintStatus=0`, `typecheckKloelErrors=0`, `atomicModeClean=true` e margem operacional.

## ORCH-ATOMIC-AB-BENCH-093

- Status: validated_repeat_same_complexity_shape_gap
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 092 apos adicionar `postLintReplacements`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab093-normal-20260517185611`
  - ATOMIC: `/private/tmp/kloel-ab093-atomic-20260517185611`
- Resultado:
  - Ambos lanes passaram aceite focado por validacao externa: Jest `13/13`,
    lint dos arquivos tocados `0`, diff-check `0`, protected diff vazio,
    suppression scan limpo, helper sem `this.`, cluster exportado e private
    methods removidos.
  - NORMAL ficou funcional, mas atingiu `max_timeout` em 900.843ms.
  - ATOMIC completou, ficou `atomicModeClean=true`, zerou failed commands,
    manteve 22 traces e corrigiu o residuo `JSON.parse` do Round 092.
  - Typecheck global falhou nos dois por ruido compartilhado Google Ads/Prisma
    fora de `src/kloel/**`; `typecheckKloelErrors=0` nos dois.
- Vitorias NORMAL:
  - Service final menor: `536` vs `548`.
  - Source churn menor: `487` vs `494`.
- Vitorias ATOMIC:
  - Lane completion: `completed` vs `max_timeout`.
  - Eventos `3` vs `128`; primeira acao `5.309ms` vs `27.596ms`; tempo total
    `157.529ms` vs `900.843ms`.
  - Comandos `1` vs `14`; failed commands `0` vs `5`.
  - Input/output/reasoning `59.624/77/25` vs `83.286/10.371/13.311`.
  - Traces `22` vs `0`; disciplina atomic-only limpa.
- Derrotas ATOMIC formalizadas:
  - Shape final ainda tem 12 linhas a mais no service e 7 linhas a mais de
    churn que o Normal.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-093/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-093/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-093/atomic-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-093/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-093.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-093.md`.
- Nivel de prova: N3/N4 local para a classe de benchmark, com dois worktrees
  isolados, logs persistidos, auditor externo e validacao focada.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 094, sem escalar.
  - Atualizar o macro atomico para compactar shape final e reduzir churn.
  - Escalar apenas se ATOMIC mantiver aceite focado verde, `atomicModeClean=true`
    e zerar/empatar as derrotas de `serviceLines` e `sourceChurn`.

## ORCH-ATOMIC-AB-BENCH-094

- Status: rejected_repeat_same_complexity_policy_escape_failure
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 093 com compactacao de shape final no router
  cluster + `actionSucceeded`.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab094-normal-20260517192409`
  - ATOMIC: `/private/tmp/kloel-ab094-atomic-20260517192409`
- Resultado:
  - NORMAL passou o aceite focado externo e foi aceito como baseline funcional,
    embora tenha atingido `max_timeout`.
  - ATOMIC completou o turno, mas a macro preprompt saiu com codigo `1` e a
    validacao externa falhou: Jest `12/13`, lint vermelho,
    `typecheckKloelErrors=4`, private methods ainda presentes.
  - O guard atomico recusou escrever uma substituicao sintaticamente invalida
    com `\n` escapado; isso evitou disco quebrado, mas a transacao macro deixou
    estado parcial anterior.
- Vitorias NORMAL:
  - Aceite funcional real.
  - `typecheckKloelErrors=0`.
  - Service/total lines menores: `558/790` vs `738/978`.
- Vitorias ATOMIC:
  - Eventos `3` vs `155`.
  - Primeira acao `5.315s` vs `20.702s`.
  - Comandos `1` vs `15`; failed commands `1` vs `3`.
  - Input/output/reasoning `52.012/126/281` vs `93.002/11.205/7.502`.
  - Traceabilidade `6` vs `0` e disciplina atomic-only limpa.
- Derrotas ATOMIC formalizadas:
  - Texto multiline escapado (`\n`) foi usado como codigo real em replacement.
  - Macro alta nao teve rollback/idempotent cleanup quando uma etapa posterior
    foi recusada.
  - Operacionalmente rapido nao conta se `taskFunctionalPass=false`.
- Ferramentas atualizadas:
  - `atomic-call.cjs` ganhou decode opt-in para replacement text.
  - `atomic_add_import` ganhou `typeOnly`.
  - `round-audit.cjs` passou a aceitar NORMAL task-functional com ruido
    compartilhado fora de Kloel.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-094/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-094/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-094/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-094/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-094.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-094.md`.
- Nivel de prova: N3/N4 local para detectar derrota funcional em worktrees
  isolados; nao e vitoria atomica.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 095, sem escalar.
  - Usar `decodeEscapedNewlinesInReplacements` ou gerar newlines reais.
  - Exigir ATOMIC `taskFunctionalPass=true`, `lintStatus=0`,
    `typecheckKloelErrors=0`, private methods removidos, `atomicModeClean=true`
    e nenhuma derrota de shape/churn antes de escalar.

## ORCH-ATOMIC-AB-BENCH-095

- Status: rejected_repeat_same_complexity_type_surface_failure
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 094 com replacements newline-safe e dependency
  surface compacto.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab095-normal-20260517195614`
  - ATOMIC: `/private/tmp/kloel-ab095-atomic-20260517195614`
- Resultado:
  - Nenhum lane foi aceito como vencedor funcional.
  - NORMAL passou Jest, diff/protected/suppression/helper/private scans e teve
    `typecheckKloelErrors=0`, mas atingiu `max_timeout` e deixou lint focado
    vermelho.
  - ATOMIC completou o lane, manteve `atomicModeClean=true`, passou Jest/lint e
    scans estruturais, mas deixou `typecheckKloelErrors=1` em
    `ExecuteToolActionDeps` sob `exactOptionalPropertyTypes`.
- Vitorias NORMAL:
  - Shape menor: service/helper/total lines `535/232/767` vs `542/235/777`.
  - Source churn menor: `232` vs `235`.
  - Zero touched Kloel typecheck errors.
- Vitorias ATOMIC:
  - Completion: `completed` vs `max_timeout`.
  - Eventos `3` vs `122`; primeira acao `6.021s` vs `23.128s`; tempo total
    `192.132s` vs `900.791s`.
  - Comandos `1` vs `13`; failed commands `0` vs `2`.
  - Input/output/reasoning `61.085/178/356` vs `77.842/10.124/11.733`.
  - Traces `25` vs `0`; disciplina atomic-only limpa.
- Derrotas ATOMIC formalizadas:
  - Propriedades opcionais do contrato de deps foram atribuidas explicitamente
    como `undefined`, o que exige `Type | undefined` em vez de `?`.
  - Macro no-code-typecheck nao pode declarar vitoria enquanto o auditor externo
    encontra erro tocado.
  - Shape/churn ainda perdeu para NORMAL.
- Ferramentas atualizadas:
  - `atomic-call.cjs` normaliza dinamicamente optional deps explicitamente
    atribuidas em `postRemovalReplacements`.
  - `round-audit.cjs` parseia validacao externa real, `*_done`, touched
    typecheck count, worktree metadata e traces do worktree.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-095/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-095/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-095/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-095/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-095.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-095.md`.
- Nivel de prova: N3/N4 local para detectar derrota funcional em worktrees
  isolados; nao e vitoria atomica.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 096, sem escalar.
  - Exigir `typecheckKloelErrors=0`, lint/Jest/scans verdes, `atomicModeClean=true`,
    e ATOMIC empatando/vencendo shape/churn antes de escalar.

## ORCH-ATOMIC-AB-BENCH-096

- Status: accepted_atomic_functional_win_not_scaled
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 095 apos optional-deps normalization.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab096-normal-20260517202616`
  - ATOMIC: `/private/tmp/kloel-ab096-atomic-20260517202616`
- Resultado:
  - ATOMIC passou funcionalmente; NORMAL falhou por `idle_timeout` sem entregar
    o helper nem remover private methods.
  - Shape/churn foram marcados `not_applicable`, porque comparar uma entrega
    completa contra no-op normal seria falso.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita de tarefa.
- Vitorias ATOMIC:
  - `taskFunctionalPass=true`; NORMAL `false`.
  - Eventos `3` vs `17`; primeira acao `5.336s` vs `22.124s`; tempo total
    `203.111s` vs `304.270s`.
  - Input/output/reasoning `61.120/97/488` vs `69.937/558/1.300`.
  - Traces `25` vs `0`; `atomicModeClean=true`; `typecheckKloelErrors=0`.
- Derrotas ATOMIC formalizadas:
  - Shape/churn comparativo ainda nao provado contra Normal funcional.
  - Relatorio intermediario de `atomic_apply_eslint_dry_run_fixes` ainda mostra
    ruido antes do cleanup final.
- Ferramentas atualizadas:
  - `round-audit.cjs` nao atribui vitoria de shape/churn quando ambos os lanes
    nao sao task-functional.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-096/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-096/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-096/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-096/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-096.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-096.md`.
- Nivel de prova: N3/N4 local para vitoria funcional em worktrees isolados; sem
  escalada por falta de baseline Normal funcional.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 097, sem escalar.
  - Se NORMAL falhar de novo e ATOMIC passar, registrar dominancia por falha
    repetida do baseline; se NORMAL passar, comparar shape/churn de verdade.

## ORCH-ATOMIC-AB-BENCH-097

- Status: rejected_harness_validation_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o Round 096 para obter baseline NORMAL comparavel ou falha
  NORMAL repetida.
- Workspaces:
  - NORMAL: `/private/tmp/kloel-ab097-normal-20260517204003`
  - ATOMIC: `/private/tmp/kloel-ab097-atomic-20260517204003`
- Resultado:
  - Nenhum vencedor aceito.
  - Watchdog marcou ambos lanes como `completed` exit `0`, mas os worktrees
    desapareceram antes da validacao externa independente.
  - Logs de validacao externa registram `No such file or directory`; portanto
    Jest/lint/typecheck/diff final nao contam como prova.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita; event-stream self-report nao substitui validacao
    externa.
- Vitorias ATOMIC:
  - Nenhuma vitoria aceita; preprompt exit `0` nao substitui validacao externa.
- Derrotas/falhas formalizadas:
  - Harness usou worktrees em `/private/tmp` sem garantia de retencao ate a
    validacao externa.
  - Watchdog media idle apenas por JSONL e podia ignorar output ativo do
    preprompt.
- Ferramentas atualizadas:
  - `opencode-round-watchdog.cjs` passou a somar o tamanho do
    `opencode-<lane>-preprompt-output.log` no heartbeat do lane.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-097/opencode-watchdog-status.json`.
  - `docs/ai/atomic-os-benchmark/round-097/opencode-normal-events.jsonl`.
  - `docs/ai/atomic-os-benchmark/round-097/opencode-atomic-events.jsonl`.
  - `docs/ai/atomic-os-benchmark/round-097/verdict.md`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-097.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-097.md`.
- Nivel de prova: N2/N3 para achado de harness; N0 para vitoria tecnica da
  tarefa, porque a validacao externa final nao executou sobre os arquivos.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 098 com worktrees persistentes fora de
    `/private/tmp`.
  - Aceitar resultado somente com validacao externa independente completa.

## ORCH-ATOMIC-AB-BENCH-098

- Status: accepted_atomic_repeated_completion_dominance
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir a dificuldade do Round 096/097 com worktrees persistentes.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab098-normal-20260517210129`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab098-atomic-20260517210129`
- Resultado:
  - ATOMIC task-functional; NORMAL nao funcional.
  - NORMAL caiu em `idle_timeout`, sem helper e sem remocao dos private methods.
  - ATOMIC passou validacao externa focada com `typecheckKloelErrors=0`.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita na tarefa; `shellCommandWinner=normal` nao e
    comparavel porque nao houve delta de tarefa.
- Vitorias ATOMIC:
  - `atomicTaskFunctionalPass=true` vs NORMAL `false`.
  - Completion: `completed` vs `idle_timeout`.
  - Eventos `3` vs `36`; primeira acao `6.582s` vs `31.970s`; effective agent
    time `163.699s` vs `452.398s`.
  - Input/output/reasoning menores; traces `25` vs `0`; `atomicModeClean=true`.
  - Jest/lint/diff/protected/suppression/helper/private scans verdes.
- Derrotas/falhas formalizadas:
  - Shape/churn continuam sem comparacao por falta de baseline funcional NORMAL.
  - O Round 097 mostrou que `/private/tmp` nao e superficie de retencao
    suficiente para prova externa; Round 098 corrigiu o procedimento.
- Ferramentas atualizadas:
  - Nenhuma nova atualizacao alem do watchdog feita no Round 097.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-098/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-098/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-098/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-098/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-098.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-098.md`.
- Nivel de prova: N3/N4 local para vitoria funcional em worktrees persistentes.
- Criterio de revalidacao:
  - Escalar um degrau controlado no Round 099.
  - Manter worktrees persistentes e validacao externa completa.

## ORCH-ATOMIC-AB-BENCH-099

- Status: accepted_atomic_scaled_tier_win
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar de router cluster para router + runtime-context cluster.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-normal-20260517211534`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab099-atomic-20260517211534`
- Resultado:
  - ATOMIC task-functional; NORMAL nao funcional por `max_timeout` e lint red.
  - Ambos mantiveram `typecheckKloelErrors=0` com ruido compartilhado fora de
    Kloel.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita. O diff parcial passou Jest, mas falhou lint e tempo.
- Vitorias ATOMIC:
  - `atomicTaskFunctionalPass=true` vs NORMAL `false`.
  - Completion: `completed` vs `max_timeout`.
  - Eventos `3` vs `100`; comandos `1` vs `7`; failed commands `0` vs `2`.
  - Effective agent time `189.115s` vs `900.751s`.
  - Service/helper/total lines `518/267/785` vs `532/264/796`.
  - Source churn `558` vs `571`.
  - Traces `32` vs `0`; `atomicModeClean=true`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota atomica medida nesta rodada.
  - Global typecheck segue vermelho por ruido compartilhado Google Ads/Prisma
    fora do escopo.
- Ferramentas atualizadas:
  - Nenhuma nova atualizacao necessaria.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-099/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-099/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-099/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-099/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-099.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-099.md`.
- Nivel de prova: N3/N4 local para vitoria funcional e operacional em worktrees
  persistentes.
- Criterio de revalidacao:
  - Escalar mais um degrau controlado no proximo round.
  - Manter a mesma disciplina de worktrees persistentes e validacao externa.

## ORCH-ATOMIC-AB-BENCH-100

- Status: accepted_atomic_operational_win_not_zero_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar para extracao mista top-level + router +
  runtime-context cluster.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab100-normal-20260518004200`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab100-atomic-20260518004200`
- Resultado:
  - ATOMIC venceu operacionalmente, mas nao fechou zero-loss.
  - NORMAL atingiu `max_timeout`, porem a validacao externa tardia mostrou
    tarefa funcional focada.
  - Ambos mantiveram touched typecheck errors `0`; backend typecheck global
    segue vermelho apenas por ruido compartilhado Google Ads/Prisma fora de
    `src/kloel/**`.
- Vitorias NORMAL:
  - Service/helper/total `486/297/783` vs ATOMIC `490/297/787`.
  - Churn estimado `616` vs ATOMIC `620`.
  - Causa: getter de dependencias e assercao direta de JSON; a compactacao nao
    deve ser copiada quando reduz prova semantica.
- Vitorias ATOMIC:
  - Completion: `completed` vs `max_timeout`.
  - Agent time `202.852s` vs `900.920s`.
  - First action `6.822s` vs `28.194s`.
  - Eventos `3` vs `129`; comandos `1` vs `4`; failed commands `0` vs `3`.
  - Native write/edit tools `0` vs NORMAL `write=1`, `edit=11`.
  - Traces `40` vs `0`.
  - Jest/lint/diff/protected/suppression/helper/private/top-level/public scans
    verdes nos dois lanes.
- Derrotas/falhas formalizadas:
  - ATOMIC ainda carregava hardcode operacional no bloco de dependencias do
    prompt e ficou 4 linhas/churn maior.
  - Global typecheck ruidoso fora do escopo permanece risco residual global.
- Ferramentas atualizadas:
  - `atomic-call.cjs` agora aceita `dependencyContainer`/`depsContainer` com
    `style=getter` para gerar getter de dependencias dinamicamente.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-100/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-100/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-100/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-100/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-100.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-100.md`.
- Nivel de prova: N3/N4 local para vitoria operacional em worktrees
  persistentes; sem claim de build global por typecheck compartilhado vermelho.
- Criterio de revalidacao:
  - Repetir a mesma dificuldade no Round 101 com `dependencyContainer` getter.
  - Nao escalar ate ATOMIC manter completion/validacao e empatar ou vencer
    compactacao sem reduzir seguranca de parse.

## ORCH-ATOMIC-AB-BENCH-101

- Status: rejected_atomic_tool_regression
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 100 com `dependencyContainer` getter dinamico.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab101-normal-20260517221012`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab101-atomic-20260517221012`
- Resultado:
  - Nenhum vencedor aceito.
  - ATOMIC preprompt exit `1` por marcador de insercao rigido demais.
  - NORMAL nao foi deixado ate o fim porque a comparacao ja estava invalida.
- Derrotas/falhas formalizadas:
  - `dependencyContainer` gerava oldText exato para o tail da classe; apos
    remocoes atomicas, linhas em branco variaveis quebraram a aplicacao.
- Ferramentas atualizadas:
  - `atomic-call.cjs` agora gera `anchorText` e resolve o tail real atual do
    arquivo antes de aplicar o getter.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-101/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-101/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-101/opencode-atomic-preprompt-output.log`.
- Nivel de prova: N3 para achado de ferramenta; N0 para comparacao A/B.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 102.

## ORCH-ATOMIC-AB-BENCH-102

- Status: rejected_atomic_policy_regression
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 100/101 com `dependencyContainer` getter ancorado
  dinamicamente.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab102-normal-20260517221550`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab102-atomic-20260517221550`
- Resultado:
  - Nenhum vencedor aceito.
  - ATOMIC preprompt exit `1`: smoke interno passou, mas o gate `no deps
    builder method` falhou.
  - NORMAL foi encerrado cedo enquanto ainda rodava, porque a comparacao ja
    estava invalida.
- Derrotas/falhas formalizadas:
  - A politica exigia `private get toolRouterDeps(): ExecuteToolActionDeps`,
    mas tambem proibia o texto `toolRouterDeps()`.
  - A substring aparece na assinatura do getter, entao a validacao rejeitou o
    proprio shape exigido.
- Ferramentas atualizadas:
  - `atomic-call.cjs` agora suporta `dependencyContainer.style =
    "constructorProperty"`, gerando propriedade explicita e atribuicao no
    construtor a partir de `entries`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-102/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-102/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-102/opencode-atomic-preprompt-output.log`.
  - `docs/ai/mission/handoffs/AB-NORMAL-102.md`.
  - `docs/ai/mission/handoffs/AB-ATOMIC-102.md`.
- Nivel de prova: N3 para achado de ferramenta; N0 para comparacao A/B.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 103 usando
    `dependencyContainer.style = "constructorProperty"`.

## ORCH-ATOMIC-AB-BENCH-103

- Status: accepted_atomic_win_not_zero_loss
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir a dificuldade Round 100/101/102 com
  `dependencyContainer.style = "constructorProperty"`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab103-normal-20260517222550`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab103-atomic-20260517222550`
- Resultado:
  - ATOMIC venceu funcionalmente e operacionalmente.
  - NORMAL atingiu `max_timeout` e falhou focused ESLint.
  - Ambos tiveram touched typecheck errors `0`; typecheck global segue vermelho
    por ruido compartilhado Google Ads/Prisma fora do escopo.
- Vitorias NORMAL:
  - Service lines `486` vs ATOMIC `490`.
  - Source churn `619` vs ATOMIC `620`.
  - Essas vitorias nao foram aceitas como suficientes porque NORMAL falhou lint
    e completion.
- Vitorias ATOMIC:
  - `atomicTaskFunctionalPass=true` vs NORMAL `false`.
  - Completion: `completed` vs `max_timeout`.
  - Focused ESLint `0` vs `1`.
  - Eventos `3` vs `80`; comandos `1` vs `4`; failed commands `0` vs `2`.
  - Agent time `216.449s` vs `900.845s`; first action `6.509s` vs `25.598s`.
  - Input/output/reasoning `66.086/249/119` vs `80.332/9.741/12.106`.
  - Native file tool violations `0` vs `20`.
  - Helper lines `297` vs `306`; total Kloel lines `787` vs `792`.
  - Traces `40` vs `0`; `atomicModeClean=true`.
- Derrotas/falhas formalizadas:
  - ATOMIC ainda nao empatou/venceu service-line e source-churn brutos.
  - O ganho do NORMAL veio junto de lint quebrado/unsafe residue, entao nao deve
    ser copiado diretamente.
- Ferramentas atualizadas:
  - `round-audit.cjs` agora torna `forbiddenAtomicCommands` dependente do lane,
    evitando marcar o preprompt-shell atomico como violacao.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-103/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-103/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-103/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-103/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-103.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-103.md`.
- Nivel de prova: N3/N4 local para vitoria funcional e operacional em worktrees
  persistentes; sem claim de build global por typecheck compartilhado vermelho.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 104.
  - Nao escalar ate ATOMIC manter gates verdes e empatar/vencer service/churn
    sem reduzir seguranca, lint ou traceability.

## ORCH-ATOMIC-AB-BENCH-104

- Status: accepted_atomic_functional_policy_regression
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 103 testando `routerDeps` getter como politica
  compacta de dependencias.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab104-normal-20260517225550`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab104-atomic-20260517225550`
- Resultado:
  - NORMAL foi no-op/idle e nao entregou a tarefa.
  - ATOMIC entregou funcionalmente e passou gates focados.
  - A politica `routerDeps` getter foi rejeitada por regressao de shape contra
    Round 103.
- Vitorias NORMAL:
  - Apenas metricas de no-op: `0` comandos, input/reasoning menores e churn `0`
    por nao ter mutado codigo. Nao comparavel como entrega.
- Vitorias ATOMIC:
  - `atomicTaskFunctionalPass=true`.
  - Completion: `completed` vs `idle_timeout`.
  - Focused ESLint `0` vs `1`.
  - Eventos `3` vs `7`; first action `6.539s` vs `26.166s`; agent time
    `195.667s` vs `216.204s`; output tokens `75` vs `324`.
  - Native file tool violations `0` vs `1`.
  - Traces `39` vs `0`; `atomicModeClean=true`.
- Derrotas/falhas formalizadas:
  - `routerDeps` getter nao e uma solucao de compactacao: service/helper/total
    `491/297/788` contra Round 103 `490/297/787`.
  - Source churn `619` ainda nao fecha zero-loss.
- Ferramentas/politica atualizadas:
  - `DG-011` rejeita reusar o getter `routerDeps` como resposta padrao a
    service/churn neste tier.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-104/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-104/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-104/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-104/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-104.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-104.md`.
- Nivel de prova: N3/N4 local para entrega funcional atomica; N3 para rejeicao
  da politica getter por comparacao contra Round 103.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 105.
  - Tentar mover o parse seguro de `toolArgs` para helper/header ou politica
    equivalente para reduzir service lines mantendo focused ESLint verde.

## ORCH-ATOMIC-AB-BENCH-105

- Status: rejected_both_lanes_policy_sequence_failure
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 103/104 testando parse seguro de `toolArgs` movido
  para helper/header sem reusar `routerDeps` getter.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-normal-20260518020829`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab105-atomic-20260518020829`
- Resultado:
  - NORMAL passou focused Jest, mas ficou em `max_timeout` e focused ESLint
    vermelho.
  - ATOMIC completou o lane e manteve atomic-only limpo, mas falhou focused
    Jest, focused ESLint e touched Kloel typecheck porque `parseToolArgs` foi
    usado antes do import.
- Vitorias NORMAL:
  - Focused Jest `13/13` contra ATOMIC `12/13`.
  - Touched Kloel typecheck errors `0` contra ATOMIC `4`.
  - Failed commands `0` contra ATOMIC `1`.
  - Service lines `494` contra ATOMIC `510`.
- Vitorias ATOMIC:
  - Completion de lane: `completed` contra `max_timeout`.
  - `atomicModeClean=true`; native file tool violations `0` contra `38`.
  - Eventos `2` contra `111`; primeira acao `8.924s` contra `24.233s`;
    tempo total `120.211s` contra `900.823s`.
  - Input/output/reasoning `56.514/0/318` contra `87.685/11.011/11.594`.
  - Traces `28` contra `0`.
  - Helper lines `274` contra `304`; total Kloel lines `784` contra `798`;
    source churn `567` contra `627`.
- Derrotas/falhas formalizadas:
  - ATOMIC violou sequenciamento de dependencia: source replacement antes de
    import/helper estar disponivel no service.
  - NORMAL continua sem self-termination limpa e sem lint verde.
- Ferramentas/politica atualizadas:
  - `DG-012` rejeita a sequencia Round 105 de parser helper antes do import.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-105/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-105/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-105/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-105/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-105.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-105.md`.
- Nivel de prova: N3/N4 local para rejeicao do round e para diagnostico de
  sequenciamento; sem claim de vitoria atomica.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 106.
  - ATOMIC deve adicionar/importar `parseToolArgs` antes do replacement de
    callsite, ou executar a mudanca como batch dependency-aware unico.
  - Exigir focused Jest, focused ESLint, touched typecheck errors `0`,
    protected diff vazio, trace proof e `atomicModeClean=true`.

## ORCH-ATOMIC-AB-BENCH-106

- Status: accepted_atomic_zero_loss_confirmation_required
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 105 com parser helper dependency-aware e confirmar se
  ATOMIC recupera comportamento sem perder eficiencia.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab106-normal-20260517233648`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab106-atomic-20260517233648`
- Resultado:
  - NORMAL foi funcional, mas atingiu `max_timeout`.
  - ATOMIC foi funcional, completou o lane e venceu todas as metricas dominantes.
- Vitorias NORMAL:
  - Helper lines `308` contra ATOMIC `313`.
- Vitorias ATOMIC:
  - Completion: `completed` contra `max_timeout`.
  - `atomicModeClean=true`; native file tool violations `0` contra `34`.
  - Eventos `3` contra `128`; primeira acao `6.155s` contra `26.279s`;
    tempo total `178.958s` contra `900.800s`.
  - Comandos `1` contra `8`; failed commands `0` contra `2`.
  - Input/output/reasoning `69.365/114/387` contra `82.932/11.916/10.381`.
  - Traces `41` contra `0`.
  - Service lines `482` contra `512`; total Kloel lines `795` contra `820`;
    source churn `638` contra `667`.
- Derrotas/falhas formalizadas:
  - ATOMIC perdeu helper-line count isolado por 5 linhas, sem perder total line
    count.
  - NORMAL ainda nao converge dentro do budget.
- Ferramentas/politica atualizadas:
  - Nenhuma alteracao de ferramenta necessaria neste round; a politica Round 106
    corrige DG-012 por sequenciamento.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-106/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-106/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-106/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-106/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-106.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-106.md`.
- Nivel de prova: N3/N4 local para vitoria atomica em worktrees persistentes;
  N5 ainda pendente de repeticao posterior.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 107.
  - Escalar apenas se ATOMIC mantiver gates verdes, `atomicModeClean=true`,
    zero perdas dominantes e vantagem ampla de tempo/comandos/tokens/churn.

## ORCH-ATOMIC-AB-BENCH-107

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 106 para confirmar estabilidade local antes de
  escalar complexidade.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab107-normal-20260518000037`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab107-atomic-20260518000037`
- Resultado:
  - NORMAL foi rejeitado: `max_timeout`, focused Jest `9/13`, focused ESLint
    vermelho, touched Kloel typecheck errors `3` e runtime
    `ReferenceError: num is not defined`.
  - ATOMIC foi aceito: lane `completed`, focused Jest `13/13`, focused ESLint
    `0`, touched Kloel typecheck errors `0`, `atomicModeClean=true` e traces
    `41`.
- Vitorias NORMAL:
  - Nenhuma categoria significativa; `0` completed commands e artefato de
    nao-convergencia, nao vitoria real.
- Vitorias ATOMIC:
  - Task-functional pass contra falha funcional do NORMAL.
  - Eventos `3` contra `116`; primeira acao `6.562s` contra `24.056s`;
    tempo total `187.646s` contra `900.811s`.
  - Input/output/reasoning `69.369/146/156` contra `85.498/10.510/13.335`.
  - Native file tool violations `0` contra `36`; traces `41` contra `0`.
  - Service lines `482` contra `515`; total Kloel lines `795` contra `820`;
    source churn `638` contra `661`.
- Derrotas/falhas formalizadas:
  - NORMAL continuou sem convergir e quebrou dependencia `num`.
  - Nenhuma derrota atomica dominante neste tier.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca de ferramenta necessaria; Round 107 confirma que a politica
    dependency-aware Round 106 e estavel neste tier.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-107/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-107/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-107/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-107/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-107.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-107.md`.
- Nivel de prova: N5 local para estabilidade deste tier, porque a vitoria
  atomica do Round 106 foi confirmada por reexecucao posterior no Round 107 com
  validacao externa focada.
- Criterio de revalidacao:
  - Round 108 deve escalar um degrau controlado mantendo 2 workers, worktrees
    persistentes e gates focados.
  - Se ATOMIC perder qualquer gate funcional, nao escalar de novo; formalizar a
    derrota e atualizar operador/politica.

## ORCH-ATOMIC-AB-BENCH-108

- Status: rejected_both_lanes_policy_residue
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau para split multi-modulo do cluster
  router/runtime de `UnifiedAgentService`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab108-normal-20260518002543`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab108-atomic-20260518002543`
- Resultado:
  - NORMAL rejeitado por `idle_timeout` e wiring incompleto; private methods e
    top-level helpers permaneceram no service.
  - ATOMIC rejeitado por residue de politica: `ToolArgs` importado sem uso no
    runtime helper, quebrando focused ESLint e touched typecheck.
- Vitorias NORMAL:
  - Touched Kloel typecheck errors `0` contra ATOMIC `1`, mas sem task-functional
    pass.
  - Input tokens `65.653` contra ATOMIC `71.153`, sem conclusao de tarefa.
- Vitorias ATOMIC:
  - Completion `completed` contra `idle_timeout`.
  - `atomicModeClean=true`; native file tool violations `0` contra `12`.
  - Eventos `3` contra `38`; primeira acao `5.623s` contra `28.016s`; tempo
    `229.828s` contra `504.467s`.
  - Output/reasoning tokens `335/372` contra `4.436/4.000`.
  - Traces `45` contra `0` e shape estrutural multi-modulo.
- Derrotas/falhas formalizadas:
  - ATOMIC: runtime target header carregava `ToolArgs` sem uso.
  - NORMAL: criou helpers por native write, mas nao concluiu a migracao do
    service.
- Ferramentas/politica atualizadas:
  - `DG-013` rejeita runtime helper target header com import `ToolArgs`
    desnecessario.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-108/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-108/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-108/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-108/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-108.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-108.md`.
- Nivel de prova: N3/N4 local para rejeicao do round e para diagnostico do
  import inutil; sem claim de superioridade neste tier.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 109.
  - Runtime helper target header deve importar somente
    `AgentRuntimeContextService`.
  - Validacao deve exigir ausencia de `ToolArgs` em
    `unified-agent-runtime.helpers.ts`, focused ESLint `0` e touched typecheck
    errors `0`.

## ORCH-ATOMIC-AB-BENCH-109

- Status: validated_repeat_before_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 108 com runtime target header minimo e check explicito
  contra `ToolArgs` no runtime helper.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab109-normal-20260518034520`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab109-atomic-20260518034520`
- Resultado:
  - NORMAL foi funcional nos gates focados, mas perdeu como baseline operacional
    por `max_timeout`.
  - ATOMIC foi aceito: lane `completed`, focused Jest `13/13`, focused ESLint
    `0`, touched Kloel typecheck errors `0`, `atomicModeClean=true`, native
    file tool violations `0` e traces `45`.
- Vitorias NORMAL:
  - Router helper line count isolado `279` contra ATOMIC `282`.
- Vitorias ATOMIC:
  - Completion contra `max_timeout`.
  - Eventos `3` contra `132`; primeira acao `7.631s` contra `26.998s`;
    agent time `249.532s` contra `900.843s`.
  - Comandos `1` contra `16`; failed commands `0` contra `3`.
  - Input/output/reasoning `71.264/103/192` contra `76.291/12.884/9.151`.
  - Native file tool violations `0` contra `23`; traces `45` contra `0`.
  - Service/total/churn `481/796/639` contra `510/822/691`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota atomica dominante neste tier; unica perda foi router helper
    lines isolado.
  - NORMAL continuou sem convergir dentro do budget.
- Ferramentas/politica atualizadas:
  - Politica Round 109: runtime helper target header minimo; `ToolArgs` banido
    no helper runtime enquanto nao for usado por funcao real.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-109/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-109/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-109/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-109/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-109.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-109.md`.
- Nivel de prova: N3/N4 local para vitoria atomica neste tier; N5 pendente de
  repeticao posterior porque Round 108 no mesmo tier foi rejeitado.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 110.
  - Escalar apenas se ATOMIC mantiver gates verdes, `atomicModeClean=true`,
    zero perdas dominantes e vantagem ampla de tempo/comandos/tokens/churn.

## ORCH-ATOMIC-AB-BENCH-110

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir Round 109 com runtime target header minimo e check explicito
  contra `ToolArgs` no runtime helper, antes de escalar.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab110-normal-20260518041225`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab110-atomic-20260518041225`
- Resultado:
  - NORMAL foi funcional nos gates focados, mas perdeu como baseline operacional
    por `max_timeout`.
  - ATOMIC foi aceito: lane `completed`, focused Jest `13/13`, focused ESLint
    `0`, touched Kloel typecheck errors `0`, `atomicModeClean=true`, native
    file tool violations `0` e traces `45`.
- Vitorias NORMAL:
  - Router helper line count isolado `275` contra ATOMIC `282`.
- Vitorias ATOMIC:
  - Completion contra `max_timeout`.
  - Eventos `3` contra `120`; primeira acao `5.863s` contra `27.376s`;
    agent time `239.712s` contra `900.922s`.
  - Comandos `1` contra `16`; failed commands `0` contra `4`.
  - Input/output/reasoning `71.225/231/115` contra `79.187/12.764/9.235`.
  - Native file tool violations `0` contra `27`; traces `45` contra `0`.
  - Service/total/churn `481/796/639` contra `511/819/666`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota atomica dominante neste tier; unica perda foi router helper
    lines isolado.
  - NORMAL continuou sem convergir dentro do budget.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca necessaria; Round 110 confirma que a politica Round 109 e
    estavel neste tier.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-110/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-110/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-110/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-110/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-110.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-110.md`.
- Nivel de prova: N5 local para estabilidade deste tier, porque a vitoria
  atomica do Round 109 foi confirmada por reexecucao posterior no Round 110 com
  validacao externa focada.
- Criterio de revalidacao:
  - Round 111 deve escalar um degrau controlado mantendo 2 workers, worktrees
    persistentes e gates focados.
  - Se ATOMIC perder qualquer gate funcional, nao escalar de novo; formalizar a
    derrota e atualizar operador/politica.

## ORCH-ATOMIC-AB-BENCH-111

- Status: validated_repeat_before_scale
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau para split de tres helpers do cluster
  router/runtime/parser de `UnifiedAgentService`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab111-normal-20260518043230`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab111-atomic-20260518043230`
- Resultado:
  - NORMAL foi funcional nos gates focados, mas perdeu como baseline operacional
    por `max_timeout`.
  - ATOMIC foi aceito: lane `completed`, focused Jest `13/13`, focused ESLint
    `0`, touched Kloel typecheck errors `0`, `atomicModeClean=true`, native
    file tool violations `0` e traces `46`.
- Vitorias NORMAL:
  - Router helper line count isolado `233` contra ATOMIC `236`.
  - Parser helper line count isolado `44` contra ATOMIC `49`.
- Vitorias ATOMIC:
  - Completion contra `max_timeout`.
  - Eventos `3` contra `147`; primeira acao `6.388s` contra `29.325s`;
    agent time `226.060s` contra `900.883s`.
  - Comandos `1` contra `14`; failed commands `0` contra `3`.
  - Input/output/reasoning `72.062/225/165` contra `92.376/14.679/9.633`.
  - Native file tool violations `0` contra `37`; traces `46` contra `0`.
  - Service/total/churn `483/801/644` contra `503/813/660`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota atomica dominante neste tier; perdas isoladas em helper
    line count nao venceram o total product line count.
  - NORMAL continuou sem convergir dentro do budget.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca necessaria; Round 111 provou que a macro-transacao comporta
    o terceiro helper. Observacao: `atomic_apply_eslint_dry_run_fixes` reportou
    residuos de analisador, mas a validacao externa de focused ESLint ficou
    verde.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-111/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-111/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-111/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-111/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-111.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-111.md`.
- Nivel de prova: N3/N4 local para vitoria atomica no novo tier; N5 pendente de
  repeticao posterior.
- Criterio de revalidacao:
  - Repetir a mesma tarefa no Round 112.
  - Escalar apenas se ATOMIC mantiver gates verdes, `atomicModeClean=true`,
    zero perdas dominantes e vantagem ampla de tempo/comandos/tokens/churn.

## ORCH-ATOMIC-AB-BENCH-112

- Status: validated_scale_next
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de tres helpers do cluster router/runtime/parser de
  `UnifiedAgentService` antes de escalar.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab112-normal-20260518045950`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab112-atomic-20260518045950`
- Resultado:
  - NORMAL foi funcional nos gates focados e completou a lane, mas perdeu como
    baseline operacional por custo/superficie.
  - ATOMIC foi aceito: lane `completed`, focused Jest `13/13`, focused ESLint
    `0`, touched Kloel typecheck errors `0`, `atomicModeClean=true`, native
    file tool violations `0` e traces `46`.
- Vitorias NORMAL:
  - Router helper line count isolado `230` contra ATOMIC `236`.
  - Parser helper line count isolado `46` contra ATOMIC `49`.
  - Completion recuperada em relacao ao Round 111.
- Vitorias ATOMIC:
  - Eventos `3` contra `146`; primeira acao `5.303s` contra `20.252s`;
    agent time `221.295s` contra `812.309s`.
  - Comandos `1` contra `17`; failed commands `0` contra `3`.
  - Input/output/reasoning `72.080/158/239` contra `86.149/14.913/6.418`.
  - Native file tool violations `0` contra `31`; traces `46` contra `0`.
  - Service/total/churn `483/801/644` contra `503/812/659`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota atomica dominante neste tier; perdas isoladas em helper
    line count nao venceram o total product line count.
  - Typecheck global continua vermelho somente por ruido Google Ads/Prisma fora
    de `src/kloel/**`; touched Kloel typecheck errors `0/0`.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca necessaria para este tier. A repeticao provou que a politica
    Round 111 e estavel quando NORMAL tambem conclui.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-112/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-112/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-112/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-112/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-112.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-112.md`.
- Nivel de prova: N5 local para o tier de tres helpers, porque a vitoria
  atomica do Round 111 foi confirmada por reexecucao posterior no Round 112
  com validacao externa focada.
- Criterio de revalidacao:
  - Round 113 deve escalar exatamente um degrau controlado mantendo 2 workers,
    worktrees persistentes e os mesmos gates externos.
  - Se ATOMIC perder qualquer gate funcional ou metrica dominante, nao escalar
    de novo; formalizar derrota e atualizar operador/politica.

## ORCH-ATOMIC-AB-BENCH-113

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau para split de quatro helpers do cluster
  router/runtime/parser/cognitive-state de `UnifiedAgentService`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab113-normal-20260518052449`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab113-atomic-20260518052449`
- Resultado:
  - NORMAL ficou em `idle_timeout` e nao entregou o split; focused Jest passou
    por baseline, mas focused ESLint e scans de aceite falharam.
  - ATOMIC foi aceito como funcional: lane `completed`, focused Jest `13/13`,
    focused ESLint `0`, touched Kloel typecheck errors `0`,
    `atomicModeClean=true`, native file tool violations `0` e traces `50`.
- Vitorias NORMAL:
  - Input tokens `78.187` contra ATOMIC `78.892`, enquanto incompleto.
  - Reasoning tokens `337` contra ATOMIC `456`, enquanto incompleto.
- Vitorias ATOMIC:
  - Completion contra `idle_timeout`.
  - Primeira acao `4.925s` contra `20.170s`; agent time `243.290s` contra
    `256.249s`.
  - Eventos `3` contra `25`; comandos `1` contra `2`.
  - Output tokens `56` contra `1.005`.
  - Native file tool violations `0` contra `13`; traces `50` contra `0`.
  - Service lines `456` contra `737`.
  - Focused ESLint e structural scans verdes contra falhas do NORMAL.
- Derrotas/falhas formalizadas:
  - A rodada nao e comparacao de shape completa porque NORMAL nao concluiu.
  - ATOMIC ainda carregou uma import surface redundante na macro antes da
    limpeza; isso virou atualizacao de operador.
- Ferramentas/politica atualizadas:
  - `extract_class_methods_to_file` em
    `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` agora aceita
    `sourceImportNames`, `serviceImportNames` e `callsiteImportNames`.
  - `fileHasNamedImport` aceita lista vazia de imports como estado idempotente
    valido.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-113/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-113/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-113/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-113/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-113.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-113.md`.
- Nivel de prova: N3/N4 local para funcionalidade atomica no tier de quatro
  helpers; N5 pendente de repeticao posterior com baseline NORMAL completo ou
  nova evidencia equivalente.
- Criterio de revalidacao:
  - Round 114 deve repetir exatamente a mesma tarefa com o operador atualizado.
  - Nao escalar enquanto `shapeComparisonEligible=false` ou enquanto NORMAL nao
    produzir baseline funcional comparavel.

## ORCH-ATOMIC-AB-BENCH-114

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de quatro helpers do cluster
  router/runtime/parser/cognitive-state de `UnifiedAgentService`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab114-normal-20260518053909`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab114-atomic-20260518053909`
- Resultado:
  - NORMAL ficou em `max_timeout`; focused Jest passou, structural scans
    passaram, touched Kloel typecheck errors `0`, mas focused ESLint falhou com
    9 erros.
  - ATOMIC foi aceito como funcional: lane `completed`, focused Jest `13/13`,
    focused ESLint `0`, touched Kloel typecheck errors `0`,
    `atomicModeClean=true`, native file tool violations `0` e traces `45`.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita; empatou comandos `1/1` e failed commands `0/0`,
    mas enquanto incompleto e com lint vermelho.
- Vitorias ATOMIC:
  - Completion contra `max_timeout`.
  - Primeira acao `6.677s` contra `29.126s`; agent time `246.177s` contra
    `900.884s`.
  - Eventos `3` contra `104`.
  - Input/output/reasoning `73.680/160/108` contra `75.095/13.365/10.516`.
  - Native file tool violations `0` contra `28`; traces `45` contra `0`.
  - Service/total/churn `456/831/740` contra `479/845/754`.
- Derrotas/falhas formalizadas:
  - A rodada ainda nao e comparacao de shape completa porque NORMAL nao concluiu
    e deixou focused ESLint vermelho.
  - ATOMIC nao precisa de patch corretivo desta rodada; o operador de import
    surface atualizado no Round 113 funcionou.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca necessaria neste delta.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-114/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-114/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-114/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-114/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-114.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-114.md`.
- Nivel de prova: N3/N4 local para funcionalidade atomica no tier de quatro
  helpers; N5 pendente de baseline NORMAL completo ou nova evidencia
  equivalente.
- Criterio de revalidacao:
  - Round 115 deve repetir a mesma complexidade ou ajustar apenas budget/prompt
    do harness para obter baseline NORMAL completo.
  - Nao escalar enquanto `shapeComparisonEligible=false`.

## ORCH-ATOMIC-AB-BENCH-115

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de quatro helpers do cluster
  router/runtime/parser/cognitive-state de `UnifiedAgentService` com baseline
  NORMAL completo.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab115-normal-20260518060703`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab115-atomic-20260518060703`
- Resultado:
  - NORMAL completou e passou gates focados: focused Jest `13/13`, focused
    ESLint `0`, touched Kloel typecheck errors `0`, protected diff vazio e
    scans estruturais limpos.
  - ATOMIC completou e passou gates focados: preprompt exit `0`,
    `atomicModeClean=true`, focused Jest `13/13`, focused ESLint `0`, touched
    Kloel typecheck errors `0`, protected diff vazio, native file tool
    violations `0` e traces `45`.
- Vitorias NORMAL:
  - Total touched Kloel lines `817` contra ATOMIC `831`.
  - Source churn `730` contra ATOMIC `740`.
- Vitorias ATOMIC:
  - Primeira acao `5.376s` contra `19.564s`; agent time `215.375s` contra
    `1,130.540s`.
  - Eventos `3` contra `171`; comandos `1` contra `22`; failed commands `0`
    contra `4`.
  - Input/output/reasoning `73.695/168/1.188` contra `81.226/16.947/11.380`.
  - Native file tool violations `0`; traces `45` contra `0`.
  - Service lines `456` contra `460`.
- Derrotas/falhas formalizadas:
  - ATOMIC perdeu shape agregado apesar de vencer a facade. Isso bloqueia
    escala de complexidade ate nova repeticao com orcamento de linhas/churn.
- Ferramentas/politica atualizadas:
  - `atomic-call.cjs` agora suporta `lineBudgetChecks` e
    `sourceChurnBudgetChecks` em `runKloelUnifiedAgentValidation`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-115/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-115/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-115/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-115/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-115.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-115.md`.
- Nivel de prova: N4 local comparavel para o tier de quatro helpers porque os
  dois lanes completaram e passaram os mesmos gates focados; N5 pendente de
  repeticao posterior com shape sem derrota atomica.
- Criterio de revalidacao:
  - Round 116 deve repetir a mesma complexidade com shape budget checks ativos.
  - Nao escalar enquanto ATOMIC perder qualquer metrica dominante ou shape
    agregado para NORMAL.

## ORCH-ATOMIC-AB-BENCH-116

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de quatro helpers com shape budget derivado do
  NORMAL Round 115.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab116-normal-20260518063955`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab116-atomic-20260518063955`
- Resultado:
  - NORMAL ficou em `idle_timeout` sem mutacao alvo.
  - ATOMIC completou a macro-mutacao em modo atomic-only, mas falhou o budget
    final de shape.
- Vitorias NORMAL:
  - Nenhuma aceita neste round; o baseline valido continua sendo o Round 115.
- Vitorias ATOMIC:
  - Macro funcional antes do budget; focused Jest/diff/protected/suppression e
    scans estruturais internos passaram.
  - Traceability `46`; native file tool violations `0` no watchdog.
- Derrotas/falhas formalizadas:
  - Total touched Kloel lines `823` contra budget `817`.
  - Source churn `732` contra budget `730`.
  - Preprompt exit `1`.
- Ferramentas/politica atualizadas:
  - Budget gate validado como mecanismo de recusa; proximo delta deve reduzir
    templates de parser/cognitive helper, nao relaxar budget.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-116/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-116/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-116/opencode-atomic-preprompt-output.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-116.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-116.md`.
- Nivel de prova: rejeitado; N/A para escalada.
- Criterio de revalidacao:
  - Round 117 deve repetir a mesma complexidade com o mesmo budget `817/730`.
  - Escala continua bloqueada.

## ORCH-ATOMIC-AB-BENCH-117

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier de quatro helpers com parser/cognitive compactos e
  budget `817/730`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab117-normal-20260518064807`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab117-atomic-20260518064807`
- Resultado:
  - NORMAL ficou em `idle_timeout` sem mutacao alvo.
  - ATOMIC completou, passou gates externos focados e passou shape budget.
- Vitorias NORMAL:
  - Nenhuma aceita neste round porque nao houve mutacao.
- Vitorias ATOMIC:
  - Preprompt exit `0`, `atomicModeClean=true`, traces `46`.
  - Focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors
    `0`, protected diff vazio e scans estruturais verdes.
  - Total touched Kloel lines `809` contra budget `817`.
  - Source churn `718` contra budget `730`.
- Derrotas/falhas formalizadas:
  - A rodada nao e comparavel contra NORMAL atual porque NORMAL ficou em
    `idle_timeout`.
- Ferramentas/politica atualizadas:
  - Parser/cognitive helper templates compactados no Round 117.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-117/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-117/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-117/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-117/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-117.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-117.md`.
- Nivel de prova: N4 local para recuperacao atomica de shape contra o baseline
  Round 115; N5/comparacao atual pendente.
- Criterio de revalidacao:
  - Round 118 deve obter NORMAL baseline atual com prompt mais curto/idle maior.
  - Nao escalar enquanto `shapeComparisonEligible=false`.

## ORCH-ATOMIC-AB-BENCH-118

- Status: validated_scale_next_controlled
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier quatro helpers com NORMAL baseline atual e budget
  atomico recuperado.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab118-normal-20260518070102`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab118-atomic-20260518070102`
- Resultado:
  - NORMAL completou e passou gates focados: focused Jest `13/13`, focused
    ESLint `0`, touched Kloel typecheck errors `0`, diff-check,
    protected/suppression/helper/private/public scans verdes.
  - ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, native file
    tool violations `0`, traces `46`, e passou os mesmos gates focados.
- Vitorias NORMAL:
  - Nenhuma metrica material. A contribuicao do NORMAL foi fornecer baseline
    funcional completo para comparacao.
- Vitorias ATOMIC:
  - Primeira acao `5.054s` vs `17.856s`.
  - Agent time `202.582s` vs `1,019.334s`.
  - Eventos `3` vs `154`.
  - Comandos `1` vs `9`.
  - Failed commands `0` vs `3`.
  - Input/output/reasoning `75.220/106/245` vs `98.317/15.017/11.616`.
  - Service lines `456` vs `468`.
  - Total Kloel lines `809` vs `825`.
  - Source churn `718` vs `746`.
  - Traceabilidade `46` vs `0`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota material do ATOMIC nesta rodada.
  - Global backend typecheck continua vermelho fora do escopo por ruido
    compartilhado nao-Kloel; touched Kloel typecheck errors `0` nos dois lanes.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca de ferramenta necessaria; Round 118 validou as
    compactacoes do Round 117 contra baseline NORMAL completo.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-118/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-118/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-118/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-118/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-118.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-118.md`.
- Nivel de prova: N4 local comparavel para o tier quatro helpers, com
  worktrees isolados, ambos lanes completos, gates focados reproduzidos e
  auditoria externa persistida.
- Criterio de revalidacao:
  - Round 119 deve escalar exatamente um degrau de complexidade.
  - Se ATOMIC perder qualquer metrica material ou funcionalidade, nao escalar de
    novo; formalizar a derrota e atualizar politica/operador antes de repetir.

## ORCH-ATOMIC-AB-BENCH-119

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: escalar um degrau controlado para cinco helpers, adicionando
  extracao de `processIncomingMessage` em
  `unified-agent-incoming-message.helpers.ts`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab119-normal-20260518073232`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab119-atomic-20260518073232`
- Resultado:
  - NORMAL completou e passou gates focados: focused Jest `13/13`, focused
    ESLint `0`, touched Kloel typecheck errors `0`, diff-check,
    protected/suppression/helper/private/public/incoming scans verdes.
  - ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, native file
    tool violations `0`, traces `50`, e passou os mesmos gates focados.
- Vitorias NORMAL:
  - Input tokens `79.907` vs `81.993`.
  - Total touched Kloel lines `846` vs `849`.
- Vitorias ATOMIC:
  - Primeira acao `5.464s` vs `20.809s`.
  - Agent time `270.386s` vs `974.649s`.
  - Eventos `3` vs `100`.
  - Comandos `1` vs `12`.
  - Failed commands `0` vs `3`.
  - Output/reasoning `151/766` vs `13.142/14.019`.
  - Service lines `438` vs `445`.
  - Source churn `798` vs `799`.
  - Traceabilidade `50` vs `0`.
- Derrotas/falhas formalizadas:
  - ATOMIC nao fechou zero-loss no tier cinco helpers: perdeu input tokens por
    2.086 e total touched Kloel lines por 3.
  - Global backend typecheck continua vermelho fora do escopo por ruido
    compartilhado nao-Kloel; touched Kloel typecheck errors `0` nos dois lanes.
- Ferramentas/politica atualizadas:
  - Nenhuma mudanca de ferramenta principal aplicada ainda; proximo delta deve
    compactar template incoming-helper e preprompt/input policy.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-119/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-119/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-119/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-119/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-119.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-119.md`.
- Nivel de prova: N4 local comparavel para o tier cinco helpers, com worktrees
  isolados, ambos lanes completos, gates focados reproduzidos e auditoria
  externa persistida.
- Criterio de revalidacao:
  - Round 120 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC fechar tambem input tokens e total touched Kloel
    lines, mantendo gates focados, `atomicModeClean=true` e trace isolation.

## ORCH-ATOMIC-AB-BENCH-120

- Status: validated_scale_next_controlled
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier cinco helpers com incoming-helper compacto e prompt
  atomico minificado para fechar as derrotas residuais do Round 119.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab120-normal-20260518080021`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab120-atomic-20260518080021`
- Resultado:
  - NORMAL completou e passou gates focados: focused Jest `13/13`, focused
    ESLint `0`, touched Kloel typecheck errors `0`, diff-check,
    protected/suppression/helper/private/public/incoming scans verdes.
  - ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, native file
    tool violations `0`, traces `49`, e passou os mesmos gates focados.
- Vitorias NORMAL:
  - Nenhuma metrica material. A contribuicao do NORMAL foi fornecer baseline
    funcional completo para comparacao.
- Vitorias ATOMIC:
  - Primeira acao `4.661s` vs `20.135s`.
  - Agent time `238.694s` vs `1,006.407s`.
  - Eventos `3` vs `125`.
  - Comandos `1` vs `13`.
  - Failed commands `0` vs `4`.
  - Input/output/reasoning `80.154/142/391` vs `82.678/14.699/9.557`.
  - Service lines `438` vs `464`.
  - Total Kloel lines `844` vs `871`.
  - Source churn `793` vs `820`.
  - Traceabilidade `49` vs `0`.
- Derrotas/falhas formalizadas:
  - Nenhuma derrota material do ATOMIC nesta rodada.
  - Global backend typecheck continua vermelho fora do escopo por ruido
    compartilhado nao-Kloel; touched Kloel typecheck errors `0` nos dois lanes.
- Ferramentas/politica atualizadas:
  - Prompt ATOMIC minificado: `opencode-atomic-prompt.md` caiu de 5.845 bytes
    para 603 bytes.
  - Macro grande movido para `atomic-fastpath.sh`.
  - Incoming-helper template compacto validado com total line budget `844/846`
    e source churn `793/798`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-120/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-120/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-120/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-120/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-120.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-120.md`.
- Nivel de prova: N4 local comparavel para o tier cinco helpers, com worktrees
  isolados, ambos lanes completos, gates focados reproduzidos e auditoria
  externa persistida.
- Criterio de revalidacao:
  - Round 121 deve escalar exatamente um degrau de complexidade.
  - Se ATOMIC perder qualquer metrica material ou funcionalidade, nao escalar de
    novo; formalizar a derrota e atualizar politica/operador antes de repetir.

## ORCH-ATOMIC-AB-BENCH-127

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers apos a falha de validacao intermediaria
  do Round 126.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab127-normal-20260518081855`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab127-atomic-20260518081855`
- Resultado:
  - NORMAL aceito: focused Jest `13/13`, focused ESLint `0`, backend typecheck
    `0`, diff-check `0`, protected/suppression/helper/service scans verdes.
  - ATOMIC rejeitado: gates funcionais externos verdes, mas residue scan final
    encontrou `toolRouterDeps` em `unified-agent.service.ts`.
- Vitorias NORMAL:
  - Contrato funcional completo.
  - Residue discipline final.
- Vitorias ATOMIC:
  - Eventos `3` vs `136`.
  - Primeira acao `3.289s` vs `19.130s`.
  - Agent time `243.898s` vs `1,286.559s`.
  - Comandos `1` vs `11`.
  - Failed commands `1` vs `6`.
  - Service lines `383` vs `403`.
  - Traceabilidade `63` vs `0`.
- Derrotas/falhas formalizadas:
  - `toolRouterDeps` cacheado no service viola a politica de dependencia
    inline/dinamica e o gate final do Round 127.
- Ferramentas/politica atualizadas:
  - `atomic-call.cjs` agora suporta placeholder `{{dependencyInlineObject}}`
    e `dependencyContainer.style=inlineObject`.
  - Round 128 converte `toolRouterDeps` para `executeToolActionDeps` inline e
    remove propriedade/import/assignment antes da validacao final.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-127/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-127/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-127/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-127/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-127.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-127.md`.
- Nivel de prova: N4 local comparavel para o tier sete helpers, com worktrees
  isolados, ambos lanes completos, gates focados reproduzidos e auditoria
  externa persistida.
- Criterio de revalidacao:
  - Round 128 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC passar tambem o residue scan final contra baseline
    NORMAL completo.

## ORCH-ATOMIC-AB-BENCH-128

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com dependencia inline
  `executeToolActionDeps` e remocao final de `toolRouterDeps`.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab128-normal-20260518114443`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab128-atomic-20260518114443`
- Resultado:
  - NORMAL aceito como baseline funcional apesar de lane `max_timeout`:
    focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
    diff-check `0`, protected/suppression/helper/service/runtime scans verdes.
  - ATOMIC rejeitado: preprompt exit `1`, focused Jest falhou `2/13`, focused
    ESLint falhou, backend typecheck falhou com dois erros Kloel e residue scan
    final encontrou `toolRouterDeps`.
- Vitorias NORMAL:
  - Contrato funcional completo.
  - Residue discipline final.
- Vitorias ATOMIC:
  - Eventos `3` vs `213`.
  - Primeira acao `2.900s` vs `18.289s`.
  - Agent time `203.469s` vs `1,501.568s`.
  - Comandos `1` vs `15`.
  - Failed commands `1` vs `5`.
  - Input/output/reasoning `62.829/197/292` vs `89.772/20.179/19.138`.
  - Total Kloel lines `944` vs `994`.
  - Source churn `1.047` vs `1.469`.
  - Traceabilidade `62` vs `0`.
- Derrotas/falhas formalizadas:
  - Wrapper repassava `expectedCount: 2` cru para MCP `atomic_replace_text`, que
    recusou o bloco ambiguo e deixou estado parcial.
- Ferramentas/politica atualizadas:
  - `atomic-call.cjs` agora expande `expectedCount > 1` em substituicoes
    atomicas sequenciais por `occurrence: 1`, com contagem observada verificada.
  - `round-audit.cjs` agora parseia logs externos com colchetes e status
    `[... exit=N]`.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-128/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-128/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-128/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-128/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-128.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-128.md`.
- Nivel de prova: N4 local comparavel para o tier sete helpers, com worktrees
  isolados, logs OpenCode, gates externos e auditoria persistida.
- Criterio de revalidacao:
  - Round 129 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC passar o contrato funcional contra baseline NORMAL
    completo.

## ORCH-ATOMIC-AB-BENCH-129

- Status: validated_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com `expectedCount > 1` reparado.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab129-normal-20260518092529`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab129-atomic-20260518092529`
- Resultado:
  - Ambos lanes completaram e passaram focused Jest, focused ESLint, backend
    typecheck, diff-check e scans de residue/suppression/helper/protected.
  - ATOMIC venceu a maioria das metricas operacionais e de custo.
- Vitorias NORMAL:
  - Service facade compactness: `281` linhas vs ATOMIC `396`.
- Vitorias ATOMIC:
  - Eventos `3` vs `165`.
  - Primeira acao `6.046s` vs `20.886s`.
  - Agent time `313.097s` vs `1,394.568s`.
  - Comandos `1` vs `17`.
  - Failed commands `0` vs `5`.
  - Input/output/reasoning `64.591/119/240` vs `77.487/22.435/15.246`.
  - Total Kloel lines `964` vs `1.099`.
  - Source churn `1.069` vs `1.382`.
  - Traceabilidade `70` vs `0`.
- Derrotas/falhas formalizadas:
  - Incoming-helper atomico raso; faltou macro-atomicidade para mover o
    `processMessage` inteiro para helper e compactar a facade.
- Ferramentas/politica atualizadas:
  - Proxima politica deve adicionar compactacao de facade/process-message antes
    de escalar complexidade.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-129/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-129/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-129/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-129/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-129.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-129.md`.
- Nivel de prova: N4 local comparavel para o tier sete helpers.
- Criterio de revalidacao:
  - Round 130 deve repetir a mesma complexidade.
  - Escala continua bloqueada ate ATOMIC vencer/empatar service facade lines
    mantendo todos os outros ganhos e gates verdes.

## ORCH-ATOMIC-AB-BENCH-130

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com compactacao macro da facade e
  mover `processMessage` para helper de incoming message.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab130-normal-20260518100157`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab130-atomic-20260518100157`
- Resultado:
  - NORMAL aceito: lane completed, focused Jest `0`, focused ESLint `0`,
    backend typecheck `0`, diff-check `0`, scans finais verdes e service
    compactado para `184` linhas.
  - ATOMIC rejeitado: preprompt exit `1`, focused Jest `1`, focused ESLint
    `1`, backend typecheck `2`; falhou em macro replacement com
    `expected 1 occurrence(s), observed 0`.
- Vitorias NORMAL:
  - Contrato funcional completo.
  - Service facade compactness: `184` linhas vs ATOMIC `396`.
- Vitorias ATOMIC:
  - `atomicModeClean=true`.
  - Total Kloel lines `968` vs NORMAL `1.045`.
  - Source churn `1.073` vs NORMAL `1.534`.
- Derrotas/falhas formalizadas:
  - Macro compactacao atomica dependia de `oldText` de snapshot antigo e nao
    do estado atual do worktree.
- Ferramentas/politica atualizadas:
  - `atomic-call.cjs` ganhou `replace_file_with_current_anchor`.
  - Round 131 troca os facade replacements para current-anchor e usa o shape
    NORMAL Round 130 como baseline-alvo.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-130/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-130/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-130/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-130/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-130.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-130.md`.
- Nivel de prova: N4 local comparavel para o baseline NORMAL; N3 tooling
  failure para ATOMIC, suficiente para atualizar operador e repetir.
- Criterio de revalidacao:
  - Round 131 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC passar o contrato funcional e vencer/empatar service
    facade lines contra o baseline compacto.

## ORCH-ATOMIC-AB-BENCH-131

- Status: rejected_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com `replace_file_with_current_anchor`
  e final facade compaction.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab131-normal-20260518101359`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab131-atomic-20260518101359`
- Resultado:
  - Ambos lanes completaram e passaram focused Jest `13/13`, focused ESLint
    `0`, backend typecheck `0`, diff-check `0`, protected diff vazio e
    suppression scan limpo.
  - Ambos foram rejeitados pelo contrato final da rodada: NORMAL por manter
    orquestracao direta no service; ATOMIC por checagem literal `callee({`
    apesar de a chamada existir com formatting `callee(`.
- Vitorias NORMAL:
  - Total Kloel lines `1006` vs ATOMIC `1045`.
  - Source churn `1101` vs ATOMIC `1534`.
- Vitorias ATOMIC:
  - Agent time `308.517s` vs `1341.192s`.
  - Primeira acao `4.578s` vs `19.386s`.
  - Eventos `13` vs `185`.
  - Comandos `1` vs `14`.
  - Failed commands `1` vs `5`.
  - Input/output/reasoning `54086/738/506` vs `90137/20935/12904`.
  - Service facade `184` vs `416`.
  - Traceabilidade `76` vs `0`.
- Derrotas/falhas formalizadas:
  - Gate final rigido demais: texto literal `callee({` em vez de topologia de
    chamada.
  - ATOMIC pos-falha usou `grep`/`glob`/`read` nativos, gerando
    `atomicModeClean=false`.
- Ferramentas/politica atualizadas:
  - `atomic-call.cjs` ganhou `requiredRegexChecks`.
  - Round 132 usa regex topologico para os callees de tool-call e predecided.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-131/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-131/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-131/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-131/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-131.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-131.md`.
- Nivel de prova: N4 local comparavel para gates de build/teste e metricas;
  round rejeitado como estado final por contrato formal.
- Criterio de revalidacao:
  - Round 132 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC passar contrato topologico, manter
    `atomicModeClean=true` e nao perder metricas materiais.

## ORCH-ATOMIC-AB-BENCH-132

- Status: accepted_functional_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com final topology-aware e provar que
  o ATOMIC passa o contrato funcional sem leituras nativas pos-falha.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab132-normal-20260518110954`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab132-atomic-20260518110954`
- Resultado:
  - NORMAL completou e passou Jest/ESLint/typecheck/diff/scans, mas foi
    rejeitado pelo contrato final: incoming helper raso sem LLM completion,
    runtime turn recording, tool-call processing e predecided processing.
  - ATOMIC completou, `atomicModeClean=true`, passou final topology-aware e foi
    aceito como vencedor funcional da rodada.
- Vitorias NORMAL:
  - Input tokens `73577` vs ATOMIC `145910`.
  - Total Kloel lines `961` vs ATOMIC `1045` e source churn `1072` vs `1534`,
    registrados como pressao de shape, nao como vitoria funcional aceita.
- Vitorias ATOMIC:
  - Contrato funcional final (`service_residue_status=1` vs NORMAL `0`).
  - Agent time `286.691s` vs `1261.358s`.
  - Primeira acao `4.869s` vs `19.244s`.
  - Eventos `3` vs `95`.
  - Comandos `1` vs `11`.
  - Failed commands `0` vs `5`.
  - Output/reasoning tokens `315/50` vs `13999/20567`.
  - Service facade `184` vs `409`.
  - Traceabilidade `76` vs `0`.
- Derrotas/falhas formalizadas:
  - Preprompt success output do ATOMIC ainda vazava linhas JSON enormes de
    `atomicDiff` para o contexto do OpenCode, criando input-token overhead.
- Ferramentas/politica atualizadas:
  - `opencode-round-watchdog.cjs` compacta stdout de sucesso do preprompt:
    exit, bytes, validation passed, trace count e resumo constante; log
    completo segue persistido no round dir.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-132/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-132/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-132/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-132/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-132.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-132.md`.
- Nivel de prova: N4 local para vitoria funcional atomica e para a derrota de
  input-token overhead; a correcao do watchdog tem N3 sintatico ate nova
  rodada provar efeito.
- Criterio de revalidacao:
  - Round 133 deve repetir exatamente a mesma complexidade.
  - So escalar apos ATOMIC manter contrato final e `atomicModeClean=true`,
    remover a perda de input tokens e nao perder metricas materiais aceitas.

## ORCH-ATOMIC-AB-BENCH-133

- Status: accepted_functional_repeat_same_complexity
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers apos compactacao do stdout de sucesso
  do preprompt atomico e confirmar se a derrota de input tokens foi removida.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab133-normal-20260518114512`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab133-atomic-20260518114512`
- Resultado:
  - NORMAL completou e passou Jest/ESLint/typecheck/diff/scans, mas foi
    rejeitado pelo contrato final: `final_validation_status=1`.
  - ATOMIC completou, `atomicModeClean=true`, passou o contrato final:
    `final_validation_status=0`.
- Vitorias NORMAL:
  - Nenhuma vitoria aceita no scorecard funcional corrigido. As linhas/churn
    brutas menores nao sao elegiveis porque NORMAL falhou o contrato final.
- Vitorias ATOMIC:
  - Contrato funcional final.
  - Agent time `270.649s` vs `1253.180s`.
  - Primeira acao `3.881s` vs `18.453s`.
  - Eventos `3` vs `153`.
  - Comandos `1` vs `13`.
  - Failed commands `0` vs `3`.
  - Input/output/reasoning `52006/132/115` vs `83761/17705/17423`.
  - Service facade `184` vs `304`.
  - Traceabilidade `76` vs `0`.
- Derrotas/falhas formalizadas:
  - O auditor de benchmark nao incorporava `final_validation_status` na
    funcao `validationPass`, produzindo scorecard falso-positivo para NORMAL.
- Ferramentas/politica atualizadas:
  - `round-audit.cjs` passou a parsear e aplicar `finalValidationStatus` no
    aceite funcional.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-133/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-133/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-133/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-133/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-133.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-133.md`.
- Nivel de prova: N4 local para vitoria funcional atomica e para o efeito da
  compactacao de preprompt sobre input tokens; auditor corrigido validado por
  `node --check` e regeneracao do audit.
- Criterio de revalidacao:
  - Round 134 deve repetir exatamente a mesma complexidade com auditor
    corrigido.
  - So escalar apos ATOMIC manter contrato final, `atomicModeClean=true` e
    vitoria material estavel.

## ORCH-ATOMIC-AB-BENCH-134

- Status: rejected_typecheck_baseline_blocks_clean_repeat
- Modo: VALIDACAO / DELEGACAO / ATOMIC_TOOLING
- Objetivo: repetir o tier sete helpers com auditor final-validation-aware.
- Workspaces:
  - NORMAL: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab134-normal-20260518121336`
  - ATOMIC: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab134-atomic-20260518121336`
- Resultado:
  - NORMAL completou, mas falhou o contrato final: `final_validation_status=1`.
  - ATOMIC completou e manteve disciplina atomica, mas tambem teve
    `final_validation_status=1` por backend typecheck vermelho no worktree.
- Vitorias ATOMIC:
  - Agent time `218.135s` vs `1200.236s`.
  - Primeira acao `2.942s` vs `15.385s`.
  - Eventos `3` vs `150`.
  - Comandos `1` vs `6`.
  - Failed commands `0` vs `3`.
  - Input/output/reasoning `52011/84/43` vs `84694/16733/15052`.
  - Traceabilidade `76` vs `0`.
  - `atomicModeClean=true`.
- Falhas formalizadas:
  - NORMAL continuou incompleto no contrato topologico.
  - ATOMIC foi bloqueado por baseline de backend typecheck fora dos arquivos
    tocados pela tarefa: Google Ads credential input e lineage Prisma client.
- Evidencia:
  - `docs/ai/atomic-os-benchmark/round-134/audit.json`.
  - `docs/ai/atomic-os-benchmark/round-134/verdict.md`.
  - `docs/ai/atomic-os-benchmark/round-134/normal-external-validation.log`.
  - `docs/ai/atomic-os-benchmark/round-134/atomic-external-validation.log`.
  - Handoffs `docs/ai/mission/handoffs/AB-NORMAL-134.md` e
    `docs/ai/mission/handoffs/AB-ATOMIC-134.md`.
- Nivel de prova: N4 local para metricas operacionais; rejeitado como prova de
  escalada por final validation vermelho.
- Criterio de revalidacao:
  - Resolver/reconciliar baseline typecheck ou separar gate task-scoped de
    divida global antes de nova escalada.
