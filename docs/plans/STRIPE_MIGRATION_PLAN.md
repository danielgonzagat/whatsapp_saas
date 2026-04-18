# STRIPE CUTOVER PLAN

> **Status**: Completed.
> **ADR fundador**: [docs/adr/0003-stripe-connect-platform-model.md](../adr/0003-stripe-connect-platform-model.md)
> **Estado atual**: Stripe é a única infraestrutura ativa de pagamento do KLOEL.

## Objetivo

Consolidar checkout, Pix, webhooks, wallet, refunds e fluxos públicos em Stripe, removendo provedores legados do runtime ativo e deixando o repositório pronto para evolução do `Payment Kernel` sobre uma base única.

## Resultado entregue

- Checkout público consolidado em Stripe.
- Pix de teste mantido no fluxo principal.
- Webhook de pagamento consolidado em [backend/src/webhooks/payment-webhook.controller.ts](../../backend/src/webhooks/payment-webhook.controller.ts).
- Serviços de pagamento do Kloel consolidados em Stripe:
  - [backend/src/kloel/payment.service.ts](../../backend/src/kloel/payment.service.ts)
  - [backend/src/kloel/smart-payment.service.ts](../../backend/src/kloel/smart-payment.service.ts)
  - [backend/src/kloel/unified-agent.service.ts](../../backend/src/kloel/unified-agent.service.ts)
- Frontend público e social checkout alinhados ao contrato Stripe:
  - [frontend/src/app/(public)/pay/[id]/page.tsx](<../../frontend/src/app/(public)/pay/[id]/page.tsx>)
  - [frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts](<../../frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts>)
  - [frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx](<../../frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx>)
- Dependências legadas removidas de `backend/package.json` e `frontend/package.json`.
- Testes de integração/simulação convertidos para webhook Stripe.

## Evidência de validação

- `npm --prefix backend run typecheck` ✅
- `npm --prefix frontend run typecheck` ✅
- `npm --prefix backend test` ✅
- `npm --prefix frontend test` ✅

## Invariantes vigentes

- Stripe é o único provider de pagamento ativo.
- Toda evolução de pagamento deve partir do `Payment Kernel` e não de integrações paralelas.
- Saldo exibido ao usuário continua sendo governado pelo ledger Kloel, não por saldo bruto do rail.
- Qualquer mudança estrutural de pagamentos deve manter este plano e o ADR sincronizados.

## Próximos passos permitidos

1. Evoluir o `SplitEngine`.
2. Evoluir o `LedgerEngine`.
3. Conectar Connect onboarding, payouts e regras multi-stakeholder.
4. Preparar o cutover de ambiente real quando as chaves e capabilities live estiverem disponíveis.
