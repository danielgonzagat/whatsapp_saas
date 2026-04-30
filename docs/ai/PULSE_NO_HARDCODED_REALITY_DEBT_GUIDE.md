# PULSE No-Hardcoded Reality Debt Guide

Este documento registra o trabalho real feito na remocao de divida apontada por
`scripts/pulse/no-hardcoded-reality-audit.ts`. Ele nao e um plano abstrato: cada
entrada abaixo separa evidencia, decisao tecnica, o que funcionou, o que nao
funcionou e o proximo patch seguro.

Regra operacional desta rodada:

- O auditor `scripts/pulse/no-hardcoded-reality-audit.ts` e governanca trancada.
  Ele nao foi editado, enfraquecido, renomeado, apagado ou contornado.
- O escopo de edicao ficou dentro de PULSE e docs PULSE.
- Arquivos de produto/frontend que apareceram sujos no worktree foram tratados
  como trabalho externo e nao foram tocados.
- Subagents foram mantidos em modo read-only/plano para nao gerarem novamente
  `*.split.ts` nem sobrescreverem o workspace.

## Checkpoint De Auditor Completo

Comando executado:

```sh
backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "import { auditPulseNoHardcodedReality } from './scripts/pulse/no-hardcoded-reality-audit'; const r=auditPulseNoHardcodedReality(process.cwd()); ..."
```

Resultado fresco depois dos patches desta rodada:

```json
{
  "scannedFiles": 708,
  "totalFindings": 138569,
  "ratchet": [
    "lockedFloor:138905",
    "activeFloor:138569",
    "currentTotal:110206",
    "debt:1"
  ]
}
```

Contagens focadas depois dos patches:

```json
{
  "scripts/pulse/property-tester.ts": { "total": 1052, "current": 45 },
  "scripts/pulse/source-root-detector.ts": { "total": 591, "current": 374 },
  "scripts/pulse/manifest.ts": { "total": 356, "current": 49 },
  "scripts/pulse/api-fuzzer.ts": { "total": 593, "current": 161 },
  "scripts/pulse/runtime-fusion.ts": { "total": 735, "current": 183 },
  "scripts/pulse/certification.ts": { "total": 1086, "current": 36 }
}
```

Interpretacao correta: o total global caiu em relacao ao floor trancado, mas o
auditor ainda preserva divida historica e `debt:1`. O criterio de sucesso nesta
rodada foi reduzir divida atual sem apagar comportamento e sem alterar o auditor.

## Divida 1: `property-tester.ts` Status Hardcoded

Estado inicial medido:

```json
{
  "total": 1061,
  "current": 54,
  "byKind": {
    "hardcoded_literal_surface_risk": 41,
    "hardcoded_regex_surface_risk": 2,
    "hardcoded_boolean_surface_risk": 8,
    "hardcoded_const_declaration_risk": 1,
    "hardcoded_numeric_surface_risk": 2
  }
}
```

Problema real:

`buildPropertyTestEvidence()` contava status com literais escritos diretamente:
`planned`, `not_executed` e `passed`. Isso fazia o PULSE saber estados de prova
antes de consultar a fonte dinamica existente em `dynamic-reality-kernel`.

Solucao aplicada:

- Adicionados helpers locais:
  - `observedStatusAt`
  - `observedPassedStatus`
  - `observedPlannedStatus`
  - `observedNotExecutedStatus`
  - `countByObservedStatus`
- Substituidas as comparacoes diretas de status por contagem baseada em
  `discoverPropertyPassedStatusFromTypeEvidence()` e
  `discoverPropertyUnexecutedStatusFromExecutionEvidence()`.

Raciocinio tecnico documentado:

O status ainda existe como contrato de saida, mas a decisao de qual status conta
como planejado, nao executado ou aprovado nao fica duplicada no collector. O
collector pergunta ao kernel dinamico qual catalogo observado representa esses
estados e apenas agrega evidencias.

O que funcionou:

- Auditor file-level caiu de `1061 total / 54 current` para `1053 total / 46 current`
  apos a primeira fatia.
- Nao foi preciso tocar no auditor.
- Nao houve criacao de listas novas para esconder os mesmos literais.

O que nao funcionou:

- `backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "import './scripts/pulse/property-tester'"`
  falhou porque `property-tester.ts` ja esta truncado/incompleto no estado atual.
- A falha nao veio do patch de status. O arquivo ja referencia exports/funcoes que
  nao existem no modulo principal atual, como `scanForExistingPropertyTests`,
  `generatePropertyTestTargets`, `mergeAndDedupe`, `zeroValue`, `routeSeparator`
  e outros helpers.
- Portanto, type/import completo de `property-tester.ts` nao pode ser usado como
  prova final ate a fonte de verdade ser restaurada do companion ou reconstruida.

## Divida 2: `property-tester.ts` Artifact Estrutural Hardcoded

Problema real:

`discoverEndpoints()` montava o artifact estrutural com literal:
`.pulse/current/PULSE_STRUCTURAL_GRAPH.json`.

