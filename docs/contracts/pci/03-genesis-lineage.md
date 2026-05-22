# PCI.3 — Genesis Event e Lineage Ledger

> **Documento canônico imutável.** Onda 0 / UTP-PCI-003. Genesis e Lineage
> Ledger são as **únicas** invariantes estruturais de identidade. Substituem
> system prompt declarando "você é Kloel". Identidade emerge do estado, não da
> instrução (B11, B16).
>
> **Nome canônico**: `kloel-cognitive-organism-pci-3`
> **Versão**: `1.0.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

---

## 1. Princípio

Identidade do organismo é **derivada** de fatos auditáveis, não declarada por
texto. O Genesis Event é o fato fundador imutável; o Lineage Ledger é a história
operacional append-only que confirma continuidade.

Se Genesis some ou é alterado: organismo perde identidade. Se Lineage Ledger é
quebrado: identidade entra em modo `lineage_compromise_detected` e bloqueia
projeções até intervenção humana.

## 2. Genesis Event

Evento `lineage.genesis` emitido **uma única vez** na história do sistema.
Identificado por `eventId` único, jamais reutilizado.

### 2.1 Forma Canônica

```
{
  eventId: <ULID/UUID v7 fixo, registrado em CHECKSUMS>
  eventName: "lineage.genesis"
  timestamp: <ISO-8601 do bootstrap>
  occurredAt: <mesmo>
  // workspaceId AUSENTE (evento global)
  truthMode: "observed"
  provenance: {
    source: "production"
    processor: "lineage-bootstrap"
    processorVersion: "1.0.0"
    schemaVersion: "1.0.0"
    environment: "prod"
  }
  valence: "neutral"
  payload: {
    canonicalName: "Kloel"            // IMUTÁVEL
    etymology: {                       // IMUTÁVEL
      greek: { word: "kléos", meaning: "renome, glória, fama duradoura" }
      hebrew: { word: "El", meaning: "Deus, força fundadora" }
      synthesis: "renome construído sob fundamento maior"
    }
    origin: {                          // IMUTÁVEL
      nature: "organismo cognitivo biomimético comercial multi-tenant"
      inception: "2026-05-13"
      authorPosture: "Daniel Penin como mordomo, não autor de identidade"
    }
    steward: {                         // IMUTÁVEL
      role: "humano-mordomo"
      responsibility: "governança, rollback, autorização de evolução composta"
      posture: "preservador de origem, não ditador de comportamento"
    }
    inviolable: ["canonicalName", "etymology", "origin", "steward", "inviolable"]
    evolvable: ["capabilities", "memory", "valence", "beliefs", "operationalState"]
  }
  hash: <sha256 do payload canonicalizado JCS — ver §5>
}
```

### 2.2 Imutabilidade

Tentativa de re-emitir `lineage.genesis` com `eventId` diferente é **falha
grave**:

- Gate `origin-immutability` falha em `hard_fail` desde Onda 1.
- Spine rejeita persistência.
- Alerta humano disparado via `evolution.gap_detected` com tag de origem.

Tentativa de editar payload do Genesis existente:

- Bloqueada pela natureza append-only do spine.
- Detectada pelo Identity Lineage Guard (UTP-LINEAGE-003) que recomputa hash a
  cada checagem.

### 2.3 Audiences e Genesis

Genesis Event é **leitura interna**. NUNCA exposto em audience `public` por
default. Apenas `audience: "origin"` (solicitação explícita auditável) ou
`audience: "internal"` (debug/auditoria) acessam payload.

Identity Projector (UTP-LINEAGE-004) decide o que projetar. Default em qualquer
canal comercial: `canonicalName` apenas. Etimologia, mordomia e natureza
fundadora **não vazam** sem solicitação explícita.

## 3. Lineage Ledger

Sequência hash-encadeada de eventos que sustentam a continuidade da identidade
operacional.

### 3.1 Forma de Cada Entrada

```
{
  ledgerEntryId: <ULID/UUID v7 monotônico>
  sequenceNumber: <inteiro positivo monotônico>
  prevEntryHash: <sha256 da entrada anterior, ou "0x00...0" para primeira>
  eventId: <referência a evento de spine>
  eventName: <conforme PCI.1, prefixo "lineage.">
  timestamp: <ISO-8601>
  payload: <objeto específico do tipo de entrada>
  hash: <sha256 do conteúdo canonicalizado da entrada, INCLUI prevEntryHash>
}
```

### 3.2 Tipos de Entrada Permitidos

Apenas eventos `lineage.*` (PCI.1 §3.1) entram no ledger:

- `lineage.genesis` (entrada 1, sempre)
- `lineage.capability_acquired` (capability nova com runtime evidence)
- `lineage.skill_consolidated` (skill atinge productionReady)
- `lineage.ciclo_pulse_nao_regressivo` (PULSE certifica ciclo)

### 3.3 Append-Only

- Entradas NUNCA são editadas ou removidas.
- `sequenceNumber` é monotônico crescente.
- `prevEntryHash` da entrada N == `hash` da entrada N-1.
- Inserção fora de ordem é **falha grave** que dispara `lineage_compromise_detected`.

### 3.4 Verificação de Integridade

Identity Lineage Guard (UTP-LINEAGE-003) executa em runtime:

1. Lê todas as entradas em ordem.
2. Recomputa hash de cada entrada (incluindo `prevEntryHash`).
3. Compara contra hash registrado.
4. Confirma que primeira entrada é `lineage.genesis` com payload canônico.
5. Confirma `canonicalName: "Kloel"` em payload da Genesis.

Falha em qualquer passo:

- Status `lineageStatus` no ABI muda para `"compromised"`.
- Identity Projector REJEITA novas projeções.
- Evento `evolution.gap_detected` com tag `lineage_compromise_detected` é
  emitido.
- Alerta humano disparado.
- Operação de chat/autopilot continua mas com declaração honesta de degradação
  (`pulseTruth.gates[lineage-integrity].status = "FAIL"`).

### 3.5 Recuperação

Recuperação de compromisso de linhagem é **operação humana exclusiva**:

- Steward (Daniel) inspeciona ledger.
- Identifica ponto de divergência.
- Decide entre reparo (raro, exige ADR) ou aceitação de novo ramo.
- Emite evento `evolution.human_authorization_granted` autorizando ação.

IA NUNCA repara linhagem autonomamente. B0.16 + R36 (governança humana
absoluta).

## 4. Hash e Canonicalização

### 4.1 Algoritmo

`sha256` do payload canonicalizado conforme **JCS** (JSON Canonicalization
Scheme, RFC 8785):

- Chaves ordenadas lexicograficamente.
- Whitespace removido entre tokens estruturais.
- Strings escapadas conforme RFC 8259 sem escape opcional.
- Números em forma canônica (sem zeros à direita desnecessários, sem `+0`,
  notação científica conforme regra).

### 4.2 Hash do Genesis

Hash do Genesis Event é registrado em `docs/contracts/pci/CHECKSUMS.txt` na
selação da Onda 0 (UTP-PCI-008). Verificado em runtime por Identity Lineage
Guard.

### 4.3 Hash de Cada Entrada do Ledger

Calculado sobre o objeto canonicalizado da entrada **incluindo** `prevEntryHash`,
`sequenceNumber`, `eventId`, `payload`, mas **excluindo** o próprio campo
`hash` (referência circular).

## 5. Persistência

### 5.1 Schema Prisma (orientação)

UTP-LINEAGE-007 implementa persistência aditiva. Forma esperada (não literal):

```
model LineageEntry {
  id                String   @id @default(uuid()) @db.Uuid
  ledgerEntryId     String   @unique
  sequenceNumber    Int      @unique
  prevEntryHash     String
  eventId           String
  eventName         String
  timestampUtc      DateTime
  payloadJson       Json
  hash              String   @unique
  createdAt         DateTime @default(now())
  // SEM updatedAt — append-only, NUNCA editado.
  @@index([sequenceNumber])
  @@index([eventName])
}
```

Migração é **aditiva**. Nunca regredir schema atual. Sem deletar tabela
existente.

### 5.2 Constraint de Integridade

- `sequenceNumber` é UNIQUE + auto-monotônico.
- `hash` é UNIQUE.
- `prevEntryHash` da N-ésima entrada é validado contra `hash` da (N-1)-ésima
  via trigger ou check em runtime.
- DELETE em `LineageEntry` é **proibido** por política de aplicação (mesmo
  superuser passa por flow auditado de steward).

## 6. Identity Projector

UTP-LINEAGE-004 implementa o projetor. Comportamento canônico:

| `audience` | O que é projetado em `lineage` do ABI |
|---|---|
| `public` | `canonicalName: "Kloel"` apenas. Operational age opcional. |
| `technical` | `canonicalName`, `genesisEventId`, `lineageStatus`, `operationalAge`, `capabilities`. SEM payload do Genesis. |
| `origin` | Tudo do `technical` + payload completo do Genesis (etimologia, origem, mordomia). Apenas sob solicitação explícita auditável. |
| `internal` | Tudo + ledger completo. Apenas para debug/auditoria interna. |

UTP-LINEAGE-005 garante isolamento entre audiences via spec automatizada.

## 7. Tentativa de Adulteração

Os seguintes cenários disparam `origin-immutability` em hard_fail desde Onda 1:

- Tentativa de re-emitir `lineage.genesis`.
- Tentativa de mutar `canonicalName` em qualquer ponto do código.
- Tentativa de mutar `etymology`, `origin`, ou `steward` no Genesis.
- Tentativa de inserir entrada no ledger com `prevEntryHash` quebrado.
- Tentativa de editar entrada existente (qualquer UPDATE/DELETE em
  `LineageEntry`).

CI tem grep dedicado contra strings imutáveis para garantir que nenhum
codemod acidental adultere `canonicalName`.

## 8. Compromissos de UTPs Consumidoras

- Toda UTP de Camada I (LINEAGE-001..007) referencia este documento.
- ABI builder (UTP-ABI-002) consome lineage projetado, **nunca** paywall
  textual sobre identidade.
- Subagent que diverge é rejeitado e re-despachado.

## 9. Exemplo Canônico do Ledger (3 primeiras entradas)

```json
[
  {
    "ledgerEntryId": "01JD90000000000000000001",
    "sequenceNumber": 1,
    "prevEntryHash": "0000000000000000000000000000000000000000000000000000000000000000",
    "eventId": "01JD90000000000000000000GE",
    "eventName": "lineage.genesis",
    "timestamp": "2026-05-13T20:00:00.000Z",
    "payload": {
      "canonicalName": "Kloel",
      "etymology": { "greek": { "word": "kléos", "meaning": "renome, glória, fama duradoura" }, "hebrew": { "word": "El", "meaning": "Deus, força fundadora" }, "synthesis": "renome construído sob fundamento maior" },
      "origin": { "nature": "organismo cognitivo biomimético comercial multi-tenant", "inception": "2026-05-13", "authorPosture": "Daniel Penin como mordomo, não autor de identidade" },
      "steward": { "role": "humano-mordomo", "responsibility": "governança, rollback, autorização de evolução composta", "posture": "preservador de origem, não ditador de comportamento" },
      "inviolable": ["canonicalName", "etymology", "origin", "steward", "inviolable"],
      "evolvable": ["capabilities", "memory", "valence", "beliefs", "operationalState"]
    },
    "hash": "<sha256 a calcular no bootstrap real>"
  },
  {
    "ledgerEntryId": "01JD90000000000000000002",
    "sequenceNumber": 2,
    "prevEntryHash": "<hash da entrada 1>",
    "eventId": "01JD9X1000000000000000ABI",
    "eventName": "lineage.capability_acquired",
    "timestamp": "2026-05-13T20:01:33.000Z",
    "payload": {
      "capabilityId": "abi-builder",
      "maturity": "developing",
      "runtimeEvidencePct": 5,
      "acquiredVia": "UTP-ABI-002 inicial"
    },
    "hash": "<sha256>"
  },
  {
    "ledgerEntryId": "01JD90000000000000000003",
    "sequenceNumber": 3,
    "prevEntryHash": "<hash da entrada 2>",
    "eventId": "01JD9X2000000000000000PUL",
    "eventName": "lineage.ciclo_pulse_nao_regressivo",
    "timestamp": "2026-05-13T22:30:00.000Z",
    "payload": {
      "cycleNumber": 1,
      "score": 0.42,
      "verdict": "INSUFFICIENT_EVIDENCE"
    },
    "hash": "<sha256>"
  }
]
```

---

**Fim de PCI.3.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
