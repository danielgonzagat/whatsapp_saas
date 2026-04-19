# ADR 0003 — Stripe como única infraestrutura ativa de pagamento

- **Status**: Accepted
- **Data**: 2026-04-17
- **Decisor**: Daniel Penin
- **Plano executável**: [docs/plans/STRIPE_MIGRATION_PLAN.md](../plans/STRIPE_MIGRATION_PLAN.md)

## Contexto

O KLOEL precisava de uma base única para suportar checkout, Pix, webhooks, ledger, wallet e a
futura camada de split multi-stakeholder sem fragmentação operacional.

A arquitetura anterior de pagamentos estava espalhada em múltiplas superfícies e impedia:

- observabilidade uniforme do checkout;
- evolução consistente do motor financeiro;
- governança simples de webhooks e refunds;
- expansão do `Payment Kernel` sobre um único rail.

## Decisão

Stripe passa a ser a única infraestrutura ativa de pagamento do KLOEL.

Isso implica:

1. checkout e cobrança pública unificados em Stripe;
2. webhook de pagamento unificado em Stripe;
3. serviços de pagamento do backend consolidados em Stripe;
4. frontend público e social checkout consumindo apenas contratos Stripe;
5. dependências legadas removidas do runtime ativo.

## Consequências

### Positivas

- Base única para evoluir `SplitEngine`, `LedgerEngine` e Connect.
- Menos superfície operacional e menos drift entre backend e frontend.
- Validação mais simples: um provider, um contrato, um conjunto de webhooks.
- Pix fica alinhado ao core de venda aprovada, em vez de coexistir com engines paralelas.

### Custos

- Refatoração ampla de checkout, wallet, services e testes.
- Atualização de docs, mocks, fixtures e contratos públicos.
- Necessidade de manter o ambiente live bloqueado até existirem chaves e capabilities corretas.

## Invariantes

- Stripe é o único provider ativo de pagamento.
- O ledger Kloel continua sendo a verdade de produto para saldo exibido, maturação e payout.
- Qualquer novo fluxo de pagamento deve nascer dentro do `Payment Kernel`.
- Não reintroduzir providers paralelos no runtime sem novo ADR explícito.

## Estado atual

No estado pós-cutover:

- runtime ativo consolidado em Stripe;
- testes e typechecks verdes;
- docs operacionais alinhadas;
- resíduos remanescentes só em superfícies históricas ou protegidas por governance.
