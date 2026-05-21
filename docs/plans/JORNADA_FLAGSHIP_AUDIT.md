# Jornada Flagship — Auditoria Rigorosa

> **Jornada**: lead inseguro → objeção → silêncio → retomada honesta → checkout → pós-venda sem arrependimento
> **Data**: 2026-05-14
> **Escopo cognitivo**: Camadas IX (Trust), XII (Team), XIV (Recovery), XVIII (Post-Sale), XX (Hypothesis-Proof)
> **Método**: leitura completa de tipos, implementações e specs dos 5 domínios; cruzamento com o Plano de Organismo Cognitivo

---

## (a) Cenas Implementadas (files + functions)

### Cena 1 — Detecção de Insegurança / Objeção

| Arquivo | Função/Classe | O que faz |
|---|---|---|
| `trust/trust-state-tracker.service.ts:50` | `TrustStateTrackerService.trackConversation()` | Compõe fatigue + desperation + brandRisk + silentCount + trustScore por conversa |
| `trust/fatigue-detector.ts` | `detectFatigue()` | Detecta fadiga por volume de outbound / objeções repetidas |
| `trust/desperation-detector.ts` | `detectDesperation()` | Detecta desespero por discount-escalation / promise-inflation via keyword scan |
| `trust/brand-protection.guard.ts` | `evaluateBrandRisk()` | Detecta false-promise, pressure-tactic, complaint-trigger, unsubstantiated-claim |
| `trust/human-handoff.trigger.ts:27` | `shouldHandoff()` | Decide handoff humano por trustScore floor, fatigue+desperation combinados, brandRisk |
| `trust/trust.types.ts:37` | `toTrustEvent()` | Converte SpineEventRef → TrustEvent |

### Cena 2 — Silêncio como Ação

| Arquivo | Função/Classe | O que faz |
|---|---|---|
| `trust/silence-as-action.policy.ts:77` | `decideSilence()` | Decide permanecer em silêncio com base em fatigue, desperation, trustScore, silentInteractionsCount, brandRiskFlags |
| `trust/silence-as-action.policy.ts:25` | `DEFAULT_SILENCE_CONFIG` | Thresholds configuráveis: fatigue 0.7, desperation 0.6, trustFloor 0.2, maxSilent 5 |

Todo SilenceDecision carrega contrato de delegação operacional (`riskClass`, `delegationMode`, `safeNextStep`, `rollback`, `leadOutcomeGuardrail`).

### Cena 3 — Retomada Honesta

| Arquivo | Função/Classe | O que faz |
|---|---|---|
| `trust/trust-recovery.tactics.ts:83` | `proposeRecoveryActions()` | Propõe ações de recuperação: escalate_to_human, wait_and_cool_down, acknowledge_mistake, reduce_frequency, provide_value, change_channel |
| `team/forgotten-followup.rescuer.ts:132` | `rescueForgottenFollowups()` | Varre spine por leads em silent > budget (72h default), ranqueia por urgência |
| `team/next-best-action.suggester.ts` | `suggestNextBestAction()` | Sugere próxima melhor ação com rationale, confidence e guardrails |
| `team/blind-spot-illuminator.ts` | `illuminateBlindSpots()` | Detecta leads sem atenção do operador |
| `team/pre-call-context.builder.ts` | `buildPreCallContext()` | Constrói contexto de pré-chamada com histórico, valência, perguntas abertas |
| `team/team-respect.protocol.ts` | `enforceRespectProtocol()` | Garante tom de sugestão, nunca comando |
| `team/smart-handoff.service.ts` | `SmartHandoffService` | Empacota contexto + sugestões + trustState para handoff humano |
| `team/operator-feedback.loop.ts` | `recordFeedback()` | Registra feedback do operador (dismiss/accept/override/snooze) para valência |

### Cena 4 — Checkout

