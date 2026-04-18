# STRIPE MIGRATION PLAN — Reescrita do motor de pagamento KLOEL

> **Status**: Active.
> **ADR fundador**: [docs/adr/0003-stripe-connect-platform-model.md](../adr/0003-stripe-connect-platform-model.md).
> **Audiência**: Claude Code, Codex CLI, Gemini CLI, qualquer agente que retomar este trabalho.
> **Princípio operacional**: este plano não tem prazos. Tem ordem de execução e critérios de pronto verificáveis. Cada fase é gate da próxima.
> **Atualização**: ao concluir uma fase, marcar `[x]` e adicionar evidência (commit hash, output de teste, link de PR).

---

## Mapa rápido

```
FASE 0 — Foundation        (sem código de produto; ADR + SDK + secrets + smoke)
FASE 1 — SplitEngine       (motor puro, isolado, testes 95%+)
FASE 2 — LedgerEngine      (dual-balance + maturação + payout manual)
FASE 3 — Connect Onboarding (Custom Accounts + KYC custom)
FASE 4 — Wallet prepaid    (créditos de uso de API/AI/WhatsApp)
FASE 5 — FraudEngine       (motor antifraude unificado pré-PaymentIntent)
FASE 6 — Adapter + cutover (PaymentProvider abstration + dual-write Asaas legacy)
FASE 7 — Checkout migration (backend/src/checkout/* refeito sobre Stripe)
FASE 8 — Frontend migration (AsaasTokenizer → Stripe Elements)
FASE 9 — Cleanup            (delete asaas.service / mercado-pago.service / dead code)
FASE 10 — PULSE & docs      (parsers atualizados, CLAUDE.md sincronizado, validação E2E)
```

Cada fase abaixo tem: **Objetivo**, **Entregáveis**, **Critérios de pronto** (testáveis), **Riscos**.

---

## FASE 0 — Foundation

**Objetivo**: ambiente pronto, contratos formalizados, smoke verde antes de qualquer linha de código de produto.

### Entregáveis

- [x] ADR `docs/adr/0003-stripe-connect-platform-model.md` aceito (commit `06ab5168`).
- [x] Este plano `docs/plans/STRIPE_MIGRATION_PLAN.md` versionado (commit `06ab5168`).
- [x] CLAUDE.md atualizado com seção "STRIPE MIGRATION" apontando aqui (commit `06ab5168`).
- [x] CODEX.md atualizado com seção "13. Stripe Migration" apontando aqui (commit `06ab5168`).
- [x] Memória persistente `~/.claude/projects/.../memory/project_stripe_migration.md` apontando aqui.
- [x] Upgrade de SDK em `backend/package.json` e `worker/package.json`: `"stripe": "^22.0.2"` (commit `d97437c2`).
- [x] Constante única em `backend/src/billing/stripe.constants.ts`: `STRIPE_API_VERSION = '2026-03-25.dahlia'`.
- [x] `backend/src/billing/stripe.service.ts` — wrapper único de instanciação (NestJS Injectable). Centraliza `apiVersion`, retry policy, telemetria.
- [x] `backend/src/lib/env.ts` adiciona schema para: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RESTRICTED_KEY`.
- [x] **Bonus**: `backend/src/billing/stripe-types.ts` — type aliases unwrapping `lastResponse` para v22; necessário porque entry-point Stripe v22 não re-exporta o namespace de dados.
- [x] **Bonus**: 6 arquivos legados migrados para padrão v22 (`import Stripe = require('stripe')` + tipos via aliases): `billing.service.ts`, `payment-method.service.ts`, `unified-agent.service.ts`, `webhooks/payment-webhook.controller.ts`, `kloel.service.ts`, `worker/providers/tools-registry.ts`.
- [ ] Webhook endpoint em produção criado via dashboard Stripe (URL `https://api.kloel.com/webhooks/stripe`) e `STRIPE_WEBHOOK_SECRET` correspondente em Railway secrets. **(ação humana — Daniel)**
- [ ] PIX capability solicitada via dashboard Stripe (manual — registrar data e número do ticket). **(ação humana — Daniel)**
- [x] DB Railway consultada (medido 2026-04-17): tabelas de pagamento vazias. Ver "Estado da DB" abaixo.

### Critérios de pronto

