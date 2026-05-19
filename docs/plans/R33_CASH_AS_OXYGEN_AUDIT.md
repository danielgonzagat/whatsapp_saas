# R33 — Cash as Oxygen: Autopsy Audit

> **Date**: 2026-05-14
> **Scope**: Camada XXIX (Cash as Oxygen) — B0.13, R33
> **Method**: Static analysis of `backend/src/kloel/cash/`, cross-referenced with spine events, payment infrastructure, module wiring, and the Cognitive Organism Plan canônico.
> **Constraint**: No code edited. No file protected touched. Report only.

---

## 1. Executive Summary

O módulo `cash/` (**R33**) existe como implementação puramente lógica (8 serviços NestJS + spec de 569 linhas). Todos os algoritmos de tracker, projector, runway, risco, volatilidade e blocker estão implementados e testados. **O módulo está wireado no `app.module.ts` e compila.** No entanto, o módulo opera em vácuo funcional absoluto — sem alimentação de dados reais, sem persistência, sem emissão de eventos no spine, sem consumidor de eventos Stripe/spine, sem API, sem background worker, e sem integração com qualquer operação de negócio (checkout, refund, ad-spend).

**Diagnóstico**: R33 está em **N1 (estrutura existente)**. A implementação lógica é sadia. O gap é 100% de integração: os 8 serviços fazem conta certa com zero dado real entrando.

---

## 2. What Exists (a)

### 2.1 Estrutura do módulo

| Arquivo | Linhas | Função | Status |
|---|---|---|---|
| `types.ts` | 172 | Sistema de tipos completo (CashEntry, CashPosition, ReceivablesProjection, PayablesProjection, RunwayCalculation, RiskDetection, VolatilityTracking, ProtectiveAction, UnsafeOperationBlock, funções utilitárias) | **Completo** |
| `cash-position.tracker.ts` | 100 | CASH-001: tracker de posição em janelas 7/14/30d, tendências, projeção 30d | **Completo** |
| `receivables.projector.ts` | 55 | CASH-002: projetor de recebíveis com confiança ponderada | **Completo** |
| `payables.projector.ts` | 59 | CASH-003: projetor de pagáveis (valores absolutos) | **Completo** |
| `runway.calculator.ts` | 61 | CASH-004: calculadora de runway (dias, burn rate, margem de segurança) | **Completo** |
| `risk.detector.ts` | 151 | CASH-005: detector de risco multidimensional (runway, trend, volatility, coverage) | **Completo** |
| `volatility.tracker.ts` | 90 | CASH-006: tracker de volatilidade (diária/semanal/mensal, tendência) | **Completo** |
| `protective-action.suggester.ts` | 96 | CASH-007: sugestor de ações protetivas com priorização | **Completo** |
| `unsafe-operation.blocker.ts` | 98 | CASH-008: bloqueador de operações inseguras (saldo, runway, risco, buffer) | **Completo** |
| `cash.module.ts` | 44 | Módulo NestJS registrando e exportando os 8 serviços | **Completo** |
| `cash.spec.ts` | 569 | Testes unitários para todos os 8 serviços + funções utilitárias | **Completo** |
| **Total** | **1606** | | |

### 2.2 Cobertura de capacidades declaradas no Plano

| Capacidade do Plano (Camada XXIX) | Serviço existente | Implementada? |
|---|---|---|
| Tracker de posição em janelas 7/14/30 dias | `CashPositionTracker` | Sim |
| Projetor de recebíveis | `ReceivablesProjector` | Sim |
| Projetor de pagáveis | `PayablesProjector` | Sim |
| Calculadora de runway | `RunwayCalculator` | Sim |
| Detector de risco precoce | `RiskDetector` | Sim |
| Tracker de volatilidade | `VolatilityTracker` | Sim |
| Sugestor de ação protetiva | `ProtectiveActionSuggester` | Sim |
| Bloqueador de operação que aumenta risco | `UnsafeOperationBlocker` | Sim |

**Veredito**: 8/8 capacidades declaradas têm implementação lógica correspondente. A superfície de código é completa na camada de algoritmo.

### 2.3 Wiring no sistema

- `cash.module.ts` → `CashModule` → importado em `app.module.ts:98` e registrado em `app.module.ts:303` (comentário errado diz "Camada XXII", mas o wire é correto)
- **NÃO** está no `kloel.module.ts` (não precisa — está no app.module global)
- Nenhum serviço externo injeta ou chama qualquer classe de `cash/`

