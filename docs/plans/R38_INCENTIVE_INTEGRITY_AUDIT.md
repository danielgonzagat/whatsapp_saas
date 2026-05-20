# R38 — Autópsia de Integridade de Incentivo

> **Data**: 2026-05-14. **Camada**: XXXIV (Incentive Integrity). **B-rule**: B0.18.
> **R-criterion alvo**: R38 — ≥95% recomendações com explicação; zero viés
> sistemático auditável externamente; ≥70% confirma "confio que ele recomenda
> pensando em mim".
>
> **Restrição**: auditoria estritamente cognitiva. Zero toque em código.
> Zero arquivo protegido. Zero supressão. Zero `git restore`.

---

## (a) O Que Existe — Inventário de R38 Hoje

### A1. PULSE Gates (superfície de detecção)

Dois gates PCI.4 implementados em `backend/src/kloel/pulse-gates/`:

| Gate | Modo | Interface | Cobertura |
|---|---|---|---|
| `disclosure-engine` | `hard_fail` | `DisclosureEngineInput` (recommendationId, isKloelAffiliate, commercialRelationship, disclosureStatement) | 6 violações: hidden affiliation, too-short disclosure, missing commercialRelationship, undisclosed commercial tie, non-public relationship, stale disclosure |
| `platform-bias-monitor` | `log_only` | `PlatformBiasMonitorInput` (RecommendationEntry[], thresholds) | 3 detecções: Welch t-test de diferença de peso internal vs external, quality-adjusted bias detection, disclosure violations |

**Classificação**: Esses gates são funções puras (state → verdict). Ambos estão implementados com rigor estatístico (t-test de duas caudas, CDF normal, correção de Welch-Satterthwaite). O `disclosure-engine` já está em `hard_fail`. O `platform-bias-monitor` ainda está em `log_only` — corretamente, porque não há volume de produção para calibrar thresholds.

### A2. Serviços INCENT (UTP-INCENT-001 a 008 — 100% implementados como pure-logic)

Todos os 8 serviços da família INCENT existem em `backend/src/kloel/incent/`:

| ID | Serviço | O que faz | Entrada | Saída |
|---|---|---|---|---|
| INCENT-001 | `RecommendationExplainerService` | Gera explicação "porque isso, para você" com tom/formato adaptável | `ExplainInput` (reason, evidence, tone, format) | `RecommendationExplanation` |
| INCENT-002 | `ConflictDetectorService` | Detecta 7 tipos de conflito com severidade | `ConflictInput` (ownership, commission, exclusive, platform_pref, data_leverage, self_dealing) | `ConflictDetection` (kind + severity + evidence) |
| INCENT-003 | `ConflictSilenceEnforcerService` | Silencia recomendação sob conflito com TTL 72h | `SilenceInput` (conflict, bias, disclosure, userOverride) | `SilenceUnderConflict` |
| INCENT-004 | `PlatformBiasMonitorService` | Audita delta internalRevenueWeight vs fairWeight | `BiasAuditInput` (revenueWeight, userRelevance, objectiveQuality, competitiveLandscape, userHistory, thirdPartyRating) | `PlatformBias` (biasDetected, level, weightDelta, mitigationApplied) |
| INCENT-005 | `DisclosureEngineService` | Emite disclosure automático com texto canônico "Transparência Kloel:" | `DisclosureInput` (relationshipType, compensation) | `Disclosure` |
| INCENT-006 | `ThirdPartyAuditExportService` | Constrói bundle de auditoria exportável por período | `AuditExportInput` (period, recommendations, explanations, conflicts, silences, bias, disclosures, feedback, attributions) | `ThirdPartyAuditExport` (+ integrityScore, compareAudits) |
| INCENT-007 | `UserFeedbackCorrectionService` | Processa correção do usuário e extrai sinal de aprendizado | `FeedbackInput` (kind: corrected/declined/modified/alternative_chosen/inaccurate) | `UserFeedbackCorrection` |
| INCENT-008 | `RecommendationAttributionBuilderService` | Constrói atribuição de fonte por recomendação com score de transparência | `AttributionInput` (sources com kind/evidenceRef/weight) | `RecommendationAttribution` (+ transparencyReport, crossRecommendations) |