Checkout está em Tier 1 (85% funcional) segundo CLAUDE.md. Os serviços de trust/post-sale consomem evento `commerce.payment.approved` e `commerce.payment.declined` do spine — o contrato de evento existe no mind.types.ts. A implementação do checkout em si não foi inspecionada nesta auditoria (fora do escopo das 5 camadas solicitadas), mas o contrato de integração com a jornada flagship está tipado.

### Cena 5 — Pós-Venda sem Arrependimento

| Arquivo | Função/Classe | O que faz |
|---|---|---|
| `postsale-consumers/anti-remorse.service.ts:19` | `AntiRemorseService.assess()` | Detecta risco de remorso pós-compra (24h window): objection pré-purchase, support-handoff, refund-risk, prior-refund |
| `postsale-consumers/activation-companion.service.ts:22` | `ActivationCompanionService.track()` | Rastreia 5 marcos de ativação (login→profile→feature→result→configured) com detecção de stall |
| `postsale-consumers/no-regret-pipeline.service.ts:23` | `NoRegretPipelineService.assess()` | Pipeline composto: classifica fase (no_payment→immediate→value_forming→no_regret→stalled→recovery) |
| `postsale-consumers/first-value.detector.ts` | `FirstValueDetector.detect()` | Detecta primeiro valor (conversion+payment+member_progress); emite `commerce.post_sale.first_value_obtained` no spine |
| `postsale-consumers/satisfaction-collector.service.ts` | `SatisfactionCollectorService` | Coleta NPS/CSAT/behavioral; emite `commerce.post_sale.satisfaction_signal_observed` |
| `postsale-consumers/testimonial-timing.advisor.ts` | `TestimonialTimingAdvisor.assess()` | Decide timing de pedido de depoimento (requer first_value + satisfaction positiva) |
| `postsale-consumers/referral-prompt-timing.advisor.ts` | `ReferralPromptTimingAdvisor.assess()` | Decide timing de pedido de indicação (requer first_value + satisfaction positiva) |
| `postsale-consumers/repurchase-window.detector.ts` | `RepurchaseWindowDetector.detect()` | Detecta janela de recompra; emite `commerce.post_sale.repurchase_window_opened` |
| `postsale-consumers/expansion-fit.detector.ts` | `ExpansionFitDetector.assess()` | Detecta fit para expansão (feature_adoption, volume_growth, multi_user, etc.) |
| `postsale-consumers/churn-risk.detector.ts` | `ChurnRiskDetector.assess()` | Detecta 9 sinais de churn-risk (inactivity, support_escalation, declined_payment, etc.) |
| `postsale-consumers/retention-honest.tactics.ts` | `RetentionHonestTactics` | 8 táticas de retenção honesta (usage_spotlight, success_reminder, personal_checkin, etc.) |
| `postsale-consumers/winback-window.advisor.ts` | `WinBackWindowAdvisor.assess()` | 4 táticas de win-back (departure_survey, conditional_return, product_update, reengagement) |
| `postsale-consumers/ltv-projection.service.ts` | `LtvProjectionService.project()` | Projeta LTV por coorte com confidence e growthRate |

### Cena 6 — Erro → Recuperação de Confiança (Recovery)

| Arquivo | Função/Classe | O que faz |
|---|---|---|
| `recovery/self-error-detector.ts:180` | `detectErrors()` | Detecta handoffs, declines, misclassifications, missed_opportunities no spine |
| `recovery/error-acknowledgment.builder.ts:72` | `buildAcknowledgment()` | Gera mensagem de reconhecimento não-defensivo por categoria de erro (9 templates) |
| `recovery/error-explanation.builder.ts:106` | `buildExplanation()` | Gera explicação em linguagem comercial (whatHappened + why + evidenceGaps) |
| `recovery/error-damage-recovery.tactics.ts` | `proposeRecoveryTactic()` | Propõe tática de reparação (small_concession, expedited_handling, discount_offer, etc.) |
| `recovery/error-non-repeat.guard.ts` | `buildNonRepeatCommitment()` | Gera compromisso de não-repetição com preventiveChange + guardActive |
| `recovery/error-narrative.builder.ts` | `buildErrorNarrative()` | Constrói narrativa semanal de erros + recuperações |
| `recovery/trust-after-error.tracker.ts` | `computeTrustAfterError()` | Calcula R18 score: autoDetectionRate, nonRepetitionRate, trustTrend |
| `recovery/recovery-proof-package.builder.ts` | `buildRecoveryProofPackage()` | Empacota acknowledgment + explanation + tactic + nonRepeat em prova completa |

