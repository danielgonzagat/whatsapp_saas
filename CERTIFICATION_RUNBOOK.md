# CERTIFICATION_RUNBOOK.md

## Mission

Implement and certify the Kloel financial platform strictly in Stripe sandbox until all 12 blocks are complete, all 20 mandatory E2E scenarios are executed with evidence, and no pending business decisions remain open.

## Governance Boundary

- Protected governance and infrastructure files are read-only for AI CLI in this repository.
- If a required change touches `ops/**`, `scripts/ops/**`, workflow files, root `package.json`, ESLint governance files, `AGENTS.md`, or any other protected surface, the change must be requested from Daniel explicitly.
- This runbook may document governance blockers, but it cannot self-authorize protected-file edits.

## Operating Rules

- Sandbox only. No live Stripe keys, no live money, no live cutover.
- Evidence over assertion. A checkbox is only marked complete when evidence is linked here.
- No false victory. Partial pass is failure until root cause is fixed.
- Update this runbook before moving to the next block.
- Record business decisions in `Decisoes de Negocio Pendentes`; do not guess.
- Record hard technical blockers in `Riscos Identificados` with attempts made.
- Commits should be frequent and scoped to completed evidence-bearing work.

## Fixed Architecture Contract

These decisions are treated as immutable implementation requirements for this runbook:

- Stripe model: platform, not marketplace.
- Charge model: direct charges on the seller connected account with `on_behalf_of`; Kloel is never merchant-of-record.
- Buyer buys legally from seller.
- Kloel fee: `9.9%` via `application_fee_amount`.
- Installment interest: `3.99%` monthly, embedded in installment math.
- Connected accounts: `Custom`.
- Onboarding and dashboard: 100% Kloel via API, sellers never access Stripe dashboard.
- Payout schedule: manual on all connected accounts.
- Supported roles: seller, supplier, affiliate, coproducer, manager.
- Split priority order is fixed and immutable.
- All monetary math must use integer cents and `BigInt`.
- Rounding residue always goes to Kloel.
- Percentage roles use `(saleValue - platformFee)` as commission base.
- Ledger must separate `pending_balance` and `available_balance`.
- Wallet prepaid is separate from marketplace split.

## Current Audit Status

### Audit Timestamp

- Started: 2026-04-20 America/Sao_Paulo
- Auditor: Codex CLI

### Initial Repository Findings

- Existing financial kernel detected under `backend/src/payments/**`, `backend/src/webhooks/payment-webhook.controller.ts`, `backend/src/wallet/**`, and `backend/src/platform-wallet/**`.
- Existing split engine detected with `BigInt` arithmetic in `backend/src/payments/split/split.engine.ts`.
- Existing connect ledger and maturation services detected.
- Existing fraud engine detected, but initial audit indicates it is still MVP-level and likely below prompt scope.
- Existing checkout charge flow appears to use post-payment transfer fan-out instead of the strict charge contract requested in this runbook.
- Existing onboarding flow appears to rely on Stripe `accountLinks`, which does not satisfy the stated requirement of Kloel-native onboarding UI.
- Dirty worktree detected before work start: `AGENTS.md` modified and left untouched.

### Initial Compliance Notes

- `SECURITY.md` currently contains a placeholder `sk_live_...` string and therefore fails the literal checkpoint "zero occurrences of sk*live*\* anywhere" until remediated or explicitly exempted by Daniel.
- Root governance boundary prohibits direct edits to `ops/**`, `scripts/ops/**`, root `package.json`, and other protected files even if such edits would improve automation.

## Evidence Index

