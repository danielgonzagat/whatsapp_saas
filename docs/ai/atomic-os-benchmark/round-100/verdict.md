# Round 100 Verdict - OpenCode NORMAL vs ATOMIC

Data: 2026-05-17 22:06 America/Sao_Paulo

## Tarefa

Extrair um cluster misto de `backend/src/kloel/unified-agent.service.ts` para
`backend/src/kloel/unified-agent-tool-router.helpers.ts`:

- top-level `isAllowedTool`
- top-level `formatPromptValue`
- `UnifiedAgentService.executeToolAction`
- `UnifiedAgentService.num`
- `UnifiedAgentService.buildAgentToolEnvelope`
- `UnifiedAgentService.actionSucceeded`
- `UnifiedAgentService.buildAgentRuntimeContext`
- `UnifiedAgentService.recordAgentRuntimeTurn`

## Resultado

- Veredito: ATOMIC venceu operacionalmente, mas nao e zero-loss.
- Decisao: nao escalar complexidade. Repetir o mesmo tier no Round 101.
- Motivo: ATOMIC completou em `202.852s` de agente contra NORMAL
  `max_timeout` em `900.920s`, mas NORMAL ficou `4` linhas/churn de produto
  mais compacto quando validado externamente.

## Validacao Externa

Ambos worktrees foram preservados e validados fora do self-report dos workers.

- NORMAL:
  - lane: `max_timeout`
  - `git diff --check -- backend/src/kloel`: `0`
  - protected diff: `0`
  - suppression scan: vazio
  - helper `this.` scan: vazio
  - private/top-level extracted scan: vazio
  - helper exports: 8/8
  - public API scan: `executeTool` e `buildQuotedReplyPlan` preservados
  - Jest focado: `13/13`
  - ESLint focado: `0`
  - backend typecheck: `2`, ruido compartilhado Google Ads/Prisma fora de
    `src/kloel/**`; touched typecheck errors `0`
- ATOMIC:
  - lane: `completed`
  - `git diff --check -- backend/src/kloel`: `0`
  - protected diff: `0`
  - suppression scan: vazio
  - helper `this.` scan: vazio
  - private/top-level extracted scan: vazio
  - helper exports: 8/8
  - public API scan: `executeTool` e `buildQuotedReplyPlan` preservados
  - Jest focado: `13/13`
  - ESLint focado: `0`
  - backend typecheck: `2`, mesmo ruido compartilhado Google Ads/Prisma fora de
    `src/kloel/**`; touched typecheck errors `0`

## Scorecard

| Metrica | NORMAL | ATOMIC | Vencedor |
| --- | ---: | ---: | --- |
| Lane status | `max_timeout` | `completed` | ATOMIC |
| Agent time | `900.920s` | `202.852s` | ATOMIC |
| First action | `28.194s` | `6.822s` | ATOMIC |
| Event rows | `129` | `3` | ATOMIC |
| Shell commands | `4` | `1` | ATOMIC |
| Failed commands | `3` | `0` | ATOMIC |
| Agent messages | `14` | `1` | ATOMIC |
| Native write/edit tools | `write=1`, `edit=11` | `0` | ATOMIC |
| Atomic traces | `0` | `40` | ATOMIC |
| Service lines | `486` | `490` | NORMAL |
| Helper lines | `297` | `297` | empate |
| Total product lines | `783` | `787` | NORMAL |
| Product churn estimate | `616` | `620` | NORMAL |

## Vitorias do NORMAL

- Shape bruto: `4` linhas totais e `4` linhas de churn a menos.
- Causa: usou getter de dependencias e assercao direta de JSON
  `as Record<string, unknown>`; a segunda e mais compacta, mas tem menor prova
  semantica que a normalizacao defensiva do ATOMIC.

## Vitorias do ATOMIC

- Completou dentro do limite; NORMAL estourou o `max_timeout`.
- Manteve `0` failed commands contra `3`.
- Usou uma macro atomica com traces, sem `write`/`edit` nativo.
- Venceu tempo, primeira acao, eventos, comandos e superficie operacional com
  margem grande.
- Preservou comportamento focado e passou os mesmos gates externos do NORMAL.

## Atualizacao Atomica Aplicada

`docs/ai/atomic-os-benchmark/tools/atomic-call.cjs` agora aceita
`dependencyContainer`/`depsContainer` com `style=getter`. A ferramenta gera o
getter de dependencias a partir de uma politica minima dinamica:

- `name`
- `typeName`
- `entries`
- `insertBeforeClassEndMarker` ou `oldText`

Isso reduz hardcode operacional no prompt e permite repetir o Round 100 usando
shape de dependencia mais compacto sem copiar a assercao insegura do NORMAL.

Validacao da ferramenta:

- `node --check docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`: passou
- `git diff --check -- docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`:
  passou

## Proxima Acao

Round 101 deve repetir exatamente o mesmo tier, usando `dependencyContainer`
getter dinamico no ATOMIC. So escalar depois de ATOMIC manter completion,
validacao externa e vencer/empatar compactacao sem reduzir a seguranca do parse
de JSON.