### 2.4 Duplicação parcial

Existem arquivos órfãos que parecem uma tentativa de bridge mas nunca foram integrados:

- `cash-position.tracker.service.ts` (90 linhas) — `CashPositionTrackerService` — opera em memória (Map), ouve `commerce.payment.approved` / `commerce.payment.refunded` diretamente, calcula posição e runway. **Não está registrado em módulo nenhum. Não é referenciado por nenhum outro arquivo.**
- `cash-position.types.ts` (21 linhas) — tipos auxiliares (`TrackedCashEvent`, `CashPositionSummary`, `RunwayResult`) usados apenas pelo serviço órfão acima.

---

## 3. What's Missing (b)

### 3.1 Tracker de posição em janelas 7/14/30 dias

- [ ] **Alimentação de dados real**: `CashPositionTracker.track()` recebe `CashEntry[]` como parâmetro. Nenhum código no sistema povoa esse array com dados de produção.
- [ ] **Persistência de posição**: O cálculo é efêmero. Não há tabela para armazenar `CashPosition` ao longo do tempo.
- [ ] **API de consulta**: Não há endpoint HTTP para consultar a posição atual ou histórica.

### 3.2 Projetor de recebíveis

- [ ] **Fonte de dados de recebíveis projetados**: `ReceivablesProjector.project()` espera `CashEntry[]` com `category: 'projected_receivable'`. Nenhum código cria essas entradas a partir de assinaturas recorrentes, invoices futuras, ou projeções de vendas.
- [ ] **Integração com subscription engine**: As assinaturas Stripe têm `current_period_end` e `next_payment` previsíveis. Nenhum código lê isso para gerar `projected_receivable`.
- [ ] **Confiança baseada em histórico real**: O `confidence` é calculado como média ponderada dos `CashEntry.confidence`. Mas `confidence` de cada entry é hardcoded (1.0 no spec). Deveria ser derivado de histórico real de taxa de renovação, churn, e falha de pagamento.

### 3.3 Calculadora de runway

- [ ] **Burn rate real**: `RunwayCalculator` deriva burn rate de `payables.dueNext30d - receivables.dueNext30d`. Mas payables projetados nunca são populados com dados reais (custos operacionais, folha, infra, ads).
- [ ] **Múltiplos cenários**: A calculadora opera em cenário único. Para R33 ser útil, precisa de cenários pessimista/base/otimista.
- [ ] **Alerta automático**: O cálculo de runway não dispara nenhum alerta quando < 30 dias ou < 14 dias.

### 3.4 Infraestrutura compartilhada faltante

- [ ] **CashEntryRepository (Prisma)**: Tabela para persistir `CashEntry`, permitindo replay histórico e consulta por workspace.
- [ ] **CashPositionHistory (Prisma)**: Tabela time-series para snapshots diários de `CashPosition`.
- [ ] **CashBackgroundJob (BullMQ)**: Job recorrente (6h/12h/24h) que recalcula posição, risco, runway e emite eventos.
- [ ] **CashController (HTTP)**: Endpoints GET `/workspace/:id/cash/position`, `/workspace/:id/cash/runway`, `/workspace/:id/cash/risk`.
- [ ] **Eventos spine do próprio módulo**: `cash.position_computed`, `cash.risk_detected`, `cash.operation_blocked`, `cash.runway_critical`.

---

## 4. Integration with Stripe Events (c)

### 4.1 Eventos Stripe/spine já emitidos

O `CheckoutEventEmitterService` (`backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts`) emite:

| Evento Spine | Emitido por | valence | payload relevante |
|---|---|---|---|
| `commerce.payment.initiated` | `paymentInitiated()` | — | orderId, paymentIntentId, paymentMethod, amountInCents |
| `commerce.payment.approved` | `paymentApproved()` | positive | orderId, paymentIntentId, amountInCents |
| `commerce.payment.declined` | `paymentDeclined()` | negative | orderId, paymentIntentId, reason |
| `commerce.payment.refunded` | `paymentRefunded()` | negative | orderId, paymentIntentId, refundId, amountInCents |
| `commerce.payment.charged_back` | `paymentChargedBack()` | negative | orderId, paymentIntentId, disputeId, amountInCents |

### 4.2 Consumidores existentes desses eventos

| Módulo | O que faz com os eventos |
|---|---|
| `healthy-money/revenue-quality.scorer.ts` | Conta approved/refunded/charged_back para score de qualidade de receita |
| `goal-field/detectors/financial.detectors.ts` | Detecta pagamento sem marginPct, churn sem retenção, desconto sem justificativa |
| `commem/narrative.builder.ts` | Constrói narrativa de valor |
| `offer/detectors/*` | Analisa pricing psychology, bonus desirability, etc. |

