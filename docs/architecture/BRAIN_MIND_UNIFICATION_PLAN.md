# Brain + Mind → "Kloel Mind" — Plano de Unificação (PI-K23)

> **Versão**: 1.0  
> **Data**: 2026-05-28  
> **Status**: Plano aprovado — implementação NÃO autorizada neste commit.  
> **ADR de referência**: [ADR-0013](../adr/0013-kloel-mind-unification.md)  
> **Taxonomia de eventos**: [EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION](./EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md)  
> **Deprecation Map**: [DEPRECATION_MAP](./DEPRECATION_MAP.md)

---

## Resumo executivo

O Kloel possui duas superfícies cognitivas sobrepostas:

- **Kloel Brain (IA)**: `KloelMessage`, `KloelMemory`, `KloelConversation`, `ChatThread`, `ChatMessage`, `KloelLead`
- **Mind (Cognitive Engine)**: `MindBelief`, `MindPrediction`, `MindPolicy`, `MindBanditArm`, `MindCase`, `MindGraphNode`, `MindGuardAudit`, `MindDailyReport` — inferência Bayesiana + Multi-Armed Bandit

Estado-alvo: **Kloel Mind** — um único namespace canônico. Brain dissolve-se em Mind.
Este documento é o plano completo de unificação em N PRs sequenciais, não-destrutivos,
seguindo o princípio "adicionar novo → alias → deprecar antigo → remover após 4 semanas".

**Este plano NÃO autoriza drops de schema, migrações destrutivas, ou alterações de código.**
Apenas planeja. A implementação será feita em PRs subsequentes.

---

## 1. Inventário completo de models Prisma

### 1.1 Models prefixo `Kloel*` (Brain legacy)

| # | Model | DB Table | Descrição | Campos principais |
|---|---|---|---|---|
| 1 | `KloelMessage` | `RAC_KloelMessage` | Mensagens da IA Brain (role, content) | `id`, `workspaceId`, `role`, `content`, `metadata`, `createdAt` |
| 2 | `KloelMemory` | `RAC_KloelMemory` | Memória chave-valor com embedding vetorial | `id`, `workspaceId`, `key`, `value`, `category`, `type`, `content`, `embedding`, `metadata` |
| 3 | `KloelLead` | `RAC_KloelLead` | Lead com scoring comercial | `id`, `workspaceId`, `phone`, `name`, `email`, `source`, `status`, `score`, `tags` |
| 4 | `KloelConversation` | `RAC_KloelConversation` | Histórico de conversa por lead | `id`, `leadId`, `role`, `content`, `intent`, `sentiment`, `metadata` |
| 5 | `KloelSale` | `RAC_KloelSale` | Vendas via Kloel | `id`, `workspaceId`, `leadId`, `amount`, `status`, `paymentMethod`, `externalPaymentId` |
| 6 | `KloelWallet` | `RAC_KloelWallet` | Carteira virtual (split de pagamentos) | `id`, `workspaceId`, `availableBalanceInCents`, `pendingBalanceInCents`, `blockedBalanceInCents` |
| 7 | `KloelWalletTransaction` | `RAC_KloelWalletTransaction` | Transações da carteira | `id`, `walletId`, `type`, `amountInCents`, `description`, `metadata` |
| 8 | `KloelWalletLedger` | `RAC_KloelWalletLedger` | Ledger transactions | `id`, `workspaceId`, `walletId`, `amountInCents`, `type`, `reference` |
| 9 | `KloelSite` | `RAC_KloelSite` | Site builder | `id`, `workspaceId`, `name`, `slug`, `htmlContent`, `published` |
| 10 | `KloelDesign` | `RAC_KloelDesign` | Canvas/Design editor | `id`, `workspaceId`, `name`, `format`, `elements`, `background` |
| 11 | `KloelGlobalPrior` | `RAC_KloelGlobalPrior` | Prior global legado (bandit simples) | `id`, `channel`, `decisionType`, `action`, `observations`, `successes` |

### 1.2 Models prefixo `Mind*` (Cognitive Engine)

