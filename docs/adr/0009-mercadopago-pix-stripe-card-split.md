# ADR 0009 — Mercado Pago PIX + Stripe Cartão (split por método de pagamento)

- **Status**: Proposed (rascunho — aguardando ratificação do dono do repo)
- **Data**: 2026-05-20
- **Decisor**: Daniel Penin
- **Supersede parcial**: complementa [ADR 0003](./0003-stripe-connect-marketplace-model.md)
- **Plano executável**: a criar (`docs/plans/MERCADOPAGO_PIX_INTEGRATION_PLAN.md`)
  após ratificação

## Contexto

O ADR 0003 (2026-04-17) estabeleceu Stripe como única infraestrutura ativa de
pagamento. À época, a hipótese era que o Stripe BR habilitaria PIX como
capability nativa em prazo curto, permitindo unificar todos os métodos no
mesmo rail.

A realidade evoluiu de forma diferente:

1. **Habilitação Stripe PIX BR continua aberta** — a conta live precisa
   solicitar capacidade explícita; não é self-serve, não há ETA confiável.
2. **Mercado Pago tem PIX maduro, com mercado dominante no BR** — onboarding
   simples (Public Key + Access Token), webhook signature documentado, SDK
   oficial em produção há anos, taxas competitivas para PIX.
3. **Stripe continua superior para cartão internacional, Connect (split
   marketplace) e payouts cross-border** — esse é o core do plano original
   e segue.
4. **Forçar PIX dentro do Stripe atrasa receita ativa** que poderia ser
   capturada pelo MP em uma sprint.

O cenário força uma decisão de arquitetura: ou continuar esperando Stripe PIX
(atraso indefinido), ou aceitar **split de provedor por método**.

## Decisão

Aceitamos split por método de pagamento:

| Método | Provedor canônico | Razão |
|---|---|---|
| PIX (entrada + checkout BR) | **Mercado Pago** | maturidade, mercado BR dominante, SDK oficial estável |
| Cartão internacional | **Stripe** | melhor taxa cross-border, 3DS, redes globais |
| Boleto (se reativado) | **Mercado Pago** | mesma conta MP, evita 3º provedor |
| Connect (marketplace, split, payouts) | **Stripe Connect** | já modelado em ADR 0003; MP Marketplace é inferior |
| Wallet/Ledger (interno) | **inalterado** | append-only, neutro de provedor |

PIX e Cartão são roteados via um `PaymentProviderRouter` central:

```text
checkout intent → router.resolveProvider({ method, country, amount })
                              ↓
       method='pix'  → MercadoPagoAdapter
       method='card' → StripeAdapter
```

## Invariantes mantidas (vindo do ADR 0003)

- Centavos em `bigint`. Nunca `number` para dinheiro.
- Coverage ≥ 95% em `SplitEngine`, `LedgerEngine`, `FraudEngine`.
- Idempotência em todo webhook handler (`@@unique([provider, externalId])`
  em `WebhookEvent` cobre os dois provedores).
- `LedgerEntry` append-only; provider só preenche `provider` enum +
  `externalId`.
- Casca de UX preservada — o usuário continua vendo um checkout único; só
  o motor por baixo decide o provedor.
- `sk_test_*` / `APP_USR-...` apenas em produção via Railway secret.

## Modelo de dados

Sem mudanças destrutivas. `Payment` ganha um campo `provider`:

```prisma
model Payment {
  // ...
  provider       PaymentProvider // STRIPE | MERCADOPAGO
  externalId     String          // payment_intent_id (Stripe) | preference/payment id (MP)
  // ...
  @@unique([provider, externalId])
}

enum PaymentProvider {
  STRIPE
  MERCADOPAGO
}
```

Webhooks: cada provedor tem seu endpoint dedicado com signature verification
específica (Stripe: header `stripe-signature` + `STRIPE_WEBHOOK_SECRET`; MP:
header `x-signature` + chave secreta + replay window).

