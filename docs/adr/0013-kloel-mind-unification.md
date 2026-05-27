# ADR 0013: Kloel Mind — unification of Brain, AI-Brain, CIA, and Mind

Data: 2026-05-26

## Status

Aceita (com restrições explícitas sobre schema — ver §"Schema").

## Contexto

O Kloel acumulou **quatro pastas de domínio com responsabilidade cognitiva**
sobrepostas, mesmas regras de chamada, e divergência de nomenclatura:

| Pasta | Files | Services | Responsabilidade aparente |
|---|---:|---:|---|
| `backend/src/kloel/` | 735 | 300 | Domínio dominante; abriga `mind/`, `brain-*`, `ai-brain` indireto, `cia/` indireto, todas as capabilities operacionais |
| `backend/src/ai-brain/` | 9 | 5 | `AgentAssistService`, `KnowledgeBaseService`, `MediaFactoryService`, `VectorService`, `HiddenDataExtractorService` |
| `backend/src/brain/` | 1 | 1 | `BrainSpineAuditService` apenas |
| `backend/src/cia/` | 16 | 11 | `CiaRuntimeService`, `CiaBacklogRunService`, `CiaInlineFallbackService`, `CiaService`, etc. |

Os **services Brain** dentro de `kloel/` (8 services):

```
BrainAutonomyService           backend/src/kloel/brain-autonomy.service.ts
BrainCapabilityExecutorService backend/src/kloel/brain-capability-executor.service.ts
BrainCapabilityRegistryService backend/src/kloel/brain-capability-registry.service.ts
BrainCommercialGraphService    backend/src/kloel/brain-commercial-graph.service.ts
BrainEventSpineService         backend/src/kloel/brain-event-spine.service.ts
BrainRuntimeService            backend/src/kloel/brain-runtime.service.ts
WhatsAppBrainService           backend/src/kloel/whatsapp-brain.service.ts
KloelLeadBrainService          backend/src/kloel/kloel-lead-brain.service.ts
```

Os **services Mind** dentro de `kloel/` (30+):

```
MindBackgroundProcessor / MindBackgroundScheduler
MindBanditService / MindBeliefService / MindCaseMemoryService
MindConceptService / MindEventProcessorService / MindGlobalPriorService
MindGuardsService / MindLiftReportService / MindObservabilityService
MindPerceptionService / MindPolicyService / MindPredictionService (×2)
MindProcessorService / MindQualityService / MindReplayService
MindReportService / MindService / MindSimulatorService / MindSurpriseService
MindSyntheticGeneratorService / MindVerbalizerService / MindWorkspaceStateService
AttentionService / ConsolidationService / HebbianService
ValenceAggregatorService / ValenceTaggerService / MultiTimescaleCoordinator
```

Os **services CIA** (11):

```
CiaAutonomyAdvisorService / CiaBacklogRunService / CiaBootstrapService
CiaChatFilterService / CiaCognitiveHealthService / CiaInlineFallbackService
CiaRemoteBacklogService / CiaRuntimeService / CiaRuntimeStateService
CiaSendHelpersService / CiaService
```

Schema Prisma reflete a fragmentação:

| Camada | Tabelas |
|---|---|
| Brain legacy | `RAC_KloelMessage`, `RAC_KloelMemory`, `RAC_ChatThread`, `RAC_ChatMessage`, `RAC_KloelConversation`, `RAC_KloelLead`, `RAC_KloelSession` (via `RAC_InputCollectionSession`) |
| Mind | `RAC_MindBanditArm`, `RAC_MindBelief`, `RAC_MindCase`, `RAC_MindConceptDetection`, `RAC_MindDailyReport`, `RAC_MindGlobalPrior`, `RAC_MindGraphEdge`, `RAC_MindGraphNode`, `RAC_MindGuardAudit`, `RAC_MindOutboxEvent`, `RAC_MindPolicy`, `RAC_MindPrediction`, `RAC_MindWorkspaceState` |
| CIA | `RAC_KloelMemory` (compartilhado), nenhum CIA-* específico |

Eventos: `kloel.message.created`, `kloel.action.executed`, `kloel.product.created`, `kloel.plan.created`, **e dezenas de `mind.*` implícitos via outbox**.

ADR-0006 ("papeis cognitivos canonicos", 2026-05-09) já estabeleceu que:

