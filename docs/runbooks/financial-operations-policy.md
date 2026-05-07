# Kloel Financial Operations Policy

## 1. Scope

This document defines the operational policies, service-level agreements, and seller terms that govern the Kloel financial marketplace. All financial flows — including payments, splits, payouts, refunds, chargebacks, and prepaid wallet operations — are bound by these policies.

**Effective Date:** 2026-04-26
**Version:** 1.0
**Last Review:** 2026-04-26
**Approval Required:** Daniel (Kloel owner)

---

## 2. Payout Schedule

### 2.1 Standard Payout Timing

| Role       | Maturation Period | Payout Schedule   |
| ---------- | ----------------- | ----------------- |
| Seller     | 7 calendar days   | Manual, on-demand |
| Supplier   | 7 calendar days   | Manual, on-demand |
| Affiliate  | 7 calendar days   | Manual, on-demand |
| Coproducer | 7 calendar days   | Manual, on-demand |
| Manager    | 7 calendar days   | Manual, on-demand |

### 2.2 Maturation Rules

- All sale proceeds enter `pending_balance` upon successful payment confirmation.
- After `7 calendar days`, funds mature from `pending_balance` to `available_balance`.
- Maturation is enforced automatically by the `ConnectLedgerMaturationService` cron (runs every minute).
- Manual maturation override requires admin authorization with audit trail.

### 2.3 Payout Authorization

- Payouts require explicit admin approval via the `ConnectPayoutApprovalService`.
- Approval lifecycle: `request → approve → execute (Stripe payout.create) → confirm (payout.paid webhook)`.
- Rejected payout requests require a written reason recorded in the admin audit log.
- All payouts use Stripe Connect platform payouts against the connected account's external bank account.

### 2.4 Payout Limitations

- Payout amount cannot exceed `available_balance`.
- Duplicate payout requests for the same account while one is `OPEN` are rejected.
- Payouts are executed only via the manual approval flow. There is no automatic payout dispatch.
- Stripe `payouts_enabled` must be true on the connected account before payout creation.

---

## 3. Fee Structure

### 3.1 Kloel Marketplace Fee

- **Default rate:** 9.9% of gross sale value.
- Fee is deducted at the SplitEngine layer before distribution to role accounts.
- Fee target is immutable per the Fixed Architecture Contract.

### 3.2 Payment Processing Fee

- Gateway fees (Stripe card processing, PIX): variable per payment method.
- Approximate fee: 2.99% for credit card transactions.
- Processing fees are deducted before Kloel fee and role splits.

### 3.3 Installment Interest

- **Monthly rate:** 3.99% for buyer-side installment financing (parcelamento).
- Interest is embedded in the installment calculation.
- PIX transactions are single-payment only (no installments).

### 3.4 Prepaid Wallet Fees

- Prepaid wallet top-ups have no additional Kloel fee beyond Stripe processing.
- Wallet `chargeForUsage` deductions are exact provider cost (catalog-price or provider-quoted mode).
- No markup is applied on prepaid wallet consumption.

---

## 4. Refund Policy

### 4.1 Full Refund

- Buyer may request a full refund within 7 calendar days of purchase.
- Refund cascades across all role accounts proportionally.
- Refund execution:
  1. Stripe `refunds.create` on the original PaymentIntent.
  2. Webhook `refund.created` triggers `ConnectReversalService.refund`.
  3. Ledger debit cascade: available_balance first, then pending_balance if needed.
  4. All role splits are reversed proportionally.

### 4.2 Partial Refund

- Partial refunds are not supported in the current marketplace model.
- If needed, the admin must process as a manual adjustment via the reconciliation service.

### 4.3 Refund Window

- Standard: 7 days from purchase date.
- Extended: Not applicable unless a specific product policy overrides.

---

## 5. Chargeback / Dispute Handling

### 5.1 Dispute Lifecycle

1. **Dispute Created** (`charge.dispute.created` webhook):
   - Ledger immediately debits the seller's available_balance for the full dispute amount.
   - If available_balance is insufficient, pending_balance is also debited.
   - Admin audit log records `system.sale.dispute_created`.

2. **Dispute Won** (`charge.dispute.closed` with status=won):
   - Ledger credits the seller's available_balance back.
   - Sale status restored to APPROVED.
   - Admin audit log records `system.sale.dispute_won`.

3. **Dispute Lost** (`charge.dispute.closed` with status=lost):
   - Ledger debit is finalized (no reversal).
   - Sale status updated to DISPUTED_LOST.
   - Admin audit log records `system.sale.dispute_lost`.

### 5.2 Seller Responsibility

- Sellers are responsible for providing evidence in disputes.
- Kloel provides transaction records and split data as evidence.
- Sellers who exceed a 1% dispute rate may face account review or restriction.
- Chargeback fees ($15 per dispute) are deducted from the seller's available balance.

### 5.3 Dispute Prevention

- FraudEngine evaluates all transactions before PaymentIntent creation.
- Transactions routed to `review` require admin approval.
- Three-D Secure (3DS) is forced for high-risk card transactions.