**Classificação**: Todos os 8 serviços estão completos, injetáveis via NestJS, puramente lógicos (zero dependência externa: sem Prisma, sem HTTP, sem Redis). O tipo de dados `ThirdPartyAuditExport` contém toda a superfície de auditoria.

### A3. Conflict Detector de Ecossistema (Camada XXVII)

`backend/src/kloel/ecosys/conflict.detector.ts` (UTP-ECOSYS-008):
- Detecta self-deal (mesmo owner), workspace overlap, opt-out de ecossistema, internal revenue bias > 50%
- Precede INCENT-002 e cobre uma classe específica de conflito cross-role
- **Não está integrado com INCENT-002** — são silos independentes

### A4. Registro do Módulo

`IncentModule` está importado em `app.module.ts:320` com o comentário "🤝 Camada XXXIV — Incentive Integrity". O módulo expõe todos os 8 serviços. Nenhum outro módulo importa `IncentModule` atualmente — ou seja, os serviços estão disponíveis no DI container mas nenhum orquestrador os consome em fluxo de produção.

### A5. O Que NÃO Existe na Taxonomia de Eventos

O `brain-event-taxonomy.ts` (200 eventos) **não contém nenhum evento do domínio `incentive.*`**. Os eventos definidos no PCI.1 (§417) — `recommendation_explained`, `conflict_detected`, `silence_chosen`, `disclosure_emitted`, `user_feedback_correcting` — não foram implementados. Nenhum serviço INCENT emite eventos no spine.

---

## (b) O Que Falta Para Recomendação Cruzada com Explicação Automática

### Gap 1: Orquestrador de Pipeline de Recomendação

Não existe um serviço que execute o pipeline completo:

```
Input: recommendation_item → 
  1. ConflictDetector.detect()        → se structural → silêncio
  2. PlatformBiasMonitor.audit()      → se bias extremo → correção de peso
  3. DisclosureEngine.disclose()      → se vínculo comercial → disclosure
  4. ConflictSilenceEnforcer.enforce() → decisão final: emitir ou silenciar
  5. RecommendationExplainer.explain() → se emitir → explicação
  6. RecommendationAttributionBuilder.build() → se emitir → atribuição
  7. UserFeedbackCorrection.record()   → se usuário reage → aprendizado
Output: recommendation_verdict (emit/silence) + explanation + disclosure + attribution + audit_trail
```

Cada serviço funciona em isolamento, mas não há `RecommendationOrchestratorService` ou `IncentiveIntegrityPipeline` que os encadeie. O consumidor precisa chamar cada um manualmente.

### Gap 2: Emissão de Eventos no Spine

Nenhum serviço INCENT emite eventos no spine. Para o organismo cognitivo funcionar (B4, B17), cada decisão deve emitir eventos. O PCI.1 define os eventos canônicos, mas estes não estão em `brain-event-taxonomy.ts` nem são emitidos por nenhum serviço.

### Gap 3: Integração com o Fluxo de Recomendação Real

Os serviços INCENT recebem dados tipados (`ExplainInput`, `ConflictInput`, etc.) mas não há:
- Adaptador que traduza uma recomendação do `ecosys` ou `cross-role` para os inputs do INCENT
- Ponto de chamada no `commercial-decision-orchestrator` ou `unified-agent-actions`
- Feature flag "incentive-integrity" para ativar em produção

### Gap 4: Persistência e Período

O `ThirdPartyAuditExportService` constrói o objeto de auditoria em memória, mas:
- Nenhum serviço persiste o `ThirdPartyAuditExport` (não grava em banco nem arquivo)
- Nenhum scheduler gera snapshots periódicos (diário/semanal)
- Nenhum endpoint REST expõe o export para download

### Gap 5: Ciclo de Feedback Fechado

O `UserFeedbackCorrectionService` extrai `learnedSignal`, mas:
- Não há onde armazenar o sinal aprendido
- O sinal não realimenta o `PlatformBiasMonitorService` (fairWeight não é ajustado)
- O sinal não realimenta o `ConflictDetectorService` (severidade não é recalibrada)

### Gap 6: Assinatura Criptográfica de Auditoria

Para "auditoria externa possível" (B0.18), o export precisa ser:
- Hash-encadeado (cada export referencia o hash do anterior)
- Assinável (HMAC ou chave assimétrica)
- Verificável por terceiro sem acesso ao banco