- **Brain coordena**.
- **MIND escolhe**.
- **UnifiedAgent executa**.
- **LLM verbaliza**.
- **CIA legacy = adapter de aprendizado**.

**Esta diretiva já existe e está aceita.** O problema operacional não é a
*responsabilidade* — é que a *nomenclatura, a localização e os contratos*
ainda estão fragmentados, mesmo seguindo papéis distintos. O dono do repo
agora pede um passo a mais: **eliminar a fragmentação de superfície e
unificar tudo sob `Kloel Mind`** como o nome oficial cognitivo.

## Decisão

### 1. Hierarquia canônica única

```
backend/src/kloel/
├── mind/                       ← núcleo cognitivo unificado
│   ├── core/                   ← MindService, attention, consolidation, hebbian, valence
│   ├── inference/              ← belief, prediction, predictor, simulator, surprise
│   ├── policy/                 ← policy, bandit, guards, quality
│   ├── memory/                 ← case-memory, concept, global-prior, workspace-state, replay
│   ├── observability/          ← observability, lift-report, report, daily-report
│   ├── synthetic/              ← synthetic-generator, verbalizer
│   ├── runtime/                ← background-processor, background-scheduler, event-processor, processor, multi-timescale
│   ├── coordination/           ← brain (coordinator), capability-executor, capability-registry, commercial-graph, event-spine, autonomy
│   ├── adapters/               ← whatsapp-brain (now whatsapp-coordinator), lead-coordinator (ex-KloelLeadBrain)
│   ├── cia/                    ← cia legacy = learning adapter (kept, scoped)
│   └── knowledge/              ← knowledge-base, vector, media-factory, hidden-data, agent-assist (ex-ai-brain)
└── …
```

### 2. Renomeação semântica de serviços

Princípio: **um nome oficial por capability**. Aliases @deprecated apontam
para o canônico durante 4 semanas, depois são removidos.

| Old name | Canonical name | Razão |
|---|---|---|
| `BrainAutonomyService` | `MindAutonomyCoordinator` | autonomy é decisão de Mind, brain coordena |
| `BrainCapabilityExecutorService` | `MindCapabilityExecutor` | executor é nível Mind |
| `BrainCapabilityRegistryService` | `MindCapabilityRegistry` | registry da Mind |
| `BrainCommercialGraphService` | `MindCommercialGraph` | grafo comercial é Mind |
| `BrainEventSpineService` | `MindEventSpine` | event spine é Mind |
| `BrainRuntimeService` | `MindRuntime` | runtime cognitivo é Mind |
| `WhatsAppBrainService` | `WhatsAppMindCoordinator` | wrapper por canal |
| `KloelLeadBrainService` | `LeadMindCoordinator` | wrapper por lead |
| `AgentAssistService` (ai-brain) | `MindKnowledgeAssist` | knowledge layer da Mind |
| `KnowledgeBaseService` (ai-brain) | `MindKnowledgeBase` | knowledge layer da Mind |
| `MediaFactoryService` (ai-brain) | `MindMediaFactory` | sob Mind/knowledge |
| `VectorService` (ai-brain) | `MindVectorStore` | sob Mind/knowledge |
| `HiddenDataExtractorService` (ai-brain) | `MindHiddenDataExtractor` | sob Mind/knowledge |
| `BrainSpineAuditService` (brain/) | `MindSpineAudit` | move para kloel/mind/observability/ |
| `CiaService` (cia/) | `MindLearningAdapter` (CIA-legacy) | papel já é learning adapter por ADR-0006 |
| Demais Cia* | **kept**, movidos para `kloel/mind/cia/` | ADR-0006 manda manter como adapter de aprendizado |

Toda renomeação é **aditiva primeiro**: o nome canônico é introduzido,
referenciado, e o nome antigo passa a ser `export const OldName = NewName;`
com banner `@deprecated`. Após 4 semanas e 0 callers detectados via
codegraph + grep, o alias é removido.

### 3. Schema (ESTE ADR NÃO AUTORIZA DROP)

O dono do repo requer que `KloelSession`, `KloelMessage`, `KloelMemory`,
`ChatThread`, `ChatMessage` (Brain legacy) e `MindBelief`, `MindPrediction`,
`MindPolicy`, `MindBanditArm`, `MindCase`, `MindGraphNode`, `MindGuardAudit`,
`MindDailyReport` (Mind atual) "se tornem uma coisa só".

