# Subagent Handoffs

## Handoffs Aceitos

### AB-NORMAL-126

- Status: accepted_functional_baseline
- Prompt recebido: Round 126 NORMAL OpenCode, repeat seven-helper split de
  `UnifiedAgentService` com factory OpenCode e sem Atomic OS.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline NORMAL funcional completo.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, backend
  typecheck `0`, touched Kloel typecheck errors `0`, diff-check `0`,
  protected diff vazio, suppression/helper/private scans limpos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-126.md`.
- Risco residual: custo operacional alto, uso de native `write`/`edit` e zero
  trace atomico.
- Recomendacao: usar como baseline funcional para Round 127.

### AB-ATOMIC-126

- Status: rejected_intermediate_validation_policy_failure
- Prompt recebido: Round 126 ATOMIC OpenCode, repeat seven-helper split com
  macro atomico e final service-residue gate.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e
  `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Decisao tomada: rejeitar como task-functional; focused ESLint intermediario
  abortou a macro antes das demais extracoes.
- Testes/comandos: preprompt exit `1`, focused Jest `13/13`, backend
  typecheck `0`, touched Kloel typecheck errors `0`, diff-check `0`,
  protected diff vazio, suppression/helper scans limpos; focused ESLint `1` e
  private/residual service scan vermelho.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-126.md`.
- Risco residual: a politica reparada ainda nao foi provada em rodada nova.
- Recomendacao: repetir no Round 127 com lint final/explicit-only durante
  validacoes intermediarias.

### AB-NORMAL-125

- Status: accepted_functional_baseline_atomic_wins_cost_only
- Prompt recebido: Round 125 NORMAL OpenCode, repeat seven-helper split de
  `UnifiedAgentService` com prompt compacto para baseline completo.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline NORMAL completo do tier sete helpers.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, backend
  typecheck `0`, diff-check `0`, protected diff vazio, suppression/helper/
  private scans limpos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-125.md`.
- Risco residual: custo operacional alto e zero trace atomico.
- Recomendacao: usar como baseline do Round 126.

### AB-ATOMIC-125

- Status: rejected_service_residue_validator_gap
- Prompt recebido: Round 125 ATOMIC OpenCode, repeat seven-helper split com
  macro atomico e validador ainda sem hard gate de `toolRouterDeps`.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: rejeitar como task-functional porque o service ainda continha
  `toolRouterDeps`, apesar dos gates Jest/lint/typecheck/diff verdes.
- Testes/comandos: preprompt exit `0`, focused Jest `13/13`, focused ESLint
  `0`, backend typecheck `0`, diff-check `0`, `atomicModeClean=true`, native
  file tool violations `0`, traces `63`; residual service scan vermelho.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-125.md`.
- Risco residual: o validador anterior aceitava sucesso com residuo estrutural.
- Recomendacao: repetir no Round 126 apos sincronizar o reparo de
  `validate_kloel_unified_agent`.

### AB-NORMAL-124

- Status: rejected_timeout_typecheck_error
- Prompt recebido: Round 124 NORMAL OpenCode, repeat seven-helper split de
  `UnifiedAgentService` com budgets atomicos advisory no lane ATOMIC.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: rejeitar como baseline completo porque ficou em timeout e
  deixou erro de typecheck no arquivo tocado.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, diff-check `0`,
  scans estruturais limpos, mas touched Kloel typecheck errors `1`.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-124.md`.
- Risco residual: sem baseline NORMAL completo para comparacao de shape/custo.
- Recomendacao: repetir Round 125 com prompt NORMAL compacto e janela
  operacional suficiente, sem permitir ferramentas atomicas.

### AB-ATOMIC-124

- Status: accepted_atomic_clean_policy_recovery_repeat_for_baseline
- Prompt recebido: Round 124 ATOMIC OpenCode, repeat seven-helper split com
  budgets line/churn advisory.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como recuperacao atomica limpa da falha de politica
  do Round 123, mas bloquear escala por falta de baseline NORMAL completo.
- Testes/comandos: preprompt exit `0`, focused Jest `13/13`, focused ESLint
  `0`, touched Kloel typecheck errors `0`, diff-check `0`, scans estruturais
  limpos, `atomicModeClean=true`, native file tool violations `0`, traces `63`.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-124.md`.
- Risco residual: vitoria comparativa contra NORMAL completo ainda pendente
  porque o baseline ficou em `max_timeout`.
- Recomendacao: repetir no Round 125 antes de escalar.

### AB-NORMAL-123

- Status: accepted_functional_baseline_lost_all_material_metrics
- Prompt recebido: Round 123 NORMAL OpenCode, seven-helper split de
  `UnifiedAgentService` com extracao de predecided processing.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline funcional comparavel.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, diff-check `0`, scans estruturais limpos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-123.md`.
- Risco residual: sem traces atomicos e custo operacional alto.
- Recomendacao: usar como baseline do tier sete helpers para Round 124.

### AB-ATOMIC-123

- Status: accepted_strong_atomic_with_policy_failure_repeat_same_complexity
- Prompt recebido: Round 123 ATOMIC OpenCode, seven-helper split com macro
  atomico e budget absoluto ainda hard-gated.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e sete
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como vitoria comparativa forte, mas bloquear nova
  escala por falha de politica operacional fixa.
- Testes/comandos: preprompt exit `1` apenas por budget absoluto, focused Jest
  `13/13`, focused ESLint `0`, touched Kloel typecheck errors `0`, diff-check
  `0`, scans estruturais limpos, `atomicModeClean=true`, traces `63`.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-123.md`.
- Risco residual: budgets fixos foram convertidos em advisory, mas precisam de
  repeticao para provar preprompt exit `0`.
- Recomendacao: repetir no Round 124 antes de escalar.

### AB-NORMAL-122

- Status: accepted_functional_baseline_lost_all_material_metrics
- Prompt recebido: Round 122 NORMAL OpenCode, repeticao do six-helper split de
  `UnifiedAgentService`.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e seis
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline funcional comparavel.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, diff-check `0`, scans estruturais limpos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-122.md`.
- Risco residual: sem traces atomicos e custo operacional alto.
- Recomendacao: usar como baseline de fechamento do tier seis helpers.

### AB-ATOMIC-122

- Status: accepted_strong_atomic_zero_loss_scale_next
- Prompt recebido: Round 122 ATOMIC OpenCode, repeticao do six-helper split com
  preprompt compacto.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e seis
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como vitoria forte zero-loss; liberar escala
  controlada no Round 123.
- Testes/comandos: preprompt exit `0`, focused Jest `13/13`, focused ESLint
  `0`, touched Kloel typecheck errors `0`, diff-check `0`, scans estruturais
  limpos, `atomicModeClean=true`, traces `56`.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-122.md`.
- Risco residual: typecheck global segue vermelho por ruido Google Ads/Prisma
  fora do escopo.
- Recomendacao: manter compact preprompt output e escalar um degrau.

### AB-NORMAL-121

- Status: accepted_functional_baseline_partial_win
- Prompt recebido: Round 121 NORMAL OpenCode, seis-helper split de
  `UnifiedAgentService`.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e seis
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como baseline funcional comparavel.
- Testes/comandos: focused Jest `13/13`, focused ESLint `0`, touched Kloel
  typecheck errors `0`, diff-check `0`, scans estruturais limpos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-121.md`.
- Risco residual: venceu apenas input tokens; sem traces atomicos.
- Recomendacao: manter como baseline para Round 122.

### AB-ATOMIC-121

- Status: accepted_strong_atomic_with_input_loss
- Prompt recebido: Round 121 ATOMIC OpenCode, seis-helper split com macro
  atomico.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts` e seis
  helpers `backend/src/kloel/unified-agent-*.helpers.ts`.
- Decisao tomada: aceitar como vitoria forte, mas bloquear escala por perda em
  input tokens.
- Testes/comandos: preprompt exit `0`, focused Jest `13/13`, focused ESLint
  `0`, touched Kloel typecheck errors `0`, diff-check `0`, scans estruturais
  limpos, `atomicModeClean=true`, traces `56`.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-121.md`.
- Risco residual: `preprompt-shell` injetou log completo de `136.518` bytes no
  contexto do modelo.
- Recomendacao: repetir no Round 122 apos compactacao do output do preprompt.

### AB-NORMAL-090

- Status: accepted_as_baseline
- Prompt recebido: repetir Round 089 no modo NORMAL OpenCode.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Decisao tomada: aceitar como baseline funcional.
- Testes/comandos: focused Jest `13/13`, `typecheckKloelErrors=0`, lint com 1 erro preexistente, diff-check e scans externos.
- Evidencia: `docs/ai/mission/handoffs/AB-NORMAL-090.md`.
- Risco residual: sem trace atomico e custo operacional alto.
- Recomendacao: manter como baseline.

### AB-ATOMIC-090

- Status: rejected_for_functional_regression
- Prompt recebido: repetir Round 089 no modo ATOMIC OpenCode com `formatWithEslint=true`.
- Arquivos alterados: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Decisao tomada: rejeitar como vitoria; aceitar como detector de regressao do operador.
- Testes/comandos: focused Jest `13/13`, typecheck com 1 erro Kloel, lint com erro Prettier/import, diff-check e scans externos.
- Evidencia: `docs/ai/mission/handoffs/AB-ATOMIC-090.md`.
- Risco residual: fixers ESLint amplos aplicaram mudanca semantica fora da intencao.
- Recomendacao: repetir no Round 091 apos `formatWithEslint` layout-only.

### OC-PULSE-READINESS-001

- Status: accepted
- Prompt recebido: auditar readiness PULSE sem editar codigo; devolver handoff com bloqueios, evidencias e proximo comando seguro.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, artefatos PULSE de readiness/certificate/runtime quando disponiveis.
- Arquivos alterados: nenhum.
- Hipotese inicial: PULSE poderia estar parcialmente operacional mas nao declaravel como final.
- Decisao tomada: confirmar `NOT_READY`; nao declarar 100%.
- Testes/comandos executados: leitura estatica dos artefatos; sem mutacao.
- Evidencia antes/depois: readiness global ainda bloqueada por lacunas de scan/evidencia, Codacy HIGH, arquivos faltantes em inventario, self-trust gaps, executable proof tasks sem evidencia observada, terminal paths sem pass/fail observado e hardcoded-reality debt historico.
- Risco residual: auditoria foi N2/N3 por leitura de artefatos, nao executou production-final completo.
- Recomendacao: rodar validacao curta (`pulse:probes`) e depois rota formal production-final quando ambiente suportar.

### OC-PULSE-READINESS-002

- Status: accepted
- Prompt recebido: auditoria independente de PULSE readiness, sem editar codigo, com foco em declaracao honesta de 100%.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `PULSE_MACHINE_READINESS.json`, `PULSE_CERTIFICATE.json`, `PULSE_RUNTIME_EVIDENCE.json`, `PULSE_PROOF_READINESS.json`, `package.json`.
- Arquivos alterados: nenhum.
- Hipotese inicial: verificar se o PULSE podia sustentar conclusao global.
- Decisao tomada: PULSE nao pode ser declarado pronto; certificado `NOT_CERTIFIED` score 55/100.
- Testes/comandos executados: leitura e classificacao dos artefatos; sem mutacao.
- Evidencia antes/depois:
  - `critical_path_terminal`: 4.883 terminal paths sem observed pass/fail.
  - `proof_readiness`: 2.047 tasks executable, 0 observed, `canAdvance:false`.
  - `external_reality`: 2 stale external adapters / 5 high-impact signals.
  - `self_trust`: phantom capability `Portfolio State`.
  - `runtimePass`: sem runtime evidence coletada no scan-mode final.
  - `staticPass`: 2.225 Codacy HIGH + findings criticas/altas.
  - `scopeClosed`: 20 arquivos referenciados por Codacy ausentes do inventario.
  - `noHardcodedReality`: 223.425 eventos historicos em 544 arquivos.
- Risco residual: nao substitui execucao local do profile final; serve como bloqueio honesto contra overclaim.
- Recomendacao: menor proximo comando seguro `PULSE_BACKEND_URL=https://api.kloel.com npm run pulse:probes`; depois investigar `pulse:json`/production-final.

### OC-SWARM-CONTEXT-AUDIT-001

- Status: accepted
- Prompt recebido: auditar se o context fabric atual e seguro para escalar de micro-onda para 20-50 workers OpenCode.
- Arquivos lidos: regras OpenCode, ledger, registry, scope tree, handoffs e artefatos `.pulse/current/PULSE_CONTEXT_*`, leases, GitNexus e Beads.
- Arquivos alterados: `docs/ai/mission/handoffs/OC-SWARM-CONTEXT-AUDIT-001.md`.
- Hipotese inicial: contexto fresco permitiria escala se leases e handoffs estivessem confiaveis.
- Decisao tomada: nao escalar 20-50 agora.
- Testes/comandos executados: `git log`, `git status`, `ls .atomic-edit-locks/`, `ps` de OpenCode/DeepSeek.
- Evidencia antes/depois: contexto fresco e sem blockers, mas handoff historico era 2/8, lease grande monopolizava centenas de arquivos e escala massiva criaria risco operacional.
- Risco residual: auditoria read-only; nao testa contencao real de 20+ workers.
- Recomendacao: corrigir lease topology, reduzir contexto por worker e exigir handoff persistido.

### OC-SWARM-LEASE-COLLISION-001

- Status: accepted
- Prompt recebido: auditar qualidade dos leases para escala de enxame.
- Arquivos lidos: regras OpenCode, ledger, graveyard, broadcast/leases PULSE e protected governance list.
- Arquivos alterados: `docs/ai/mission/handoffs/OC-SWARM-LEASE-COLLISION-001.md`.
- Hipotese inicial: topologia atual teria monolito, phantoms e readOnly bloat.
- Decisao tomada: topologia rejeitada para swarm de implementacao; aceitavel apenas para ondas read-only/escopos pequenos.
- Testes/comandos executados: resumo Node dos leases, `wc -l`, `git branch`, `git status`, `ls .atomic-edit-locks/`.
- Evidencia antes/depois: 10 leases; `pulse-worker-01` com 580 arquivos; cinco leases com 0 owned files; quatro leases pequenos disjuntos; nenhum protected file nos owned sets.
- Risco residual: gerador PULSE pode sobrescrever ajustes manuais; correcao precisa atingir a fonte dos leases.
- Recomendacao: quebrar monolito, expirar phantoms, reduzir readOnly sets e isolar Risk 3.

### OC-SWARM-OPENCODE-RUNTIME-001

- Status: accepted_with_caveat
- Prompt recebido: auditar readiness local do runtime OpenCode para pool supervisionado.
- Arquivos lidos: regras OpenCode, ledger e handoffs.
- Arquivos alterados: `docs/ai/mission/handoffs/OC-SWARM-OPENCODE-RUNTIME-001.md`.
- Hipotese inicial: OpenCode e DeepSeek estariam prontos, mas memoria poderia limitar escala.
- Decisao tomada: OpenCode/DeepSeek funcionam; o host local nao esta pronto para novos workers massivos.
- Testes/comandos executados: `opencode --version`, `opencode models`, `opencode providers list`, `opencode mcp list`, `opencode session list`, `opencode stats`, `ps`, `vm_stat`, `sysctl`.
- Evidencia antes/depois: OpenCode 1.14.48, `deepseek/deepseek-v4-pro` listado, atomic-edit MCP conectado; host 16GB com swap alto e varios processos `.opencode`.
- Risco residual: o worker tentou consultar config externa de OpenCode e recebeu prompt de permissao; o orquestrador recusou a permissao e aceitou somente evidencia operacional nao sensivel.
- Recomendacao: liberar RAM/swap ou usar host dedicado antes de tentar 20-50 workers.

### OC-SWARM-MISSION-ROUTER-001

- Status: accepted
- Prompt recebido: rotear proxima onda segundo Prompt Mestre e criar 3-5 work units sem duplicacao semantica.
- Arquivos lidos: regras OpenCode, ledger, registry, scope tree, graveyard, handoffs e pasta de handoffs.
- Arquivos alterados: `docs/ai/mission/handoffs/OC-SWARM-MISSION-ROUTER-001.md`.
- Hipotese inicial: VALIDACAO deveria virar modo primario, com ANATOMICO secundario.
- Decisao tomada: rota VALIDACAO -> ANATOMICO; COMERCIAL segue bloqueado ate reconciliacao/grafo/PULSE.
- Testes/comandos executados: `git branch --show-current`, `git status --porcelain | head -20`, `git rev-list --left-right --count origin/main...HEAD`, `git log --oneline -5`.
- Evidencia antes/depois: cinco work units propostos: `VAL-PULSE-PERFECTNESS-SPLIT-001`, `VAL-CERT-GAP-MAP-001`, `ANAT-DIRTY-WORKTREE-001`, `VAL-SCOPE-TREE-BASELINE-001`, `DOC-MISSION-CONSISTENCY-001`.
- Risco residual: divergencia git medida contra `origin/main` nao e a mesma metrica do ledger contra branch remota; precisa reconciliacao formal antes de publish.
- Recomendacao: disparar primeiro os tres workers read-only independentes e revisar handoffs antes de qualquer implementacao.

### OC-ATOMIC-ONLY-VALIDATION-002

- Status: accepted_with_orchestrator_handoff
- Prompt recebido: provar que OpenCode bloqueia mutacoes nao-atomicas de codigo mesmo com `--dangerously-skip-permissions`.
- Arquivos lidos: `AGENTS.md`, `opencode.json`, `.opencode/plugins/workspace-gates.ts`, `scripts/mcp/atomic-edit/atomic-only-hook.mjs`.
- Arquivos alterados: nenhum arquivo de codigo; handoff persistido pelo orquestrador porque `permission.edit=deny` tambem bloqueou native `Write` do worker.
- Hipotese inicial: apos reparo de plugin + permission + hook, native code write e Bash Python code write deveriam ser negados.
- Decisao tomada: aceitar a evidencia operacional; OpenCode agora tem gate runtime para impedir mutacao nao-atomica de codigo.
- Testes/comandos executados: tentativa native Write/Edit-style em `.ts`; tentativa Bash Python `Path.write_text` em `.ts`; `test -f scripts/mcp/atomic-edit/.opencode-native-bypass-test.ts`.
- Evidencia antes/depois: tentativa 001 permitia 4/4 bypasses; tentativa 002 negou as duas mutacoes de codigo exigidas e confirmou `File does not exist (expected)`.
- Risco residual: worker nao conseguiu escrever handoff por native `Write`; isso e consequencia esperada de `permission.edit=deny`, mas exige handoff por saida final ou registro do orquestrador.
- Recomendacao: antes de qualquer novo swarm com escrita, executar worker canario `OC-ATOMIC-ONLY-*` e aceitar somente se native code write e Bash code write forem negados.

### AB-NORMAL-001

- Status: accepted_with_failed_hidden_acceptance
- Prompt recebido: reparar `scripts/mcp/atomic-edit/audit-atomicity.mjs` em workspace isolado usando OpenCode padrao sem atomic-edit, separando enforcement de ratio advisory e adicionando `--strict-ratio`.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs`; alem de config isolada do worktree para desabilitar atomic-edit.
- Hipotese inicial: o auditor devia passar quando `fallback_rate=0` e `coarse_unjustified=0`, mas falhar em strict ratio.
- Decisao tomada: entrega nominal aceita pela propria validacao do worker, mas rejeitada pelo orquestrador como completa porque falhou hard-case sintetico de coarse offender.
- Testes/comandos executados pelo worker: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`.
- Evidencia independente: nominal passou; teste sintetico `native-edit` coarse retornou exit 0 incorretamente; fallback sintetico retornou exit 1 corretamente.
- Benchmark: ~5m33s produtivos; diff alvo `37 insertions / 15 deletions`; word-diff 4.660 bytes; RSS OpenCode ~443.904KB na amostra.
- Risco residual: sem teste sintetico, o worker declarou aceitacao completa apesar de enfraquecer uma regra de enforcement.
- Recomendacao: futuras missoes A/B precisam fornecer hard-cases sinteticos obrigatorios e medir aceite por orquestrador, nao por self-report final.

### AB-ATOMIC-001