---

## (b) Cenas Stub ou Ausentes

### Stubs (implementação parcial, sem integração real)

| Cena | O que falta |
|---|---|
| **Trust State** | Estado 100% in-memory (`Map<string, TrustState>`). Reinicia a cada deploy. Sem persistência Prisma, sem audit trail, sem recuperação de estado após crash. |
| **Silence Scheduling** | `decideSilence()` é função pura — retorna "deve silenciar" mas não há scheduler que execute o wait real e re-avalie. Sem timer, sem BullMQ job de re-engagement. |
| **Recovery Actions** | `proposeRecoveryActions()` retorna ações rankeadas, mas não há executor que dispare a ação (enviar msg WhatsApp, escalar humano, etc.). |
| **Forgotten Followup** | `rescueForgottenFollowups()` varre spine, mas não notifica ninguém. Sem integração com dashboard do operador, sem push notification, sem e-mail. |
| **Anti-Remorse Send** | `AntiRemorseService` recomenda `send_reassurance` / `send_welcome` / `monitor` / `none`, mas não envia mensagem real. O control exige `requiresHumanApproval: true` para reassurance — sem UI de aprovação. |
| **Post-Sale Persistence** | Nenhum estado de post-sale é persistido. NoRegretState, ActivationProgress, ChurnRiskAssessment — todos são computados e descartados. |
| **Error Recovery** | `buildAcknowledgment()` gera mensagem, mas não a entrega em canal algum. `channel: 'whatsapp' | 'dashboard' | 'email' | 'silent'` é declarativo, não executado. |

### Ausentes (zero implementação)

| Cena | O que falta | UTP correspondente |
|---|---|---|
| **Camada XX — Hypothesis-to-Proof** | Nenhum arquivo existe em `backend/src/kloel/hypothesis-proof/`. Zero implementação de: formulador de hipótese, desenhador de micro-experimento, gateway de autorização, runner com idempotência, observação anti-overclaim, avaliador de prova, atualização de crença no spine | UTP-HYPPROOF-001..008 |
| **Timing Appropriateness Executor** | `evaluateTiming()` existe e é testada, mas nunca é chamada antes de enviar uma mensagem real. O WhatsApp sender não consulta timing. | Integração pendente |
| **Operator Dashboard Integration** | Nenhuma dessas camadas tem endpoint REST exposto. Frontend não consome trustState, silenceDecision, forgottenFollowups, antiRemorseSignal, etc. | Toda a Camada XII |
| **Cross-Scene Event Emission** | Trust decisions não emitem eventos no spine. `decideSilence()` não emite `commerce.lead.silence_chosen`. `shouldHandoff()` não emite evento. Recovery actions não emitem evento. | PCI.1 — domínio `cognition.*` |
| **Prisma Schema** | Não há modelos Prisma para TrustState, ForgottenFollowup, RecoveryTactic, NoRegretState, Hypothesis, Experiment, Proof. | Persistência |

---

## (c) Onde o Baseline Humano / SaaS Comum Vence o Kloel Hoje