| # | Model | DB Table | Descrição | Campos principais |
|---|---|---|---|---|
| 1 | `MindBelief` | `RAC_MindBelief` | Crenças Bayesianas (Beta distribution) | `id`, `workspaceId`, `subject`, `predicate`, `context`, `mean`, `variance`, `samples`, `alpha`, `beta` |
| 2 | `MindPrediction` | `RAC_MindPrediction` | Predições com horizonte e surpresa | `id`, `workspaceId`, `subject`, `predicate`, `context`, `predictedMean`, `horizonSec`, `deadline`, `actual`, `surprise` |
| 3 | `MindPolicy` | `RAC_MindPolicy` | Políticas de decisão MAB (ε-greedy + UCB) | `id`, `workspaceId`, `subject`, `decisionType`, `context`, `candidates`, `chosen`, `outcomeKey`, `outcome`, `epsilon`, `calcSteps` |
| 4 | `MindWorkspaceState` | `RAC_MindWorkspaceState` | Estado do workspace no ciclo cognitivo | `id`, `workspaceId`, `lastWatermark`, `lastTickAt`, `tickCount`, `health` |
| 5 | `MindCase` | `RAC_MindCase` | Memória de casos (case-based reasoning) | `id`, `workspaceId`, `subject`, `caseType`, `text`, `tokens`, `features`, `action`, `outcome` |
| 6 | `MindConceptDetection` | `RAC_MindConceptDetection` | Detecção de conceitos | `id`, `workspaceId`, `subject`, `concept`, `confidence`, `evidence`, `features` |
| 7 | `MindGraphNode` | `RAC_MindGraphNode` | Nó do grafo cognitivo | `id`, `workspaceId`, `kind`, `label`, `weight`, `metadata` |
| 8 | `MindGraphEdge` | `RAC_MindGraphEdge` | Aresta do grafo cognitivo | `id`, `workspaceId`, `fromNode`, `toNode`, `relation`, `weight`, `samples` |
| 9 | `MindOutboxEvent` | `RAC_MindOutboxEvent` | Outbox de eventos cognitivos | `id`, `workspaceId`, `eventType`, `subject`, `payload`, `idempotencyKey`, `status`, `attempts` |
| 10 | `MindBanditArm` | `RAC_MindBanditArm` | Braço do Multi-Armed Bandit | `id`, `workspaceId`, `decisionType`, `arm`, `context`, `alpha`, `beta`, `pulls`, `wins` |
| 11 | `MindGuardAudit` | `RAC_MindGuardAudit` | Auditoria de guardas cognitivos | `id`, `workspaceId`, `guardName`, `action`, `decision`, `allowed`, `reason`, `context` |
| 12 | `MindDailyReport` | `RAC_MindDailyReport` | Relatório diário cognitivo | `id`, `workspaceId`, `reportDate`, `content`, `storageKey`, `metrics` |
| 13 | `MindGlobalPrior` | `RAC_MindGlobalPrior` | Prior global anonimizado (Wisdom) | `id`, `workspaceId`, `domain`, `predicate`, `context`, `mean`, `variance`, `samples`, `anonymizedBy` |

### 1.3 Models auxiliares do ecossistema de mensagens

| # | Model | DB Table | Descrição | Campos principais |
|---|---|---|---|---|
| 1 | `ChatThread` | `RAC_ChatThread` | Thread de chat do dashboard | `id`, `workspaceId`, `title`, `summary` |
| 2 | `ChatMessage` | `RAC_ChatMessage` | Mensagem de chat do dashboard | `id`, `threadId`, `workspaceId`, `userId`, `role`, `content`, `metadata`, `deletedAt` |
| 3 | `InputCollectionSession` | `RAC_InputCollectionSession` | Sessão de coleta de input (funciona como "KloelSession") | Ver schema |

### 1.4 Models NÃO afetados por esta unificação

Os seguintes models usam prefixo `Kloel*` mas são de domínio **comercial/operacional**, não cognitivo.
**Não** participam da unificação Brain → Mind:

| Model | Domínio | Razão da exclusão |
|---|---|---|
| `KloelSale` | Vendas | Domínio comercial — é um registro de transação, não cognitivo |
| `KloelWallet` | Financeiro | Carteira virtual — split de pagamentos |
| `KloelWalletTransaction` | Financeiro | Transações financeiras |
| `KloelWalletLedger` | Financeiro | Ledger contábil |
| `KloelSite` | Site Builder | Ferramenta de criação de sites |
| `KloelDesign` | Design Editor | Editor visual de design |