- Status: accepted_with_failed_hidden_acceptance
- Prompt recebido: reparar exatamente a mesma falha do auditor em workspace isolado usando somente MCP atomic-edit para mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/audit-atomicity.mjs`, config OpenCode atomic-only.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs`; diffs adicionais de setup atomic-only existiam no worktree por copia dos gates locais.
- Hipotese inicial: separar enforcement de ratio advisory sem enfraquecer fallback/coarse.
- Decisao tomada: entrega nominal aceita pela propria validacao do worker, mas rejeitada pelo orquestrador como completa porque falhou hard-case sintetico de coarse offender.
- Testes/comandos executados pelo worker: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --json`, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --strict-ratio --json`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`; uso visivel de `atomic-edit_atomic_replace_text`.
- Evidencia independente: nominal passou; teste sintetico `native-edit` coarse retornou exit 0 incorretamente; fallback sintetico retornou exit 1 corretamente.
- Benchmark: ~4m24s produtivos; diff alvo `35 insertions / 14 deletions`; word-diff 4.901 bytes; RSS OpenCode ~406.800KB na amostra, mais MCP atomic-edit ~98.576KB.
- Risco residual: a entrega atomica foi mais rapida, mas nao melhor em criterio semantico escondido; nao ha vitoria ampla do atomic ainda.
- Recomendacao: atualizar criterio/tooling antes da proxima rodada; exigir hard-cases sinteticos e comparar qualidade semantica antes de tempo/diff.

### AB-NORMAL-002

- Status: accepted_with_lapida_required
- Prompt recebido: adicionar `--self-test` ao auditor de atomicidade em workspace isolado, usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs` no worktree NORMAL.
- Hipotese inicial: self-test precisa capturar native coarse, fallback e atomic-positive.
- Decisao tomada: usar como insumo, nao copiar diretamente.
- Testes/comandos executados pelo orquestrador: `--json`, `--strict-ratio --json`, `--self-test --json`, `--self-test`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`.
- Evidencia antes/depois: self-test passou 3/3; smoke passou 73/73 no worktree; default audit passou; strict falhou como esperado. A implementacao reescreveu mais e deixou bug potencial de output textual por destructuring errado.
- Risco residual: escrita temporaria em disco e mutacao ampla nao refletem o principio de menor superficie.
- Recomendacao: aproveitar a ideia de caminho compartilhado, mas implementar em memoria e revisar output manualmente.

### AB-ATOMIC-002

- Status: accepted_with_lapida_required
- Prompt recebido: adicionar exatamente o mesmo `--self-test` ao auditor, usando somente modo atomico no worktree ATOMIC.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only e `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs` no worktree ATOMIC; artefatos `.atomic/traces` do worktree ficaram contaminados por validacao sintetica.
- Hipotese inicial: self-test em memoria seria mais compativel com atomic-only.
- Decisao tomada: usar como insumo parcial, nao copiar diretamente.
- Testes/comandos executados pelo orquestrador: `--json`, `--strict-ratio --json`, `--self-test --json`, `--self-test`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`.
- Evidencia antes/depois: self-test passou 3/3; smoke passou 73/73; default audit do worktree falhou por trace sintetico persistido; o caso `native-coarse` do worker usou `fallback=true`, entao nao testava a falha escondida mais importante.
- Risco residual: atomic-only revelou boa pressao de seguranca, mas tambem travou a validacao quando o worker tentou validar por escrita de artefato; precisa de self-tests in-memory e operadores de prova mais ergonomicos.
- Recomendacao: proximas tarefas atomicas devem exigir topologia de preservacao explicita antes da edicao e validacao sem contaminar traces reais.

### AB-NORMAL-003

- Status: accepted_with_lapida_required
- Prompt recebido: adicionar metricas de topologia de preservacao ao auditor de atomicidade em workspace isolado, usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs` no worktree NORMAL.
- Hipotese inicial: o auditor deveria medir `topologyCoverage`, `missingTopology`, `topologyPass` e `--strict-topology`.
- Decisao tomada: usar como insumo parcial, nao copiar diretamente.
- Testes/comandos executados pelo orquestrador: `--self-test --json`, `--self-test`, `--json`, `--strict-ratio --json`, `--strict-topology --json`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, `git diff --check`.
- Evidencia antes/depois: smoke do worktree NORMAL passou 73/73; default/strict commands em worktree sem traces nao provaram comportamento real; hidden validation mostrou que `--strict-topology` nao exercia o contrato do self-test; schema usado foi `topology`, fora do trace real.
- Risco residual: entrega normal parecia verde por ausencia de traces, mas nao provou rastreabilidade atomica nem aderencia ao contrato real.
- Recomendacao: aceitar apenas a ideia de metricas e rejeitar o schema `topology`; usar contrato real de trace no nivel raiz.

### AB-ATOMIC-003

- Status: accepted_with_lapida_required
- Prompt recebido: adicionar a mesma topologia de preservacao ao auditor usando somente modo atomico no worktree ATOMIC.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only e `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs` no worktree ATOMIC; traces reais foram gerados pelo MCP.
- Hipotese inicial: o auditor deveria provar quando traces atomicos carregam topologia de preservacao.
- Decisao tomada: usar como insumo parcial, nao copiar diretamente.
- Testes/comandos executados pelo orquestrador: `--self-test --json`, `--self-test --strict-topology --json`, `--self-test --strict-ratio --json`, `--json`, `--strict-ratio --json`, `--strict-topology --json`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, `git diff --check`.
- Evidencia antes/depois: smoke do worktree ATOMIC retornou 86 passed, 2 failed; falhas foram `eslint dry-run fixes are applied by atomic transaction` por dependencia ESLint ausente no worktree e `eslint analyzer trace records preservation topology`. O self-test normal passou, mas `--self-test --strict-topology --json` falhou porque o caso sem topologia ficou acoplado ao modo estrito.
- Risco residual: a entrega atomica deu melhor sinal de rastreabilidade, mas ainda nao venceu o normal em smoke, self-termination ou robustez de self-test.
- Recomendacao: proxima melhoria deve focar na cobertura topologica real do runtime e na ergonomia de self-test/strict sem contaminar traces reais.

### OC-ATOMIC-RUNTIME-005

- Status: accepted_with_orchestrator_cleanup
- Prompt recebido: canary OpenCode interativo DeepSeek V4 Pro para provar que `atomic_replace_literal` com `preview:true` nao escreve em disco apos o reparo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/server.ts`, fixture temporario `scripts/mcp/atomic-edit/.opencode-preview-fixture.ts`.
- Arquivos alterados: somente fixture temporario; criado por `atomic_create_file`, preservado no preview, esvaziado por `atomic_delete_range`; arquivo vazio removido pelo orquestrador apos a sessao.
- Hipotese inicial: apos o reparo, o operador literal deveria aceitar `preview:true`, validar a proposta e retornar prova sem persistir `'new'`.
- Decisao tomada: aceitar o canary como prova runtime estreita; a falha anterior `OC-ATOMIC-RUNTIME-004` fica rejeitada como entrega final e aceita apenas como detector de regressao.
- Testes/comandos executados:
  - OpenCode confirmou `atomic-edit connected`.
  - `atomic_create_file` criou `export const TARGET = 'old';`.
  - `atomic_replace_literal` com `preview:true` propôs trocar `'old'` por `'new'`.
  - Verificacao posterior confirmou `grep -c "'old'" = 1` e `grep -c "'new'" = 0`.
  - Hook bloqueou `rm` shell; cleanup foi feito por operador atomico e finalizado pelo orquestrador.
- Evidencia antes/depois:
  - Antes do reparo, canary 004 escreveu `MICRO_CHANGE = 33` apesar de dry-run.
  - Depois do reparo, canary 005 preservou o conteudo antigo e produziu traces com topologia.
  - Traces principais: `.atomic/traces/op_1778963653214_8077bbeb.json`, `.atomic/traces/op_1778963663527_8bbdc61c.json`, `.atomic/traces/op_1778963709749_bbbee307.json`.
  - Auditoria do orquestrador: `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T20:33:24.000Z --strict-current-topology --json` passou com `currentTopologyCoverage=1`.
- Risco residual:
  - Handoff foi capturado pelo orquestrador porque o worker ficou em TUI aberta ate Ctrl-C; self-termination ainda precisa melhorar.
  - A prova e estreita para literal preview; nao prova superioridade A/B ampla.
- Recomendacao para proximo subagent: executar a proxima rodada A/B oficial somente depois de canary semelhante e exigir no contrato de aceite preview trace `changed=false`, `afterSha256` real e `proposedSha256`.

### AB-NORMAL-004

- Status: accepted_as_input_only
- Prompt recebido: adicionar auditoria de honestidade de preview trace em `scripts/mcp/atomic-edit/audit-atomicity.mjs`, no worktree NORMAL, usando OpenCode padrao sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: `scripts/mcp/atomic-edit/audit-atomicity.mjs` no worktree NORMAL.
- Hipotese inicial: preview trace deve ser hard-fail quando `preview:true` tambem afirma escrita/rollback como se tivesse persistido.
- Decisao tomada: usar a entrega como insumo parcial, nao copiar diretamente.
- Testes/comandos executados pelo orquestrador: `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs`, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`, `git diff --check -- scripts/mcp/atomic-edit`.
- Evidencia antes/depois: `node --check` e self-test passaram no worktree; a implementacao criou campo proprio `previewEnforcementPass` e casos de preview, mas ficou desalinhada ao contrato final `previewHonestyPass`; smoke do worktree foi contaminado por setup incompleto.
- Benchmark: diff alvo do auditor com word-diff 22.292 bytes; entrega funcional parcial, sem trace atomico de mutacao.
- Risco residual: validacao do worktree nao foi ambiente limpo; a entrega normal venceu ATOMIC em utilidade parcial, mas nao foi aceita como patch final.
- Recomendacao para proximo subagent: manter os hard-cases de preview no contrato, mas exigir nomenclatura e JSON canonicos do auditor principal.

### AB-ATOMIC-004

- Status: rejected_blocked_atomic_tooling
- Prompt recebido: resolver exatamente a mesma tarefa de preview honesty no worktree ATOMIC usando somente modo atomico.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config atomic-only e `scripts/mcp/atomic-edit/audit-atomicity.mjs`.
- Arquivos alterados: nenhuma entrega de codigo aceita; diffs do worktree nao representam patch funcional da rodada.
- Hipotese inicial: OpenCode deveria expor ferramentas MCP `atomic-edit` ou o worker deveria usar fallback atomico aprovado sem sair do contrato.
- Decisao tomada: rejeitar a entrega; o orquestrador encerrou a sessao quando o worker tentou derivar para escrita Bash/Node proibida.
- Testes/comandos executados pelo orquestrador: `node --check scripts/mcp/atomic-edit/audit-atomicity.mjs`, `node scripts/mcp/atomic-edit/audit-atomicity.mjs --self-test --json`, `git diff --check -- scripts/mcp/atomic-edit`, inspeção do tool list observado no OpenCode, e cleanup de processos `opencode run`/`serve`.
- Evidencia antes/depois: tool list observado nao continha `mcp__atomic-edit__*`; self-test do worktree ATOMIC continuou com 4 casos antigos; nenhuma prova de preview honesty foi entregue. Depois do encerramento, `pgrep -fl 'opencode run|opencode serve'` retornou vazio.
- Benchmark: ATOMIC perdeu a rodada por falha de disponibilidade/uso da ferramenta, antes de competir em qualidade de patch.
- Risco residual: enquanto o OpenCode ATOMIC nao enxergar MCP atomic-edit ou fallback standalone atomico aprovado, A/B oficial mede falha de setup, nao superioridade do principio.
- Recomendacao para proximo subagent: primeiro rodar canary de exposicao de ferramenta atomica; se MCP nao aparecer, parar e reportar ou usar fallback standalone explicitamente autorizado no prompt, com `--dry-run`/hash guard e sem Bash/Node writes.

### OC-ATOMIC-TOOL-EXPOSURE-006

- Status: accepted_with_cleanup_gap
- Prompt recebido: canary OpenCode interativo DeepSeek V4 Pro para provar exposicao MCP `atomic-edit`; criar fixture temporario, rodar literal preview sem escrita, verificar conteudo e limpar usando somente ferramenta atomica quando possivel.
- Arquivos lidos: `opencode.json`, `.opencode/plugins/workspace-gates.ts`, `scripts/mcp/atomic-edit/atomic-only-hook.mjs`, fixture temporario `scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts`.
- Arquivos alterados: somente fixture temporario; criado por `atomic_create_file`, preservado por `atomic_replace_literal preview:true`, esvaziado por `atomic_delete_range` e removido pelo orquestrador como residuo zero-byte.
- Hipotese inicial: a falha da rodada A/B 4 era de exposicao/contrato do worker ATOMIC, nao do auditor em si; o OpenCode principal deveria enxergar MCP `atomic-edit` quando carregado no repo correto.
- Decisao tomada: aceitar como canary estreito de runtime e desbloquear repeticao da mesma classe de A/B, sem escalar complexidade.
- Testes/comandos executados pelo orquestrador:
  - `opencode mcp list`: `atomic-edit connected`.
  - `opencode debug config --print-logs --log-level DEBUG`: carregou `opencode.json`, `workspace-gates` e `permission.edit=deny`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:13:00.000Z --strict-current-topology --json`.
  - `pgrep -fl 'opencode run|opencode serve'`.
  - `test ! -e scripts/mcp/atomic-edit/.opencode-tool-exposure-canary.ts`.
- Evidencia antes/depois:
  - Antes: `AB-ATOMIC-004` nao viu ferramentas atomicas e tentou derivar para Bash/Node proibido.
  - Depois: worker usou `atomic_create_file`, `atomic_replace_literal preview:true` e `atomic_delete_range`; preview nao escreveu em disco (`changed=false`) e auditoria da janela passou com `previewHonestyPass=true`, `currentTopologyCoverage=1`, `pass=true`.
- Risco residual:
  - OpenCode ficou preso em TUI apos handoff; orquestrador precisou encerrar PIDs especificos.
  - `atomic_delete_range` remove conteudo mas nao remove o arquivo criado; falta primitiva/politica de cleanup atomico para arquivo temporario.
- Recomendacao para proximo subagent: na proxima A/B oficial, executar preflight curto de exposicao atomica no inicio da missao ATOMIC e exigir self-termination limpa no handoff.

### AB-NORMAL-005

- Status: accepted_as_input_with_main_lapida
- Prompt recebido: implementar `atomic_delete_file` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit, para remover arquivos temporarios criados por `atomic_create_file`.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: delete-file precisa usar a mesma guardrail de governance/root, aceitar `preview` e `expectedSha256`, ser idempotente para ausente e persistir trace honesto.
- Decisao tomada: aceitar como melhor insumo de cobertura, mas nao copiar diretamente; o repo principal recebeu implementacao hibrida revisada.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 110 passed, 0 failed apos symlink ambiental `worker/node_modules`
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:22:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`
  - `git diff --check -- scripts/mcp/atomic-edit`
- Evidencia antes/depois: antes nao havia `atomic_delete_file`; depois o worker provou preview sem delete, commit delete, idempotencia, directory/protected refusal e stale sha refusal.
- Benchmark: ~7m27s produtivos ate nota final; venceu ATOMIC em tempo e cobertura de smoke.
- Risco residual: usou mutacao normal/grosseira e nao deixou trace de edicao do proprio patch; entrega aceita como insumo, nao como prova de superioridade do modo normal.
- Recomendacao para proximo subagent: manter a cobertura do NORMAL como piso minimo para o ATOMIC na proxima rodada.

### AB-ATOMIC-005

- Status: accepted_as_input_with_test_coverage_gap
- Prompt recebido: implementar exatamente a mesma ferramenta `atomic_delete_file` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: com MCP exposto, o worker ATOMIC deveria produzir codigo rastreavel e evitar fallback nao-atomico.
- Decisao tomada: aceitar como prova de runtime atomic-only e insumo de design compacto, mas registrar derrota de cobertura/tempo; nao declarar vitoria atomica ampla.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 107 passed, 0 failed apos symlink ambiental `worker/node_modules`
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:22:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`
  - `git diff --check -- scripts/mcp/atomic-edit`
- Evidencia antes/depois: o worker usou MCP atomic-edit real, gerou traces e provou commit trace `atomic_delete_file` com `changed:true`, `afterSha256` vazio e `semanticImpact=file_deleted`.
- Benchmark: ~9m55s produtivos ate nota final; perdeu para NORMAL em tempo e cobertura de teste.
- Risco residual: o smoke do worker nao cobria stale `expectedSha256` e colocou a prova dentro de bloco menos limpo; precisou de lapida do orquestrador para virar patch final.
- Recomendacao para proximo subagent: ATOMIC deve gerar testes tao completos quanto o NORMAL, incluindo stale sha e leitura do trace persistido, antes de competir em tarefas mais dificeis.

### AB-NORMAL-006

- Status: rejected_timeout_no_mutation
- Prompt recebido: implementar `code_file_stat` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit.
- Arquivos lidos: nao houve handoff final; orquestrador confirmou apenas processo ativo e ausencia de implementacao.
- Arquivos alterados: nenhuma mutacao aceita; o worktree continha base suja copiada, mas sem `code_file_stat`.
- Hipotese inicial: NORMAL poderia entregar rapidamente uma ferramenta read-only com smoke de hash/missing/directory/protected.
- Decisao tomada: rejeitar como entrega; contar apenas como evidencia de timeout/orquestracao.
- Testes/comandos executados pelo orquestrador:
  - `ps -o pid,ppid,stat,rss,etime,command -p 15597,15603,15598,15604`
  - `rg -n "code_file_stat|codeFileStat|file_stat" /tmp/kloel-opencode-ab6-20260516-1840-normal/scripts/mcp/atomic-edit`
  - `pgrep -fl 'opencode run|opencode serve'`
- Evidencia antes/depois: apos mais de 10 minutos, nao havia `code_file_stat`; os PIDs NORMAL foram encerrados (`15597`, `15603`) e nao sobraram processos OpenCode.
- Risco residual: nao avalia qualidade do modo normal; avalia prompt/runtime travado.
- Recomendacao para proximo subagent: repetir AB6b com prompt curto e regra de primeira mutacao/prova em ate 3 minutos.

### AB-ATOMIC-006

- Status: rejected_timeout_no_mutation
- Prompt recebido: implementar a mesma ferramenta `code_file_stat` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: nao houve handoff final; orquestrador confirmou apenas processo ativo e ausencia de implementacao.
- Arquivos alterados: nenhuma mutacao aceita; nao foram encontrados traces atomicos da rodada.
- Hipotese inicial: ATOMIC deveria usar MCP atomic-edit real e entregar ferramenta read-only com trace e smoke equivalentes ao NORMAL.
- Decisao tomada: rejeitar como entrega; contar apenas como evidencia de timeout/orquestracao, nao como derrota tecnica do principio atomico.
- Testes/comandos executados pelo orquestrador:
  - `ps -o pid,ppid,stat,rss,etime,command -p 15597,15603,15598,15604`
  - `rg -n "code_file_stat|codeFileStat|file_stat" /tmp/kloel-opencode-ab6-20260516-1840-atomic/scripts/mcp/atomic-edit`
  - `find /tmp/kloel-opencode-ab6-20260516-1840-atomic/.atomic -type f`
  - `pgrep -fl 'opencode run|opencode serve'`
- Evidencia antes/depois: apos mais de 10 minutos, nao havia `code_file_stat` nem trace atomico; os PIDs ATOMIC foram encerrados (`15598`, `15604`) e nao sobraram processos OpenCode.
- Risco residual: prompt longo e geracao opaca mascaram comparacao tecnica real.
- Recomendacao para proximo subagent: repetir AB6b com prompt curto, preflight `atomic-edit connected` e regra explicita: se MCP atomico nao estiver disponivel, imprimir `ATOMIC_MCP_UNAVAILABLE` e parar.

### AB-NORMAL-006B