**O presente ADR autoriza:**

- Adicionar campo `mindUnifiedRef` em `RAC_KloelMessage` apontando opcionalmente
  para `RAC_MindCase` ou `RAC_MindOutboxEvent` quando a mensagem participar
  de um ciclo de inferência.
- Introduzir uma view SQL `mind_unified_message_v` que faz `UNION ALL` entre
  `RAC_KloelMessage`, `RAC_ChatMessage`, `RAC_FbMessage`, `RAC_PartnerMessage`,
  `RAC_Message` com colunas normalizadas. **Apenas leitura**; sem regravação.
- Introduzir tabela `RAC_MindMessage` (NOVA, em paralelo) com schema canônico
  proposto por ADR-0014 (a ser escrito). Dual-write controlado por feature flag.

**O presente ADR PROÍBE:**

- Drop de qualquer tabela `RAC_*Message` / `RAC_Kloel*` / `RAC_Mind*` neste ciclo.
- Migração destrutiva sem backup verificado + ADR específico (ADR-0014).
- Qualquer alteração que cause perda de histórico em ledger
  (`RAC_LineageEntry`, `RAC_AuditLog`, `connect_ledger_entries`).

### 4. Eventos: taxonomia unificada `mind.*`

Eventos atuais:

```
kloel.message.created   →  mind.message.received   (com alias retroativo)
kloel.action.executed   →  mind.action.executed    (com alias retroativo)
kloel.product.created   →  mind.product.observed   (com alias retroativo)
kloel.plan.created      →  mind.plan.observed      (com alias retroativo)
```

Cada evento canônico tem entrada em `EVENT_TAXONOMY.md` com:
- Nome canônico `mind.<domínio>.<verbo>`
- Schema Zod
- Lista de emissores (services)
- Lista de listeners (consumers)
- Alias depreciado (com data de remoção)

Eventos brutos low-level (`plan.created`, `product.created`, `product.updated`,
`product.deleted`, `product.published`, `plan.deleted`, `plan.updated`) já
existentes em `EVENT_TAXONOMY.md` permanecem como **eventos de origem**
emitidos pelos services CRUD. O `MindEventSpine` re-emite cada um como
`mind.<origin>.observed` para o ciclo cognitivo.

### 5. UnifiedAgent

`UnifiedAgentService` e seus 7 sub-services (`UnifiedAgentActionsBilling`,
`Commerce`, `Crm`, `Messaging`, `Sales`, `Workspace`, etc.) **permanecem
intactos** — ADR-0006 já estabelece UnifiedAgent como executor. Eles são
**clientes do Mind**, não parte do Mind. Localização atual em `kloel/` é
canônica.

### 6. Tools / capability layer

`KloelToolDispatcherService`, `KloelToolExecutorService` (e specializações)
permanecem com nome — eles são o **tool layer** distinto. ADR-0006 estabelece
que tool execution é separado da decisão cognitiva. Manter.

## Plano de migração (ondas reversíveis)

| Wave | Escopo | Test surface | Reversibilidade |
|------|--------|-------------|-----------------|
| M1 — alias-only | Adicionar `export const BrainAutonomyService = MindAutonomyCoordinator;` em todos os 8 services Brain renomeados; criar o canônico em paralelo no novo path; nenhum caller muda. | spec por service garante `BrainX === MindX`. | Reverter = remover o alias. |
| M2 — ai-brain merge | Mover `backend/src/ai-brain/*` para `backend/src/kloel/mind/knowledge/*`, com re-export deprecated em `ai-brain/`. | spec de DI módulo verifica que ambos os paths injetam o mesmo provider. | Reverter = mover de volta. |
| M3 — brain merge | Mover `backend/src/brain/brain-spine-audit.service.ts` → `kloel/mind/observability/`. `brain/` torna-se re-export deprecated. | spec garante mesma export. | Reverter = mover de volta. |
| M4 — CIA scoped | Mover `backend/src/cia/*` para `backend/src/kloel/mind/cia/*`. `cia/` torna-se re-export deprecated. | spec de DI + integration spec do `MindLearningAdapter`. | Reverter = mover de volta. |
| M5 — kloel internal restructure | Reorganizar internamente `backend/src/kloel/` em sub-pastas (`mind/core`, `mind/inference`, etc.) — **apenas movimentação física**, todos os imports atualizados via codemod. | tsc + unit tests + boot smoke. | Reverter = revert do commit (move de volta). |
| M6 — event aliases | Listeners atuais (`kloel.message.created`) passam a escutar `mind.message.received` também. Emitters publicam ambos por 4 semanas. | spec do `EventBus` com ambos canais. | Reverter = remover novo nome. |
| M7 — alias removal | Após 4 semanas e 0 callers para os nomes antigos, remover aliases e legacy event names. | gate `check-canonical-services.mjs` confirma 0 referências. | Reverter por revert do commit. |

