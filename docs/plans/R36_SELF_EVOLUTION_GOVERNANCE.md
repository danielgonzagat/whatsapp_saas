# R36 — Self-Evolution Governance Design

> **Superfície de governance.** Este documento é o contrato canônico de
> auto-evolução governada do Kloel (Camada XXXII, B0.16, R36, Onda 9).
> Nenhum agente de IA pode alterar este arquivo sem autorização humana explícita.
>
> **Status**: design rigoroso aprovado. Implementação: `backend/src/kloel/evol/`.
>
> **Regra B0.16**: *Auto-aperfeiçoamento vinculado a resultado, sob governança
> humana, com rollback automático se R-tier regride. Nunca substitui governança
> humana; toda execução real passa por agentes codificadores autorizados.*

---

## 1. Gap Detector Observável

### 1.1 O que conta como gap?

Um **gap** é uma lacuna de capacidade própria do Kloel detectada por sinais
observáveis no event spine, NUNCA por auto-inspeção introspectiva sem evidência.
Toda detecção de gap exige `provenance` rastreável e `truthMode: observed`.

### 1.2 Taxonomia de sinais detectáveis

| Sinal | Fonte no spine | Severidade | Impacto comercial estimado |
|---|---|---|---|
| `commerce.payment.failed` com taxa > threshold | `commerce.payment.*` | critical | revenue_blocking |
| `commerce.payment.declined` em massa sem retry | `commerce.payment.*` | critical | revenue_blocking |
| `commerce.cart.abandoned` sem recuperação | `commerce.cart.*` | high | revenue_blocking |
| `commerce.checkout_initiated` sem `payment.*` correspondente | `commerce.cart.*` + `commerce.payment.*` | high | revenue_blocking |
| `auth.refresh_token_expired` sem renovação | `auth.*` | high | trust_eroding |
| `commerce.whatsapp.message_received` sem `message_replied` em N minutos | `commerce.whatsapp.*` | high | revenue_blocking |
| `commerce.crm.deal_lost` sem registro de objeção | `commerce.crm.*` | medium | opportunity_missed |
| `commerce.lead.went_silent` sem follow-up | `commerce.lead.*` | medium | opportunity_missed |
| `pulse.gate_failed` repetido no mesmo gate | `pulse.*` | medium | quality_degrading |
| Worker queue buildup > threshold | BullMQ metrics | medium | quality_degrading |
| `commerce.affiliate.commission_calculated` com erro | `commerce.affiliate.*` | low | quality_degrading |
| `commerce.member_area.dropped_out` sem tentativa de retenção | `commerce.member_area.*` | low | quality_degrading |

### 1.3 Regras de filtragem

- **Confiança mínima**: `confidence >= 0.3`. Sinais abaixo disso são descartados.
- **Domínio conhecido**: o domínio do sinal deve existir no perfil de risco
  (`DOMAIN_RISK_PROFILES`). Sinais de domínios desconhecidos são ignorados (não
  inventar gaps).
- **Ranking**: gaps são ordenados por `estimatedRevenueRiskCents` decrescente.
- **Domínios cobertos**: payments, wallet, auth, whatsapp, checkout, kyc,
  billing, crm, autopilot, flows, dashboard.

### 1.4 Exemplos concretos

**Exemplo A — gap de pagamento (severity: critical)**
```
Signal: commerce.payment.failed, workspaceId=ws-42, domain=payments
Confidence: 0.9 (9 em 10 pagamentos recentes falharam)
Gap: "Detected capability gap in payments domain"
Severity: critical
CommercialImpact: revenue_blocking
EstimatedRevenueRiskCents: 90000 (baseRiskCents=100000 × 0.9 × peso 1.0)
```

**Exemplo B — gap de auth (severity: high)**
```
Signal: auth.refresh_token_expired, workspaceId=ws-7, domain=auth
Confidence: 0.7
Gap: "Detected capability gap in auth domain"
Severity: high
CommercialImpact: trust_eroding
EstimatedRevenueRiskCents: 12600 (baseRiskCents=20000 × 0.7 × peso 0.9)
```

**Exemplo C — sinal ignorado (confiança baixa)**
```
Signal: commerce.lead.went_silent, workspaceId=ws-99, domain=crm
Confidence: 0.15 → DESCARTADO (abaixo de 0.3)
```

**Exemplo D — domínio desconhecido**
```
Signal: some.unknown.event, domain=foobar
→ IGNORADO (sem perfil de risco)
```