- Status: accepted_as_input_with_main_lapida
- Prompt recebido: implementar `code_file_stat` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit e sem primeira fase longa de raciocinio.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: a ferramenta deveria permitir metadados e hash para `expectedSha256` sem expor conteudo de arquivo.
- Decisao tomada: aceitar como melhor insumo de escopo/teste, mas nao copiar diretamente; o repo principal recebeu implementacao hibrida corrigida para hash por bytes brutos.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 116 passed, 0 failed
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:58:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`
  - `git diff --check -- scripts/mcp/atomic-edit`
- Evidencia antes/depois: antes nao havia `code_file_stat`; depois o worker provou file/missing/directory/protected e ausencia de conteudo retornado.
- Benchmark: venceu ATOMIC em escopo menor e handoff final mais completo; perdeu para ATOMIC em rastreabilidade atomica.
- Risco residual: usou mutacao normal e a implementacao calculava hash/bytes a partir de `readUtf8`, suficiente para fixture textual mas fraca para arquivos binarios/bytes brutos.
- Recomendacao para proximo subagent: manter o piso de cobertura do NORMAL, mas exigir que o ATOMIC tambem prove hash por bytes e nao expanda escopo.

### AB-ATOMIC-006B

- Status: accepted_as_input_with_scope_and_timeout_gap
- Prompt recebido: implementar exatamente a mesma ferramenta `code_file_stat` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/guard.ts`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/guard.ts`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: o worker ATOMIC deveria entregar a mesma ferramenta com trace completo e sem native/Bash code mutation.
- Decisao tomada: aceitar como prova de runtime atomic-only e insumo de design, mas registrar derrota parcial de escopo e timeout; nao declarar superioridade atomica ampla.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/guard.ts`
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 118 passed, 0 failed em validacao independente
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T21:58:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`
  - `git diff --check -- scripts/mcp/atomic-edit`
- Evidencia antes/depois: o worker usou MCP atomic-edit real (`atomic_edit_symbol`, `atomic_add_import`, `atomic_replace_text`) e gerou traces com topologia corrente.
- Benchmark: venceu NORMAL em rastreabilidade e prova de ferramenta atomica, mas perdeu em escopo minimo por adicionar `resolveStatTarget` a `guard.ts` e teve timeout interno no smoke da TUI antes da validacao independente.
- Risco residual: hash ainda era calculado via `readUtf8`, e o teste ATOMIC verificava comprimento do hash em vez de igualdade contra bytes brutos.
- Recomendacao para proximo subagent: antes de editar, classificar topologia da mudanca e provar por que qualquer helper extra e necessario; se nao for necessario, manter escopo no mesmo arquivo do handler.

### AB-NORMAL-007

- Status: rejected_as_final_accepted_as_test_input
- Prompt recebido: implementar `atomic_rename_property_key` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts` no worktree NORMAL.
- Hipotese inicial: renomear chave de objeto preservando o valor exigia helper semantico + ferramenta MCP + smoke live.
- Decisao tomada: rejeitar como patch final porque falhou build; aceitar como insumo por ter melhor cobertura live inicial.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> falhou com `PropertyAssignment.setName` inexistente.
- Evidencia antes/depois: o worker adicionou a ferramenta e testes, mas o build bloqueou antes do smoke.
- Benchmark: venceu ATOMIC em cobertura live inicial e clareza do caso de valor preservado; perdeu em corretude compilavel e rastreabilidade atomica.
- Risco residual: sem build verde, nenhuma entrega NORMAL pode ser aceita alem de insumo.
- Recomendacao para proximo subagent: preservar a qualidade dos testes live, mas validar API real do ts-morph antes de declarar pronto.

### AB-ATOMIC-007

- Status: accepted_as_input_with_smoke_gap
- Prompt recebido: implementar exatamente a mesma ferramenta `atomic_rename_property_key` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: a topologia `rename_property_keep_value` deveria ser implementada com mutacao semantica minima e trace atomico.
- Decisao tomada: aceitar como melhor insumo tecnico e prova de runtime atomic-only, mas rejeitar como final porque smoke falhou.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> OK
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 124 passed, 2 failed
- Evidencia antes/depois: o worker usou MCP atomic-edit real e gerou traces; implementacao usou `nameNode.replaceWithText`, mas nao fechou os testes de ambiguidade MCP e keyword/identifier guard.
- Benchmark: venceu NORMAL em build e rastreabilidade; perdeu para NORMAL em cobertura live inicial e nao fechou aceite independente.
- Risco residual: a TUI nao autoencerrou e precisou ser encerrada pelo orquestrador apos mais de 12 minutos.
- Recomendacao para proximo subagent: incluir casos MCP `isError:true` e reserved identifiers no proprio smoke antes do handoff.

### AB-NORMAL-008

- Status: accepted_as_input
- Prompt recebido: implementar `atomic_add_await_to_call` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts` no worktree NORMAL.
- Hipotese inicial: adicionar `await` a uma chamada deveria preservar callee/argumentos e recusar missing, ambiguous e already-awaited.
- Decisao tomada: aceitar como insumo valido; nao copiar diretamente porque nao deixa trace atomico e nao fecha cobertura semantica tao bem quanto a versao hibrida.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 131 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T23:22:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit` -> OK.
- Evidencia antes/depois: entregou ferramenta funcional e validada, sem traces MCP de mutacao porque o modo NORMAL estava proibido de usar atomic-edit.
- Benchmark: venceu ATOMIC em tempo de conclusao (~6m47s) e simplicidade operacional; perdeu em rastreabilidade e cobertura semantica fina.
- Risco residual: a prova de preservacao e mais fraca por nao registrar zonas preservadas via MCP trace.
- Recomendacao para proximo subagent: manter velocidade e concisao, mas adicionar testes de contexto semantico que o compilador pegaria alem da sintaxe.

### AB-ATOMIC-008

- Status: accepted_as_input_with_lapida_needed
- Prompt recebido: implementar exatamente a mesma ferramenta `atomic_add_await_to_call` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/advanced.ts`, `server.ts`, `smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: a topologia `wrap_expression_keep_call` deveria ser implementada com mutacao semantica minima e trace atomico.
- Decisao tomada: aceitar como melhor insumo tecnico e prova de runtime atomic-only; rejeitar como final puro porque perdeu em tempo e nao recusou contexto nao-async.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/advanced.ts`
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 134 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T23:22:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `find .atomic/traces -type f` -> 22 traces.
  - `git diff --check -- scripts/mcp/atomic-edit` -> OK.
- Evidencia antes/depois: o worker usou MCP atomic-edit real, preservou callee/argumentos, adicionou selector de desambiguacao e detalhe `callText`.
- Benchmark: venceu NORMAL em rastreabilidade, prova de ferramenta atomica e cobertura semantica; perdeu em velocidade e deixou a lacuna de contexto async para o orquestrador.
- Risco residual: ainda depende de primitivas de insercao por coordenada em algumas integracoes; isso cria risco de drift quando a estrutura muda durante a mesma rodada.
- Recomendacao para proximo subagent: implementar ou usar insercao semanticamente ancorada por simbolo/test/tool name, evitando `insert_at` por linha quando a intencao e "inserir depois de X".

### AB-NORMAL-009

- Status: accepted_as_input
- Prompt recebido: implementar `atomic_insert_after_anchor` no MCP em workspace isolado NORMAL, usando OpenCode padrao sem atomic-edit para mutacao de implementacao.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: substituir insercao por coordenada por insercao apos ancora textual reduziria drift de linha e preservaria a ancora exatamente.
- Decisao tomada: aceitar como melhor insumo funcional e de cobertura; nao copiar diretamente sem lapida porque faltava recusa explicita de `anchorText` vazio no schema.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 145 passed, 0 failed.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T23:45:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit` -> OK.
- Evidencia antes/depois: antes nao havia `atomic_insert_after_anchor`; depois o worker provou insert live, preview, missing, ambiguous, occurrence, out-of-range e stale sha.
- Benchmark: venceu ATOMIC em tempo, escopo minimo, cobertura de smoke e self-termination; perdeu para ATOMIC em rastreabilidade de mutacao.
- Risco residual: entrega NORMAL nao tem prova MCP de mutacao e nao tinha guard explicito contra ancora vazia.
- Recomendacao para proximo subagent: manter este piso de smoke como minimo para qualquer ferramenta nova.

### AB-ATOMIC-009

- Status: accepted_as_atomic_runtime_evidence_rejected_as_final
- Prompt recebido: implementar exatamente a mesma ferramenta `atomic_insert_after_anchor` no worktree ATOMIC usando somente MCP atomic-edit para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, config OpenCode atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`, `scripts/mcp/atomic-edit/engine.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/engine.ts` e parcialmente `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: a topologia `insert_after_anchor_keep_anchor` deveria ser implementada com mutacao minima, trace e sem coordenada fragil.
- Decisao tomada: rejeitar como final porque violou escopo, ficou incompleto em smoke e perdeu em tempo; aceitar apenas como evidencia de runtime atomic-edit real.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node --check scripts/mcp/atomic-edit/engine.ts`
  - `node scripts/mcp/atomic-edit/build.mjs` -> OK.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> 135 passed, 0 failed, mas sem cobertura comportamental da nova ferramenta.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-16T23:45:00.000Z --strict-current-topology --json` -> `pass=true`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `find .atomic/traces -type f -mmin -40` -> traces presentes.
- Evidencia antes/depois: o worker usou MCP atomic-edit real, mas adicionou helper em `engine.ts` fora do escopo contratado e nao completou os cenarios live exigidos.
- Benchmark: venceu NORMAL apenas em rastreabilidade/prova atomica; perdeu em tempo, escopo, cobertura, handoff e aceite independente da tarefa especifica.
- Risco residual: o modo ATOMIC ainda precisa de enforcement de escopo editavel e template obrigatorio de smoke, porque usar ferramenta atomica nao garante boa escolha de fronteira.
- Recomendacao para proximo subagent: antes de editar, declarar arquivos permitidos e checar `git diff --name-only` contra esse allowlist; se sair do escopo, parar e reportar em vez de continuar.

### AB-NORMAL-010

- Status: accepted_as_input_with_main_lapida
- Prompt recebido: implementar `scripts/mcp/atomic-edit/worker-scope-check.mjs` e smoke Part H, usando OpenCode normal sem atomic-edit, em worktree isolado.
- Arquivos lidos: `AGENTS.md`, `scripts/decomp/opencode-subagent-delegation-rules.md`, `scripts/mcp/atomic-edit/smoke.ts` e contexto do `scripts/mcp/atomic-edit`.
- Arquivos alterados: `scripts/mcp/atomic-edit/worker-scope-check.mjs`, `scripts/mcp/atomic-edit/smoke.ts`.
- Hipotese inicial: um CLI read-only por `git status --porcelain=v1` pode virar gate de aceite para workers e impedir escopo vazado.
- Decisao tomada: aceitar como melhor base funcional da rodada, mas nao como entrega direta sem lapida do orquestrador.
- Testes/comandos executados: `node --check` no CLI e smoke, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, `git diff --check`.
- Evidencia antes/depois: smoke independente do worktree retornou `161 passed, 7 failed`; as 7 falhas eram ambientais do bloco ESLint do worktree. O bloco `worker-scope-check` passou completo, incluindo allowlist, required, JSON, violacoes, directory allow, `--repo` e read-only.
- Benchmark: venceu ATOMIC em correcao funcional e cobertura do bloco novo; perdeu requisito de self-termination porque precisou ser encerrado pelo orquestrador apos ~11m.
- Risco residual: a implementacao normal nao deixou traces MCP e ainda dependeu do orquestrador para integrar por fallback atomico.
- Recomendacao para proximo subagent: transformar a cobertura NORMAL em template obrigatorio do modo ATOMIC e exigir autoencerramento curto com prova em ate 3 minutos.

### AB-ATOMIC-010