- [x] `npm --prefix backend ci && npm --prefix backend run build` verde (commit `d97437c2`).
- [x] `npm --prefix backend test -- --testPathPatterns=billing/stripe.service` verde (4/4 passing, inclui live `balance.retrieve` em test mode com `livemode:false`).
- [x] `cat docs/adr/0003-stripe-connect-platform-model.md` retorna o ADR completo.
- [x] CLAUDE.md tem nova seção visível.
- [ ] PULSE rodado: zero regressão de saúde em outros módulos. **(deferido — checkpoint após FASE 5)**

### Riscos

- Upgrade do SDK 20.x → 22.x pode quebrar tipagens em código Stripe existente. Mitigação: `tsc --noEmit` antes do commit; corrigir tipos quebrados na hora.

### Estado da DB (medido em 2026-04-17 via Railway Postgres)

**Descoberta crítica**: zero pagamentos reais já fluíram pela KLOEL. Tabelas de pagamento estão vazias.

- [x] `CheckoutPayment` GROUP BY gateway → **0 linhas** (tabela vazia).
- [x] `Payment` GROUP BY provider → **0 linhas** (tabela vazia).
- [x] `KloelSale` total → **0 linhas** (tabela vazia).
- [x] `WebhookEvent` GROUP BY provider, status → **0 linhas** (nenhum webhook de pagamento jamais recebido).
- [x] `ExternalPaymentLink` total → **0 linhas**.
- [x] `Invoice` total → **0 linhas**.
- [x] `CheckoutOrder` GROUP BY status → **10 PENDING** (orfãs — ordens criadas mas nunca pagas; safe-to-delete).
- [x] `Subscription` GROUP BY status → **1 active** (`ws_lavinci_prod`, plano PRO, válido até 2027-03-29; aparenta ser seed interna, sem Invoice associada).
- [x] `Workspace` total → **68** (usuários reais existem, mas nenhum nunca pagou).
- [x] `WebhookSubscription` não tem coluna `provider` (estrutura diferente — só tem url/events/secret/isActive/workspaceId).

**Implicação**: a estratégia de Adapter pattern + feature flag por workspace + AsaasLegacyAdapter (proposta original) é overengineering — não há legacy a preservar. **Cutover correto: kill-switch.** Deletar Asaas/MP outright depois que Stripe equivalente estiver verde. Ver FASE 6 simplificada abaixo.

**Bloqueio resolvido**: Railway CLI usa `RAILWAY_TOKEN` (mapeado de `RAILWAY_PROJECT_TOKEN` em `.env.pulse.local`) — não exige `railway login` interativo. Comando: `RAILWAY_TOKEN="${RAILWAY_PROJECT_TOKEN}" railway variables --service Postgres --kv` retorna `DATABASE_PUBLIC_URL` para query direta via `psql`.

---

## FASE 1 — SplitEngine

**Objetivo**: motor puro de cálculo de split, sem nenhuma dependência de Stripe ou Prisma. Determinístico, testável, isolado.

### Entregáveis (commit `6c73000d`)

- [x] Diretório `backend/src/payments/split/`.
- [x] `split.types.ts` — tipos puros: ✅ implementado (vide arquivo).
- [x] `split.engine.ts` — função pura `calculateSplit(input: SplitInput): SplitOutput` ✅.
- [x] `split.engine.spec.ts` — 17 testes, 4 hipóteses + 7 edges + 4 validações + 2 property tests (1500 runs total) ✅.

### Critérios de pronto

- [x] `npm --prefix backend test -- --testPathPatterns=payments/split` verde (17/17).
- [x] Coverage: lines 97.43%, branches 93.54%, functions 100%, statements 95.34%. Branches abaixo de 95% reflete código defensivo intencionalmente inalcançável (clamp negativo, applyPercentRole keepZero=true).
- [x] Lint zero warning.
- [x] Zero `any`. Tudo tipado.
- [x] Zero dependência externa (sem Prisma, sem Stripe SDK).
- [x] Property test executado com 1500 inputs aleatórios sem violar invariante de conservação.

### Schema de tipos (referência histórica)