### 4.3 O que falta para o Cash Module consumir esses eventos

- [ ] **CashEventConsumer**: Um listener no spine (ou subscriber BullMQ) que escuta `commerce.payment.approved` e cria `CashEntry(category: 'actual', amountCents: +value, confidence: 1.0)`.
- [ ] **CashRefundConsumer**: Listener para `commerce.payment.refunded` e `commerce.payment.charged_back` que cria `CashEntry(category: 'actual', amountCents: -value, confidence: 1.0)`.
- [ ] **RecurringReceivableProjector**: Job que lê assinaturas ativas (Prisma) e projeta `CashEntry(category: 'projected_receivable', amountCents: +value, confidence: baseadoEmHistoricoReal)` para os próximos 30 dias.
- [ ] **OperationalPayablesEstimator**: Job que estima custos operacionais recorrentes e cria `CashEntry(category: 'projected_payable')`.
- [ ] **ReconciliationJob**: Job que reconcilia o saldo derivado de CashEntries com o saldo real da carteira/ledger, detectando drift.

---

## 5. Early Risk Scenarios (d)

### Cenário 1 — Runway shrinking silently
**Contexto**: Empresa com runway de 180 dias. Gastos operacionais aumentam 15% ao mês sem que ninguém perceba.
**Falha atual**: O `RunwayCalculator` calcularia o declínio, mas ninguém o chama. O `RiskDetector` não é invocado. Nenhum alerta.
**Impacto**: 180d → 60d → 30d → 14d sem notificação. Descoberto apenas quando o saldo real zera.

### Cenário 2 — Refund cascade undetected
**Contexto**: Bug em gateway de pagamento causa 15 refunds em 3 dias para o mesmo workspace.
**Falha atual**: `commerce.payment.refunded` é emitido pelo CheckoutEventEmitter, mas o módulo cash não escuta. A posição de caixa não é recalculada. O `RiskDetector` nunca vê esses eventos.
**Impacto**: Saldo real cai 30%. Cash module reportaria saldo inalterado se consultado.

### Cenário 3 — Unsafe operation passes silently
**Contexto**: Workspace em risco crítico (runway 10d) tenta fazer um ad spend de $500 via ferramenta de campanha.
**Falha atual**: `UnsafeOperationBlocker.block()` bloquearia a operação, mas nenhum código de checkout ou ad-spend chama este método. A operação passa sem verificação.
**Impacto**: $500 gastos quando runway era de 10 dias. Sobrevivência cai para 5 dias.

### Cenário 4 — Volatility spike from fraud undetected
**Contexto**: Onda de chargebacks por fraude. 8 chargebacks em 48h.
**Falha atual**: `commerce.payment.charged_back` é emitido mas não alimenta o módulo cash. `VolatilityTracker` nunca detecta o spike.
**Impacto**: Além do prejuízo financeiro, o padrão de fraude passa despercebido. Taxa de disputa sobe sem contramedida.

### Cenário 5 — Subscription churn invisível ao modelo de caixa
**Contexto**: 30% das assinaturas semanais falham renovação por cartão expirado. Receita projetada para os próximos 14 dias está 30% superestimada.
**Falha atual**: `ReceivablesProjector` não tem dados para projetar. Mesmo que tivesse, a confiança seria 1.0 (não derivada de histórico real de renovação).
**Impacto**: Projeção de caixa falsamente otimista. Decisões de gasto baseadas em runway superestimado.

### Cenário 6 — Split-payment dust como passivo invisível
**Contexto**: Plataforma opera com Connect/split. Vendedor recebe 70%, plataforma 30%. Os 70% são passivo (não pertencem à plataforma), mas a conta Stripe mostra saldo bruto.
**Falha atual**: `PayablesProjector` nunca é alimentado com passivos de split. O `CashPosition` reportaria o saldo bruto como disponível.
**Impacto**: Plataforma gasta dinheiro que pertence ao vendedor. Passivo de split não honrado.

### Cenário 7 — Stripe webhook delivery gap
**Contexto**: Stripe webhook falha por 4 horas (downtime ou bug). 12 pagamentos aprovados não geram eventos `commerce.payment.approved`.
**Falha atual**: Nenhum mecanismo de reconciliação entre eventos spine e estado real do Stripe/Pagamento. O módulo cash não detectaria a lacuna.
**Impacto**: Posição de caixa subestimada por 4h. Nenhum alerta de gap de eventos.