---

## 2. Mapeamento de camadas da unificação

### 2.1 Camada "State" → `MindSession`

O workspace state cognitivo unificado consolida:

| Origem | Destino | Ação |
|---|---|---|
| `MindWorkspaceState` | `MindSession` | **Renomear** model para `MindSession`. Já é canônico, mas o nome é verboso |
| `KloelMemory` (category=`agent_*`) | `MindSession` | **Migrar** — estado do agente usa `KloelMemory` como KV store. Adicionar model `MindSessionMemory` ou coluna `namespace` na nova `MindMemory` |
| `InputCollectionSession` | `MindSession` | **Relacionar** — adicionar FK `mindSessionId` opcional |
| `KloelLead` | `MindLead` | **Renomear** + relacionar com `MindSession` via `mindSessionId` |
| `MindGraphNode` / `MindGraphEdge` | (mantém) | Já são Mind. Pertencem à camada de grafo cognitivo, não state |

### 2.2 Camada "Messages" → `MindMessage` / `MindThread`

Unificação das 3 tabelas de mensagem + conversas de lead:

| Origem | Destino | Ação |
|---|---|---|
| `KloelMessage` | `MindMessage` | **Migrar** — renomear model + tabela. `source = "brain"` |
| `ChatMessage` | `MindMessage` | **Migrar** — `source = "dashboard"` com `threadId` |
| `ChatThread` | `MindThread` | **Migrar** — renomear model + tabela. Adicionar `threadType` |
| `KloelConversation` | `MindMessage` | **Migrar** — `source = "lead_conversation"`. Campos `intent` + `sentiment` preservados |
| `MindOutboxEvent` | (mantém) | Já canônico |
| `MindCase` | (mantém) | Relacionar com `MindMessage` via `caseMessageId` |

### 2.3 Camada "Beliefs/Inference" — já canônica

Todos os models `Mind*` nesta camada **permanecem com nome atual**:

`MindBelief`, `MindPrediction`, `MindPolicy`, `MindBanditArm`, `MindCase`,
`MindConceptDetection`, `MindGuardAudit`, `MindDailyReport`, `MindGlobalPrior`,
`MindOutboxEvent`, `MindGraphNode`, `MindGraphEdge`.

### 2.4 Camada "Events" → taxonomia `cognition.*`

| Evento atual (legacy) | Evento canônico | Emitter principal |
|---|---|---|
| `message.received` | `cognition.message.received` | `channel-inbound-hook.service.ts` |
| `capability.executed` | `cognition.action.executed` | `brain-runtime.service.ts` |
| `brain.decide` | `cognition.decide` | `kloel-thinker.service.ts` |
| `brain.observe` | `cognition.observe` | `mind-perception.service.ts` |
| `brain.autonomy.propose` | `cognition.autonomy.propose` | `brain-autonomy.service.ts` |
| `brain.capability.invoked` | `cognition.capability.invoked` | `brain-capability-executor.service.ts` |
| `mind.decision.created` | `cognition.decision.proposed` | `mind-policy.service.ts` |
| `mind.decision.resolved` | `cognition.decision.resolved` | `mind-policy.service.ts` |
| `mind.prediction.created` | `cognition.prediction.emitted` | `mind-predictor.service.ts` |
| `mind.prediction.resolved` | `cognition.prediction.resolved` | `mind-predictor.service.ts` |
| `mind.surprise.recorded` | `cognition.surprise.recorded` | `mind-surprise.service.ts` |
| `concept.detected` | `cognition.concept.detected` | `mind-concepts.service.ts` |
| `product.created` | `cognition.product.observed` | `product.service.ts` |
| `plan.created` | `cognition.plan.observed` | `plan.service.ts` |

**Nota**: O prefixo `mind.*` é reservado para eventos internos do motor de inferência
(`mind.decision.*`, `mind.prediction.*`, `mind.surprise.*`). Para a superfície pública
de eventos (API contracts, webhooks, UI), o prefixo canônico é `cognition.*`.

### 2.5 Camada "Memory" → unificada

