# Mission State Ledger

Atualizado: 2026-05-18 11:13 UTC

## Estado Geral

- Missao: executar continuidade idempotente ate o Kloel estar 100% pronto em producao, com escopo fechavel, evidencia classificada e sem dependencia de memoria de chat.
- Modo atual roteado: VALIDACAO / DELEGACAO / ATOMIC_OS_BENCHMARK.
- Foco operacional ativo: evoluir o Atomic OS por A/B OpenCode NORMAL vs ATOMIC ate superioridade medida; Round 126 repetiu o tier sete helpers com baseline NORMAL completo. NORMAL passou o contrato funcional; ATOMIC venceu custo/tempo/tokens/trace, mas foi rejeitado por focused ESLint rodar cedo demais em validacao intermediaria e abortar o macro em estado parcial. Proxima acao: Round 127 deve repetir a mesma complexidade com `validate_kloel_unified_agent` reparado para lint final/explicit-only em estados intermediarios.
- Patologia flagship ativa: PULSE nao aparecia integralmente na tomografia Obsidian porque `.pulse/**` estava fora do mirror.
- Mercado comercial ativo: ainda nao declarado com N4+; manter MODO COMERCIAL bloqueado ate o ledger/grafo/PULSE estarem reconciliados.
- Estado de producao global: NAO DECLARAVEL. Ha evidencias parciais, mas nao ha Global Scope Tree inteira em producao/monitorado N4+.

## Auditoria da Sessao

- OpenCode A/B delta 2026-05-18 11:13: Round 126 repetiu o tier sete
  helpers com toolchain atomica sincronizada e hard gate final de residuo.
  NORMAL completou exit `0` e passou focused Jest `13/13`, focused ESLint
  `0`, backend typecheck `0`, touched Kloel typecheck errors `0`,
  diff-check, protected/suppression/helper/private scans limpos; service/total
  lines `352/1.131` e churn `1.410`. ATOMIC completou a lane, ficou
  `atomicModeClean=true`, native file violations `0`, traces `11`, venceu
  eventos `3` vs `131`, primeira acao `3.028s` vs `16.225s`, agent time
  `63.744s` vs `1.007.770s`, comandos `1` vs `11`, failed commands `1` vs
  `3`, input/output/reasoning `52.936/176/158` vs `80.892/16.271/10.893`,
  mas foi rejeitado: focused ESLint externo saiu `1` por
  `no-unsafe-assignment` em estado parcial, o service ficou com `708` linhas,
  apenas `unified-agent-runtime.helpers.ts` foi criado e o residual scan ainda
  encontrou `validateAbiPayload`, `forEachSequential`,
  `buildPredecidedActionDraft`, `executePredecidedAgentActions` e private
  router methods no service. Derrota atomica formalizada: validacao
  intermediaria usava o rigor do gate final cedo demais. Ferramenta reparada:
  `atomic-call.cjs` agora roda focused ESLint dentro de
  `runKloelUnifiedAgentValidation` somente quando `includeEslint === true` ou
  quando o perfil final exige `enforceFinalServiceResidue`. Decisao: nao
  escalar; Round 127 repete a mesma dificuldade.