---

## 6. Operations Blocker (e)

### 6.1 O que o UnsafeOperationBlocker faz (em teoria)

O `UnsafeOperationBlocker.block()` avalia 4 condições:

1. **Saldo insuficiente**: `currentBalance - amount < 0` → bloqueia `insufficient_balance`
2. **Runway crítico**: `runwayDays <= 14` → bloqueia TODAS as operações de gasto → `runway_critical`
3. **Risco crítico/alto**: `riskLevel ∈ {critical, high}` → bloqueia operações não-essenciais → `risk_critical`
4. **Buffer de segurança violado**: `currentBalance - amount < safetyBuffer` → bloqueia → `insufficient_balance`

### 6.2 Realidade operacional

**Nenhum fluxo de negócio chama `UnsafeOperationBlocker.block()`.**

| Operação de risco | Deveria ser bloqueada por | É bloqueada? |
|---|---|---|
| Checkout/charge via Stripe | `block('payment', amount, ...)` | **Não** |
| Ad-spend via campanhas | `block('ad_spend', amount, ...)` | **Não** |
| Refund manual ou automático | `block('refund', amount, ...)` | **Não** |
| Payout/transfer Connect | `block('payout', amount, ...)` | **Não** |
| Compra de crédito/infra | `block('infra', amount, ...)` | **Não** |

O `UnsafeOperationBlocker` é um guarda sem posto. A lógica existe, está testada, mas nenhuma operação que aumenta risco financeiro passa por ela.

### 6.3 O que um blocker funcional faria

- Em `runway_critical` (< 14 dias): **bloquearia todo novo gasto** exceto operações classificadas como `essential` (ex: custo de servidor, cobrança de assinatura ativa para evitar churn).
- Em `risk_critical`: **bloquearia ad-spend, payout para afiliados, desconto não-autorizado**, permitindo apenas operações de receita.
- Em `insufficient_balance`: **bloquearia a operação específica** com mensagem clara para o operador.
- Para cada bloqueio: **emitiria evento** `cash.operation_blocked` no spine e **notificaria** o owner do workspace.

---

## 7. Five Prioritized Recommendations (f)

### Recomendação 1 — CashEventConsumer: alimentar o módulo com dados reais
**Prioridade**: P0 (critical) — pré-requisito para tudo abaixo
**UTP sugerida**: `UTP-CASH-009`
**O que fazer**:
- Criar `CashEventConsumer` como provider NestJS que ouve eventos spine (`commerce.payment.approved`, `commerce.payment.refunded`, `commerce.payment.charged_back`)
- Para cada evento: criar `CashEntry` com `category: 'actual'`, `confidence: 1.0`, `source: 'stripe'`, persistir via Prisma
- Adicionar tabela `CashEntry` ao schema Prisma com migration
- Adicionar `CashEntryRepository` para CRUD com filtro por workspace + janela temporal
- Alimentar `CashPositionTracker`, `VolatilityTracker`, `ReceivablesProjector`, `PayablesProjector` com dados reais
**Evidência de sucesso**: Ao processar um pagamento real no checkout, o `CashPositionTracker.track()` retorna posição não-zero.

### Recomendação 2 — CashBackgroundJob + Persistência: pipeline contínuo de avaliação
**Prioridade**: P0 (critical) — sem job, os cálculos nunca rodam
**UTP sugerida**: `UTP-CASH-010`
**O que fazer**:
- Criar `CashBackgroundJob` como BullMQ processor (frequência: a cada 6h, configurável)
- Job pipeline: (1) carrega CashEntries do repositório → (2) calcula posição → (3) projeta recebíveis → (4) projeta pagáveis → (5) calcula runway → (6) detecta risco → (7) se risco > low, sugere ações protetivas
- Persistir `CashPosition`, `RunwayCalculation`, `RiskDetection` em tabelas time-series
- Emitir eventos spine: `cash.position_computed`, `cash.risk_detected` (quando risco > none), `cash.runway_critical` (quando runway < 30d)
- Adicionar migration para tabelas: `CashPositionSnapshot`, `CashRiskRecord`, `CashRunwayRecord`
**Evidência de sucesso**: Job roda e gera registros nas tabelas time-series. Eventos aparecem no spine.

