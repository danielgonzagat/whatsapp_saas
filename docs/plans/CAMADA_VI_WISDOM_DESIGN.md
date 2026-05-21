# Camada VI — Cross-Workspace Commercial Wisdom: Design Detalhado

> Documento de design para `WisdomPatternExtractorService` (UTP-WISDOM-001).
> Referencia: `KLOEL_COGNITIVE_ORGANISM_PLAN.md` Camada VI + R14 + Parte E.11.

## Propósito

Extrair padroes abstratos cross-workspace sem que nenhum dado identificavel
atravesse fronteira de workspace. O extractor recebe eventos agregados e
anonimizados por workspace e devolve `ExtractedPattern[]` contendo apenas
informacao abstrata (sem workspaceId, leadId, email, etc.).

## Arquitetura de Seguranca

```
WorkspaceEventSet[]  (anonimizado, sem PII)
        |
        v
WisdomPatternExtractorService.extract()
        |
        |-- Para cada candidato, chama:
        |   WisdomPrivacyGuardService.enforceKAnonimity(pattern, minK=5)
        |   -> Rejeita se evidenceWorkspacesCount < 5
        |
        v
ExtractedPattern[]  (sem PII, sem workspaceId)
```

### Integracao com WisdomPrivacyGuardService

O extractor **depende de** `WisdomPrivacyGuardService` via DI (NestJS).
Antes de emitir qualquer padrao, o extractor:

1. Monta um `CandidatePattern` interno com `evidenceWorkspacesCount`.
2. Chama `privacyGuard.enforceKAnonimity(candidate, 5)`.
3. Se < 5 workspaces, o padrao e descartado (nao incluido no output).
4. Se >= 5, prossegue para extrair o `ExtractedPattern`.

A Parte E.11 do plano cognitivo estabelece:
> "wisdom-attribution-guard + k-anonymity + diff-privacy noise + auditoria
> periodica + opt-out respeitado em 100%"

## Tipo de Saida: ExtractedPattern

```typescript
interface ExtractedPattern {
  kind: PatternKind;
  dimension: PatternDimension;
  support: number;          // number_of_workspaces
  confidence: number;       // 0..1
  abstractDescription: string;
  anonymizedExample: string;
}
```

### PatternKind (5 categorias)

| Categoria | Descricao |
|---|---|
| `objection_pattern` | Frases/temas de objecao que aparecem em multiplos workspaces |
| `channel_efficiency` | Qual canal (whatsapp/email/campaign) produz melhor taxa de conversao agregada |
| `conversion_decay` | Onde no funil (estagio) as conversoes caem de forma consistente |
| `engagement_peak` | Horario/dia de pico de atividade detectado cross-workspace |
| `offer_objection_correlation` | Correlacao entre tipo de oferta e tipo de objecao levantada |

### PatternDimension

| Dimensao | Significado |
|---|---|
| `conversion` | Relacionado a taxa de conversao lead->cliente |
| `engagement` | Relacionado a interacao/engajamento com leads |
| `channel` | Relacionado a canais de comunicacao |
| `offer` | Relacionado a produto/oferta |
| `timing` | Relacionado a tempo/horario |

## Algoritmos de Extracao por Categoria

### 1. objection_pattern

- **Fonte**: eventos `commerce.lead.objection_raised`
- **Agregacao**: conta objeccoes por workspace, extrai keywords anonimizadas do
  payload (ex: "preco", "prazo", "concorrente", "garantia")
- **Output**: `kind='objection_pattern'`, `dimension='conversion'`,
  `abstractDescription='Objeccao "preco" aparece em 8 de 12 workspaces'`,
  `anonymizedExample='Workspace com ticket medio alto reporta objecao de preco
  em 60% dos leads perdidos'`
- **Gate**: requer >= 5 workspaces com >= 3 objeccoes cada

### 2. channel_efficiency

- **Fonte**: eventos `commerce.whatsapp.message_replied`,
  `commerce.campaign.clicked`, `commerce.lead.converted`
- **Agregacao**: calcula taxa de conversao por canal (whatsapp replies/leads,
  campaign clicks/leads)