| Dimensão | Baseline Humano/SaaS | Kloel Hoje | Gap |
|---|---|---|---|
| **Detecção de objeção** | Vendedor sente hesitação por tom, pausa, pergunta repetida | Detecta keyword-based desperation + brandRisk, mas não lê tom emocional nem hesitação implícita | Moderado |
| **Silêncio estratégico** | Vendedor experiente sabe "dar espaço" intuitivamente | Função pura decide silêncio por thresholds numéricos, mas não executa o wait real (sem scheduler) | Alto — decide mas não age |
| **Retomada pós-silêncio** | Vendedor retorna com novo ângulo, caso de sucesso, pergunta aberta | `proposeRecoveryActions()` sugere táticas abstratas (`provide_value`, `change_channel`) sem conteúdo concreto. `rescueForgottenFollowups()` lista leads mas não age | Alto — sugere mas não executa |
| **Follow-up não esquecido** | CRM manda lembrete, operador humano decide abordagem | Lista ordenada por urgência, mas zero notificação ao operador | Crítico — lista existe, ninguém vê |
| **Pós-venda anti-remorso** | E-mail de boas-vindas + suporte humano disponível | Pipeline sofisticado de 7 fases com 14 detectores, mas não envia mensagem real. `send_reassurance` bloqueia em `requiresHumanApproval: true` sem UI de aprovação | Crítico — pipeline roda no vácuo |
| **Recuperação de erro** | Humano pede desculpas, oferece compensação | 9 templates de acknowledgment + 9 táticas de recovery + proof-package completo. Mas `channel` é declarativo — nenhuma mensagem chega ao destinatário | Crítico — prova existe, ninguém recebe |
| **Loop hipótese→prova** | Gestor testa variação manualmente, anota resultado | Zero implementação | Total |

---

## (d) Mudança Discreta para Subir Cada Cena de N3 para N4+

**Escala de maturidade**: N0 (ausente) → N1 (stub/tipado) → N2 (puro testado) → N3 (integrado em 1 fluxo) → N4 (produção com evidência) → N5 (otimizado com A/B e delta R-tier)

| Cena | Estado Atual | Mudança para N4+ |
|---|---|---|
| **Detecção de insegurança** | N2 (funções puras testadas, 551 linhas de spec) | (1) Persistir TrustState em Prisma com `conversationId` FK. (2) Emitir `cognition.perception_recorded` no spine a cada recomputação de trust state. (3) Expor endpoint `GET /api/cognition/trust/:conversationId` para dashboard do operador. (4) Conectar `TrustStateTrackerService` ao fluxo real de mensagens WhatsApp (chamar `trackConversation` a cada inbound/outbound). |
| **Silêncio como ação** | N2 (função pura testada) | (1) Criar BullMQ job `silence-reevaluate` com delay computado de `decideSilence()`. (2) Quando `remainSilent: true`, bloquear outbound daquela conversa no WhatsApp sender. (3) Emitir `cognition.attention_shifted` com `reason: 'silence_chosen'`. (4) Expor no dashboard: "Kloel escolheu silêncio para lead X — motivo: fadiga 0.9". |
| **Retomada honesta** | N2 (funções testadas, sem executor) | (1) Conectar `proposeRecoveryActions()` ao WhatsApp outbound: se ação = `provide_value`, injetar no ABI do próximo reply. (2) `rescueForgottenFollowups()` → expor via endpoint REST + enviar notificação ao operador (e-mail ou dashboard badge). (3) `SmartHandoffService` → empacotar e enviar via WhatsApp/email ao operador designado. |
| **Checkout** | N3 (85% funcional, Tier 1) | Já emiti eventos no spine (`commerce.payment.approved`, `commerce.payment.declined`). Verificar se `commerce.cart.*` e `commerce.lead.converted` estão sendo emitidos. Se sim, N3→N4 é questão de cobertura de testes E2E + PIX capability na Stripe live. |
| **Pós-venda sem arrependimento** | N3 (pipeline composto testado, 1418+ linhas de spec, emite eventos no spine) | (1) Conectar `AntiRemorseService.recommendedAction` ao WhatsApp sender: `send_welcome` → enviar msg de boas-vindas real; `send_reassurance` → criar draft para owner review (UI pendente). (2) Persistir `NoRegretState` em Prisma por `entityRef`. (3) Expor endpoints REST para dashboard: `GET /api/postsale/no-regret/:entityId`, `GET /api/postsale/activation/:entityId`. (4) SatisfactionCollector → conectar coleta de NPS a trigger real (WhatsApp botão ou link). |
| **Recuperação de erro** | N2 (funções testadas, zero entrega) | (1) `buildAcknowledgment()` com `channel: 'whatsapp'` → enviar via WhatsApp sender. (2) `channel: 'dashboard'` → expor via endpoint REST. (3) `channel: 'email'` → conectar ao serviço de e-mail. (4) `buildRecoveryProofPackage()` → persistir e expor no dashboard semanal do operador. |
| **Hypothesis-to-Proof** | N0 (zero código) | Criar `backend/src/kloel/hypothesis-proof/` com: (a) `hypothesis-formulator.ts` — detecta padrão de objeção/falha e formula hipótese testável, (b) `micro-experiment-designer.ts` — desenha teste A/B mínimo (ex: variação de mensagem de retomada), (c) `authorization-gateway.ts` — requer aprovação do owner antes de rodar, (d) `experiment-runner.ts` — executa com idempotência via BullMQ, (e) `proof-evaluator.ts` — avalia confirmou/refutou/inconclusivo com threshold estatístico, (f) `belief-updater.ts` — emite `cognition.belief_updated` no spine. |