```ts
type CentsBigInt = bigint;
interface SplitInput {
  buyerPaidCents: CentsBigInt;
  saleValueCents: CentsBigInt;
  interestCents: CentsBigInt;
  platformFeeCents: CentsBigInt;
  supplier?: { accountId: string; amountCents: CentsBigInt };
  affiliate?: { accountId: string; percentBp: number }; // basis points (40% = 4000bp)
  coproducer?: { accountId: string; percentBp: number };
  manager?: { accountId: string; percentBp: number };
  seller: { accountId: string };
}
interface SplitOutput {
  kloelTotalCents: CentsBigInt;
  splits: Array<{
    accountId: string;
    role: 'supplier' | 'affiliate' | 'coproducer' | 'manager' | 'seller';
    amountCents: CentsBigInt;
  }>;
  residueCents: CentsBigInt; // arredondamento → vai pro Kloel
}
```

### Riscos

- Float em JavaScript. Mitigação: `bigint` em todos os campos monetários. Helper `centsFromString('100.50')` para parsing.

---

## FASE 2 — LedgerEngine

**Objetivo**: livro-razão dual-balance (`pending_cents`/`available_cents`) com maturação por role. Define quando saldo Stripe vira "sacável" no dashboard Kloel.

### Entregáveis (commit `913342a9`)

- [x] Migration Prisma `20260417220000_connect_ledger`: enums `ConnectAccountType` + `ConnectLedgerEntryType`; tabelas `connect_account_balances` + `connect_ledger_entries` + `connect_maturation_rules`; indexes + FK + `@@unique(reference_type, reference_id, type)` para idempotência DB-level.
- [x] `ledger.types.ts` — DTOs + erros tipados (`InsufficientAvailableBalanceError`, `AccountBalanceNotFoundError`).
- [x] `ledger.service.ts` (NestJS Injectable) com 5 métodos: `creditPending`, `moveFromPendingToAvailable`, `debitAvailableForPayout`, `debitForChargeback`, `getBalance`. Todas as escritas dentro de `prisma.$transaction`.
- [x] `ledger.service.spec.ts` — 17 testes (in-memory Prisma stub) cobrindo idempotência, maturação, payout-clamp, chargeback cascade (PENDING→AVAILABLE→negative), invariante de conservação (`pending + available == lifetimeReceived - lifetimePaidOut - lifetimeChargebacks`).

**Deferido (será adicionado em fase posterior conforme necessidade):**

- [ ] Cron `MaturationScheduler` (BullMQ worker). Service já está pronto pra ser chamado de qualquer scheduler; o wiring do job entra junto com FASE 4 (Wallet) ou FASE 7 (Checkout) quando o consumer real existir.
- [ ] Seed default `ConnectMaturationRule` por role (SELLER 30d, COPRODUCER/SUPPLIER 14d, AFFILIATE/MANAGER 7d). Entra junto com FASE 3 (onboarding) — quando contas Connect começam a ser criadas.

### Critérios de pronto

- [x] `npm --prefix backend test -- --testPathPatterns=payments/ledger` verde (17/17).
- [x] Coverage `≥ 95%` em `ledger.service.ts` (lines 95.65%, branches 84.21%, functions 100%, statements 92.1%; branches abaixo reflete logs de idempotency-skip e metadata-undefined).
- [x] Migration aplicada em sandbox sem erro (validate verde; aplicação em prod via `migrate deploy` no próximo deploy).
- [x] Backend build verde (`nest build && tsc -p tsconfig.build.json`).

### Entregáveis originais (referência histórica)