| Origem | Destino | Ação |
|---|---|---|
| `KloelMemory` | `MindMemory` | **Renomear** model + tabela. Adicionar coluna `namespace` |
| `KloelGlobalPrior` | (→ `MindGlobalPrior`) | **Deprecar** — `MindGlobalPrior` já existe como substituto com schema mais rico (anonimização, domínio, média/variância Bayesianos) |

---

## 3. Plano de migração por model Prisma

### 3.1 Estratégia geral (não-destrutiva)

Para cada model a ser migrado:

1. **Adicionar** model canônico NOVO no schema.prisma (com `@@map("RAC_MindXxx")`)
2. **Criar migration** que cria a tabela nova (sem dropar a antiga)
3. **Adicionar coluna de ligação** na tabela antiga: `canonicalId String?`
4. **Dual-write** (opcional, feature flag): writes para AMBAS tabelas
5. **Adicionar view SQL** `mind_unified_X_v` com UNION ALL normalizando colunas
6. **Migrar dados** offline: job idempotente que copia rows antiga → nova
7. **Apontar services** para nova tabela (com fallback via adapter)
8. **Deprecar** model antigo com banner `@deprecated`
9. **Após 4 semanas** com 0 referências: dropar tabela antiga

### 3.2 Tabela de renomeações canônicas

| # | Model atual | Model canônico | DB Table atual | DB Table canônica | Complexidade |
|---|---|---|---|---|---|
| 1 | `KloelMessage` | `MindMessage` | `RAC_KloelMessage` | `RAC_MindMessage` | 🔴 Alta — unifica 3 tabelas |
| 2 | `KloelMemory` | `MindMemory` | `RAC_KloelMemory` | `RAC_MindMemory` | 🟡 Média — renomear + `namespace` |
| 3 | `ChatThread` | `MindThread` | `RAC_ChatThread` | `RAC_MindThread` | 🟡 Média — renomear + `threadType` |
| 4 | `ChatMessage` | (→ `MindMessage`) | `RAC_ChatMessage` | (→ `RAC_MindMessage`) | 🔴 Alta — parte da unificação |
| 5 | `KloelConversation` | (→ `MindMessage`) | `RAC_KloelConversation` | (→ `RAC_MindMessage`) | 🔴 Alta — parte da unificação |
| 6 | `KloelLead` | `MindLead` | `RAC_KloelLead` | `RAC_MindLead` | 🟢 Baixa — renomear + `mindSessionId` |
| 7 | `MindWorkspaceState` | `MindSession` | `RAC_MindWorkspaceState` | `RAC_MindSession` | 🟡 Média — renomear + adicionar colunas |
| 8 | `KloelGlobalPrior` | (deprecar) | `RAC_KloelGlobalPrior` | (→ `RAC_MindGlobalPrior`) | 🟢 Baixa — `MindGlobalPrior` já existe |

### 3.3 Models que NÃO mudam de nome

| Model | Razão |
|---|---|
| `MindBelief`, `MindPrediction`, `MindPolicy`, `MindBanditArm` | Já canônicos |
| `MindCase`, `MindConceptDetection`, `MindGraphNode`, `MindGraphEdge` | Já canônicos |
| `MindOutboxEvent`, `MindGuardAudit`, `MindDailyReport`, `MindGlobalPrior` | Já canônicos |
| `KloelSale`, `KloelWallet`, `KloelSite`, `KloelDesign` | Domínio não-cognitivo |

---

## 4. Mapeamento de services

### 4.1 Services que operam sobre models Brain → renomear

