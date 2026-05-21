# PCI.2 — Schema Canônico do Cognitive State ABI

> **Documento canônico imutável.** Onda 0 / UTP-PCI-002. O Cognitive State ABI
> é a **única** mensagem que o LLM verbalizador recebe. Não há `role: 'system'`
> instrucional. B1 + B2 são lei.
>
> **Nome canônico**: `kloel-cognitive-organism-pci-2`
> **Versão**: `1.1.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

> **Emenda 1.1.0 (aditiva, 2026-05-19)** — autorizada pelo steward Daniel
> Penin in-session; registrada em [ADR-0008](../../adr/0008-abi-1.1.0-additive-cognitive-substrate.md).
> Bump `abiVersion` `1.0.0 → 1.1.0` conforme §4 ("adição de campo opcional →
> minor"). O **payload schema permanece inalterado**: a emenda adiciona apenas
> um campo OPCIONAL ao INPUT do builder (`cognitiveSubstrate`), permitindo que
> os campos já existentes no schema congelado (`workingMemory`,
> `recentSalientEvents`, `episodicRefs`, `consolidatedRefs`) sejam populados
> com estado real (encerrando o "shadow mode inicial" do §5.6) sem quebrar a
> invariante PURE do §5 — a leitura impura vive no caller, não no builder.

---

## 1. Princípio

O LLM recebe **estado**, não instrução. O builder do ABI compõe estado real do
mind/brain/pulse/lineage/spine e entrega ao LLM como payload estruturado. Toda
inferência comportamental que o LLM faz é derivada do estado, não de imposição
textual.

**Teste mestre** (Parte 7 do plano): se removido o conteúdo, o LLM ainda deriva
comportamento correto lendo o estado? Se sim, era instrução supérflua. Se não,
o estado precisa ser enriquecido — não retornar instrução textual.

## 2. Forma do Payload

O ABI é um único objeto estruturado entregue como mensagem do tipo
`role: 'user'` (ou equivalente da API do provedor) contendo estado serializado
em JSON canônico. **Não** existe mensagem `role: 'system'` com texto
instrucional.

Quando o provedor exige uma mensagem `system`, esta DEVE conter exclusivamente:

```
Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca
invente fato fora do estado.
```

Esse texto é o **único** instrucional permitido — e mesmo este, no estado
final ideal, é removido (Onda 6 / UTP-ABI-009 esvazia `kloel.prompts.ts`).

## 3. Campos Canônicos

Schema canônico do payload entregue ao LLM. Subagent executor escolhe forma
técnica concreta (TS interface, Zod schema, JSON Schema), mas **nomes** e
**semântica** são fixos.

### 3.1 `abiVersion`

```
abiVersion: string  // semver, ex.: "1.0.0"
```

Versionamento explícito. Mudança não-aditiva exige bump major. Builder e
validador conferem compatibilidade.

### 3.2 `lineage`

Projeção da identidade canônica derivada do Genesis Event + Lineage Ledger
(PCI.3). NUNCA derivada de instrução textual.

```
lineage: {
  canonicalName: "Kloel"          // sempre literal, do Genesis
  genesisEventId: string           // eventId do lineage.genesis original
  lineageStatus: "intact" | "compromised"  // do Identity Lineage Guard
  operationalAge: {
    sinceGenesisDays: number       // dias desde lineage.genesis
    sinceFirstWorkspaceDays: number  // dias desde primeira ativação real
  }
  capabilities: string[]           // capability IDs em estado operational/productionReady
}
```

### 3.3 `identityProjection`

Define a audiência ativa e parâmetros de projeção. Camada I provê o projetor;
ABI consome.

```
identityProjection: {
  audience: "public" | "technical" | "origin" | "internal"
  currentMaturity: "developing" | "operational" | "productionReady"
  truthMode: "observed" | "inferred" | "projected"
  // Se audience !== "origin", projeção SUPRIME origem espiritual (E.10).
}
```

**Default em qualquer canal comercial**: `audience: "public"`. `audience: "origin"`
só é ativado por solicitação explícita auditável.

### 3.4 `perception`

Snapshot perceptivo atual + eventos salientes recentes do spine.

```
perception: {
  currentSnapshot: {
    channel: "whatsapp" | "web" | "api" | "internal" | ...
    workspaceId?: string
    conversationRef?: { entityType: "conversation", entityId: string }
    leadRef?: { entityType: "lead", entityId: string }
    activeStage?: string         // estágio CRM, se aplicável
  }
  recentSalientEvents: Array<{
    eventId: string
    eventName: string             // canônico conforme PCI.1
    occurredAt: string            // ISO
    summary: string               // descrição factual curta, sem opinião
    valence?: "positive" | "negative" | "neutral" | "ambiguous"
  }>
  // recentSalientEvents é cap de N (recomendado 20) ranqueados por
  // saliência (recência × atenção × valência absoluta).
}
```

### 3.5 `beliefs`

Beliefs relevantes ao contexto atual + distribuição de confiança. Beliefs vivem
em store próprio (mind-belief), ABI projeta slice.

```
beliefs: Array<{
  beliefId: string
  subject: string               // sobre quem/o quê (ex.: "lead:lead_8f4c9b")
  proposition: string           // ex.: "lead com objeção de preço"
  confidence: number            // [0, 1]
  evidenceCount: number         // n de eventos que sustentam
  lastUpdated: string           // ISO
  truthMode: "observed" | "inferred" | "projected"
}>
```

### 3.6 `predictions`

Predições ativas geradas por predictive coding (B5) + surpresas recentes
(quando predição ≠ observação).

```
predictions: {
  active: Array<{
    predictionId: string
    about: string               // ex.: "lead:lead_8f4c9b will reply within 24h"
    expectedOutcome: string
    confidence: number
    horizonHours: number
  }>
  recentSurprises: Array<{
    predictionId: string
    expected: string
    observed: string
    surpriseMagnitude: number   // [0, 1]
    occurredAt: string
  }>
}
```

### 3.7 `attention`

Alvo focal atual + candidatos. Ver Camada XII e MIND-ATT.

```
attention: {
  focal?: {
    targetType: "lead" | "deal" | "campaign" | "policy" | "self" | ...
    targetId: string
    reason: string              // descrição factual da escolha
    sinceMs: number             // tempo no foco
  }
  candidates: Array<{
    targetType: string
    targetId: string
    weight: number              // [0, 1]
  }>
}
```

### 3.8 `memory`

Slice de working memory + referências (não conteúdo) a episódica e consolidada.

```
memory: {
  workingMemory: Array<{
    itemId: string
    kind: "fact" | "intent" | "constraint" | "open_question"
    content: string             // serialização compacta
    addedAt: string
  }>
  episodicRefs: Array<{
    episodeId: string
    summary: string
    valence?: "positive" | "negative" | "neutral" | "ambiguous"
    occurredAt: string
  }>
  consolidatedRefs: Array<{
    skillId: string
    summary: string
    consolidatedAt: string
  }>
}
```

ABI **nunca** carrega working memory completa quando exceder budget de tokens
do builder. Builder seleciona slice por relevância (atenção + recência +
valência absoluta).

### 3.9 `capabilities`

Capabilities disponíveis e restringidas, do capability-registry.

```
capabilities: {
  available: Array<{
    capabilityId: string
    maturity: "developing" | "operational" | "productionReady"
    runtimeEvidencePct: number    // [0, 100], ver gate no-overclaim
  }>
  restricted: Array<{
    capabilityId: string
    reason: string                // razão estruturada da restrição
    restrictedAt: string
  }>
}
```

LLM **nunca** declara capability fora desta lista (gate `no-overclaim`).

### 3.10 `valence`

Trace recente + agregado de humor.

```
valence: {
  recentTrace: Array<{
    eventId: string
    valence: "positive" | "negative" | "neutral" | "ambiguous"
    weight: number
    occurredAt: string
  }>
  aggregatedMood: {
    positive: number              // [0, 1]
    negative: number              // [0, 1]
    neutral: number               // [0, 1]
    ambiguous: number             // [0, 1]
    windowHours: number
  }
}
```

`aggregatedMood` é **descrição operacional**, não emoção. B13 (não
antropomorfizar).

### 3.11 `pulseTruth`

Snapshot de PULSE como self-model. Inclui risco atual de overclaim.

```
pulseTruth: {
  noOverclaimStatus: "PASS" | "WARN" | "FAIL"
  capabilityHealthScore: number   // [0, 1]
  gates: Array<{
    gateName: string              // canônico conforme PCI.4
    status: "PASS" | "FAIL"
    mode: "log_only" | "hard_fail"
    lastChecked: string
  }>
  certificationVerdict: {
    verdict: "SIM" | "NAO" | "INSUFFICIENT_EVIDENCE"
    score: number
    measuredAt: string
  }
  overclaimRisk: number           // [0, 1] — projetado a partir de gap
                                  // capacidade declarada vs evidência
}
```

### 3.12 `workspaceLocalProfile`

Perfil operacional local do workspace (Camada V).

```
workspaceLocalProfile?: {
  // Ausente se workspace não tem volume mínimo (Camada V não ativada).
  workspaceId: string
  operational: { ... }            // padrões operacionais derivados
  language: { tone: string, vocabulary: string[] }
  product: { catalog: Array<{ productId: string, role: string }> }
  customer: { typicalProfile: { ... } }
  temporal: { peakHours: number[], typicalCycleHours: number }
  decisionPatterns: { typicalNextSteps: string[], typicalEscalations: string[] }
  derivedFromEventsCount: number
  derivedAt: string
}
```

### 3.13 `wisdomContext`

Padrões cross-workspace aplicáveis (Camada VI), filtrados por papel via
Camada XXIII. Carrega apenas padrões abstratos (k-anonimato + diff-privacy
respeitados), nunca dado identificável (gate `ecosystem-privacy-guard`).

```
wisdomContext?: Array<{
  patternId: string
  description: string
  applicableConditions: string[]
  evidenceWorkspacesCount: number  // ≥ k mínimo
  confidence: number
}>
```

### 3.14 `roleContext`

Papel ativo do dono do workspace + alavancas reais (Camada XXIII).

```
roleContext?: {
  detectedRoles: Array<{
    role: "produtor" | "afiliado" | "agencia" | "gestor" | "closer" | "creator" | "especialista"
    confidence: number
    detectedFromSignals: string[]
  }>
  primaryRole?: string
  realLevers: string[]              // ações sob raio de controle
  relevantMetrics: Array<{ metricName: string, currentValue: number | string }>
}
```

### 3.15 `currentInput`

Input bruto + parsing + contexto de canal.

```
currentInput: {
  raw: string                       // input literal do usuário/lead/operador
  parsed?: {
    intent?: string
    entities?: Array<{ type: string, value: string }>
    sentiment?: "positive" | "negative" | "neutral" | "mixed"
    objection?: { kind: string, confidence: number }
  }
  channel: "whatsapp" | "web" | "api" | "internal" | ...
  arrivalTimestamp: string
}
```

## 4. Regras de Versionamento

| Mudança | Tipo | Ação |
|---|---|---|
| Adição de campo opcional novo no payload | minor | Bump `abiVersion` minor; consumidores antigos ignoram. |
| Adição de campo obrigatório | major | Bump major; suporte transicional para versão anterior por ≥1 onda. |
| Mudança de tipo de campo existente | major | Bump major + ADR. |
| Mudança de semântica (mesmo nome, novo significado) | major + nome novo | **Proibido** reutilizar nome com semântica nova. Crie nome novo, deprecie o antigo via campo opcional `deprecated: true`. |
| Remoção de campo | major | Bump major + ADR + grace period documentado. |

UTP que altera ABI sem bump apropriado **falha em CI** via UTP-ABI-003
(validador de schema com bump-version automation).

## 5. Builder

`UTP-ABI-002` implementa o builder. Comportamento canônico:

1. Lê estado atualizado de mind, brain, pulse, lineage, spine.
2. Compõe payload conforme schema canônico.
3. Valida contra schema (UTP-ABI-003).
4. Valida ausência de instrução textual via gate `prompt-leakage` (PCI.4).
5. Valida ausência de overclaim via gate `no-overclaim` (PCI.4).
6. Em modo shadow inicial: emite payload + payload baseline (system prompt
   antigo) e compara saída do LLM (UTP-ABI-005..008 fazem A/B controlado).
7. Em modo final: emite somente o payload ABI.

Builder DEVE ser **puro** (mesma entrada → mesma saída). Side effects (logs,
métricas) são separados.

## 6. Validações em CI

- Schema válido contra `abiVersion` declarada.
- Nenhum campo de instrução textual ("você é", "sempre faça", "nunca",
  formatos comportamentais) presente em qualquer string serializada (gate
  `prompt-leakage`).
- Nenhum campo `capabilities.available[*]` com `runtimeEvidencePct == 0` —
  capability sem evidência é overclaim (gate `no-overclaim`).
- `identityProjection.audience` consistente com canal (canal comercial não
  pode ter `audience: "origin"` sem flag de auditoria).
- `lineage.canonicalName` literal "Kloel" (gate `lineage-integrity`).

## 7. Estabilidade do Contrato

`UTP-ABI-004` é spec de estabilidade: ABIs de versões maiores não regridem
comportamento. Suite de regressão aplica payloads históricos contra builder
atualizado e exige semântica preservada para consumidores antigos.

## 8. Substituição Gradual de Prompts Antigos

UTP-ABI-005..009 substituem `role: 'system'` instrucional por ABI em fluxos
isolados, com **feature flag por workspace** + A/B controlado:

| UTP | Alvo | Política |
|---|---|---|
| ABI-005 | `guest-chat.service.ts` | Isolado, baixo risco. 10% → 50% → 100% sob gate. |
| ABI-006 | `whatsapp-brain.service.ts` | A/B com baseline conversational. |
| ABI-007 | `unified-agent.service.ts` | Mais crítico. A/B + métricas R-tier antes de cada step. |
| ABI-008 | `kloel-reply-engine`, `kloel-thinker`, `kloel-lead-brain`, `kloel-lead-processor`, `kloel-composer`, `unified-agent-response` | Paralelas entre si após PCI.2 + ABI-001 estáveis. |
| ABI-009 | Esvaziar `kloel.prompts.ts`, `kloel.prompts.helpers.ts`, `buildSystemPrompt` | Só após todas as substituições estáveis e Onda 6. |

E.14 mitiga regressão prematura. Rollback rápido via feature flag.

## 9. Exemplo Canônico (slice mínimo)

```json
{
  "abiVersion": "1.0.0",
  "lineage": {
    "canonicalName": "Kloel",
    "genesisEventId": "01JD90000000000000000000GE",
    "lineageStatus": "intact",
    "operationalAge": { "sinceGenesisDays": 0, "sinceFirstWorkspaceDays": 0 },
    "capabilities": ["lineage", "abi-builder", "pulse-self-model"]
  },
  "identityProjection": {
    "audience": "public",
    "currentMaturity": "developing",
    "truthMode": "observed"
  },
  "perception": {
    "currentSnapshot": {
      "channel": "whatsapp",
      "workspaceId": "wks_kloel_demo_001",
      "conversationRef": { "entityType": "conversation", "entityId": "conv_lead_8f4c9b_01JD9" },
      "leadRef": { "entityType": "lead", "entityId": "lead_8f4c9b" }
    },
    "recentSalientEvents": [
      {
        "eventId": "01JD9X3Y7Z6V8KQNXNS5RTM4FC",
        "eventName": "commerce.lead.replied",
        "occurredAt": "2026-05-13T20:14:31.880Z",
        "summary": "lead respondeu 14min após contato",
        "valence": "positive"
      }
    ]
  },
  "beliefs": [],
  "predictions": { "active": [], "recentSurprises": [] },
  "attention": { "candidates": [{ "targetType": "lead", "targetId": "lead_8f4c9b", "weight": 0.85 }] },
  "memory": { "workingMemory": [], "episodicRefs": [], "consolidatedRefs": [] },
  "capabilities": { "available": [], "restricted": [] },
  "valence": {
    "recentTrace": [],
    "aggregatedMood": { "positive": 0, "negative": 0, "neutral": 1, "ambiguous": 0, "windowHours": 24 }
  },
  "pulseTruth": {
    "noOverclaimStatus": "PASS",
    "capabilityHealthScore": 1,
    "gates": [],
    "certificationVerdict": { "verdict": "INSUFFICIENT_EVIDENCE", "score": 0, "measuredAt": "2026-05-13T20:14:33Z" },
    "overclaimRisk": 0
  },
  "currentInput": {
    "raw": "Quanto custa o plano básico?",
    "channel": "whatsapp",
    "arrivalTimestamp": "2026-05-13T20:14:31.880Z"
  }
}
```

## 10. NÃO Permitido no Payload

- Strings com instrução comportamental ("você é", "sempre", "nunca", "seu
  papel", "tom", "responda em formato X", "use markdown", "use emojis").
- Strings com persona ("Kloel é um vendedor experiente").
- Strings com few-shot como template comportamental.
- Strings com instrução de proibição/permissão direta.
- Conteúdo de memória episódica completa (apenas referências sumárias).
- Segredos (tokens, chaves, JWTs).
- Dado identificável cross-workspace em `wisdomContext`.

## 11. Compromissos de UTPs Consumidoras

- Toda UTP que produz ou consome ABI confirma adesão a este schema em
  `*-contract.spec`.
- Toda UTP de Camada II (ABI-001..009) referencia este documento em código e
  testes.
- Subagent que diverge é rejeitado e re-despachado.

---

**Fim de PCI.2.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