### Recomendação 3 — CashController + Dashboard API: expor estado para consumo
**Prioridade**: P1 (high)
**UTP sugerida**: `UTP-CASH-011`
**O que fazer**:
- Criar `CashController` com endpoints REST:
  - `GET /workspace/:id/cash/position` → posição atual + histórico (30 snapshots)
  - `GET /workspace/:id/cash/runway` → runway atual + trajetória
  - `GET /workspace/:id/cash/risk` → risco atual + histórico de detecções
  - `GET /workspace/:id/cash/volatility` → volatilidade atual
  - `GET /workspace/:id/cash/summary` → agregado leve para dashboard
- Proteger com workspace guard (já existente)
- Alimentar o campo `workspaceState` do ABI (Camada II) com cash summary para o LLM verbalizador poder responder perguntas sobre saúde financeira
**Evidência de sucesso**: `curl /workspace/wks_1/cash/summary` retorna JSON com posição, runway e nível de risco.

### Recomendação 4 — Blocker Integration: wire real do UnsafeOperationBlocker
**Prioridade**: P1 (high)
**UTP sugerida**: `UTP-CASH-012`
**O que fazer**:
- Integrar `UnsafeOperationBlocker` no fluxo de checkout (antes da chamada Stripe):
  - `StripeChargeService` ou `CheckoutEventEmitterService` chama `blocker.block('payment', amount, position, risk, runway)` antes de processar
  - Se bloqueado, retorna erro 402 com `reason` e `blockerKind`
- Integrar no fluxo de refund: mesmo guard antes de processar refund
- Integrar no fluxo de ad-spend (campaigns): mesmo guard antes de autorizar gasto
- Integrar no fluxo de payout/transfer (Connect): mesmo guard
- Para cada bloqueio: emitir `cash.operation_blocked` no spine + log estruturado
- Criar `BlockOverridePolicy` (workspace-level) para o owner configurar exceções com justificativa registrada
**Evidência de sucesso**: Tentar checkout com runway < 14d retorna erro 402 e evento `cash.operation_blocked` no spine.

### Recomendação 5 — Cenários e reconciliação: fechar o loop de confiança
**Prioridade**: P2 (medium)
**UTP sugerida**: `UTP-CASH-013`
**O que fazer**:
- **Cenários**: `RunwayCalculator` produzir 3 projeções (pessimista/base/otimista) baseadas em:
  - Pessimista: churn de assinatura 2x acima do baseline, 0 novas vendas
  - Base: tendência atual mantida
  - Otimista: pipeline atual convertido + renovações 100%
- **Reconciliação**: Job diário que compara saldo derivado de CashEntries vs saldo real da wallet/ledger. Drift > 5% dispara `cash.reconciliation_drift` no spine.
- **Confiança dinâmica**: `ReceivablesProjector` ajustar `confidence` de `projected_receivable` baseado em:
  - Taxa histórica de renovação de assinatura do workspace
  - Taxa de falha de pagamento (declined) do workspace
  - Taxa de churn do workspace
- **Projetor de recebíveis de assinatura**: Job que consulta assinaturas ativas (`Subscription` table) e cria `CashEntry(category: 'projected_receivable')` para os próximos 30 dias com `confidence` derivado de histórico real.
**Evidência de sucesso**: `GET /workspace/:id/cash/runway?scenario=all` retorna 3 projeções. Job de reconciliação detecta drift de 8% e emite evento.

---

## 8. Nível de Maturidade R33

| Dimensão | N1 (atual) | N2 | N3 | N4 |
|---|---|---|---|---|
| Lógica de cálculo | **8/8 serviços implementados e testados** | — | — | — |
| Alimentação de dados | 0% (zero dado real) | Consome `commerce.payment.*` | Consome + projeta recebíveis de assinatura | Consome + projeta + reconcilia |
| Persistência | 0% (cálculos efêmeros) | CashEntryRepository + time-series básica | Time-series completa + snapshots diários | Histórico completo + replay |
| Background job | 0% (sem job) | Job 12h recalcula posição e risco | Job 6h recalcula tudo e emite eventos | Job com cenários pessimista/base/otimista |
| API / Dashboard | 0% (sem endpoints) | GET /cash/summary | GET /cash/{position,runway,risk,history} | Dashboard + alimenta ABI workspaceState |
| Blocker integration | 0% (não chamado) | Wire no checkout | Wire no checkout + refund + ad-spend | Wire em toda operação de gasto + política de override |
| Alerting | 0% (sem alertas) | Emite cash.risk_detected no spine | Notificação push (dashboard badge) | Alerta multicanal (WhatsApp/email/Slack) |
| Cenários | 0% (cenário único) | — | — | 3 cenários (pessimista/base/otimista) |
| Reconciliação | 0% | — | — | Drift detection diário com alerta |