| Service atual | Service canônico | Model operado | Caminho atual | Caminho canônico |
|---|---|---|---|---|
| `MemoryService` | `MindMemoryService` | `KloelMemory` → `MindMemory` | `kloel/memory.service.ts` | `kloel/mind/memory/mind-memory.service.ts` |
| `MemoryCrudService` | `MindMemoryCrudService` | `KloelMemory` → `MindMemory` | `kloel/memory-crud.service.ts` | `kloel/mind/memory/mind-memory-crud.service.ts` |
| `MemorySearchService` | `MindMemorySearchService` | `KloelMemory` → `MindMemory` | `kloel/memory-search.service.ts` | `kloel/mind/memory/mind-memory-search.service.ts` |
| `MemoryManagementService` | `MindMemoryManagementService` | `KloelMemory` → `MindMemory` | `kloel/memory-management.service.ts` | `kloel/mind/memory/mind-memory-management.service.ts` |
| `KloelThreadService` | `MindThreadService` | `ChatThread`, `ChatMessage` | `kloel/kloel-thread.service.ts` | `kloel/mind/messaging/mind-thread.service.ts` |
| `KloelThreadSearchService` | `MindThreadSearchService` | `ChatThread`, `ChatMessage` | `kloel/kloel-thread-search.service.ts` | `kloel/mind/messaging/mind-thread-search.service.ts` |
| `KloelThreadSummaryService` | `MindThreadSummaryService` | `ChatThread` | `kloel/kloel-thread-summary.service.ts` | `kloel/mind/messaging/mind-thread-summary.service.ts` |
| `LeadsService` | `MindLeadService` | `KloelLead` → `MindLead` | `kloel/leads.service.ts` | `kloel/mind/coordination/mind-lead.service.ts` |
| `KloelService` | `MindOrchestratorService` | Múltiplos | `kloel/kloel.service.ts` | `kloel/mind/mind-orchestrator.service.ts` |

### 4.2 Services que mudam de nome (ADR-0013 Wave M1–M4)

| Nome antigo | Nome canônico | Arquivo atual |
|---|---|---|
| `BrainAutonomyService` | `MindAutonomyCoordinator` | `kloel/brain-autonomy.service.ts` |
| `BrainCapabilityExecutorService` | `MindCapabilityExecutor` | `kloel/brain-capability-executor.service.ts` |
| `BrainCapabilityRegistryService` | `MindCapabilityRegistry` | `kloel/brain-capability-registry.service.ts` |
| `BrainCommercialGraphService` | `MindCommercialGraph` | `kloel/mind/coordination/mind-commercial-graph.service.ts` |
| `BrainEventSpineService` | `MindEventSpine` | `kloel/mind/coordination/mind-event-spine.service.ts` |
| `BrainRuntimeService` | `MindRuntime` | `kloel/brain-runtime.service.ts` |
| `WhatsAppBrainService` | `WhatsAppMindCoordinator` | `kloel/whatsapp-brain.service.ts` |
| `KloelLeadBrainService` | `LeadMindCoordinator` | `kloel/kloel-lead-brain.service.ts` |

### 4.3 Services com adapter temporário

Os services que consomem `prisma.kloelMessage` e `prisma.kloelMemory` precisarão
de adapters durante a transição. A lista completa de callers diretos (89+ arquivos
identificados via grep) inclui:

- `AgentRuntimeSessionStore` — `kloelMemory` (7 métodos)
- `AgentRuntimeScheduler` — `kloelMemory` (5 métodos)
- `AgentRuntimeMemoryCurator` — `kloelMemory` (3 métodos)
- `AgentRuntimeSkillRegistry` — `kloelMemory` (formatos de upsert/find)
- `AgentRuntimeDelegation` — `kloelMemory` (formato KV)
- `AgentRuntimeEvidenceStore` — `kloelMemory` (formato KV)
- `AgentRuntimeContextCompressor` — `kloelMemory` (formato KV)
- `ConversationalOnboardingToolsService` — `kloelMemory` (formato KV)

**Padrão do adapter**:

```ts
@Injectable()
export class MindMemoryAdapter {
  async findUnique(args) {
    if (await this.flags.isEnabled('USE_CANONICAL_MIND', args.where.workspaceId)) {
      return this.prisma.mindMemory.findUnique(args);
    }
    return this.prisma.kloelMemory.findUnique(args);
  }
  // findMany, create, upsert, updateMany, deleteMany — mesmo padrão
}
```

---

## 5. Plano em N PRs sequenciais

### PR-1: Schema — adicionar models canônicos

**Escopo**: `backend/prisma/schema.prisma` apenas.

- Adicionar `MindMessage`, `MindThread`, `MindSession`, `MindMemory`, `MindLead`
- Cada um com `@@map("RAC_MindXxx")` para tabela canônica
- Criar migration `add_canonical_mind_tables`
- **ZERO** alteração em models existentes. **ZERO** alteração em services.