Nada disso existe.

---

## (c) Evento Canônico do PCI Que Deveria Ser Emitido em Cada Decisão

Seguindo PCI.1 §417 (domínio `incentive.*`), cada pipeline de recomendação deve emitir:

| Momento da Decisão | Evento PCI.1 | Campos Obrigatórios Específicos | Serviço Responsável |
|---|---|---|---|
| Explicação gerada | `incentive.recommendation_explained` | recommendationId, explanationText, confidenceScore, tone, evidenceRefs | RecommendationExplainerService |
| Conflito detectado | `incentive.conflict_detected` | recommendationId, conflictKind, severity, affectedParties, evidence | ConflictDetectorService |
| Recomendação silenciada | `incentive.silence_chosen` | recommendationId, reason (SilenceRule), conflictRef, expirationAt | ConflictSilenceEnforcerService |
| Disclosure emitido | `incentive.disclosure_emitted` | recommendationId, relationshipType, financialNature, disclosureText | DisclosureEngineService |
| Viés detectado | `incentive.platform_bias_detected` | recommendationId, biasSource, biasLevel, weightDelta, mitigationApplied | PlatformBiasMonitorService |
| Feedback do usuário | `incentive.user_feedback_correcting` | recommendationId, feedbackKind, originalRecommendation, userCorrection, learnedSignal | UserFeedbackCorrectionService |
| Atribuição construída | `incentive.recommendation_attributed` | recommendationId, primarySource, transparencyScore, crossSourceCount | RecommendationAttributionBuilderService |

**Convenção universal desejada**: todo evento `incentive.*` deve carregar `truthMode: 'observed'` (porque a decisão de recomendar/silenciar é um fato ocorrido no sistema), `valence` apropriada (`positive` para disclosure/explicação, `negative` para conflito estrutural detectado, `neutral` para atribuição), e `provenance.source: 'production'` quando emitido em fluxo real.

### Estado atual: zero emissão de eventos `incentive.*` no spine.

---

## (d) Interface Auditável Externa (CSV/JSON Exportável)

### D1. O Que Já Existe (estrutura de dados)

`ThirdPartyAuditExport` (definido em `incent/types.ts:119-134`) contém o bundle completo:

```
ThirdPartyAuditExport {
  workspaceId, auditId, generatedAt, periodStart, periodEnd,
  recommendations: AuditRecommendation[],
  explanations: RecommendationExplanation[],
  conflicts: ConflictDetection[],
  silenceEvents: SilenceUnderConflict[],
  biasReports: PlatformBias[],
  disclosures: Disclosure[],
  feedbackCorrections: UserFeedbackCorrection[],
  attributions: RecommendationAttribution[],
  summary: AuditSummary {
    totalRecommendations, conflictsDetected, silenceEvents,
    biasAlerts, disclosuresIssued, feedbackCorrectionsApplied,
    healthyRecommendationRate
  }
}
```

### D2. O Que Falta Para o Export Ser Real

| Necessidade | Status | Ação |
|---|---|---|
| `toJSON()` com schema versionado | Inexistente | Adicionar campo `schemaVersion` + serialização com `replacer` que preserva `readonly` |
| `toCSV()` normalizado (uma linha por recomendação com todas as colunas de auditoria) | Inexistente | Criar `toFlatCSV()` que desnormaliza o objeto aninhado |
| Endpoint REST (`GET /audit/:workspaceId/export?from=&to=`) | Inexistente | Criar controller auditável com autenticação de workspace |
| Assinatura HMAC-SHA256 do payload | Inexistente | Adicionar campo `auditHash` verificável por terceiro |
| Hash-encadeamento entre exports consecutivos | Inexistente | Cada export referencia `previousAuditHash` |
| Snapshot automático semanal | Inexistente | BullMQ job que chama `ThirdPartyAuditExportService.export()` com dados acumulados |
| Formato "auditor-externo" com zero dependência de banco | Inexistente | O export deve ser autocontido (todos os dados inline, sem foreign keys) |
| Verificação de integridade offline | Inexistente | Script standalone que recebe o JSON e verifica hash + consistência |

### D3. Especificação da Interface Ideal