**R33 atual**: **N1 sólido** — fundação lógica completa, zero de integração.
**R33 N3 alvo**: requer Recomendações 1+2+3+4 implementadas e validadas em produção com workspace real.

---

## 9. Métrica de Sucesso R33 (do Plano)

> **R33** — Caixa preservado como oxigênio (alerta precoce ≥60%; ≥40% confirma "me ajudou a não ficar sem oxigênio").

**Estado atual**: 0% em ambas as métricas. Nenhum alerta é emitido. Nenhum workspace recebeu qualquer sinal de risco de caixa do sistema.

**Para atingir ≥60% alerta precoce**: As Recomendações 1+2 são pré-requisitos. Sem alimentação de dados e job contínuo, não há alerta possível.

**Para atingir ≥40% "me ajudou"**: As Recomendações 3+4+5 são necessárias. O owner precisa VER o alerta (API/dashboard), CONFIAR nele (bloqueios efetivos que previnem dano real), e RECONHECER o valor ("se não fosse o bloqueio, eu teria gasto").

---

## 10. Dependências Cross-Camada

| De | Para | Status |
|---|---|---|
| R33 (Cash) | Eventos `commerce.payment.*` (CheckoutEmitter) | **Não integrado** — eventos existem mas Cash não escuta |
| R33 (Cash) | R23 (Healthy Money) | **Parcial** — HealthyMoney.scoreRevenueQuality consome approved/refunded, mas não alimenta Cash |
| R33 (Cash) | Wallet/Ledger | **Não integrado** — saldo real da carteira não é usado como fonte de verdade para CashPosition |
| R33 (Cash) | Subscription engine | **Não integrado** — renovações futuras não são projetadas como recebíveis |
| R33 (Cash) | Spine (event emission) | **Não integrado** — Cash não emite eventos próprios |
| R33 (Cash) | Goal Field (detectors financeiros) | **Não integrado** — detectores financeiros não usam módulo cash |

---

## 11. Débito Técnico Identificado

1. **Arquivos órfãos**: `cash-position.tracker.service.ts` + `cash-position.types.ts` são código morto — duplicam parcialmente a lógica do `CashPositionTracker` com abordagem diferente (Map em memória vs array funcional) mas nunca foram wireados. Devem ser removidos ou fundidos com a implementação canônica.
2. **Comentário de camada errado**: `app.module.ts:303` diz "Camada XXII" mas o plano canônico define Cash como Camada XXIX.
3. **Falta de `CashModule` no `kloel.module.ts`**: Não é um bug (está no `app.module.ts`), mas o padrão do projeto é que módulos cognitivos fiquem no `kloel.module.ts` (DriftModule, LineageModule, ColdstartModule todos estão lá). A exceção do CashModule quebra o padrão.
4. **Testes sem mock de dados reais**: Os specs são 100% puramente lógicos. Isso é bom para velocidade, mas não testam o comportamento end-to-end com dados reais de eventos Stripe/spine.

---

## 12. Riscos de Regressão

- **Risco baixo**: O módulo cash é autocontido (zero dependências externas além de NestJS DI). Wire adicional não quebra contratos existentes.
- **Risco médio**: Persistência de CashEntry requer migration Prisma. Deve ser aditiva (nova tabela, sem alterar schema existente).
- **Risco baixo**: Jobs BullMQ são isolados. Falha de job não afeta runtime HTTP.
- **Superfície protegida**: Nenhum. Todos os arquivos a criar são novos. `app.module.ts` já importa CashModule; nenhuma alteração necessária ali.

---

## Summary

- **Módulo cash/** = 1606 linhas, 8 serviços + spec. Cálculo lógico 100% implementado. **N1.**
- **Gap crítico**: zero integração com eventos reais. Nenhum CashEntry é criado em produção. Todos os cálculos retornam zero.
- **5 recomendações priorizadas** para N1 → N3+: (1) consumer de eventos Stripe/spine, (2) background job + persistência, (3) API/dashboard, (4) wire do blocker, (5) cenários + reconciliação.
- **R33 target**: alerta precoce ≥60%, ≥40% "me ajudou a não ficar sem oxigênio". Atual: 0%/0%.
- **Arquivo órfão**: `cash-position.tracker.service.ts` — remover ou fundir.