---

## 6. Prepaid Wallet Policies

### 6.1 Top-up Methods

- **PIX:** Instant QR code from Stripe, cleared within minutes.
- **Credit Card:** Standard Stripe card processing with 3DS when required.
- Minimum top-up: R$ 10.00 (1,000 cents).
- Maximum single top-up: R$ 50,000.00 (5,000,000 cents).

### 6.2 Usage Deduction

- Wallet balance is debited atomically before API/AI service consumption starts.
- If balance is insufficient, the request is rejected with a user-facing message.
- Retries on the same `requestId` are idempotent and do not double-debit.

### 6.3 Auto-Recharge

- Users may configure auto-recharge via the wallet settings endpoint.
- Auto-recharge triggers when `balanceCents <= autoRechargeThresholdCents`.
- Auto-recharge attempts the configured `autoRechargeAmountCents` via the default payment method.
- Pending auto-recharge prevents duplicate triggers (guard via `pendingAutoRechargePaymentIntentId`).

### 6.4 Wallet Refunds

- If a wallet-deducted operation fails downstream, `refundUsageCharge` re-credits the wallet.
- Settlements adjust the estimated charge against the exact provider cost.
- All wallet transactions are immutably logged in `PrepaidWalletTransaction`.

---

## 7. Seller Agreement Terms

### 7.1 Acceptance of Terms

By creating a seller account on Kloel and completing the KYC onboarding flow, the seller agrees to:

1. **Fee Acceptance:** The seller accepts Kloel's marketplace fee of 9.9% on gross sales plus any applicable gateway processing fees.

2. **Payout Authorization:** The seller authorizes Kloel to hold funds for the 7-day maturation period and to execute payouts according to the schedule defined in Section 2.

3. **Dispute Liability:** The seller accepts financial liability for chargebacks and disputes. Chargeback fees and disputed amounts are recoverable from the seller's available and pending balances.

4. **Refund Obligation:** The seller authorizes Kloel to process refunds upon buyer request within the 7-day refund window, with proportional deduction from all role accounts.

5. **Compliance with Law:** The seller represents that all products sold via Kloel comply with Brazilian consumer law (CDC), tax regulations, and applicable industry standards.

6. **No Stripe Dashboard Access:** The seller acknowledges that all account management is performed exclusively through the Kloel platform. The seller does not have and will not request direct Stripe dashboard access.

7. **Account Suspension:** Kloel reserves the right to suspend or restrict seller accounts for fraud, excessive disputes, policy violations, or regulatory non-compliance, with written notice and a 30-day cure period where applicable.

8. **Data Processing:** The seller consents to Kloel processing personal and financial data as necessary for payment processing, fraud prevention, and regulatory compliance, in accordance with Brazil's LGPD.

9. **Termination:** Either party may terminate the agreement with 30 days' written notice. Upon termination, all pending balances are settled within 60 days, subject to outstanding disputes and chargeback liability.

10. **Dispute Resolution:** Any disputes arising from this agreement shall first be resolved through good-faith negotiation. Unresolved disputes shall be submitted to the competent courts of São Paulo, Brazil.

---

## 8. Operational Playbook

### 8.1 Incident Response

| Severity | Response Time | Escalation Path                   |
| -------- | ------------- | --------------------------------- |
| P0       | 15 minutes    | Daniel (owner) → On-call engineer |
| P1       | 1 hour        | Engineering team → Daniel         |
| P2       | 4 hours       | Engineering team                  |
| P3       | 24 hours      | Engineering backlog               |

### 8.2 P0 Incident Criteria

- Payment processing is down (all PaymentIntents failing).
- Payouts are frozen with no recovery path visible.
- Ledger drift detected with non-zero delta.
- Stripe API is returning 500-level errors across all operations.

### 8.3 Routine Reconciliation

- `ConnectLedgerReconciliationService` runs every 15 minutes.
- Drift detection triggers admin audit log entry + Sentry alert.
- Daily manual reconciliation review recommended for production.

### 8.4 Security

- Zero `sk_live_*` keys outside production environment.
- Production live mode requires `NODE_ENV=production` AND `KLOEL_LIVE_MODE=confirmed`.
- All financial endpoints are rate-limited and JWT-protected with workspace guard.
- Webhook signatures are verified before processing.

---

## 9. Communication

### 9.1 Transactional Emails

- Payment confirmation → buyer (via Resend).
- Payout status update → seller (via Resend).
- Wallet low balance alert → workspace owner.
- Auto-recharge triggered → workspace owner.
- Dispute notification → seller.

### 9.2 Admin Notifications

- Payout approval request → admin dashboard notification.
- Dispute created → admin dashboard notification.
- Ledger drift → Sentry alert + admin audit log.
- Wallet insufficient balance errors → Sentry capture (non-blocking).

---

## 10. Revision History

| Version | Date       | Author | Changes                     |
| ------- | ---------- | ------ | --------------------------- |
| 1.0     | 2026-04-26 | Kilo   | Initial operational policy. |