```typescript
interface ExternalAuditFile {
  readonly formatVersion: 1;
  readonly auditId: string;
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly previousAuditHash?: string;
  readonly payload: ThirdPartyAuditExport;
}

// serializado como external-audit-{workspaceId}-{auditId}.json
// com hash SHA-256 do conteúdo canônico (JSON.stringify com sorted keys)
```

---

## (e) 5 Cenários Concretos de Conflito de Incentivo no Kloel Real

Cada cenário descreve um caso onde o Kloel (plataforma) recomenda um recurso próprio vs um equivalente externo, e o que o R38 deveria fazer.

### Cenário 1: "Kloel CRM" vs CRM Externo (Pipedrive/HubSpot)

**Contexto**: O Kloel possui um CRM nativo integrado ao WhatsApp. Um lead pergunta "qual CRM devo usar para gerenciar meus leads?"

**Conflito**: O Kloel tem incentivo financeiro para recomendar o CRM próprio (zero custo de integração para a plataforma, lock-in do cliente, upsell de features premium). Um CRM externo como Pipedrive pode ser objetivamente melhor para o caso específico (ex: o lead já usa Pipedrive, tem 50 usuários, precisa de relatórios avançados que o Kloel CRM não tem).

**O que R38 deveria fazer**:
1. `ConflictDetectorService` detecta `self_dealing` (severidade: `structural`)
2. `PlatformBiasMonitorService` detecta delta entre peso que a plataforma daria (internalRevenueWeight=0.6) vs peso justo (userRelevance=0.2, objectiveQuality=0.3) → delta > 0.25 → `level: high`
3. `DisclosureEngineService` emite: "Transparência Kloel: Relação: ownership. A Kloel possui participação societária nesta empresa."
4. `ConflictSilenceEnforcerService` decide: **não recomendar nenhum**. Em vez disso: "Não posso recomendar um CRM específico porque a Kloel também oferece um. Aqui estão os critérios objetivos para você decidir: [critérios]. Se quiser, posso te mostrar as integrações disponíveis com ambos."

### Cenário 2: "Kloel Payment" (Mercado Pago nativo) vs Stripe/PayPal Externo

**Contexto**: O Kloel integra nativamente Mercado Pago (MP) para processar pagamentos no Brasil e América Latina. Um seller pergunta "qual gateway de pagamento devo usar?"

**Conflito**: O Kloel recebe comissão sobre transações processadas via MP (taxa de intermediação embutida no repasse). Stripe pode ser mais barato em alguns casos (menor taxa para cartão internacional, melhor conversão em USD). A recomendação automática sempre favorece MP porque `internalRevenueWeight` é alto.

**O que R38 deveria fazer**:
1. `ConflictDetectorService` detecta `commission_bias` (severidade: `actual`)
2. `PlatformBiasMonitorService` calcula fairWeight usando competitiveLandscape e objectiveQuality → identifica viés
3. `DisclosureEngineService` emite: "Transparência Kloel: Relação: commission. A Kloel pode receber comissão por esta recomendação. Modelo de compensação: taxa de intermediação."
4. `RecommendationExplainerService` explica: "Por transparência: Mercado Pago oferece a menor fricção de integração no Kloel (checkout nativo, split de comissão automático). Stripe pode oferecer taxas melhores para vendas internacionais. Sua escolha depende de: % de vendas internacionais, ticket médio, necessidade de split."

### Cenário 3: "Kloel Agency" como Afiliado vs Afiliado Externo

**Contexto**: Um produtor quer recrutar afiliados para seu produto. O Kloel tem um marketplace interno de afiliados (comissão sobre match). Um afiliado externo (que o produtor já conhece, com audiência grande e comprovada) também está disponível.

**Conflito**: Se o Kloel recomendar SEMPRE o marketplace interno (porque gera receita de plataforma), o produtor perde a oportunidade de trabalhar com um afiliado externo de alta performance. `exclusive_partnership` implícito.

**O que R38 deveria fazer**:
1. `ConflictDetectorService` detecta `exclusive_partnership` (severidade: `actual`) e `platform_preference` (severidade: `potential`)
2. `DisclosureEngineService` emite: "Transparência Kloel: Relação: marketplace. Esta recomendação envolve o marketplace da Kloel."
3. `RecommendationAttributionBuilderService` marca como `isCrossRecommendation: true` e atribui fontes (platform_data + peer_behavior + third_party_data)
4. `RecommendationExplainerService` explica com ambas as opções lado a lado, com atribuição de fonte para cada