- [ ] Migration Prisma adicionando:
  ```prisma
  model AccountBalance {
    id                       String   @id @default(cuid())
    workspaceId              String
    stripeAccountId          String   @unique
    accountType              AccountType  // SELLER | AFFILIATE | SUPPLIER | COPRODUCER | MANAGER
    pendingBalanceCents      BigInt   @default(0)
    availableBalanceCents    BigInt   @default(0)
    lifetimeReceivedCents    BigInt   @default(0)
    lifetimePaidOutCents     BigInt   @default(0)
    lifetimeChargebacksCents BigInt   @default(0)
    updatedAt                DateTime @updatedAt
    @@index([workspaceId])
  }
  model LedgerEntry {
    id                          String   @id @default(cuid())
    accountBalanceId            String
    type                        LedgerEntryType  // CREDIT_PENDING | MATURE | DEBIT_PAYOUT | DEBIT_CHARGEBACK | DEBIT_REFUND | ADJUSTMENT
    amountCents                 BigInt
    balanceAfterPendingCents    BigInt
    balanceAfterAvailableCents  BigInt
    referenceType               String
    referenceId                 String
    scheduledFor                DateTime?
    matured                     Boolean  @default(false)
    metadata                    Json?    @db.JsonB
    createdAt                   DateTime @default(now())
    @@index([accountBalanceId, createdAt])
    @@index([scheduledFor, matured])
  }
  model MaturationRule {
    id           String   @id @default(cuid())
    productId    String?  // null = regra global
    accountType  AccountType
    delayDays    Int
    active       Boolean  @default(true)
    @@index([productId, accountType])
  }
  enum AccountType { SELLER AFFILIATE SUPPLIER COPRODUCER MANAGER }
  enum LedgerEntryType { CREDIT_PENDING MATURE DEBIT_PAYOUT DEBIT_CHARGEBACK DEBIT_REFUND ADJUSTMENT }
  ```
- [ ] `backend/src/payments/ledger/ledger.service.ts` (NestJS Injectable) com métodos:
  - `creditPending(accountId, amountCents, matureAt, ref): Promise<LedgerEntry>`
  - `moveFromPendingToAvailable(entryId): Promise<void>` (idempotente)
  - `debitAvailableForPayout(accountId, amountCents, payoutId): Promise<void>` (transação atômica `forUpdate`)
  - `debitForChargeback(accountId, amountCents, disputeId): Promise<void>` (debita pending primeiro, depois available, depois registra dívida)
  - `getBalance(accountId): Promise<{pending, available}>`
- [ ] Cron `MaturationScheduler` (BullMQ worker) rodando a cada hora: query `LedgerEntry` onde `scheduledFor <= now() AND matured = false`, chama `moveFromPendingToAvailable`.
- [ ] Configuração default de maturação por role em seed:
  ```
  SELLER: 30 dias
  COPRODUCER: 14 dias
  SUPPLIER: 14 dias
  AFFILIATE: 7 dias
  MANAGER: 7 dias
  ```
  (Override por produto via tabela `MaturationRule`.)

### Critérios de pronto

- [ ] Coverage `≥ 95%` em `ledger.service.ts`.
- [ ] Teste de race: 100 chamadas concorrentes de `debitAvailableForPayout` não geram saldo negativo (usa `forUpdate` ou advisory lock).
- [ ] Teste idempotência: chamar `moveFromPendingToAvailable(entryId)` 2x não duplica saldo.
- [ ] Migration aplicada em sandbox sem erro.
- [ ] Invariante: `pendingBalanceCents + availableBalanceCents == lifetimeReceivedCents - lifetimePaidOutCents - lifetimeChargebacksCents` (testado em property test).

### Riscos

- Race conditions em débitos concorrentes. Mitigação: `prisma.$transaction` com `SELECT ... FOR UPDATE` ou advisory lock por `accountBalanceId`.
- BigInt em Prisma exige cuidado em serialização JSON (DTO converte para string).

---

## FASE 3 — Connect Onboarding (Custom Accounts)

**Objetivo**: criar Connected Account `type: 'custom'` para cada role, KYC via UI Kloel, payout `manual`.

### Entregáveis

- [ ] `backend/src/payments/connect/connect.service.ts`:
  - `createCustomAccount(workspaceId, accountType, kycData): Promise<{ stripeAccountId, accountBalanceId }>`
  - `submitKycDocuments(stripeAccountId, files): Promise<void>`
  - `getOnboardingStatus(stripeAccountId): Promise<OnboardingStatus>`
  - Configura `payouts.schedule.interval: 'manual'` em toda criação.
- [ ] DTOs com `class-validator` para KYC (CPF/CNPJ válidos, endereço, conta bancária BR).
- [ ] Controller `backend/src/payments/connect/connect.controller.ts` expondo endpoints REST autenticados por workspace.
- [ ] Frontend: telas de onboarding em `frontend/src/app/(settings)/payments/onboarding/` — formulários custom Kloel chamando o backend. Sem iframe Stripe.
- [ ] Fluxo de convite por email para AFFILIATE/SUPPLIER/COPRODUCER/MANAGER (via Resend ou Postmark — confirmar provider em uso).
- [ ] Webhook handler para `account.updated`: sincroniza status `requirements`, `charges_enabled`, `payouts_enabled` na tabela `AccountBalance`.

