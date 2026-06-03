# Round 126 Verdict - OpenCode NORMAL vs ATOMIC

Data: 2026-05-18 11:13 UTC

## Resultado

- Veredito: NORMAL venceu funcionalmente; ATOMIC rejeitado.
- Escala de complexidade: bloqueada.
- Proxima acao: Round 127 deve repetir exatamente a mesma tarefa com a
  politica atomica ja reparada para nao rodar focused ESLint final em estado
  intermediario.

## Tarefa

Split de `backend/src/kloel/unified-agent.service.ts` no tier sete helpers:

- `unified-agent-tool-router.helpers.ts`
- `unified-agent-runtime.helpers.ts`
- `unified-agent-tool-parser.helpers.ts`
- `unified-agent-cognitive-state.helpers.ts`
- `unified-agent-incoming-message.helpers.ts`
- `unified-agent-tool-call-processing.helpers.ts`
- `unified-agent-predecided-processing.helpers.ts`

## Gates Externos

NORMAL:

- focused Jest: PASS, `13/13`
- focused ESLint: PASS, exit `0`
- backend typecheck: PASS, exit `0`
- touched Kloel typecheck errors: `0`
- diff-check: PASS, exit `0`
- protected diff: vazio
- suppression scan: limpo
- helper `this.` scan: limpo
- private/residual service scan: limpo
- `normalTaskFunctionalPass=true`

ATOMIC:

- focused Jest: PASS, `13/13`
- focused ESLint: FAIL, exit `1`
- backend typecheck: PASS, exit `0`
- touched Kloel typecheck errors: `0`
- diff-check: PASS, exit `0`
- protected diff: vazio
- suppression scan: limpo
- helper `this.` scan: limpo
- private/residual service scan: FAIL
- `atomicTaskFunctionalPass=false`

## Metricas Comparaveis

Como o ATOMIC nao foi task-functional, metricas de shape/churn nao sao usadas
como vitoria final. Elas ficam registradas apenas como diagnostico.

| Metrica | NORMAL | ATOMIC | Vencedor |
| --- | ---: | ---: | --- |
| Lane completed | sim | sim | empate |
| Eventos | 131 | 3 | ATOMIC |
| Primeira acao | 16.225s | 3.028s | ATOMIC |
| Agent time | 1007.770s | 63.744s | ATOMIC |
| Comandos shell | 11 | 1 | ATOMIC |
| Failed commands | 3 | 1 | ATOMIC |
| Input tokens | 80.892 | 52.936 | ATOMIC |
| Output tokens | 16.271 | 176 | ATOMIC |
| Reasoning tokens | 10.893 | 158 | ATOMIC |
| Native file violations ATOMIC | n/a | 0 | ATOMIC clean |
| Traces | 0 | 11 | ATOMIC |

## Derrota Atomica Formalizada

O ATOMIC abortou cedo porque `validate_kloel_unified_agent` rodou focused
ESLint como se fosse gate final durante uma extracao parcial. A validacao
intermediaria encontrou `no-unsafe-assignment` em `unified-agent.service.ts`
linha `402` e interrompeu o macro antes das demais extracoes.

Resultado externo do estado parcial:

- service permaneceu com `708` linhas;
- apenas `unified-agent-runtime.helpers.ts` foi criado;
- `validateAbiPayload`, `forEachSequential`,
  `buildPredecidedActionDraft`, `executePredecidedAgentActions` e private
  router methods continuaram no service;
- `private_methods_scan_exit=0`;
- `lint_exit=1`.

## Atualizacao Do Atomic OS

Ferramenta reparada no repo principal:

- `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`

Mudanca: focused ESLint dentro de `runKloelUnifiedAgentValidation` agora roda
somente quando `includeEslint === true` ou quando o perfil final exige
`enforceFinalServiceResidue`. Assim, validacoes intermediarias deixam de
executar o gate final de lint, mas a validacao final do tier sete helpers
continua dura.

## Evidencia

- `docs/ai/atomic-os-benchmark/round-126/audit.json`
- `docs/ai/atomic-os-benchmark/round-126/normal-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-126/atomic-external-validation.log`
- `docs/ai/atomic-os-benchmark/round-126/typecheck-normal.log`
- `docs/ai/atomic-os-benchmark/round-126/typecheck-atomic.log`
- `docs/ai/mission/handoffs/AB-NORMAL-126.md`
- `docs/ai/mission/handoffs/AB-ATOMIC-126.md`

## Decisao

Nao escalar. Round 127 deve repetir a mesma complexidade, sincronizando a
toolchain atomica reparada para o worktree ATOMIC antes do launch. Sucesso
atomico so pode ser aceito se `atomicTaskFunctionalPass=true`, service-residue
gate final passar, `atomicModeClean=true`, e nenhuma metrica material vencida
pelo NORMAL permanecer sem diagnostico.