---

## (e) Tempo Estimado até Valor Percebido por Cena

| Cena | Hoje (estado atual) | Ideal (N4+ com integração) |
|---|---|---|
| Detecção de insegurança | **0 min** — operador não vê trust state; não há dashboard | **< 5 min** — operador abre conversa e vê trust score + flags no dashboard |
| Silêncio como ação | **0 min** — silêncio não é executado; outbound continua sem bloqueio | **Instantâneo** — ao atingir threshold, outbound bloqueia; operador vê badge "Kloel em silêncio" |
| Retomada honesta | **0 min** — leads esquecidos nunca são notificados ao operador | **< 1h** — operador recebe notificação "3 leads esquecidos > 72h" com sugestão de abordagem |
| Checkout | **~2 min** — checkout funciona (Stripe), mas sem integração cognitiva | **~1 min** — checkout emite eventos; trust state atualiza automaticamente |
| Pós-venda | **0 min** — pipeline decide mas não age; cliente não recebe nada | **< 5 min** — cliente recebe welcome em WhatsApp; operador vê fase de no-regret no dashboard |
| Recuperação de erro | **0 min** — acknowledgment gerado mas nunca entregue | **< 15 min** — após detecção de erro, cliente recebe mensagem de reconhecimento; operador vê proof-package |
| Hypothesis-to-Proof | **∞** — não existe | **7-30 dias** — primeira hipótese formulada → experimento aprovado → prova obtida |

---

## (f) Classe de Risco por Cena

| Cena | Classe | Justificativa |
|---|---|---|
| Detecção de insegurança | **R1** | Funções puras, sem side effects, só leem estado. Sem risco de perda financeira ou dados. |
| Silêncio como ação | **R2** | Bloquear outbound afeta receita potencial. Falso positivo (silenciar lead quente) = perda de venda. Exige `leadOutcomeGuardrail` + rollback claro. Já implementado no contrato. |
| Retomada honesta | **R2** | Enviar mensagem de retomada para lead em silêncio pode piorar relação se timing errado. Contratos de delegação (`SuggestionR1Contract`) já incluem `antiPressureLanguage` e `respectsSilenceWindow`. |
| Checkout | **R3** | Dinheiro real. Stripe Connect Platform Model. Exige idempotência, audit trail, centavos em bigint. Já coberto por ADR-0003 e regras de pagamento do CLAUDE.md. |
| Pós-venda | **R2** | `send_reassurance` toca lead pós-compra com risco de remorse. Exige `requiresHumanApproval: true`. `send_welcome` é R2 mas sem human approval — risco controlado por contrato de rollback. |
| Recuperação de erro | **R2** | `acknowledge_mistake` toca reputação. Templates são honestos e não-defensivos. Risco está na entrega (canal errado, timing errado), não no conteúdo. |
| Hypothesis-to-Proof | **R3** | Experimentos tocam clientes reais (A/B de mensagem). Exige authorization gateway + idempotência + rollback. Camada XX depende de DELEG (XIII) + RECOVERY (XIV) + OWNER-CRIT (XVI) maduros. |