| ID      | Type  | Description                                                                                                                                                                                                                        | Location / Command / Reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EV-0001 | audit | Initial repository audit started                                                                                                                                                                                                   | This runbook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| EV-0002 | test  | Wallet foundation now supports provider-quoted charges, refund reconciliation, settlement reconciliation, and restores backend compilation for AI consumption rails                                                                | `npm --prefix backend test -- --runInBand src/wallet/wallet.service.spec.ts src/wallet/provider-pricing.spec.ts src/ai-brain/agent-assist.service.spec.ts src/ai-brain/knowledge-base.service.spec.ts`, `npm --prefix backend run typecheck`, `cd backend && npx eslint ./src/wallet/wallet.types.ts ./src/wallet/wallet.service.ts ./src/wallet/wallet.service.spec.ts ./src/wallet/provider-pricing.ts ./src/wallet/provider-pricing.spec.ts ./src/wallet/provider-llm-billing.ts ./src/ai-brain/agent-assist.service.spec.ts ./src/ai-brain/knowledge-base.service.ts ./src/ai-brain/knowledge-base.service.spec.ts`                                                                                                                                                                                                                                                             |
| EV-0003 | test  | Worker async settlement rail for knowledge-base ingestion now compiles and is unit-tested, including wallet adjustment semantics for overquote and shortfall cases                                                                 | `npm --prefix worker run prisma:generate`, `npm --prefix worker test -- prepaid-wallet-settlement.spec.ts`, `npm --prefix worker run typecheck`, `cd worker && npx eslint ./processors/prepaid-wallet-settlement.ts ./processors/memory-processor.ts ./test/prepaid-wallet-settlement.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| EV-0004 | test  | Seller-facing `site_generation` now charges the prepaid wallet with provider quote, settles against real usage for OpenAI and Anthropic, and refunds if provider generation fails                                                  | `npm --prefix backend test -- --runInBand src/kloel/site.controller.spec.ts src/wallet/provider-pricing.spec.ts`, `npm --prefix backend run typecheck`, `cd backend && npx eslint ./src/wallet/provider-pricing.ts ./src/wallet/provider-pricing.spec.ts ./src/wallet/provider-llm-billing.ts ./src/kloel/site.controller.ts ./src/kloel/site.controller.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| EV-0005 | test  | FraudEngine now covers every current PaymentIntent creation path in the backend service layer, with Redis velocity, global blacklist administration, foreign BIN scoring, and pre-charge blocking / 3DS routing validated by tests | `npm --prefix backend run test -- --runInBand src/wallet/wallet.service.spec.ts src/kloel/payment.service.spec.ts src/payments/fraud/fraud.engine.spec.ts src/checkout/checkout-payment.service.spec.ts src/admin/carteira/admin-carteira.controller.spec.ts`, `npm --prefix backend run typecheck`, `cd backend && npx eslint ./src/wallet/wallet.types.ts ./src/wallet/wallet.service.ts ./src/wallet/wallet.service.spec.ts ./src/wallet/wallet.module.ts ./src/kloel/payment.service.ts ./src/kloel/payment.service.spec.ts ./src/kloel/kloel.module.ts ./src/payments/fraud/fraud.types.ts ./src/payments/fraud/fraud.engine.ts ./src/payments/fraud/fraud.engine.spec.ts ./src/checkout/checkout-payment.service.ts ./src/checkout/checkout-payment.service.spec.ts ./src/admin/carteira/admin-carteira.controller.ts ./src/admin/carteira/admin-carteira.controller.spec.ts` |

## Decisoes de Negocio Pendentes

- None yet.

## Riscos Identificados

- RISK-0001: The repository already contains an implemented payment architecture that partially diverges from this runbook's fixed charge-flow contract. Alignment may require deep refactors across checkout, Stripe charge creation, webhooks, tests, and UI.
- RISK-0002: "Zero occurrences of `sk_live_*` anywhere" currently fails due to placeholder documentation content, not an actual leaked credential.
- RISK-0003: Governance boundary may block automation improvements if a required verification or guard depends on protected files.

## Block Status Summary