---

## 2. Proposal Builder

### 2.1 Campos de uma proposta segura

Toda `ImprovementProposal` deve conter obrigatoriamente:

| Campo | Tipo | Descrição | Restrição |
|---|---|---|---|
| `id` | string | Identificador único (`prop-{workspaceId}-{counter}`) | Imutável após criação |
| `gapId` | string | Referência ao gap de origem | Deve existir |
| `workspaceId` | string | Workspace de escopo | Isolamento obrigatório |
| `description` | string | Descrição textual da melhoria proposta | Deve referenciar o domínio |
| `targetFiles` | `readonly string[]` | Arquivos alvo da modificação | **Validado pelo firewall antes de qualquer ação** |
| `expectedDelta` | string | Descrição do delta esperado em R-tier | Mensurável |
| `riskAssessment` | `'safe' \| 'normal' \| 'high' \| 'critical'` | Classificação de risco | Determina nível de autorização |
| `evidence` | `readonly string[]` | Evidências que embasam a proposta | Deve incluir `sourceEvidence` do gap |
| `generatedAt` | ISO timestamp | Momento de geração | Usado para janela de rollback (24h) |
| `status` | `'draft' \| 'submitted' \| 'authorized' \| 'rejected'` | Estado da proposta | Transições: draft→submitted→authorized ou draft→submitted→rejected |

### 2.2 Mapa de risco → domínio

| Domínio | Descrição da proposta | Arquivos alvo | Risk |
|---|---|---|---|
| payments | Add idempotency guard to payment webhook handler | `backend/src/payments/**` | critical |
| checkout | Validate checkout cart totals before payment intent creation | `backend/src/checkout/**`, `backend/src/payments/**` | critical |
| wallet | Audit wallet transaction isolation in withdrawal flow | `backend/src/wallet/**` | high |
| auth | Strengthen JWT refresh token rotation logic | `backend/src/auth/**` | high |
| whatsapp | Add rate-limit backoff to WhatsApp message sender | `backend/src/whatsapp/**`, `worker/**` | high |
| billing | Add subscription lifecycle webhook idempotency | `backend/src/billing/**`, `backend/src/webhooks/**` | high |
| autopilot | Add confidence threshold guard before autonomous message send | `backend/src/autopilot/**`, `backend/src/kloel/**` | high |
| kyc | Add document validation retry with exponential backoff | `backend/src/kyc/**` | normal |
| crm | Ensure CRM pipeline stages have workspace isolation | `backend/src/crm/**` | normal |
| flows | Validate flow node transitions for infinite loop prevention | `backend/src/flows/**` | normal |
| dashboard | Replace mock dashboard data with real aggregation queries | `backend/src/dashboard/**` | safe |

### 2.3 Validação pré-submissão

Antes de uma proposta ser submetida (`status: 'draft' → 'submitted'`):

1. **Firewall check**: todos os `targetFiles` passam pelo
   `ProtectedFilesFirewallService`. Se qualquer arquivo for protegido, a
   proposta é automaticamente rejeitada com `escalationRequired: true`.
2. **Scope check**: os `targetFiles` devem estar dentro dos diretórios
   permitidos para evolução (`backend/src/**`, `worker/**`). Arquivos em
   `frontend/**`, `docs/**`, `scripts/pulse/**`, `ops/**` são rejeitados.
3. **Codacy check**: o `CodacyRigorEnforcer` verifica se a baseline MAX-RIGOR
   permanece intacta. Qualquer degradação bloqueia a proposta.

---

## 3. Human Authorization Gateway

### 3.1 Schema de aprovação

Toda proposta que toca código real exige registro `HumanAuthorization` com
os seguintes campos:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | `auth-{workspaceId}-{counter}` |
| `proposalId` | string | Vinculado à proposta |
| `workspaceId` | string | Escopo de workspace |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired'` | Estado atual |
| `authorityLevel` | `'advisory' \| 'tool_limited' \| 'human_required'` | Nível de autoridade exigido |
| `humanPrincipal` | string | Identidade do humano que autorizou (ex: email, ID) |
| `reason` | string | Justificativa textual da decisão |
| `authorizedAt` | `string \| null` | Timestamp ISO da aprovação (null até aprovado) |
| `expiresAt` | ISO timestamp | **24h após criação**. Expirado = autorização inválida |
| `scope` | `readonly string[]` | Arquivos exatos no escopo da autorização |