**Gates**: `npx prisma migrate dev` cria apenas tabelas novas. `tsc --noEmit` passa.

### PR-2: Services Memory — `KloelMemory` → `MindMemory`

- Criar `mind-memory.service.ts`, `mind-memory-crud.service.ts`, etc.
- Operar sobre `prisma.mindMemory`
- Adicionar aliases deprecated: `export const MemoryService = MindMemoryService`
- **NÃO alterar callers**

**Gates**: `MemoryService === MindMemoryService`. Testes antigos continuam passando.

### PR-3: Services Thread → `MindThread` / `MindMessage`

- Criar `mind-thread.service.ts`, `mind-thread-search.service.ts`, `mind-thread-summary.service.ts`
- Operar sobre `prisma.mindThread` e `prisma.mindMessage`
- Aliases deprecated nos services antigos

**Gates**: `KloelThreadService === MindThreadService`. Testes passam.

### PR-4: Adapters — feature-flag dual-read

- Criar `mind-memory-adapter.service.ts`, `mind-message-adapter.service.ts`
- Dual-read com feature flag `USE_CANONICAL_MIND`
- Writes para AMBAS tabelas quando flag ativa

**Gates**: Spec cobre flag OFF (legacy), flag ON (canônica), dual-write.

### PR-5: Migração de dados — backfill job

- Job `mind-backfill.service.ts` idempotente (por `id`)
- Copia: `KloelMemory` → `MindMemory`, `KloelMessage`+ `ChatMessage`+ `KloelConversation` → `MindMessage`, `ChatThread` → `MindThread`, `KloelLead` → `MindLead`, `MindWorkspaceState` → `MindSession`

**Gates**: Row counts equivalentes. Idempotência (rodar 2x = mesmo resultado).

### PR-6: Ativar feature flag (canary)

- `USE_CANONICAL_MIND` = `true` para 1 workspace staging
- Monitorar latência, erros, eventos

**Gates**: Workspace com flag ON funcional. Flag OFF inalterado.

### PR-7: View SQL unificada (read-only)

- `mind_unified_message_v`: UNION ALL das 4 tabelas de mensagem
- `mind_unified_memory_v`: UNION ALL das 2 tabelas de memória

**Gates**: Row counts via view = soma das tabelas subjacentes.

### PR-8: Migrar eventos — taxonomia `cognition.*`

- Adicionar aliases `cognition.*` no `MIND_EVENT_ALIASES`
- Emissores dual-emit (legacy + canônico)
- Listeners aceitam ambos

**Gates**: `readReplayEvents` retorna com ambos os nomes. Spec do EventSpine cobre dual-name.

### PR-9: Single-write (100% canônico)

- Feature flag = `true` global
- Remover dual-write: escrever apenas na canônica
- Manter leitura legacy via adapter (fallback)

**Gates**: Zero writes em tabelas legacy. Todos testes passam.

### PR-10: Remover aliases deprecated (após 4 semanas)

**Pré-condição**: 4 semanas após PR-9, 0 callers para modelos antigos.

- Remover `export const OldName = NewName` de todos aliases
- Remover fallback de leitura legacy nos adapters
- Views SQL apontam apenas para canônicas

**Gates**: `grep -r "kloelMessage|kloelMemory|chatThread|chatMessage" backend/src/` = 0.

### PR-11: Dropar tabelas legacy (ADR-0014)

- Remover models legacy do schema.prisma
- Migration de drop
- **REQUER backup verificado** antes do drop

**Gates**: Backup restaurado em staging. CI verde.

---

## 6. Diagrama de estado

