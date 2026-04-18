# ADR 0003 — Stripe Connect Platform Model como única infra de pagamento

- **Status**: Accepted
- **Data**: 2026-04-17
- **Decisor**: Daniel Penin (dono do repositório)
- **Substitui**: nenhum (Asaas e Mercado Pago são removidos por esta decisão)
- **Plano executável**: [docs/plans/STRIPE_MIGRATION_PLAN.md](../plans/STRIPE_MIGRATION_PLAN.md)

## Contexto

KLOEL hoje processa pagamentos via Asaas (módulo `backend/src/checkout/`, `backend/src/kloel/asaas.service.ts`, 915 LOC) e Mercado Pago (`backend/src/kloel/mercado-pago.service.ts`, 1239 LOC). Existe ainda código Stripe parcial em `backend/src/billing/` (assinaturas da plataforma) e em `backend/src/webhooks/payment-webhook.controller.ts`.

A presença de três providers gera:

- 89 arquivos com referência a Asaas/MP/PIX gateway-específico (~10.4k LOC entre `checkout/` + `kloel/`).
- Schema Prisma poliprovider (`provider`, `gateway`, `externalPaymentId` em `WebhookSubscription`, `KloelSale`, `Payment`, `CheckoutPayment`).
- Fragmentação de UX no frontend (`AsaasTokenizer.tsx`, `lib/mercado-pago.ts`, `/api/mercado-pago/ipn/route.ts`).
- PULSE não consegue medir saúde "checkout" porque os fluxos divergem.
- Impossível implementar a tese-mãe da plataforma (split multi-stakeholder com prioridade Kloel > Fornecedor > Afiliado > Coprodutor > Gerente > Seller) com Asaas/MP — nenhum deles tem primitiva de Connect com transfers secundários sob controle da plataforma.

A conta Stripe live `acct_1TMu2YCHwYjoUDPU` (Kloel Tecnologia LTDA) está aprovada com modelo Plataforma e capabilities `card_payments`, `boleto_payments`, `transfers` ativas. PIX precisa ser solicitado via dashboard Stripe (capability não-ativa hoje).

## Decisão

**Stripe Connect Platform Model com Custom Accounts é a única infra de pagamento da KLOEL.**

Componentes:

1. **Modelo Stripe**: Plataforma (Direct Charges com `on_behalf_of`) + `application_fee_amount` para taxa Kloel + transfers secundários para outros stakeholders. NÃO Marketplace (Separate Charges & Transfers).
2. **Connected Accounts**: tipo `custom` para todas as contas (seller, afiliado, fornecedor, coprodutor, gerente). Seller nunca tem login no Stripe. Toda UX é Kloel.
3. **Onboarding**: 100% custom (formulários KYC próprios chamando API Stripe). Zero marca Stripe visível pro seller.
4. **Dashboard**: 100% custom. API consulta Stripe; seller vê apenas a visão Kloel agregada.
5. **Payouts**: `payouts.schedule.interval: 'manual'` em TODAS as Connected Accounts. Stripe nunca envia automático ao banco — Kloel orquestra.
6. **SplitEngine**: motor próprio em `backend/src/payments/split/` que calcula com prioridade `Kloel > Fornecedor > Afiliado > Coprodutor > Gerente > Seller`. Toda matemática em centavos inteiros (nunca float).
7. **LedgerEngine**: livro-razão interno dual-balance (`pending_cents` / `available_cents`) com maturação escalonada por role. Define quando saldo Stripe vira "sacável" no dashboard Kloel.
8. **FraudEngine**: motor próprio rodando ANTES de cada `PaymentIntent`. Blacklist unificada (CPF/email/IP/device fingerprint) compartilhada entre todos os sellers.
9. **Wallet prepaid**: módulo separado em `backend/src/wallet/` para créditos de uso de API/AI/WhatsApp. Recarga via Stripe `PaymentIntent` simples (sem Connect). Débito em tempo real.
10. **API version pinada**: `apiVersion: '2026-03-25.dahlia'` no SDK (anti-drift).

## Consequências

### Positivas

- Único motor de pagamento — PULSE consegue medir saúde de checkout uniformemente.
- Tese de plataforma híbrida (Shopify + Hotmart + Braip) destravada — split multi-stakeholder com prioridade impossível em Asaas/MP fica nativo aqui.
- Antifraude e Ledger sob controle Kloel — diferencial competitivo defensável.
- Schema Prisma simplifica (`provider`/`gateway` viram enum fechado `STRIPE`).
- CIA (AI agent) pode ler dados de pagamento unificados (não fragmentados entre 3 providers).