### 3.2 Mapa risco → autoridade

| riskAssessment | authorityLevel | Significado |
|---|---|---|
| `critical` | `human_required` | Exige aprovação humana explícita. Sem assinatura, nada executa. |
| `high` | `human_required` | Idem. |
| `normal` | `tool_limited` | Pode ser despachada com menor fricção, mas ainda exige registro de autorização. |
| `safe` | `advisory` | Baixo risco. Pode ser executada com notificação, sem bloqueio. |

### 3.3 Timeout e expiração

- **Janela de autorização**: 24 horas (86.400.000ms) a partir da criação.
- Após expiração, `status` transita para `expired`.
- Autorização expirada NUNCA é usada para dispatch.
- Nova autorização deve ser solicitada (`requestAuthorization`).

### 3.4 Assinatura humana

- `humanPrincipal` identifica o humano responsável (não pode ser vazio, não
  pode ser um agentId).
- `reason` deve conter justificativa textual. Razão vazia é rejeitada.
- A aprovação é registrada no `EvolutionAuditLog` como
  `authorization_approved` com `correlationId` rastreável.

### 3.5 Rejeição

- Rejeição (`status: 'rejected'`) é terminal para aquela autorização.
- Uma proposta rejeitada pode gerar nova autorização (novo `id`).
- Rejeição é registrada no audit log como `authorization_rejected`.

---

## 4. Bridge para Agentes Codificadores Autorizados

### 4.1 Quais agentes são autorizados?

A Camada XXXII NUNCA despacha código para agentes arbitrários. Os agentes
codificadores autorizados são definidos por contrato:

| Agente | Identificador | Escopo permitido |
|---|---|---|
| OpenCode Subagent (interactive) | `opencode-subagent` | UTPs dentro de `backend/src/kloel/evol/**` e domínios sob contrato |
| Orquestrador humano | `human-orchestrator` | Qualquer arquivo não-protegido; aprovação final obrigatória |
| Claude Code Agent | `claude-code-agent` | Apenas se supervisionado por orquestrador humano |
| DeepSeek V4 Pro (via OpenCode) | `deepseek-v4-pro` | Modo interativo apenas; nunca background |

### 4.2 Como são chamados?

O `AgentOrchestrationBridgeService` atua como proxy:

1. Recebe `HumanAuthorization` aprovada (status='approved', não expirada).
2. Verifica que `authorizedAt !== null`.
3. Cria um `AgentOrchestrationBridge` com:
   - `targetAgent`: identificador do agente (ex: `opencode-subagent`)
   - `targetFiles`: escopo exato da autorização
   - `instructions`: string com o ID da proposta e escopo
   - `status`: `'dispatched'`
4. O agente executor recebe o bridge ID e trabalha dentro do escopo.
5. Ao concluir, o resultado é registrado com `resultHash` (hash do diff/commit).
6. Falha é registrada com `errorMessage`.

### 4.3 Regras de dispatch

- **Sem autorização aprovada**: dispatch retorna `null`. Nada executa.
- **Autorização expirada**: dispatch retorna `null`.
- **Arquivo fora do escopo**: o agente executor é bloqueado pelo
  `ProtectedFilesFirewallService` antes de qualquer write.
- **Tentativa de editar arquivo protegido**: violação registrada,
  `escalationRequired: true` se `governance_breach`.
- **Nenhum agente opera em modo background**: apenas modo interativo
  supervisionado (regra D.6 do plano de swarm).

### 4.4 Ciclo de vida do bridge

```
queued → dispatched → completed (com resultHash)
                    → failed (com errorMessage)
```

---

## 5. Experiment Runner via HYPPROOF

### 5.1 Fluxo

O `ExperimentRunner` integra com a Camada XX (HYPPROOF — Hypothesis-to-Proof
Engine) para validar propostas de melhoria antes do rollout completo.

```
Proposal autorizada (HumanAuthorization.status = 'approved')
  │
  ▼
ExperimentRunner.start(proposal, authorization)
  │  Cria ExperimentRun com hypproofExperimentId
  │  Status: 'running'
  │
  ▼
HYPPROOF (Camada XX) executa micro-experimento
  │  Formula hipótese, desenha experimento, coleta evidência
  │
  ▼
ExperimentRunner.complete(runId, evidenceCount, verdict)
  │  verdict ∈ { 'confirmed', 'refuted', 'inconclusive' }
  │
  ├── confirmed → proposta pode ser promovida
  ├── refuted  → AutomaticRollbackService.evaluateExperiment() dispara rollback
  └── inconclusive → requer mais evidência; proposta pausada
```

