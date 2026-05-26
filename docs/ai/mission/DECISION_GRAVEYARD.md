# Decision Graveyard

## DG-001: Esconder `.pulse/**` do grafo por tamanho

- Status: rejeitada
- Motivo: contraria a exigencia de que o Obsidian renderize toda a maquina criada, incluindo PULSE.
- Evidencia: ausencia de `.pulse/**` no manifest causou tomografia incompleta.
- Condicao para reabrir: somente se houver alternativa que preserve todos os nos PULSE como metadados visiveis no grafo sem copiar corpo gigante.

## DG-002: Copiar corpo integral de artefatos PULSE gigantes para notas Obsidian

- Status: rejeitada
- Motivo: `.pulse/current/PULSE_PROPERTY_EVIDENCE.json` tem 192MB; copiar corpo para nota degradaria vault e render.
- Decisao: usar `metadata_only` com hash real e tags funcionais.
- Condicao para reabrir: somente com prova de que o vault aguenta corpos gigantes sem impacto e que isso melhora funcao real.

## DG-003: Declarar PULSE global completo por causa dos health probes

- Status: rejeitada
- Motivo: health probes 4/4 provam apenas uma fatia runtime; `pulse:json` global nao completou nesta sessao.
- Condicao para reabrir: `production-final --final` ou rota formal equivalente verde com evidencia persistida.

## DG-004: Aceitar resultado de OpenCode sem handoff persistido

- Status: rejeitada
- Motivo: viola o contrato de continuidade; sem handoff, a proxima sessao nao consegue fiscalizar arquivos lidos, comandos, evidencias e risco residual.
- Evidencia: workers `OC-LEDGER-AUDIT-001`, `OC-OBSIDIAN-GRAPH-001`, `OC-ORCHESTRATION-001`, `OC-PRODUCT-PROOF-001`, `OC-OBSIDIAN-GRAPH-002` e `OC-PRODUCT-PROOF-002` nao produziram handoff final aceitavel.
- Condicao para reabrir: apenas se o resultado for reconstruido pelo orquestrador localmente com evidencia equivalente e registrado em `SUBAGENT_HANDOFFS.md`.

## DG-005: Escalar para 20-50 OpenCode antes de handoff confiavel

- Status: rejeitada
- Motivo: escalaria custo/RAM sem garantir fiscalizacao; micro-ondas mostraram que o gargalo atual e handoff/permissao, nao quantidade de workers.
- Evidencia: dois workers PULSE foram uteis; workers sem handoff foram descartados; worker de Obsidian externo encontrou prompt de permissao.
- Condicao para reabrir: uma micro-onda 3-5 com 100% de handoffs aceitos ou rejeitados por criterio claro, sem processo residual.

## DG-006: Declarar `production-final` travado apenas por stdout vazio

- Status: rejeitada
- Motivo: reproducao com `PULSE_EXECUTION_TRACE_PATH=.pulse/current/PULSE_EXECUTION_TRACE.live.json` mostrou progresso real por fases; stdout fica vazio enquanto `fullScan()` nao termina.
- Evidencia: em 300s, fases `scan:core-parsers`, `scan:truth` e `scan:certification:final` passaram; em 600s, `scan:certification:parity-and-vision` tambem passou e a execucao chegou a `scan:perfectness`.
- Condicao para reabrir: trace explicito ficar sem mudanca por um limite reprodutivel, ou a fase `scan:perfectness` exceder budget definido com processo vivo e sem novos artefatos.

## DG-007: Escalar 20-50 OpenCode workers neste host 16GB agora

- Status: rejeitada
- Motivo: a micro-onda validou handoff, mas o host local estava com alta pressao de memoria/swap e a lease topology PULSE ainda tem monolito de ~580 arquivos, phantoms e readOnly bloat.
- Evidencia: `OC-SWARM-OPENCODE-RUNTIME-001` mediu host 16GB com swap alto; `OC-SWARM-LEASE-COLLISION-001` mediu 10 leases, cinco phantoms e `pulse-worker-01` com 580 arquivos; `ps ... rg 'opencode (serve|run)'` confirmou limpeza apos a onda.
- Condicao para reabrir: liberar memoria/swap e revalidar capacidade local, ou mover o pool para host >=32GB, e corrigir leases para escopos pequenos/disjuntos com handoff atomico.

