# PCI.5 — Convenções Universais

> **Documento canônico imutável.** Onda 0 / UTP-PCI-005. Define convenções
> que valem para TODA UTP, TODO evento, TODA decisão cognitiva. Violar é falha
> grave detectada por gates.
>
> **Nome canônico**: `kloel-cognitive-organism-pci-5`
> **Versão**: `1.0.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

---

## 1. `truthMode` — Modo de Verdade

### 1.1 Definição

Toda saída cognitiva (evento, belief, predição, projeção, recomendação) carrega
campo `truthMode` enumerando como o conteúdo foi obtido:

| Valor | Significado | Exemplos |
|---|---|---|
| `observed` | Fato direto medido. Sem inferência. | `commerce.lead.replied` (mensagem chegou), `commerce.payment.approved` (Stripe confirmou). |
| `inferred` | Resultado de modelo, regra ou raciocínio sobre observados. Carrega confidence. | `commerce.lead.objection_raised` (classificador detectou), belief sobre intenção do lead. |
| `projected` | Especulativo, baseado em modelo de mundo. Pode ser contrafactual. | Predição de probabilidade de churn em 7 dias. |

### 1.2 Regra de Não-Mistura

Nunca declarar `observed` quando o conteúdo é resultado de inferência ou
projeção. Mistura é falha grave detectada por gate `truth-mode-honesty`
(PCI.4 §3.5).

### 1.3 Encadeamento

Quando um evento `inferred` ou `projected` deriva de outros, registre cadeia
em `causedBy` (PCI.1 §4). Permite reconstruir cadeia epistêmica e identificar
ponto de degradação.

### 1.4 No ABI

`identityProjection.truthMode` no ABI declara o modo de verdade da
**projeção de identidade** sendo entregue ao LLM. Default: `observed` (quando
projeção é derivada diretamente do Genesis + Lineage). Se projeção carrega
inferência (ex.: `operationalAge` derivado de heurística), marcar como
`inferred`.

## 2. `provenance` — Proveniência

### 2.1 Definição

Toda evidência (evento, observação, métrica, inferência) carrega campo
`provenance` rastreando origem:

```
provenance: {
  source: "synthetic" | "production"
  processor: <identifier do componente que emitiu>
  processorVersion: <semver do componente>
  schemaVersion: <semver do schema do payload>
  environment: "dev" | "staging" | "prod"
  // Opcional:
  workerId?: <identifier do worker, se aplicável>
  upstreamRef?: <referência a evento/sistema upstream, se aplicável>
}
```

### 2.2 `source` — Crítico

- `synthetic`: gerado para teste, fixture, simulação, replay sem efeito real.
- `production`: dado real de operação de usuário/lead/sistema externo.

**Misturar synthetic e production em mesma pipeline cognitiva é falha grave.**
PULSE detecta via gate `evidence-provenance` (PCI.4 §3.7).

### 2.3 Provenance em Webhooks

Webhooks externos (Stripe, Meta, WAHA) DEVEM ter `provenance` rastreando:

- `processor`: handler do webhook (ex.: `stripe-webhook-handler`).
- `upstreamRef`: identificador externo do evento original (ex.:
  `evt_1NbI2c2eZvKYlo2C`).
- `source: "production"` quando vindo do live mode; `"synthetic"` quando vindo
  de test mode ou replay.

### 2.4 Provenance em Inferências

Eventos `inferred` carregam em `processor` o nome do classificador/modelo,
em `processorVersion` a versão do modelo. Permite auditoria epistêmica:
"esta classificação veio do modelo X v1.4.2".

## 3. `valence` — Valência

### 3.1 Definição

Tag emocional/operacional do evento. Usado por:

- Aprendizado por reforço (B7).
- Hebbian co-activation (B6) — eventos com valência similar ganham peso de
  associação.
- Agregado de mood no ABI (`valence.aggregatedMood`).
- Detector de drift comportamental (Camada X).

### 3.2 Valores

| Valor | Quando usar |
|---|---|
| `positive` | Outcome desejado mensurável. |
| `negative` | Outcome indesejado mensurável. |
| `neutral` | Sem polaridade clara. Default para eventos exploratórios. |
| `ambiguous` | Outcome positivo de superfície com sinal negativo de segunda ordem. Ver B0.7. |

### 3.3 Obrigatoriedade

- Eventos **terminais** (PCI.1 §5): valence OBRIGATÓRIA.
- Eventos **exploratórios**: valence recomendada (default `neutral`).
- Eventos `cognition.*`: tipicamente `neutral` exceto quando descrevem
  outcome (ex.: `cognition.surprise_observed` pode ter `negative` se surpresa
  contradiz crença forte).

### 3.4 Anti-padrão

- `commerce.payment.refunded` com `valence: positive` é **proibido**
  (definicionalmente negativo).
- `commerce.crm.deal_won` com `valence: negative` ou `ambiguous` é permitido
  apenas com razão estruturada em `payload.valenceReason` (ex.: deal ganhou
  mas com refund risk alto).

## 4. `audience` — Audiência

### 4.1 Definição

Audiência ativa quando projeção de identidade é construída. Define o que pode
e não pode aparecer no payload.

### 4.2 Valores

| Valor | Uso típico | O que projeta |
|---|---|---|
| `public` | Lead final, dono em canal comercial, time humano em operação | `canonicalName`, capacidades operacionais. SEM origem espiritual, SEM etimologia. |
| `technical` | Debug técnico, devtools, dashboards de engenharia | `public` + `genesisEventId`, `lineageStatus`, `operationalAge`, capabilities completas. |
| `origin` | Solicitação explícita auditável (raríssima) | Tudo do `technical` + payload completo do Genesis. |
| `internal` | Auditoria interna, replay, análise pós-incidente | Tudo + ledger completo. |

### 4.3 Default

**Em qualquer canal comercial: `public` é default.** Apenas solicitação
explícita auditável muda. Mudança é registrada com `provenance` específico.

### 4.4 Vazamento entre Audiences

Vazamento (ex.: origem espiritual em audience `public`) é detectado por gate
`identity-projection` (PCI.4 §3.3).

## 5. `workspaceId` — Isolamento de Workspace

### 5.1 Obrigatoriedade

Toda persistência multi-tenant DEVE filtrar por `workspaceId`. Toda emissão de
evento `commerce.*`, `cognition.*` (local), `goal_field.*` (local) DEVE
carregar `workspaceId`.

Eventos **globais** (sem `workspaceId`):
- `lineage.*` (linhagem é única, não por workspace)
- `pulse.*` quando descrevem o organismo como um todo
- `evolution.*` quando descrevem evolução do organismo (não de workspace)

### 5.2 Detecção de Vazamento

Ausência de `workspaceId` em evento que deveria carregar é falha grave
detectada em CI por validador (UTP-PCI-007).

Cross-workspace leak em projeções (`wisdomContext`, recomendações cruzadas) é
detectado por gates `ecosystem-privacy-guard` e `internal-knowledge-leak-guard`
(PCI.4 §3.11, §3.12).

### 5.3 Persistência

Todas as queries Prisma em código novo DEVEM filtrar por `workspaceId`. Uso
de `prismaAny.<model>.findMany()` sem filtro é proibido em código de produção.

## 6. Anti-Padrões Universais

### 6.1 Misturar `truthMode`

- Bug típico: classificador retorna probabilidade, código emite evento como
  `observed`.
- Correto: emitir como `inferred` com `confidence` no payload.

### 6.2 Esconder `provenance.source`

- Bug típico: fixture de teste contamina pipeline production.
- Correto: marcar fixture como `synthetic`; PULSE bloqueia mistura.

### 6.3 Forçar `valence: positive` em terminal negativo

- Bug típico: tentativa de "humanizar" output.
- Correto: respeitar polaridade definicional do evento.

### 6.4 Usar `audience: "origin"` em canal comercial

- Bug típico: leak de origem em chatbot público.
- Correto: `audience: "public"` por default; `origin` apenas com
  solicitação explícita auditável.

### 6.5 Persistir sem `workspaceId`

- Bug típico: serviço novo não recebe workspace context.
- Correto: workspace guard obrigatório, query filtrada.

## 7. Exemplo Completo

```json
{
  "eventId": "01JD9X3Y7Z6V8KQNXNS5RTM4FC",
  "eventName": "commerce.lead.objection_raised",
  "timestamp": "2026-05-13T20:14:33.122Z",
  "workspaceId": "wks_kloel_demo_001",
  "entityRef": { "entityType": "lead", "entityId": "lead_8f4c9b" },
  "truthMode": "inferred",
  "provenance": {
    "source": "production",
    "processor": "objection-classifier",
    "processorVersion": "0.3.1",
    "schemaVersion": "1.0.0",
    "environment": "prod"
  },
  "valence": "negative",
  "payload": {
    "objectionKind": "price",
    "confidence": 0.78,
    "evidenceMessageRef": "msg_a3c9",
    "modelInputTokens": 412
  },
  "causedBy": ["01JD9X2VABQK1S4WJZ9V8KP6T2"]
}
```

Nota:
- `truthMode: "inferred"` porque um classificador determinou (não fato direto).
- `provenance.source: "production"` porque mensagem real de lead real.
- `valence: "negative"` porque objeção é definicionalmente negativa
  (resistência à conversão).
- `workspaceId` presente porque evento `commerce.*` é local.
- `causedBy` aponta para `commerce.lead.replied` original.

---

**Fim de PCI.5.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