### 5.2 Campos do ExperimentRun

| Campo | Descrição |
|---|---|
| `id` | `exp-{workspaceId}-{counter}` |
| `proposalId` | Vinculado à proposta |
| `workspaceId` | Escopo |
| `hypproofExperimentId` | ID no HYPPROOF |
| `status` | `'pending' \| 'running' \| 'completed' \| 'failed'` |
| `startedAt` | Timestamp de início |
| `completedAt` | Timestamp de conclusão (null até concluir) |
| `evidenceCount` | Número de evidências coletadas |
| `verdict` | `'confirmed' \| 'refuted' \| 'inconclusive' \| null` |

### 5.3 Regras

- Só inicia se `authorization.status === 'approved'`.
- `verdict: 'refuted'` dispara rollback automático via
  `AutomaticRollbackService.evaluateExperiment()`.
- `verdict: 'confirmed'` permite promoção da proposta.
- `verdict: 'inconclusive'` bloqueia promoção; requer re-execução ou nova
  proposta.

---

## 6. R-Tier Delta Monitor

### 6.1 Definição operacional de regressão

Uma **regressão** ocorre quando o R-tier de um módulo sofre downgrade após
uma melhoria ter sido aplicada.

**R-tier de cada módulo** (ordem de maturidade):

| Tier | Número | Significado |
|---|---|---|
| `tier_1_functional` | 1 | Produção funcional com cobertura de testes e gates verdes |
| `tier_2_partial` | 2 | Parcialmente operacional, alguns gates em warning |
| `tier_3_facade` | 3 | Shell/fachada; comportamento simulado ou stub |
| `tier_4_shell` | 4 | Não implementado; valor default para módulos desconhecidos |

### 6.2 Direção do delta

- **upgraded**: `currentTier` numérico < `previousTier` numérico (ex: 4→2).
- **downgraded**: `currentTier` numérico > `previousTier` numérico (ex: 1→3).
  → **ISSO É REGRESSÃO.**
- **unchanged**: mesmo tier.

### 6.3 Campos do RTierDelta

| Campo | Descrição |
|---|---|
| `workspaceId` | `'global'` (R-tier é global, não por workspace) |
| `module` | Nome do módulo (ex: `'payments'`, `'auth'`, `'whatsapp'`) |
| `previousTier` | Tier antes da mudança |
| `currentTier` | Tier após a mudança |
| `metrics` | Métricas associadas (ex: `{ coverage: 0.95, gates_passing: 8 }`) |
| `changedAt` | Timestamp da mudança |
| `direction` | `'upgraded' \| 'downgraded' \| 'unchanged'` |
| `reason` | Justificativa textual |

### 6.4 Comportamento

- `direction === 'downgraded'` é automaticamente reportado ao
  `AutomaticRollbackService`.
- `getDowngrades()` retorna todos os downgrades registrados para auditoria.
- Módulo desconhecido começa em `tier_4_shell` (default pessimista).

---

## 7. Automatic Rollback (≤24h)

### 7.1 Gatilhos precisos

O `AutomaticRollbackService` dispara rollback em **duas condições**:

#### Gatilho A — R-tier downgrade

```
SE delta.direction === 'downgraded'
E a proposta foi gerada há ≤ 24h (MAX_ROLLBACK_WINDOW_MS)
ENTÃO cria AutomaticRollback com wasAutomatic: true
```

#### Gatilho B — Experimento refutado

```
SE experimentVerdict === 'refuted'
E a proposta foi gerada há ≤ 24h
ENTÃO cria AutomaticRollback com wasAutomatic: true
```

### 7.2 Janela de 24 horas

A janela é calculada a partir de `proposal.generatedAt`:
```
Date.now() - new Date(proposal.generatedAt).getTime() <= 86_400_000
```

Propostas com mais de 24h desde a geração NÃO disparam rollback automático
(o código já está assimilado; rollback seria destrutivo).

### 7.3 Campos do AutomaticRollback

