# PCI.6 — Tabela Canônica de Superfícies B17

> **Documento canônico imutável.** Onda 0 / UTP-PCI-006. Mapeia cada
> superfície comercial do produto (B17 — toda superfície comercial é tecido
> cognitivo) aos eventos canônicos que DEVE emitir em transições significativas.
>
> **Nome canônico**: `kloel-cognitive-organism-pci-6`
> **Versão**: `1.0.0`
> **Status**: `frozen` após selo final em UTP-PCI-008.

---

## 1. Princípio

Por B17, toda superfície comercial participa da cognição. Forma técnica de
implementação é livre; **semântica de emissão é canônica**. Cada superfície
DEVE emitir os eventos canônicos da sua coluna em transições significativas
do seu domínio.

Falha de superfície a emitir evento canônico em transição significativa é
**tensão** detectada pela Camada III (`goal_field.tension_detected` com
detector `backend_without_surface`).

V15 (verificação de dissolução): cada superfície relevante emite eventos
cognitivos. Sem isso, dissolução não é verificável.

## 2. Tabela Canônica

### 2.1 Checkout / Wallet / Billing

**Diretórios típicos**: `backend/src/checkout/`, `backend/src/wallet/`,
`backend/src/billing/`, `backend/src/stripe/`, `backend/src/payments/`.

| Transição | Evento canônico (PCI.1) | Notas |
|---|---|---|
| Item entra em carrinho ativo | `commerce.cart.created` | `payload.items`, `payload.totalCents` |
| Carrinho sem progressão por janela (default 30min) | `commerce.cart.abandoned` | scheduler ou worker emite; idempotente por carrinho |
| Checkout iniciado (intent declarada) | `commerce.cart.checkout_initiated` | precede payment intent |
| Stripe `payment_intent.created` | `commerce.payment.initiated` | webhook desduplicado por `provider+externalId` |
| Stripe `payment_intent.succeeded` (ou Asaas equivalente, MP equivalente) | `commerce.payment.approved` | terminal positivo; valência `positive` salvo se receita ruim detectada (B0.7 → `ambiguous`) |
| Stripe `payment_intent.payment_failed` | `commerce.payment.declined` | terminal negativo |
| Stripe `charge.refunded` | `commerce.payment.refunded` | terminal negativo |
| Stripe `charge.dispute.created` | `commerce.payment.charged_back` | terminal negativo grave |

### 2.2 CRM

**Diretórios típicos**: `backend/src/crm/`, `backend/src/deals/`,
`backend/src/pipeline/`.

| Transição | Evento canônico | Notas |
|---|---|---|
| Lead/deal muda de estágio | `commerce.crm.stage_changed` | `payload.fromStage`, `payload.toStage` |
| Atribuição de dono (humano ou autopilot) | `commerce.crm.owner_assigned` | `payload.ownerType: "human" | "autopilot"`, `payload.ownerId` |
| Próximo passo registrado | `commerce.crm.next_step_defined` | `payload.action`, `payload.dueAt` |
| Deal fechado positivamente | `commerce.crm.deal_won` | terminal positivo |
| Deal fechado negativamente | `commerce.crm.deal_lost` | terminal negativo; `payload.lossReason` |
| Detector classifica mensagem como objeção | `commerce.lead.objection_raised` | `truthMode: "inferred"`; `payload.objectionKind` |

### 2.3 WhatsApp / Inbox

**Diretórios típicos**: `backend/src/whatsapp/`, `backend/src/inbox/`,
`worker/whatsapp-*`, `backend/src/meta/`, `backend/src/waha/`.

| Transição | Evento canônico | Notas |
|---|---|---|
| Mensagem recebida (WAHA inbound ou Meta webhook) | `commerce.whatsapp.message_received` | desduplicar por `provider+externalId` |
| Read receipt do destinatário | `commerce.whatsapp.message_read` | quando provedor envia |
| Reply enviado pelo organismo ou operador | `commerce.whatsapp.message_replied` | `payload.author: "autopilot" | "human" | "lead"` |
| Conversa muda para `humanHandoff: true` | `commerce.whatsapp.handoff_to_human` | `payload.reason` |
| Após silêncio ou handoff, conversa retoma | `commerce.whatsapp.conversation_resumed` | `causedBy` aponta para silêncio/handoff |
| QR/connect/disconnect/banimento | `commerce.whatsapp.session_lifecycle` | `payload.event: "qr" | "connected" | "disconnected" | "banned"` |

### 2.4 Campanhas / Anúncios

**Diretórios típicos**: `backend/src/campaigns/`, `backend/src/ads/`,
`backend/src/meta-ads/`, `backend/src/google-ads/`.

| Transição | Evento canônico | Notas |
|---|---|---|
| Click qualificado em criativo | `commerce.campaign.clicked` | `payload.creativeId`, `payload.utm` |
| Conversão atribuída a campanha | `commerce.campaign.conversion_associated` | modelo de atribuição em `payload.attributionModel` |
| Audiência atinge marco | `commerce.campaign.audience_reached` | `payload.metric: "impressions" | "unique_reach" | ...` |
| Criativo trocado | `commerce.campaign.creative_swapped` | `payload.fromCreativeId`, `payload.toCreativeId`, `payload.swappedBy` |
| Detector de fadiga ou queda emite alerta | `commerce.campaign.performance_drop_detected` | `truthMode: "inferred"`; `payload.dropPct` |