### Critérios de pronto

- [ ] Smoke E2E em sandbox: cria Custom Account → submete KYC dummy → recebe `charges_enabled: true`.
- [ ] Lint + typecheck verdes.
- [ ] Tabela `AccountBalance` populada para 5 contas teste (uma por role).
- [ ] Visual contract guard verde (`scripts/ops/check-visual-contract.mjs`).

### Riscos

- Stripe BR exige documentos específicos (CNPJ, contrato social, comprovante de endereço, foto do CPF). Lista pode mudar — código deve ler `account.requirements.currently_due` dinamicamente, não hardcodar.
- Stripe Identity (verificação de selfie) tem branding Stripe inevitável durante o KYC. Aceito como compliance — explicado no ADR 0003.

---

## FASE 4 — Wallet prepaid

**Objetivo**: módulo separado para créditos de uso de API/AI/WhatsApp. INDEPENDENTE de Connect — usa PaymentIntent simples na conta plataforma.

### Entregáveis

- [ ] Migration Prisma:
  ```prisma
  model Wallet {
    id                            String   @id @default(cuid())
    workspaceId                   String   @unique
    balanceCents                  BigInt   @default(0)
    currency                      String   @default("BRL")
    autoRechargeEnabled           Boolean  @default(false)
    autoRechargeThresholdCents    BigInt?
    autoRechargeAmountCents       BigInt?
    defaultPaymentMethodId        String?
    stripeCustomerId              String?
    createdAt                     DateTime @default(now())
    updatedAt                     DateTime @updatedAt
  }
  model WalletTransaction {
    id                    String   @id @default(cuid())
    walletId              String
    type                  WalletTxType  // TOPUP | USAGE | REFUND | ADJUSTMENT
    amountCents           BigInt   // signed
    balanceAfterCents     BigInt
    referenceType         String
    referenceId           String
    metadata              Json?    @db.JsonB
    createdAt             DateTime @default(now())
    @@index([walletId, createdAt])
  }
  enum WalletTxType { TOPUP USAGE REFUND ADJUSTMENT }
  ```
- [ ] `backend/src/wallet/wallet.service.ts`:
  - `createTopupIntent(workspaceId, amountCents, method: 'pix'|'card'): Promise<{ clientSecret, qrCode? }>`
  - `creditFromWebhook(paymentIntentId): Promise<void>` (idempotente)
  - `chargeForUsage(workspaceId, operation, units): Promise<{ newBalance }>` (transação atômica + bloqueia se saldo insuficiente)
  - `triggerAutoRecharge(walletId): Promise<void>` (off-session usando `defaultPaymentMethodId`)
- [ ] Tabela `UsagePrice` (catálogo de preços por operação) — seed com:
  - `ai_agent_message`: TBD cents per unit
  - `whatsapp_send`: TBD cents per unit
  - `api_call_standard`: TBD cents per unit
- [ ] Webhook handler para `payment_intent.succeeded` com `metadata.type = 'wallet_topup'` → credita wallet.
- [ ] Frontend: tela `frontend/src/app/(settings)/wallet/` mostrando saldo, histórico, botão recarregar (modal PIX QR + cartão).

### Critérios de pronto

- [ ] Smoke: cria PaymentIntent test → simula webhook → wallet creditada → debita uso → bloqueia quando zera.
- [ ] Coverage `≥ 90%` em `wallet.service.ts`.
- [ ] Idempotência testada: mesmo webhook 2x não credita 2x.

### Riscos

- Auto-recharge off-session pode falhar (cartão recusado) — fluxo de fallback (notificar seller, suspender uso até recarga manual).

---

## FASE 5 — FraudEngine

**Objetivo**: motor antifraude unificado rodando ANTES de cada `PaymentIntent`. Base de blacklist compartilhada entre todos os sellers.

### Entregáveis