- **Output**: `kind='channel_efficiency'`, `dimension='channel'`,
  `abstractDescription='Canal whatsapp converte 3.2x mais que campanhas em 7
  workspaces'`
- **Gate**: requer >= 5 workspaces com atividade em ambos os canais

### 3. conversion_decay

- **Fonte**: eventos `commerce.crm.stage_changed`,
  `commerce.lead.lost`, `commerce.lead.converted`
- **Agregacao**: rastreia transicoes de estagio, detecta onde leads sao perdidos
- **Output**: `kind='conversion_decay'`, `dimension='conversion'`,
  `abstractDescription='Queda de 45% na transicao "negociacao"->"fechamento" em
  6 workspaces'`
- **Gate**: requer >= 5 workspaces com pipeline >= 3 estagios

### 4. engagement_peak

- **Fonte**: todos os eventos com timestamp
- **Agregacao**: histograma de hora do dia / dia da semana cross-workspace
- **Output**: `kind='engagement_peak'`, `dimension='timing'`,
  `abstractDescription='Pico de atividade as 14h-16h UTC em 9 workspaces'`
- **Gate**: requer >= 5 workspaces com >= 50 eventos cada

### 5. offer_objection_correlation

- **Fonte**: eventos `commerce.lead.objection_raised` +
  `commerce.lead.converted` com `payload.productId`
- **Agregacao**: correlaciona produtos (anonimizados como "produto_tipo_A")
  com tipos de objecao
- **Output**: `kind='offer_objection_correlation'`, `dimension='offer'`,
  `abstractDescription='Ofertas de alto ticket correlacionam com objecao de
  preco em 7 workspaces'`
- **Gate**: requer >= 5 workspaces com >= 5 produtos + objeccoes

## K-Anonymity Gate (R14)

O R14 exige "Cross-workspace wisdom efetivo sem vazamento". O gate opera em
dois niveis:

1. **Hard gate no extractor**: `enforceKAnonimity(candidate, 5)` — padrao com
   menos de 5 workspaces nem chega a ser extraido.
2. **Hard gate no pipeline downstream**: `fullPrivacyAudit()` no projector
   garante que nenhum `WisdomPattern` final tenha < 5 workspaces ou vaze PII.

## E.11 — Prevencao de Vazamento

- Nenhum `workspaceId` real aparece em `abstractDescription` ou
  `anonymizedExample`.
- Contagens sao sempre agregadas ("8 de 12 workspaces", nunca "wks_001, wks_002...").
- `anonymizedExample` usa linguagem generica: "Workspace com ticket medio alto",
  "Workspace no estagio de tracao", etc.
- O `WisdomPrivacyGuardService.guardProjection()` executa scan de regex PII
  antes da projecao no ABI.

## Contrato de Entrada

```typescript
interface WorkspaceEventSet {
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
}
```

- Eventos ja estao anonimizados (sem PII no payload).
- `workspaceId` e usado apenas internamente para contagem; nunca aparece no output.

## Contrato de Saida

```typescript
extract(sets: readonly WorkspaceEventSet[]): ExtractedPattern[]
```

- Array vazio se < 2 workspaces ou nenhum padrao atinge k=5.
- Cada `ExtractedPattern` tem `support >= 5`.
- Nenhum campo contem PII ou identificadores de workspace.

## Criterios de Aceitacao

1. `extract()` com < 2 workspaces retorna `[]`.
2. `extract()` com < 5 workspaces por padrao retorna `[]` (k-anonymity gate).
3. `extract()` com >= 5 workspaces e eventos suficientes retorna padroes.
4. Nenhum `abstractDescription` contem `wks_`, `lead_`, `email`, `phone`, etc.
5. Nenhum `anonymizedExample` contem PII.
6. `support >= 5` para todo padrao retornado.
7. `confidence` entre 0 e 1 para todo padrao.
8. Padroes de diferentes `kind` podem coexistir no mesmo output.

## Verificacao

```bash
cd backend && npx jest --testPathPattern=wisdom-pattern
```
