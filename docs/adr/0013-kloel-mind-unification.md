# ADR 0013: Kloel Mind — o organismo cognitivo único (Brain + Mind + CIA + Autopilot + Copilot + Voice + Flows)

Data: 2026-05-26 · **Escopo expandido: 2026-06-02**

## Status

Aceita (com restrições explícitas sobre schema — ver §"Schema").

**Escopo canônico vigente (2026-06-02)**: este ADR cobre o **organismo
cognitivo completo** do Kloel. Ver §"Escopo canônico — o organismo cognitivo
completo" abaixo. O escopo original e mais estreito (apenas Brain + AI-Brain +
CIA + Mind) está **SUPERSEDED desde 2026-06-02** — preservado integralmente
nas seções históricas para rastreabilidade, mas substituído pela diretiva do
dono do repo de absorver **toda** a cognição num só organismo.

---

## Escopo canônico — o organismo cognitivo completo (diretiva 2026-06-02)

> **Diretiva do dono do repo (2026-06-02)**: o **Kloel Mind** deixa de ser
> apenas a unificação de Brain + AI-Brain + CIA + Mind e passa a ser o **único
> organismo cognitivo canônico** do produto. **Toda** a cognição —
> percepção, decisão, ação, aprendizado e verbalização — vive sob `Kloel Mind`.
> Esta diretiva **supersede** qualquer escopo anterior mais estreito deste ADR.

### O loop cognitivo único

O Kloel Mind é definido pelo **loop fechado de cognição**, não por uma pasta:

```
estado → percepção → decisão → ação → consequência → aprendizado
  ↑                                                        │
  └────────────────────  (atualiza estado)  ───────────────┘
```

Cada subsistema cognitivo que hoje existe separado é uma **fase** ou um
**adaptador** deste loop, não um domínio independente. O nome oficial de todo
o loop, em UI, eventos, DB e código, é **Kloel Mind**.

### Subsistemas que se dissolvem em Kloel Mind

| Subsistema | Fase do loop que ele encarna | Destino canônico |
|---|---|---|
| **Brain** (`brain-*`, `backend/src/brain/`) | percepção + coordenação | `kloel/mind/coordination/` + `kloel/mind/observability/` |
| **Mind** (`MindBelief/Policy/Prediction/...`) | decisão + inferência + aprendizado | `kloel/mind/{inference,policy,memory}/` (já canônico) |
| **AI-Brain** (`backend/src/ai-brain/`) | percepção/conhecimento (KB, vetor, mídia) | `kloel/mind/knowledge/` |
| **CIA** (`backend/src/cia/`) | adaptador de aprendizado (ADR-0006) | `kloel/mind/cia/` |
| **Autopilot** (`backend/src/autopilot/`) | ação autônoma (executa decisão sem humano) | superfície de **ação** do Mind — orquestrada por `MindAutonomyCoordinator`; Autopilot vira o *modo de execução autônoma* do loop, não um motor paralelo |
| **Copilot** (`backend/src/copilot/`) | ação assistida (humano-no-loop) | superfície de **ação** do Mind no modo assistido; consome a mesma decisão/percepção, com handoff humano explícito |
| **Voice** (`backend/src/voice/`) | percepção + verbalização por canal de voz | **canal** de entrada/saída do Mind: STT alimenta percepção, TTS verbaliza a ação; sem cognição própria |
| **Flows** (`backend/src/flows/`) | ação determinística / política pré-compilada | **plano de ação** do Mind: um flow é uma política fixa que o Mind seleciona e executa; o engine de flows é o executor determinístico dentro do loop |

> **Princípio de absorção**: Autopilot, Copilot, Voice e Flows **não** ganham
> motor cognitivo próprio. Eles são **canais** (Voice), **modos de execução**
> (Autopilot autônomo / Copilot assistido) e **políticas pré-compiladas**
> (Flows) que plugam nas fases do loop único do Mind. A decisão, a percepção e
> o aprendizado são **sempre** do Kloel Mind. Isto preserva ADR-0006 (Brain
> coordena, Mind escolhe, UnifiedAgent executa, LLM verbaliza) e o expande: o
> "executar" agora tem três superfícies (autônoma, assistida, determinística)
> e duas modalidades de canal (texto, voz), todas servidas pelo mesmo cérebro.

### O que já está feito vs. pendente (honesto)

**Já entregue** (não-destrutivo, em produção):

- **Dual-write aliases / wrapper surface**: `MindMessageService` e
  `MindMemoryItemService` em `backend/src/kloel/mind/aliases/` expõem o nome
  canônico `Mind*` apontando para as tabelas legadas (`prisma.kloelMessage`,
  `prisma.kloelMemory`) na mesma linha física — código novo já fala "Mind",
  código antigo continua funcionando (ver §10 do BRAIN_MIND_UNIFICATION_PLAN).