| Block | Name                                         | Status      | Notes                                                                                      |
| ----- | -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| 1     | Fundacao Tecnica e Seguranca de Credenciais  | In progress | Audit started                                                                              |
| 2     | Custom Accounts e Onboarding 100% Kloel      | Not started | Existing partial implementation detected                                                   |
| 3     | SplitEngine                                  | Not started | Existing implementation detected; audit pending                                            |
| 4     | LedgerEngine                                 | Not started | Existing implementation detected; audit pending                                            |
| 5     | FraudEngine                                  | In progress | Service-level fraud guard now covers current PaymentIntent creation paths                  |
| 6     | Checkout E2E com Ciencia do Split            | Not started | Existing implementation detected; audit pending                                            |
| 7     | Webhook Handlers Completos e Idempotentes    | Not started | Existing implementation detected; audit pending                                            |
| 8     | Fluxo de Payout Manual                       | Not started | Existing implementation detected; audit pending                                            |
| 9     | Wallet Prepaid para API/AI                   | In progress | Provider-priced wallet foundation, KB async settlement, and site generation rail validated |
| 10    | Bateria Completa de Testes E2E em Sandbox    | Not started | No certified evidence yet                                                                  |
| 11    | Observabilidade, Audit Trail e Monitoramento | Not started | Partial components detected                                                                |
| 12    | Politicas Operacionais e Contrato com Seller | Not started | Documentation work pending                                                                 |

## Block 1 — Fundacao Tecnica e Seguranca de Credenciais

### Objetivo

Infraestrutura de desenvolvimento segura, testavel, separada de producao, sem risco de vazamento ou uso acidental de dinheiro real.

### Checklist

- [ ] Todas as credenciais Stripe de teste configuradas no Railway e Vercel
- [ ] Zero ocorrencias de `sk_live_*` em codigo, env files ou historico git
- [ ] `.env` e `.env.local` no `.gitignore` e nunca commitados
- [ ] `.env.example` atualizado com todos os nomes de variaveis
- [ ] Guard rail de inicializacao exigindo `NODE_ENV=production` + `KLOEL_LIVE_MODE=confirmed`
- [ ] Stripe CLI instalado e configurado para webhook forwarding local
- [ ] Chaves restantes configuradas: R2, Resend, Meta WhatsApp, Sentry, Anthropic, OpenAI, JWT
- [ ] Documento de "qual chave vive onde" preenchido no runbook

### Auditoria Inicial

- Status inicial: em andamento
- Evidencias:
  - `rg -n "sk_live_|pk_live_|whsec_|KLOEL_LIVE_MODE|NODE_ENV=production|sk_test_|pk_test_" .`
  - `backend/src/billing/stripe.service.ts`
  - `.env.example`
  - `backend/.env.example`
  - `frontend/.env.example`
  - `frontend-admin/.env.example`

### Evidencias

- EV-0002
- EV-0003
- Estado certificado nesta tranche:
  - `WalletService` agora aceita `quotedCostCents` e expõe `refundUsageCharge(...)` + `settleUsageCharge(...)`, permitindo consumo cobrado por custo real do provedor sem depender exclusivamente de `usage_prices`.
  - `AgentAssistService` voltou a compilar e testar em cima desse rail provider-priced.
  - `KnowledgeBaseService` agora pre-cota `kb_ingestion`, bloqueia com erro seller-friendly quando a wallet não cobre o consumo e envia ao worker o contexto para liquidação exata.
  - O worker agora acumula `usage.total_tokens` nas embeddings, liquida a wallet de forma idempotente e limpa vetores parciais se a ingestão falhar.
- Escopo ainda não certificado dentro do Bloco 9:
  - prova sandbox ponta a ponta de recarga PIX/cartão nesta branch atual;
  - cobertura seller-facing completa de todas as superfícies consumíveis além de `agent-assist` e `kb_ingestion`;
  - evidência E2E documentada para os cenários `17` e `18`.

## Block 2 — Custom Accounts e Onboarding 100% Kloel

### Checklist