---

## (g) Hábito Novo Exigido por Cena

| Cena | Hábito Novo |
|---|---|
| Detecção de insegurança | **Ler trust state antes de responder.** Operador consulta dashboard (ou confia no bloqueio automático) antes de enviar mensagem manual. Sem isso, trust state é computed but ignored. |
| Silêncio como ação | **Aceitar que silêncio é ação.** Operador e dono precisam internalizar que "Kloel não respondeu" não é bug — é decisão consciente com razão auditável. Requer mudança cultural: silêncio não é falha. |
| Retomada honesta | **Revisar sugestões do Kloel antes de agir.** Operador recebe notificação de follow-up esquecido e decide (dismiss/accept/override). Exige disciplina de revisão diária, não reativa. |
| Checkout | **Confiar que o motor comercial emite eventos.** Todo checkout concluído automaticamente alimenta trust + post-sale. Dono não precisa trigger manual. |
| Pós-venda | **Não "dar parabéns" após venda.** Kloel não celebra venda — monitora ativação e primeiro valor. Dono/operador precisa aceitar que welcome message é funcional (próximo passo), não emocional (parabéns). |
| Recuperação de erro | **Deixar o Kloel admitir erro.** Operador não esconde falha — o sistema detecta, reconhece e oferece reparação. Exige maturidade: transparência > imagem. |
| Hypothesis-to-Proof | **Operar por evidência, não por intuição.** Toda melhoria de conversão passa por hipótese → experimento → prova. Dono autoriza micro-testes; Kloel mede e conclui. Exige paciência estatística. |

---

## 5 Recomendações Priorizadas

### 1. Conectar Post-Sale ao WhatsApp Sender (R2 → produção em 2-4 dias)

**Por que primeiro**: É a cena com maior densidade de código testado (1418+ linhas de spec, 14 detectores, pipeline de 7 fases) e o gap mais gritante: decide tudo mas não entrega nada ao cliente.

**Ação**: Criar `PostSaleOutboundDispatcher` que lê `AntiRemorseSignal.recommendedAction` e `NoRegretState.phase` e dispara mensagem WhatsApp real via o sender existente. Para `send_reassurance` (requer human approval), criar endpoint `POST /api/postsale/approve-reassurance` e badge no dashboard. Para `send_welcome`, dispatcher automático com rate-limit.

**Valor imediato**: Cliente recebe welcome em WhatsApp ≤5 min após checkout. Operador vê fase de no-regret.

### 2. Persistir Trust State + Expor Dashboard do Operador (R1 → N4 em 3-5 dias)

**Por que segundo**: Trust é a camada que alimenta silêncio, retomada e handoff. Sem persistência, o estado some a cada deploy. Sem dashboard, o operador nunca vê o que o Kloel sabe.

**Ação**: Criar model Prisma `TrustState` com campos do `TrustState` interface + `conversationId` FK. Migrar `TrustStateTrackerService.store` de `Map` para Prisma. Expor endpoint `GET /api/cognition/trust/:conversationId`. Criar componente de dashboard mostrando trustScore, fatigueLevel, brandRiskFlags ativos.

**Valor imediato**: Operador abre conversa e vê "Trust: 0.62 | Fatigue: 0.8 | 2 brand risks". Silêncio deixa de ser invisível.

### 3. Implementar Silence Scheduler + Bloqueio de Outbound (R2 → N4 em 3-5 dias)

**Por que terceiro**: Sem executor, `decideSilence()` é diagnóstico sem tratamento. Leads fatigados continuam recebendo mensagem.

**Ação**: Criar `SilenceEnforcer` que: (a) a cada `trackConversation()`, se `remainSilent: true`, seta flag `outbound_blocked_until` na conversa, (b) WhatsApp sender consulta flag antes de enviar, (c) BullMQ job `silence-reevaluate` agenda re-avaliação após cooling period, (d) ao re-avaliar e decidir `remainSilent: false`, remove flag e permite outbound.