- **Modelos `RAC_Mind*` no schema**: as tabelas do motor de inferência
  (`RAC_MindBelief`, `RAC_MindPrediction`, `RAC_MindPolicy`, `RAC_MindBanditArm`,
  `RAC_MindCase`, `RAC_MindGraphNode/Edge`, `RAC_MindGuardAudit`,
  `RAC_MindOutboxEvent`, `RAC_MindDailyReport`, `RAC_MindGlobalPrior`,
  `RAC_MindWorkspaceState`, etc.) já existem e são canônicas.
- **`MindCanonicalService`** (`backend/src/kloel/mind/mind-canonical.service.ts`)
  — ponto de entrada canônico do motor cognitivo.
- **Sinais do Mind já consumidos** pelo reply-engine
  (`*.mind-signal.*` specs: attention, beliefs, concepts) e guards no
  tool-dispatcher.

**Ainda pendente** (sob este escopo expandido):

- **Absorção de Autopilot / Copilot** sob a superfície de ação do Mind:
  `backend/src/autopilot/` e `backend/src/copilot/` continuam como pastas
  top-level separadas; falta o adaptador que os roteia por
  `MindAutonomyCoordinator` (autônomo) e por handoff assistido (Copilot).
- **Voice como canal do Mind**: `backend/src/voice/` ainda não alimenta a
  percepção do Mind via STT nem verbaliza a ação via TTS pelo mesmo verbalizer.
- **Flows como política do Mind**: `backend/src/flows/` ainda é um engine
  paralelo; falta expor cada flow como política selecionável pelo
  `MindPolicyService` e executável pelo loop.
- **Renomes de service Brain → Mind** (M1–M7 abaixo) ainda em janela de alias.
- **Unificação física do schema de mensagens** (`RAC_KloelMessage` +
  `RAC_ChatMessage` + `RAC_KloelConversation` → `RAC_MindMessage`) permanece
  **bloqueada** até ADR-0014 (migração destrutiva exige backup verificado).

Nenhum item pendente é autorizado a violar as **anti-decisões** abaixo
(sem drop de tabela, sem rename sem alias, sem tocar UnifiedAgent/ToolDispatcher,
sem desabilitar gates). A expansão de escopo **amplia o alvo**, não relaxa a
governança.

---

## Contexto

> **Nota de escopo (2026-06-02)**: as seções a seguir (Contexto, Decisão, Plano
> de migração, Gates) descrevem o **escopo original e mais estreito** deste ADR
> — apenas a unificação das quatro pastas cognitivas (Brain, AI-Brain, CIA,
> Mind). Esse escopo está **SUPERSEDED desde 2026-06-02** pela seção "Escopo
> canônico — o organismo cognitivo completo" no topo, que absorve também
> Autopilot, Copilot, Voice e Flows. Mantidas como registro histórico: o
> mecanismo (alias aditivo → deprecar → remover após 4 semanas) e as
> anti-decisões continuam **válidos e em vigor** para todo o escopo expandido.

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

- ADR-0004 — CIA legacy decommission (CIA = adaptador de aprendizado).
- ADR-0006 — papéis cognitivos canônicos.
- ADR-0012 — OmniCore channel unification (irmão deste ADR).
- `docs/architecture/BRAIN_MIND_UNIFICATION_PLAN.md` — plano executável em N PRs.
- `docs/architecture/CANONICAL_DOMAINS.md` — contagens por domínio.
- `docs/architecture/SERVICE_CATALOG.md` — 580 services categorizados.
- `docs/architecture/EVENT_TAXONOMY.md` — 39 eventos atuais.
- `docs/architecture/CAPABILITY_MAP.md` — 12+ capabilities mapeadas.
- ADR-0014 (futuro) — schema unification dos modelos Message + Brain/Mind tables.

### Subsistemas absorvidos pelo escopo expandido (2026-06-02)

- `backend/src/autopilot/` — superfície de ação autônoma do Mind (pendente).
- `backend/src/copilot/` — superfície de ação assistida do Mind (pendente).
- `backend/src/voice/` — canal de voz (STT→percepção, ação→TTS) do Mind (pendente).
- `backend/src/flows/` — políticas pré-compiladas selecionáveis pelo Mind (pendente).
- `backend/src/kloel/mind/mind-canonical.service.ts` — entrada canônica (feito).
- `backend/src/kloel/mind/aliases/` — wrapper dual-surface `Mind*` (feito).