Solucao aplicada:

- Adicionado `canonicalStructuralGraphFilename()`.
- Substituido o nome literal do arquivo por
  `discoverAllObservedArtifactFilenames().structuralGraph`.

Raciocinio tecnico documentado:

O caminho `.pulse/current` ainda e parte do protocolo atual do PULSE neste arquivo,
mas o nome do artifact deixou de ser uma verdade local duplicada. O produtor
catalogado pelo kernel passa a ser a fonte do nome.

O que funcionou:

- Auditor file-level caiu de `1053 total / 46 current` para `1052 total / 45 current`.
- Patch pequeno, sem mudanca de fluxo e sem tocar em tests/produto/governanca.

O que nao funcionou:

- Isso nao resolve o problema estrutural do arquivo truncado.
- Isso remove apenas uma ocorrencia de nome de artifact; nao remove regex,
  boolean/numeric hardcodes nem divida historica preservada.
- Durante a rodada, `property-tester.ts` foi sobrescrito de volta ao estado sem
  diff. A mesma fatia teve que ser reaplicada. Evidencia apos reaplicar:
  `1052 total / 45 current`.

## Divida 3: `manifest.ts` Contrato Hardcoded

Estado inicial medido:

```json
{
  "total": 369,
  "current": 67
}
```

Problema real:

`manifest.ts` duplicava manualmente a lista de campos obrigatorios de
`PulseManifest` em `REQUIRED_FIELDS`, e duplicava os valores aceitos de
`PulseEnvironment` e `PulseTimeWindowMode` dentro de validadores locais. Isso
fazia o PULSE carregar um contrato escrito duas vezes: uma vez nos tipos e outra
vez na validacao.

Solucao aplicada:

- Importado `typescript`.
- Adicionado `sourceFileFromPulseTypeContract(fileName)`.
- Adicionado `requiredManifestFieldsFromTypeContract()`.
- Adicionado `stringUnionValuesFromTypeContract(fileName, typeName)`.
- `REQUIRED_FIELDS` passou a ser derivado do AST de
  `scripts/pulse/types.manifest.ts`, lendo a interface `PulseManifest` e
  coletando apenas `PropertySignature` sem `questionToken`.
- `isEnvironmentArray()` passou a validar contra a union `PulseEnvironment` em
  `scripts/pulse/types.health.ts`.
- `isTimeWindowModeArray()` passou a validar contra a union
  `PulseTimeWindowMode` em `scripts/pulse/types.health.ts`.

Raciocinio tecnico documentado:

O contrato tipado vira a fonte da validacao. Se o arquivo de contrato nao puder
ser lido ou nao declarar a interface/union esperada, a funcao falha fechada com
erro em vez de aceitar qualquer coisa. Isso evita transformar hardcode em
fallback permissivo.

O que funcionou:

Comando:

```sh
backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "import './scripts/pulse/manifest'; console.log('manifest import ok')"
```

Resultado:

```text
manifest import ok
```

Auditor file-level depois do patch:

```json
{
  "total": 356,
  "current": 49
}
```

Reducao confirmada: `369/67 -> 356/49`.

O que nao funcionou:

- Isso ainda nao restaura `loadPulseManifest` no modulo principal. Essa funcao
  continua no companion `scripts/pulse/__companions__/manifest.companion.ts`.
- O patch reduz contrato duplicado, mas a restauracao de fonte de verdade do
  manifest ainda precisa acontecer antes de typecheck global ficar limpo.

## Divida 4: `source-root-detector.ts` Export Quebrado

Problema real:

`scripts/pulse/source-root-detector.ts` estava sem as exports publicas que os
callers e testes usam:

- `detectSourceRoots`
- `sourceGlobsForTsMorph`

O comportamento completo estava espalhado em companion/continuidade, deixando o
modulo principal importavel mas sem contrato funcional. Tentar reduzir hardcode
sem restaurar o contrato seria criar uma melhoria falsa.

Solucao aplicada:

- Restaurada a continuacao operacional no arquivo principal.
- Reintroduzidas as exports `detectSourceRoots` e `sourceGlobsForTsMorph`.
- Preservado o comportamento coberto por `source-root-detector.spec.ts`.

Raciocinio tecnico documentado:

Aqui a prioridade foi corrigir realidade quebrada antes de contar reducao. O
auditor pode punir a restauracao porque ela recoloca superficie literal/regex
que ainda precisa ser liquefeita, mas apagar comportamento para reduzir contagem
seria fraude tecnica. O PULSE liquido nao pode passar no auditor ficando mudo.

O que funcionou:

Comando executado:

```sh
npx vitest run scripts/pulse/__tests__/source-root-detector.spec.ts
```

Resultado:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

Tambem foi validado via `ts-node` que o modulo exporta:

```text
[ 'detectSourceRoots', 'sourceGlobsForTsMorph' ]
```

O que nao funcionou:

- O auditor file-level de `source-root-detector.ts` subiu para `597 total / 380 current`.
- Isso e esperado para uma restauracao de comportamento: o arquivo voltou a
  conter fonte operacional que ainda carrega hardcode.