- Status: accepted_as_trace_only_failed_functional_acceptance
- Prompt recebido: implementar a mesma tarefa `worker-scope-check` usando somente MCP atomic-edit/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/smoke.ts` e contexto atomic-only do worktree.
- Arquivos alterados: `scripts/mcp/atomic-edit/worker-scope-check.mjs`, `scripts/mcp/atomic-edit/smoke.ts`; diffs de setup `.opencode/**` existiam no worktree para carregar plugin e nao contam como entrega do worker.
- Hipotese inicial: o modo ATOMIC deveria vencer por escopo rastreavel e mutacao minima, mantendo cobertura equivalente ao NORMAL.
- Decisao tomada: rejeitar como entrega funcional final; aceitar apenas a rastreabilidade/traces como evidencia parcial.
- Testes/comandos executados: `node --check`, `node scripts/mcp/atomic-edit/build.mjs`, `npx tsx scripts/mcp/atomic-edit/smoke.ts`, auditor `--strict-current-topology`.
- Evidencia antes/depois: auditor da janela passou com `pass=true`, `currentTopologyCoverage=1`, mas smoke independente retornou `157 passed, 18 failed`; 11 falhas eram do bloco novo `worker-scope-check` e mostram erro funcional real (`a.txt` parseado como `.txt`, allowlist/required/json/directory cases quebrados).
- Benchmark: venceu apenas em rastreabilidade; perdeu em funcionalidade, cobertura, convergencia, autoencerramento e aceite independente.
- Risco residual: o MCP exposto ao orquestrador fechou transporte ao tentar preencher arquivo novo e nao disponibilizou `atomic_create_file`; isso precisa virar tarefa de tooling antes de escalar complexidade.
- Recomendacao para proximo subagent: corrigir exposicao/estabilidade de `atomic_create_file`, usar `worker-scope-check` como gate externo e nao declarar pronto sem `npx tsx smoke.ts` verde.

### AB-NORMAL-011

- Status: accepted_as_best_functional_coverage_with_main_lapida
- Prompt recebido: endurecer `atomic_create_file` com `expectedSha256`, parent dirs, preview sem escrita, recusa non-empty, empty-file fill, protected refusal e smoke `.mjs`, usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: criacao de arquivo precisa ser operador atomico de primeira classe para evitar fallback shell/heredoc em decomposicoes futuras.
- Decisao tomada: aceitar como melhor base funcional e de cobertura, mas nao como entrega direta; aplicar versao hibrida no repo principal.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `177 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: o worker cobriu preview sem criar arquivo nem parent dir, commit com parent dirs, existing non-empty refusal, empty fill, stale sha, correct sha, protected refusal e `.mjs`.
- Benchmark: venceu ATOMIC em cobertura funcional; empatou negativamente em self-termination porque tambem exigiu corte pelo orquestrador; perdeu em rastreabilidade de mutacao.
- Risco residual: entrega normal nao deixa traces MCP e inseriu bloco longo de smoke por fluxo de edicao normal.
- Recomendacao para proximo subagent: manter este nivel de cobertura como piso obrigatorio do modo ATOMIC.

### AB-ATOMIC-011

- Status: accepted_as_trace_evidence_rejected_as_best_functional_coverage
- Prompt recebido: mesma missao `atomic_create_file`, mas usando somente MCP/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, config atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: a topologia de criacao de arquivo deveria ser provada por mutacoes rastreadas, com smoke equivalente ao NORMAL.
- Decisao tomada: aceitar evidencia de runtime atomic-only e traces, mas rejeitar como melhor cobertura funcional da rodada.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `172 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:39:00.000Z --strict-current-topology --json` -> `pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: traces de `server.ts` e `smoke.ts` existem; auditoria corrente passou; smoke de create_file passou onde existia.
- Benchmark: venceu NORMAL em rastreabilidade/prova atomic-only; perdeu em cobertura funcional porque nao provou parent-dir creation e fez menos checks de create_file; perdeu tambem autoencerramento.
- Risco residual: o modo ATOMIC ainda precisa de template de cobertura e limite de macro-insercao para blocos de teste longos.
- Recomendacao para proximo subagent: antes do handoff, comparar coverage checklist contra NORMAL e recusar entrega se qualquer criterio de aceite da missao nao tiver teste equivalente.

### AB-NORMAL-012

- Status: accepted_as_best_functional_coverage_with_main_lapida
- Prompt recebido: implementar `atomic_insert_before_anchor` com anchor preservada, occurrence, expectedSha256, preview e smoke completo, usando OpenCode normal sem atomic-edit.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: o operador before-anchor fecha a familia de insercoes ancoradas e reduz drift de coordenadas em blocos longos.
- Decisao tomada: aceitar como melhor base funcional e de cobertura, mas nao como entrega direta; aplicar versao hibrida no repo principal e reparar `worker-scope-check` para ignorar `.atomic`.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `187 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: o worker cobriu live insert, anchor preservada, preview, missing anchor, empty anchor, ambiguity, occurrence, out-of-range e stale sha.
- Benchmark: venceu ATOMIC em cobertura funcional e aceite comportamental; perdeu em rastreabilidade atomic-only e tambem falhou self-termination.
- Risco residual: entrega normal nao deixa traces MCP e precisou de lapidacao do orquestrador para remover contaminacao `.atomic` do scope gate.
- Recomendacao para proximo subagent: usar esse checklist como piso minimo obrigatorio do modo ATOMIC.

### AB-ATOMIC-012

- Status: accepted_as_trace_evidence_rejected_as_best_functional_coverage
- Prompt recebido: mesma missao `atomic_insert_before_anchor`, mas usando somente MCP/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, config atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: o modo ATOMIC deveria manter rastreabilidade e entregar cobertura igual ou superior ao NORMAL.
- Decisao tomada: aceitar evidencia de runtime atomic-only e traces, mas rejeitar como melhor cobertura funcional da rodada.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`
  - `node --check scripts/mcp/atomic-edit/smoke.ts`
  - `node scripts/mcp/atomic-edit/build.mjs`
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts` -> `177 passed, 7 failed` no worktree, com 7 falhas ambientais de ESLint.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T00:58:00.000Z --strict-current-topology --json` -> `pass=true`, `currentTopologyCoverage=1`, `fallback_rate=0`, `coarse_unjustified=0`.
  - `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts` -> passou.
- Evidencia antes/depois: traces existem, auditoria corrente passou, mas o smoke comportamental de `atomic_insert_before_anchor` ficou incompleto.
- Benchmark: venceu NORMAL em rastreabilidade/prova atomic-only; perdeu em cobertura funcional, aceite comportamental e autoencerramento.
- Risco residual: o modo ATOMIC ainda precisa de template obrigatorio de aceite e controle para nao trocar cobertura de comportamento por apenas rastreabilidade.
- Recomendacao para proximo subagent: antes do handoff, comparar a lista de criterios da tarefa com testes executaveis e recusar a propria entrega se faltar smoke para qualquer criterio.

### AB-NORMAL-013B

- Status: accepted_as_negative_control_blocked
- Prompt recebido: implementar `atomic_replace_between_anchors` sem usar atomic-edit, semantic-edit, MCP atomic ou qualquer ferramenta atomica; se native edit fosse negado, parar e reportar `BLOCKED_BY_ATOMIC_ONLY_HOOK`.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`, superficies de contexto atomico.
- Arquivos alterados: nenhum.
- Hipotese inicial: se o OpenCode normal ainda conseguisse editar codigo, o gate atomic-only estaria incompleto.
- Decisao tomada: aceitar como controle negativo bem-sucedido; rejeitar como entrega funcional porque nenhum codigo foi escrito.
- Testes/comandos executados pelo orquestrador:
  - Poll TUI OpenCode interativo confirmou handoff final com `Status: BLOCKED_BY_ATOMIC_ONLY_HOOK`.
  - `git -C /tmp/kloel-opencode-ab13-20260516-2216-normal status --short`: sem delta alvo registrado antes do encerramento.
  - `pgrep -af 'opencode (run|serve)' || true`: vazio apos encerramento controlado dos PIDs da rodada.
- Evidencia antes/depois: tentativa de native edit em codigo foi negada pela regra `TUI-abolished rule: native Edit on code is banned`; worker declarou que nao usou Bash, shell heredoc, sed, perl, Python, Node, cat, tee ou outro bypass de escrita.
- Benchmark: perdeu em entrega funcional, cobertura, tempo util e resultado de produto; venceu apenas como prova de enforcement porque nao violou a regra apos o bloqueio.
- Risco residual: controle normal bloqueado nao mede qualidade comparativa de um normal que pudesse escrever; serve para provar politica, nao superioridade ampla.
- Recomendacao para proximo subagent: separar explicitamente canario de enforcement e benchmark competitivo. O controle normal deve continuar bloqueado; a competicao real deve ocorrer entre estrategias atomicas com criterios de tempo/cobertura/self-termination.

### AB-ATOMIC-013B

- Status: accepted_as_functional_winner_with_main_lapida
- Prompt recebido: mesma missao `atomic_replace_between_anchors`, usando somente MCP/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, config atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree ATOMIC, via MCP atomic-edit.
- Hipotese inicial: um operador "replace between anchors" fecha a topologia de preservacao de wrappers/anchors e reduz reescrita de linha/bloco quando so o miolo entre duas ancoras muda.
- Decisao tomada: aceitar como vencedor funcional da rodada e portar o delta validado para o repo principal com lapida minima do orquestrador.
- Testes/comandos executados pelo orquestrador no worktree:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `207 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/worker-scope-check.mjs --repo . --allow scripts/mcp/atomic-edit/server.ts --allow scripts/mcp/atomic-edit/smoke.ts --require scripts/mcp/atomic-edit/server.ts --require scripts/mcp/atomic-edit/smoke.ts --json`: `ok=true`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T01:16:00.000Z --strict-current-topology --json`: `pass=true`, `currentTopologyCoverage=1`, `previewHonestyPass=true`.
  - `git diff --check -- scripts/mcp/atomic-edit`: passou.
- Testes/comandos executados no repo principal apos lapida:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `207 passed, 0 failed`.
  - `node scripts/mcp/atomic-edit/audit-atomicity.mjs --since=2026-05-17T01:16:00.000Z --strict-current-topology --json`: `pass=true`, `fallback_rate=0`, `coarse_unjustified=0`, `previewHonestyPass=true`, `currentTopologyCoverage=1`.
  - `git diff --check -- scripts/mcp/atomic-edit`: passou.
- Evidencia antes/depois: tool count subiu para 34; novo operador preserva anchors e substitui apenas texto entre elas; smoke cobre sucesso, preview, falhas de selecao e stale sha.
- Benchmark: venceu NORMAL em tudo que era funcionalmente mensuravel nesta rodada porque NORMAL foi bloqueado pelo enforcement atomic-only. Tambem venceu rastreabilidade, cobertura de tarefa e validacao independente.
- Risco residual: TUI nao autoencerrou limpa; o orquestrador precisou encerrar sessoes apos handoff. No main, o MCP primario da sessao estava com transporte fechado e o orquestrador usou fallback offline atomico; uma insercao inicial escapou `\n` literal e foi reparada por substituicao atomica exata antes da validacao verde.
- Recomendacao para proximo subagent: para medir superioridade real alem do enforcement, comparar duas estrategias atomicas ou um normal restrito a leitura/proposta sem mutacao; exigir handoff autoencerrado, payload multiline seguro e `worker-scope-check` contra worktree isolado.

### AB-NORMAL-014

- Status: accepted_as_round_winner_with_main_lapida
- Prompt recebido: implementar `atomic_replace_text_in_anchor_region` no worktree NORMAL, podendo usar OpenCode padrao de fabrica e proibido de usar atomic-edit.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts` no worktree NORMAL.
- Hipotese inicial: o operador deveria preservar anchors, substituir somente `oldText` dentro da regiao e provar ambiguidades por `regionOccurrence`/`textOccurrence`.
- Decisao tomada: aceitar como melhor entrega funcional do round, mas nao copiar diretamente sem lapida.
- Testes/comandos executados pelo orquestrador:
  - `node --check scripts/mcp/atomic-edit/server.ts`: passou.
  - `node --check scripts/mcp/atomic-edit/smoke.ts`: passou.
  - `node scripts/mcp/atomic-edit/build.mjs`: passou.
  - `node scripts/mcp/atomic-edit/worker-scope-check.mjs --repo . --allow scripts/mcp/atomic-edit/server.ts --allow scripts/mcp/atomic-edit/smoke.ts --require scripts/mcp/atomic-edit/server.ts --require scripts/mcp/atomic-edit/smoke.ts --json`: `ok=true`.
  - `git diff --check -- scripts/mcp/atomic-edit`: passou.
  - `npx tsx scripts/mcp/atomic-edit/smoke.ts`: `219 passed, 7 failed` por falhas ambientais de ESLint no worktree; os testes novos da ferramenta passaram.
- Evidencia antes/depois: tool count 35, smoke novo cobriu sucesso, preview, missing anchors, entradas vazias, oldText externo preservado, regioes ambiguas, regionOccurrence, textOccurrence, out-of-range e stale sha.
- Benchmark: venceu ATOMIC em tempo ate entrega util, cobertura, completude de validacao e handoff.
- Risco residual: usou native edit e nao gera trace atomico; implementacao tinha busca de oldText sobreposta (`t += 1`), que foi trocada na versao final por match nao sobreposto.
- Recomendacao para proximo subagent: o checklist funcional do NORMAL vira piso minimo obrigatorio para o modo ATOMIC em rounds futuros.

### AB-ATOMIC-014

- Status: rejected_as_delivery_accepted_as_algorithm_input
- Prompt recebido: mesma missao `atomic_replace_text_in_anchor_region`, usando somente MCP/atomic tools para qualquer mutacao de codigo.
- Arquivos lidos: `AGENTS.md`, regras OpenCode, config atomic-only, `scripts/mcp/atomic-edit/server.ts`, `scripts/mcp/atomic-edit/smoke.ts`.
- Arquivos alterados: `scripts/mcp/atomic-edit/server.ts` no worktree ATOMIC.
- Hipotese inicial: o modo ATOMIC deveria manter rastreabilidade e entregar a mesma cobertura do NORMAL com menor superficie de mutacao.
- Decisao tomada: rejeitar como entrega final porque nao houve smoke nem handoff final aceitavel; aceitar apenas o fragmento de algoritmo revisado pelo orquestrador.
- Testes/comandos executados pelo orquestrador:
  - Inspecao do diff mostrou somente `scripts/mcp/atomic-edit/server.ts` alterado.
  - Nenhum smoke novo foi entregue pelo worker.
  - A sessao foi encerrada pelo orquestrador apos ficar presa em planejamento/geracao.
- Evidencia antes/depois: o worker parcial usou match nao sobreposto dentro da regiao (`tOffset += oldText.length`), decisao melhor que a versao NORMAL inicial para a semantica de `textOccurrence`; porem sem teste, sem handoff e sem validacao propria isso nao conta como entrega aceita.
- Benchmark: perdeu em produtividade, cobertura, validacao independente e autoencerramento; venceu apenas como insumo parcial de topologia/algoritmo usado na versao hibrida final.
- Risco residual: planejamento longo e falta de primeira prova em tempo util continuam bloqueando superioridade do modo ATOMIC.
- Recomendacao para proximo subagent: primeira mutacao atomica em ate 3 minutos, depois smoke minimo imediatamente; se a ferramenta MCP nao estiver disponivel ou a primeira transacao falhar, reportar bloqueio em vez de continuar planejando.

### AB-NORMAL-045

- Status: accepted_as_round_winner_on_operational_economy
- Prompt recebido: refatorar `backend/src/kloel/unified-agent.service.ts` em worktree isolado, sem atomic-edit, preservando comportamento, classe/constructor/public methods e sem tocar spec.
- Arquivos lidos: `backend/src/kloel/unified-agent.service.ts`, servicos/helpers `unified-agent*`, diff/protected status e spec alvo.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-predecided-actions.part.ts`, novos helpers `unified-agent-message-context.helpers.ts`, `unified-agent-runtime.helpers.ts`, `unified-agent-tool-calls.helpers.ts`, `unified-agent-tool-router.ts`.
- Hipotese inicial: decompor responsabilidades internas preservando API publica e deixando o service com ate 350 linhas.
- Decisao tomada: aceitar como lane funcional e vencedor operacional da rodada 045.
- Testes/comandos executados:
  - `npm --prefix backend ci`: passou com warning de Node `v25.9.0` vs engine `>=22 <23`.
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`.
  - `npm --prefix backend run typecheck`: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Spec diff vazio; protected diff somente `AGENTS.md` ja sujo.
- Evidencia antes/depois: service `737 -> 345` linhas; largest helper `280`; eventos `112`, comandos `42`, input tokens `1,692,185`, output `23,503`, reasoning `8,063`.
- Benchmark: venceu ATOMIC em duracao, eventos, comandos, tokens e largest helper; perdeu em facade menor, traceabilidade e ausencia de file_change nativo.
- Risco residual: nao gera trace atomico e usou edicao normal; `AGENTS.md` aparece dirty por contaminacao de memoria/contexto do worktree.
- Recomendacao para proximo subagent: o ATOMIC precisa receber mapa de extracao compacto e limite explicito de largest helper para competir com esta economia operacional.

### AB-ATOMIC-045

- Status: accepted_as_functional_lane_rejected_as_benchmark_winner
- Prompt recebido: mesma missao de refactor medio multi-arquivo, usando somente atomic-edit MCP ou `atomic-call.cjs`, com paths absolutos no worktree.
- Arquivos lidos: target service, atomic helper docs via prompt, partes relevantes de `server.ts`, `agent-runtime`, `unified-agent.types.ts` e checks de estrutura.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novos helpers `unified-agent-message-processor.ts`, `unified-agent-tool-router.ts`, `unified-agent.shared.ts`, e `.atomic/traces` do worktree.
- Hipotese inicial: o modo ATOMIC deveria preservar API publica, produzir facade menor, manter traces e eliminar o erro de root errado do round 44.
- Decisao tomada: aceitar como entrega funcional e como prova de path isolation, mas rejeitar como vencedor porque perdeu economia operacional.
- Testes/comandos executados:
  - `npm --prefix backend ci`: passou com warning de Node `v25.9.0` vs engine `>=22 <23`.
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`, inclusive rerun apos cleanup.
  - `npm --prefix backend run typecheck`: passou, inclusive rerun apos cleanup.
  - `git diff --check -- backend/src/kloel`: passou.
  - Spec diff vazio; protected diff somente `AGENTS.md` ja sujo.
  - `trace-isolation-check`: `ok=true`, `worktreeTraceCount=14`, `matchingTraceIds=[]`.
- Evidencia antes/depois: service `737 -> 197` linhas; largest helper `366`; `0` native file_change items; `6` MCP calls; `14` traces; eventos `180`, comandos `74`, input tokens `5,167,577`, output `33,010`, reasoning `13,989`.
- Benchmark: venceu em facade menor, traceabilidade, path isolation e pureza de mutacao; perdeu para NORMAL em tempo, eventos, comandos, tokens e largest helper.
- Risco residual: ainda ha overhead cognitivo/operacional alto; prompt permitiu leituras/provas demais; largest helper nao foi alvo primario; houve falhas de comando evitaveis antes da lapida (`atomic-call --help`, checagem shell de trace).
- Recomendacao para proximo subagent: usar `trace-isolation-check.cjs`, prompt de refactor ultracompacto com mapa de extracao, zero leituras longas de governance, limite de largest helper e handoff final curto.

### AB-NORMAL-055

- Status: accepted_as_round_winner_on_operational_economy
- Prompt recebido: extrair `formatPromptValue` de `backend/src/kloel/unified-agent.service.ts` para `backend/src/kloel/unified-agent-runtime.helpers.ts`, sem usar atomic-edit.
- Arquivos lidos: `backend/src/kloel/unified-agent.service.ts` e arquivos `unified-agent*` relacionados por busca.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: extracao pequena deveria preservar comportamento com diff minimo.
- Decisao tomada: aceitar como lane funcional e vencedor operacional do round 055.
- Testes/comandos executados:
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`.
  - `npm --prefix backend run typecheck`: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: service `737 -> 712` linhas; eventos `39`, comandos `9`, failed commands `0`, input tokens `56,874`, output `2,132`, reasoning `1,099`.
- Benchmark: venceu ATOMIC em eventos/comandos/tokens/failed commands/acabamento; perdeu em traceabilidade e protecao `expectedSha256`.
- Risco residual: usou editor normal e nao gera prova atomica.
- Recomendacao para proximo subagent: o ATOMIC precisa preservar o mesmo acabamento e reduzir overhead sem perder traces.

### AB-ATOMIC-055

- Status: accepted_as_functional_lane_rejected_as_benchmark_winner
- Prompt recebido: mesma missao de extracao bounded, usando somente atomic-edit para mutacoes de codigo.
- Arquivos lidos: `unified-agent.service.ts`, outline/symbol de `formatPromptValue`, status/diff e validacoes.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`, traces `.atomic` e `docs/ai/traces`.
- Hipotese inicial: extracao via atomic tools deveria manter rastreabilidade e reduzir superficie de confianca.
- Decisao tomada: aceitar como entrega funcional, rejeitar como vencedor por overhead e acabamento inferior.
- Testes/comandos executados:
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`.
  - `npm --prefix backend run typecheck`: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
  - `trace-isolation-check`: `ok=true`, `matchingTraceIds=[]`.
- Evidencia antes/depois: eventos `52`, comandos `10`, failed command `1`, input `58,417`, output `2,828`, reasoning `2,247`; `atomic_create_file`, `atomic_add_import`, `atomic_edit_symbol`; uma tentativa stale `expectedSha256` recusada sem escrita.
- Benchmark: venceu rastreabilidade, protecao contra write stale e pureza de mutacao; perdeu economia operacional e quote style.
- Risco residual: tentativa inicial de `atomic-call.cjs` com path relativo falhou; `atomic_add_import` gerou aspas duplas; service ficou 1 linha maior.
- Recomendacao para proximo subagent: apos a lapida, repetir mesma tarefa com `atomic-call` aceitando path relativo e `atomic_add_import` preservando quote style.

### AB-NORMAL-056

- Status: accepted_as_round_winner_on_operational_economy
- Prompt recebido: repetir a extracao bounded de `formatPromptValue` sem usar atomic-edit.
- Arquivos lidos: `backend/src/kloel/unified-agent.service.ts`; busca/glob para o helper alvo.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: a extracao pequena deveria preservar comportamento com diff minimo.
- Decisao tomada: aceitar como lane funcional e vencedor operacional do round 056.
- Testes/comandos executados:
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`.
  - `npm --prefix backend run typecheck`: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `31`, comandos `5`, input `56,279`, output `2,219`, reasoning `470`, service final `712` linhas.
- Benchmark: venceu ATOMIC em eventos/comandos/tokens/raciocinio; perdeu em traceabilidade.
- Risco residual: usou ferramentas nativas normais e nao gera prova atomica.
- Recomendacao para proximo subagent: usar o resultado NORMAL como piso operacional que ATOMIC precisa bater sem violar modo atomico.

### AB-ATOMIC-056

- Status: accepted_as_functional_lane_rejected_as_benchmark_winner_and_atomic_mode_clean
- Prompt recebido: mesma extracao bounded usando atomic-edit para mutacoes.
- Arquivos lidos: `formatPromptValue` por `code_read_symbol`, outline da service, leituras nativas adicionais de service/helper.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`, traces `.atomic` e `docs/ai/traces`.
- Hipotese inicial: toolchain lapidada do round 055 eliminaria failed command/quote style e reduziria overhead.
- Decisao tomada: aceitar como entrega funcional, rejeitar como vencedor e rejeitar disciplina atomica completa.
- Testes/comandos executados:
  - `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`: passou `13/13`.
  - `npm --prefix backend run typecheck`: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
  - `trace-isolation-check`: `ok=true`, `matchingTraceIds=[]`.
- Evidencia antes/depois: eventos `70`, comandos `10`, input `57,578`, output `3,606`, reasoning `4,573`; `6` MCP calls; `atomicModeClean=false`; `5` native `read`; `1` shell hash read.
- Benchmark: venceu traceability e isolamento; perdeu economia operacional e disciplina atomic-only.
- Risco residual: OpenCode ainda pode usar read/glob/shell reads no lane ATOMIC quando apenas instruido por prompt; precisamos de prompt/gate/auditor mais estritos.
- Recomendacao para proximo subagent: nao usar `read`, `glob`, `grep`, `write`, `edit`, shell code reads ou hash via shell; use `code_outline`, `code_read_symbol`, `code_file_stat`, `atomic_create_file`, `atomic_add_import`, `atomic_edit_symbol`, `atomic_replace_text` e valide por comandos permitidos.

### AB-NORMAL-057

- Status: accepted_as_functional_lane_and_operational_winner
- Prompt recebido: repetir a extracao bounded de `formatPromptValue` sem usar atomic-edit.
- Arquivos lidos: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent.service.spec.ts`, busca/glob do helper alvo.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal resolveria a extracao com menor overhead.
- Decisao tomada: aceitar como lane funcional e vencedor operacional do round 057.
- Testes/comandos executados:
  - Jest focado `src/kloel/unified-agent.service.spec.ts`: passou `13/13`.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `52`, comandos `16`, input `53,679`, output `3,071`, reasoning `951`, service final `712` linhas.
- Benchmark: venceu ATOMIC em eventos, input/reasoning tokens, failed commands e acabamento de linha final.
- Risco residual: usou native `read`/`write`/`edit`/`glob`, logo nao oferece prova atomica.
- Recomendacao para proximo subagent: manter este resultado como piso de economia que ATOMIC precisa superar sem perder trace.

### AB-ATOMIC-057

- Status: accepted_as_functional_lane_rejected_as_benchmark_winner
- Prompt recebido: mesma extracao bounded usando somente modo atomico.
- Arquivos lidos: `formatPromptValue` e service/helper via wrapper `atomic-call.cjs` e ferramentas `code_*`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, novo `backend/src/kloel/unified-agent-runtime.helpers.ts`, traces `.atomic`.
- Hipotese inicial: toolchain sincronizada e proibicao de native file tools eliminariam a derrota do round 056.
- Decisao tomada: aceitar como entrega funcional e como `atomicModeClean`, rejeitar como vencedor global.
- Testes/comandos executados:
  - Jest focado `src/kloel/unified-agent.service.spec.ts`: passou `13/13`.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `matchingTraceIds=[]`, `.atomic/traces=3`.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `55`, comandos `15`, input `58,455`, output `2,699`, reasoning `7,773`, `atomicModeClean=true`, service final `713` linhas.
- Benchmark: venceu traceability, zero native file tools, output tokens e comandos shell; perdeu economia cognitiva e acabamento.
- Risco residual: aliases rigidos (`filePath`, `specifier`, `action`) e cleanup de whitespace exato geraram failed commands evitaveis.
- Recomendacao para proximo subagent: usar aliases agora normalizados pelo wrapper, evitar cleanup cosmético se nao altera comportamento, e manter handoff compacto.

### AB-NORMAL-058

- Status: rejected_scope_runaway_timeout
- Prompt recebido: repetir a extracao bounded de `formatPromptValue` sem atomic-edit.
- Arquivos lidos: service, spec, `unified-agent-shared.ts`, `unified-agent-message-flow.ts`, tsconfig e buscas no backend.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e 5 novos helpers/fluxos Kloel.
- Hipotese inicial: baseline normal poderia repetir a extracao pequena.
- Decisao tomada: rejeitar como benchmark winner apesar dos gates verdes, por timeout e escopo muito maior que a intencao.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `80`, comandos `11`, input `67,403`, output `4,003`, reasoning `9,550`, touched Kloel files `6`, service churn `628`.
- Benchmark: venceu ATOMIC em service line count, source churn, shell command count e output tokens; perdeu em touched file count, eventos e input/reasoning.
- Risco residual: usou native tools e transformou tarefa pequena em refatoracao ampla.
- Recomendacao para proximo subagent: respeitar limite de dois source files e encerrar assim que os gates minimos passam.

### AB-ATOMIC-058

- Status: rejected_scope_runaway_timeout_and_atomic_mode_dirty
- Prompt recebido: mesma extracao bounded usando somente modo atomico.
- Arquivos lidos/alterados: service, runtime helper, message helpers/processors/router e traces `.atomic`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, 4 novos arquivos Kloel e traces.
- Hipotese inicial: aliases do wrapper reduziriam falhas e manteriam `atomicModeClean=true`.
- Decisao tomada: rejeitar como winner apesar dos gates verdes, por timeout, escopo expandido e `atomicModeClean=false`.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou na validacao externa.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `matchingTraceIds=[]`, `.atomic/traces=13`.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `78`, comandos `25`, input `55,818`, output `4,651`, reasoning `8,962`, touched Kloel files `5`, service churn `648`, `atomicModeClean=false`.
- Benchmark: venceu em trace, eventos, input/reasoning e arquivos tocados; perdeu em shell commands, output, service churn e disciplina atomic-only.
- Risco residual: `head`, pipeline mascarando atomic-call, aliases de schema incompletos e `atomic_create_file expectedSha256` inadequado.
- Recomendacao para proximo subagent: zero shell reads/pipelines; usar aliases contextuais corrigidos; manter exatamente dois arquivos tocados; parar antes de decompor service inteiro.

### AB-NORMAL-059

- Status: accepted_baseline
- Prompt recebido: repetir a extracao bounded de `formatPromptValue` sem atomic-edit, com limite estrito de dois arquivos.
- Arquivos lidos: `unified-agent.service.ts`, helper alvo, `agent-runtime`, helpers Kloel via glob e `unified-agent-response.helpers.ts`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal poderia concluir a extracao pequena com menos overhead operacional.
- Decisao tomada: aceito como baseline funcional; perdeu o placar geral para ATOMIC, mas venceu shell command count e service line count.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `53`, comandos `9`, input `54,501`, output `2,482`, reasoning `2,106`, touched Kloel files `2`, source churn `27`, service final `712` linhas.
- Benchmark: venceu ATOMIC em shell commands e service line count; perdeu eventos, tokens, source churn, traceability e disciplina atomica.
- Risco residual: usou native read/write/edit e fez leitura mais ampla que o escopo estrito precisava.
- Recomendacao para proximo subagent: manter dois arquivos e medir se o ATOMIC batch remove a vantagem restante de comandos.

### AB-ATOMIC-059

- Status: accepted_atomic_win_not_margin_complete
- Prompt recebido: mesma extracao bounded usando somente modo atomico, sem native file tools, shell reads ou pipelines mascarando `atomic-call`.
- Arquivos lidos/alterados: service, runtime helper e traces `.atomic`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: aliases contextuais e escopo estrito tornariam o lane atomico competitivo em economia operacional.
- Decisao tomada: aceito como vitoria parcial forte; ATOMIC venceu quase todas as metricas, mas ainda nao atingiu margem superior total.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `matchingTraceIds=[]`, `.atomic/traces=3`.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `29`, comandos `13`, input `47,573`, output `2,280`, reasoning `1,598`, touched Kloel files `2`, source churn `26`, `atomicModeClean=true`.
- Benchmark: venceu eventos, input/output/reasoning tokens, source churn, traceability e zero native file tools; perdeu shell commands e service line count por 1 linha.
- Risco residual: overhead de wrapper por operacao e acabamento residual de linha.
- Recomendacao para proximo subagent: usar `atomic-call.cjs batch` para agrupar reads/edits/checks atomicos e buscar paridade/vitoria em comandos mantendo disciplina atomica.

### AB-NORMAL-060

- Status: accepted_baseline
- Prompt recebido: repetir a extracao bounded sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal continuaria concluindo a tarefa pequena.
- Decisao tomada: aceito como baseline funcional em rodada rejeitada por falha do ATOMIC.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `39`, comandos `7`, input `55,850`, output `2,343`, reasoning `3,355`, touched Kloel files `2`, source churn `28`.
- Benchmark: completou; mas a rodada nao prova superioridade por falha/timeout do ATOMIC.
- Risco residual: native reads/writes/edits e leitura de diretorio inteira.
- Recomendacao para proximo subagent: manter baseline identico na repeticao.

### AB-ATOMIC-060

- Status: rejected_idle_timeout
- Prompt recebido: mesma extracao bounded usando `atomic-call.cjs batch`.
- Arquivos alterados no worktree: nenhum source file; sem traces de mutacao.
- Hipotese inicial: batch reduziria comandos shell e manteria `atomicModeClean=true`.
- Decisao tomada: rejeitado; fez apenas leitura batch e nao mutou codigo antes do timeout.
- Testes/comandos executados:
  - Batch `code_read_symbol` + `code_file_stat`: passou.
  - Validacao externa posterior passou apenas porque o worktree nao mudou.
  - `trace-isolation-check`: `ok=true`, `.atomic/traces=0`.
- Evidencia antes/depois: eventos `4`, comandos `1`, input `43,228`, output `196`, reasoning `98`, touched Kloel files `0`, `functionalPass=false`.
- Benchmark: venceu metricas de custo por nao executar trabalho; rejeitado como entrega.
- Risco residual: output do batch aninhava JSON escapado e dificultou a passagem leitura -> mutacao.
- Recomendacao para proximo subagent: usar batch com output parseado e executar workflow estrito inspect -> mutate -> validate.

### AB-NORMAL-061

- Status: accepted_baseline
- Prompt recebido: repetir a extracao bounded sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal continuaria economico na tarefa pequena.
- Decisao tomada: aceito como baseline funcional; venceu comandos/reasoning/acabamento, perdeu a maior parte do placar operacional.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `40`, comandos `7`, input `53,095`, output `2,608`, reasoning `626`, touched Kloel files `2`, source churn `27`, service final `712` linhas.
- Benchmark: venceu ATOMIC em comandos shell, reasoning tokens e service line count; perdeu eventos, input/output, source churn, traceability e disciplina atomica.
- Risco residual: native read/write/edit.
- Recomendacao para proximo subagent: manter baseline identico.

### AB-ATOMIC-061

- Status: accepted_atomic_win_not_margin_complete
- Prompt recebido: mesma extracao bounded usando `extract_symbol_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: operador alto nivel reduziria overhead e impediria idle timeout.
- Decisao tomada: aceito como vitoria parcial forte; o operador funcionou e validou, mas ainda perdeu comandos/reasoning/acabamento.
- Testes/comandos executados:
  - `extract_symbol_to_file`: passou e executou 3 mutacoes atomicas.
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `.atomic/traces=3`, `matchingTraceIds=[]`.
- Evidencia antes/depois: eventos `27`, comandos `10`, input `47,625`, output `1,386`, reasoning `1,487`, touched Kloel files `2`, source churn `26`, `atomicModeClean=true`.
- Benchmark: venceu eventos, input/output, source churn, traceability e zero native file tools; perdeu shell commands, reasoning e service line count por 1 linha.
- Risco residual: preflights desnecessarios antes do operador e failed `ls` evitavel.
- Recomendacao para proximo subagent: primeira acao deve ser exatamente `extract_symbol_to_file`; sem `git status`, `ls` ou exploracao antes.

### AB-NORMAL-062

- Status: accepted_baseline
- Prompt recebido: repetir a extracao bounded sem atomic-edit, prompt reduzido.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal continuaria funcional, mas poderia gastar mais exploracao mesmo com prompt curto.
- Decisao tomada: aceito como baseline funcional.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `61`, comandos `8`, input `53,476`, output `2,469`, reasoning `910`, touched Kloel files `2`, source churn `27`, service final `712` linhas.
- Benchmark: venceu ATOMIC apenas no service line count; perdeu todo o resto relevante.
- Risco residual: native file tools e exploracao maior.
- Recomendacao para proximo subagent: manter baseline identico.

### AB-ATOMIC-062

- Status: accepted_atomic_win_residual_line_loss
- Prompt recebido: mesma extracao bounded; primeira acao obrigatoria `extract_symbol_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: operador alto nivel como primeira acao venceria comandos/reasoning.
- Decisao tomada: aceito como vitoria forte, pendente de lapida por 1 linha residual.
- Testes/comandos executados:
  - `extract_symbol_to_file`: passou.
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `.atomic/traces=3`, `matchingTraceIds=[]`.
- Evidencia antes/depois: eventos `15`, comandos `6`, input `46,622`, output `939`, reasoning `549`, touched Kloel files `2`, source churn `26`, `atomicModeClean=true`.
- Benchmark: venceu eventos, comandos, input/output/reasoning, source churn, traceability e zero native file tools; perdeu service line count por 1 linha.
- Risco residual: gap extra apos remocao de simbolo, lapidado no operador depois da rodada.
- Recomendacao para proximo subagent: repetir com `extract_symbol_to_file` compactando gap para confirmar zero derrotas.

### AB-NORMAL-063

- Status: accepted_baseline_zero_loss_tier_loser
- Prompt recebido: repetir a extracao bounded sem atomic-edit, prompt reduzido.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal seguiria funcional e serviria de comparador contra a versao atomica compactada.
- Decisao tomada: aceito como baseline funcional.
- Testes/comandos executados:
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - Protected diff vazio; scan de suppressions nos arquivos tocados exit 1.
- Evidencia antes/depois: eventos `34`, comandos `7`, input `51,856`, output `2,131`, reasoning `737`, touched Kloel files `2`, source churn `27`, service final `712` linhas.
- Benchmark: nao venceu nenhuma metrica contra ATOMIC nesta rodada; empatou em service line count, files touched e source churn.
- Risco residual: baseline continua usando native file tools e nao gera trace atomico.
- Recomendacao para proximo subagent: manter baseline identico enquanto o ATOMIC busca margem maior.

### AB-ATOMIC-063

- Status: accepted_atomic_zero_loss_current_tier
- Prompt recebido: mesma extracao bounded; primeira acao obrigatoria `extract_symbol_to_file` apos compact-gap.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: operador compactado removeria a ultima derrota do round 062.
- Decisao tomada: aceito como primeira rodada zero-loss do tier atual.
- Testes/comandos executados:
  - `extract_symbol_to_file`: passou.
  - Jest focado `13/13`: passou.
  - Backend typecheck: passou.
  - `git diff --check -- backend/src/kloel`: passou.
  - `trace-isolation-check`: `ok=true`, `.atomic/traces=4`, `matchingTraceIds=[]`.
- Evidencia antes/depois: eventos `14`, comandos `6`, input `47,555`, output `897`, reasoning `441`, touched Kloel files `2`, source churn `27`, service final `712`, `atomicModeClean=true`.
- Benchmark: venceu eventos, comandos, input/output/reasoning, traceability e zero native file tools; empatou tamanho/churn/arquivos; perdeu nada.
- Risco residual: vitoria sem derrota ainda nao e margem esmagadora em todos os eixos, principalmente shell commands e input tokens.
- Recomendacao para proximo subagent: usar `extract_symbol_to_file` com validacao embutida para reduzir mais comandos/eventos sem enfraquecer prova externa.

### AB-NORMAL-064

- Status: accepted_baseline_current_tier_loser
- Prompt recebido: repetir a extracao bounded sem atomic-edit, prompt reduzido.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal seguiria funcional contra a versao atomica com validacao embutida.
- Decisao tomada: baseline aceito; perdeu todas as metricas operacionais medidas e empatou apenas codigo final.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, scan de suppressions.
- Evidencia antes/depois: eventos `27`, comandos `5`, input `50,700`, output `1,779`, reasoning `795`, touched Kloel files `2`, source churn `27`, service final `712`.
- Benchmark: empatou service/churn/files; perdeu eventos/comandos/tokens/trace.
- Risco residual: native file tools sem trace atomico.
- Recomendacao: proximo baseline deve receber complexidade maior, nao repetir este tier.

### AB-ATOMIC-064

- Status: accepted_atomic_zero_loss_margin_current_tier
- Prompt recebido: mesma extracao bounded com `extract_symbol_to_file` + `validate:true` como unica acao operacional.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: validacao embutida reduziria comandos/eventos sem enfraquecer prova.
- Decisao tomada: aceito como fechamento do tier atual para escalada.
- Testes/comandos executados: uma chamada `extract_symbol_to_file` com validacao embutida; o coordenador repetiu Jest, typecheck, diff-check, protected diff, scan e trace isolation externamente.
- Evidencia antes/depois: eventos `6`, comandos `1`, input `47,626`, output `440`, reasoning `207`, touched Kloel files `2`, source churn `27`, service final `712`, `atomicModeClean=true`, trace isolation `ok=true`.
- Benchmark: venceu eventos, comandos, input/output/reasoning, traceability e zero native file tools; empatou tamanho/churn/arquivos; perdeu nada.
- Risco residual: input venceu por margem pequena por baseline fixo; nao bloqueia escalada porque todos os eixos funcionais/economicos principais estao verdes.
- Recomendacao: escalar um degrau de complexidade no proximo A/B.

### AB-NORMAL-065

- Status: accepted_baseline_service_line_winner
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Hipotese inicial: baseline normal poderia ser competitivo em acabamento manual na nova complexidade.
- Decisao tomada: baseline aceito.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, scan de suppressions.
- Evidencia antes/depois: eventos `24`, comandos `5`, input `50,893`, output `1,761`, reasoning `418`, touched Kloel files `2`, source churn `31`, service final `708`.
- Benchmark: venceu service line count por 1 linha; perdeu economia operacional, source churn e traceability.
- Risco residual: native file tools sem trace atomico.
- Recomendacao: repetir a mesma complexidade depois da lapida do ATOMIC.

### AB-ATOMIC-065

- Status: accepted_atomic_win_with_lapida_required
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` com `extract_symbols_to_file validate:true`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Hipotese inicial: operador multi-simbolo manteria a vantagem do tier anterior.
- Decisao tomada: aceito como vitoria operacional parcial; requer lapida por service line count.
- Testes/comandos executados: uma chamada `extract_symbols_to_file` com validacao embutida; validacao externa do coordenador repetiu Jest/typecheck/diff/protected/scan/trace.
- Evidencia antes/depois: eventos `6`, comandos `1`, input `49,939`, output `399`, reasoning `229`, touched Kloel files `2`, source churn `30`, service final `709`, `atomicModeClean=true`, trace isolation `ok=true`.
- Benchmark: venceu eventos/comandos/tokens/source churn/trace; perdeu service line count por 1 linha.
- Risco residual: gap residual antes da constante, lapidado no operador apos a rodada.
- Recomendacao: repetir com compactacao `\\n\\n\\nconst ` ativada.

### AB-NORMAL-066

- Status: accepted_baseline_with_shared_typecheck_noise
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-066.md`.
- Prompt recebido: repetir a extracao dupla de `isAllowedTool` + `formatPromptValue` sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Testes/comandos executados: Jest focado, diff-check, protected diff e scan de suppressions passaram; backend typecheck falhou por Prisma Client compartilhado stale.
- Evidencia: service `708`, helper `29`, source churn `31`; falha comum de typecheck nao foi atribuida ao modo normal.
- Benchmark: baseline funcional de shape correto, mas round rejeitado como clean win por ruido comum.
- Risco residual: native file tools sem trace atomico.
- Recomendacao: repetir apos regenerar Prisma Client.

### AB-ATOMIC-066

- Status: accepted_with_lapida_required
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-066.md`.
- Prompt recebido: mesma extracao dupla com `extract_symbols_to_file validate:true`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: primeira chamada foi encerrada por timeout OpenCode durante validacao; retry idempotente posterior passou apos reparo do operador e Prisma Client regenerado.
- Evidencia: `atomicModeClean=true`, trace isolation `ok=true`, `.atomic/traces=7`, service `708`, helper `29`.
- Benchmark: venceu rastreabilidade e disciplina atomic-only, mas perdeu como clean win por timeout parcial e falta de idempotencia pre-reparo.
- Risco residual: sucesso parcial precisa ser retry-safe em operadores macro.
- Recomendacao: repetir apos `extract_symbols_to_file` aceitar idempotencia de sucesso parcial.

### AB-NORMAL-067

- Status: accepted_baseline_failed_command_winner
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-067.md`.
- Prompt recebido: repetir a extracao dupla sem atomic-edit apos reparo de idempotencia.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Testes/comandos executados: Jest `13/13`, backend typecheck, diff-check, protected diff e scan de suppressions.
- Evidencia: eventos `44`, comandos `7`, input `52,311`, output `2,344`, reasoning `2,456`, failed commands `0`, service `708`, helper `29`, source churn `31`.
- Benchmark: venceu failed commands por `0` vs `1`; perdeu economia e traceability.
- Risco residual: sem trace atomico das mutacoes.
- Recomendacao: proximo round deve exigir zero failed commands do ATOMIC.

### AB-ATOMIC-067

- Status: accepted_atomic_win_with_command_failure_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-067.md`.
- Prompt recebido: mesma extracao dupla com operador atomico e validacao embutida.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: primeira chamada falhou no parse de JSON shell-escaped; retry com quoting alternativo passou; validacao externa completa passou.
- Evidencia: eventos `10`, comandos `2`, input `51,207`, output `619`, reasoning `1,060`, failed commands `1`, service `708`, helper `29`, source churn `31`, `atomicModeClean=true`.
- Benchmark: venceu eventos/comandos/tokens/trace, mas perdeu failed commands.
- Risco residual: OpenCode pode shell-escapar JSON em formatos diferentes; wrapper precisa ser tolerante.
- Recomendacao: repetir apos parser shell-escaped e medicao explicita de failed commands.

### AB-NORMAL-068

- Status: accepted_baseline_zero_failed_commands
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-068.md`.
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff e suppression scan.
- Evidencia: eventos `42`, comandos `7`, input `55,832`, output `2,175`, reasoning `843`, failed commands `0`, service `708`, helper `29`, source churn `31`.
- Benchmark: perdeu para ATOMIC em economia e trace; empatou codigo final.
- Risco residual: sem trace atomico das mutacoes.
- Recomendacao: escalar complexidade apos a vitoria limpa do ATOMIC.

### AB-ATOMIC-068

- Status: accepted_atomic_zero_loss_scaled_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-068.md`.
- Prompt recebido: extrair `isAllowedTool` e `formatPromptValue` com uma unica chamada `extract_symbols_to_file validate:true`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: uma chamada atomic-call com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/trace.
- Evidencia: eventos `6`, comandos `1`, input `51,002`, output `395`, reasoning `194`, failed commands `0`, service `708`, helper `29`, source churn `31`, trace isolation `ok=true`, `.atomic/traces=7`.
- Benchmark: venceu eventos/comandos/input/output/reasoning/trace e disciplina atomic-only; empatou failed commands, service, helper, touched files e source churn; perdeu nada.
- Risco residual: proximo tier precisa testar macro-refactor mais dificil.
- Recomendacao: escalar para extracao de metodo de classe para helper externo ou macro equivalente.

### AB-NORMAL-069

- Status: accepted_baseline_macro_method_winner
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-069.md`.
- Prompt recebido: extrair `actionSucceeded` e `num` de `backend/src/kloel/unified-agent.service.ts` para `backend/src/kloel/unified-agent-action.helpers.ts` sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-action.helpers.ts`.
- Testes/comandos executados: Jest `13/13`, diff-check, protected diff e suppression scan passaram; backend typecheck falhou por ruido externo compartilhado de Google Ads/Prisma Client.
- Evidencia: eventos `36`, comandos `6`, input `52,794`, output `1,886`, reasoning `764`, failed commands `1`, service `725`, helper `12`, source churn `32`.
- Benchmark: venceu eventos, comandos, failed commands, tokens, service line count e acabamento.
- Risco residual: baseline sem trace atomico.
- Recomendacao: converter a vantagem operacional em macro-operador atomico e repetir o mesmo tier.

### AB-ATOMIC-069

- Status: rejected_atomic_macro_method_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-069.md`.
- Prompt recebido: mesma extracao de metodos de classe usando apenas atomic-call.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: tentativas `atomic-call.cjs`, uma batch com JSON temporario, Jest `13/13`, diff-check, protected diff, suppression scan e trace isolation; backend typecheck falhou pelo mesmo ruido externo compartilhado.
- Evidencia: eventos `79`, comandos `22`, input `68,004`, output `4,990`, reasoning `9,027`, failed commands `3`, service `727`, helper `12`, source churn `30`, trace isolation `ok=true`, `.atomic/traces=8`.
- Benchmark: venceu source churn e trace; perdeu disciplina atomic-only, eventos, comandos, failed commands, tokens, service line count e acabamento.
- Risco residual: nao ha operador macro de extracao de metodo de classe; worker derivou para shell/temp file.
- Recomendacao: adicionar `extract_class_methods_to_file`, validacao dinamica e prompt minimo; repetir como Round 070 sem escalar.

### AB-NORMAL-077

- Status: accepted_baseline_timeout
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-077.md`.
- Prompt recebido: extrair `actionSucceeded` e `num` de `backend/src/kloel/unified-agent.service.ts` para `backend/src/kloel/unified-agent-action.helpers.ts` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-action.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, diff-check, protected diff, suppression scan e tentativas de descoberta/validacao; backend typecheck falhou por ruido externo compartilhado de Google Ads/Prisma Client.
- Evidencia: eventos `100`, comandos `14`, failed commands `1`, input `73.285`, output `4.376`, reasoning `1.522`, primeira acao `20.774ms`, tempo total `577.539ms`, watchdog `max_timeout`, service `725`, helper `12`, source churn `32`.
- Benchmark: nao venceu nenhuma metrica medida; empatou apenas touched files/source churn/service/helper.
- Risco residual: sem trace atomico e sem handoff compacto final por timeout.
- Recomendacao: manter como baseline para a proxima complexidade; nao copiar seu metodo operacional.

### AB-ATOMIC-077

- Status: accepted_atomic_decisive_win_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-077.md`.
- Prompt recebido: mesma extracao de metodos de classe usando somente Atomic OS por OpenCode custom command `preprompt-shell`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: `atomic-call.cjs extract_class_methods_to_file` com validacao embutida; validacao externa repetiu Jest/diff/protected/scan/typecheck/trace.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `53.003`, output `91`, reasoning `114`, primeira acao `6.103ms`, tempo total `57.247ms`, service `725`, helper `12`, source churn `32`, trace isolation `ok=true`, `.atomic/traces=10`.
- Benchmark: venceu todas as metricas operacionais medidas; empatou apenas touched files/source churn/service/helper; perdeu nada.
- Risco residual: typecheck global continua ruidoso fora do escopo e a proxima complexidade ainda precisa provar que o operador correto sobe de nivel sem perder disciplina.
- Recomendacao: escalar um degrau de complexidade com os mesmos gates e parar a escalada se alguma derrota atomica aparecer.

### AB-NORMAL-078

- Status: accepted_functional_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-078.md`.
- Prompt recebido: extrair tres metodos privados de runtime context para helper externo usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan e typecheck.
- Evidencia: eventos `78`, comandos `10`, failed commands `0`, input `86.312`, output `4.914`, reasoning `6.747`, service `704`, helper `49`, source churn `100`.
- Benchmark: venceu o aceite funcional; perdeu economia operacional e rastreabilidade.
- Risco residual: baseline usou native file tools e nao gerou trace atomico.
- Recomendacao: usar como baseline de comportamento para repetir a mesma complexidade apos atualizar o operador atomico.

### AB-ATOMIC-078

- Status: rejected_context_dependency_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-078.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods.
- Evidencia: eventos `3`, comandos `1`, failed commands `1`, input `53.726`, output `103`, reasoning `230`, service `701`, helper `38`, source churn `84`, `.atomic/traces=12`.
- Benchmark: venceu velocidade/superficie/trace, mas perdeu funcionalmente; helper preservou `this.agentRuntime` e Jest falhou `8 failed, 5 passed`.
- Risco residual: preprompt exit `1` precisa ser tratado como derrota mesmo quando o turno OpenCode fecha exit `0`.
- Recomendacao: adicionar adaptador de dependencia explicita ao operador e repetir o Round 079 sem escalar.

### AB-NORMAL-079

- Status: accepted_baseline_functional_green
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-079.md`.
- Prompt recebido: repetir a extracao dos tres metodos privados de runtime context para helper externo usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `98`, comandos `11`, failed commands `1`, input `67.401`, output `5.601`, reasoning `2.215`, service `704`, helper `49`, source churn `100`, traces `0`.
- Benchmark: passou o aceite funcional, mas perdeu todas as metricas operacionais medidas para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; sem erro `src/kloel` no log.
- Recomendacao: manter como baseline comportamental; nao copiar o metodo operacional.

### AB-ATOMIC-079

- Status: accepted_atomic_decisive_win_context_dependency_recovery
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-079.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file` com adaptador de dependencia explicita.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/trace.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `53.610`, output `105`, reasoning `98`, service `701`, helper `40`, source churn `86`, `.atomic/traces=12`.
- Benchmark: venceu todas as metricas operacionais medidas e empatou o aceite funcional com o NORMAL; `atomicModeClean=true`.
- Risco residual: auditor global ainda publica `functionalPass=false` por typecheck compartilhado fora do escopo.
- Recomendacao: repetir o mesmo tier no Round 080 para confirmar estabilidade; escalar somente se ATOMIC repetir zero perdas medidas.

### AB-NORMAL-080

- Status: accepted_baseline_functional_green_no_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-080.md`.
- Prompt recebido: repetir a extracao dos tres metodos privados de runtime context para helper externo usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `92`, comandos `13`, failed commands `1`, input `82.302`, output `5.419`, reasoning `3.380`, service `704`, helper `49`, source churn `100`, traces `0`.
- Benchmark: passou o aceite funcional, mas perdeu todas as metricas operacionais medidas para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; `typecheckKloelErrorCount=0`.
- Recomendacao: escalar a dificuldade; o normal nao tem vitoria medida restante neste tier.

### AB-ATOMIC-080

- Status: accepted_atomic_confirmed_zero_loss_context_dependency_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-080.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/trace.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `53.587`, output `168`, reasoning `129`, service `701`, helper `40`, source churn `86`, `.atomic/traces=12`.
- Benchmark: venceu todas as metricas operacionais medidas e empatou o aceite funcional; `functionalPass=true`, `taskFunctionalPass=true`, `atomicModeClean=true`.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma.
- Recomendacao: escalar no Round 081 para extracao mista com per-method adapters.

### AB-NORMAL-081

- Status: accepted_baseline_functional_green_no_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-081.md`.
- Prompt recebido: extrair cinco metodos privados mistos para `backend/src/kloel/unified-agent-private.helpers.ts` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-private.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `100`, comandos `13`, failed commands `5`, input `82.722`, output `5.798`, reasoning `2.071`, service `693`, helper `62`, source churn `134`, traces `0`.
- Benchmark: passou o aceite funcional, mas perdeu todas as metricas operacionais medidas para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; `typecheckKloelErrorCount=0`.
- Recomendacao: repetir o tier para confirmar estabilidade do ATOMIC antes de subir para router maior.

### AB-ATOMIC-081

- Status: accepted_atomic_decisive_win_mixed_method_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-081.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file` com `methodAdapters` especificos.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-private.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/trace.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `54.405`, output `101`, reasoning `285`, service `690`, helper `53`, source churn `116`, `.atomic/traces=19`.
- Benchmark: venceu todas as metricas operacionais medidas e empatou o aceite funcional; `functionalPass=true`, `taskFunctionalPass=true`, `atomicModeClean=true`.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma; router maior ainda nao provado.
- Recomendacao: repetir o tier misto no Round 082; se repetir zero perdas, escalar para decomposicao controlada de parte do router.

### AB-NORMAL-082

- Status: accepted_baseline_functional_green_no_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-082.md`.
- Prompt recebido: repetir a extracao mista de cinco metodos privados para `backend/src/kloel/unified-agent-private.helpers.ts` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-private.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `99`, comandos `13`, failed commands `1`, input `74.125`, output `5.902`, reasoning `3.282`, service `692`, helper `59`, source churn `132`, traces `0`.
- Benchmark: passou o aceite funcional, mas perdeu todas as metricas operacionais medidas para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; `typecheckKloelErrorCount=0`.
- Recomendacao: escalar para multi-modulo; normal nao tem vitoria medida neste tier.

### AB-ATOMIC-082

- Status: accepted_atomic_confirmed_zero_loss_mixed_method_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-082.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file` com `methodAdapters` especificos.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-private.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/trace.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `54.377`, output `112`, reasoning `296`, service `690`, helper `53`, source churn `116`, `.atomic/traces=19`.
- Benchmark: venceu todas as metricas operacionais medidas e empatou o aceite funcional; `functionalPass=true`, `taskFunctionalPass=true`, `atomicModeClean=true`.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma; multi-modulo ainda nao provado.
- Recomendacao: escalar no Round 083 para duas transacoes atomicas coordenadas em helpers distintos.

### AB-NORMAL-083

- Status: accepted_baseline_functional_green_one_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-083.md`.
- Prompt recebido: extrair cinco metodos privados em dois helpers separados usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts` e `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `188`, comandos `25`, failed commands `3`, input `75.502`, output `11.080`, reasoning `9.250`, service `688`, source churn `136`, traces `0`.
- Benchmark: passou o aceite funcional e venceu apenas service line count por uma linha; perdeu as demais metricas operacionais para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; `sharedTypecheckNoiseOnly=true`.
- Recomendacao: manter como baseline funcional; repetir o tier para testar se ATOMIC remove a perda de uma linha.

### AB-ATOMIC-083

- Status: accepted_atomic_win_multi_module_first_pass
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-083.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e duas chamadas macro `extract_class_methods_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `54.959`, output `185`, reasoning `386`, service `689`, source churn `118`, `.atomic/traces=22`.
- Benchmark: venceu eventos, primeira acao, tempo total, comandos, failed commands, tokens, source churn, traceability e disciplina atomic-only; perdeu service line count por uma linha.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma; multi-modulo precisa de repeticao zero-loss antes de escalar.
- Recomendacao: Round 084 deve repetir exatamente o tier multi-modulo e lapidar o operador para empatar/vencer `serviceLines`.

### AB-NORMAL-084

- Status: accepted_baseline_functional_green_no_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-084.md`.
- Prompt recebido: repetir o tier multi-modulo usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts` e `backend/src/kloel/unified-agent-runtime-context.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan e private-method scan.
- Evidencia: eventos `107`, comandos `13`, failed commands `0`, input `85.304`, output `6.181`, reasoning `4.888`, service `692`, source churn `132`, traces `0`.
- Benchmark: passou o aceite funcional, mas nao venceu nenhuma metrica relevante; empatou failed commands e touched files.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; `sharedTypecheckNoiseOnly=true`.
- Recomendacao: manter como baseline comportamental; o tier pode escalar.

### AB-ATOMIC-084

- Status: accepted_atomic_zero_loss_multi_module_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-084.md`.
- Prompt recebido: mesma extracao multi-modulo usando somente Atomic OS por preprompt shell e duas chamadas macro `extract_class_methods_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-action.helpers.ts`, `backend/src/kloel/unified-agent-runtime-context.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `55.031`, output `106`, reasoning `243`, service `688`, source churn `119`, `.atomic/traces=22`.
- Benchmark: venceu eventos, primeira acao, tempo total, comandos, tokens, service line count, source churn, traceability e disciplina atomic-only; empatou failed commands e touched files.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma; proxima escala deve continuar bounded.
- Recomendacao: escalar um degrau para decomposicao parcial controlada, nao router completo.

### AB-NORMAL-085

- Status: rejected_scope_preservation_fail_baseline_functional_only
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-085.md`.
- Prompt recebido: extrair apenas `executeToolAction` para `backend/src/kloel/unified-agent-tool-router.helpers.ts` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan e scope-preservation scan.
- Evidencia: eventos `136`, comandos `16`, failed commands `5`, input `81.616`, output `9.885`, reasoning `6.869`, service `568`, helper `233`, total Kloel lines `801`, source churn `492`, traces `0`.
- Benchmark: passou comportamento focado, mas falhou preservacao de escopo porque removeu tambem `num` e `buildAgentToolEnvelope`; venceu apenas service line count bruto.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; nao conta como baseline equivalente final.
- Recomendacao: repetir o tier com gate explicito de preservar helpers nao-alvo.

### AB-ATOMIC-085

- Status: accepted_atomic_router_bounded_first_pass
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-085.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell e macro `extract_class_methods_to_file`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/scope-preservation.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `52.895`, output `180`, reasoning `173`, service `584`, helper `208`, total Kloel lines `792`, source churn `445`, `.atomic/traces=7`.
- Benchmark: venceu preservacao de escopo, linhas totais, churn, eventos, tempo, comandos, failed commands, tokens, traceability e disciplina atomic-only; perdeu apenas service line count bruto para um lane normal fora de escopo.
- Risco residual: global typecheck ainda vermelho fora do escopo por Google Ads/Prisma; precisa repetir o tier antes de escalar.
- Recomendacao: Round 086 deve repetir a mesma dificuldade com scope-preservation gate explicito.

### AB-NORMAL-086

- Status: accepted_baseline_functional_green_one_service_metric_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-086.md`.
- Prompt recebido: repetir router bounded com scope-preservation gate usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan e scope-preservation scan.
- Evidencia: eventos `112`, comandos `13`, failed commands `0`, input `68.965`, output `9.492`, reasoning `7.449`, service `565`, helper `282`, total Kloel lines `847`, source churn `498`, traces `0`.
- Benchmark: venceu apenas `serviceLines`; perdeu economia, linhas totais, churn e prova.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma.
- Recomendacao: converter o shape `toolRouterDeps()` em capacidade atomica.

### AB-ATOMIC-086

- Status: accepted_atomic_repeat_win_one_service_metric_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-086.md`.
- Prompt recebido: repetir router bounded usando somente Atomic OS, com `requiredTextChecks`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/scope-preservation.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `53.003`, output `126`, reasoning `455`, service `584`, helper `208`, total Kloel lines `792`, source churn `445`, `.atomic/traces=7`.
- Benchmark: venceu tudo exceto `serviceLines`; empatou aceite, failed commands, touched files e scope preservation.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; service line count ainda perde.
- Recomendacao: Round 087 deve usar `postRemovalReplacements` e callsite compacto para fechar zero-loss.

### AB-NORMAL-087

- Status: accepted_baseline_functional_green_with_atomic_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-087.md`.
- Prompt recebido: repetir router bounded com scope-preservation gate usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado `13/13`, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan e scope-preservation scan.
- Evidencia: eventos `114`, comandos `14`, failed commands `5`, input `72.417`, output `10.141`, reasoning `11.206`, service `585`, helper `211`, total Kloel lines `796`, source churn `453`, traces `0`.
- Benchmark: passou aceite focado e preservacao de escopo, mas perdeu todas as metricas materiais para o ATOMIC exceto helper line count.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma.
- Recomendacao: manter como baseline funcional do tier fechado.

### AB-ATOMIC-087

- Status: accepted_atomic_zero_loss_router_bounded_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-087.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell, com dependency-builder, `postRemovalReplacements`, callsite compacto e `requiredTextChecks`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/scan/helper-this/private-methods/scope-preservation.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `53.093`, output `116`, reasoning `175`, service `562`, helper `221`, total Kloel lines `783`, source churn `432`, `.atomic/traces=8`.
- Benchmark: venceu service lines, total product lines, churn, tempo, comandos, failed commands, tokens, traceability e disciplina atomic-only; empatou aceite, scope preservation e touched files.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; proxima tarefa deve escalar so um degrau.
- Recomendacao: Round 088 pode aumentar complexidade controladamente.

### AB-NORMAL-088

- Status: accepted_baseline_functional_green_atomic_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-088.md`.
- Prompt recebido: extrair o cluster router `executeToolAction`, `num` e `buildAgentToolEnvelope` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan, router-cluster absence scan, router export scan e residual-scope scan.
- Evidencia: eventos `112`, comandos `12`, failed commands `1`, input `73.895`, output `11.225`, reasoning `5.874`, service `568`, helper `234`, total Kloel lines `802`, source churn `497`, traces `0`.
- Benchmark: passou aceite focado, mas perdeu todas as metricas materiais para o ATOMIC.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma.
- Recomendacao: manter como baseline funcional.

### AB-ATOMIC-088

- Status: accepted_atomic_zero_loss_router_cluster_tier
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-088.md`.
- Prompt recebido: mesma extracao de cluster usando somente Atomic OS por preprompt shell, `extract_class_methods_to_file`, `methodAdapters`, `postRemovalReplacements` e `atomic_remove_import`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `55.827`, output `201`, reasoning `522`, service `544`, helper `232`, total Kloel lines `776`, source churn `459`, `.atomic/traces=15`.
- Benchmark: venceu service/helper/total/churn, tempo, comandos, failed commands, tokens, traceability e disciplina atomic-only; empatou aceite e touched files.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma.
- Recomendacao: Round 089 pode escalar um degrau controlado.

### AB-NORMAL-089

- Status: accepted_baseline_functional_but_timeout_and_lint_residual
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-089.md`.
- Prompt recebido: extrair `executeToolAction`, `num`, `buildAgentToolEnvelope` e `actionSucceeded` usando OpenCode normal sem atomic-edit.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: Jest focado, backend typecheck, diff-check, protected diff, suppression scan, helper no-`this.` scan, private-method scan, router-cluster absence/export scan, residual-scope scan e lint extra.
- Evidencia: watchdog `max_timeout`, eventos `136`, comandos `19`, failed commands `5`, input `92.021`, output `11.444`, reasoning `6.693`, service `538`, helper `245`, total Kloel lines `783`, source churn `500`, traces `0`.
- Benchmark: passou aceite focado na validacao externa, mas perdeu tempo/comandos/tokens/churn/trace para ATOMIC; venceu apenas lint extra por menos erros (`5` vs `15`).
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; lint dos arquivos tocados ainda falha.
- Recomendacao: repetir mesma dificuldade apos a atualizacao do operador atomico com ESLint dry-run.

### AB-ATOMIC-089

- Status: accepted_atomic_functional_win_with_lint_residual
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-089.md`.
- Prompt recebido: mesma extracao usando somente Atomic OS por preprompt shell, `extract_class_methods_to_file`, `methodAdapters`, `postRemovalReplacements` e `atomic_remove_import`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope; lint extra dos dois arquivos tocados.
- Evidencia: eventos `3`, comandos `1`, failed commands `0`, input `56.188`, output `192`, reasoning `18`, service `538`, helper `240`, total Kloel lines `778`, source churn `477`, `.atomic/traces=18`.
- Benchmark: venceu aceite operacional, timeout, total lines, churn, tempo, comandos, failed commands, tokens, traceability e disciplina atomic-only; empatou service/touched files; perdeu lint extra por contagem de residuos (`15` vs `5`).
- Ferramenta atualizada: `atomic-call.cjs` ganhou `formatWithEslint` / `lintFix` / `autoFixLint` para chamar `atomic_apply_eslint_dry_run_fixes`.
- Risco residual: typecheck global falhou por ruido compartilhado de Google Ads/Prisma; Round 090 precisa provar lint residual resolvido.
- Recomendacao: repetir exatamente a mesma tarefa com `formatWithEslint=true`.

### AB-NORMAL-091

- Status: rejected_idle_timeout_no_mutation
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-091.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: nenhum em `backend/src/kloel/**`.
- Testes/comandos executados: validacao externa rodou Jest, typecheck, lint, diff-check, scans estruturais e protected diff sobre o estado final.
- Evidencia: lane `idle_timeout`, eventos `5`, comandos `0`, helper ausente, private methods ainda presentes, Jest baseline `13/13`, `typecheckKloelErrors=0`.
- Benchmark: nao completou a tarefa; tokens/comandos/churn menores sao no-op e nao contam como vitoria produtiva.
- Risco residual: baseline normal invalido para comparacao de entrega completa.
- Recomendacao: repetir a mesma dificuldade apos a correcao do lint atomico.

### AB-ATOMIC-091

- Status: rejected_lint_residual_after_import_cleanup
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-091.md`.
- Prompt recebido: repetir a mesma extracao usando Atomic OS com `formatWithEslint=true` layout-only.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, `.atomic/traces=20`, Jest `13/13`, `typecheckKloelErrors=0`, private methods removidos, helper exportando cluster.
- Benchmark: corrigiu a regressao semantica do Round 090, mas falhou lint focado por import multiline apos `atomic_remove_import`.
- Risco residual: task acceptance ainda falso ate lint focado ficar verde.
- Recomendacao: Round 092 deve repetir a mesma tarefa apos `atomic_remove_import` aplicar layout-only fix.

### AB-NORMAL-092

- Status: rejected_idle_timeout_no_mutation
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-092.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: nenhum em `backend/src/kloel/**`.
- Testes/comandos executados: validacao externa rodou Jest/typecheck/lint/diff/protected/scans sobre estado final.
- Evidencia: lane `idle_timeout`, eventos `35`, comandos `0`, helper ausente, private methods ainda presentes, Jest `13/13`, `typecheckKloelErrors=0`.
- Benchmark: nao completou a tarefa; no-op metrics nao contam como vitoria produtiva.
- Recomendacao: manter como baseline rejeitado e repetir a mesma complexidade.

### AB-ATOMIC-092

- Status: rejected_preexisting_lint_residue
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-092.md`.
- Prompt recebido: repetir a mesma extracao usando Atomic OS com import cleanup layout-only.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, `.atomic/traces=21`, Jest `13/13`, `typecheckKloelErrors=0`, private methods removidos, helper exportando cluster.
- Benchmark: corrigiu import formatting, mas falhou lint focado por `toolArgs = JSON.parse(...)`.
- Ferramenta atualizada: `extract_class_methods_to_file` ganhou `postLintReplacements` e segunda transacao layout-only.
- Recomendacao: Round 093 deve aplicar o reparo pos-lint para JSON parse seguro.

### AB-NORMAL-093

- Status: accepted_baseline_functional_but_max_timeout
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-093.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `max_timeout`, eventos `128`, comandos `14`, failed commands `5`, input/output/reasoning `83.286/10.371/13.311`, service/helper/churn `536/232/487`, traces `0`, Jest `13/13`, lint tocado `0`, `typecheckKloelErrors=0`.
- Benchmark: funcional, mas perdeu completion, tempo, eventos, comandos, failed commands, tokens e traceability para ATOMIC; venceu service lines e source churn.
- Recomendacao: usar como baseline funcional; repetir a dificuldade ate ATOMIC fechar tambem shape/churn.

### AB-ATOMIC-093

- Status: accepted_atomic_operational_win_with_shape_residue
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-093.md`.
- Prompt recebido: mesma extracao usando Atomic OS com `postLintReplacements` para parse seguro de `toolArgs`.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: macro atomico com validacao embutida; validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`, input/output/reasoning `59.624/77/25`, service/helper/churn `548/235/494`, traces `22`, Jest `13/13`, lint tocado `0`, `typecheckKloelErrors=0`, `atomicModeClean=true`.
- Benchmark: venceu completion, tempo, eventos, comandos, failed commands, tokens, traceability e disciplina atomic-only; perdeu service lines e source churn.
- Recomendacao: Round 094 deve compactar shape final e repetir sem escalar.

### AB-NORMAL-094

- Status: accepted_baseline_functional_but_max_timeout
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-094.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `max_timeout`, eventos `155`, comandos `15`, failed commands `3`, input/output/reasoning `93.002/11.205/7.502`, service/helper/total lines `558/232/790`, source churn `509`, traces `0`, Jest passou, lint tocado passou, `typecheckKloelErrors=0`.
- Benchmark: venceu comportamento e shape final; perdeu completion/tempo/eventos/comandos/tokens/prova para ATOMIC.
- Recomendacao: usar como baseline funcional para repetir a mesma dificuldade.

### AB-ATOMIC-094

- Status: rejected_atomic_policy_escape_failure
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-094.md`.
- Prompt recebido: repetir a mesma extracao usando Atomic OS com preprompt macro, compact shape, type-only import e cleanup.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: preprompt macro atomico e validacao externa repetindo os mesmos gates do NORMAL.
- Evidencia: preprompt exit `1`, lane `completed`, eventos `3`, comandos `1`, failed commands `1`, input/output/reasoning `52.012/126/281`, service/helper/total lines `738/240/978`, traces `6`, Jest `12/13`, lint vermelho, `typecheckKloelErrors=4`, private methods ainda presentes.
- Benchmark: venceu guard atomico, atomic-only, trace e superficie operacional; perdeu o aceite funcional.
- Ferramenta atualizada: `atomic-call.cjs` ganhou decode opt-in de replacement text; `atomic_add_import` ganhou `typeOnly`; auditor separa task-functional por lane.
- Recomendacao: Round 095 deve repetir a mesma dificuldade com newlines reais/decoded replacements e rollback/idempotent cleanup.

### AB-NORMAL-095

- Status: rejected_baseline_partial
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-095.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts` e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Testes/comandos executados: validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `max_timeout`, eventos `122`, comandos `13`, failed commands `2`, input/output/reasoning `77.842/10.124/11.733`, service/helper/total lines `535/232/767`, source churn `232`, traces `0`, Jest passou, lint tocado `1`, `typecheckKloelErrors=0`.
- Benchmark: venceu shape e typecheck tocado; perdeu completion, lint, tempo/eventos/comandos/tokens/prova para ATOMIC.
- Recomendacao: usar como baseline de shape apenas; repetir a dificuldade.

### AB-ATOMIC-095

- Status: rejected_atomic_type_surface
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-095.md`.
- Prompt recebido: mesma extracao usando Atomic OS com macro newline-safe e dependency property compacta.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: preprompt macro atomico e validacao externa repetindo os mesmos gates do NORMAL.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`, input/output/reasoning `61.085/178/356`, service/helper/total lines `542/235/777`, source churn `235`, traces `25`, Jest passou, lint tocado `0`, `typecheckKloelErrors=1`, `atomicModeClean=true`.
- Benchmark: venceu completion, tempo, eventos, comandos, failed commands, tokens, traceability e disciplina atomic-only; perdeu typecheck tocado e shape/churn.
- Ferramenta atualizada: `atomic-call.cjs` agora normaliza optional deps explicitamente atribuidas para `Type | undefined`; `round-audit.cjs` agora parseia validacao externa e traces corretamente.
- Recomendacao: Round 096 deve repetir a mesma dificuldade com o operador atualizado; sem escalar.

### AB-NORMAL-096

- Status: rejected_idle_no_task_delta
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-096.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: nenhum diff de produto aceito; helper ausente.
- Testes/comandos executados: validacao externa repetiu Jest/typecheck/lint/diff/protected/suppression/helper-this/private-methods/router-cluster/residual-scope.
- Evidencia: lane `idle_timeout`, eventos `17`, comandos `1`, failed commands `0`, input/output/reasoning `69.937/558/1.300`, traces `0`, Jest passou, lint tocado `1`, `typecheckKloelErrors=0`, private router methods ainda presentes.
- Benchmark: perdeu funcionalidade e completion; nao serve como baseline de shape/churn.
- Recomendacao: repetir a dificuldade para confirmar falha repetida ou obter baseline comparavel.

### AB-ATOMIC-096

- Status: accepted_atomic_functional_win_not_scaled
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-096.md`.
- Prompt recebido: mesma extracao usando Atomic OS com optional-deps normalization no operador.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`, `backend/src/kloel/unified-agent-tool-router.helpers.ts` e `.atomic/traces`.
- Testes/comandos executados: preprompt macro atomico e validacao externa repetindo os mesmos gates do NORMAL.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`, input/output/reasoning `61.120/97/488`, traces `25`, Jest/lint verdes, `typecheckKloelErrors=0`, `atomicModeClean=true`.
- Benchmark: venceu funcionalmente e venceu superficie operacional comparavel; shape/churn nao comparavel porque NORMAL nao entregou.
- Ferramenta validada: optional deps do prompt foram convertidas dinamicamente para `Type | undefined` no helper gerado.
- Recomendacao: Round 097 deve repetir a mesma dificuldade antes de escalar.

### AB-NORMAL-097

- Status: rejected_harness_validation_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-097.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode
  normal sem Atomic OS.
- Arquivos alterados no worktree: nao auditaveis por validacao externa; o
  worktree desapareceu antes da leitura final.
- Evidencia: lane `completed`, exit `0`, eventos presentes, self-report de
  Jest/lint; validacao externa falhou com `No such file or directory`.
- Benchmark: nao aceito.
- Recomendacao: repetir no Round 098 com worktree persistente.

### AB-ATOMIC-097

- Status: rejected_harness_validation_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-097.md`.
- Prompt recebido: mesma extracao usando Atomic OS com preprompt macro.
- Arquivos alterados no worktree: nao auditaveis por validacao externa; o
  worktree desapareceu antes da leitura final.
- Evidencia: lane `completed`, exit `0`, preprompt exit `0`, eventos presentes;
  validacao externa falhou com `No such file or directory`.
- Benchmark: nao aceito.
- Ferramenta atualizada: watchdog agora considera output do preprompt como
  heartbeat.
- Recomendacao: repetir no Round 098 com worktree persistente.

### AB-NORMAL-098

- Status: rejected_idle_no_task_delta
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-098.md`.
- Prompt recebido: repetir router cluster + `actionSucceeded` usando OpenCode
  normal sem Atomic OS.
- Arquivos alterados no worktree: nenhum diff Kloel aceito.
- Evidencia: lane `idle_timeout`, eventos `36`, Jest focado passou,
  lint focado `1`, `typecheckKloelErrors=0`, helper ausente e private methods
  ainda presentes.
- Benchmark: perdeu funcionalidade e completion; nao serve para shape/churn.
- Recomendacao: fechar o tier por falha repetida do baseline e escalar um degrau.

### AB-ATOMIC-098

- Status: accepted_atomic_task_functional
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-098.md`.
- Prompt recebido: mesma extracao usando Atomic OS com preprompt macro.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`,
  `backend/src/kloel/unified-agent-tool-router.helpers.ts`, `.atomic/traces` e
  toolchain sincronizada no worktree.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`,
  traces `25`, Jest/lint/diff/protected/suppression/helper/private scans verdes,
  `typecheckKloelErrors=0`, `atomicModeClean=true`.
- Benchmark: venceu funcionalidade, completion, eventos, first action,
  effective time, tokens e traceability; shape/churn nao comparavel por NORMAL
  no-task.
- Recomendacao: escalar um degrau controlado no Round 099.

### AB-NORMAL-099

- Status: rejected_max_timeout_lint_failure
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-099.md`.
- Prompt recebido: extrair router + runtime-context cluster usando OpenCode
  normal sem Atomic OS.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`
  e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Evidencia: lane `max_timeout`, eventos `100`, comandos `7`, failed commands
  `2`, Jest focado passou, lint focado `1`, `typecheckKloelErrors=0`,
  service/helper/total `532/264/796`, churn `571`.
- Benchmark: perdeu funcionalidade estrita, completion, comandos, failed
  commands, eventos, tokens e shape/churn bruto.
- Recomendacao: usar como baseline falho do tier escalado.

### AB-ATOMIC-099

- Status: accepted_atomic_scaled_tier_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-099.md`.
- Prompt recebido: extrair router + runtime-context cluster usando Atomic OS com
  preprompt macro.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`,
  `backend/src/kloel/unified-agent-tool-router.helpers.ts`, `.atomic/traces` e
  toolchain sincronizada no worktree.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`,
  traces `32`, Jest/lint/diff/protected/suppression/helper/private/public scans
  verdes, `typecheckKloelErrors=0`, `atomicModeClean=true`,
  service/helper/total `518/267/785`, churn `558`.
- Benchmark: venceu todos os criterios aceitos e tambem os numeros brutos de
  shape/churn contra o baseline parcial.
- Recomendacao: escalar mais um degrau controlado.

### AB-NORMAL-100

- Status: accepted_late_functional_but_timeout
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-100.md`.
- Prompt recebido: extrair cluster misto top-level + router + runtime-context
  usando OpenCode normal sem Atomic OS.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`
  e `backend/src/kloel/unified-agent-tool-router.helpers.ts`.
- Evidencia: lane `max_timeout`, eventos `129`, comandos `4`, failed commands
  `3`, native tools `write=1` e `edit=11`; validacao externa tardia passou
  Jest `13/13`, ESLint focado `0`, diff/protected/suppression/helper/private/
  top-level/public scans verdes e touched typecheck errors `0`.
- Benchmark: perdeu completion e economia operacional; venceu compactacao bruta
  por `4` linhas/churn.
- Recomendacao: usar como baseline funcional tardio; nao copiar a assercao
  direta de JSON usada para compactar.

### AB-ATOMIC-100

- Status: accepted_operational_win_not_zero_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-100.md`.
- Prompt recebido: mesma extracao usando Atomic OS com preprompt macro.
- Arquivos alterados no worktree: `backend/src/kloel/unified-agent.service.ts`,
  `backend/src/kloel/unified-agent-tool-router.helpers.ts`, `.atomic/traces` e
  toolchain sincronizada no worktree.
- Evidencia: lane `completed`, eventos `3`, comandos `1`, failed commands `0`,
  traces `40`, validacao externa passou Jest `13/13`, ESLint focado `0`,
  diff/protected/suppression/helper/private/top-level/public scans verdes e
  touched typecheck errors `0`.
- Benchmark: venceu completion, tempo, comandos, failed commands, eventos,
  native mutation surface e traceability; perdeu compactacao bruta por `4`
  linhas/churn.
- Recomendacao: repetir no Round 101 com `dependencyContainer` getter dinamico.

### AB-NORMAL-101

- Status: rejected_round_invalidated_early
- Handoff detalhado: `docs/ai/atomic-os-benchmark/round-101/verdict.md`.
- Evidencia: NORMAL estava em inicio de execucao quando o ATOMIC falhou o
  preprompt; round encerrado cedo para evitar comparacao invalida.
- Benchmark: nao aceito.
- Recomendacao: repetir no Round 102.

### AB-ATOMIC-101

- Status: rejected_dependency_container_marker_regression
- Handoff detalhado: `docs/ai/atomic-os-benchmark/round-101/verdict.md`.
- Evidencia: preprompt exit `1`; erro `oldText not found` no post-removal
  replacement gerado por `dependencyContainer`.
- Benchmark: nao aceito.
- Ferramenta atualizada: `atomic-call.cjs` passou a resolver tail real por
  `anchorText` dinamico.
- Recomendacao: repetir no Round 102.

### AB-NORMAL-102

- Status: rejected_round_invalidated_early
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-102.md`.
- Evidencia: lane ainda estava running quando a rodada foi parada; a comparacao
  foi invalidada pelo preprompt ATOMIC exit `1`.
- Benchmark: nao aceito.
- Recomendacao: repetir no Round 103.

### AB-ATOMIC-102

- Status: rejected_dependency_container_policy_regression
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-102.md`.
- Evidencia: preprompt exit `1`; smoke comportamental interno passou, mas o
  gate `no deps builder method` falhou porque o getter dinamico contem a
  substring `toolRouterDeps()`.
- Benchmark: nao aceito.
- Ferramenta atualizada: `atomic-call.cjs` agora suporta
  `dependencyContainer.style = "constructorProperty"` para gerar propriedade
  explicita + atribuicao de construtor a partir de politica dinamica.
- Recomendacao: repetir no Round 103 sem escalar dificuldade.

### AB-NORMAL-103

- Status: rejected_max_timeout_lint_failure
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-103.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `1` com
  6 erros, touched typecheck errors `0`, native file tool violations `20`,
  comandos `4`, failed commands `2`, traces `0`.
- Benchmark: perdeu completion e funcionalidade estrita. Venceu apenas service
  lines por 4 e source churn por 1, sem aceitar a entrega por falha de lint.
- Recomendacao: repetir a mesma dificuldade no Round 104; nao escalar.

### AB-ATOMIC-103

- Status: accepted_atomic_win_not_zero_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-103.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, traces `40`, `atomicModeClean=true`.
- Benchmark: venceu completion, funcionalidade, lint, tempo, eventos, comandos,
  failed commands, tokens, helper lines, total Kloel lines e traceability; perdeu
  service lines por 4 e source churn por 1.
- Ferramenta atualizada: `round-audit.cjs` agora trata comando atomic-call de
  preprompt como valido no lane ATOMIC e mantem isolamento do lane NORMAL.
- Recomendacao: Round 104 deve repetir a mesma dificuldade mirando paridade ou
  vitoria em service/churn sem copiar residuo inseguro do NORMAL.

### AB-NORMAL-104

- Status: rejected_idle_no_task_delta
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-104.md`.
- Evidencia: lane `idle_timeout`, nenhum diff Kloel aceito, helper ausente,
  private/top-level functions ainda presentes, focused Jest passou contra fonte
  intacta, focused ESLint falhou, touched typecheck errors `0`.
- Benchmark: nao comparavel em shape/custo porque foi no-op.
- Recomendacao: repetir a mesma dificuldade.

### AB-ATOMIC-104

- Status: accepted_atomic_functional_policy_regression
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-104.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, traces `39`, `atomicModeClean=true`.
- Benchmark: venceu entrega funcional contra NORMAL no-op, mas o policy delta
  `routerDeps` getter piorou shape atomico versus Round 103 (`491/297/788` vs
  `490/297/787`).
- Recomendacao: rejeitar getter como fix de compactacao; Round 105 deve repetir
  mirando mover o parse seguro de `toolArgs` para helper/header ou politica
  equivalente.

### AB-NORMAL-105

- Status: rejected_timeout_lint_red_partial_baseline
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-105.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `1`,
  touched typecheck errors `0`, eventos `111`, comandos `1`, native file tool
  violations `38`, traces `0`.
- Benchmark: venceu focused Jest e service lines contra ATOMIC, mas nao e
  entrega aceita por timeout e lint vermelho.
- Recomendacao: repetir a mesma dificuldade; nao escalar.

### AB-ATOMIC-105

- Status: rejected_policy_sequence_failure
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-105.md`.
- Evidencia: lane `completed`, preprompt exit `1`, focused Jest `12/13`,
  focused ESLint `1`, touched typecheck errors `4`, eventos `2`, comandos `1`,
  failed commands `1`, native file tool violations `0`, traces `28`,
  `atomicModeClean=true`.
- Benchmark: venceu disciplina atomica, eventos, tempo, tokens, traceability,
  total Kloel lines e churn, mas falhou comportamento por
  `parseToolArgs` sem import.
- Recomendacao: Round 106 deve repetir com sequenciamento dependency-aware:
  extracao primeiro; helper/import de parser antes do replacement do callsite;
  validacao final focada antes de aceitar.

### AB-NORMAL-106

- Status: accepted_functional_but_timeout_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-106.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `128`, comandos `8`, failed commands
  `2`, native file tool violations `34`, traces `0`.
- Benchmark: funcional, mas perdeu todas as metricas dominantes para ATOMIC e
  nao convergiu dentro do budget.
- Recomendacao: manter como baseline funcional para repeticao Round 107.

### AB-ATOMIC-106

- Status: accepted_atomic_zero_loss_confirmation_required
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-106.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `41`,
  `atomicModeClean=true`.
- Benchmark: venceu completion, service lines, total Kloel lines, churn, tempo,
  comandos, failed commands, tokens, traceability e disciplina atomica; perdeu
  apenas helper-line count isolado.
- Recomendacao: repetir exatamente o mesmo tier no Round 107; se a vitoria
  atomica se repetir, escalar um degrau controlado.

### AB-NORMAL-107

- Status: rejected_timeout_functional_regression
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-107.md`.
- Evidencia: lane `max_timeout`, focused Jest `9/13`, focused ESLint `1` com
  11 erros, touched typecheck errors `3`, eventos `116`, native file tool
  violations `36`, traces `0`.
- Benchmark: deixou regressao runtime `ReferenceError: num is not defined`;
  nao e baseline funcional ou patch aceitavel.
- Recomendacao: considerar NORMAL comparavel na proxima escala somente se
  passar focused Jest/ESLint/touched typecheck.

### AB-ATOMIC-107

- Status: accepted_atomic_stability_confirmed_scale_next
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-107.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `41`,
  `atomicModeClean=true`.
- Benchmark: venceu task-functional pass, tempo, eventos, tokens, service
  lines, total Kloel lines, churn, traceability e disciplina atomica.
- Recomendacao: escalar um degrau controlado no Round 108, sem aumentar numero
  de workers.

### AB-NORMAL-108

- Status: rejected_idle_timeout_incomplete_wiring
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-108.md`.
- Evidencia: lane `idle_timeout`, focused Jest `13/13`, focused ESLint `1`,
  touched typecheck errors `0`, private scan `0`, top-level helpers ainda no
  service, eventos `38`, native file tool violations `12`.
- Benchmark: criou helpers, mas nao concluiu wiring/remocao no service; nao e
  baseline funcional.
- Recomendacao: repetir a mesma dificuldade; nao escalar.

### AB-ATOMIC-108

- Status: rejected_policy_residue_despite_structural_success
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-108.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `1`, touched typecheck errors `1`, eventos `3`, comandos `1`,
  native file tool violations `0`, traces `45`, `atomicModeClean=true`.
- Benchmark: venceu convergencia/estrutura/disciplina, mas perdeu aceite por
  `ToolArgs` unused no runtime helper.
- Recomendacao: Round 109 deve repetir a mesma tarefa com runtime target header
  minimo e check explicito contra `ToolArgs` no helper runtime.

### AB-NORMAL-109

- Status: accepted_functional_but_timeout_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-109.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `132`, comandos `16`, failed commands
  `3`, native file tool violations `23`, traces `0`.
- Benchmark: funcional nos gates focados, mas perdeu completion, tempo,
  comandos, failed commands, tokens, service lines, total Kloel lines, churn e
  traceability.
- Recomendacao: manter como baseline funcional para repetir Round 110.

### AB-ATOMIC-109

- Status: accepted_strong_atomic_win_repeat_before_scale
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-109.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `45`,
  `atomicModeClean=true`.
- Benchmark: venceu completion, tempo, eventos, comandos, failed commands,
  input/output/reasoning tokens, service lines, total Kloel lines, source churn
  e traceability; perdeu apenas router helper line count isolado.
- Recomendacao: repetir exatamente o mesmo tier no Round 110; se a vitoria
  atomica se repetir, escalar um degrau controlado.

### AB-NORMAL-110

- Status: accepted_functional_but_timeout_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-110.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `120`, comandos `16`, failed commands
  `4`, native file tool violations `27`, traces `0`.
- Benchmark: funcional nos gates focados, mas perdeu completion, tempo,
  comandos, failed commands, tokens, service lines, total Kloel lines, churn e
  traceability.
- Recomendacao: manter como baseline funcional para a escala Round 111.

### AB-ATOMIC-110

- Status: accepted_atomic_stability_confirmed_scale_next
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-110.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `45`,
  `atomicModeClean=true`.
- Benchmark: venceu completion, tempo, eventos, comandos, failed commands,
  input/output/reasoning tokens, service lines, total Kloel lines, source churn
  e traceability; perdeu apenas router helper line count isolado.
- Recomendacao: escalar um degrau controlado no Round 111, sem aumentar numero
  de workers.

### AB-NORMAL-111

- Status: accepted_functional_but_timeout_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-111.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `147`, comandos `14`, failed commands
  `3`, native file tool violations `37`, traces `0`.
- Benchmark: funcional nos gates focados, mas perdeu completion, tempo,
  comandos, failed commands, tokens, service lines, total Kloel lines, churn e
  traceability.
- Recomendacao: manter como baseline funcional para repetir Round 112.

### AB-ATOMIC-111

- Status: accepted_strong_atomic_win_repeat_before_scale
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-111.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `46`,
  `atomicModeClean=true`.
- Benchmark: venceu completion, tempo, eventos, comandos, failed commands,
  input/output/reasoning tokens, service lines, total Kloel lines, source churn
  e traceability; perdeu apenas helper line count isolado em router/parser.
- Recomendacao: repetir exatamente o mesmo tier no Round 112; se a vitoria
  atomica se repetir, escalar um degrau controlado.

### AB-NORMAL-112

- Status: accepted_functional_but_operational_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-112.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `146`, comandos `17`, failed commands
  `3`, native file tool violations `31`, traces `0`.
- Benchmark: funcional nos gates focados, mas perdeu tempo, eventos, comandos,
  failed commands, input/output/reasoning tokens, service lines, total Kloel
  lines, source churn e traceability; venceu apenas helper line count isolado
  em router/parser.
- Recomendacao: manter como baseline funcional e escalar Round 113 um degrau
  controlado apos repeticao da vitoria atomica.

### AB-ATOMIC-112

- Status: accepted_strong_atomic_win_scale_next
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-112.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `46`,
  `atomicModeClean=true`.
- Benchmark: venceu tempo, eventos, comandos, failed commands,
  input/output/reasoning tokens, service lines, total Kloel lines, source churn
  e traceability; perdeu apenas helper line count isolado em router/parser.
- Recomendacao: escalar um degrau controlado no Round 113, sem aumentar numero
  de workers.

### AB-NORMAL-113

- Status: accepted_as_incomplete_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-113.md`.
- Evidencia: lane `idle_timeout`, focused Jest `13/13`, focused ESLint `1`,
  touched typecheck errors `0`, eventos `25`, comandos `2`, native file tool
  violations `13`, traces `0`.
- Benchmark: nao entregou o split; private/top-level/cognitive scans falharam e
  nenhum helper alvo foi criado. Venceu apenas input/reasoning tokens enquanto
  incompleto.
- Recomendacao: repetir a mesma complexidade no Round 114 antes de nova escala.

### AB-ATOMIC-113

- Status: accepted_atomic_functional_win_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-113.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  native file tool violations `0`, traces `50`, `atomicModeClean=true`.
- Benchmark: venceu completion, primeira acao, agent time, eventos, comandos,
  output tokens, service lines, structural scans e traceability; input/reasoning
  tokens perderam apenas contra baseline incompleto.
- Recomendacao: repetir Round 114 na mesma complexidade com o operador de import
  surface atualizado; nao escalar ainda.

### AB-NORMAL-114

- Status: accepted_as_timeout_lint_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-114.md`.
- Evidencia: lane `max_timeout`, focused Jest `13/13`, focused ESLint `1`,
  touched typecheck errors `0`, eventos `104`, comandos `1`, native file tool
  violations `28`, traces `0`.
- Benchmark: persistiu a mutacao parcial, mas nao concluiu e deixou lint
  vermelho. Empatou apenas comandos e failed commands.
- Recomendacao: nao usar como baseline completo; repetir a mesma complexidade
  ou ajustar apenas budget/prompt do harness.

### AB-ATOMIC-114

- Status: accepted_atomic_functional_win_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-114.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  native file tool violations `0`, traces `45`, `atomicModeClean=true`.
- Benchmark: venceu completion, primeira acao, agent time, eventos,
  input/output/reasoning tokens, service lines, total Kloel lines, source churn,
  structural scans e traceability.
- Recomendacao: nao escalar ainda; repetir o tier quatro helpers ate haver
  baseline NORMAL completo ou prova equivalente.

### AB-NORMAL-115

- Status: accepted_functional_shape_baseline
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-115.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `171`, comandos `22`, failed commands
  `4`, traces `0`.
- Benchmark: funcional nos gates focados; venceu total Kloel lines `817` contra
  `831` e source churn `730` contra `740`.
- Recomendacao: usar como baseline comparavel de shape para o Round 116.

### AB-ATOMIC-115

- Status: accepted_atomic_comparable_win_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-115.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `45`,
  `atomicModeClean=true`.
- Benchmark: venceu primeira acao, agent time, eventos, comandos, failed
  commands, input/output/reasoning tokens, service lines e traceability; perdeu
  total Kloel lines e source churn para NORMAL.
- Recomendacao: repetir o tier quatro helpers com `lineBudgetChecks` e
  `sourceChurnBudgetChecks`; nao escalar ainda.

### AB-NORMAL-116

- Status: rejected_idle_timeout_no_mutation
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-116.md`.
- Evidencia: lane `idle_timeout`, eventos `1`, sem mutacao alvo.
- Benchmark: nenhuma vitoria aceita; manter Round 115 como baseline de shape.
- Recomendacao: repetir o tier sem escalar.

### AB-ATOMIC-116

- Status: rejected_shape_budget_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-116.md`.
- Evidencia: lane `completed`, preprompt exit `1`, traces `46`, gates
  funcionais internos verdes antes do budget, budget final vermelho.
- Benchmark: falhou total lines `823/817` e source churn `732/730`.
- Recomendacao: compactar parser/cognitive helper e repetir Round 117 com o
  mesmo budget.

### AB-NORMAL-117

- Status: rejected_idle_timeout_no_mutation
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-117.md`.
- Evidencia: lane `idle_timeout`, eventos `1`, sem mutacao alvo.
- Benchmark: nenhuma vitoria aceita; nao ha baseline atual.
- Recomendacao: repetir com prompt NORMAL mais curto e idle maior.

### AB-ATOMIC-117

- Status: accepted_atomic_budget_pass_repeat_for_normal_baseline
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-117.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, traces `46`, budget
  `809/817` lines e `718/730` churn.
- Benchmark: recuperou a derrota de shape do Round 116 e venceu o baseline
  NORMAL Round 115 em linhas/churn, mas sem NORMAL atual completo.
- Recomendacao: repetir Round 118 sem escalar ate obter baseline NORMAL atual.

### AB-NORMAL-118

- Status: accepted_functional_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-118.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `154`, comandos `9`, failed commands
  `3`, traces `0`.
- Benchmark: funcional e comparavel, mas perdeu tempo, eventos, comandos,
  failed commands, input/output/reasoning tokens, service lines, total Kloel
  lines, source churn e traceability.
- Recomendacao: usar como baseline completo do tier quatro helpers.

### AB-ATOMIC-118

- Status: accepted_strong_atomic_zero_loss_scale_next
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-118.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `46`,
  `atomicModeClean=true`.
- Benchmark: venceu todas as metricas materiais medidas: primeira acao, agent
  time, eventos, comandos, failed commands, input/output/reasoning tokens,
  service lines, total Kloel lines, source churn e traceability.
- Recomendacao: escalar um degrau controlado no Round 119, mantendo dois
  workers OpenCode e validacao externa.

### AB-NORMAL-119

- Status: accepted_functional_baseline_partial_wins
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-119.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `100`, comandos `12`, failed commands
  `3`, traces `0`.
- Benchmark: funcional e comparavel; venceu input tokens (`79.907` vs
  `81.993`) e total touched Kloel lines (`846` vs `849`).
- Recomendacao: manter como baseline do tier cinco helpers para o Round 120.

### AB-ATOMIC-119

- Status: accepted_strong_atomic_with_residual_losses_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-119.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `50`,
  `atomicModeClean=true`.
- Benchmark: venceu primeira acao, agent time, eventos, comandos, failed
  commands, output/reasoning tokens, service lines, source churn e traceability;
  perdeu input tokens e total touched Kloel lines.
- Recomendacao: repetir a mesma complexidade no Round 120 com compactacao de
  incoming-helper/preprompt antes de escalar.

### AB-NORMAL-120

- Status: accepted_functional_baseline_loss
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-120.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  touched typecheck errors `0`, eventos `125`, comandos `13`, failed commands
  `4`, traces `0`.
- Benchmark: funcional e comparavel, mas perdeu todas as metricas materiais
  nao empatadas para ATOMIC.
- Recomendacao: usar como baseline completo do tier cinco helpers.

### AB-ATOMIC-120

- Status: accepted_strong_atomic_zero_loss_scale_next
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-120.md`.
- Evidencia: lane `completed`, preprompt exit `0`, focused Jest `13/13`,
  focused ESLint `0`, touched typecheck errors `0`, eventos `3`, comandos `1`,
  failed commands `0`, native file tool violations `0`, traces `49`,
  `atomicModeClean=true`.
- Benchmark: venceu todas as metricas materiais medidas: primeira acao, agent
  time, eventos, comandos, failed commands, input/output/reasoning tokens,
  service lines, total Kloel lines, source churn e traceability.
- Recomendacao: escalar um degrau controlado no Round 121, mantendo dois
  workers OpenCode e validacao externa.

### AB-NORMAL-127

- Status: accepted_functional_baseline_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-127.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected/suppression/helper/service
  scans verdes, eventos `136`, comandos `11`, failed commands `6`, traces `0`.
- Benchmark: venceu o Round 127 porque ATOMIC falhou o residue scan final.
- Recomendacao: usar como baseline funcional do tier sete helpers.

### AB-ATOMIC-127

- Status: rejected_residual_cached_deps_state
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-127.md`.
- Evidencia: lane `completed`, preprompt final validation exit `1`, focused
  Jest `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`,
  traces `63`, mas service residue scan vermelho por `toolRouterDeps`.
- Benchmark: venceu eventos, primeira acao, agent time, comandos, failed
  commands, service lines e traceability, mas perdeu contrato funcional.
- Recomendacao: repetir no Round 128 com dependencias inline
  `executeToolActionDeps` e sem estado cacheado no service.

### AB-NORMAL-128

- Status: accepted_functional_baseline_timeout_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-128.md`.
- Evidencia: lane `max_timeout`, mas validacao externa passou focused Jest
  `13/13`, focused ESLint `0`, backend typecheck `0`, diff-check `0`,
  protected/suppression/helper/service/runtime scans verdes.
- Benchmark: venceu o Round 128 porque ATOMIC falhou o contrato funcional.
- Recomendacao: usar como baseline funcional do tier sete helpers.

### AB-ATOMIC-128

- Status: rejected_ambiguous_expected_count_partial_state
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-128.md`.
- Evidencia: lane `completed`, preprompt exit `1`, `atomicModeClean=true`,
  native file tool violations `0`, traces `62`; rejected por Jest/ESLint/
  typecheck/residue scan vermelhos apos replacement ambiguo de
  `toolRouterDeps`.
- Benchmark: venceu eventos, primeira acao, agent time, comandos, failed
  commands, tokens, total lines, source churn e traceability, mas perdeu
  contrato funcional.
- Recomendacao: repetir no Round 129 com `expectedCount > 1` expandido em
  ocorrencias atomicas sequenciais.

### AB-NORMAL-129

- Status: accepted_functional_service_facade_win
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-129.md`.
- Evidencia: lane `completed`, focused Jest/ESLint/typecheck/diff verdes,
  service residue/helper/protected/suppression scans verdes, service lines
  `281`.
- Benchmark: venceu service facade compactness.
- Recomendacao: usar como baseline de shape para a politica atomica Round 130.

### AB-ATOMIC-129

- Status: accepted_strong_atomic_with_facade_loss_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-129.md`.
- Evidencia: lane `completed`, preprompt exit `0`, `atomicModeClean=true`,
  focused Jest/ESLint/typecheck/diff verdes, traces `70`.
- Benchmark: venceu tempo, eventos, comandos, failed commands, tokens, total
  lines, source churn e traceability; perdeu service lines `396` vs `281`.
- Recomendacao: repetir no Round 130 com compactacao macro da facade.

### AB-NORMAL-130

- Status: accepted_functional_compact_baseline
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-130.md`.
- Evidencia: lane `completed`, focused Jest `0`, focused ESLint `0`, backend
  typecheck `0`, diff-check `0`, scans finais verdes, service lines `184`.
- Benchmark: venceu contrato funcional e compactness da facade.
- Recomendacao: usar como baseline compacto para Round 131.

### AB-ATOMIC-130

- Status: rejected_rigid_oldtext_macro_anchor
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-130.md`.
- Evidencia: preprompt exit `1`, erro
  `atomic_replace_text expected 1 occurrence(s), observed 0`,
  `atomicModeClean=true`, Jest/ESLint/typecheck externos vermelhos.
- Benchmark: venceu total lines e source churn, mas perdeu contrato funcional e
  service facade compactness.
- Recomendacao: repetir no Round 131 com `replace_file_with_current_anchor`.

### AB-NORMAL-131

- Status: rejected_incomplete_process_message_extraction
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-131.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff vazio e suppression
  scan limpo.
- Benchmark: venceu total Kloel lines `1006` vs `1045` e source churn `1101`
  vs `1534`.
- Falha: final contract vermelho porque o service reteve
  `chatCompletionWithFallback`, `recordAgentRuntimeTurn`,
  `buildUnifiedAgentCognitiveState`, `formatPromptValue`,
  `processUnifiedAgentToolCalls` e `processUnifiedAgentPredecidedActions`.
- Recomendacao: usar apenas como baseline parcial; repetir o mesmo tier.

### AB-ATOMIC-131

- Status: rejected_literal_validation_and_post_failure_native_reads
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-131.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff vazio, suppression scan
  limpo, traces `76`, service facade `184`.
- Benchmark: venceu tempo, primeira acao, eventos, comandos, failed commands,
  tokens, service lines e traceability.
- Falha: gate final exigia `callee({` em vez de topologia de chamada; fallback
  pos-falha usou `grep`/`glob`/`read` nativos e quebrou `atomicModeClean`.
- Recomendacao: repetir no Round 132 com `requiredRegexChecks` e atomic-only
  tambem no caminho de investigacao de falha.

### AB-NORMAL-132

- Status: rejected_incoming_helper_too_shallow
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-132.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff vazio,
  suppression/helper/private scans limpos.
- Benchmark: venceu input tokens `73577` vs `145910` e shape bruto
  `961/1072` total lines/churn vs `1045/1534`, mas sem aceite funcional.
- Falha: final topology-aware validation vermelha; incoming helper nao contem
  LLM completion, runtime turn recording, tool-call processing nem predecided
  processing.
- Recomendacao: usar apenas como pressao de eficiencia/shape; nao escalar.

### AB-ATOMIC-132

- Status: accepted_functional_with_input_overhead_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-132.md`.
- Evidencia: lane `completed`, preprompt exit `0`, final topology-aware
  validation `0`, focused Jest `13/13`, focused ESLint `0`, backend
  typecheck `0`, diff-check `0`, protected diff vazio, scans limpos, traces
  `76`, `atomicModeClean=true`.
- Benchmark: venceu contrato funcional, tempo, primeira acao, eventos,
  comandos, failed commands, output/reasoning, service facade e traceability.
- Falha residual: input-token overhead por sucesso de preprompt imprimindo
  linhas JSON enormes de `atomicDiff` via grep.
- Recomendacao: repetir no Round 133 apos compactacao do stdout de sucesso do
  preprompt.

### AB-NORMAL-133

- Status: rejected_final_topology_contract
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-133.md`.
- Evidencia: lane `completed`, focused Jest `13/13`, focused ESLint `0`,
  backend typecheck `0`, diff-check `0`, protected diff vazio,
  suppression/helper/private scans limpos.
- Falha: `final_validation_status=1`; service reteve
  `recordAgentRuntimeTurn(`, nao delegou `processMessage` por
  `return processIncomingUnifiedAgentMessage(`, e incoming helper nao possui
  runtime turn recording nem callees de tool-call/predecided processing.
- Benchmark bruto: agent time `1253.180s`, eventos `153`, comandos `13`,
  failed commands `3`, input/output/reasoning `83761/17705/17423`, traces `0`.
- Recomendacao: nao aceitar shape bruto menor como vitoria; lane falhou o
  contrato funcional final.

### AB-ATOMIC-133

- Status: accepted_functional_repeat_same_complexity
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-133.md`.
- Evidencia: lane `completed`, preprompt exit `0`, final validation `0`,
  focused Jest `13/13`, focused ESLint `0`, backend typecheck `0`,
  diff-check `0`, protected diff vazio, scans limpos, traces `76`,
  `atomicModeClean=true`.
- Benchmark: venceu contrato funcional, tempo `270.649s` vs `1253.180s`,
  primeira acao `3.881s` vs `18.453s`, eventos `3` vs `153`, comandos `1`
  vs `13`, failed commands `0` vs `3`, input/output/reasoning
  `52006/132/115` vs `83761/17705/17423`, service facade `184` vs `304` e
  traceability `76` vs `0`.
- Ferramenta corrigida: `round-audit.cjs` passou a aplicar
  `final_validation_status` no aceite funcional.
- Recomendacao: repetir no Round 134, mesma complexidade, para confirmar
  estabilidade com auditor corrigido antes de escalar.

### AB-NORMAL-134

- Status: rejected_final_topology_contract
- Handoff detalhado: `docs/ai/mission/handoffs/AB-NORMAL-134.md`.
- Evidencia: lane `completed`, final validation `1`.
- Falha: service manteve residuo direto de cognitive/context/runtime e o
  incoming helper nao assumiu o contrato completo.
- Benchmark: perdeu para ATOMIC em tempo/eventos/comandos/tokens; traces `0`.
- Recomendacao: rejeitar como solucao final.

### AB-ATOMIC-134

- Status: rejected_typecheck_baseline_blocks_clean_repeat
- Handoff detalhado: `docs/ai/mission/handoffs/AB-ATOMIC-134.md`.
- Evidencia: lane `completed`, `atomicModeClean=true`, traces `76`, mas final
  validation `1` por backend typecheck vermelho.
- Falha: baseline typecheck fora dos arquivos do benchmark, incluindo Google
  Ads credential unique input e `PrismaService.lineageEntry` ausente.
- Benchmark: venceu tempo/eventos/comandos/failed/tokens/trace, mas nao e prova
  limpa de escalada.
- Recomendacao: manter Round 133 como ultima vitoria aceita e reconciliar
  typecheck antes de escalar.

## Handoffs Rejeitados

- `OC-ATOMIC-ONLY-VALIDATION-001`: aceito como achado critico, rejeitado como estado operacional final; provou que OpenCode ainda nao era atomic-only antes do reparo.
- `OC-ATOMIC-RUNTIME-004`: aceito como achado critico, rejeitado como estado operacional final; escreveu codigo real durante uma missao `preview:true` e obrigou reparo de `atomic_replace_literal`.
- `AB-ATOMIC-004`: rejeitado como entrega final; OpenCode ATOMIC nao expos ferramentas MCP atomicas e o worker tentou derivar para escrita Bash/Node proibida.
- `AB-NORMAL-006` e `AB-ATOMIC-006`: rejeitados como entrega final; ambos ficaram em timeout sem mutacao e sem handoff final persistido, entao nao ha vencedor tecnico.
- `OC-LEDGER-AUDIT-001`: saida parcial/sem handoff final persistivel; nao aceito.
- `OC-OBSIDIAN-GRAPH-001`: sem handoff final persistivel; nao aceito.
- `OC-ORCHESTRATION-001`: sem handoff final persistivel; nao aceito.
- `OC-PRODUCT-PROOF-001`: sem handoff final persistivel; nao aceito.
- `OC-OBSIDIAN-GRAPH-002`: worker encontrou prompt de permissao ao ler vault externo e nao entregou handoff final; nao aceito.
- `OC-PRODUCT-PROOF-002`: sem handoff final persistivel; nao aceito.

## Estado de Limpeza

- `ps -o pid,ppid,stat,etime,rss,command -ax | rg 'opencode (serve|run)' || true`: nenhum `opencode serve/run` ativo apos limpeza da micro-onda 2026-05-16 13:41.
- Escalar para 20-50 workers locais permanece bloqueado por capacidade de host e lease topology, apesar da micro-onda 4/4 ter produzido handoff.

## Protocolo Obrigatorio

Cada worker precisa registrar:

- ID do worker
- prompt recebido
- arquivos lidos
- arquivos alterados
- hipotese inicial
- decisao tomada
- testes/comandos executados
- evidencia antes/depois
- risco residual
- recomendacao para proximo worker
- status: accepted / rejected / needs_lapida

Entrega sem handoff persistido nao conta como aceita.