**Valor imediato**: Lead fatigado para de receber mensagem. Operador vê badge "Kloel em silêncio — motivo: fadiga".

### 4. Conectar Recovery Pipeline ao Canal Real (R2 → N4 em 3-5 dias)

**Por que quarto**: Recovery é a camada que converte erro em confiança (B0.2, R18). Sem entrega real, é a promessa mais nobre do organismo que fica no papel.

**Ação**: Criar `RecoveryDispatcher` que lê `buildAcknowledgment().channel` e entrega: `whatsapp` → WhatsApp sender, `dashboard` → endpoint REST, `email` → mail service, `silent` → log estruturado. Para `error-damage-recovery.tactics.ts`, conectar táticas `small_concession` / `discount_offer` ao billing (requer owner approval gate).

**Valor imediato**: Cliente recebe "Uma conversa foi transferida para atendimento humano. O sistema registrou para melhoria contínua." sem anthropomorfismo.

### 5. Criar Camada XX — Hypothesis-to-Proof (R3 → N2 em 5-7 dias)

**Por que quinto**: É a única cena com zero código. Sem ela, o loop "hipótese → teste → conclusão" não fecha, e o organismo não aprende com os próprios erros/detetores. Mas depende de RECOVERY + DELEG maduros, então vai para N2 (puro + testado) primeiro.

**Ação**: Criar `backend/src/kloel/hypothesis-proof/` com 6 módulos puros: `hypothesis-formulator.ts` (detecta padrão de objection/silence/failure → formula hipótese), `micro-experiment-designer.ts` (desenha variação A/B mínima), `authorization-gateway.ts` (aprovação owner), `experiment-runner.ts` (idempotente via BullMQ), `proof-evaluator.ts` (confirmou/refutou/inconclusivo), `belief-updater.ts` (emite `cognition.belief_updated`). Todos testados com contrato, sem integração com produção nesta onda.

**Valor imediato**: Contrato de aprendizado fechado. Primeira hipótese formulável: "Leads com objection_raised + went_silent convertem 40% mais se retomados com caso de sucesso vs. pergunta aberta."

---

## Sumário de Maturidade por Cena

| Cena | Nível Atual | Arquivos | Spec Lines | Persistência | Integração Real | Gap Principal |
|---|---|---|---|---|---|---|
| Detecção de insegurança | N2 | 10 TS + 1 spec | 551 | In-memory Map | Nenhuma | Sem dashboard, sem persistência |
| Silêncio como ação | N2 | 1 TS puro + spec | Embebido em trust.spec | N/A (puro) | Nenhuma | Sem scheduler, sem bloqueio real |
| Retomada honesta | N2 | 7 TS + 1 spec | ~200 (team.spec) | Nenhuma | Nenhuma | Sem executor de sugestões |
| Checkout | N3 | Fora do escopo | Fora do escopo | Stripe + Prisma | Parcial | PIX capability live pendente |
| Pós-venda | N3 | 15 TS + 1 spec | 1418+ | Nenhuma | Parcial (emite eventos spine) | Sem dispatcher de mensagens |
| Recuperação de erro | N2 | 11 TS + 2 specs | ~300 (recovery.spec) | Nenhuma | Nenhuma | Sem dispatcher de canal |
| Hypothesis-to-Proof | N0 | 0 | 0 | Nenhuma | Nenhuma | Zero código |

**Conclusão**: A jornada flagship tem esqueleto cognitivo excepcionalmente bem tipado e testado (N2-N3), mas está **100% desconectada dos canais de entrega**. O organismo decide, mas não age. A prioridade absoluta é conectar as decisões aos canais (WhatsApp, dashboard, e-mail) — isso transforma 6 cenas de N2→N4 em uma única onda de integração. A Camada XX (Hypothesis-to-Proof) é o único bloco verdadeiramente ausente e fecha o ciclo de aprendizado.