- [ ] Onboarding Seller por formularios Kloel criando Custom Account
- [ ] Onboarding Fornecedor funcionando
- [ ] Onboarding Afiliado com convite por email e cadastro Kloel
- [ ] Onboarding Coprodutor funcionando
- [ ] Onboarding Gerente funcionando
- [ ] Todas as contas com `settings.payouts.schedule.interval = 'manual'`
- [ ] Dashboard Kloel mostra status sem dashboard Stripe
- [ ] Kloel UI lida com `requirements.currently_due`
- [ ] Seller completa onboarding em menos de 10 minutos
- [ ] Zero menções visuais a Stripe no onboarding, salvo obrigacao legal

### Evidencias

- EV-0002
- EV-0003
- EV-0004
- Estado certificado nesta tranche:
  - `WalletService` agora suporta `quotedCostCents`, `refundUsageCharge(...)` e `settleUsageCharge(...)`.
  - `AgentAssistService`, `KnowledgeBaseService` e `SiteController` usam esse rail com testes dirigidos.
  - `kb_ingestion` agora faz pre-charge conservador e liquidação assíncrona no worker via `usage.total_tokens`.
  - `site_generation` agora faz `quote -> settle -> refund` tanto para OpenAI quanto para Anthropic.
- Escopo ainda não certificado dentro do Bloco 9:
  - recarga PIX/cartão e webhook credit já existem no código, mas ainda sem evidência E2E sandbox anexada neste runbook;
  - demais superfícies consumíveis seller-facing além de `agent-assist`, `kb_ingestion` e `site_generation`;
  - cenários `17` e `18` do Bloco 10 continuam sem execução documentada.

## Block 3 — SplitEngine

### Checklist

- [ ] SplitEngine isolado, testavel, sem dependencia do Stripe
- [ ] Testes cobrindo 4 hipoteses do Daniel
- [ ] Testes de edge cases obrigatorios
- [ ] Coverage >= 95%
- [ ] Toda matematica em `BigInt`
- [ ] Soma dos splits sempre igual a `buyerPaid`
- [ ] Funcao de preview de split para seller
- [ ] Log detalhado para auditoria

### Evidencias

- Pending.

## Block 4 — LedgerEngine

### Checklist

- [ ] Schema para `account_balances` e `ledger_entries`
- [ ] Servico de ledger que credita, debita, matura e audita
- [ ] Cron/BullMQ promovendo `pending -> available`
- [ ] Regras de maturacao configuraveis
- [ ] Dashboard mostra saldos `pending` e `available`
- [ ] Dashboard mostra historico de movimentacoes
- [ ] Lock de banco contra race condition
- [ ] Testes de concorrencia
- [ ] Endpoint de saque valida `available_balance`

### Evidencias

- Pending.

## Block 5 — FraudEngine

### Checklist

- [ ] Middleware roda antes de todo `stripe.paymentIntents.create`
- [x] Blacklist global de CPF, email, IP e device
- [x] Regras de velocity
- [x] BIN estrangeiro aumenta score em compra BR
- [x] Score e thresholds configuraveis
- [x] Endpoint administrativo de blacklist
- [x] Log detalhado de decisao
- [x] Testes de fraude conhecidos

### Evidencias

- EV-0005
- Estado certificado nesta tranche:
  - `FraudEngine` agora combina blacklist global, velocity via Redis, score configurável por ambiente, risco adicional para BIN / `cardCountry` estrangeiro em checkout BR e logging estruturado da decisão.
  - `AdminCarteiraController` expõe listagem, inclusão e remoção de blacklist com trilha de auditoria administrativa.
  - `CheckoutPaymentService` continua avaliando fraude antes do fluxo principal de venda e agora envia `cardBin`, `cardCountry` e `orderCountry` para enriquecer a decisão.
  - `WalletService.createTopupIntent(...)` passou a bloquear ou segurar a recarga antes do Stripe e forçar `request_three_d_secure='any'` em recargas de cartão quando o motor devolve `require_3ds`.
  - `Kloel PaymentService.createPayment(...)` passou a bloquear / revisar pagamentos PIX legados antes de `stripe.paymentIntents.create`, evitando atingir o gateway quando o score é reprovado.