```
┌──────────────────────────────────────────────────────────────────┐
│                        HOJE (fragmentado)                        │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ KloelMessage │  │  ChatMessage │  │ KloelConversation    │   │
│  │ (brain AI)   │  │  (dashboard) │  │ (lead conversation)  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴───────┐  ┌──────┴───────┐              │               │
│  │ KloelMemory  │  │  ChatThread  │              │               │
│  │ (KV + vect)  │  │  (threads)   │              │               │
│  └──────────────┘  └──────────────┘              │               │
│                                                   │               │
│  ┌───────────────────────────────────────────────┴───────────┐   │
│  │                    Mind (Cognitive Engine)                │   │
│  │  MindBelief  MindPrediction  MindPolicy  MindBanditArm   │   │
│  │  MindCase  MindGraphNode  MindGuardAudit  MindOutbox     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Eventos: message.* + brain.* + mind.* (interno)                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     ALVO (unificado — Kloel Mind)                 │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      MindMessage                          │  │
│  │  source: "brain" | "dashboard" | "lead_conversation"      │  │
│  │  (unifica KloelMessage + ChatMessage + KloelConversation) │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │  MindThread         MindMemory        MindSession         │  │
│  │  (ex-ChatThread)    (ex-KloelMemory)  (ex-MindWsState)    │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                    Mind (Cognitive Engine)                 │  │
│  │  MindBelief  MindPrediction  MindPolicy  MindBanditArm    │  │
│  │  MindCase  MindGraphNode  MindGuardAudit  MindOutbox      │  │
│  │  MindDailyReport  MindGlobalPrior  MindConceptDetection   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Eventos: cognition.* (público) + mind.* (interno)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Governança e anti-decisões

### 7.1 Proibido

- **NÃO** dropar tabela ou coluna Prisma sem ADR-0014 autorizando
- **NÃO** renomear service sem alias deprecated com banner `@deprecated`
- **NÃO** remover alias antes de 4 semanas + 0 callers verificados via codegraph + grep
- **NÃO** alterar interfaces do `UnifiedAgent` — ADR-0006 estabelece que é executor
- **NÃO** alterar `KloelToolDispatcherService` — tool layer é separada da cognição
- **NÃO** desabilitar gates Codacy para bypass

### 7.2 Gates de progresso

| PR | Gate | Métrica |
|---|---|---|
| PR-1 | Schema aditivo | `npx prisma migrate dev` cria apenas tabelas novas |
| PR-2 | Memory canônico | `MemoryService === MindMemoryService` |
| PR-3 | Thread canônico | `KloelThreadService === MindThreadService` |
| PR-4 | Adapters | Spec dual-read/write |
| PR-5 | Backfill | Row counts equivalentes |
| PR-6 | Canary | 0 erros no workspace com flag ON |
| PR-7 | Views SQL | `SELECT COUNT(*)` equivalente |
| PR-8 | Eventos | `readReplayEvents` com ambos nomes |
| PR-9 | Single-write | 0 writes em tabelas legacy |
| PR-10 | Alias removal | 0 referências para modelos antigos |
| PR-11 | Drop tables | Backup verificado + migration |

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Dual-write quebra idempotência do outbox | Média | Alto | Feature flag controlada; outbox usa `idempotencyKey` por `(workspaceId, key)` |
| Perda de dados no backfill | Baixa | Crítico | Job idempotente; verificação de row count; backup antes de PR-11 |
| Quebra silenciosa de callers não mapeados | Média | Médio | Janela de 4 semanas com aliases; codegraph cross-reference |
| View SQL lenta com UNION ALL de 4 tabelas | Baixa | Baixo | View é apenas transição; removida no PR-10 |
| `KloelMemory` usado como KV store por agent-runtime (7+ services, 89+ call sites) | Alta | Médio | Adapter abstrai a diferença; dual-write garante consistência |
| Colisão de nome `mind.*` (eventos internos vs. taxonomia pública) | Média | Médio | Prefixos distintos: `mind.*` (interno) vs `cognition.*` (público) |

---

## 9. Referências

- [ADR-0013 — Kloel Mind unification](../adr/0013-kloel-mind-unification.md)
- [ADR-0006 — Papeis cognitivos canônicos](../adr/0006-papeis-cognitivos-canonicos.md)
- [Event Taxonomy Migration](./EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md)
- [Deprecation Map](./DEPRECATION_MAP.md)
- [Canonical Domains](./CANONICAL_DOMAINS.md)
- [Service Catalog](./SERVICE_CATALOG.md)
- [Event Taxonomy](./EVENT_TAXONOMY.md)
- `backend/prisma/schema.prisma` — source of truth para models
- `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts` — taxonomia atual de eventos

---

**Fim do plano. Implementação autorizada apenas via PRs sequenciais com gates verificados.**