### Negativas / custos

- **Migração não-trivial**: ~89 arquivos tocados, deleção de ~2.860 LOC (asaas.service + mercado-pago.service + smart-payment + payment dedicados) e refatoração pesada de `checkout/` (~6.500 LOC).
- **PIX bloqueado por capability**: precisa ser solicitado a Stripe e aprovado fora do código.
- **Onboarding KYC custom é trabalho denso** — formulários + verificação de identidade via Stripe Identity.
- **Responsabilidade jurídica solidária aumenta** — Kloel passa a ser orquestrador formal de transfers, não apenas referrer de gateway. Mitigação: contrato seller forte autorizando retenção.
- **Schema migration com dados existentes**: ordens Asaas/MP em produção (quantidade a confirmar via `psql` Railway) precisam continuar resolvíveis para refund/audit. Solução: campo `provider` mantido como histórico read-only via Adapter.

### Estratégia de cutover (feature flag + dual-write)

NÃO kill-switch. Ordens Asaas/MP existentes precisam ser servíveis para refund/query histórica.

- `Workspace.paymentProvider` enum `STRIPE` (default novo) | `ASAAS_LEGACY` (workspaces criados antes do cutover, até migrarem).
- Adapter pattern: `PaymentProvider` interface + `StripeAdapter` (write/new) + `AsaasAdapter` (read-only/refund-only).
- Novos checkouts: 100% Stripe.
- Após N períodos sem ordens Asaas pendentes (medido por job de limpeza): `AsaasAdapter` é deletado, enum colapsa para `STRIPE`.

## Princípios não-negociáveis

(Aplicáveis a Claude Code, Codex CLI, e qualquer agente que tocar este código)

1. **Centavos inteiros (BigInt)** — nunca `number` para dinheiro. Stripe rejeita split com erro de arredondamento de float.
2. **Coverage 95%+ em SplitEngine, LedgerEngine, FraudEngine** — não-negociável. Bug aqui = prejuízo real e responsabilidade legal.
3. **Idempotência em webhooks** — toda tabela `WebhookEvent` continua valendo, com `@@unique([provider, externalId])`.
4. **Audit trail em ledger** — toda movimentação grava entrada imutável. Sem UPDATE em `ledger_entries`.
5. **Tests passam antes de deletar Asaas** — só remove `asaas.service.ts` quando o equivalente Stripe está em produção verde.
6. **Casca preservada** (regra mestra do CLAUDE.md) — UX visível do checkout não muda durante migração; o motor por baixo é trocado.
7. **Live keys nunca em código de teste** — `sk_test_*` em dev, `sk_live_*` apenas em produção via Railway secret manager.
8. **ADR-driven** — qualquer desvio deste plano exige novo ADR. Não improvisa.

## Alternativas consideradas e rejeitadas

| Alternativa                                       | Por que rejeitada                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Manter Asaas + adicionar Stripe lado-a-lado       | Triplica complexidade. Não destrava SplitEngine. PULSE continua sem conseguir medir.                   |
| Migrar para Pagar.me/Iugu (subadquirente BR)      | Resolve regulatório mas perde Connect Custom Accounts + flexibilidade de transfers secundários.        |
| Stripe Marketplace (Separate Charges & Transfers) | Perde modelo "buyer compra do seller" (Kloel vira merchant-of-record). Aumenta exposição fiscal.       |
| Stripe Express Accounts (não Custom)              | Seller ganharia dashboard Stripe próprio — quebra a tese de "tudo dentro do Kloel, zero marca Stripe". |
| Kill-switch Asaas (deletar tudo de uma vez)       | Quebra resolução de ordens existentes. Risco operacional.                                              |

## Referências

- Stripe docs: [Connect overview](https://docs.stripe.com/connect), [Custom accounts](https://docs.stripe.com/connect/custom-accounts), [Direct charges](https://docs.stripe.com/connect/direct-charges), [Manual payouts](https://docs.stripe.com/connect/manual-payouts).
- Plano executável detalhado: [docs/plans/STRIPE_MIGRATION_PLAN.md](../plans/STRIPE_MIGRATION_PLAN.md).
- Conversa estratégica que originou esta decisão: arquivada na sessão Claude Code de 2026-04-17 (memória `project_stripe_migration.md`).