- Escopo ainda nao certificado dentro do Bloco 5:
  - o checklist literal ainda pede um middleware unificado; o comportamento atual ja cobre todos os call sites de `paymentIntents.create` existentes na camada de servico, mas ainda nao foi centralizado em uma abstracao unica;
  - faltam evidencias E2E sandbox do cenario `15` no runbook, apesar da cobertura unitária local ja estar verde.

## Block 6 — Checkout E2E com Ciencia do Split

### Checklist

- [ ] Checkout publico com afiliacao funcionando
- [ ] Cookie de afiliacao persiste 30 dias
- [ ] FraudEngine chamado antes do PaymentIntent
- [ ] SplitEngine calcula antes do PaymentIntent
- [ ] PaymentIntent criado com contrato exigido por este runbook
- [ ] Cartao com parcelamento BR ate 12x
- [ ] PIX suportado
- [ ] Boleto opcional registrado
- [ ] Pagina de confirmacao de venda
- [ ] Email de confirmacao via Resend

### Evidencias

- Pending.

## Block 7 — Webhook Handlers Completos e Idempotentes

### Checklist

- [ ] `payment_intent.succeeded`
- [ ] `payment_intent.payment_failed`
- [ ] `charge.refunded`
- [ ] `charge.dispute.created`
- [ ] `charge.dispute.closed`
- [ ] `account.updated`
- [ ] `payout.paid`
- [ ] `payout.failed`
- [ ] `transfer.reversed`
- [ ] Todos os handlers idempotentes
- [ ] Verificacao de assinatura sempre ativa
- [ ] Retry com backoff exponencial

### Evidencias

- Pending.

## Block 8 — Fluxo de Payout Manual

### Checklist

- [ ] Dashboard mostra saldo disponivel do ledger Kloel
- [ ] Botao de solicitar saque com validacao
- [ ] Backend valida valor <= `available_balance`
- [ ] Disparo de `stripe.payouts.create`
- [ ] Ledger debitado imediatamente
- [ ] `payout.paid` confirma chegada
- [ ] `payout.failed` reverte ledger
- [ ] Teste completo em sandbox

### Evidencias

- Pending.

## Block 9 — Wallet Prepaid para API/AI

### Checklist

- [ ] Schema de `wallets` e `wallet_transactions`
- [ ] Recarga via PIX
- [ ] Recarga via cartao
- [ ] Webhook credita wallet
- [ ] Middleware debita wallet antes do consumo
- [ ] Bloqueio gracioso sem saldo
- [ ] Dashboard mostra saldo e historico
- [ ] Auto-recarga configuravel

### Evidencias

- Pending.

## Block 10 — Bateria Completa de Testes E2E em Sandbox

### Cenarios Obrigatorios

- [ ] Cenario 1: venda simples
- [ ] Cenario 2: venda com fornecedor fixo
- [ ] Cenario 3: venda com afiliado via link
- [ ] Cenario 4: venda com afiliado + fornecedor
- [ ] Cenario 5: todos os roles
- [ ] Cenario 6: afiliado 100%
- [ ] Cenario 7: afiliado 99% + fornecedor
- [ ] Cenario 8: parcelado 12x
- [ ] Cenario 9: PIX a vista
- [ ] Cenario 10: reembolso
- [ ] Cenario 11: chargeback
- [ ] Cenario 12: maturacao
- [ ] Cenario 13: saque valido
- [ ] Cenario 14: saque acima do disponivel
- [ ] Cenario 15: fraude bloqueada
- [ ] Cenario 16: 10 vendas simultaneas
- [ ] Cenario 17: wallet PIX + consumo ate zerar
- [ ] Cenario 18: wallet cartao + auto-recharge
- [ ] Cenario 19: saque antes de chargeback
- [ ] Cenario 20: stress 100 vendas em 10 minutos

### Evidencias

- Pending.

## Block 11 — Observabilidade, Audit Trail e Monitoramento

### Checklist

