# PCI.1 — Taxonomia Canônica de Eventos do Spine

> **Documento canônico imutável.** Gerado em 2026-05-13 como parte da Onda 0
> (UTP-PCI-001). Toda UTP de qualquer onda subsequente DEVE referenciar esta
> taxonomia. Adição de novo evento requer bump de versão minor; mudança de
> semântica de evento existente requer bump major + ADR explícito autorizado
> pelo dono do repositório.
>
> **Nome canônico**: `kloel-cognitive-organism-pci-1`
> **Versão**: `1.0.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

---

## 1. Princípio

Todo evento no spine cognitivo é **fato**, não opinião. Carrega proveniência
rastreável, modo de verdade explícito (`observed | inferred | projected`) e —
quando terminal — valência. Eventos são **append-only** e nunca editados.
Reinterpretação acontece via novo evento que cita o anterior, nunca por
overwrite.

Eventos são a **única forma de memória do organismo**. LLM não decide o que
lembrar (B4); cada operação cognitiva ou comercial deixa traço estrutural via
emissão de evento.

## 2. Forma do Nome Canônico

```
<dominio>.<entidade>.<acao>
```

- `dominio` ∈ enumeração canônica abaixo (lista mínima, expandível com bump
  minor, **nunca** substituível).
- `entidade` é o nome do agregado/entidade primária do domínio.
- `acao` é verbo no passado quando o evento descreve fato consumado, ou
  substantivo quando descreve transição de estado.

Exemplos válidos: `commerce.lead.replied`, `cognition.belief_updated`,
`commerce.cart.abandoned`, `pulse.gate_failed`.

Inválidos: `lead.responded` (sem domínio), `commerce.LeadReplied` (case errado),
`commerce.lead.willReply` (não é fato consumado).

## 3. Domínios Canônicos

Lista mínima e canônica. Subagents NÃO podem inventar domínio novo. Adição de
domínio novo requer ADR + bump minor do PCI.

### 3.1 `lineage.*` — Identidade e linhagem

| Evento canônico | Quando emitir |
|---|---|
| `lineage.genesis` | Bootstrap absoluto do organismo. Emitido **uma única vez** na história do sistema; subsequente referência usa o mesmo `eventId`. |
| `lineage.capability_acquired` | Capability nova é registrada no capability-registry com runtime evidence > 0%. |
| `lineage.skill_consolidated` | Skill atinge maturidade `productionReady` em ≥3 ciclos PULSE não-regressivos. |
| `lineage.ciclo_pulse_nao_regressivo` | PULSE certifica ciclo completo sem regressão de capacidade. |

Eventos `lineage.*` são **globais** (sem `workspaceId`). Eles descrevem o
organismo como linhagem única, não a operação por workspace.

### 3.2 `cognition.*` — Operações cognitivas internas

| Evento canônico | Quando emitir |
|---|---|
| `cognition.perception_recorded` | Input do mundo (mensagem, webhook, query) parseado e estruturado. |
| `cognition.belief_updated` | Belief no spine sobre lead/produto/conversa muda probabilidade ou conteúdo. |
| `cognition.prediction_made` | Predictive coding gera predição explícita (B5). |
| `cognition.surprise_observed` | Predição ≠ observação acima de threshold definido. |
| `cognition.attention_shifted` | Alvo de atenção muda (Camada XII / MIND-ATT). |
| `cognition.valence_assigned` | Valência atribuída a evento terminal (B7). |
| `cognition.working_memory_promoted` | Item de working memory promovido para episódica. |
| `cognition.episodic_consolidated` | Episódico promovido para consolidada (worker contínuo, B8). |

Carregam `workspaceId` quando a cognição é local a um workspace; podem ser
globais quando descrevem operação do organismo (ex.: predição cross-workspace
agregada, raríssimo).

### 3.3 `commerce.lead.*` — Ciclo de vida do lead

| Evento | Quando |
|---|---|
| `commerce.lead.created` | Novo lead capturado por qualquer superfície (form, WhatsApp inbound, ad click qualificado). |
| `commerce.lead.contacted` | Primeira mensagem enviada pelo organismo OU pelo time humano ao lead. |
| `commerce.lead.replied` | Lead responde após contato. |
| `commerce.lead.went_silent` | Lead deixa de responder por janela definida (default ≥48h sem reply). |
| `commerce.lead.objection_raised` | Detector classifica mensagem como objeção (preço, prazo, confiança, etc.). |
| `commerce.lead.qualified` | Lead atinge critério de qualificação do workspace (BANT, MEDDIC ou critério local). |
| `commerce.lead.lost` | Lead marcado como perdido (não responde após win-back, recusa explícita, lead morto). |
| `commerce.lead.converted` | Lead vira cliente pagante (encadeia `commerce.payment.approved`). |

### 3.4 `commerce.cart.*` — Carrinho e checkout

| Evento | Quando |
|---|---|
| `commerce.cart.created` | Item entra em carrinho ativo. |
| `commerce.cart.abandoned` | Carrinho sem progressão por janela definida (default 30min sem checkout). |
| `commerce.cart.checkout_initiated` | Checkout iniciado (intenção declarada). |

### 3.5 `commerce.payment.*` — Pagamento

| Evento | Quando |
|---|---|
| `commerce.payment.initiated` | Payment intent criado (Stripe `payment_intent.created`). |
| `commerce.payment.approved` | Pagamento confirmado. **Terminal positivo**, exige `valence: positive` (com ressalva de B0.7 — se receita ruim detectada, valência pode ser `ambiguous`). |
| `commerce.payment.declined` | Pagamento recusado. **Terminal negativo**, `valence: negative`. |
| `commerce.payment.refunded` | Reembolso processado. **Terminal negativo**, `valence: negative`. |
| `commerce.payment.charged_back` | Chargeback registrado. **Terminal negativo grave**, `valence: negative`, eleva risco no insight engine. |

### 3.6 `commerce.crm.*` — Pipeline e relacionamento

| Evento | Quando |
|---|---|
| `commerce.crm.stage_changed` | Lead/deal muda de estágio no pipeline. |
| `commerce.crm.owner_assigned` | Atribuição de dono humano ou autopilot. |
| `commerce.crm.next_step_defined` | Próximo passo registrado (ação + prazo). |
| `commerce.crm.deal_won` | Deal fechado positivamente. **Terminal positivo**. |
| `commerce.crm.deal_lost` | Deal fechado negativamente. **Terminal negativo**. |

### 3.7 `commerce.whatsapp.*` — WhatsApp/Inbox

| Evento | Quando |
|---|---|
| `commerce.whatsapp.message_received` | Mensagem entra (WAHA ou Meta Cloud API). |
| `commerce.whatsapp.message_read` | Mensagem marcada como lida pelo destinatário (read receipt). |
| `commerce.whatsapp.message_replied` | Reply enviado pelo organismo OU operador humano. |
| `commerce.whatsapp.handoff_to_human` | Conversa muda para `humanHandoff: true`. |
| `commerce.whatsapp.conversation_resumed` | Após silêncio ou handoff, conversa retoma. |
| `commerce.whatsapp.session_lifecycle` | QR/connect/disconnect/banimento — eventos de sessão, **não** de conversa. |

### 3.8 `commerce.campaign.*` — Anúncios e campanhas

| Evento | Quando |
|---|---|
| `commerce.campaign.clicked` | Click qualificado em criativo de campanha. |
| `commerce.campaign.conversion_associated` | Conversão atribuída a campanha (last-click ou modelo definido). |
| `commerce.campaign.audience_reached` | Audiência atinge marco (impressões, alcance único). |
| `commerce.campaign.creative_swapped` | Criativo trocado pelo operador ou autopilot. |
| `commerce.campaign.performance_drop_detected` | Detector de fadiga/queda emite alerta (Camada XXIV/XXVIII também). |

### 3.9 `commerce.member_area.*` — Área de membros

| Evento | Quando |
|---|---|
| `commerce.member_area.enrolled` | Usuário matriculado em curso/área. **Terminal positivo de POSTSALE-001**. |
| `commerce.member_area.progressed` | Marco de progresso atingido (módulo concluído, lição assistida acima de threshold). |
| `commerce.member_area.dropped_out` | Inatividade acima de janela; pode promover `commerce.post_sale.churn_risk_detected`. |

### 3.10 `commerce.affiliate.*` — Afiliados

| Evento | Quando |
|---|---|
| `commerce.affiliate.performance_measured` | Janela de performance fecha (diária, semanal). |
| `commerce.affiliate.commission_calculated` | Comissão calculada para janela. |

### 3.11 `commerce.kyc.*` — KYC

| Evento | Quando |
|---|---|
| `commerce.kyc.document_submitted` | Documento entra em fila de validação. |
| `commerce.kyc.approved` | KYC aprovado. **Terminal positivo**. |
| `commerce.kyc.rejected` | KYC rejeitado. **Terminal negativo**, exige razão estruturada. |

### 3.12 `commerce.post_sale.*` — Pós-venda e LTV

| Evento | Quando |
|---|---|
| `commerce.post_sale.delivery_completed` | Produto/serviço entregue. |
| `commerce.post_sale.activation_started` | Cliente começa a usar (login, primeiro acesso). |
| `commerce.post_sale.first_value_obtained` | Cliente atinge primeiro marco de valor real (Camada XVIII). |
| `commerce.post_sale.satisfaction_signal_observed` | Sinal de satisfação coletado (NPS, CSAT, comportamento positivo). |
| `commerce.post_sale.testimonial_requested` | Pedido de depoimento emitido. |
| `commerce.post_sale.repurchase_window_opened` | Janela ótima para upsell/recompra detectada. |
| `commerce.post_sale.churn_risk_detected` | Sinal de risco de churn dispara. |
| `commerce.post_sale.win_back_window_opened` | Janela de reconquista após churn. |

### 3.13 `goal_field.*` — Camada III (Dynamic Goal Field)

| Evento | Quando |
|---|---|
| `goal_field.tension_detected` | Detector multidimensional sinaliza tensão. |
| `goal_field.goal_emerged` | Tensão agregada vira objetivo candidato. |
| `goal_field.goal_promoted` | Objetivo passa critério de impacto + viabilidade + risco. |
| `goal_field.goal_failed_validation` | Objetivo morre na validação (resultado real não confirmou). |

### 3.14 `pulse.*` — PULSE como self-model

| Evento | Quando |
|---|---|
| `pulse.gate_passed` | Gate executa e retorna `PASS`. |
| `pulse.gate_failed` | Gate executa e retorna `FAIL` (modo `log_only` ou `hard_fail`). |
| `pulse.capability_promoted` | Capability sobe nível (`developing` → `operational` → `productionReady`). |
| `pulse.capability_demoted` | Capability cai por regressão. |
| `pulse.certification_cycle_completed` | Ciclo completo de certificação fechado. |

### 3.15 `legitimacy.*` — Camada XXXIII

| Evento | Quando |
|---|---|
| `legitimacy.consent_given` | Consentimento explícito registrado (LGPD/GDPR/CCPA). |
| `legitimacy.consent_revoked` | Revogação registrada; operações futuras devem respeitar. |
| `legitimacy.policy_violation_detected` | Detector identifica violação potencial. |
| `legitimacy.policy_violation_mitigated` | Mitigação aplicada com sucesso. |
| `legitimacy.regulated_content_flagged` | Conteúdo regulado identificado (saúde, finanças, jurídico). |
| `legitimacy.legal_consult_recommended` | Trigger de consulta humana acionado. |

### 3.16 `incentive.*` — Camada XXXIV

| Evento | Quando |
|---|---|
| `incentive.recommendation_explained` | Recomendação cruzada emite explicação ("porque isso, para você"). |
| `incentive.conflict_detected` | Conflito de interesse identificado. |
| `incentive.silence_chosen` | Organismo opta por silêncio sob conflito. |
| `incentive.disclosure_emitted` | Disclosure de vínculo comercial emitida. |
| `incentive.user_feedback_correcting` | Usuário corrige recomendação; feedback alimenta aprendizado. |

### 3.17 `evolution.*` — Camada XXXII (sob governança humana absoluta)

| Evento | Quando |
|---|---|
| `evolution.gap_detected` | Camada XXXII identifica lacuna própria. |
| `evolution.improvement_proposed` | Proposta de melhoria gerada com evidência. |
| `evolution.human_authorization_granted` | Dono autorizou execução. |
| `evolution.rollback_executed` | Rollback automático ou manual disparado. |

## 4. Campos Obrigatórios Universais

Todo evento DEVE carregar:

| Campo | Tipo (semântico) | Obrigatoriedade | Notas |
|---|---|---|---|
| `eventId` | identificador globalmente único (ULID/UUID v7 recomendado por ordenação temporal) | sempre | Imutável após emissão. |
| `eventName` | string canônica conforme §3 | sempre | Validada contra esta taxonomia em CI. |
| `timestamp` | ISO-8601 com timezone (UTC preferido) | sempre | Momento da emissão, não do fato modelado. |
| `occurredAt` | ISO-8601 com timezone | quando aplicável | Quando o fato modelado realmente aconteceu (≤ `timestamp`). Se ausente, igual a `timestamp`. |
| `workspaceId` | identificador de workspace | quando aplicável | Eventos `lineage.*` e PCI fundamentais são globais (campo ausente). Eventos `commerce.*`, `cognition.*` (locais), `goal_field.*` (locais) DEVEM carregar. |
| `entityRef` | par `{ entityType, entityId }` | quando há entidade primária | Ex.: `{ entityType: 'lead', entityId: 'lead_xyz' }`. |
| `truthMode` | enum `observed | inferred | projected` | sempre | Ver PCI.5. |
| `provenance` | objeto com `{ source, processor, processorVersion, schemaVersion, environment }` | sempre | `source` ∈ `synthetic | production`; `environment` ∈ `dev | staging | prod`. |
| `valence` | enum `positive | negative | neutral | ambiguous` | obrigatório quando o evento é **terminal**; `neutral` em eventos exploratórios | Ver §5. |
| `payload` | objeto livre conforme schema do evento | sempre (pode ser `{}`) | Schema específico definido por UTP que emite. Adições compatíveis sempre permitidas. |
| `causedBy` | array de `eventId` | quando aplicável | Cadeia causal explícita. Permite reconstruir fluxos. |
| `correlationId` | identificador de correlação | quando aplicável | Para agrupar eventos relacionados a uma mesma operação cross-superfície. |

Ausência de campo obrigatório ou violação de tipo é **falha grave** que dispara
gate `evidence-provenance` em modo `hard_fail` a partir da onda E1.

## 5. Eventos Terminais e Valência

Evento é **terminal** quando descreve resultado mensurável de um processo
(positivo, negativo, ambíguo). Eventos terminais OBRIGATORIAMENTE carregam
`valence`:

- `positive`: outcome desejado (`commerce.payment.approved` saudável,
  `commerce.lead.qualified`, `commerce.crm.deal_won`,
  `commerce.post_sale.first_value_obtained`).
- `negative`: outcome indesejado (`commerce.payment.refunded`,
  `commerce.crm.deal_lost`, `commerce.kyc.rejected`,
  `commerce.post_sale.churn_risk_detected`).
- `neutral`: outcome real mas sem polaridade clara (raro em terminais; comum em
  exploratórios como `cognition.attention_shifted`).
- `ambiguous`: outcome positivo de superfície mas com sinal negativo de
  segunda ordem — ex.: venda fechada com refund risk alto (B0.7 violado) ou
  `commerce.lead.converted` para perfil tóxico identificado por scorer.

Eventos **exploratórios** (não-terminais como `cognition.prediction_made`,
`goal_field.tension_detected`) podem usar `neutral` ou omitir valência — mas
recomenda-se sempre marcar para auditoria.

## 6. Imutabilidade e Reinterpretação

- Eventos são **append-only**. Nenhum evento é editado ou removido após
  emissão.
- Reinterpretação acontece via novo evento que cita o anterior em `causedBy`.
  Exemplo: lead marcado como `qualified` mas posteriormente reclassificado emite
  novo `commerce.lead.objection_raised` com `causedBy: ['<eventId-do-qualified>']`,
  preservando a história.
- Bug de emissão (ex.: evento emitido com `truthMode` errado) é tratado por
  novo evento de **correção compensatória** com `provenance.processorVersion`
  marcando a correção. Nunca por edição.

## 7. Ordering e Idempotência

- Ordenação dentro de uma `correlationId` é monotônica por `timestamp`. Em caso
  de relógio fora de ordem (rara), `occurredAt` é a fonte autoritativa.
- Idempotência por `eventId` é garantida pelo barramento. Reprocessamento do
  mesmo `eventId` é no-op.
- Webhooks externos (Stripe, Meta, WAHA) DEVEM ser desduplicados por
  `provider + externalId` antes de virarem evento canônico interno.

## 8. Schema Versioning

- `schemaVersion` em `provenance` é numérico semântico (`1.0.0`).
- Adição de campo opcional ao `payload` de evento existente: bump patch
  (`1.0.1`).
- Adição de campo obrigatório ao `payload`: bump minor (`1.1.0`) + suporte de
  leitura para a versão anterior.
- Mudança de tipo ou semântica de campo existente: bump major (`2.0.0`) +
  ADR + autorização do dono.

## 9. Eventos NÃO Permitidos

- Eventos com `valence: positive` em `commerce.payment.refunded`,
  `commerce.payment.charged_back`, `commerce.kyc.rejected`,
  `commerce.crm.deal_lost`, `commerce.lead.lost`,
  `commerce.post_sale.churn_risk_detected`. Estes são definicionalmente
  negativos.
- Eventos com `truthMode: observed` quando o conteúdo é resultado de
  inferência ou modelo. Mistura de modo de verdade é falha grave (PCI.5).
- Eventos sem `provenance.source` definido (`synthetic` vs `production`). Sem
  isso, `evidence-provenance` falha.
- Eventos `commerce.*` sem `workspaceId`. Sem isolamento de workspace, é
  vazamento estrutural.
- Eventos com `payload` contendo segredo (token, key, cookie, JWT). Detector
  de leak deve falhar antes da persistência.

## 10. Detector de Divergência

Validador automático (UTP-PCI-007) varre commits e rejeita:

- `eventName` que não bate exatamente com taxonomia §3.
- Campos obrigatórios universais ausentes.
- `truthMode` ou `valence` com valor fora dos enums.
- Eventos com `provenance.source` ausente.
- Tentativas de adicionar `eventName` novo sem ADR + bump minor.

## 11. Exemplo Canônico

```json
{
  "eventId": "01JD9X3Y7Z6V8KQNXNS5RTM4FC",
  "eventName": "commerce.lead.replied",
  "timestamp": "2026-05-13T20:14:33.122Z",
  "occurredAt": "2026-05-13T20:14:31.880Z",
  "workspaceId": "wks_kloel_demo_001",
  "entityRef": { "entityType": "lead", "entityId": "lead_8f4c9b" },
  "truthMode": "observed",
  "provenance": {
    "source": "production",
    "processor": "whatsapp-inbound-handler",
    "processorVersion": "1.4.2",
    "schemaVersion": "1.0.0",
    "environment": "prod"
  },
  "valence": "positive",
  "payload": {
    "channel": "whatsapp",
    "messageRef": "msg_a3c9",
    "previousState": "contacted",
    "minutesSinceContact": 14
  },
  "causedBy": ["01JD9X2VABQK1S4WJZ9V8KP6T2"],
  "correlationId": "conv_lead_8f4c9b_01JD9"
}
```

## 12. Compromissos de UTPs Consumidoras

- Toda UTP que emite evento confirma adesão a esta taxonomia em seu teste de
  contrato (`*-contract.spec`).
- Toda UTP que consome evento valida `eventName` contra esta taxonomia antes
  de processar.
- Subagent que diverge é rejeitado na revisão e re-despachado com a UTP
  rebriefada referenciando este documento.

---

**Fim de PCI.1.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