- OpenCode A/B delta 2026-05-18 10:51: Round 125 forneceu o baseline NORMAL
  completo do tier sete helpers. NORMAL completou exit `0` e passou focused
  Jest `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check,
  protected/suppression/helper/private scans limpos. ATOMIC tambem completou
  exit `0`, ficou `atomicModeClean=true`, sem native file tool violation,
  traces `63`, Jest/lint/typecheck/diff verdes, e venceu primeira acao
  `3.269s` vs `27.763s`, agent time `227.626s` vs `1.228.031s`, eventos `3`
  vs `160`, comandos `1` vs `13`, failed commands `0` vs `3`,
  input/output/reasoning `62.593/124/401` vs `81.394/18.914/15.508`,
  service/total lines `383/951` vs `441/1.075` e churn `1.054` vs `1.212`.
  Derrota atomica formalizada: `unified-agent.service.ts` ainda continha
  `toolRouterDeps` nas linhas `54`, `74`, `249`, `304`, `356`; logo
  `atomicTaskFunctionalPass=false` e `shapeComparisonEligible=false`.
  Ferramenta reparada: `atomic-call.cjs validate_kloel_unified_agent` agora
  roda focused ESLint e injeta hard checks padrao para residuos de facade do
  service (`toolRouterDeps`, `routerDeps`, `validateAbiPayload`, loops inline e
  predecided inline). Probe pos-reparo reprovou corretamente o Round 125
  ATOMIC por `toolRouterDeps`. Decisao: nao escalar; Round 126 repete a mesma
  dificuldade com validador reparado.
- OpenCode A/B delta 2026-05-18 10:16: Round 124 repetiu o tier sete helpers
  com budgets line/churn advisory. ATOMIC completou com preprompt exit `0`,
  focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors
  `0`, diff-check, protected/suppression/helper/private/public/incoming/
  tool-call/predecided scans verdes, `atomicModeClean=true`, native file tool
  violations `0` e traces `63`. NORMAL atingiu `max_timeout`; a validacao
  externa ainda passou focused Jest `13/13` e focused ESLint `0`, mas encontrou
  `1` erro de typecheck no arquivo tocado
  `unified-agent-tool-call-processing.helpers.ts`. ATOMIC venceu completion,
  primeira acao `3.850s` vs `25.049s`, agent time `228.352s` vs `1.201.138s`,
  eventos `3` vs `107`, comandos `1` vs `12`, failed commands `0` vs `6`,
  input/output/reasoning `62.598/151/281` vs `74.875/14.221/19.036`, typecheck
  tocado e traceability. Decisao: aceitar como recuperacao atomica limpa de
  politica advisory, mas nao escalar porque `shapeComparisonEligible=false` e
  NORMAL nao forneceu baseline completo. Round 125 repete a mesma dificuldade.
- OpenCode A/B delta 2026-05-18 09:55: Round 123 escalou para sete helpers
  (`unified-agent-predecided-processing.helpers.ts`). Ambos lanes completaram e
  passaram focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck
  errors `0`, diff-check, protected/suppression/helper/private/public/incoming/
  tool-call/predecided scans verdes. ATOMIC venceu eventos `3` vs `101`,
  primeira acao `2.955s` vs `13.719s`, agent time `205.358s` vs `1.158.972s`,
  comandos `1` vs `12`, failed commands `1` vs `4`, input/output/reasoning
  `53.161/158/175` vs `101.442/14.802/17.431`, service lines `383` vs `410`,
  total Kloel lines `951` vs `1007`, source churn `1054` vs `1108` e traces
  `63` vs `0`. Decisao: aceitar como vitoria funcional forte, mas nao escalar
  porque a politica atomica ainda falhou por budget absoluto hardcoded. O
  executor `atomic-call.cjs` agora suporta budget advisory; Round 124 deve
  repetir a mesma dificuldade.
- Git: branch `feat/kloel-cognitive-organism`, ahead 12 / behind 40 no momento da auditoria delta AB6.
- Worktree: sujo com muitas mudancas preexistentes e superficies protegidas modificadas por fora; nao sobrescrever nem reverter.
- Obsidian mirror antes da reconciliacao original: manifest tinha `scripts/pulse/**`, `backend/src/pulse/**` e PULSE root, mas `.pulse/**` estava ausente.
- Obsidian mirror depois da reconciliacao original: manifest tem 5.591 arquivos, `.pulse/**` incluido, 697 nos com tag `source/pulse-machine`.
- Auditoria delta 2026-05-16 12:10: `node scripts/obsidian-mirror-daemon.mjs --validate` retornou `5590 OK, 1 changed`; drift era `AGENTS.md` no source diferente do mirror.
- Reconciliacao delta 2026-05-16 12:11: `node scripts/obsidian-mirror-daemon.mjs --rebuild --force` atualizou 5.591 entradas do mirror sem erros; validacao posterior retornou `5591 OK, 0 changed, 0 stale, 0 missing-source, 0 missing-mirror, 0 untracked`.
- Bridge Obsidian: porta `127.0.0.1:37779` indisponivel nesta sessao; prova atual e em disco.
- OpenCode: micro-ondas interativas executadas; workers sem handoff persistido foram rejeitados; dois handoffs PULSE readiness foram aceitos como auditoria, ambos confirmando que PULSE global continua `NOT_READY`/`NOT_CERTIFIED`.
- GitNexus delta 2026-05-16 13:05-13:25: `npx -y gitnexus@latest analyze . --skip-agents-md` reconciliou o indice para HEAD `565b0f84...` com 89.982 nodes, 176.235 edges, 2.455 clusters e 300 flows.
- PULSE context fabric delta 2026-05-16 13:26: `node scripts/pulse/run.js --guidance` regenerou broadcast/delta/leases com `contextDigest=3aeeb1c58bc2c614103530a6be369a40e99428b4cf9b87d8a65e8fd2379be2ce`, `staleContextBlocksExecution=false`, `blockers=[]`, GitNexus ready e Beads ready.
- GitNexus LLM delta 2026-05-16 13:20-13:28: DeepSeek V4 Pro foi configurado no config local do GitNexus fora do repo; segredo nao foi gravado no ledger. Validacao direta do LLM retornou `OK`; smoke real `gitnexus wiki` em repo temporario gerou 2 paginas com sucesso.
- OpenCode swarm delta 2026-05-16 13:30-13:41: 4 workers interativos em `deepseek/deepseek-v4-pro` produziram handoffs persistidos e foram aceitos (`OC-SWARM-CONTEXT-AUDIT-001`, `OC-SWARM-LEASE-COLLISION-001`, `OC-SWARM-OPENCODE-RUNTIME-001`, `OC-SWARM-MISSION-ROUTER-001`).
- Orquestracao delta 2026-05-16 13:41: todos os processos `opencode serve/run` desta onda foram encerrados; nenhuma sessao OpenCode ficou rodando.
- Atomic lock delta 2026-05-16 13:45: lock `front-opencode-swarm-control-plane` liberado apos persistencia do ledger e limpeza dos processos.
- OpenCode atomic-only delta 2026-05-16 13:58-14:10: worker `OC-ATOMIC-ONLY-VALIDATION-001` provou falha critica inicial (native Write, Bash Python, Bash Node e `rm` conseguiam mutar codigo); reparo aplicado no hook Bash, plugin OpenCode e `opencode.json`; worker `OC-ATOMIC-ONLY-VALIDATION-002` provou que native code mutation e Bash Python code write foram negados mesmo com `--dangerously-skip-permissions`, e o arquivo de bypass nao existiu.
- OpenCode A/B delta 2026-05-16 14:16-14:33: dois worktrees isolados em `/tmp/kloel-opencode-ab-20260516-141634/{normal,atomic}` executaram a mesma tarefa complexa no auditor `scripts/mcp/atomic-edit/audit-atomicity.mjs`; NORMAL usou OpenCode sem atomic-edit, ATOMIC usou MCP atomic-edit e gates atomic-only. Ambos passaram a validacao nominal, mas ambos falharam o teste sintetico independente de `coarse_unjustified`, aceitando `native-edit` grosseiro como pass.
- Atomic tooling delta 2026-05-16 14:33: o auditor principal foi corrigido no repo com MCP atomic-edit para separar `enforcementPass` de `ratioPass`, adicionar `--strict-ratio`, preservar falhas por fallback/coarse real, aceitar trace atomico positivo por operador `atomic*` + `expansionFactorAvoided > 1`, e manter ratio baixo como advisory fora de strict mode.
- OpenCode A/B round 2 delta 2026-05-16 14:39-15:03: dois worktrees isolados em `/tmp/kloel-opencode-ab2-20260516-143948/{normal,atomic}` receberam a mesma missao complexa para adicionar `--self-test` ao auditor. NORMAL produziu uma solucao mais completa de compartilhamento de caminho, mas reescreveu mais e deixou bug de impressao. ATOMIC usou atomic tools e self-test em memoria, mas duplicou logica, testou `native-coarse` com `fallback=true` e contaminou `.atomic/traces` do worktree. Nenhum dos dois foi copiado diretamente.
- Atomic tooling delta 2026-05-16 15:03: o repo principal recebeu implementacao hibrida revisada no auditor: `evaluateTrace`, `auditTraces`, `loadTraceDirectory`, `buildSelfTestCases` e `--self-test` em memoria usando o mesmo avaliador do caminho real. O self-test cobre `native-coarse-offender` com `fallback=false`, `fallback-offender` e `atomic-positive`.
- Atomic OS principle delta 2026-05-16 15:03: `docs/ai/mission/ATOMIC_OS_PRINCIPLE.md` registra o principio expandido de preservacao maxima com mutacao minima, incluindo topologia de preservacao/modificacao, benchmarks que importam, regra de transformar derrotas A/B em atualizacao de ferramenta e regra fixa de escalada de complexidade somente apos superioridade atomica inequivoca.
- OpenCode A/B round 3 delta 2026-05-16 15:08-15:46: dois worktrees isolados em `/tmp/kloel-opencode-ab3-20260516-1508/{normal,atomic}` receberam a mesma missao para adicionar metricas de topologia de preservacao ao auditor. NORMAL passou smoke 73/73 e nao gerou trace atomico, mas implementou campo `topology` desalinhado ao contrato real. ATOMIC passou self-test, gerou traces e usou contrato mais proximo, mas falhou smoke 86/88 no worktree por ambiente ESLint e por trace sem topologia real; hidden validation `--self-test --strict-topology` falhou no ATOMIC. Nenhum foi copiado diretamente.
- Atomic tooling delta 2026-05-16 15:46: o repo principal recebeu implementacao hibrida revisada no auditor, usando o contrato real do MCP (`targetUnit`, `semanticImpact`, `preservedZones`, `modifiedZones` no nivel raiz), compatibilidade defensiva para `preservationTopology`/`topology`, `--strict-topology`, `topologyCoverage`, `missingTopology`, self-test em memoria isolado de flags globais e comparacao explicita de `expectedTopologyPass`.
- Atomic tooling delta 2026-05-16 17:09: o auditor foi corrigido para nao truncar JSON grande ao chamar `process.exit()` apos `console.log`; `--json` agora usa escrita callback-safe e voltou a produzir saida parseavel completa. O auditor tambem separa `topologySchemaFirstSeenAt`, `currentTopologyCoverage`, `currentMissingTopology`, `legacyMissingTopology`, `staleTopologyEmitterSuspected` e `--strict-current-topology`.
- Bloqueio atual de escala A/B 2026-05-16 17:14: `--strict-current-topology` ainda falha; foram medidos 607 traces reais, `currentTraceCount=418`, `currentTopologyCoverage=0.689`, `currentMissingTopologyCount=130`, `legacyMissingTopologyCount=189`, com missing correntes ainda emitidos como `atomic_edit`. Isso indica servidores MCP long-running/stale emitindo schema antigo. Nao escalar complexidade nem disparar nova rodada grande ate controlar lifecycle/canario do emissor.
- OpenCode atomic runtime delta 2026-05-16 17:20-17:45: canary `OC-ATOMIC-RUNTIME-004` encontrou regressao real no MCP: `atomic_replace_literal` nao aceitava/propagava `preview:true` nem `expectedSha256` e escreveu `MICRO_CHANGE = 33` apesar da missao ser dry-run; o orquestrador interrompeu a sessao, reparou o fixture para `32` por fallback atomico standalone com hash guard, e rejeitou a entrega como estado final.
- Atomic tooling delta 2026-05-16 17:45: `atomic_replace_literal` agora tem schema `preview` + `expectedSha256`, chama `guardSha`, propaga dry-run para `commit`, e o trace passou a separar `preview`, `changed`, `afterSha256` real e `proposedSha256`. Smoke novo garante que literal preview nao escreve e que o trace marca proposta sem escrita.
- OpenCode canary delta 2026-05-16 17:45: `OC-ATOMIC-RUNTIME-005` rodou OpenCode interativo DeepSeek V4 Pro, criou fixture temporario por `atomic_create_file`, executou `atomic_replace_literal preview:true`, confirmou arquivo ainda com `'old'` e sem `'new'`, e limpou o conteudo por `atomic_delete_range`; o orquestrador removeu o arquivo vazio gerado. Nenhuma sessao OpenCode ficou ativa.
- OpenCode A/B round 4 delta 2026-05-16 17:52-18:08: dois worktrees isolados em `/tmp/kloel-opencode-ab4-20260516-1746/{normal,atomic}` receberam a mesma missao para adicionar auditoria de honestidade de preview trace. NORMAL produziu patch util parcial e self-test proprio, mas smoke do worktree ficou contaminado por setup incompleto; ATOMIC nao recebeu ferramentas MCP `atomic-edit` no tool list do OpenCode, tentou derivar para escrita Bash/Node proibida, e foi interrompido/rejeitado pelo orquestrador. Nenhuma entrega worker foi copiada diretamente.
- Atomic tooling delta 2026-05-16 18:08: o repo principal recebeu implementacao hibrida revisada em `scripts/mcp/atomic-edit/audit-atomicity.mjs`: preview trace agora e hard-gate por `previewHonestyPass`; JSON inclui `previewTraceCount`, `dishonestPreviewCount` e `dishonestPreviews`; self-test cobre preview honesto e preview desonesto que parece escrita real. A/B nao pode escalar complexidade porque ATOMIC perdeu por exposicao/fallback de ferramenta, nao por problema resolvido.
- OpenCode atomic exposure canary 2026-05-16 18:18: `OC-ATOMIC-TOOL-EXPOSURE-006` rodou OpenCode interativo DeepSeek V4 Pro no repo principal e provou que o runtime enxerga o MCP `atomic-edit` como ferramentas atomicas (`atomic_create_file`, `atomic_replace_literal`, `atomic_delete_range`). O worker criou fixture temporario, executou `atomic_replace_literal preview:true`, confirmou que preview nao escreveu (`changed=false`, arquivo ainda com `'old'`) e esvaziou o conteudo com `atomic_delete_range`. A TUI nao autoencerrou apos o handoff e foi encerrada pelo orquestrador; o arquivo zero-byte gerado foi removido como residuo de canario. Lacuna registrada: falta primitiva atomica explicita de delete-file ou politica de cleanup para arquivo criado em canario.
- OpenCode A/B round 5 delta 2026-05-16 18:20-18:39: dois worktrees isolados em `/tmp/kloel-opencode-ab5-20260516-1820-{normal,atomic}` receberam a mesma missao: implementar `atomic_delete_file` no MCP para remover fixtures sem cleanup shell. NORMAL usou OpenCode padrao sem atomic-edit; ATOMIC usou MCP atomic-edit com gates atomic-only. Ambos passaram validacao independente apos corrigir symlink ambiental `worker/node_modules` nos worktrees temporarios. NORMAL venceu em cobertura inicial de teste (`expectedSha256`, trace preview/commit, 110/0 smoke); ATOMIC venceu em metodo de mutacao e rastreabilidade (`.atomic/traces`, MCP real, gates), mas entregou smoke mais fraco (107/0) e colocou a prova em posicao menos limpa. O repo principal recebeu uma versao hibrida revisada com design compacto do ATOMIC e cobertura mais forte do NORMAL.
- Atomic tooling delta 2026-05-16 18:39: `scripts/mcp/atomic-edit/server.ts` agora registra `atomic_delete_file` com `resolveSafeTarget`, recusa diretorios e governance, suporta `preview` e `expectedSha256`, e trata arquivo ausente como `changed:false`. Preview escreve trace honesto sem deletar; commit deleta com resposta compacta e trace persistido. `scripts/mcp/atomic-edit/smoke.ts` valida tool count 28, preview nao deletar, trace preview honesto, commit deletar, trace commit honesto, idempotencia, diretorio recusado, governance recusada e stale sha recusado.
- OpenCode A/B round 6 timeout delta 2026-05-16 18:40-18:56: dois worktrees isolados em `/tmp/kloel-opencode-ab6-20260516-1840-{normal,atomic}` receberam a mesma missao para implementar `code_file_stat`. NORMAL e ATOMIC ficaram mais de 10 minutos em geracao/TUI sem implementar `code_file_stat`; `rg "code_file_stat|codeFileStat|file_stat"` nao encontrou a ferramenta em nenhum worktree. As sessoes foram encerradas por PIDs exatos (`15597`, `15603`, `15598`, `15604`) e `pgrep -fl 'opencode run|opencode serve'` nao retornou processos ativos. Resultado classificado como falha de orquestracao/runtime DeepSeek/OpenCode por prompt longo, nao como vitoria ou derrota tecnica de um modo.
- OpenCode A/B round 7 delta 2026-05-16 19:39-20:19: dois worktrees isolados em `/tmp/kloel-opencode-ab7-20260516-1939-{normal,atomic}` receberam a mesma missao `atomic_rename_property_key` para renomear chave preservando valor. NORMAL implementou teste live mais completo, mas falhou build (`PropertyAssignment.setName` inexistente). ATOMIC usou MCP atomic-edit real e passou build, mas falhou smoke (`124 passed, 2 failed`) por teste de erro MCP para ambiguidade e por aceitar palavra reservada como chave. O repo principal recebeu versao hibrida lapidada: `renamePropertyKey` em `advanced.ts`, ferramenta MCP `atomic_rename_property_key` em `server.ts` e smoke com tool count 30, prova live de valor preservado, ambiguidade recusada, missing/invalid/keyword recusados. Validacao principal: `node --check` advanced/server/smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `125 passed, 0 failed`, auditor `--strict-current-topology` = `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check` limpo. Decisao: nao escalar complexidade; ATOMIC venceu rastreabilidade e proximidade tecnica, NORMAL venceu cobertura live inicial, e a ferramenta atomica foi atualizada com o melhor hibrido.
- OpenCode A/B round 8 delta 2026-05-16 20:22-20:45: dois worktrees isolados em `/tmp/kloel-opencode-ab8-20260516-2022-{normal,atomic}` receberam a mesma missao `atomic_add_await_to_call`, topologia "wrapper preservando expressao". NORMAL finalizou primeiro (~6m47s), respeitou a proibicao de atomic-edit, passou validacao independente com `131 passed, 0 failed`, mas nao gerou traces MCP. ATOMIC usou MCP atomic-edit real, gerou 22 traces persistidos, passou validacao independente com `134 passed, 0 failed` e entregou melhor cobertura semantica (property-access callee, selector para desambiguacao e detalhe `callText`), mas perdeu em tempo e ainda deixou lacuna semantica de `await` em contexto nao-async.
- Atomic tooling delta 2026-05-16 20:45: o repo principal recebeu versao hibrida lapidada de `atomic_add_await_to_call` em `scripts/mcp/atomic-edit/advanced.ts`, `server.ts` e `smoke.ts`. O reparo principal adicionou recusa para chamada fora de funcao/metodo `async`, mantendo callee/argumentos/texto da chamada como zona preservada e registrando `callText` no detalhe. Validacao principal: `node --check` advanced/server/smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `135 passed, 0 failed`, auditor `--strict-current-topology` desde 2026-05-16T23:22:00.000Z = `pass=true`, `traces=17`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check` limpo.
- Round 8 decisao: nao escalar complexidade. ATOMIC venceu NORMAL em rastreabilidade, prova de mutacao MCP, preservacao explicita e cobertura semantica final, mas NORMAL ainda venceu em velocidade. A lapidacao do orquestrador tambem revelou fraqueza atomica propria: insercoes por coordenada (`insert_at`) podem cair no bloco errado quando linhas mudam; foi reparado para frente com `replace-range`, mas a proxima rodada deve atacar insercao semanticamente ancorada para reduzir drift de coordenada.
- OpenCode A/B round 9 delta 2026-05-16 20:48-21:06: dois worktrees isolados em `/tmp/kloel-opencode-ab9-20260516-2048-{normal,atomic}` receberam a mesma missao `atomic_insert_after_anchor`, topologia "insercao ancorada preservando texto alvo". NORMAL implementou dentro do escopo (`server.ts` + `smoke.ts`), atingiu handoff "ready as final patch" e passou validacao independente com `145 passed, 0 failed`. ATOMIC usou MCP atomic-edit real e gerou traces, mas demorou mais, expandiu escopo para `engine.ts`, ficou incompleto no smoke comportamental da nova ferramenta e passou apenas `135 passed, 0 failed`, sem cobrir `insert_after_anchor`.
- Atomic tooling delta 2026-05-16 21:06: o repo principal recebeu versao hibrida lapidada de `atomic_insert_after_anchor` em `scripts/mcp/atomic-edit/server.ts` e `smoke.ts`, sem aceitar a expansao para `engine.ts`. A ferramenta usa `anchorText` com `.min(1)`, `occurrence` 1-based, `expectedSha256`, `preview`, recusa missing/ambiguous/out-of-range e insere somente `insertText` apos a ancora preservada. Validacao principal: `node --check scripts/mcp/atomic-edit/server.ts`, `node --check scripts/mcp/atomic-edit/smoke.ts`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `145 passed, 0 failed`, auditor `--strict-current-topology` desde 2026-05-17T00:00:00.000Z = `pass=true`, `traces=18`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check` limpo.
- Round 9 decisao: nao escalar complexidade. NORMAL venceu em tempo, escopo minimo, cobertura comportamental e self-termination; ATOMIC venceu apenas em rastreabilidade/prova de mutacao MCP. A derrota atomica formalizada vira requisito do proximo loop: o modo ATOMIC precisa de guardrail explicito de escopo editavel e template obrigatorio de smoke de aceite, alem de continuar usando so MCP atomic-edit.
- OpenCode A/B round 10 delta 2026-05-16 21:13-21:27: dois worktrees isolados em `/tmp/kloel-opencode-ab10-20260516-211321-{normal,atomic}` receberam a mesma missao `worker-scope-check`: criar CLI read-only para verificar allowlist/required files por `git status --porcelain=v1` e adicionar smoke em repo temporario. Os dois workers excederam o corte operacional de ~11m e foram encerrados pelo orquestrador, logo nenhum venceu self-termination. NORMAL continuou editando ate 21:27, mas deixou Part H funcional: validacao independente mostrou `161 passed, 7 failed`, sendo as 7 falhas do bloco ESLint ambiental do worktree; o bloco `worker-scope-check` passou completo. ATOMIC usou MCP atomic-edit e gerou traces (`audit --strict-current-topology` passou, `currentTopologyCoverage=1`), mas deixou a CLI funcionalmente incorreta em casos basicos: validacao independente retornou `157 passed, 18 failed`, com 11 falhas novas no bloco `worker-scope-check` alem das 7 falhas ambientais. ATOMIC perdeu funcionalidade, tempo/convergencia e autoencerramento; venceu apenas rastreabilidade.
- Atomic tooling delta 2026-05-16 21:33: o repo principal recebeu a versao hibrida aceita do `worker-scope-check` baseada no NORMAL e escrita por fallback atomico local porque o MCP exposto na sessao fechou transporte ao tentar preencher arquivo novo e nao publicou `atomic_create_file` para o orquestrador. Novo arquivo `scripts/mcp/atomic-edit/worker-scope-check.mjs` e bloco `Part H` em `smoke.ts` validam allowlist, required files, JSON, violacoes, path traversal/absoluto, `--repo`, diretoria allowlist e read-only. Validacao principal: `node --check scripts/mcp/atomic-edit/worker-scope-check.mjs`, `node --check scripts/mcp/atomic-edit/smoke.ts`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `168 passed, 0 failed`, `git diff --check` limpo, auditor desde 2026-05-17T00:00:00.000Z = `pass=true`, `traces=27`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
- Round 10 decisao: nao escalar complexidade. NORMAL venceu em correcao funcional e cobertura; ATOMIC venceu apenas em rastreabilidade/prova de mutacao e falhou criterios de aceite da propria tarefa. A derrota atomica formalizada vira requisito do proximo loop: expor/estabilizar `atomic_create_file` para o orquestrador e OpenCode, forcar autoencerramento, e usar `worker-scope-check` como gate externo antes de aceitar handoffs.
- OpenCode A/B round 11 delta 2026-05-16 21:35-21:55: dois worktrees isolados em `/tmp/kloel-opencode-ab11-20260516-2135-{normal,atomic}` receberam a mesma missao `atomic_create_file` com `expectedSha256`, parent dirs, preview sem escrita, empty-file fill, protected refusal e smoke `.mjs`. Ambos excederam corte operacional de ~10m30s e foram encerrados pelo orquestrador, entao nenhum venceu self-termination. NORMAL produziu cobertura mais completa, incluindo preview sem parent dir, parent dir commit, trace preview honesto, existing non-empty refusal, empty fill, stale sha, protected refusal e `.mjs`; validacao independente do worktree retornou `177 passed, 7 failed`, sendo as 7 falhas ambientais do bloco ESLint em worktree isolado. ATOMIC usou MCP atomic-edit real para `server.ts` e `smoke.ts`, gerou traces e auditoria `--strict-current-topology` verde (`pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`), mas sua cobertura nao provava parent-dir creation porque criou arquivos sob diretorio ja existente; validacao independente retornou `172 passed, 7 failed`, com as mesmas 7 falhas ambientais.
- Atomic tooling delta 2026-05-16 21:55: o repo principal recebeu versao hibrida lapidada de `atomic_create_file` em `scripts/mcp/atomic-edit/server.ts` e `smoke.ts`, aplicada por fallback atomico local com `sha256` de concorrencia. A ferramenta agora aceita `expectedSha256` e chama `guardSha` antes de preencher arquivo inexistente/vazio, mantendo a recusa de arquivo existente nao-vazio e a protecao de governance. O smoke agora cobre preview sem criar arquivo nem parent dir, commit criando parent dirs, recusa non-empty, fill de arquivo vazio, stale sha em vazio, sha correto em vazio, protected refusal e criacao multi-line `.mjs`. Validacao principal: `node --check scripts/mcp/atomic-edit/server.ts`, `node --check scripts/mcp/atomic-edit/smoke.ts`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `184 passed, 0 failed`, auditor desde 2026-05-17T00:00:00.000Z = `pass=true`, `traces=41`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check` limpo.
- Round 11 decisao: nao escalar complexidade. ATOMIC venceu em rastreabilidade, prova de mutacao e auditoria de topologia, mas NORMAL venceu em cobertura funcional da tarefa; ambos perderam self-termination e tempo. A derrota atomica formalizada vira requisito do proximo loop: reduzir macro-insercoes de smoke por bloco inteiro, fazer o worker ATOMIC provar parent-dir behavior com a mesma completude do NORMAL, e melhorar autoencerramento antes de aumentar dificuldade.
- OpenCode A/B round 12 delta 2026-05-16 21:57-22:15: dois worktrees isolados em `/tmp/kloel-opencode-ab12-20260516-2157-{normal,atomic}` receberam a mesma missao `atomic_insert_before_anchor`, topologia "insercao ancorada antes da ancora preservada". Ambos excederam o corte operacional de ~8m27s e foram encerrados simetricamente pelo orquestrador, entao nenhum venceu self-termination. NORMAL entregou cobertura funcional completa do novo operador, com validacao independente `187 passed, 7 failed`; as 7 falhas eram ambientais de ESLint no worktree isolado. ATOMIC usou MCP atomic-edit real, gerou traces e auditoria corrente verde (`pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`), mas entregou apenas cobertura de listagem do tool e nao smoke comportamental equivalente; validacao independente `177 passed, 7 failed`, com as mesmas falhas ambientais.
- Atomic tooling delta 2026-05-16 22:15: o repo principal recebeu versao hibrida lapidada de `atomic_insert_before_anchor` em `scripts/mcp/atomic-edit/server.ts` e `smoke.ts`, mais reparo em `scripts/mcp/atomic-edit/worker-scope-check.mjs` para ignorar `.atomic` como artefato de prova. A ferramenta aceita `anchorText`, `insertText`, `occurrence`, `expectedSha256` e `preview`, insere antes da ancora selecionada, preserva o texto da ancora, recusa missing/empty/ambiguous/out-of-range/stale sha e protege governance. Validacao principal: `node --check` server/smoke/worker-scope-check, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `195 passed, 0 failed`, auditor desde 2026-05-17T00:00:00.000Z = `pass=true`, `traces=58`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check` limpo, e `worker-scope-check --repo /tmp/kloel-opencode-ab12-20260516-2157-normal` retornou `ok=true` ignorando `.atomic`.
- Round 12 decisao: nao escalar complexidade. ATOMIC venceu em rastreabilidade, prova de mutacao e topologia corrente, mas NORMAL venceu em cobertura funcional, completude de aceite e comportamento testado. A derrota atomica formalizada vira requisito do proximo loop: o worker ATOMIC precisa produzir o mesmo checklist de smoke do NORMAL, usar blocos menores/operadores mais especificos para testes longos e concluir com handoff antes do corte operacional.
- A/B diagnostico externo 2026-05-16 17:06-17:13: dois processos `codex exec` ja estavam ativos em `/private/tmp/kloel-ab13-{normal,atomic}-20260516170548` com missao de corrigir lint real em `worker/**`. Ambos terminaram e passaram `npm --prefix worker run lint:check`, `typecheck`, `git diff --check -- worker`, `npm --prefix worker test` (431/431) e `build`. Esta rodada NAO conta como rodada oficial OpenCode porque nao usou OpenCode interativo, nao entregou handoff persistido e partiu de auditor antigo; serve apenas como diagnostico de benchmark.
- Mirror delta 2026-05-16 14:36-14:38: `node scripts/obsidian-mirror-daemon.mjs --rebuild --force` reconciliou 5.606 fontes, 0 erros; duas validacoes posteriores ficaram em `5605 OK, 1 changed` porque `docs/ai/atomic-os-benchmark/round-002/atomic-events.jsonl` estava sendo escrito por processos ativos (`node` PID 16928 e `codex` PID 16944). Nao encerrar processos externos sem autorizacao; registrar como drift vivo.
- Bloqueio de escala local: host 16GB com swap alto e leases PULSE monoliticos/phantom tornam inseguro manter 20-50 workers locais agora. A micro-onda 4/4 validou o protocolo de handoff, mas nao valida escala massiva.
- Production-final delta 2026-05-16 12:20-12:25: rota formal reproduzida com `PULSE_EXECUTION_TRACE_PATH=.pulse/current/PULSE_EXECUTION_TRACE.live.json PULSE_PERFECTNESS_DEBUG=1 node scripts/pulse/run.js --profile production-final --final --json`; processo foi encerrado por limite local de 300s antes de stdout JSON, com trace vivo parado em `scan:certification:parity-and-vision`.
- Production-final delta 2026-05-16 12:29-12:39: tentativa com limite local de 600s avancou alem de `parity-and-vision`; `scan:certification` passou, `scan:certification:parity-and-vision` passou em 223.957ms, e a execucao foi encerrada com `scan:perfectness` ainda running.
- Diagnostico isolado 2026-05-16 12:39-12:42: `buildExecutionHarness(process.cwd())` concluiu em 130.482ms, com 904 targets, 904 generated tests e 555 executable targets; portanto o modulo e lento, mas nao provou travamento isolado.
- Mirror final 2026-05-16 12:43: apos registrar os diagnosticos e o trace live, `node scripts/obsidian-mirror-daemon.mjs --rebuild --force && node scripts/obsidian-mirror-daemon.mjs --validate` retornou manifest com 5.592 fontes e validacao `5592 OK, 0 changed, 0 stale, 0 missing-source, 0 missing-mirror, 0 untracked`.

## Evidencias

- `node scripts/obsidian-mirror-daemon.mjs --rebuild --dry-run`: 5.586 arquivos seriam espelhados, incluindo `.pulse/**`.
- `node scripts/obsidian-mirror-daemon.mjs --rebuild --force`: primeira reconciliacao 5.586 updated, 0 errors, 7.848 stale mirror files removed; apos ledger/docs, segunda reconciliacao 5.591 updated, 0 errors.
- `node scripts/obsidian-mirror-daemon.mjs --validate`: 5.591 OK, 0 divergencias.
- `node scripts/obsidian-mirror-daemon.mjs --rebuild --force && node scripts/obsidian-mirror-daemon.mjs --validate`: 5.592 fontes espelhadas apos `PULSE_EXECUTION_TRACE.live.json`; validacao final `5592 OK`.
- Manifest depois: `.pulse/**` = 91, `scripts/pulse/**` = 536, `backend/src/pulse/**` = 26, root `PULSE_*` = 44, `source/pulse-machine` = 697, `metadata_only` = 20.
- Arquivo grande `.pulse/current/PULSE_PROPERTY_EVIDENCE.json`: source 192.350.723 bytes, mirror 1.057 bytes, `metadata_only`, tag `source/pulse-machine`.
- `PULSE_BACKEND_URL=https://api.kloel.com npm run pulse:probes`: 4/4 probes passed apos corrigir rota health para `/health/live`; reexecutado em 2026-05-16 12:10 com `Runtime evidence: 4/4 probes executed, 4 passed, 0 failed (100% coverage)`.
- `npx -y gitnexus@latest analyze . --skip-agents-md`: concluiu em 962.2s; indice fresco em `.gitnexus/meta.json` com 89.982 nodes, 176.235 edges, 2.455 clusters e 300 flows.
- `node scripts/pulse/run.js --guidance`: gerou run `6e4c9311-ea4c-4b50-893e-79b07952bb8b`, 3.600 TypeScript files, 10.189 behavior nodes, 8.995 `ai_safe`, 10 workers, 10 leases, `ownershipConflictPass=true`, `protectedFilesForbiddenPass=true`.
- GitNexus DeepSeek direct smoke: config resolvido como provider `custom`, model `deepseek-v4-pro`, base URL DeepSeek `/v1`; `callLLM` retornou `OK` em 3.208ms com uso de tokens reportado.
- GitNexus wiki smoke: repo temporario com `index.ts` foi analisado e `wiki --force --concurrency 1` gerou `overview.md`, `greeting.md`, `index.html` e `meta.json` em 77.5s.
- OpenCode runtime: `opencode --version` = 1.14.48; `opencode models` lista `deepseek/deepseek-v4-pro`; 4 workers exibiram `DeepSeek V4 Pro · DeepSeek · max` em modo interativo.
- OpenCode cleanup: `ps -o pid,ppid,stat,etime,rss,command -ax | rg 'opencode (serve|run)' || true` retornou vazio apos encerramento.
- Atomic lock release: `front-opencode-swarm-control-plane` liberado com `ok=true`.
- OpenCode atomic-only enforcement: `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou 83 passed, 0 failed; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` retornou `fallback_rate=0`, `coarse_unjustified=0`; direct hook negou Bash Python write, Bash Node write, `rm` e native `Edit` em `.ts`; `opencode debug config --print-logs --log-level DEBUG` carregou `workspace-gates` sem erro e resolveu `permission.edit=deny`; worker `OC-ATOMIC-ONLY-VALIDATION-002` confirmou denial no runtime OpenCode e ausencia do arquivo de bypass.
- OpenCode A/B benchmark round 1: NORMAL finalizou em ~5m33s produtivos; ATOMIC finalizou em ~4m24s produtivos. NORMAL tinha RSS ~443.904KB na amostra de 3m23s; ATOMIC OpenCode ~406.800KB, mais MCP atomic-edit ~98.576KB. NORMAL diff alvo `37 insertions / 15 deletions`, word-diff 4.660 bytes; ATOMIC diff alvo `35 insertions / 14 deletions`, word-diff 4.901 bytes. Ambos passaram `node ... --json`, `node ... --strict-ratio --json` e `npx tsx scripts/mcp/atomic-edit/smoke.ts` nos worktrees, mas ambos falharam o teste sintetico de coarse offender independente.
- Auditor atomicity pos-reparo no repo principal: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` retorna `enforcementPass=true`, `ratioPass=false`, `strictRatio=false`, `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json` retorna exit 1 com `pass=false`; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retorna 86 passed, 0 failed; testes sinteticos confirmam `native-edit` coarse e fallback como exit 1 e trace atomico positivo como exit 0.
- OpenCode A/B benchmark round 2: NORMAL rodou por ~12m52s ate ser encerrado pelo orquestrador apos produzir artefato util; ATOMIC rodou por ~12m51s e tambem foi encerrado apos ficar preso em validacao sob atomic-only. NORMAL passou self-test e smoke no worktree, mas tinha mutacao maior e bug potencial no output textual. ATOMIC passou self-test e smoke, mas o default audit do worktree falhou por artefato sintetico persistido em `.atomic/traces`, evidenciando contaminacao de validacao.
- Auditor atomicity pos-round2 no repo principal: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json` retorna `selfTestPass=true` com 3/3 casos; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test` retorna `self-test: PASS (3/3)`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` retorna exit 0 com `enforcementPass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `ratioPass=false`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json` retorna exit 1 intencional por ratio historico baixo; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retorna 88 passed, 0 failed; `git diff --check` limpo.
- OpenCode A/B benchmark round 3: NORMAL smoke 73/73, default/strict commands passam em worktree sem traces reais, mas isso e evidencia fraca porque o modo normal nao deixa trace atomico e usou schema `topology` fora do contrato real. ATOMIC smoke 86/88 no worktree; falhas: dependencia ESLint ausente no worktree isolado e falta de topologia nos traces emitidos ali. Hidden validation: NORMAL `--self-test --strict-topology --json` exit 0 sem provar flag estrita; ATOMIC `--self-test --strict-topology --json` exit 1 por acoplar self-test a strict real.
- Auditor atomicity pos-round3 no repo principal: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`, `--self-test --strict-topology --json` e `--self-test --strict-ratio --json` retornam exit 0 com `selfTestPass=true`, 4/4 casos e `atomic-without-topology` com `topologyPass=false` advisory. `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` retorna exit 0 com `enforcementPass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `ratioPass=false`, `topologyCoverage=0.3272`, `topologyPass=false`, `pass=true`, `missingTopologyCount=218` em 324 traces. `--strict-ratio --json` e `--strict-topology --json` retornam exit 1 esperado sobre traces historicos. `npx tsx scripts/mcp/atomic-edit/smoke.ts` retorna 90 passed, 0 failed. `git diff --check -- scripts/mcp/atomic-edit/audit-atomicity.mjs` limpo. Observacao: o `dist/trace.js` atual ja emite topologia, mas alguns servidores MCP long-running antigos ainda emitem formato velho; nao foram encerrados por nao terem dono claro nesta sessao.
- Auditor atomicity pos-current-topology no repo principal: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json` retorna exit 0 com `selfTestPass=true`; o mesmo comando antes estava parseavel, e `--json` real agora emite relatorio completo sem corte de 64 KiB. `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json` retorna exit 0 com `pass=true`, `currentTraceCount=418`, `currentTopologyCoverage=0.689`, `currentMissingTopologyCount=130`, `legacyMissingTopologyCount=189`, `staleTopologyEmitterSuspected=true`. `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-current-topology --json` retorna exit 1 esperado. `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-topology --json` retorna exit 1 esperado com missing topology historico/corrente. `npx tsx scripts/mcp/atomic-edit/smoke.ts` retorna 98 passed, 0 failed. `git diff --check -- scripts/mcp/atomic-edit/audit-atomicity.mjs docs/ai/mission` limpo.
- Atomic literal preview pos-reparo: `node scripts/mcp/atomic-edit/build.mjs` passou; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou 101 passed, 0 failed, incluindo `literal preview dry-run does not write` e `literal preview trace marks proposed but not written`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:33:24.000Z --strict-current-topology --json` retornou exit 0 com `pass=true`, `currentTraceCount=11`, `currentTopologyCoverage=1`, `currentMissingTopology=[]`, `staleTopologyEmitterSuspected=false`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json` retornou `selfTestPass=true`; `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs` passou; `git diff --check -- scripts/mcp/atomic-edit/trace.ts scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts scripts/mcp/atomic-edit/audit-atomicity.mjs` passou.
- Trace preview evidence: traces recentes com `preview=true` agora carregam `changed=false`, `afterSha256` do conteudo em disco, `proposedSha256` do conteudo proposto e descricao `Preview only: the highlighted span is proposed but was not written.`
- OpenCode A/B benchmark round 4: NORMAL `node --check` e self-test passaram no worktree, com campo proprio `previewEnforcementPass`; diff alvo do auditor teve word-diff 22.292 bytes. NORMAL venceu em execucao efetiva parcial, mas sua entrega nao foi aceita diretamente por ambiente contaminado e nomenclatura desalinhada. ATOMIC `node --check` passou, mas self-test permaneceu no estado antigo de 4 casos, nao implementou preview honesty e tentou sair do contrato atomic-only quando o MCP nao apareceu no tool list; diff alvo medido nao representa entrega valida. O orquestrador encerrou os processos `opencode run`/`serve`; `pgrep -fl 'opencode run|opencode serve'` retornou vazio.
- Auditor preview honesty pos-round4 no repo principal: `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs` passou; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json` retornou `selfTestPass=true` com 6 casos, incluindo `honest-preview` (`previewHonestyPass=true`, `dishonestPreviewCount=0`) e `dishonest-preview-looks-committed` (`previewHonestyPass=false`, `dishonestPreviewCount=1`, `pass=false` mesmo com `topologyPass=true` e `enforcementPass=true`); `node scripts/mcp/atomic-edit/build.mjs` passou; `npx tsx scripts/mcp/atomic-edit/smoke.ts` retornou 102 passed, 0 failed; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:52:09.000Z --strict-current-topology --json` retornou exit 0 com `pass=true`, `currentTraceCount=8`, `currentTopologyCoverage=1`, `previewHonestyPass=true`, `dishonestPreviewCount=0`; `git diff --check -- scripts/mcp/atomic-edit` passou.
- OpenCode atomic exposure canary pos-round4: `opencode mcp list` mostrou `atomic-edit connected`; `opencode debug config --print-logs --log-level DEBUG` carregou `opencode.json`, `workspace-gates` e `permission.edit=deny`; canary `OC-ATOMIC-TOOL-EXPOSURE-006` usou `atomic_create_file`, `atomic_replace_literal preview:true` e `atomic_delete_range`; `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:13:00.000Z --strict-current-topology --json` retornou exit 0 com `traces=5`, `previewTraceCount=1`, `dishonestPreviewCount=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `currentTopologyPass=true`, `staleTopologyEmitterSuspected=false`, `pass=true`; `pgrep -fl 'opencode run|opencode serve'` retornou vazio; `test ! -e scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts` passou.
- OpenCode A/B benchmark round 5: NORMAL worker finalizou em ~7m27s produtivos; ATOMIC em ~9m55s produtivos. Validacao independente nos worktrees apos symlink ambiental `worker/node_modules`:
  - NORMAL: `node --check` server/smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = 110 passed / 0 failed, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:22:00.000Z --strict-current-topology --json` = `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit` limpo.
  - ATOMIC: mesmos checks server/smoke/build, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = 107 passed / 0 failed, auditor = `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit` limpo.
  - Repo principal pos-lapida: `node --check scripts/mcp/atomic-edit/server.ts`, `node --check scripts/mcp/atomic-edit/smoke.ts`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = 110 passed / 0 failed, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:22:00.000Z --strict-current-topology --json` = `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit docs/ai/mission` limpo.
- Round 5 decisao: nao escalar complexidade ainda. ATOMIC venceu na pureza operacional, traceabilidade e prova de toolchain, mas NORMAL ainda venceu em cobertura inicial de aceite e tempo. A derrota atomica formalizada vira requisito do proximo loop: o agente ATOMIC deve gerar testes tao completos quanto o NORMAL, incluindo `expectedSha256` e leitura do trace persistido, sem depender do orquestrador para completar cobertura.
- OpenCode A/B benchmark round 6 timeout: NORMAL e ATOMIC foram disparados com a mesma tarefa `code_file_stat`, mas nenhum produziu mutacao aceitavel nem handoff final. O encerramento controlado confirmou zero processos `opencode run|serve` restantes e nenhuma implementacao de `code_file_stat` nos worktrees. Decisao: repetir como AB6b na mesma dificuldade, com prompt menor, contrato de primeira mutacao/prova em ate 3 minutos e handoff final compacto; nao escalar complexidade.
- OpenCode A/B round 6b delta 2026-05-16 18:58-19:35: dois worktrees isolados em `/tmp/kloel-opencode-ab6b-20260516-1858-{normal,atomic}` repetiram a mesma missao `code_file_stat` com prompt curto. NORMAL finalizou com implementacao em `server.ts` + `smoke.ts`, smoke independente `116 passed, 0 failed`, mas usou hash/bytes derivados de leitura UTF-8. ATOMIC usou MCP atomic-edit real e passou smoke independente `118 passed, 0 failed`, mas expandiu escopo para `guard.ts`, teve timeout interno do smoke na TUI e tambem hash por leitura UTF-8. O repo principal recebeu versao hibrida lapidada: `code_file_stat` le metadados sem expor conteudo, calcula `bytes` por `stat.size` e `sha256` por `Buffer` bruto, marca protegidos sem `sha256`/`bytes`/conteudo e adiciona smoke de hash bruto/missing/directory/protected. Validacao principal: `node --check` server/smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `116 passed, 0 failed`, auditor `--strict-current-topology` = `pass=true`. Decisao: nao escalar complexidade; ATOMIC venceu rastreabilidade/prova, NORMAL venceu tempo/escopo/cobertura de hash, e a ferramenta atomica foi atualizada com o melhor hibrido.
- OpenCode A/B round 7 pos-lapida: repo principal validado com `node --check scripts/mcp/atomic-edit/advanced.ts`, `node --check scripts/mcp/atomic-edit/server.ts`, `node --check scripts/mcp/atomic-edit/smoke.ts`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `125 passed, 0 failed`, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T22:39:00.000Z --strict-current-topology --json` = `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit/advanced.ts scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` limpo. NORMAL/ATOMIC nao foram copiados diretamente; a entrega aceita e hibrida.
- A/B diagnostico externo worker lint: NORMAL diff alvo `24 files changed, 246 insertions, 126 deletions`, word-diff 32.308 bytes; ATOMIC diff alvo `24 files changed, 251 insertions, 119 deletions`, word-diff 32.278 bytes. O ATOMIC gerou 24 traces `.atomic/traces` com `atomic_apply_eslint_dry_run_fixes`, `topologyCoverage=1`, `fallbackRate=0`, `coarseUnjustified=0`, `atomicEditRatio=0.4167`, `meanExpansion=1.24`. O auditor antigo do worktree nao leu esses traces porque usava `docs/ai/traces`; isso reforca a necessidade de canario/lifecycle antes da proxima rodada oficial.
- OpenCode A/B round 13B delta 2026-05-16 22:16-22:46: dois worktrees isolados em `/tmp/kloel-opencode-ab13-20260516-2216-{normal,atomic}` receberam a mesma missao `atomic_replace_between_anchors`. NORMAL foi bloqueado pelo hook atomic-only ao tentar native edit e finalizou como `BLOCKED_BY_ATOMIC_ONLY_HOOK`, sem arquivos alterados e sem bypass. ATOMIC usou MCP atomic-edit real e entregou `server.ts` + `smoke.ts`; validacao independente no worktree e no repo principal retornou `node --check` server/smoke verde, `node scripts/mcp/atomic-edit/build.mjs` OK, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `207 passed, 0 failed`, auditor `--strict-current-topology` desde `2026-05-17T01:16:00.000Z` = `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit` limpo. Decisao: ATOMIC venceu funcionalmente esta rodada e o enforcement normal foi provado, mas nao escalar complexidade porque o NORMAL agora mede controle negativo, nao competidor que concluiu a mesma tarefa.
- OpenCode A/B round 14 delta 2026-05-16 22:50-23:21: dois worktrees isolados em `/tmp/kloel-opencode-ab14-20260516-2250-{normal,atomic}` receberam a mesma missao `atomic_replace_text_in_anchor_region`. NORMAL, com native edit permitido para baseline, entregou `server.ts` + `smoke.ts`, validou `node --check`, build, `worker-scope-check` no worktree e `git diff --check`; o smoke do worktree ficou `219 passed, 7 failed` por falhas ambientais de ESLint (`@eslint/js` ausente no worktree), mas todos os testes novos da ferramenta passaram. ATOMIC ficou preso em planejamento/geracao, alterou somente `server.ts`, nao entregou smoke nem handoff final aceitavel e foi encerrado pelo orquestrador. O repo principal recebeu uma versao hibrida: implementacao parcial mais correta do ATOMIC para matches nao sobrepostos + cobertura funcional do NORMAL + ajuste de mensagens para o schema. Validacao principal: `node --check` server/smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts` = `226 passed, 0 failed`, auditor desde `2026-05-17T02:00:00.000Z` = `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`, `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` limpo. Decisao: NORMAL venceu AB14 em produtividade, cobertura e completude; ATOMIC venceu apenas como insumo parcial de algoritmo/topologia. Nao escalar complexidade.
- A/B complexidade escalada round 45 delta 2026-05-16 23:09-23:27: rodada repetiu a classe de refactor medio multi-arquivo de `backend/src/kloel/unified-agent.service.ts` apos derrota parcial do ATOMIC no round 44. Ambos worktrees passaram Jest focado `13/13`, backend typecheck e `git diff --check`; spec diff vazio; protected diff apenas `AGENTS.md` ja sujo no boot. ATOMIC corrigiu o erro de trace no root errado do round 44: `trace-isolation-check` confirmou `worktreeTraceCount=14`, `matchingTraceIds=[]`, exit 0. Mesmo assim NORMAL venceu tempo/comandos/eventos/tokens: 474s vs 575s, 112 vs 180 eventos, 42 vs 74 comandos, 1.692.185 vs 5.167.577 input tokens. ATOMIC venceu facade menor (`197` vs `345` linhas), zero file_change nativo, 6 MCP calls e 14 traces. Decisao: nao escalar; manter a mesma classe de refactor e reduzir overhead cognitivo/operacional do ATOMIC.
- Atomic benchmark tooling delta pos-round45: `docs/ai/atomic-os-benchmark/tools/round-audit.cjs` agora parseia marcadores `*_exit`, corrigindo `functionalPass=true` para a rodada 45; `atomic-call.cjs --help` sai com codigo 0 para nao virar falso failed command; `trace-isolation-check.cjs` foi adicionado para substituir checagens shell ruidosas e falhar somente se IDs de trace do worker aparecerem tambem no checkout coordenador. Validacao: `node --check` nos tres helpers passou, `round-audit` mostra `functionalPass=true`, e `trace-isolation-check` no worktree ATOMIC 045 retornou `ok=true`.
- Mirror pos-ledger: primeiro e segundo `--validate` apos rebuild retornaram `5605 OK, 1 changed, 0 stale, 0 missing-source, 0 missing-mirror, 0 untracked`; `lsof docs/ai/atomic-os-benchmark/round-002/atomic-events.jsonl` mostrou escritores ativos, logo a divergencia nao foi tratada como falha do mirror nem revertida.
- Production-final com trace explicito: `scan:core-parsers` passou em 33.829ms; `scan:truth` passou em 97.183ms; `scan:certification:final` passou em 26.316ms com `NOT_CERTIFIED` score 55; comando ainda nao terminou porque `scan:certification:parity-and-vision` estava running quando o limite de 300s encerrou a reproducao.
- Production-final com budget 600s: `scan:core-parsers` 37.736ms, `scan:truth` 98.418ms, `scan:certification:final` 23.680ms, `scan:certification:parity-and-vision` 223.957ms, `scan:perfectness` ainda running; log de perfectness chegou a iniciar `execution-harness`.
- `TS_NODE_PROJECT=scripts/pulse/tsconfig.json node -r ts-node/register/transpile-only -e "...buildExecutionHarness..."`: concluiu com `durationMs=130482`, `totalTargets=904`, `generatedTestCount=904`, `executableTargets=555`.
- Observacao de causa: stdout 0 bytes nao prova processo morto, porque `scripts/pulse/index.ts` escreve JSON apenas depois de `fullScan()` e `generateArtifacts()`; trace padrao local tambem nao vai para `.pulse/current` sem `PULSE_EXECUTION_TRACE_PATH`, o que pode fazer a execucao parecer opaca.
- OpenCode `OC-PULSE-READINESS-001` e `OC-PULSE-READINESS-002`: PULSE global nao esta pronto; certificado `NOT_CERTIFIED` score 55/100; bloqueios principais incluem 4.883 terminal paths sem evidencia observada, 2.047 proof tasks sem observed evidence, Codacy/high static findings, external adapters stale e hardcoded-reality debt historico.

## Delta 2026-05-17 17:53 - OpenCode A/B round 089

- Round 089 escalou o router cluster para incluir tambem `actionSucceeded`.
- NORMAL atingiu `max_timeout` do watchdog em ~900s; ATOMIC completou exit `0`.
- Validacao externa classificou ambos como task-functional: Jest focado `13/13`, typecheck Kloel sem erro, diff-check, protected diff, suppression scan, helper no-`this.`, router absence/export e residual-scope scans verdes; typecheck global segue vermelho apenas por ruido compartilhado Google Ads/Prisma.
- ATOMIC venceu watchdog, eventos `3` vs `136`, primeira acao `5.478ms` vs `19.864ms`, tempo total `70.511ms` vs `885.733ms`, comandos `1` vs `19`, failed commands `0` vs `5`, input/output/reasoning `56.188/192/18` vs `92.021/11.444/6.693`, helper `240` vs `245`, total Kloel lines `778` vs `783`, source churn `477` vs `500`, traces `18` vs `0`.
- NORMAL venceu o novo lint extra por menos residuos (`5` erros vs `15` no ATOMIC), embora ambos tenham falhado lint nos arquivos tocados.
- Derrota atomica formalizada: macro de extracao nao aplicava formatacao/lint atomica apos gerar helper.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` agora aceita `formatWithEslint` / `lintFix` / `autoFixLint` e executa `atomic_apply_eslint_dry_run_fixes` entre extracao e validacao.
- Decisao: nao escalar complexidade. Round 090 deve repetir exatamente a mesma tarefa com `formatWithEslint=true`.

## Delta 2026-05-17 18:24 - OpenCode A/B round 090

- Round 090 repetiu a tarefa do Round 089 com `formatWithEslint=true`.
- Watchdog completou ambos lanes exit `0`.
- NORMAL passou aceite focado com Jest `13/13`, `typecheckKloelErrors=0`, diff-check e scans externos; lint ainda falhou por erro preexistente de `no-unsafe-assignment`.
- ATOMIC venceu custo operacional: eventos `3` vs `139`, primeira acao `5.960ms` vs `24.589ms`, tempo total `122.313ms` vs `885.167ms`, comandos `1` vs `16`, failed commands `0` vs `4`, input/output/reasoning `56.069/238/662` vs `76.502/11.196/11.371`, source churn `493` vs `495`, traces `20` vs `0`, `atomicModeClean=true`.
- ATOMIC perdeu funcionalidade estrita: `typecheckKloelErrors=1` por remover `abi as unknown as Record<string, unknown>` fora da intencao; tambem deixou erro Prettier no import.
- Ferramenta corrigida: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` agora trata `formatWithEslint=true` como layout-only e adiciona `--fix-type layout`.
- Decisao: nao escalar complexidade. Round 091 deve repetir a mesma tarefa e provar `typecheckKloelErrors=0`, import formatado, gates focados verdes e margem operacional mantida.

## Delta 2026-05-17 19:13 - OpenCode A/B round 093

- Round 093 repetiu a dificuldade router cluster + `actionSucceeded` apos `postLintReplacements`.
- Ambos lanes passaram aceite focado externo: Jest `13/13`, lint tocado `0`, diff-check `0`, protected diff vazio, helper sem `this.`, private methods removidos, router exports presentes e `typecheckKloelErrors=0`.
- Typecheck global segue vermelho apenas por ruido compartilhado Google Ads/Prisma fora de `src/kloel/**`.
- NORMAL ficou funcional mas atingiu `max_timeout` em 900.843ms.
- ATOMIC completou, `atomicModeClean=true`, venceu eventos `3` vs `128`, primeira acao `5.309ms` vs `27.596ms`, tempo total `157.529ms` vs `900.843ms`, comandos `1` vs `14`, failed commands `0` vs `5`, input/output/reasoning `59.624/77/25` vs `83.286/10.371/13.311` e traces `22` vs `0`.
- NORMAL ainda venceu `serviceLines` `536` vs `548` e `sourceChurn` `487` vs `494`.
- Decisao: nao escalar ainda. Round 094 deve repetir a mesma dificuldade com compactacao de shape final ate ATOMIC empatar/vencer `serviceLines` e `sourceChurn` mantendo a margem operacional.

## Delta 2026-05-17 19:51 - OpenCode A/B round 094 + reconciliacao Codex

- Round 094 repetiu a dificuldade router cluster + `actionSucceeded` com compactacao de shape final.
- NORMAL foi aceito como baseline funcional apesar de `max_timeout`: Jest focado, lint focado, diff-check, protected diff, helper sem `this.`, router export/absence e `typecheckKloelErrors=0`.
- ATOMIC foi rejeitado: preprompt exit `1`, Jest focado `12/13`, lint vermelho, `typecheckKloelErrors=4`, private methods ainda presentes e estado parcial no helper/service.
- A vitoria atomica real foi de seguranca: o guard recusou persistir uma substituicao sintaticamente invalida causada por `\n` escapado em texto de codigo; a derrota real foi nao fazer rollback/idempotent cleanup da transacao macro inteira.
- Scorecard: ATOMIC venceu eventos `3` vs `155`, primeira acao `5.315s` vs `20.702s`, comandos `1` vs `15`, failed commands `1` vs `3`, tokens e traces `6` vs `0`; NORMAL venceu comportamento, service lines `558` vs `738` e total Kloel lines `790` vs `978`.
- Ferramentas atualizadas: `atomic-call.cjs` aceita `decodeEscapedCodeTextInReplacements` / `decodeEscapedNewlinesInReplacements`; `atomic_add_import` aceita `typeOnly`; `round-audit.cjs` separa task-functional pass por lane.
- Reconciliacao: artefatos `round-115-codex-*`/`round-116-codex-*` foram encontrados, mas nao governam o loop oficial porque a regra ativa exige workers OpenCode.
- Decisao: nao escalar. Round 095 deve repetir exatamente a mesma dificuldade OpenCode com newline-safe replacements e disciplina de cleanup/rollback.

## Delta 2026-05-17 20:24 - OpenCode A/B round 095

- Round 095 repetiu a dificuldade do Round 094 com macro atomica newline-safe e shape de dependencia compacto.
- Resultado: sem vencedor aceito. NORMAL falhou por `max_timeout` e lint focado vermelho; ATOMIC completou e venceu superficie operacional, mas falhou `typecheckKloelErrors=1`.
- NORMAL: Jest focado passou, `typecheckKloelErrors=0`, diff/protected/suppression/helper/private scans passaram, service/helper/total lines `535/232/767`, mas `eslintStatus=1`.
- ATOMIC: lane `completed`, Jest/lint/diff/protected/suppression/helper/private scans passaram, `atomicModeClean=true`, traces `25`, eventos `3` vs `122`, comandos `1` vs `13`, failed commands `0` vs `2`, input/output/reasoning `61.085/178/356` vs `77.842/10.124/11.733`; porem service/helper/total lines `542/235/777` e `typecheckKloelErrors=1`.
- Derrota atomica formalizada: deps opcionais no helper foram geradas como `riskGate?:`/`agentRuntime?:` enquanto a propriedade `toolRouterDeps` atribuiu explicitamente `undefined`, quebrando `exactOptionalPropertyTypes`.
- Ferramentas atualizadas: `round-audit.cjs` agora parseia validacao externa `== ... ==`, `*_done`, `touched_typecheck_error_count`, metadata `normal_worktree`/`atomic_worktree` e traces do worktree; `atomic-call.cjs` converte dinamicamente propriedades opcionais explicitamente atribuidas para `Type | undefined`.
- Decisao: nao escalar. Round 096 deve repetir a mesma dificuldade com operador corrigido ate ATOMIC passar `typecheckKloelErrors=0`, manter margem operacional e empatar/vencer shape/churn.

## Delta 2026-05-17 20:35 - OpenCode A/B round 096

- Round 096 repetiu a dificuldade do Round 095 com `atomic-call.cjs` corrigido.
- Resultado: ATOMIC venceu funcionalmente; NORMAL foi rejeitado por `idle_timeout` sem helper e sem remocao dos private methods.
- NORMAL: Jest focado passou e `typecheckKloelErrors=0`, mas helper ausente, private router methods ainda presentes e lint focado vermelho; logo nao e baseline de shape.
- ATOMIC: `taskFunctionalPass=true`, lane `completed`, Jest/lint/diff/protected/suppression/helper/private scans verdes, `typecheckKloelErrors=0`, `atomicModeClean=true`, traces `25`, eventos `3` vs `17`, primeira acao `5.336s` vs `22.124s`, tempo total `203.111s` vs `304.270s`, input/output/reasoning `61.120/97/488` vs `69.937/558/1.300`.
- Prova do reparo: o prompt ainda continha `riskGate?:`/`agentRuntime?:`, mas o helper gerado ficou com `riskGate: RiskGateService | undefined` e `agentRuntime: AgentRuntimeContextService | undefined`.
- Ferramenta atualizada: `round-audit.cjs` agora marca shape/churn/touched-file como `not_applicable` quando os dois lanes nao sao task-functional, impedindo falsa vitoria por no-op.
- Decisao: aceitar vitoria funcional atomica, mas nao escalar ainda; Round 097 deve repetir a mesma dificuldade para obter baseline NORMAL comparavel ou falha NORMAL repetida.

## Delta 2026-05-17 21:05 - OpenCode A/B round 097 rejeitado

- Round 097 repetiu a dificuldade do Round 096 com dois workers OpenCode
  simultaneos.
- Watchdog: NORMAL `completed` exit `0` em `818742ms`; ATOMIC `completed` exit
  `0` em `818739ms`; ATOMIC preprompt exit `0`.
- Rejeicao: a validacao externa independente nao conseguiu ler nenhum worktree,
  porque `/private/tmp/kloel-ab097-normal-20260517204003` e
  `/private/tmp/kloel-ab097-atomic-20260517204003` desapareceram e nao estavam
  mais em `git worktree list`.
- Evidencia aceita: apenas logs/event streams e o fato de que o harness perdeu a
  materia-prima antes da prova externa; nenhum vencedor funcional aceito.
- Ferramenta atualizada: `opencode-round-watchdog.cjs` agora conta crescimento
  de `opencode-<lane>-preprompt-output.log` como heartbeat, evitando falso idle
  timeout quando a macro atomica escreve output antes do JSONL.
- Decisao: nao escalar. Round 098 deve repetir a mesma dificuldade usando
  worktrees persistentes fora de `/private/tmp` e so aceitar resultado apos
  validacao externa.

## Delta 2026-05-17 21:13 - OpenCode A/B round 098

- Round 098 repetiu a dificuldade do Round 096/097 usando worktrees persistentes
  em `/Users/danielpenin/kloel-ab-worktrees`.
- NORMAL: `idle_timeout`, sem diff Kloel aceito, helper ausente, private methods
  ainda presentes, Jest focado `13/13`, lint focado `1`,
  `typecheckKloelErrors=0`.
- ATOMIC: `completed`, `taskFunctionalPass=true`, Jest/lint/diff/protected/
  suppression/helper/private scans verdes, `typecheckKloelErrors=0`,
  `atomicModeClean=true`, traces `25`.
- Scorecard: ATOMIC venceu task-functional, lane completion, eventos `3` vs
  `36`, primeira acao `6.582s` vs `31.970s`, effective agent time `163.699s`
  vs `452.398s`, input/output/reasoning e traceability. Shape/churn ficaram
  `not_applicable` porque NORMAL nao entregou a tarefa.
- Decisao: fechar o tier atual por falha repetida do baseline (Rounds 096 e
  098) e escalar um degrau controlado no Round 099, ainda com 2 workers
  OpenCode e worktrees persistentes.

## Delta 2026-05-17 21:36 - OpenCode A/B round 099

- Round 099 escalou a dificuldade para extrair router + runtime-context cluster:
  `executeToolAction`, `num`, `buildAgentToolEnvelope`, `actionSucceeded`,
  `buildAgentRuntimeContext` e `recordAgentRuntimeTurn`.
- NORMAL: `max_timeout`, diff parcial, Jest focado `13/13`, lint focado `1`,
  `typecheckKloelErrors=0`, service/helper/total `532/264/796`, churn `571`.
- ATOMIC: `completed`, `taskFunctionalPass=true`, Jest/lint/diff/protected/
  suppression/helper/private/public scans verdes, `typecheckKloelErrors=0`,
  `atomicModeClean=true`, traces `32`, service/helper/total `518/267/785`,
  churn `558`.
- Scorecard: ATOMIC venceu task-functional, completion, eventos `3` vs `100`,
  comandos `1` vs `7`, failed commands `0` vs `2`, primeira acao, effective
  time, tokens, traceability e tambem os numeros brutos de shape/churn.
- Decisao: aceitar vitoria do tier escalado e subir mais um degrau controlado.

## Delta 2026-05-17 22:06 - OpenCode A/B round 100

- Round 100 escalou a dificuldade para extrair um cluster misto:
  top-level `isAllowedTool`, top-level `formatPromptValue`, `executeToolAction`,
  `num`, `buildAgentToolEnvelope`, `actionSucceeded`,
  `buildAgentRuntimeContext` e `recordAgentRuntimeTurn`.
- NORMAL: `max_timeout` em `900.920s`; validacao externa tardia passou Jest
  focado `13/13`, ESLint focado `0`, diff/protected/suppression/helper/private/
  top-level/public scans verdes e touched typecheck errors `0`. Shape:
  service/helper/total `486/297/783`, churn estimado `616`.
- ATOMIC: `completed` em `202.852s`, first action `6.822s`, eventos `3`,
  comandos `1`, failed commands `0`, traces `40`; validacao externa passou os
  mesmos gates focados e touched typecheck errors `0`. Shape:
  service/helper/total `490/297/787`, churn estimado `620`.
- Scorecard: ATOMIC venceu completion, tempo, primeira acao, eventos, comandos,
  failed commands, mensagens, native write/edit tools e traceability. NORMAL
  venceu compactacao bruta por `4` linhas/churn.
- Derrota atomica formalizada: o shape do ATOMIC usou objeto de dependencias no
  constructor e parse JSON defensivo; o NORMAL ficou menor com getter e assercao
  direta. A assercao direta nao deve ser copiada, mas o container de
  dependencias deve virar politica dinamica.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  agora aceita `dependencyContainer`/`depsContainer` `style=getter`, gerando o
  getter a partir de `name`, `typeName`, `entries` e marcador de insercao.
  Validacao: `node --check` e `git diff --check` passaram.
- Decisao: nao escalar complexidade. Repetir exatamente o mesmo tier no
  Round 101 usando `dependencyContainer` getter dinamico.

## Delta 2026-05-17 22:13 - OpenCode A/B round 101 rejeitado

- Round 101 tentou repetir o Round 100 usando `dependencyContainer` getter
  dinamico.
- ATOMIC falhou no preprompt com exit `1`: o post-removal replacement procurou
  oldText exato `tool router + duas quebras + }`, mas apos a remocao atomica o
  source tinha varias linhas em branco antes do fechamento da classe.
- NORMAL estava apenas no inicio do trabalho; a rodada foi encerrada cedo para
  liberar recursos e evitar comparacao invalida.
- Decisao: rejeitar o round como regressao de ferramenta, sem vencedor.
- Ferramenta corrigida: `atomic-call.cjs` agora resolve replacements gerados
  por `dependencyContainer` com `anchorText` dinamico, capturando o tail real
  atual do arquivo no momento de aplicar a insercao.
- Validacao da correcao: `node --check` e `git diff --check` passaram.
- Proxima acao: repetir exatamente a mesma tarefa no Round 102.

## Delta 2026-05-17 22:25 - OpenCode A/B round 102 rejeitado

- Round 102 repetiu a mesma dificuldade com dois workers OpenCode simultaneos
  em worktrees persistentes.
- ATOMIC saiu do OpenCode com exit `0`, mas o preprompt atomico saiu `1`.
- Evidencia: o smoke comportamental interno passou Jest `13/13`, diff/protected
  e scans basicos, mas o gate `no deps builder method` falhou porque o getter
  `private get toolRouterDeps(): ExecuteToolActionDeps` contem a substring
  proibida `toolRouterDeps()`.
- NORMAL ainda estava running e foi encerrado cedo porque a comparacao ja estava
  contaminada.
- Decisao: rejeitar o round como regressao de politica/ferramenta, sem vencedor
  A/B.
- Ferramenta corrigida: `atomic-call.cjs` agora suporta
  `dependencyContainer.style = "constructorProperty"`, gerando propriedade
  explicita + atribuicao no construtor a partir de `entries`, sem getter e sem
  metodo builder.
- Validacao da correcao: `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  e `git diff --check -- docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  passaram.
- Proxima acao: repetir exatamente a mesma tarefa no Round 103.

## Proximo Delta Recomendado

1. Repetir o Round 103 no Round 104 sem escalar: mesma tarefa real mista, dois workers OpenCode simultaneos, worktrees persistentes fora de `/private/tmp`, ATOMIC mirando compactacao de service-line/churn sem copiar residuo inseguro do NORMAL, e validacao externa antes de qualquer novo claim.
2. Nao escalar para 20-50 workers locais enquanto memoria/swap e lease topology nao estiverem corrigidos; a escala atual e de complexidade da tarefa, nao de quantidade local massiva.
3. Antes de qualquer nova onda OpenCode com permissao de escrita, manter canario curto `OC-ATOMIC-TOOL-EXPOSURE-*` como preflight quando houver suspeita de drift: `permission.edit=deny` + `workspace-gates`, MCP `atomic-edit connected`, literal preview `changed=false`, auditoria `previewHonestyPass=true` e `currentTopologyCoverage=1`.
4. Rodar `VAL-PULSE-PERFECTNESS-SPLIT-001`, `ANAT-DIRTY-WORKTREE-001` e `VAL-CERT-GAP-MAP-001` quando o foco A/B liberar janela validatoria, cada um com handoff persistido.
5. Reexecutar `production-final --final --json` com trace explicito e budget de 15-20 minutos, ou splitar/instrumentar `scan:perfectness` por modulo antes de chamar isso de travamento; stdout 0 bytes sozinho nao e evidencia suficiente.
6. Proximo delta funcional: transformar uma prova de produto nomeada em N4+ ou registrar explicitamente por que permanece N3/pronto para validacao real.

## Regras Ativas

- Nao tocar arquivos protegidos sem aprovacao explicita.
- Nao editar `scripts/pulse/no-hardcoded-reality-audit.ts`.
- OpenCode workers devem ser interativos, com handoff persistido e revisao pelo orquestrador.
- "100%" so pode ser declarado quando Global Scope Tree inteira estiver em producao/monitorado com N4+ e zero foco ativo inconcluso.

## Delta 2026-05-17 08:31 - OpenCode A/B rounds 046-055

- Resposta operacional: ATOMIC ja venceu rounds de controle anteriores, mas ainda nao vence globalmente o NORMAL no tier competitivo atual.
- Rounds 046-051: invalidados por runners/artefatos antigos contaminando a rodada.
- Rounds 052-053: watchdog limpo, mas OpenCode/DeepSeek travou sem produzir diff.
- Round 054: invalidado; `cwd` sozinho nao isolava OpenCode, e read/MCP resolveram contra o checkout coordenador.
- Reparo de harness: `opencode-round-watchdog.cjs` agora passa `--dir <worktree>`.
- Round 055: valido. Ambos lanes passaram Jest `13/13`, backend typecheck, diff-check, protected diff vazio e scan de suppressions nos arquivos tocados.
- Round 055 NORMAL venceu economia operacional: `39` eventos vs `52`, `9` comandos vs `10`, `0` failed commands vs `1`, input `56,874` vs `58,417`, output `2,132` vs `2,828`, reasoning `1,099` vs `2,247`, service `712` vs `713` linhas.
- Round 055 ATOMIC venceu rastreabilidade/protecao: `expectedSha256` stale recusado antes de escrever, mutacoes por atomic tools, traces persistidos e trace isolation sem matching IDs.
- Derrotas atomicas convertidas em ferramenta:
  - `atomic-call.cjs`: paths relativos agora resolvem contra o worktree atual e escapadas continuam recusadas.
  - `atomic_add_import`: preserva estilo de aspas do arquivo.
  - `build.mjs`: copia `worker-scope-check.mjs` para `dist`, destravando smoke Part H.
- Validacao pos-lapida: `node scripts/mcp/atomic-edit/smoke.mjs` retornou `226 passed, 0 failed`; probe direta de quote style passou; `atomic-call.cjs code_outline` relativo dentro de worktree resolveu `repoRoot` para o worktree.
- Decisao: nao escalar complexidade. Repetir a mesma tarefa no round 056; ATOMIC precisa eliminar failed command, preservar quote style, manter traces e vencer/empatar economia operacional.

## Delta 2026-05-17 08:56 - OpenCode A/B round 056

- Round 056 repetiu exatamente a extracao bounded de `formatPromptValue` para `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Ambos lanes OpenCode finalizaram exit 0 sob watchdog e passaram validacao externa do coordenador: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions nos arquivos tocados.
- Resultado funcional: empate. Ambos tocaram apenas `backend/src/kloel/unified-agent.service.ts` e o novo helper; service final empatou em `712` linhas.
- Resultado operacional: NORMAL venceu. Eventos `31` vs `70`; comandos `5` vs `10`; input tokens `56,279` vs `57,578`; output `2,219` vs `3,606`; reasoning `470` vs `4,573`.
- Resultado de prova: ATOMIC venceu traceabilidade. `trace-isolation-check` retornou `ok=true`, `worktreeTraceCount=1`, `matchingTraceIds=[]`; auditor registrou `traceWinner=atomic`.
- Derrota nova formalizada: `atomicModeClean=false`. O lane ATOMIC usou `read` nativo 5 vezes e um shell hash read contra arquivo de codigo, logo ainda nao cumpriu "somente modo atomico".
- Causa objetiva adicional: o worktree ATOMIC foi criado de `HEAD` e nao recebeu a quote-style fix uncommitted do round 055; por isso precisou de cleanup atomico extra em import/blank gap.
- Ferramentas atualizadas:
  - `round-audit.cjs` agora conta native OpenCode file tools/shell code reads e publica `atomicModeClean`.
  - `round-audit.cjs` agora parseia `worktree_dot_atomic_traces`, `worktree_docs_ai_traces` e `trace_isolation_exit`.
  - `opencode-round-watchdog.cjs` agora sincroniza a toolchain `scripts/mcp/atomic-edit` atual do coordenador para o worktree ATOMIC antes de lancar o worker.
- Validacao pos-lapida: `node --check` em `round-audit.cjs` e `opencode-round-watchdog.cjs` passou; `round-audit` sobre round 056 passou e mostrou `atomicModeClean=false`; `git diff --check -- docs/ai/atomic-os-benchmark/tools/opencode-round-watchdog.cjs docs/ai/atomic-os-benchmark/tools/round-audit.cjs` passou.
- Decisao: nao escalar complexidade. Round 057 deve repetir a mesma tarefa, agora exigindo `atomicModeClean=true` alem dos gates funcionais, traces e economia operacional.

## Delta 2026-05-17 09:17 - OpenCode A/B round 057

- Resposta operacional atualizada: ATOMIC ja vence em rastreabilidade, isolamento e disciplina atomic-only, mas ainda nao vence globalmente o NORMAL no tier competitivo atual.
- Round 057 repetiu a extracao bounded de `formatPromptValue` para `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Ambos lanes passaram validacao externa: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions nos arquivos tocados.
- `atomicModeClean=true`: ATOMIC terminou com zero native file tool violations e zero shell code reads apos ajuste do auditor para nao classificar heredoc JSON como leitura de arquivo.
- NORMAL venceu economia principal: eventos `52` vs `55`, input tokens `53,679` vs `58,455`, reasoning tokens `951` vs `7,773`, service final `712` vs `713` linhas, menos failed commands.
- ATOMIC venceu trace/prova: trace isolation `ok=true`, `matchingTraceIds=[]`, `.atomic/traces=3`, output tokens `2,699` vs `3,071`, comandos shell `15` vs `16`.
- Derrotas atomicas convertidas em ferramenta:
  - `atomic-call.cjs` agora normaliza aliases `filePath -> file`, `specifier -> module`, `action -> op`.
  - `round-audit.cjs` nao conta `cat <<HEREDOC` de JSON como native shell read.
- Validacao pos-lapida:
  - `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: passou.
  - `node --check docs/ai/atomic-os-benchmark/tools/round-audit.cjs`: passou.
  - Probes em worktree ATOMIC: `code_file_stat` e `code_outline` com `filePath` passaram; `atomic_add_import` com `specifier` retornou `already-present`; `atomic_edit_symbol` com `action` chegou ao erro esperado de simbolo ausente, provando alias de schema.
- Incidente operacional: watchdog caiu por `ENOSPC`; 125 worktrees geradas antigas foram removidas com `git worktree remove --force`, preservando rounds 056/057, e o disco livre subiu de ~116Mi para ~34Gi.
- Decisao: nao escalar complexidade. Round 058 deve repetir a mesma tarefa; ATOMIC precisa manter `atomicModeClean=true`, reduzir failed commands a zero/paridade, eliminar a diferenca final de linha e vencer/empatar economia operacional.

## Delta 2026-05-17 09:34 - OpenCode A/B round 058

- Round 058 repetiu a mesma extracao bounded, mas foi rejeitado como prova de superioridade por timeout e explosao de escopo nos dois lanes.
- Ambos lanes passaram validacao externa: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions nos arquivos tocados.
- Ambos lanes deram `max_timeout` no watchdog e mexeram muito alem dos dois arquivos pretendidos.
- NORMAL: 6 arquivos Kloel tocados, service `195` linhas, source churn `628`, eventos `80`, comandos `11`, input `67,403`, output `4,003`, reasoning `9,550`.
- ATOMIC: 5 arquivos Kloel tocados, service `209` linhas, source churn `648`, eventos `78`, comandos `25`, input `55,818`, output `4,651`, reasoning `8,962`, traces `.atomic=13`.
- Placar real: `functionalPass=true`, mas `atomicModeClean=false`; `touchedFileWinner=atomic`, `sourceChurnWinner=normal`, `traceWinner=atomic`.
- Derrotas atomicas convertidas em ferramenta:
  - `round-audit.cjs` agora detecta shell reads em `docs/ai/atomic-os-benchmark/tools` e `scripts/mcp/atomic-edit`, alem de `backend/src/kloel`.
  - `round-audit.cjs` agora detecta pipeline `atomic-call.cjs ... | head/tail/sed/awk/nl`, porque pode mascarar exit code.
  - `round-audit.cjs` agora publica touched Kloel file count e source churn.
  - `atomic-call.cjs` agora faz aliases contextuais: `code_read_symbol specifier -> selector`; `atomic_add_import specifier -> module`; `atomic_add_import importName -> name`; `atomic_create_file` remove `expectedSha256` em chamadas de wrapper.
- Validacao pos-lapida:
  - `node --check` em `atomic-call.cjs` e `round-audit.cjs`: passou.
  - Probe `code_read_symbol` com `filePath` + `specifier`: passou.
  - Probe `atomic_add_import` com `importName` + `specifier`: chegou ao MCP e aplicou em worktree gerado.
  - Probe `atomic_create_file preview` com `expectedSha256` inadequado: preview passou sem escrever arquivo.
  - Probe `/dev/null`: continua recusado por escape de worktree.
- Decisao: nao escalar complexidade. Round 059 deve repetir a mesma tarefa com contrato mais estrito: exatamente dois arquivos fonte tocados, zero timeout, zero shell read/pipeline no ATOMIC, e economia operacional vencendo/empatando NORMAL.

## Delta 2026-05-17 09:52 - OpenCode A/B round 059

- Resposta operacional: ATOMIC venceu a maior parte dos benchmarks do tier atual, mas ainda nao venceu com margem total em tudo que importa.
- Round 059 repetiu a extracao bounded de `formatPromptValue` com contrato estrito de dois arquivos.
- Ambos lanes passaram validacao externa: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions nos arquivos tocados.
- Ambos tocaram exatamente `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- ATOMIC manteve `atomicModeClean=true`: zero native file tool, zero shell code read, zero pipeline mascarando `atomic-call`, trace isolation `ok=true`, `.atomic/traces=3`.
- ATOMIC venceu eventos `29` vs `53`, input `47,573` vs `54,501`, output `2,280` vs `2,482`, reasoning `1,598` vs `2,106`, source churn `26` vs `27` e trace/prova.
- NORMAL ainda venceu shell commands `9` vs `13` e service final por 1 linha (`712` vs `713`).
- Derrotas atomicas convertidas em ferramenta:
  - `atomic-call.cjs` agora tem modo `batch`, permitindo executar multiplas operacoes MCP em uma unica conexao/processo.

## Delta 2026-05-17 14:49 - OpenCode A/B round 079

- Round 079 repetiu a escalada rejeitada no Round 078: extrair `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` para `backend/src/kloel/unified-agent-runtime-context.helpers.ts`, agora com dependencia de instancia convertida em parametro explicito.
- Ambos lanes passaram o aceite focado da tarefa: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Ambos lanes tiveram backend typecheck exit `2` pelo mesmo ruido compartilhado de Google Ads/Prisma; os logs nao registraram erros `src/kloel`. O campo `functionalPass=false` do auditor e ruido global, nao falha funcional da rodada.
- ATOMIC venceu todas as metricas operacionais medidas: eventos `3` vs `98`, primeira acao `6.939ms` vs `22.533ms`, tempo total `56.641ms` vs `386.740ms`, comandos `1` vs `11`, failed commands `0` vs `1`, input `53.610` vs `67.401`, output `105` vs `5.601`, reasoning `98` vs `2.215`, service `701` vs `704`, helper `40` vs `49`, source churn `86` vs `100`, traces `12` vs `0`.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Ferramenta validada: `extract_class_methods_to_file` com `targetHeader`, `methodAdapter.signaturePrefixParam`, `bodyReplacements`, callsite replacements e `forbiddenTextChecks`.
- Decisao: nao escalar ainda; repetir a mesma classe no Round 080 para confirmar estabilidade e, se ATOMIC repetir zero perdas, escalar a complexidade.

## Delta 2026-05-17 15:02 - OpenCode A/B round 080

- Round 080 repetiu exatamente o tier de dependencia de instancia para confirmar a vitoria do Round 079.
- Ambos lanes passaram o aceite focado: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- O auditor foi corrigido para separar ruido de typecheck compartilhado: `functionalPass=true`, `taskFunctionalPass=true`, `globalFunctionalPass=false`, `sharedTypecheckNoiseOnly=true`, `typecheckKloelErrorCount=0` nos dois lanes.
- ATOMIC repetiu zero perdas medidas: eventos `3` vs `92`, primeira acao `6.122ms` vs `21.380ms`, tempo total `58.938ms` vs `380.512ms`, comandos `1` vs `13`, failed commands `0` vs `1`, input `53.587` vs `82.302`, output `168` vs `5.419`, reasoning `129` vs `3.380`, service `701` vs `704`, helper `40` vs `49`, source churn `86` vs `100`, traces `12` vs `0`.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Decisao: o tier esta fechado. Escalar no Round 081 para extracao mista de cinco metodos (`actionSucceeded`, `num`, `buildAgentRuntimeContext`, `recordAgentRuntimeTurn`, `buildAgentToolEnvelope`) com per-method adapters.

## Delta 2026-05-17 15:16 - OpenCode A/B round 081

- Round 081 escalou a complexidade para extracao mista de cinco metodos: `actionSucceeded`, `num`, `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope`.
- Ambos lanes passaram o aceite focado: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Auditor: `functionalPass=true`, `taskFunctionalPass=true`, `globalFunctionalPass=false`, `sharedTypecheckNoiseOnly=true`; typecheck global segue ruidoso fora do escopo.
- ATOMIC venceu todas as metricas operacionais medidas: eventos `3` vs `100`, primeira acao `5.386ms` vs `17.360ms`, tempo total `60.741ms` vs `371.223ms`, comandos `1` vs `13`, failed commands `0` vs `5`, input `54.405` vs `82.722`, output `101` vs `5.798`, reasoning `285` vs `2.071`, service `690` vs `693`, source churn `116` vs `134`, traces `19` vs `0`.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Decisao: repetir o tier misto no Round 082 para confirmar estabilidade; se repetir zero perdas medidas, escalar depois para decomposicao controlada de parte do router.

## Delta 2026-05-17 15:28 - OpenCode A/B round 082

- Round 082 repetiu o tier misto single-target para confirmar estabilidade.
- Ambos lanes passaram o aceite focado: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Auditor: `functionalPass=true`, `taskFunctionalPass=true`, `globalFunctionalPass=false`, `sharedTypecheckNoiseOnly=true`; typecheck global segue ruidoso fora do escopo.
- ATOMIC repetiu zero perdas medidas: eventos `3` vs `99`, primeira acao `4.909ms` vs `19.520ms`, tempo total `61.403ms` vs `442.439ms`, comandos `1` vs `13`, failed commands `0` vs `1`, input `54.377` vs `74.125`, output `112` vs `5.902`, reasoning `296` vs `3.282`, service `690` vs `692`, source churn `116` vs `132`, traces `19` vs `0`.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Decisao: fechar o tier misto single-target e escalar no Round 083 para multi-modulo: metodos puros e metodos runtime devem ir para helpers distintos.

## Delta 2026-05-17 15:49 - OpenCode A/B round 083

- Round 083 escalou para extracao multi-modulo: `actionSucceeded` e `num` em `unified-agent-action.helpers.ts`; `buildAgentRuntimeContext`, `recordAgentRuntimeTurn` e `buildAgentToolEnvelope` em `unified-agent-runtime-context.helpers.ts`.
- Ambos lanes passaram o aceite focado: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Auditor: `functionalPass=true`, `taskFunctionalPass=true`, `globalFunctionalPass=false`, `sharedTypecheckNoiseOnly=true`; typecheck global segue ruidoso fora do escopo.
- ATOMIC venceu quase todas as metricas operacionais: eventos `3` vs `188`, primeira acao `5.222ms` vs `22.469ms`, tempo total `68.738ms` vs `857.071ms`, comandos `1` vs `25`, failed commands `0` vs `3`, input `54.959` vs `75.502`, output `185` vs `11.080`, reasoning `386` vs `9.250`, source churn `118` vs `136`, traces `22` vs `0`.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- NORMAL venceu apenas service line count por uma linha (`688` vs `689`).
- Derrota convertida em ferramenta: `extract_class_methods_to_file` agora compacta o gap terminal de quatro quebras antes do `}` final da classe; probe descartavel da mesma sequencia multi-modulo retornou service `688` linhas e validacao focada embutida verde.
- Decisao: nao escalar ainda. Round 084 deve repetir exatamente o tier multi-modulo; ATOMIC precisa empatar ou vencer service line count mantendo a margem operacional ampla.

## Delta 2026-05-17 16:07 - OpenCode A/B round 084

- Round 084 repetiu o tier multi-modulo apos a lapida de gap terminal.
- Ambos lanes passaram o aceite focado: Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Auditor: `functionalPass=true`, `taskFunctionalPass=true`, `globalFunctionalPass=false`, `sharedTypecheckNoiseOnly=true`; typecheck global segue ruidoso fora do escopo.
- ATOMIC fechou zero-loss: eventos `3` vs `107`, primeira acao `5.203ms` vs `20.598ms`, tempo total `60.055ms` vs `499.020ms`, comandos `1` vs `13`, input `55.031` vs `85.304`, output `106` vs `6.181`, reasoning `243` vs `4.888`, service `688` vs `692`, source churn `119` vs `132`, traces `22` vs `0`.
- Empates: failed commands `0` vs `0`, touched Kloel files `3` vs `3` e protected diff vazio nos dois.
- `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline e zero worktree escape.
- Decisao: fechar o tier multi-modulo. Proximo delta deve escalar um degrau para decomposicao parcial controlada maior que Round084, mas ainda menor que o router completo.

## Delta 2026-05-17 16:35 - OpenCode A/B round 085

- Round 085 escalou um degrau bounded: extrair apenas `executeToolAction` para `unified-agent-tool-router.helpers.ts`, preservando `num` e `buildAgentToolEnvelope` no service.
- Ambos lanes passaram Jest focado `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan e removeram o private `executeToolAction`; typecheck global seguiu vermelho apenas por Google Ads/Prisma fora de `src/kloel`.
- NORMAL foi rejeitado como entrega equivalente: service caiu para `568` linhas, mas isso ocorreu porque tambem removeu `num` e `buildAgentToolEnvelope`, fora da intencao.
- ATOMIC preservou escopo e venceu as metricas relevantes: eventos `3` vs `136`, primeira acao `5.006ms` vs `20.699ms`, tempo total `53.732ms` vs `704.773ms`, comandos `1` vs `16`, failed commands `0` vs `5`, input/output/reasoning `52.895/180/173` vs `81.616/9.885/6.869`, total Kloel lines `792` vs `801`, source churn `445` vs `492`, traces `7` vs `0`.
- Auditor atualizado: `round-audit.cjs` agora mede `totalKloelLines`, `toolRouterHelperLines`, `scopePreservationPass` e `scopePreservationWinner`; `validationPass` considera scope preservation quando o log fornece esse marcador.
- Decisao: nao escalar ainda. Round 086 deve repetir a mesma dificuldade com gate explicito de preservar `num` e `buildAgentToolEnvelope`; escalar apenas se ATOMIC repetir vitoria ampla sem derrota material.

## Delta 2026-05-17 17:05 - OpenCode A/B round 086

- Round 086 repetiu o router bounded com scope-preservation gate explicito; ambos lanes passaram Jest `13/13`, diff-check, protected diff, suppression scan, helper no-`this.`, private-method scan e preservaram `private num`/`private buildAgentToolEnvelope`.
- Typecheck global continuou vermelho apenas por Google Ads/Prisma fora de `src/kloel`.
- ATOMIC venceu eventos `3` vs `112`, primeira acao `5.221ms` vs `31.586ms`, tempo total `65.755ms` vs `748.290ms`, comandos `1` vs `13`, input/output/reasoning `53.003/126/455` vs `68.965/9.492/7.449`, total Kloel lines `792` vs `847`, source churn `445` vs `498`, traces `7` vs `0` e `atomicModeClean=true`.
- NORMAL venceu apenas `serviceLines` (`565` vs `584`) com o shape `toolRouterDeps()`.
- Ferramentas atualizadas: `atomic-call.cjs` adicionou `requiredTextChecks`; `extract_class_methods_to_file` adicionou `postRemovalReplacements`.
- Probe descartavel de dependency-builder atomico passou Jest `13/13`, preservou helpers e reduziu ATOMIC para `570` service lines / `791` total lines; ainda precisa compactar o callsite predecided para vencer `serviceLines`.
- Decisao: nao escalar. Round 087 deve repetir a mesma tarefa usando dependency-builder + callsite predecided compacto; objetivo e zerar a ultima vitoria do NORMAL.
- Validacao pos-lapida:
  - `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: passou.
  - `atomic-call.cjs batch` com `code_outline` + `code_read_symbol`: passou.
- Decisao: nao escalar complexidade ainda. Round 060 deve repetir a mesma tarefa usando `batch`; ATOMIC precisa vencer/empatar comandos shell e preservar as vitorias em tokens, eventos, trace, source churn e disciplina atomica.

## Delta 2026-05-17 10:00 - OpenCode A/B round 060

- Round 060 repetiu a mesma extracao bounded exigindo `atomic-call.cjs batch`.
- NORMAL completou exit 0, tocou dois arquivos e passou validacao externa: Jest `13/13`, backend typecheck, diff-check, protected diff vazio.
- ATOMIC executou o batch inicial de leitura com sucesso, mas ficou ocioso e foi encerrado pelo watchdog com `SIGTERM`; nao mutou codigo.
- Auditoria: `functionalPass=false`, `atomicModeClean=true` apenas porque nao houve mutacao/violacao, `traceCount=0`.
- Decisao: rodada rejeitada; nao escalar complexidade.
- Derrota atomica convertida em ferramenta:
  - `atomic-call.cjs batch` agora tenta `JSON.parse` em cada output de ferramenta e imprime objeto JSON parseado quando aplicavel, reduzindo carga cognitiva do agente.
- Validacao pos-lapida:
  - `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: passou.
  - `atomic-call.cjs batch` com `code_file_stat`: passou e retornou objeto parseado.
- Proxima acao: Round 061 repete a mesma tarefa com batch parseado e workflow explicito inspect -> mutate -> validate.

## Delta 2026-05-17 10:13 - OpenCode A/B round 061

- Round 061 repetiu a mesma extracao bounded usando o operador alto nivel `extract_symbol_to_file`.
- Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions limpo.
- ATOMIC manteve `atomicModeClean=true` e trace isolation `ok=true`, `.atomic/traces=3`, `matchingTraceIds=[]`.
- ATOMIC venceu eventos `27` vs `40`, input `47,625` vs `53,095`, output `1,386` vs `2,608`, source churn `26` vs `27` e trace/prova.
- NORMAL ainda venceu shell commands `7` vs `10`, reasoning `626` vs `1,487` e service final por 1 linha (`712` vs `713`).
- Diagnostico da derrota atomica: o operador alto nivel funcionou, mas o worker fez preflights desnecessarios (`git status`, `ls`) e gerou failed command evitavel antes da mutacao.
- Decisao: nao escalar complexidade ainda. Round 062 deve repetir a mesma tarefa com prompt ATOMIC ultracurto; primeira acao obrigatoria e `extract_symbol_to_file`, sem preflight/exploracao.

## Delta 2026-05-17 10:20 - OpenCode A/B round 062

- Round 062 repetiu a mesma extracao bounded com prompt ATOMIC ultracurto e `extract_symbol_to_file` como primeira acao.
- Ambos lanes completaram exit 0 e passaram validacao externa: Jest `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions limpo.
- ATOMIC manteve `atomicModeClean=true` e trace isolation `ok=true`, `.atomic/traces=3`.
- ATOMIC venceu eventos `15` vs `61`, shell commands `6` vs `8`, input `46,622` vs `53,476`, output `939` vs `2,469`, reasoning `549` vs `910`, source churn `26` vs `27` e trace/prova.
- NORMAL venceu somente service line count por 1 linha (`712` vs `713`).
- Derrota atomica convertida em ferramenta:
  - `extract_symbol_to_file` agora compacta o gap pos-remocao de simbolo (`\\n\\n\\n/**` -> `\\n\\n/**`).
  - Probe descartavel confirmou `extract_exit=0`, `service_lines=712`, `diff_numstat 1/26`.
- Decisao: nao escalar complexidade ainda. Round 063 deve repetir a mesma tarefa para confirmar zero derrotas mensuraveis no tier atual.

## Delta 2026-05-17 10:34 - OpenCode A/B round 063

- Resposta operacional atual: ATOMIC ja vence NORMAL no tier atual sem nenhuma derrota medida, mas ainda nao tem margem esmagadora em todos os eixos para escalar complexidade.
- Round 063 repetiu a extracao bounded de `formatPromptValue` apos a lapida de compactacao de gap.
- Ambos lanes completaram exit 0 e passaram validacao externa: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions limpo.
- ATOMIC manteve `atomicModeClean=true`, zero native file tool, zero shell code read, trace isolation `ok=true`, `.atomic/traces=4`, `matchingTraceIds=[]`.
- ATOMIC venceu eventos `14` vs `34`, shell commands `6` vs `7`, input `47,555` vs `51,856`, output `897` vs `2,131`, reasoning `441` vs `737` e trace/prova.
- ATOMIC empatou service line count `712` vs `712`, touched files `2` vs `2` e source churn `27` vs `27`; zero derrotas medidas restantes neste tier.
- Derrota/margem insuficiente convertida em ferramenta:
  - `extract_symbol_to_file` agora aceita validacao embutida do perfil `kloel-unified-agent-extract`, cobrindo Jest focado, backend typecheck, diff-check, diff protegido e scan de suppressions.
  - Probe descartavel em worktree retornou `ok=true`, todas as validacoes verdes, service `712` linhas e `diff_numstat 1/26`.
- Decisao: nao escalar complexidade ainda. Round 064 deve repetir o mesmo tier com validacao embutida para buscar margem maior em comandos/eventos sem reduzir prova externa independente.

## Delta 2026-05-17 10:43 - OpenCode A/B round 064

- Round 064 repetiu a extracao bounded com validacao embutida dentro de `extract_symbol_to_file`.
- Ambos lanes completaram exit 0 e passaram validacao externa independente: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions limpo.
- ATOMIC manteve `atomicModeClean=true`, zero native file tool, zero shell code read, trace isolation `ok=true`, `.atomic/traces=4`, `matchingTraceIds=[]`.
- ATOMIC venceu eventos `6` vs `27`, shell commands `1` vs `5`, input `47,626` vs `50,700`, output `440` vs `1,779`, reasoning `207` vs `795` e trace/prova.
- ATOMIC empatou service line count `712` vs `712`, touched files `2` vs `2` e source churn `27` vs `27`; perdeu nada.
- Conclusao do tier: complexidade atual fechada para escalada; a unica vitoria nao dramaticamente larga foi input tokens, por baseline fixo de contexto/modelo, mas segue vitoria atomica.
- Proxima acao: escalar um degrau de complexidade mantendo A/B real, worktrees isolados, validacao externa, trace isolation, zero protegidos e formalizacao de qualquer nova derrota atomica.

## Delta 2026-05-17 10:53 - OpenCode A/B round 065

- Round 065 escalou complexidade para extracao dupla: `isAllowedTool` + `formatPromptValue`.
- Ambos lanes completaram exit 0 e passaram validacao externa: Jest focado `13/13`, backend typecheck, `git diff --check`, protected diff vazio e scan de suppressions limpo.
- ATOMIC manteve `atomicModeClean=true`, zero native file tool, zero shell code read, trace isolation `ok=true`, `.atomic/traces=6`, `matchingTraceIds=[]`.
- ATOMIC venceu eventos `6` vs `24`, shell commands `1` vs `5`, input `49,939` vs `50,893`, output `399` vs `1,761`, reasoning `229` vs `418`, source churn `30` vs `31` e trace/prova.
- NORMAL venceu service line count por 1 linha (`708` vs `709`), por uma linha em branco residual entre `UnknownRecord` e a constante do provider.
- Derrota atomica convertida em ferramenta:
  - `extract_symbols_to_file` agora compacta tambem `\\n\\n\\nconst ` para `\\n\\nconst `.
  - Probe descartavel retornou `ok=true`, todas as validacoes verdes, service `708` linhas, helper `29` linhas.
- Decisao: nao escalar complexidade; round 066 repete o mesmo tier de extracao dupla ate remover a derrota de service line count preservando as vitorias operacionais.

## Delta 2026-05-17 11:05 - OpenCode A/B round 066

- Round 066 repetiu a extracao dupla apos compactacao de gap, mas foi rejeitado como vitoria limpa.
- Ambos lanes produziram o shape correto e passaram Jest focado, diff-check, protected diff e scan de suppressions; o backend typecheck falhou nos dois por Prisma Client compartilhado stale contra o schema atual.
- ATOMIC manteve `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=7`, service `708` e helper `29`, mas a primeira chamada foi encerrada por timeout OpenCode durante validacao embutida apos a mutacao ja ter concluido.
- Derrotas atomicas formalizadas: operador nao era idempotente sobre sucesso parcial e a validacao global era ruidosa quando Prisma Client local estava stale.
- Ferramentas atualizadas: `extract_symbols_to_file` aceita retry idempotente quando os simbolos ja estao no helper e o source ja importa o helper; `npm --prefix backend run prisma:generate` refrescou o Prisma Client local usado pelos worktrees.
- Decisao: nao escalar; repetir o mesmo tier no round 067.

## Delta 2026-05-17 11:18 - OpenCode A/B round 067

- Round 067 repetiu a extracao dupla apos o reparo de idempotencia.
- Ambos lanes passaram validacao externa completa: Jest `13/13`, backend typecheck, `git diff --check`, protected diff e scan de suppressions; ATOMIC tambem passou trace isolation.
- ATOMIC venceu eventos `10` vs `44`, comandos `2` vs `7`, input `51,207` vs `52,311`, output `619` vs `2,344`, reasoning `1,060` vs `2,456`, trace e disciplina `atomicModeClean=true`.
- NORMAL venceu failed commands `0` vs `1`; codigo final empatou em service `708`, helper `29`, touched files `2` e source churn `31`.
- Derrota atomica formalizada: OpenCode shell-escapou o JSON como `{\\\"...`, gerando falha de `JSON.parse` antes do retry bem-sucedido.
- Ferramentas atualizadas: `atomic-call.cjs` parseia JSON normal e JSON shell-escaped do OpenCode; `round-audit.cjs` mede failed commands e ignora scans `rg` sem match esperados.
- Decisao: nao escalar; round 068 deve exigir zero failed commands.

## Delta 2026-05-17 11:25 - OpenCode A/B round 068

- Round 068 fechou o tier de extracao dupla como vitoria limpa do ATOMIC.
- Ambos lanes passaram Jest `13/13`, backend typecheck, `git diff --check`, protected diff e scan de suppressions; ATOMIC tambem passou trace isolation.
- ATOMIC manteve `atomicModeClean=true`, zero native file tools, zero shell code reads, zero masked pipelines e zero failed commands.
- ATOMIC venceu eventos `6` vs `42`, comandos `1` vs `7`, input `51,002` vs `55,832`, output `395` vs `2,175`, reasoning `194` vs `843` e trace (`.atomic/traces=7`, isolation `ok=true`).
- Empates: failed commands `0` vs `0`, service `708` vs `708`, helper `29` vs `29`, touched files `2` vs `2`, source churn `31` vs `31`.
- Derrotas atomicas formalizadas: nenhuma medida neste tier.
- Decisao: escalar complexidade no proximo round para macro-refactor mais dificil, preferencialmente extracao de metodos de classe para helper externo.

## Delta 2026-05-17 11:50 - OpenCode A/B round 069

- Round 069 escalou para extracao de metodos privados de classe (`actionSucceeded` + `num`) e rejeitou a vitoria atomica.
- Ambos lanes passaram Jest focado `13/13`, diff-check, protected diff, suppression scan e trace isolation; backend typecheck falhou nos dois por ruido externo compartilhado de Google Ads/Prisma Client.
- NORMAL venceu eventos `36` vs `79`, comandos `6` vs `22`, failed commands `1` vs `3`, input `52,794` vs `68,004`, output `1,886` vs `4,990`, reasoning `764` vs `9,027`, service line count `725` vs `727` e acabamento.
- ATOMIC venceu apenas source churn `30` vs `32` e trace (`.atomic/traces=8`, isolation `ok=true`).
- Derrotas atomicas formalizadas: bare path sem JSON em `code_outline`; `extract_symbols_to_file` nao converteu metodo de classe para funcao top-level; fallback com `cat`/JSON temporario; indentacao/gap final pior que Normal.
- Decisao: nao escalar. Atualizar Atomic OS com operador macro `extract_class_methods_to_file`, validacao dinamica e prompt minimo, depois repetir o mesmo tier no round 070.

## Delta 2026-05-17 14:10 - OpenCode A/B round 077

- Resposta operacional atual: ATOMIC venceu o tier de extracao de metodos de classe com margem ampla e sem derrota medida; pode escalar um degrau de complexidade na proxima rodada.
- Round 077 repetiu a tarefa de extrair `UnifiedAgentService.actionSucceeded` e `UnifiedAgentService.num` para `backend/src/kloel/unified-agent-action.helpers.ts`.
- Mudanca Atomic OS testada: watchdog com `--atomic-command-mode preprompt-shell`, usando comando OpenCode customizado para executar a macro atomica antes do turno normal de raciocinio.
- ATOMIC completou exit `0`; NORMAL atingiu `max_timeout` do watchdog apos ~600s, embora tenha produzido shape validavel.
- Ambos lanes passaram Jest focado `13/13`, `git diff --check`, protected diff vazio, suppression scan e trace isolation; backend typecheck continuou falhando nos dois por ruido externo compartilhado `google-ads-*`/Prisma fora de `src/kloel/**`.
- ATOMIC manteve `atomicModeClean=true`: zero native file tools, zero shell source reads, zero masked pipeline, zero worktree escape, `.atomic/traces=10`.
- ATOMIC venceu eventos `3` vs `100`, primeira acao `6.103ms` vs `20.774ms`, tempo total `57.247ms` vs `577.539ms`, comandos `1` vs `14`, failed commands `0` vs `1`, input `53.003` vs `73.285`, output `91` vs `4.376`, reasoning `114` vs `1.522` e trace.
- Empates: touched Kloel files `2` vs `2`, source churn `32` vs `32`, service `725` vs `725`, helper `12` vs `12`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-077/audit.json`, `docs/ai/atomic-os-benchmark/round-077/verdict.md`, logs externos do round e handoffs `AB-NORMAL-077`/`AB-ATOMIC-077`.
- Decisao: fechar este tier para escalada controlada. Proxima acao e escolher tarefa mais complexa mantendo os mesmos gates, dois workers OpenCode isolados e formalizacao de qualquer derrota atomica antes de nova escalada.

## Delta 2026-05-17 14:31 - OpenCode A/B round 078

- Resposta operacional atual: ATOMIC ainda nao esta vencendo a nova complexidade. Ele venceu velocidade/superficie, mas perdeu o aceite funcional por mover metodos de classe dependentes de `this.agentRuntime` sem transformar a dependencia em parametro explicito.
- Round 078 escalou para extrair `UnifiedAgentService.buildAgentRuntimeContext`, `UnifiedAgentService.recordAgentRuntimeTurn` e `UnifiedAgentService.buildAgentToolEnvelope` para `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- NORMAL passou o aceite funcional: Jest focado `13/13`, helper sem `this.`, private methods removidos, diff-check/protected/suppression limpos.
- ATOMIC falhou o aceite: Jest focado `8 failed, 5 passed`, helper ainda continha `this.agentRuntime`, e typecheck registrou erros Kloel `TS2554` nos callsites convertidos.
- ATOMIC venceu metricas brutas: eventos `3` vs `78`, primeira acao `7.489ms` vs `21.466ms`, tempo total `69.403ms` vs `542.501ms`, comandos `1` vs `10`, input `53.726` vs `86.312`, output `103` vs `4.914`, reasoning `230` vs `6.747`, traces `12` vs `0` e source churn `84` vs `100`.
- NORMAL venceu o round porque comportamento validado vence economia bruta quando a entrega atomica quebra.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-078/audit.json`, `docs/ai/atomic-os-benchmark/round-078/verdict.md`, logs externos do round e handoffs `AB-NORMAL-078`/`AB-ATOMIC-078`.
- Decisao: nao escalar. Atualizar `extract_class_methods_to_file` com adaptador de dependencia explicita (`targetHeader`, parametro de assinatura e substituicao `this.agentRuntime -> agentRuntime`) e repetir exatamente o mesmo tier no Round 079.

## Delta 2026-05-17 18:42 - OpenCode A/B round 091

- Resposta operacional atual: ATOMIC corrigiu a derrota semantica do Round 090 (`typecheckKloelErrors=0`), mas ainda nao fechou o tier porque o lint focado falhou por formatacao de import apos cleanup.
- Round 091 repetiu a mesma extracao de `executeToolAction`, `num`, `buildAgentToolEnvelope` e `actionSucceeded`.
- NORMAL entrou em `idle_timeout` sem mutar `backend/src/kloel/**`; helper ausente e private methods ainda presentes.
- ATOMIC completou, gerou helper externo, removeu os private methods, preservou `buildAgentRuntimeContext`/`recordAgentRuntimeTurn`, passou Jest `13/13`, scans estruturais, protected diff, suppression scan e typecheck Kloel zero.
- Backend typecheck global segue com ruido compartilhado Google Ads/Prisma fora do escopo.
- Auditor corrigido: `round-audit.cjs` agora mede lane status/completion, tempo efetivo sob timeout e inclui lint em `taskFunctionalPass`.
- Ferramenta corrigida: `atomic-call.cjs` agora aplica `atomic_apply_eslint_dry_run_fixes` layout-only apos fallback `atomic_remove_import`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-091/audit.json`, `docs/ai/atomic-os-benchmark/round-091/verdict.md`, logs externos e handoffs `AB-NORMAL-091`/`AB-ATOMIC-091`.
- Decisao: nao escalar. Round 092 deve repetir exatamente a mesma tarefa e exigir ATOMIC `lintStatus=0`, `typecheckKloelErrors=0`, `atomicModeClean=true` e vantagem operacional preservada.

## Delta 2026-05-17 18:55 - OpenCode A/B round 092

- Resposta operacional atual: ATOMIC corrigiu o import formatting, mas ainda nao fechou o tier porque o lint focado encontrou 1 residuo preexistente no `JSON.parse` de `toolArgs`.
- NORMAL voltou a `idle_timeout` sem mutar `backend/src/kloel/**`.
- ATOMIC completou, passou Jest `13/13`, scans estruturais, protected diff, suppression scan e `typecheckKloelErrors=0`; backend typecheck global segue ruidoso por Google Ads/Prisma compartilhado.
- Lint focado do ATOMIC: `lintStatus=1`, erro unico `@typescript-eslint/no-unsafe-assignment` em `toolArgs = JSON.parse(...)`.
- Ferramenta atualizada: `extract_class_methods_to_file` agora aceita `postLintReplacements` e roda segunda transacao layout-only apos esses reparos.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-092/audit.json`, `docs/ai/atomic-os-benchmark/round-092/verdict.md`, logs externos e handoffs `AB-NORMAL-092`/`AB-ATOMIC-092`.
- Decisao: nao escalar. Round 093 deve repetir a mesma tarefa usando `postLintReplacements` para parse seguro de `toolArgs` e exigir lint focado verde.

## Delta 2026-05-17 22:49 - OpenCode A/B round 103

- Resposta operacional atual: ATOMIC venceu funcionalmente e operacionalmente,
  mas ainda nao venceu todas as metricas medidas com margem suficiente para
  escalar.
- Round 103 repetiu a dificuldade Round 100/101/102 usando
  `dependencyContainer.style = "constructorProperty"`.
- NORMAL atingiu `max_timeout`; validacao externa tardia passou Jest `13/13`,
  mas falhou focused ESLint com 6 erros. Touched typecheck errors `0`.
- ATOMIC completou, preprompt exit `0`, passou Jest `13/13`, focused ESLint,
  diff-check, protected diff, suppression scan, helper no-`this.`, structural
  scans e touched typecheck errors `0`.
- Typecheck global segue vermelho nos dois lanes por ruido compartilhado Google
  Ads/Prisma fora de `src/kloel/**`.
- ATOMIC venceu completion, task-functional pass, eventos `3` vs `80`,
  primeira acao `6.509s` vs `25.598s`, agent time `216.449s` vs `900.845s`,
  comandos `1` vs `4`, failed commands `0` vs `2`, input/output/reasoning
  `66.086/249/119` vs `80.332/9.741/12.106`, native tool violations `0` vs
  `20`, traces `40` vs `0`, helper `297` vs `306` e total Kloel lines `787`
  vs `792`.
- NORMAL venceu service lines `486` vs `490` e source churn `619` vs `620`,
  mas sem entrega aceita por lint/time-out.
- Ferramenta atualizada: `round-audit.cjs` agora deixa
  `forbiddenAtomicCommands` lane-aware, evitando falso positivo quando o lane
  ATOMIC usa preprompt-shell para compilar JSON e chamar `atomic-call.cjs`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-103/audit.json`,
  `docs/ai/atomic-os-benchmark/round-103/verdict.md`, logs externos e handoffs
  `AB-NORMAL-103`/`AB-ATOMIC-103`.
- Decisao: nao escalar. Round 104 deve repetir a mesma tarefa e tentar recuperar
  service-line/churn sem copiar o residuo inseguro do NORMAL.

## Delta 2026-05-17 23:04 - OpenCode A/B round 104

- Round 104 repetiu a mesma dificuldade com dois workers OpenCode simultaneos e
  testou a politica atomica compacta `routerDeps` getter.
- NORMAL atingiu `idle_timeout` sem diff Kloel aceito; helper ausente, private
  methods e funcoes top-level ainda presentes. Focused Jest passou contra fonte
  intacta, focused ESLint falhou, touched typecheck errors `0`.
- ATOMIC completou, preprompt exit `0`, passou focused Jest `13/13`, focused
  ESLint, diff-check, protected diff, suppression scan, helper no-`this.`,
  structural scans e touched typecheck errors `0`.
- ATOMIC venceu entrega funcional, eventos `3` vs `7`, primeira acao `6.539s`
  vs `26.166s`, agent time `195.667s` vs `216.204s`, output tokens `75` vs
  `324`, native file tools `0` vs `1`, traces `39` vs `0` e
  `atomicModeClean=true`.
- NORMAL venceu apenas no-op metrics (`0` comandos, input/reasoning menores,
  churn `0` por nao mutar); nao e baseline de shape.
- Derrota atomica real: `routerDeps` getter piorou o shape versus Round 103:
  service/helper/total `491/297/788` contra `490/297/787`; source churn `619`
  ainda nao resolve a perda anterior.
- Decisao: rejeitar o getter `routerDeps` como solucao de compactacao, registrar
  em Decision Graveyard, nao escalar. Round 105 deve repetir com a seguranca de
  parse de `toolArgs` movida para helper/header ou politica compacta equivalente.

## Delta 2026-05-18 02:40 - OpenCode A/B round 105

- Round 105 repetiu a mesma dificuldade com dois workers OpenCode simultaneos e
  testou parse seguro de `toolArgs` movido para helper/header, voltando ao
  `constructorProperty` dependency container.
- NORMAL atingiu `max_timeout`; produziu helper parcial, passou focused Jest
  `13/13`, mas falhou focused ESLint com 6 erros. Touched typecheck errors `0`.
- ATOMIC completou a lane e manteve `atomicModeClean=true`, native file tool
  violations `0` e traces `28`, mas `opencode-atomic-preprompt-exit.txt` foi
  `1` e a validacao externa falhou.
- Falha ATOMIC dominante: focused Jest `12/13`, focused ESLint vermelho e
  touched Kloel typecheck errors `4` porque `parseToolArgs` foi usado no service
  antes de ser importado (`ReferenceError: parseToolArgs is not defined`).
- ATOMIC venceu superficie operacional: eventos `2` vs `111`, primeira acao
  `8.924s` vs `24.233s`, tempo total `120.211s` vs `900.823s`,
  input/output/reasoning `56.514/0/318` vs `87.685/11.011/11.594`, total Kloel
  lines `784` vs `798`, source churn `567` vs `627`, traces `28` vs `0`.
- NORMAL venceu comportamento focado, touched typecheck e service lines, mas nao
  pode ser aceito por timeout/lint vermelho.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-105/audit.json`,
  `docs/ai/atomic-os-benchmark/round-105/verdict.md`, logs externos e handoffs
  `AB-NORMAL-105`/`AB-ATOMIC-105`.
- Decisao: rejeitar ambos; nao escalar. Round 106 deve repetir o mesmo tier com
  sequenciamento dependency-aware: extrair classe primeiro, depois adicionar e
  importar `parseToolArgs`, depois substituir o parse inline e validar.

## Delta 2026-05-18 02:58 - OpenCode A/B round 106

- Round 106 repetiu a mesma dificuldade e corrigiu a falha do Round 105: a
  politica atomica extraiu primeiro, adicionou/importou `parseToolArgs`, depois
  substituiu o parse inline por
  `parseToolArgs(this.logger, toolName, toolCall.function.arguments)`.
- NORMAL atingiu `max_timeout`, mas entregou baseline funcional: focused Jest
  `13/13`, focused ESLint `0`, touched typecheck errors `0`, helper sem `this.`,
  scans estruturais e parser helper presentes.
- ATOMIC completou, `opencode-atomic-preprompt-exit.txt=0`,
  `atomicModeClean=true`, focused Jest `13/13`, focused ESLint `0`, touched
  typecheck errors `0`, protected diff vazio e traces `41`.
- ATOMIC venceu todas as metricas dominantes: eventos `3` vs `128`, primeira
  acao `6.155s` vs `26.279s`, tempo total `178.958s` vs `900.800s`, comandos
  `1` vs `8`, failed commands `0` vs `2`, input/output/reasoning
  `69.365/114/387` vs `82.932/11.916/10.381`, service lines `482` vs `512`,
  total Kloel lines `795` vs `820`, source churn `638` vs `667`, traces `41`
  vs `0`, native file tool violations `0` vs `34`.
- NORMAL venceu somente helper lines `308` vs `313`, mas perdeu total product
  lines por 25.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-106/audit.json`,
  `docs/ai/atomic-os-benchmark/round-106/verdict.md`, logs externos e handoffs
  `AB-NORMAL-106`/`AB-ATOMIC-106`.
- Decisao: aceitar Round 106 como vitoria forte do ATOMIC, mas nao escalar
  ainda por vir logo apos Round 105 rejeitado. Round 107 deve repetir o mesmo
  tier; se ATOMIC repetir zero perdas relevantes, escalar um degrau controlado.

## Delta 2026-05-18 03:24 - OpenCode A/B round 107

- Round 107 repetiu exatamente o tier do Round 106 para confirmar estabilidade
  antes de escalar complexidade.
- NORMAL atingiu `max_timeout` e foi rejeitado como baseline funcional:
  focused Jest `9/13`, focused ESLint `11` erros, touched Kloel typecheck
  errors `3` e falha runtime dominante `ReferenceError: num is not defined`.
- ATOMIC completou com `opencode-atomic-preprompt-exit.txt=0`, passou focused
  Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`,
  protected diff vazio, parser/helper scans e `atomicModeClean=true`.
- ATOMIC venceu todas as metricas dominantes medidas: task-functional pass,
  eventos `3` vs `116`, primeira acao `6.562s` vs `24.056s`, agent time
  `187.646s` vs `900.811s`, input/output/reasoning
  `69.369/146/156` vs `85.498/10.510/13.335`, native violations `0` vs `36`,
  traces `41` vs `0`, service lines `482` vs `515`, total Kloel lines `795`
  vs `820` e source churn `638` vs `661`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-107/audit.json`,
  `docs/ai/atomic-os-benchmark/round-107/verdict.md`, logs externos e handoffs
  `AB-NORMAL-107`/`AB-ATOMIC-107`.
- Decisao: aceitar Round 107 como confirmacao de estabilidade local do tier
  Round 106/107. Escalar um degrau controlado no Round 108, sem aumentar
  contagem de workers.

## Delta 2026-05-18 03:42 - OpenCode A/B round 108

- Round 108 escalou um degrau controlado: split multi-modulo do cluster
  `UnifiedAgentService` em `unified-agent-tool-router.helpers.ts` e
  `unified-agent-runtime.helpers.ts`.
- NORMAL atingiu `idle_timeout`, criou helper files, mas nao concluiu wiring no
  service. Private scan falhou com os seis metodos privados ainda presentes e
  top-level scan mostrou `isAllowedTool`/`formatPromptValue` ainda no service.
  Focused Jest passou por estar perto do baseline, focused ESLint falhou com 9
  erros, touched Kloel typecheck errors `0`.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, traces `45`,
  helper-this/private/top-level/public scans verdes e focused Jest `13/13`, mas
  falhou focused ESLint e touched Kloel typecheck errors `1` por
  `ToolArgs` importado sem uso em `unified-agent-runtime.helpers.ts`.
- ATOMIC venceu completion, eventos `3` vs `38`, primeira acao `5.623s` vs
  `28.016s`, tempo `229.828s` vs `504.467s`, output/reasoning tokens,
  native violations `0` vs `12` e traceability; NORMAL venceu input tokens e
  touched typecheck por nao concluir a refatoracao.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-108/audit.json`,
  `docs/ai/atomic-os-benchmark/round-108/verdict.md`, logs externos e handoffs
  `AB-NORMAL-108`/`AB-ATOMIC-108`.
- Decisao: rejeitar ambos; nao escalar. Round 109 deve repetir a mesma
  complexidade com politica corrigida: runtime helper target header sem
  `ToolArgs` e validacao explicita de ausencia desse import.

## Delta 2026-05-18 04:07 - OpenCode A/B round 109

- Round 109 repetiu a dificuldade Round 108 com a politica corrigida: runtime
  helper target header minimo e check explicito de ausencia de `ToolArgs` em
  `unified-agent-runtime.helpers.ts`.
- NORMAL atingiu `max_timeout`, mas o worktree final passou aceite focado:
  focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`,
  helper-this/private/top-level/public/protected/suppression scans verdes.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `45`.
- ATOMIC venceu todas as metricas dominantes medidas: eventos `3` vs `132`,
  primeira acao `7.631s` vs `26.998s`, agent time `249.532s` vs `900.843s`,
  comandos `1` vs `16`, failed commands `0` vs `3`, input/output/reasoning
  `71.264/103/192` vs `76.291/12.884/9.151`, service lines `481` vs `510`,
  total Kloel lines `796` vs `822`, source churn `639` vs `691` e traces
  `45` vs `0`.
- NORMAL venceu apenas router helper line count isolado (`279` vs `282`), sem
  vencer total product line count.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-109/audit.json`,
  `docs/ai/atomic-os-benchmark/round-109/verdict.md`, logs externos e handoffs
  `AB-NORMAL-109`/`AB-ATOMIC-109`.
- Decisao: aceitar Round 109 como vitoria forte do ATOMIC neste tier, mas nao
  escalar ainda porque o mesmo tier tinha sido rejeitado no Round 108. Round 110
  deve repetir a mesma complexidade com a politica Round 109 congelada.

## Delta 2026-05-18 04:32 - OpenCode A/B round 110

- Round 110 repetiu a dificuldade Round 109 com a politica congelada: runtime
  helper target header minimo e check explicito de ausencia de `ToolArgs` em
  `unified-agent-runtime.helpers.ts`.
- NORMAL atingiu `max_timeout`, mas o worktree final passou aceite focado:
  focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`,
  helper-this/private/top-level/public/protected/suppression scans verdes.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `45`.
- ATOMIC venceu todas as metricas dominantes medidas: eventos `3` vs `120`,
  primeira acao `5.863s` vs `27.376s`, agent time `239.712s` vs `900.922s`,
  comandos `1` vs `16`, failed commands `0` vs `4`, input/output/reasoning
  `71.225/231/115` vs `79.187/12.764/9.235`, service lines `481` vs `511`,
  total Kloel lines `796` vs `819`, source churn `639` vs `666` e traces
  `45` vs `0`.
- NORMAL venceu apenas router helper line count isolado (`275` vs `282`), sem
  vencer total product line count.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-110/audit.json`,
  `docs/ai/atomic-os-benchmark/round-110/verdict.md`, logs externos e handoffs
  `AB-NORMAL-110`/`AB-ATOMIC-110`.
- Decisao: aceitar Round 110 como confirmacao de estabilidade local do tier
  Round 109/110. Escalar um degrau controlado no Round 111, sem aumentar
  contagem de workers.

## Delta 2026-05-18 04:58 - OpenCode A/B round 111

- Round 111 escalou um degrau controlado: split do cluster
  `UnifiedAgentService` em tres helpers (`unified-agent-tool-router.helpers.ts`,
  `unified-agent-runtime.helpers.ts` e
  `unified-agent-tool-parser.helpers.ts`).
- NORMAL atingiu `max_timeout`, mas o worktree final passou aceite focado:
  focused Jest `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`,
  helper-this/private/top-level/public/protected/suppression scans verdes.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `46`.
- ATOMIC venceu todas as metricas dominantes medidas: eventos `3` vs `147`,
  primeira acao `6.388s` vs `29.325s`, agent time `226.060s` vs `900.883s`,
  comandos `1` vs `14`, failed commands `0` vs `3`, input/output/reasoning
  `72.062/225/165` vs `92.376/14.679/9.633`, service lines `483` vs `503`,
  total Kloel lines `801` vs `813`, source churn `644` vs `660` e traces
  `46` vs `0`.
- NORMAL venceu apenas helper line count isolado em router (`233` vs `236`) e
  parser (`44` vs `49`), sem vencer total product line count.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-111/audit.json`,
  `docs/ai/atomic-os-benchmark/round-111/verdict.md`, logs externos e handoffs
  `AB-NORMAL-111`/`AB-ATOMIC-111`.
- Decisao: aceitar Round 111 como vitoria forte do ATOMIC no novo tier, mas nao
  escalar ainda. Round 112 deve repetir exatamente esta complexidade.

## Delta 2026-05-18 05:18 - OpenCode A/B round 112

- Round 112 repetiu exatamente o tier do Round 111: split do cluster
  `UnifiedAgentService` em tres helpers (`unified-agent-tool-router.helpers.ts`,
  `unified-agent-runtime.helpers.ts` e
  `unified-agent-tool-parser.helpers.ts`).
- NORMAL completou e passou aceite focado: focused Jest `13/13`, focused
  ESLint `0`, touched Kloel typecheck errors `0`,
  helper-this/private/top-level/public/protected/suppression scans verdes.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `46`.
- ATOMIC venceu todas as metricas dominantes medidas: eventos `3` vs `146`,
  primeira acao `5.303s` vs `20.252s`, agent time `221.295s` vs `812.309s`,
  comandos `1` vs `17`, failed commands `0` vs `3`, input/output/reasoning
  `72.080/158/239` vs `86.149/14.913/6.418`, service lines `483` vs `503`,
  total Kloel lines `801` vs `812`, source churn `644` vs `659` e traces
  `46` vs `0`.
- NORMAL venceu apenas helper line count isolado em router (`230` vs `236`) e
  parser (`46` vs `49`), sem vencer total product line count.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-112/audit.json`,
  `docs/ai/atomic-os-benchmark/round-112/verdict.md`, logs externos e handoffs
  `AB-NORMAL-112`/`AB-ATOMIC-112`.
- Decisao: aceitar Round 112 como confirmacao do tier de tres helpers. Rounds
  111/112 agora sustentam escalada de exatamente um degrau no Round 113, sem
  aumentar numero de workers nem relaxar gates.

## Delta 2026-05-18 05:42 - OpenCode A/B round 113

- Round 113 escalou um degrau controlado: split do cluster
  `UnifiedAgentService` em quatro helpers (`unified-agent-tool-router.helpers.ts`,
  `unified-agent-runtime.helpers.ts`, `unified-agent-tool-parser.helpers.ts` e
  `unified-agent-cognitive-state.helpers.ts`).
- NORMAL atingiu `idle_timeout` e nao entregou a mutacao: focused Jest `13/13`
  passou no baseline, mas focused ESLint falhou, helper scan ficou sem helpers,
  private/top-level scans falharam, e o bloco inline ABI/cognitive-state
  permaneceu no service.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `50`.
- ATOMIC venceu completion, primeira acao `4.925s` vs `20.170s`, agent time
  `243.290s` vs `256.249s`, eventos `3` vs `25`, comandos `1` vs `2`, output
  tokens `56` vs `1.005`, native file tool violations `0` vs `13`, service
  lines `456` vs `737` e traces `50` vs `0`.
- NORMAL venceu apenas input tokens `78.187` vs `78.892` e reasoning tokens
  `337` vs `456`, mas enquanto lane incompleta; isso nao conta como vitoria de
  produto.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-113/audit.json`,
  `docs/ai/atomic-os-benchmark/round-113/verdict.md`, logs externos e handoffs
  `AB-NORMAL-113`/`AB-ATOMIC-113`.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  agora separa funcoes exportadas do helper de imports exigidos no service por
  `sourceImportNames` / `serviceImportNames` / `callsiteImportNames`.
- Decisao: aceitar Round 113 como vitoria funcional do ATOMIC, mas nao escalar
  ainda porque `shapeComparisonEligible=false`; Round 114 deve repetir a mesma
  complexidade com o operador de import surface atualizado.

## Delta 2026-05-18 06:02 - OpenCode A/B round 114

- Round 114 repetiu exatamente o tier do Round 113: split do cluster
  `UnifiedAgentService` em quatro helpers (`unified-agent-tool-router.helpers.ts`,
  `unified-agent-runtime.helpers.ts`, `unified-agent-tool-parser.helpers.ts` e
  `unified-agent-cognitive-state.helpers.ts`).
- NORMAL atingiu `max_timeout` apos persistir mudancas parciais; focused Jest
  `13/13` passou, touched Kloel typecheck errors `0`, structural scans passaram,
  mas focused ESLint falhou com 9 erros e a lane nao concluiu a validacao.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `45`.
- ATOMIC venceu completion, primeira acao `6.677s` vs `29.126s`, agent time
  `246.177s` vs `900.884s`, eventos `3` vs `104`, input/output/reasoning
  `73.680/160/108` vs `75.095/13.365/10.516`, service lines `456` vs `479`,
  total Kloel lines `831` vs `845`, source churn `740` vs `754` e traces
  `45` vs `0`.
- NORMAL nao teve vitoria aceita; empatou apenas comandos `1/1` e failed
  commands `0/0`, enquanto incompleto e com lint vermelho.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-114/audit.json`,
  `docs/ai/atomic-os-benchmark/round-114/verdict.md`, logs externos e handoffs
  `AB-NORMAL-114`/`AB-ATOMIC-114`.
- Decisao: aceitar Round 114 como segunda vitoria funcional do ATOMIC no tier
  quatro helpers, mas nao escalar ainda porque `shapeComparisonEligible=false`.
  Round 115 deve repetir a mesma complexidade ou ajustar apenas budget/prompt do
  harness para obter baseline NORMAL completo sem relaxar gates atomicos.

## Delta 2026-05-18 06:31 - OpenCode A/B round 115

- Round 115 repetiu exatamente o tier quatro helpers com apenas o watchdog
  maximo aumentado para obter baseline NORMAL completo.
- NORMAL completou e passou aceite focado: focused Jest `13/13`, focused ESLint
  `0`, touched Kloel typecheck errors `0`,
  helper-this/private/top-level/public/protected/suppression scans verdes.
- ATOMIC completou, preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, native file
  tool violations `0` e traces `45`.
- ATOMIC venceu as metricas operacionais dominantes medidas: primeira acao
  `5.376s` vs `19.564s`, agent time `215.375s` vs `1,130.540s`, eventos `3`
  vs `171`, comandos `1` vs `22`, failed commands `0` vs `4`,
  input/output/reasoning `73.695/168/1.188` vs `81.226/16.947/11.380`,
  service lines `456` vs `460` e traces `45` vs `0`.
- NORMAL venceu shape agregado: total Kloel lines `817` vs ATOMIC `831` e
  source churn `730` vs ATOMIC `740`.
- Ferramenta atualizada: `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`
  ganhou `lineBudgetChecks` e `sourceChurnBudgetChecks` sinteticos na validacao
  do macro-operador.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-115/audit.json`,
  `docs/ai/atomic-os-benchmark/round-115/verdict.md`, logs externos e handoffs
  `AB-NORMAL-115`/`AB-ATOMIC-115`.
- Decisao: aceitar Round 115 como vitoria operacional comparavel do ATOMIC, mas
  nao escalar ainda porque houve derrota atomica em total lines/churn. Round 116
  deve repetir o mesmo tier com shape budget ativo.

## Delta 2026-05-18 06:46 - OpenCode A/B round 116

- Round 116 repetiu exatamente o tier quatro helpers com budget final de shape
  ativo: total touched Kloel lines <= `817` e source churn <= `730`.
- NORMAL ficou em `idle_timeout` sem mutar o alvo; nao ha baseline comparavel.
- ATOMIC completou a macro-mutacao em modo atomic-only e produziu `46` traces,
  mas o preprompt final saiu `1` porque `validate_kloel_unified_agent` recusou
  shape: total lines `823/817` e churn `732/730`.
- Gates funcionais internos antes do budget passaram: focused Jest,
  diff-check, protected diff, suppression scan, helper `this.` scans, public API
  scans e cognitive helper export check.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-116/audit.json`,
  `docs/ai/atomic-os-benchmark/round-116/verdict.md`,
  `docs/ai/atomic-os-benchmark/round-116/opencode-atomic-preprompt-output.log`
  e handoffs `AB-NORMAL-116`/`AB-ATOMIC-116`.
- Decisao: rejeitar Round 116 como vitoria; nao escalar. Round 117 deve repetir
  o mesmo tier com parser/cognitive helpers mais compactos e o mesmo budget.

## Delta 2026-05-18 06:56 - OpenCode A/B round 117

- Round 117 repetiu o tier quatro helpers com parser/cognitive templates mais
  compactos e o mesmo budget `817/730`.
- NORMAL ficou em `idle_timeout` sem mutar o alvo; nao ha baseline atual
  comparavel.
- ATOMIC completou com preprompt exit `0`, `atomicModeClean=true`, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, protected
  diff vazio, helper/private/top-level/public scans verdes e traces `46`.
- ATOMIC bateu o budget que falhou no Round 116: total touched Kloel lines
  `809/817`, source churn `718/730`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-117/audit.json`,
  `docs/ai/atomic-os-benchmark/round-117/verdict.md`, logs externos e handoffs
  `AB-NORMAL-117`/`AB-ATOMIC-117`.
- Decisao: aceitar Round 117 como recuperacao funcional/de-shape do ATOMIC, mas
  nao escalar porque NORMAL nao completou. Round 118 deve repetir com prompt
  NORMAL mais curto e janela idle maior.

## Delta 2026-05-18 07:26 - OpenCode A/B round 118

- Round 118 repetiu o tier quatro helpers com prompt NORMAL compacto e janela
  idle maior, mantendo o budget atomico recuperado no Round 117.
- NORMAL completou e passou aceite focado: focused Jest `13/13`, focused
  ESLint `0`, touched Kloel typecheck errors `0`, diff-check,
  protected/suppression/helper/private/public scans verdes.
- ATOMIC completou com preprompt exit `0`, `atomicModeClean=true`, native file
  tool violations `0`, traces `46`, focused Jest `13/13`, focused ESLint `0`,
  touched Kloel typecheck errors `0` e os mesmos scans verdes.
- Scorecard: `functionalPass=true`, `taskFunctionalPass=true`,
  `shapeComparisonEligible=true`, `sharedTypecheckNoiseOnly=true`.
- ATOMIC venceu todas as metricas nao empatadas: primeira acao `5.054s` vs
  `17.856s`, agent time `202.582s` vs `1,019.334s`, eventos `3` vs `154`,
  comandos `1` vs `9`, failed commands `0` vs `3`,
  input/output/reasoning `75.220/106/245` vs `98.317/15.017/11.616`,
  service lines `456` vs `468`, total Kloel lines `809` vs `825`, source
  churn `718` vs `746`, traces `46` vs `0`.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-118/audit.json`,
  `docs/ai/atomic-os-benchmark/round-118/verdict.md`, logs externos e handoffs
  `AB-NORMAL-118`/`AB-ATOMIC-118`.
- Decisao: aceitar Round 118 como vitoria comparavel zero-loss do ATOMIC no
  tier quatro helpers. Escalar um degrau controlado no Round 119, mantendo 2
  workers OpenCode, worktrees persistentes e validacao externa antes de
  qualquer novo claim.

## Delta 2026-05-18 11:44 - OpenCode A/B round 127

- Round 127 repetiu o tier sete helpers apos o reparo de validacao
  intermediaria do Round 126.
- NORMAL completou e passou o contrato funcional externo: focused Jest
  `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`,
  protected/suppression/helper/service/runtime scans verdes.
- ATOMIC completou e passou Jest/ESLint/typecheck/diff/protected/helper scans,
  mas foi rejeitado pelo residue scan final: `toolRouterDeps` permaneceu no
  service como propriedade cacheada, assignment de construtor e handoffs para
  helpers.
- ATOMIC venceu metricas operacionais medidas: eventos `3` vs `136`, primeira
  acao `3.289s` vs `19.130s`, agent time `243.898s` vs `1,286.559s`,
  comandos `1` vs `11`, failed commands `1` vs `6`, traces `63` vs `0`,
  service lines `383` vs `403`.
- Decisao: NORMAL vence o Round 127 por contrato funcional. Nao escalar.
- Tooling atualizado para o Round 128: `atomic-call.cjs` ganhou suporte a
  `dependencyInlineObject` e `dependencyContainer.style=inlineObject`; o
  fast-path Round 128 remove `toolRouterDeps` e injeta `executeToolActionDeps`
  inline antes do gate final.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-127/audit.json`,
  `docs/ai/atomic-os-benchmark/round-127/verdict.md`, logs externos e handoffs
  `AB-NORMAL-127`/`AB-ATOMIC-127`.

## Delta 2026-05-18 12:18 - OpenCode A/B round 128

- Round 128 repetiu o tier sete helpers com dependencia inline
  `executeToolActionDeps`.
- NORMAL atingiu `max_timeout`, mas a validacao externa provou baseline
  funcional: focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
  diff-check `0`, protected/suppression/helper/service/runtime scans verdes.
- ATOMIC completou a lane e manteve `atomicModeClean=true`, native file tool
  violations `0`, worktree escapes `0` e traces `62`, mas foi rejeitado:
  preprompt exit `1`, Jest falhou `2/13`, ESLint falhou, backend typecheck
  falhou com dois erros Kloel e service residue scan encontrou `toolRouterDeps`.
- Causa: `atomic-inline-deps-helper-param-args.json` carregava
  `expectedCount: 2`, mas `atomic-call.cjs` repassava o bloco ambiguo cru ao
  MCP `atomic_replace_text`, que exige match unico ou `occurrence`.
- ATOMIC venceu metricas operacionais: eventos `3` vs `213`, primeira acao
  `2.900s` vs `18.289s`, agent time `203.469s` vs `1,501.568s`, comandos
  `1` vs `15`, failed commands `1` vs `5`,
  input/output/reasoning `62.829/197/292` vs `89.772/20.179/19.138`, total
  Kloel lines `944` vs `994`, source churn `1.047` vs `1.469` e traces
  `62` vs `0`.
- Decisao: NORMAL vence por contrato funcional. Nao escalar.
- Tooling atualizado para o Round 129: `atomic-call.cjs` expande
  `expectedCount > 1` em replacements sequenciais `occurrence: 1` apos validar
  a contagem observada; `round-audit.cjs` agora parseia logs externos no
  formato `[jest exit=0]` e secoes com colchetes.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-128/audit.json`,
  `docs/ai/atomic-os-benchmark/round-128/verdict.md`, logs externos e handoffs
  `AB-NORMAL-128`/`AB-ATOMIC-128`.

## Delta 2026-05-18 13:02 - OpenCode A/B round 129

- Round 129 repetiu o tier sete helpers apos corrigir `expectedCount > 1`.
- Ambos lanes completaram e passaram o contrato externo: focused Jest `13/13`,
  focused ESLint `0`, backend typecheck `0`, diff-check `0`,
  protected/suppression/helper/service/runtime scans verdes.
- ATOMIC ficou `atomicModeClean=true`, native file tool violations `0`, traces
  `70`, preprompt exit `0`.
- ATOMIC venceu eventos `3` vs `165`, primeira acao `6.046s` vs `20.886s`,
  agent time `313.097s` vs `1,394.568s`, comandos `1` vs `17`, failed
  commands `0` vs `5`, input/output/reasoning `64.591/119/240` vs
  `77.487/22.435/15.246`, total Kloel lines `964` vs `1.099`, source churn
  `1.069` vs `1.382` e traces `70` vs `0`.
- NORMAL venceu service facade compactness: `281` service lines vs ATOMIC
  `396`. Causa: o incoming-helper atomico ainda e raso e deixa a maior parte
  do `processMessage` no service.
- Decisao: ATOMIC aceito funcionalmente, mas nao escalar. Round 130 repete a
  mesma complexidade com politica de compactacao de facade/process-message.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-129/audit.json`,
  `docs/ai/atomic-os-benchmark/round-129/verdict.md`, logs externos e handoffs
  `AB-NORMAL-129`/`AB-ATOMIC-129`.

## Delta 2026-05-18 13:46 - OpenCode A/B round 130

- Round 130 repetiu o tier sete helpers com compactacao macro da facade.
- NORMAL completou e passou a validacao externa: focused Jest `0`, focused
  ESLint `0`, backend typecheck `0`, diff-check `0`, scans de protected/
  suppression/helper/service/runtime verdes. Produziu novo baseline compacto:
  `184` linhas em `unified-agent.service.ts`.
- ATOMIC foi rejeitado: preprompt exit `1`, Jest `1`, ESLint `1`, backend
  typecheck `2`, service `396` linhas. A falha direta foi
  `atomic_replace_text expected 1 occurrence(s), observed 0`.
- Causa: hardcode operacional de macro replacement baseado em `oldText`
  antigo. As operacoes atomicas intermediarias mudaram o estado real do arquivo,
  entao o bloco exato do round anterior deixou de existir.
- Ferramenta/politica atualizada: `atomic-call.cjs` ganhou
  `replace_file_with_current_anchor`, que ancora a macro compactacao no conteudo
  atual do worktree e ainda escreve via Atomic MCP.
- Decisao: NORMAL vence por contrato funcional; nao escalar complexidade.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-130/audit.json`,
  `docs/ai/atomic-os-benchmark/round-130/verdict.md`, logs externos,
  `opencode-atomic-preprompt-output.log` e handoffs
  `AB-NORMAL-130`/`AB-ATOMIC-130`.
- Proxima acao gravada: Round 131 repete a mesma complexidade com
  current-anchor macro compaction e preservacao explicita de metodos publicos
  da facade, incluindo `processMessage`.

## Delta 2026-05-18 11:06 - OpenCode A/B round 131

- Round 131 repetiu o tier sete helpers com `replace_file_with_current_anchor`
  e macro facade compaction.
- Ambos lanes completaram e passaram focused Jest `13/13`, focused ESLint
  `0`, backend typecheck `0`, diff-check `0`, protected diff vazio e
  suppression scan limpo.
- NORMAL foi rejeitado pelo contrato final: o service ficou com `416` linhas e
  ainda executa diretamente a orquestracao de `processMessage` em vez de
  delegar ao incoming helper.
- ATOMIC foi rejeitado pelo contrato literal da rodada: service ficou compacto
  em `184` linhas e o incoming helper contem os callees corretos, mas o gate
  exigia `processUnifiedAgentToolCalls({` e
  `processUnifiedAgentPredecidedActions({`, enquanto o codigo usa `callee(`
  com formatting diferente.
- ATOMIC venceu tempo total `308.517s` vs `1341.192s`, primeira acao `4.578s`
  vs `19.386s`, eventos `13` vs `185`, comandos `1` vs `14`, failed commands
  `1` vs `5`, input/output/reasoning `54086/738/506` vs
  `90137/20935/12904`, service lines `184` vs `416`, traces `76` vs `0`.
- NORMAL venceu total Kloel lines `1006` vs `1045` e source churn `1101` vs
  `1534`.
- Ferramenta/politica atualizada: `atomic-call.cjs` ganhou
  `requiredRegexChecks`; Round 132 usa checagem topologica de callee e nao
  literal `callee({`.
- Decisao: nenhum vencedor final aceito; nao escalar complexidade.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-131/audit.json`,
  `docs/ai/atomic-os-benchmark/round-131/verdict.md`, logs externos,
  `opencode-atomic-preprompt-output.log` e handoffs
  `AB-NORMAL-131`/`AB-ATOMIC-131`.
- Proxima acao gravada: Round 132 repete a mesma complexidade com final
  topology-aware e deve manter `atomicModeClean=true` inclusive apos falha.

## Delta 2026-05-18 14:45 - OpenCode A/B round 132

- Round 132 repetiu o tier sete helpers com final topology-aware
  (`requiredRegexChecks`) para os callees de tool-call e predecided.
- Ambos lanes completaram exit `0` e passaram focused Jest `13/13`, focused
  ESLint `0`, backend typecheck `0`, diff-check `0`, protected diff vazio,
  suppression/helper/private scans limpos.
- NORMAL foi rejeitado pelo contrato final: o incoming helper nao possui
  `chatCompletionWithFallback(`, `recordAgentRuntimeTurn(`,
  `processUnifiedAgentToolCalls(` nem `processUnifiedAgentPredecidedActions(`.
- ATOMIC passou o contrato final com `service_residue_status=1`,
  `atomicModeClean=true`, native file violations `0` e traces `76`.
- ATOMIC venceu tempo total `286.691s` vs `1261.358s`, primeira acao `4.869s`
  vs `19.244s`, eventos `3` vs `95`, comandos `1` vs `11`, failed commands
  `0` vs `5`, output/reasoning `315/50` vs `13999/20567`, service facade
  `184` vs `409` e traceability `76` vs `0`.
- NORMAL venceu input tokens `73577` vs `145910` e teve total/churn menores
  (`961/1072` vs `1045/1534`), mas esses shape wins nao sao aceitos como
  vitoria final porque a lane falhou o contrato funcional.
- Derrota atomica formalizada: o runner de preprompt bem-sucedido fazia `grep`
  em JSON bruto e injetava linhas gigantes de `atomicDiff` no contexto do
  OpenCode, criando input-token overhead escondido.
- Ferramenta/politica atualizada:
  `docs/ai/atomic-os-benchmark/tools/opencode-round-watchdog.cjs` agora mostra
  em sucesso somente exit, output bytes, validation passed e trace count; o
  log completo permanece em disco para auditoria.
- Decisao: ATOMIC vence funcionalmente, mas nao escalar complexidade ainda
  porque ha perda operacional de input tokens a revalidar.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-132/audit.json`,
  `docs/ai/atomic-os-benchmark/round-132/verdict.md`, logs externos,
  `opencode-watchdog-status.json` e handoffs `AB-NORMAL-132`/`AB-ATOMIC-132`.
- Proxima acao gravada: Round 133 repete exatamente a mesma complexidade com
  preprompt-success output compactado; escalar so se ATOMIC mantiver contrato
  funcional, `atomicModeClean=true` e remover a perda de input tokens.

## Delta 2026-05-18 15:11 - OpenCode A/B round 133

- Round 133 repetiu o tier sete helpers apos compactar stdout de sucesso do
  preprompt atomico.
- Ambos lanes completaram exit `0` e passaram focused Jest `13/13`, focused
  ESLint `0`, backend typecheck `0`, diff-check `0`, protected diff vazio e
  suppression/helper/private scans limpos.
- NORMAL foi rejeitado pelo contrato final: `final_validation_status=1`; o
  service ainda reteve `recordAgentRuntimeTurn(`, nao delegou
  `processMessage` por `return processIncomingUnifiedAgentMessage(` e o
  incoming helper nao contem runtime turn recording nem os callees
  `processUnifiedAgentToolCalls(` / `processUnifiedAgentPredecidedActions(`.
- ATOMIC passou o contrato final: `final_validation_status=0`,
  `atomicModeClean=true`, native file violations `0`, traces `76`,
  protected diff vazio.
- ATOMIC venceu agent time `270.649s` vs `1253.180s`, primeira acao `3.881s`
  vs `18.453s`, eventos `3` vs `153`, comandos `1` vs `13`, failed commands
  `0` vs `3`, input/output/reasoning `52006/132/115` vs
  `83761/17705/17423`, service facade `184` vs `304` e traceability `76` vs
  `0`.
- A derrota de input tokens do Round 132 foi corrigida: ATOMIC agora vence
  input tokens por `31755`.
- Ferramenta/politica atualizada:
  `docs/ai/atomic-os-benchmark/tools/round-audit.cjs` agora trata
  `final_validation_status` como autoridade funcional; o scorecard corrigido
  marca `normalTaskFunctionalPass=false`, `atomicTaskFunctionalPass=true`.
- Decisao: ATOMIC vence funcionalmente e operacionalmente, mas nao escalar
  ainda. Repetir uma vez na mesma complexidade com o auditor corrigido para
  confirmar estabilidade do resultado.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-133/audit.json`,
  `docs/ai/atomic-os-benchmark/round-133/verdict.md`, logs externos,
  `opencode-watchdog-status.json` e handoffs `AB-NORMAL-133`/`AB-ATOMIC-133`.
- Proxima acao gravada: Round 134 repete exatamente a mesma complexidade com o
  scorecard corrigido; escalar so se ATOMIC mantiver contrato final,
  `atomicModeClean=true` e vitoria material estavel.

## Delta 2026-05-18 15:38 - OpenCode A/B round 134

- Round 134 repetiu o tier sete helpers com auditor corrigido.
- Ambos lanes completaram exit `0`.
- NORMAL foi rejeitado: `final_validation_status=1`; service manteve residuo
  direto de cognitive/context/runtime e incoming helper ficou raso.
- ATOMIC manteve `atomicModeClean=true`, traces `76` e venceu tempo/eventos/
  comandos/tokens, mas tambem foi rejeitado como prova limpa:
  `final_validation_status=1` porque backend typecheck esta vermelho no
  worktree.
- Bloqueios de typecheck observados: Google Ads `IntegrationCredentialWhereUniqueInput`
  e `src/kloel/lineage/lineage-ledger.prisma-repository.ts` sem
  `PrismaService.lineageEntry`.
- Decisao: nao escalar complexidade por Round 134. Round 133 segue como ultima
  vitoria funcional aceita do ATOMIC.
- Evidencia principal: `docs/ai/atomic-os-benchmark/round-134/audit.json`,
  `docs/ai/atomic-os-benchmark/round-134/verdict.md`, logs externos e handoffs
  `AB-NORMAL-134`/`AB-ATOMIC-134`.