- [ ] Sentry backend e frontend
- [ ] Logs estruturados JSON
- [ ] Dashboard interno operacional
- [ ] Alertas criticos configurados
- [ ] Audit log imutavel
- [ ] Ferramenta de reconciliacao ledger vs Stripe

### Evidencias

- Pending.

## Block 12 — Politicas Operacionais e Contrato com Seller

### Checklist

- [ ] Termos de uso com retencao, reversao e saldo negativo
- [ ] Politica de maturacao por role documentada
- [ ] Politica de reembolso e chargeback documentada
- [ ] Playbook operacional interno
- [ ] Comunicacoes transacionais claras

### Evidencias

- Pending.

## Key Inventory

| Secret / Variable        | Owner System | Runtime(s)      | Status        | Evidence |
| ------------------------ | ------------ | --------------- | ------------- | -------- |
| `STRIPE_SECRET_KEY`      | Railway      | backend, worker | Pending audit | Pending  |
| `STRIPE_PUBLISHABLE_KEY` | Vercel       | frontend        | Pending audit | Pending  |
| `STRIPE_WEBHOOK_SECRET`  | Railway      | backend         | Pending audit | Pending  |
| `CLOUDFLARE_R2_*`        | Pending      | Pending         | Pending audit | Pending  |
| `RESEND_API_KEY`         | Pending      | Pending         | Pending audit | Pending  |
| `META_*`                 | Pending      | Pending         | Pending audit | Pending  |
| `SENTRY_*`               | Pending      | Pending         | Pending audit | Pending  |
| `ANTHROPIC_API_KEY`      | Pending      | Pending         | Pending audit | Pending  |
| `OPENAI_API_KEY`         | Pending      | Pending         | Pending audit | Pending  |
| `JWT_*`                  | Pending      | Pending         | Pending audit | Pending  |

## Execution Log

### 2026-04-20

- Created initial certification runbook.
- Recorded first-pass repository audit and known divergences.
- Started Block 1 audit.

## Certificado de Producao

Do not fill this section until:

- all 12 blocks are 100% complete,
- all 20 E2E scenarios passed with evidence,
- test thresholds are met,
- no pending business decisions remain open,
- Daniel explicitly reviews and approves the certificate for live transition.

```text
════════════════════════════════════════════════════════
CERTIFICADO DE PRONTIDÃO PARA PRODUÇÃO — KLOEL
════════════════════════════════════════════════════════

Data de emissão: [preencher]

Declaro que o sistema financeiro do Kloel foi construído,
testado e validado em ambiente de teste do Stripe (sandbox)
com os seguintes resultados:

- 12 blocos de escopo: 100% concluídos
- 20 cenários E2E: executados com sucesso (evidências
  anexadas no runbook)
- Testes unitários críticos: coverage ≥ 95% em SplitEngine,
  LedgerEngine, FraudEngine
- Webhook handlers: todos idempotentes e testados com
  Stripe CLI
- Onboarding Custom Accounts: funcionando para todos os
  5 roles, sem menção visual a Stripe
- Payouts manuais: testados com sucesso
- Wallet prepaid: testado com sucesso
- Chargeback e reembolso: reversões testadas em cadeia
- Observabilidade: Sentry, logs estruturados e alertas
  configurados

O sistema está pronto para transição de sk_test_* para
sk_live_*, respeitando as seguintes recomendações de
rollout gradual:

Fase Friends & Family (semanas 1-2 após go-live):
- Limite de 10 sellers ativos
- GMV máximo de R$ 50.000
- Monitoramento ativo diário por Daniel

Fase Soft Launch (semanas 3-6):
- Até 100 sellers ativos
- Revisão semanal de chargebacks e disputes
- Ajustes de FraudEngine conforme padrões reais

Fase Público (semana 7+):
- Onboarding público gradual
- Monitoramento contínuo

AGUARDANDO APROVAÇÃO HUMANA DO DANIEL PARA ATIVAR MODO LIVE.
════════════════════════════════════════════════════════
```