### 2.5 Member Area / Affiliate

**Diretórios típicos**: `backend/src/member-area/`, `backend/src/affiliate/`,
`backend/src/courses/`.

| Transição | Evento canônico | Notas |
|---|---|---|
| Usuário matriculado em curso/área | `commerce.member_area.enrolled` | terminal positivo de POSTSALE |
| Marco de progresso atingido | `commerce.member_area.progressed` | `payload.milestone` |
| Inatividade acima de janela | `commerce.member_area.dropped_out` | pode promover `commerce.post_sale.churn_risk_detected` |
| Janela de performance fecha | `commerce.affiliate.performance_measured` | `payload.window`, `payload.metrics` |
| Comissão calculada para janela | `commerce.affiliate.commission_calculated` | `payload.commissionCents` |

### 2.6 KYC / Auth

**Diretórios típicos**: `backend/src/kyc/`, `backend/src/auth/`.

| Transição | Evento canônico | Notas |
|---|---|---|
| Documento entra em fila de validação | `commerce.kyc.document_submitted` | `payload.docType` |
| KYC aprovado | `commerce.kyc.approved` | terminal positivo |
| KYC rejeitado | `commerce.kyc.rejected` | terminal negativo; `payload.reason` estruturado |

### 2.7 Pós-venda / LTV

**Diretórios típicos**: `backend/src/post-sale/`, `backend/src/customer/`,
`backend/src/retention/` (alguns podem não existir e nascer com a Onda 1
EVENT-EMIT-POSTSALE).

| Transição | Evento canônico | Notas |
|---|---|---|
| Produto/serviço entregue | `commerce.post_sale.delivery_completed` | precede activation |
| Cliente começa a usar (login, primeiro acesso) | `commerce.post_sale.activation_started` | |
| Cliente atinge primeiro marco de valor real | `commerce.post_sale.first_value_obtained` | terminal positivo crítico (R22) |
| Sinal de satisfação coletado | `commerce.post_sale.satisfaction_signal_observed` | `payload.signalType: "nps" | "csat" | "behavioral" | ...` |
| Pedido de depoimento emitido | `commerce.post_sale.testimonial_requested` | `causedBy` aponta para satisfaction signal |
| Janela ótima para upsell/recompra detectada | `commerce.post_sale.repurchase_window_opened` | `truthMode: "inferred"` |
| Sinal de risco de churn | `commerce.post_sale.churn_risk_detected` | `truthMode: "inferred"`; `payload.riskScore` |
| Janela de reconquista após churn | `commerce.post_sale.win_back_window_opened` | `causedBy` aponta para churn |

## 3. Auditor de Razão Evento:Transição (UTP-EVENT-EMIT-AUDIT-001)

Auditor verifica para cada superfície:

- **Cobertura**: cada transição listada na tabela acima tem evento emitido?
- **Razão ≥ 1:1**: cada transição que ocorre no código gera ≥1 evento canônico
  no spine.
- **Sem ausência**: superfícies que processam transições significativas mas
  não emitem nenhum evento canônico falham auditoria.

Falha do auditor → tensão detectada por Camada III → objetivo emergente
"emitir eventos para superfície X".

## 4. Convenções de Implementação (orientação, não literal)

Subagent escolhe pattern técnico:

- **Event emitter centralizado** por superfície (recomendado): cada
  controller/service que toca a superfície chama `emitter.emit(eventName,
  payload)`.
- **Domain event publisher** (CQRS-like): operações de escrita publicam
  eventos como side effect transacional.
- **Webhook handler**: webhooks externos viram eventos canônicos após
  desduplicação.

Não importa o pattern — importa a **semântica** definida nesta tabela.

## 5. Compromissos de UTPs Consumidoras

- Toda UTP da Família EVENT-EMIT (Onda 1) referencia este documento e
  implementa a tabela da sua superfície.
- Toda UTP de Camada III (GOAL detectores) consome eventos da tabela.
- Toda UTP de Camada V (LOCAL-IDENT), VI (WISDOM), VII (INSIGHT), VIII
  (MATURITY), etc. consome eventos da tabela como substrato.
- Subagent que emite evento fora da taxonomia (PCI.1 §3) é rejeitado.
- Subagent que processa transição significativa sem emitir evento da tabela é
  detectado pelo auditor (UTP-EVENT-EMIT-AUDIT-001) como ausência.

## 6. Expansão da Tabela

Adicionar superfície nova ou evento novo a superfície existente requer:

1. ADR documentado.
2. Bump minor do PCI.
3. Revisão pelo dono do repositório.
4. Atualização da tabela neste documento.
5. UTP nova de EVENT-EMIT criada.

Subagents NÃO podem inventar superfície ou evento novo.

---

**Fim de PCI.6.** Hash a ser registrado em `docs/contracts/pci/CHECKSUMS.txt`
após congelamento da Onda 0.