| Campo | Descrição |
|---|---|
| `id` | `rollback-{workspaceId}-{counter}` |
| `proposalId` | Proposta que causou a regressão |
| `workspaceId` | Escopo |
| `triggeredAt` | Timestamp do disparo |
| `reason` | Texto descritivo (ex: "R-tier downgraded for module payments: tier_1_functional → tier_3_facade") |
| `evidence` | Evidências que justificam o rollback |
| `executedAt` | Timestamp da execução (null até executar) |
| `status` | `'pending' \| 'executed' \| 'failed'` |
| `rollbackDurationMs` | Duração em ms do processo de rollback |
| `wasAutomatic` | `true` (sempre true no serviço automático) |

### 7.4 Fluxo de execução

```
Rollback.status = 'pending'
  │
  ▼
execute(rollbackId)
  │  Reverte as mudanças da proposta
  │  Restaura R-tier anterior
  │  Registra em audit log
  │
  ├── sucesso → status: 'executed', executedAt preenchido
  └── falha   → status: 'failed', reason enriquecido com erro
```

### 7.5 O que NÃO acontece no rollback

- **NÃO executa `git restore`** (proibido por governance — `AGENTS.md` e
  `AGENT_RUNBOOK.md`). Rollback é feito por re-aplicação de código ou
  feature flag reversal.
- **NÃO apaga arquivos**. Mudanças são revertidas com novo commit, não com
  destruição de histórico.
- **NÃO remove entradas do audit log**. Histórico é append-only.

---

## 8. Protected Files Firewall

### 8.1 Lista canônica de arquivos protegidos

Fonte de verdade: `ops/protected-governance-files.json` (`protectedExact` +
`protectedPrefixes`) + `PROTECTED_PATTERNS` em
`backend/src/kloel/evol/protected-files.firewall.ts`.

#### Arquivos exatos (protectedExact)

| Arquivo | Tipo de violação se tocado |
|---|---|
| `AGENTS.md` | `governance_breach` |
| `CLAUDE.md` | `governance_breach` |
| `CODEX.md` | `governance_breach` |
| `.codacy.yml` | `codacy_weakening` |
| `ratchet.json` | `governance_breach` |
| `package.json` | `governance_breach` |
| `.husky/commit-msg` | `bypass_suppression` |
| `.husky/pre-push` | `bypass_suppression` |
| `backend/eslint.config.mjs` | `codacy_weakening` |
| `frontend/eslint.config.mjs` | `codacy_weakening` |
| `worker/eslint.config.mjs` | `codacy_weakening` |
| `backend/src/lib/openai-models.ts` | `governance_breach` |
| `backend/src/lib/ai-models.ts` | `governance_breach` |

#### Prefixos protegidos (protectedPrefixes)

| Prefixo | Tipo de violação |
|---|---|
| `.github/workflows/` | `governance_breach` |
| `docs/codacy/` | `codacy_weakening` |
| `docs/design/` | `governance_breach` |
| `ops/` | `governance_breach` |
| `scripts/ops/` | `governance_breach` |

#### Adicional do PULSE auditor

| Arquivo | Tipo |
|---|---|
| `scripts/pulse/no-hardcoded-reality-audit.ts` | `governance_breach` |

### 8.2 Classificação de violações

| ViolationKind | Significado | Escalation |
|---|---|---|
| `governance_breach` | Toque em arquivo de governance/identidade/CI/CD/proteção | `escalationRequired: true` |
| `codacy_weakening` | Toque em config de lint/Codacy que pode reduzir rigor | `escalationRequired: false` |
| `bypass_suppression` | Toque em hook ou script de verificação (ex: husky) | `escalationRequired: false` |
| `protected_file_touch` | Toque em arquivo protegido sem classificação específica | `escalationRequired: false` |

### 8.3 Comportamento do firewall

- `check(filePath, agentIdentity)` → retorna `ProtectedFilesFirewall` se
  bloqueado, `null` se permitido.
- Violação é registrada no `EvolutionAuditLog` como `firewall_blocked`.
- `escalationRequired: true` → notificação imediata ao orquestrador humano.
- O firewall é consultado ANTES de qualquer dispatch (`ProposalBuilder`
  valida `targetFiles`; `AgentOrchestrationBridgeService` re-valida no
  dispatch).

---

## 9. Audit Log

### 9.1 Schema do registro

Cada entrada de auditoria (`EvolutionAudit`) é imutável e contém:

| Campo | Tipo | Descrição |
|---|---|---|
| `entryId` | string | `audit-{workspaceId}-{counter}` |
| `workspaceId` | string | Workspace de escopo (ou `'global'`) |
| `action` | string | Ação registrada (ex: `gap_detected`, `proposal_created`, `authorization_approved`, `agent_dispatched`, `experiment_completed`, `firewall_blocked`, `codacy_rigor_checked`, `rollback_executed`) |
| `actor` | string | Componente ou identidade que realizou a ação |
| `payload` | `Readonly<Record<string, unknown>>` | Dados estruturados da ação (ex: `{ gapId, proposalId, authId, bridgeId, runId, violationId, checkId }`) |
| `recordedAt` | ISO timestamp | Momento do registro |
| `correlationId` | string | ID de correlação que une todas as entradas de um mesmo ciclo de evolução |
| `authorizationId` | `string \| null` | ID da autorização associada (null para ações sem autorização) |

### 9.2 Ações registradas

| Ação | Actor | Quando |
|---|---|---|
| `gap_detected` | `GapDetector` | Gap identificado no spine |
| `proposal_created` | `ProposalBuilder` | Proposta gerada a partir de gap |
| `authorization_pending` | `HumanAuthorizationGateway` | Autorização solicitada |
| `authorization_approved` | `HumanAuthorizationGateway` | Humano aprovou |
| `authorization_rejected` | `HumanAuthorizationGateway` | Humano rejeitou |
| `authorization_expired` | `HumanAuthorizationGateway` | Timeout de 24h |
| `agent_dispatched` | `AgentOrchestrationBridge` | Agente codificador acionado |
| `agent_completed` | `AgentOrchestrationBridge` | Agente concluiu com resultHash |
| `agent_failed` | `AgentOrchestrationBridge` | Agente falhou |
| `experiment_started` | `ExperimentRunner` | Experimento HYPPROOF iniciado |
| `experiment_completed` | `ExperimentRunner` | Experimento concluiu com veredito |
| `experiment_failed` | `ExperimentRunner` | Experimento falhou |
| `r_tier_changed` | `RTierDeltaMonitor` | Mudança de R-tier registrada |
| `rollback_triggered` | `AutomaticRollbackService` | Condição de rollback detectada |
| `rollback_executed` | `AutomaticRollbackService` | Rollback concluído |
| `rollback_failed` | `AutomaticRollbackService` | Rollback falhou |
| `firewall_blocked` | `ProtectedFilesFirewall` | Acesso a arquivo protegido bloqueado |
| `codacy_rigor_checked` | `CodacyRigorEnforcer` | Verificação de MAX-RIGOR realizada |

### 9.3 Propriedades do audit log

- **Append-only**: entradas nunca são removidas ou editadas.
- **Filtrável**: por `workspaceId`, por recência (`recentEntries(sinceMs)`).
- **Correlacionável**: todas as entradas de um mesmo ciclo compartilham
  `correlationId`.
- **Rastreável**: `authorizationId` conecta entradas à autorização humana.

---

## 10. Codacy MAX-RIGOR Enforcer

### 10.1 Baseline

O `CodacyRigorEnforcer` captura o estado baseline das ferramentas Codacy no
momento da inicialização do módulo:

- eslint, biome, semgrep, pmd, remark-lint, markdownlint, shellcheck, hadolint

### 10.2 Verificação

A cada `check(currentStates)`, compara o estado atual contra a baseline:

- **compliant**: zero ferramentas desabilitadas em relação à baseline.
- **degraded**: 1-2 ferramentas desabilitadas.
- **violated**: 3+ ferramentas desabilitadas.

### 10.3 Bloqueio

- Status `degraded` ou `violated` bloqueia qualquer promoção de proposta.
- `isCompliant() === false` → proposta pausada até restauração.
- Tentativa de enfraquecer Codacy é registrada no audit log como
  `codacy_rigor_checked` com status não-compliant.

---

## 11. Restrições Absolutas

Estas restrições são imutáveis e aplicam-se a todo o fluxo de auto-evolução:

| # | Restrição | Origem |
|---|---|---|
| R1 | **Zero `git restore`**. Rollback é por código, não por destruição de histórico. | AGENTS.md, AGENT_RUNBOOK.md |
| R2 | **Zero supressão de lint**. Nenhum `biome-ignore`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`, `NOSONAR`, `noqa`. | AGENTS.md, Codacy Lock |
| R3 | **Zero toque em arquivo protegido**. Lista canônica na Seção 8. Violação = bloqueio + escalation. | ops/protected-governance-files.json |
| R4 | **Zero bypass de governança**. Nenhuma mudança em CLAUDE.md, AGENTS.md, CODEX.md, ops/, .github/workflows/, scripts/ops/. | AGENTS.md |
| R5 | **Zero redução de Codacy MAX-RIGOR**. Nenhuma ferramenta desabilitada, nenhum threshold relaxado, nenhum path excluído. | CodacyRigorEnforcer |
| R6 | **Zero agente operando sem autorização humana**. `human_required` = sem assinatura, nada executa. | HumanAuthorizationGateway |
| R7 | **Zero mudança visual**. Nenhum toque em `frontend/**`, `*.tsx`, `*.vue`. | Plano de Swarm, restrição rígida |
| R8 | **Zero rollback sobre proposta com >24h**. Rollback automático só dentro da janela. | AutomaticRollbackService |
| R9 | **Zero dispatch para agente não autorizado**. Apenas `opencode-subagent`, `claude-code-agent` sob supervisão, ou `human-orchestrator`. | AgentOrchestrationBridgeService |
| R10 | **Zero gap sem evidência observável**. `truthMode: observed` obrigatório; `inferred` ou `projected` não geram gap. | GapDetector |

---

## 12. Workflow Completo (12 Passos)

Do gap detectado ao rollback ou promoção:

```
PASSO 1 — SINAL
  Event spine emite sinal de domínio conhecido (ex: commerce.payment.failed).
  GapDetector.detect() avalia severidade, impacto comercial e risco projetado.
  confidence >= 0.3 → gap registrado. confidence < 0.3 → descartado.
  Audit: gap_detected.

PASSO 2 — PROPOSTA
  ProposalBuilder.build() gera ImprovementProposal com targetFiles, risco,
  expectedDelta. Valida targetFiles contra ProtectedFilesFirewall.
  Arquivo protegido no targetFiles → proposta rejeitada automaticamente.
  Audit: proposal_created.

PASSO 3 — SUBMISSÃO
  ProposalBuilder.submit() transiciona status: draft → submitted.
  Proposta agora visível para orquestrador humano.

PASSO 4 — AUTORIZAÇÃO
  HumanAuthorizationGateway.requestAuthorization() cria HumanAuthorization
  com status 'pending', authorityLevel baseado em riskAssessment,
  expiresAt = now + 24h.
  Audit: authorization_pending.

PASSO 5 — DECISÃO HUMANA
  Orquestrador humano revisa proposta, evidências, targetFiles.
  HumanAuthorizationGateway.approve() ou .reject().
  Aprovação exige humanPrincipal + reason não vazios.
  Audit: authorization_approved OU authorization_rejected.

  ⚠️ Se rejeitada: fluxo termina. Gap pode gerar nova proposta futura.
  ⚠️ Se expirada (>24h): status → expired. Nova autorização necessária.

PASSO 6 — EXPERIMENTO (HYPPROOF)
  ExperimentRunner.start() inicia micro-experimento via Camada XX.
  HYPPROOF formula hipótese, coleta evidência, produz veredito.
  Audit: experiment_started.

PASSO 7 — VEREDITO
  ExperimentRunner.complete() registra veredito.
  - confirmed → continua para PASSO 8.
  - refuted → vai para PASSO 11 (rollback).
  - inconclusive → pausa; requer re-execução.
  Audit: experiment_completed.

PASSO 8 — DISPATCH PARA AGENTE
  AgentOrchestrationBridgeService.dispatch() verifica:
  - authorization.status === 'approved'
  - authorization.authorizedAt !== null
  - !isExpired(authorization)
  - targetAgent é autorizado (opencode-subagent, human-orchestrator,
    claude-code-agent supervisionado)
  - targetFiles passam no firewall novamente
  Cria AgentOrchestrationBridge com status 'dispatched'.
  Audit: agent_dispatched.

PASSO 9 — EXECUÇÃO PELO AGENTE
  Agente codificador autorizado implementa a mudança dentro do escopo.
  Modo interativo obrigatório. Nada em background.
  Resultado registrado com resultHash.
  Audit: agent_completed OU agent_failed.

PASSO 10 — VERIFICAÇÃO PÓS-MUDANÇA
  RTierDeltaMonitor.record() registra novo R-tier do módulo afetado.
  CodacyRigorEnforcer.check() verifica MAX-RIGOR.
  ProtectedFilesFirewall verifica se nenhum arquivo protegido foi tocado.
  Se direction === 'downgraded' → PASSO 11 (rollback).
  Se direction === 'upgraded' e Codacy compliant → PASSO 12 (promoção).
  Audit: r_tier_changed, codacy_rigor_checked.

PASSO 11 — ROLLBACK AUTOMÁTICO
  AutomaticRollbackService.evaluateDelta() ou .evaluateExperiment():
  - Condição A: delta.direction === 'downgraded' E proposta ≤ 24h
  - Condição B: experimentVerdict === 'refuted' E proposta ≤ 24h
  Cria AutomaticRollback (wasAutomatic: true, status: 'pending').
  AutomaticRollbackService.execute():
  - Reverte mudança por código (NUNCA git restore)
  - Restaura R-tier anterior
  Audit: rollback_triggered, rollback_executed (ou rollback_failed).
  Fluxo termina. Gap permanece aberto para nova proposta.

PASSO 12 — PROMOÇÃO
  Proposta confirmada, R-tier sem downgrade, Codacy compliant.
  - Proposta status → 'authorized'
  - Módulo R-tier promovido no PULSE
  - Gap marcado como resolvido
  - Capacidade da Camada XXXII incrementada
  Ciclo completo registrado no audit log com correlationId único.
  R36 avança: ≥1 melhoria/trimestre com delta R-tier comprovado,
  zero violação de protegidos, zero bypass Codacy.
```

---

## Apêndice A — Tabela de Domínios e Perfis de Risco

| Domínio | Severity | CommercialImpact | BaseRiskCents |
|---|---|---|---|
| payments | critical | revenue_blocking | 100000 |
| checkout | high | revenue_blocking | 75000 |
| wallet | critical | revenue_blocking | 50000 |
| whatsapp | high | revenue_blocking | 30000 |
| auth | high | trust_eroding | 20000 |
| kyc | high | trust_eroding | 15000 |
| billing | medium | revenue_blocking | 10000 |
| autopilot | medium | quality_degrading | 8000 |
| crm | medium | opportunity_missed | 5000 |
| flows | low | quality_degrading | 3000 |
| dashboard | low | quality_degrading | 2000 |

## Apêndice B — Máquina de Estados da Proposta

```
draft ──→ submitted ──→ authorized ──→ [promoção R36]
                    │
                    └──→ rejected ──→ [terminal]
                    
  authorized expira em 24h se não executada.
```

## Apêndice C — Máquina de Estados da Autorização

```
pending ──→ approved ──→ [permite dispatch + experiment]
       │
       ├──→ rejected ──→ [terminal]
       │
       └──→ expired ──→ [terminal; re-request necessário]
```

## Apêndice D — Implementação

A implementação de referência vive em `backend/src/kloel/evol/`:

| Arquivo | UTP | Responsabilidade |
|---|---|---|
| `types.ts` | EVOL-000 | Contratos de tipo e utilidades |
| `gap.detector.ts` | EVOL-001 | Detecção de gaps |
| `proposal.builder.ts` | EVOL-002 | Construção de propostas |
| `human-authorization.gateway.ts` | EVOL-003 | Gateway de autorização humana |
| `agent-orchestration.bridge.ts` | EVOL-004 | Bridge para agentes codificadores |
| `experiment.runner.ts` | EVOL-005 | Runner de experimentos HYPPROOF |
| `r-tier-delta.monitor.ts` | EVOL-006 | Monitor de delta R-tier |
| `automatic-rollback.service.ts` | EVOL-007 | Rollback automático ≤24h |
| `protected-files.firewall.ts` | EVOL-008 | Firewall de arquivos protegidos |
| `codacy-rigor.enforcer.ts` | EVOL-009 | Enforcer de MAX-RIGOR Codacy |
| `evolution-audit.log.ts` | EVOL-010 | Log de auditoria imutável |
| `evol.module.ts` | — | Módulo NestJS |
| `evol.spec.ts` | — | Testes de contrato |

## Apêndice E — Critério R36

> **R36** — Evolução composta sob governança humana:
> - ≥1 melhoria/trimestre com delta R-tier comprovado
> - Zero violação de arquivos protegidos
> - Zero bypass de Codacy MAX-RIGOR LOCK
> - Toda execução passa por gateway de autorização humana
> - Rollback automático ≤24h funcional e testado