- A proxima etapa nao deve apagar essa logica. Deve substituir listas/regex por
  descoberta real:
  - extensoes a partir de arquivos observados e TypeScript AST,
  - ignored paths a partir de `.gitignore`/tsconfig/package metadata,
  - framework/kind por imports/decorators/manifest, nao por regex decisoria.

## Divida 5: Arquivos Truncados E Companions

Achado recorrente dos workers read-only:

Varios modulos PULSE principais estao truncados ou incompletos, enquanto a
continuidade vive em `scripts/pulse/__companions__`. Isso muda a ordem correta
de trabalho:

1. Restaurar fonte de verdade no modulo principal.
2. Validar import/spec focado.
3. So depois remover hardcode decisorio.

Arquivos identificados:

- `scripts/pulse/api-fuzzer.ts`
  - Falta `discoverAPIEndpoints`, `buildAPIFuzzCatalog`,
    `classifyEndpointRisk` e geradores usados por callers.
  - Companion relevante: `scripts/pulse/__companions__/api-fuzzer.companion.ts`.

- `scripts/pulse/runtime-fusion.ts`
  - Falta `buildRuntimeFusionState` e blocos de loader/mapping/scoring.
  - Companion relevante: `scripts/pulse/__companions__/runtime-fusion.companion.ts`.

- `scripts/pulse/certification.ts`
  - Falta `computeCertification`, importado por daemon/index/tests.
  - Companion relevante: `scripts/pulse/__companions__/certification.companion.ts`.

- `scripts/pulse/manifest.ts`
  - Falta `loadPulseManifest`, consumido por daemon e watch state.
  - Companion relevante: `scripts/pulse/__companions__/manifest.companion.ts`.

- `scripts/pulse/property-tester.ts`
  - Collector principal referencia helpers ausentes no arquivo principal.
  - Isso bloqueia import/typecheck do modulo isolado.

O que nao funciona:

- Atacar `deriveAction`, regex de fuzz ou listas de API antes de restaurar a fonte
  de verdade. Isso reduz contagem local, mas nao prova funcionamento.
- Deletar companions ou `*.split.ts` para reduzir auditor. O auditor preserva
  debt quando ha delecao sem substituicao dinamica.

O que funciona:

- Primeiro restaurar contrato publico e specs focadas.
- Depois substituir hardcode por predicados/evidencia.

## Workers Ativos E Disciplina

Workers foram usados apenas para leitura/plano. Todos receberam instrucao de:

- nao editar arquivos,
- nao criar arquivos,
- nao deletar arquivos,
- nao gerar `*.split.ts`,
- nao tocar no auditor trancado.

Planos uteis recebidos:

- `api-fuzzer.ts`: restaurar exports faltantes do companion antes de qualquer
  reducao de hardcode.
- `runtime-fusion.ts`: restaurar `buildRuntimeFusionState` e fonte de verdade
  antes de mexer em `deriveAction`.
- `manifest.ts`: derivar campos obrigatorios e unions do AST de
  `types.manifest.ts`/`types.health.ts`, sem duplicar lista local.
- `certification.ts`: primeira fatia deve centralizar predicados de gate/status
  em helpers, sem reescrever certificacao inteira.
- `property-tester.ts`: status-counting foi a primeira fatia segura; artifact
  filename foi a segunda.

## Validacoes Executadas Nesta Rodada

Passaram:

```sh
npx vitest run scripts/pulse/__tests__/source-root-detector.spec.ts
```

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

```sh
git diff --check -- scripts/pulse/property-tester.ts scripts/pulse/source-root-detector.ts docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md
```

Resultado: sem saida, sem whitespace errors.

Bloquearam:

```sh
backend/node_modules/.bin/ts-node --project scripts/pulse/tsconfig.json -e "import './scripts/pulse/property-tester'"
```

Motivo: arquivo ja esta incompleto/truncado e referencia helpers ausentes. Isso
deve ser tratado como divida de restauracao de fonte, nao como falha do patch de
status.

## Proxima Ordem Segura

1. `api-fuzzer.ts`: restaurar exports publicas do companion para o modulo
   principal e validar specs que importam `buildAPIFuzzCatalog`.
2. `runtime-fusion.ts`: restaurar `buildRuntimeFusionState` no modulo principal.
3. `manifest.ts`: criar resolver de contrato por TypeScript AST para substituir
   `REQUIRED_FIELDS`, `PulseEnvironment` e `PulseTimeWindowMode` hardcoded.
4. `property-tester.ts`: depois da restauracao completa, trocar regex de
   property-test por AST/call-expression predicates.
5. `source-root-detector.ts`: substituir listas/regex decisorias por descoberta
   de manifest/tsconfig/gitignore/import AST.

Regra final deste guia: reducao de auditor so conta quando comportamento e prova
continuam vivos. Se a contagem cai porque codigo foi apagado, nao e solucao do
PULSE liquido; e perda de realidade.