### Cenário 4: "Kloel Ads Manager" vs Meta Ads Direto

**Contexto**: O Kloel oferece um gerenciador de anúncios integrado (Kloel Ads Manager) que compra mídia no Meta Ads com markup da plataforma. Um cliente pergunta "devo anunciar pelo Kloel ou direto no Meta?"

**Conflito**: O Kloel Ads Manager gera receita via markup/spread sobre o custo de mídia. Anunciar direto no Meta pode ser 15-20% mais barato. O Kloel tem `data_leverage` (sabe quais campanhas performam, tem dados de conversão cross-workspace).

**O que R38 deveria fazer**:
1. `ConflictDetectorService` detecta `data_leverage` (severidade: `potential`) + `financial_interest` (severidade: `actual`)
2. `PlatformBiasMonitorService` detecta `internal_revenue` + `platform_lock_in`
3. `DisclosureEngineService` emite: "Transparência Kloel: Relação: ownership. A Kloel possui participação societária nesta empresa. Modelo de compensação: markup sobre custo de mídia."
4. `ConflictSilenceEnforcerService`: se o delta de peso for extremo (>0.4), silencia a recomendação
5. Se emitir, `RecommendationExplainerService` explica com tabela comparativa: custo, features, autonomia, suporte

### Cenário 5: "Kloel Course Platform" vs Hotmart/Kiwifi

**Contexto**: Um creator quer vender um curso online. O Kloel oferece Member Area nativa. Hotmart e Kiwifi são plataformas externas concorrentes com ecossistema de afiliados estabelecido.

**Conflito**: `cross_ownership` se o Kloel tiver participação ou acordo de exclusividade com alguma plataforma. `platform_lock_in` se a recomendação empurrar o Member Area porque prende o creator no ecossistema Kloel.

**O que R38 deveria fazer**:
1. `ConflictDetectorService` avalia: o creator tem audiência própria? Precisa de afiliados externos? Precisa de checkout em múltiplas moedas?
2. Se o Member Area Kloel não atende (ex: precisa de checkout em USD, precisa de marketplace de afiliados externo), o sistema NÃO deve recomendar o Member Area mesmo sendo produto próprio — seria `self_dealing`
3. `RecommendationAttributionBuilderService` constrói atribuição com market_trend + user_history + peer_behavior
4. `UserFeedbackCorrectionService` registra se o creator discordar: "alternative_chosen: escolhi Hotmart porque tem checkout em USD"

---

## (f) 5 Recomendações Priorizadas para Subir R38 de N1 para N3+

N1 = serviços pure-logic existem isolados.
N3+ = pipeline integrado, eventos no spine, auditoria exportável, ciclo de feedback fechado, gate em hard_fail.

### Recomendação 1 — Criar `IncentiveIntegrityPipeline` (orquestrador)

**Prioridade**: P0 (bloqueia tudo abaixo).

**O que é**: Um serviço NestJS que recebe uma recomendação candidata e executa o pipeline completo em ordem (conflict → bias → disclosure → silence → explain → attribute), retornando um veredito unificado.

**Contrato de entrada**: `IncentivePipelineInput { recommendation, userContext, workspaceId, roleContext }`.

**Contrato de saída**: `IncentivePipelineVerdict { emit: boolean, recommendation?, explanation?, disclosure?, attribution?, silenceReason? }`.

**Impacto em R38**: Conecta todos os 8 serviços em um fluxo real. Sem isso, R38 é teórico.

**Complexidade**: Média (1 serviço novo, 80% de reuso dos serviços existentes).

**Critério de aceitação**: Dado um `ConflictInput` com `self_dealing`, o pipeline retorna `emit: false, silenceReason: 'structural_conflict'`. Dado um input sem conflito mas com comissão, retorna `emit: true` com `disclosure` e `explanation` populados.

---

### Recomendação 2 — Adicionar Eventos `incentive.*` ao Spine e Emiti-los

**Prioridade**: P0 (B4 — persistência por evento obrigatória).

**O que é**: Adicionar ao `brain-event-taxonomy.ts` a família `incentive.*` conforme PCI.1 §417. Cada serviço da camada INCENT emite seu evento correspondente via `SpineEmitterService` (que já existe em `spine/spine-emitter.service.ts`).