## DG-008: Gravar chave DeepSeek no repo/ledger para GitNexus

- Status: rejeitada
- Motivo: credencial deve ficar em config/secret local seguro, nunca em docs versionadas, ledger, handoff ou memoria.
- Evidencia: GitNexus DeepSeek foi validado por direct smoke e wiki smoke sem registrar segredo nos arquivos `docs/ai/mission/**`.
- Condicao para reabrir: nunca reabrir para repo versionado; se precisar rotacionar/configurar, usar superficie secreta/local apropriada.

## DG-009: Permitir OpenCode mutar codigo por native Write/Edit ou Bash direto

- Status: rejeitada
- Motivo: viola o principio atomico; worker `OC-ATOMIC-ONLY-VALIDATION-001` provou que isso permitia bypass real em `.ts`.
- Evidencia: native `write`, Bash Python `Path.write_text`, Bash Node `fs.writeFileSync` e `rm` em arquivo `.ts` foram permitidos antes do reparo; apos o reparo, direct hook e worker 002 negaram mutacoes de codigo e o arquivo de bypass ficou ausente.
- Condicao para reabrir: nenhuma para codigo. Qualquer excecao futura deve ser nao-code, explicitamente registrada, e nao pode enfraquecer o gate atomico.

## DG-010: Escalar swarm OpenCode antes de provar atomic-only runtime

- Status: rejeitada
- Motivo: escala massiva com native edit aberto multiplica colisao, regressao e perda de rastreabilidade.
- Evidencia: validacao 001 encontrou bypasses; validacao 002 so passou apos plugin OpenCode valido, `permission.edit=deny` e hook Bash reforcado.
- Condicao para reabrir: somente apos worker canario reproduzir denial de native code write e Bash code write no runtime OpenCode da sessao atual.

## DG-011: Usar getter `routerDeps` como solucao de compactacao do Round 103

- Status: rejeitada
- Motivo: Round 104 mostrou que trocar `constructorProperty` por getter
  `routerDeps` preservou funcionalidade, mas piorou service lines e total Kloel
  lines em relacao ao Round 103.
- Evidencia: ATOMIC Round 104 passou focused Jest/ESLint e touched typecheck
  errors `0`, mas terminou com service/helper/total `491/297/788` contra
  `490/297/787` do Round 103. Source churn ficou `619`, apenas 1 linha abaixo,
  sem resolver a perda principal.
- Condicao para reabrir: somente se houver nova politica que prove getter menor
  com todos os gates verdes e sem reincidir na colisao textual
  `toolRouterDeps()`.

## DG-012: Executar replacement `parseToolArgs` antes do import/helper existir

- Status: rejeitada
- Motivo: Round 105 provou que mover o parse seguro para helper/header e
  substituir o callsite antes de adicionar o import quebra comportamento e
  typecheck local.
- Evidencia: ATOMIC Round 105 completou a lane e manteve `atomicModeClean=true`,
  mas `opencode-atomic-preprompt-exit.txt` foi `1`; focused Jest falhou com
  `ReferenceError: parseToolArgs is not defined`, focused ESLint falhou e
  touched Kloel typecheck errors ficou `4`.
- Condicao para reabrir: somente como transacao dependency-aware que adicione o
  helper/import antes do replacement do callsite, ou como batch atomico unico
  com validacao final verde.

## DG-013: Runtime helper target header com import `ToolArgs` desnecessario

- Status: rejeitada
- Motivo: Round 108 provou que carregar `ToolArgs` no header do
  `unified-agent-runtime.helpers.ts` quebra focused ESLint e touched typecheck
  sem agregar funcao ao helper runtime.
- Evidencia: ATOMIC Round 108 completou o split multi-modulo, passou focused
  Jest e scans estruturais, mas falhou focused ESLint com
  `'ToolArgs' is defined but never used` e touched Kloel typecheck errors `1`.
- Condicao para reabrir: somente se uma futura versao do runtime helper usar
  `ToolArgs` de forma real e validada; caso contrario, target headers devem ser
  minimos e derivados da superficie usada.
