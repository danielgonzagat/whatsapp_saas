---
title: SP-9 — Carteira da plataforma (Platform Wallet)
status: draft
author: claude-opus-4-6 (autonomous)
date: 2026-04-15
module: adm.kloel.com · Carteira
tier: CRITICAL · financial · irreversible
depends_on: SP-0/1/2 (foundation+IAM+2FA), SP-4 (contas — workspace wallet link)
blocks: SP-12 (custom fees tier override)
---

# SP-9 — Platform Wallet

O maior épico financeiro do painel admin. Kloel opera como marketplace: o
dinheiro entra via gateway (Asaas), é provisionado à carteira do produtor
(`KloelWallet`), e uma fração fica retida na plataforma. Hoje essa fração **não
tem representação contábil** — o admin não consegue responder "quanto dinheiro a
Kloel tem agora, onde ele está, e para onde ele vai".

SP-9 constrói:

1. `PlatformWallet` — saldo da Kloel por moeda, em cents, com buckets
   `available` / `pending` / `reserved` (reserva para chargebacks).
2. `PlatformWalletLedger` — append-only, espelho do padrão já consagrado em
   `KloelWalletLedger` (schema.prisma:1569), com invariantes aplicadas pela
   camada de serviço dentro de `$transaction`. **Não** introduz triggers de
   banco — manter paridade com o ledger existente reduz risco de divergência.
3. `PlatformFee` — configuração de taxa da plataforma por método de pagamento e
   faixa de volume. A taxa vigente é carimbada em cada `CheckoutOrder` no
   momento do split para garantir auditabilidade histórica (ver I-ADMIN-W1
   abaixo).
4. `PlatformPayout` — fila de saques aprovados pela operação para transferência
   do saldo disponível da `PlatformWallet` para a conta operacional da Kloel.
   **Fora de escopo**: automação de PIX via Asaas nessa fase; SP-9 inicia com
   saída manual + registro.
5. Reconciliação — job diário que:
   - soma o ledger por bucket e compara com o saldo materializado,
   - soma os fees retidos das orders do dia e compara com os créditos de
     `platform_fee_credit` no ledger,
   - emite um `AdminAuditLog` de severidade `HIGH` em qualquer divergência.

## Invariantes formais (I-ADMIN-W1 .. W6)

- **I-ADMIN-W1 (histórico de taxa)**: toda `CheckoutOrder` com split deve
  referenciar `platformFeeSnapshotId` — nunca recalcular a taxa a partir da
  configuração atual.
- **I-ADMIN-W2 (ledger append-only)**: `PlatformWalletLedger` não tem
  `updatedAt` e jamais é atualizado/deletado. Reforçado pela ausência de
  `update/delete` no service e por um teste
  `platform-wallet-ledger.invariant.spec.ts` que falha o build se a assinatura
  expor `update()` ou `delete()`.
- **I-ADMIN-W3 (atomicidade)**: toda mutação de saldo é emitida em
  `$transaction` junto com o append do ledger correspondente. Helper obrigatório
  `PlatformWalletService.append(tx, ...)` — nunca chamar
  `prisma.platformWallet.update()` direto.
- **I-ADMIN-W4 (moeda ⊂ cents)**: todos os valores são `BigInt` em cents.
  `Float` nunca entra na carteira da plataforma — zero dependência do legado
  `KloelWallet.availableBalance:Float`.
- **I-ADMIN-W5 (idempotência do split)**: o split de uma `CheckoutOrder` nunca
  pode creditar a `PlatformWallet` duas vezes. A unicidade é garantida por
  `@@unique([orderId, kind])` no `PlatformWalletLedger` com
  `kind in ('platform_fee_credit','chargeback_reserve','refund_debit','chargeback_debit')`
  .
- **I-ADMIN-W6 (aprovação humana)**: `PlatformPayout` só avança de `PENDING`
  para `APPROVED` via ação de um `AdminUser` com permissão `CARTEIRA:APPROVE`. A
  aprovação é registrada em `AdminAuditLog` e a trigger PG existente de
  `admin_audit_logs` garante imutabilidade.

## Superfície de UI (preserva a casca atual)

A página `/carteira` já existe como shell honesto, com `StatCard`s declarados
como `unavailableReason`. SP-9 substitui cada `null` por valor real sem mudar
layout. A shell vira:

- **KPIs**: saldo disponível, saldo a receber, reserva chargeback, receita Kloel
  30d, receita Kloel total, fee efetivo médio %.
- **Gráfico de receita**: linha diária de `platform_fee_credit` dos últimos 30
  dias (mesma biblioteca Recharts/LineChart já usada no God View).
- **Aba Ledger**: tabela paginada, filtro por `kind` e data range.
- **Aba Payouts**: lista de `PlatformPayout` com ação "Aprovar" gated por
  `CARTEIRA:APPROVE`.
- **Aba Reconciliação**: último run do job, diff por bucket, CTA "Rodar agora"
  (idempotente).

## Paridade com arquitetura existente

- Ledger segue padrão `KloelWalletLedger` (schema.prisma:1569).
- Enforcement em aplicação, não em trigger — **decisão deliberada** para manter
  paridade com o ledger existente; trigger-based seria divergente e aumentaria
  risco de regressão.
- Campos em cents via `BigInt`, serialização via `bigintToString` helper já em
  uso em `admin-sanitize.ts`.
- Permissões via `AdminPermission(CARTEIRA, VIEW|APPROVE|EXPORT)` — já modelado
  no default matrix de SP-0.

## Fora de escopo (doc. explícito para evitar scope creep)

- PIX automático para payout (próximo épico).
- Emissão de nota fiscal / retenções tributárias.
- Anticipation/antecipação programática do produtor — essa já existe em
  `WalletAnticipation` (schema.prisma:2239) e **não** é da plataforma.
- Split tripartite afiliado (fica para SP-12).

## Rollout

- Feature flag `adm.wallet.v1` começa `OFF` em produção.
- Script de backfill opcional que reconstrói o ledger a partir de
  `CheckoutOrder` históricas. Roda em dry-run primeiro, emite relatório de diff,
  depois flip do flag.
- Canary: só o owner enxerga a página até o flag global.
- Rollback: flag `OFF` esconde a rota; ledger permanece intacto (append-only
  garante rollback seguro).

## Plano de testes

- Unit: `PlatformWalletService` — casos `creditFee`, `debitRefund`,
  `creditChargebackReserve`, `moveReservedToAvailable`.
- Invariant: `platform-wallet-ledger.invariant.spec.ts` — bloqueia
  `update/delete` na superfície pública.
- Integration: fluxo checkout → confirm → split → ledger, idempotência testada
  via `CheckoutOrder.externalId` replay.
- Reconciliation: fixture com ledger + saldo materializado drift artificial;
  reconcile job detecta e emite `AdminAuditLog`.