**Eventos a adicionar**:
- `incentive.recommendation_explained`
- `incentive.conflict_detected`
- `incentive.silence_chosen`
- `incentive.disclosure_emitted`
- `incentive.platform_bias_detected`
- `incentive.user_feedback_correcting`
- `incentive.recommendation_attributed`
- `incentive.pipeline_verdict` (evento terminal do pipeline: emit/silence)

**Impacto em R38**: Torna toda decisão de recomendação rastreável no spine. Permite auditoria, replay, consolidação e o ciclo Hebbiano (B6).

**Complexidade**: Média (modificação da taxonomia + injeção de `SpineEmitterService` nos 8 serviços INCENT).

**Critério de aceitação**: Após executar o pipeline de recomendação, `spineEventStore` contém pelo menos 1 evento `incentive.*` com `truthMode: 'observed'` e campos obrigatórios preenchidos.

---

### Recomendação 3 — Implementar `ThirdPartyAuditController` com Export Assinado

**Prioridade**: P1 (B0.18 — auditoria externa possível).

**O que é**: Um controller REST (`GET /kloel/audit/:workspaceId/incentive?from=&to=`) que:
1. Consulta eventos `incentive.*` do spine no período
2. Constrói `ThirdPartyAuditExport` via `ThirdPartyAuditExportService.export()`
3. Serializa com schema versionado (`formatVersion`, `auditHash`)
4. Calcula SHA-256 do payload canônico (sorted keys)
5. Retorna JSON + header `X-Audit-Hash: sha256:...`
6. Suporta formato CSV via header `Accept: text/csv`

**Adicional**: Job BullMQ semanal que gera snapshot automático e persiste em `AuditSnapshot` (tabela Prisma).

**Impacto em R38**: Torna a auditoria externa operacional. Um terceiro pode baixar o JSON, verificar o hash e validar a integridade sem acesso ao banco.

**Complexidade**: Média (controller + job + tabela Prisma + serialização CSV).

**Critério de aceitação**: `curl /audit/:ws/incentive | jq .summary.healthyRecommendationRate` retorna número entre 0 e 1. `X-Audit-Hash` é verificável offline com `echo $payload | sha256sum`.

---

### Recomendação 4 — Fechar o Ciclo de Feedback (UserFeedback → Bias Recalibration)

**Prioridade**: P1 (B0.8 — loop fechado: hipótese → observação → atualização de crença).

**O que é**: Conectar o `UserFeedbackCorrectionService` ao `PlatformBiasMonitorService` e ao `ConflictDetectorService` de forma que:
1. Feedback "inaccurate" em recomendação de produto próprio → reduz `internalRevenueWeight` para aquele workspace
2. Feedback "alternative_chosen" com fonte externa → aumenta `competitiveLandscape` no fairWeight
3. Padrão de múltiplos feedbacks negativos sobre produto próprio → `ConflictDetectorService` eleva severidade de `potential` para `actual`

**Mecanismo**: `FeedbackAggregatorService` que lê eventos `incentive.user_feedback_correcting` do spine, calcula média móvel de 30 dias por produto/fonte, e ajusta pesos no `BiasAuditInput` do próximo ciclo.

**Impacto em R38**: Transforma o sistema de estático (thresholds fixos) para adaptativo (aprende com correções reais do usuário).

**Complexidade**: Média (1 novo serviço + 2 modificações).

**Critério de aceitação**: Após 5 feedbacks "inaccurate" sobre produto próprio, o `PlatformBiasMonitorService` retorna `weightDelta` reduzido em ≥20%.

---

### Recomendação 5 — Promover `platform-bias-monitor` Gate de `log_only` para `hard_fail`

**Prioridade**: P2 (depende das recomendações 1-4 estarem operacionais com dados reais).

**O que é**: Após N ciclos (sugestão: 4 semanas) com dados de produção:
1. Calibrar `significanceThreshold` (default 0.05) com dados reais de distribuição de peso
2. Ajustar `weightMarginThreshold` (default 0.2) baseado em desvio padrão observado
3. Adicionar contra-prova: se o produto externo é objetivamente pior E o Kloel recomenda o externo mesmo assim, o gate não deve falhar (caso de "over-correction")
4. Mudar modo do gate para `hard_fail` via config por workspace (rollout progressivo)