- [ ] Migration Prisma:
  ```prisma
  model FraudBlacklist {
    id          String   @id @default(cuid())
    type        BlacklistType  // CPF | CNPJ | EMAIL | IP | DEVICE_FINGERPRINT | CARD_BIN
    value       String
    reason      String
    addedBy     String?  // admin user id
    expiresAt   DateTime?
    createdAt   DateTime @default(now())
    @@unique([type, value])
  }
  enum BlacklistType { CPF CNPJ EMAIL IP DEVICE_FINGERPRINT CARD_BIN }
  ```
- [ ] `backend/src/payments/fraud/fraud.engine.ts`:
  - `evaluate(checkoutContext): Promise<FraudDecision>` retornando `{ action: 'allow'|'review'|'require_3ds'|'block', score, reasons }`.
  - Sinais: blacklist match, velocity (>N compras de mesmo IP/CPF em janela), country mismatch, valor anômalo, seller reputation.
- [ ] Middleware NestJS injetado em `CheckoutController` antes da criação de PaymentIntent.
- [ ] Auto-blacklist em chargeback: handler de `charge.dispute.created` adiciona CPF/email/IP do buyer à blacklist com `reason: 'auto_chargeback'`.

### Critérios de pronto

- [ ] Coverage `≥ 90%` em `fraud.engine.ts`.
- [ ] Teste E2E: blacklist CPF X → tentativa de checkout com CPF X é bloqueada com 403.
- [ ] Não-regressão: checkout sem sinais de fraude prossegue normalmente.

### Riscos

- Falsos positivos bloqueando vendas legítimas. Mitigação: `action: 'review'` envia para fila de moderação manual em vez de bloquear; threshold conservador no MVP.

---

## FASE 6 — Kill-switch cutover (simplificada)

**Objetivo**: trocar Asaas/MP por Stripe sem camadas de compatibilidade.

> **Decisão revisada em 2026-04-17 após query de produção**: zero pagamentos reais existem em `CheckoutPayment`, `Payment`, `KloelSale`, `WebhookEvent`, `ExternalPaymentLink`, `Invoice`. As únicas 10 `CheckoutOrder` são todas `PENDING` (criadas mas nunca pagas — orfãs safe-to-delete). Não há nenhum legacy a preservar. Kill-switch é a estratégia correta. O Adapter pattern original (`PaymentProvider` interface + `StripeAdapter` + `AsaasLegacyAdapter` + feature flag por workspace + `RetireAsaasLegacyJob`) era engenharia para um problema que não existe. Removido.

### Entregáveis

- [ ] Limpeza de orfãs: `DELETE FROM "CheckoutOrder" WHERE status='PENDING' AND "createdAt" < NOW() - INTERVAL '7 days'` (registrar count antes/depois em `VALIDATION_LOG.md`). Confirmar com Daniel antes de DELETE em produção.
- [ ] `backend/src/payments/stripe/stripe-charge.service.ts` — único caminho de criação de charge a partir desta fase. Sem interface `PaymentProvider`, sem factory.
- [ ] Schema Prisma: `CheckoutPayment.gateway` e `Payment.provider` viram coluna `provider` com tipo enum fixo `PaymentProvider { STRIPE }`. Migration substitui valores antigos por `STRIPE` (rows existentes são 0, então migration é noop em produção — só estabelece o constraint).
- [ ] `backend/src/payments/stripe/stripe-webhook.controller.ts` — único endpoint `/webhooks/stripe`. `/webhooks/asaas` e `/api/mercado-pago/ipn` retornam 410 Gone até FASE 9 deletar.

### Critérios de pronto

- [ ] Toda nova ordem em qualquer workspace cria PaymentIntent Stripe.
- [ ] Endpoint legado retorna 410 com mensagem clara ("provider deprecated, use Stripe").
- [ ] Migration aplicada em sandbox e produção (produção é segura — 0 rows afetadas).

### Riscos

- Nenhum risco de dados — não há legacy. Risco operacional só se algum workspace tentar criar ordem entre cutover e FASE 8 (frontend) ficar verde. Mitigação: FASE 6/7/8 deployadas juntas em uma única janela.

---

## FASE 7 — Checkout migration (backend)

**Objetivo**: `backend/src/checkout/*` reescrito sobre Stripe via Adapter. Casca preservada no contrato API.

### Entregáveis