## Não-decisões (escopo fora deste ADR)

- **Schema destrutivo**: drop de tables Brain/Mind/CIA = ADR-0014 separado
  com plano de dual-write + migração de dados verificada.
- **Frontend**: `frontend/src/components/kloel/` (192 arquivos), `cia/`,
  `mind/` no frontend — wave própria.
- **Worker**: `worker/mind-client.ts`, `worker/commercial-intelligence.*`,
  `worker/memory-processor.ts`, `worker/fact-extractor.ts` — alinhados em
  Phase 3 do plano de canonicalização. Esta ADR cobre apenas backend.

## Anti-decisões (governance — proíbe)

- **Não** renomear sem alias deprecated. Toda renomeação é aditiva.
- **Não** dropar tabela ou coluna Prisma neste ciclo.
- **Não** apagar pasta `backend/src/{ai-brain,brain,cia}/` sem janela de
  observação de 4 semanas + 0 callers verificados.
- **Não** alterar interfaces do UnifiedAgent — ADR-0006 ratifica que ele
  é executor, não tocar.
- **Não** quebrar callers do ToolDispatcher.
- **Não** desabilitar gates Codacy para deixar a renomeação passar.

## Gates de progresso (mensuráveis)

| Gate | Métrica | Como medir |
|------|---------|------------|
| M1 done | 8 aliases Brain → Mind ativos | grep `@deprecated.*Brain.*Service.*Mind` |
| M2 done | `ai-brain/` é puramente re-export | scripts/ops/check-canonical-imports.mjs |
| M3 done | `brain/` é puramente re-export | mesmo gate |
| M4 done | `cia/` movido para `kloel/mind/cia/` | filesystem + grep callers |
| M5 done | `kloel/` reorganizado em sub-pastas; tsc + tests green | CI |
| M6 done | event listener cobre ambos os nomes | spec EventBus |
| M7 done | 0 referências aos nomes Brain/CIA antigos fora dos próprios files de alias | gate check-canonical-services.mjs |

## Consequências

**Positivas:**

- Nome único `Mind` para o motor cognitivo — UI, eventos, DB, código falam a mesma língua.
- 4 pastas top-level cognitivas (ai-brain, brain, cia, kloel) → 1.
- Eventos `mind.*` taxonomia única.
- 256 cross-file dups do `DUPLICATION_REGISTER.md` reduzidos.
- Nova IA olhando o repo pela primeira vez encontra `kloel/mind/` e
  entende toda a cognição em uma só pasta.

**Negativas / riscos:**

- 30+ services para renomear (M1) — risk: codemod incompleto deixa alias
  pendentes. Mitigação: cada wave tem gate de progresso mensurável.
- Schema fragmentado permanece intacto (5 tabelas Message) — débito
  consciente, endereçado por ADR-0014.
- Janela de coexistência alias antigo + canônico = 4 semanas. Algum
  caller pode passar despercebido. Mitigação: codegraph cross-reference
  + grep antes de M7.

## Referências

- ADR-0006 — papéis cognitivos canônicos.
- ADR-0012 — OmniCore channel unification (irmão deste ADR).
- `docs/architecture/CANONICAL_DOMAINS.md` — contagens por domínio.
- `docs/architecture/SERVICE_CATALOG.md` — 580 services categorizados.
- `docs/architecture/EVENT_TAXONOMY.md` — 39 eventos atuais.
- `docs/architecture/CAPABILITY_MAP.md` — 12+ capabilities mapeadas.
- ADR-0014 (futuro) — schema unification dos modelos Message + Brain/Mind tables.