**Impacto em R38**: O gate `hard_fail` bloqueia a emissão de recomendação com viés sistemático. Isso é o "zero viés sistemático auditável externamente" do R38.

**Complexidade**: Baixa (mudança de configuração + calibração com dados).

**Critério de aceitação**: Com 100 recomendações de produção, o gate `platform-bias-monitor` em `hard_fail` reporta ≤ 2% falsos positivos (viés detectado quando não há viés real) e ≥ 95% verdadeiros positivos.

---

## Tabela-Resumo: O Que Sobe de N1 para N3+

| Dimensão | N1 (hoje) | N3+ (após 5 recomendações) |
|---|---|---|
| Serviços pure-logic | 8/8 implementados, isolados | 8/8 integrados via pipeline |
| Pipeline de recomendação | Não existe | `IncentiveIntegrityPipeline` operacional |
| Eventos `incentive.*` no spine | Zero | 8 eventos emitidos por decisão |
| Gate `disclosure-engine` | `hard_fail` | `hard_fail` (mantido) |
| Gate `platform-bias-monitor` | `log_only` | `hard_fail` calibrado |
| Auditoria externa | Objeto em memória (não exportável) | Endpoint REST + CSV/JSON + hash assinado |
| Ciclo de feedback | Feedback registrado, sinal ignorado | Feedback recalibra pesos de bias |
| Explicação automática | Serviço existe, não é chamado | Toda recomendação emitida tem explicação |
| Silêncio sob conflito | Serviço existe, não é chamado | Conflito estrutural → silêncio automático |
| Integração com `ecosys` | Silos independentes | Pipeline unificado consome ConflictDetector de ambos |
| Métrica R38 | 0% (não operacional) | ≥95% explicação, zero viés sistemático, export assinado disponível |

---

## Notas Adicionais

### Status do PCI.1 (taxonomia de eventos `incentive.*`)

O PCI.1 (§417) define os eventos canônicos, mas a implementação (`brain-event-taxonomy.ts`) não os contém. Adicioná-los **não** é mudança de governance — é implementação de contrato já definido. A lista canônica do PCI.1 é autoridade; o `brain-event-taxonomy.ts` é implementação.

### Relação com Camada XXVII (ECOSYS)

O R38 refina o R31 (Ecosystem Intelligence). A família INCENT (Onda 9) depende conceitualmente de ECOSYS (Onda 8). Na prática, o `ecosys/conflict.detector.ts` e o `incent/conflict-detector.service.ts` detectam classes diferentes de conflito (cross-role vs recomendação individual) e precisam ser unificados no pipeline. Isso é parte da Recomendação 1.

### Relação com B0.18 (Integridade de Incentivo)

A B-rule define 5 obrigações. Status de cada:

| Obrigação B0.18 | Status | Coberta por |
|---|---|---|
| "Recomendação cruzada otimiza para o usuário no seu papel, não para a plataforma" | Estrutura existe, não operacional | Recomendação 1 |
| "Explicabilidade obrigatória" | Serviço existe, não chamado | Recomendação 1 |
| "Silêncio sob conflito" | Serviço existe, não chamado | Recomendação 1 |
| "Disclosure quando há vínculo comercial" | Serviço existe + gate `hard_fail` | Parcialmente operacional |
| "Auditoria externa possível" | Dados estruturados, sem export | Recomendação 3 |

### Risco de Regressão

Nenhuma das 5 recomendações altera contratos HTTP existentes, frontend, ou arquivos protegidos. Todas são aditivas ao módulo `backend/src/kloel/incent/` e ao spine. A superfície de governance não é tocada.

---

## Conclusão

O esqueleto do R38 está construído: 8 serviços pure-logic, 2 gates PULSE, tipos de dados completos, módulo NestJS registrado. O que falta é a **camada de integração**: o orquestrador que encadeia os serviços, a emissão de eventos no spine que torna as decisões rastreáveis, e a interface de export que materializa a "auditoria externa possível" da B0.18. As 5 recomendações acima transformam R38 de uma capacidade teórica (N1) em uma capacidade operacional auditável (N3+), sem tocar em governance, sem regredir contratos, e sem introduzir dependências externas novas.