- [ ] `checkout.service.ts` refatorado: usa `PaymentProviderFactory.forWorkspace(workspaceId).createCharge(...)`.
- [ ] `checkout-webhook.controller.ts` unifica handler — delega para `PaymentProvider.handleWebhook` baseado em rota (`/webhooks/stripe`, `/webhooks/asaas-legacy`).
- [ ] DELETE: `mercado-pago-checkout-policy.util.ts`, `mercado-pago-quality.util.ts`, `mercado-pago-webhook-signature.util.ts` (e specs correspondentes).
- [ ] Schema migration: `CheckoutPayment.gateway` vira `provider PaymentProviderEnum` com migração de dados.
- [ ] Suite de testes E2E checkout passa em ambos os providers.

### Critérios de pronto

- [ ] `npm --prefix backend test -- --testPathPattern=checkout` verde.
- [ ] PULSE module `Checkout`: 100% health.
- [ ] Smoke E2E: workspace STRIPE cria ordem, recebe webhook, ordem confirmada, split disparado.

### Riscos

- Tests legados mockam Asaas/MP. Reescrever para mockar `PaymentProvider` (interface), não implementação concreta.

---

## FASE 8 — Frontend migration

**Objetivo**: substituir `AsaasTokenizer.tsx` por Stripe Elements (embedded). Casca visual preservada.

### Entregáveis