## Adapters

Estrutura proposta:

```
backend/src/payments/
├── mercadopago/                ← novo
│   ├── mercadopago.module.ts
│   ├── mercadopago.adapter.ts          (implements PaymentProviderAdapter)
│   ├── mercadopago-webhook.controller.ts
│   ├── mercadopago-webhook-signature.verifier.ts
│   ├── mercadopago-pix-charge.service.ts
│   └── mercadopago-pix-charge.service.spec.ts
├── stripe/                     ← já existe
└── provider-router/
    ├── provider-router.service.ts      (resolveProvider({method,...}))
    └── provider-router.service.spec.ts
```

Os dois adapters implementam o mesmo contrato `PaymentProviderAdapter`:

```ts
interface PaymentProviderAdapter {
  createCharge(intent: ChargeIntent): Promise<ChargeReceipt>;
  capture(externalId: string): Promise<ChargeReceipt>;
  refund(externalId: string, amount: bigint): Promise<RefundReceipt>;
  verifyWebhookSignature(req: Request): boolean;
}
```

## Configuração / secrets

Variáveis a definir via `.env.pulse.local` (dev) ou Railway env (prod):

```
# Mercado Pago — apenas PIX BR
MERCADOPAGO_PUBLIC_KEY=<set>
MERCADOPAGO_ACCESS_TOKEN=<rotated_secret>
MERCADOPAGO_CLIENT_ID=<set>
MERCADOPAGO_CLIENT_SECRET=<rotated_secret>
MERCADOPAGO_WEBHOOK_SECRET=<from dashboard>

# Stripe — cartão + Connect (já existente)
STRIPE_SECRET_KEY=<existente>
STRIPE_WEBHOOK_SECRET=<existente>
STRIPE_CONNECT_ACCOUNT_ID=<existente>
```

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Duas integrações dobram superfície de bug | Testes de contrato por adapter + fraud-engine compartilhado |
| Reconciliação cross-provider | Ledger único; relatório diário compara saldo MP+Stripe vs ledger |
| UX confusa pro usuário | UI esconde escolha de provedor; método é selecionado pelo wallet/checkout |
| Compliance dupla | Stripe Connect já cobre cartão; MP fica restrito ao escopo PIX (sem onboarding marketplace) |
| Credenciais MP vazadas no início | Rotação obrigatória antes do go-live; gates em `scripts/ops/check-canonical-*` |

## Não-objetivos (deixar explícito)

- **NÃO** vamos usar MP para cartão. Cartão fica 100% Stripe.
- **NÃO** vamos usar MP Marketplace (split via MP). Split continua Stripe Connect.
- **NÃO** vamos sincronizar saldo MP→Stripe. Wallet interno (ledger) é a fonte da verdade.
- **NÃO** vamos expor MP no frontend admin. O console marketplace é Stripe.

## Próximos passos (após ratificação)

1. Adicionar `MERCADOPAGO_*` ao `.env.pulse.local` + Railway secret manager
2. Criar `PaymentProvider` enum no Prisma + migration aditiva
3. Implementar `MercadoPagoAdapter` + webhook controller + signature verifier
4. Implementar `PaymentProviderRouter` + escolha por método
5. Adicionar testes de contrato MP (mock de cobrança PIX, callback, refund)
6. Smoke test sandbox MP → produção
7. Atualizar `docs/architecture/SERVICE_CATALOG.md` (regen via `npm run canonical:scan`)
8. Atualizar `CLAUDE.md` — bloco "STRIPE PAYMENT BASELINE" passa a referenciar este ADR

## Status

Rascunho. Ratificação requer:
- Confirmação do dono do repo
- Rotação das credenciais MP que circularam em plaintext em chat (não-negociável)
- Plano executável escrito em `docs/plans/MERCADOPAGO_PIX_INTEGRATION_PLAN.md`