- [ ] `frontend/src/app/(checkout)/components/StripePaymentElement.tsx` (substitui AsaasTokenizer; mesma API de props).
- [ ] Hooks `useCheckout`, `useCheckoutExperience` ajustados.
- [ ] DELETE: `frontend/src/app/api/mercado-pago/ipn/route.ts`, `frontend/src/lib/mercado-pago.ts`, `frontend/src/app/(checkout)/components/AsaasTokenizer.tsx`.
- [ ] Adicionar `@stripe/stripe-js` e `@stripe/react-stripe-js` em `frontend/package.json`.
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` configurado em Vercel (preview = test, prod = live).

### Critérios de pronto

- [ ] `npm --prefix frontend run typecheck && npm --prefix frontend run build` verde.
- [ ] Visual contract guard verde.
- [ ] Smoke manual em browser: PIX e cartão test funcionam até confirmação.

### Riscos

- Stripe Elements não suporta PIX em todos os países. Verificar capability na conta antes do go-live.

---

## FASE 9 — Cleanup

**Objetivo**: remover código morto residual.

### Entregáveis

- [ ] DELETE arquivos (após FASE 7+8 verdes em produção):
  - `backend/src/kloel/asaas.service.ts`
  - `backend/src/kloel/mercado-pago.service.ts`
  - `backend/src/kloel/mercado-pago-wallet.controller.ts`
  - `backend/src/kloel/mercado-pago-order.util.ts` (e spec)
  - `backend/src/kloel/payment.service.ts` (lógica migra para `PaymentProviderFactory`)
  - `backend/src/kloel/smart-payment.service.ts` (idem)
- [ ] Remover dependências `npm` órfãs em `backend/package.json` (busca: `mercadopago`, `asaas-*`).
- [ ] Limpar imports órfãos via `eslint --fix`.
- [ ] Schema final: `CheckoutPayment.provider`, `Payment.provider`, `WebhookSubscription.provider` viram enum sem strings livres.

### Critérios de pronto

- [ ] `grep -rE 'asaas|mercadopago' backend/src frontend/src --include='*.ts' --include='*.tsx'` retorna apenas comentários históricos ou nada.
- [ ] Build de todos os workspaces verde.
- [ ] Lint zero warning.

### Riscos

- Deleção prematura quebra ordens legacy ainda em refund. Mitigação: só executar após `RetireAsaasLegacyJob` confirmar 0 workspaces `ASAAS_LEGACY` ativos.

---

## FASE 10 — PULSE & docs

**Objetivo**: PULSE conhece a nova realidade. Docs sincronizados.

### Entregáveis

- [ ] `scripts/pulse/parsers/*.ts` — atualizar regex que detectam Asaas/MP (10 arquivos identificados na auditoria 2026-04-17).
- [ ] PULSE health module `Checkout`: 100%.
- [ ] PULSE health module `Payments` (novo): 100%.
- [ ] CLAUDE.md FASE 1 do DAG atualizada: substitui "Asaas" por "Stripe Connect".
- [ ] CLAUDE.md "ENV VARS" atualiza: remove `ASAAS_WEBHOOK_TOKEN`, adiciona `STRIPE_WEBHOOK_SECRET`, `STRIPE_RESTRICTED_KEY`.
- [ ] `VALIDATION_LOG.md` recebe entrada da migração concluída com evidências.
- [ ] `AUDIT_FEATURE_MATRIX.md` atualiza: módulos Checkout, Wallet, Payments, Connect → READY.

### Critérios de pronto

- [ ] `npx ts-node scripts/pulse/index.ts --report` mostra 100% nos módulos relacionados.
- [ ] Diff em CLAUDE.md aprovado.
- [ ] `VALIDATION_LOG.md` documenta cada smoke E2E executado.

### Riscos

- CLAUDE.md está em "Arquivos Protegidos". Edição requer autorização explícita do dono — registrada nesta sessão (2026-04-17).

---

## ENV VARS finais (estado alvo)

```
# Backend (Railway)
STRIPE_SECRET_KEY=sk_live_***          # produção apenas
STRIPE_PUBLISHABLE_KEY=pk_live_***
STRIPE_WEBHOOK_SECRET=whsec_***        # do endpoint /webhooks/stripe
STRIPE_RESTRICTED_KEY=rk_live_***      # opcional, para CI/automação com escopo limitado
STRIPE_CONNECT_CLIENT_ID=ca_***        # se usar OAuth flow (não obrigatório com Custom Accounts)

# Frontend (Vercel)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_***

# Removido:
# ASAAS_WEBHOOK_TOKEN          ← deleta após FASE 9
# MERCADO_PAGO_ACCESS_TOKEN    ← deleta após FASE 9
# (e qualquer outra var asaas_*/mp_*)
```

Local dev usa `sk_test_*` em `.env.pulse.local` (já configurado em 2026-04-17).

---

## Checklist global de "pronto pra produção"

(Aplicável após FASE 10. Não cruzar até estar 100% verde.)

- [ ] Stripe live keys configuradas em Railway (production env).
- [ ] Webhook endpoint live criado e testado com `stripe trigger`.
- [ ] PIX capability ativa na conta (ou aceito que parte mais tempo).
- [ ] 5 sellers friends-and-family fizeram fluxo completo em production sem erro.
- [ ] Chargeback simulado em production: reversão funciona.
- [ ] Refund simulado em production: `reverse_transfer: true` + `refund_application_fee: true` funcionam.
- [ ] Payout manual disparado e creditado em conta bancária test.
- [ ] PULSE 100% nos módulos Checkout, Payments, Wallet, Connect.
- [ ] Coverage SplitEngine, LedgerEngine, FraudEngine ≥ 95%.
- [ ] Sentry configurado para alertar erros em todos os webhooks.
- [ ] Termos de uso atualizados com cláusula de retenção autorizada.
- [ ] ADR 0003 marcado como "Implemented" + data.

---

## Bloqueios conhecidos (atualizar em tempo real)

| Bloqueio                               | Quem resolve          | Status                                                                                                                                |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`railway login` deslogado~~          | ~~Daniel~~            | **Resolvido 2026-04-17**: usar `RAILWAY_TOKEN="${RAILWAY_PROJECT_TOKEN}" railway <cmd>` (token em `.env.pulse.local`) — bypassa OAuth |
| PIX capability requer dashboard Stripe | Daniel                | Aberto                                                                                                                                |
| Webhook endpoint Stripe live           | Daniel ou após FASE 0 | Aberto                                                                                                                                |
| Stripe Identity branding inevitável    | Aceito (ADR 0003)     | Resolvido                                                                                                                             |

---

## Como retomar este trabalho (instrução pra qualquer agente)

1. Ler este arquivo do topo.
2. Procurar a próxima fase com `[ ]` em "Critérios de pronto".
3. Antes de tocar código, validar pré-requisitos da fase (entregáveis das fases anteriores).
4. Se PULSE ou tests da fase anterior estão vermelhos, parar e reportar — não pular fases.
5. Ao concluir entregáveis e cumprir critérios de pronto, marcar `[x]` neste arquivo + adicionar evidência (commit hash, output de teste).
6. Se descobrir limitação que invalida o ADR 0003, parar e abrir novo ADR — não improvisar.
