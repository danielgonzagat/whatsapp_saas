# KLOEL Legal and Financial Compliance

## Scope

This document is the operational compliance baseline for launching and operating
KLOEL while processing customer data and payments.

## Public Legal Surfaces

- Terms of use page: `frontend/src/app/(public)/terms/page.tsx`
- Privacy policy page: `frontend/src/app/(public)/privacy/page.tsx`

These pages are mandatory and must remain publicly accessible.

## LGPD Baseline

- The privacy policy must describe categories of personal data, legal basis,
  retention, rights, and DPO contact.
- Personal data exposure in logs must remain minimized.
- Production incidents involving personal data are treated as P1.

## Financial Processing Baseline

- Payment webhooks must verify `STRIPE_WEBHOOK_SECRET`.
- Production and staging must use distinct payment credentials.
- Refund and chargeback handling must be documented and supportable.
- Financial alerts must route into `OPS_WEBHOOK_URL` or `DLQ_WEBHOOK_URL`.

## Mandatory Business Policies

Before operating with real money, the following must remain defined and
reviewable:

- Terms of use
- Privacy policy
- Refund policy
- Chargeback handling process
- Stripe account standing and capability status
- Split and intermediary payment compliance review
- Nota fiscal issuance flow

## Operational Commitments

- No unverified Stripe webhook endpoint in production.
- No unlogged refund or chargeback handling.
- No launch without a clear owner for nota fiscal issuance.
- No launch without a defined support path for refund and chargeback disputes.

## Refund and Chargeback Policy

- Refund requests must have an accountable owner and SLA.
- Chargeback cases must be traceable to the originating payment and order.
- Financial reversals must be auditable in system logs and provider records.

## Split and Intermediation

If the platform performs split or intermediary settlement:

- confirm contractual allowance with Stripe,
- confirm tax and legal treatment of the intermediary role,
- confirm ledger and reconciliation behavior,
- confirm what is emitted as nota fiscal and by whom.

## Release Gate

Production is not ready if any of the following are missing:

- public terms,
- public privacy policy,
- Asaas webhook verification,
- refund and chargeback policy,
- nota fiscal owner/process,
- staging validation for the payment flow.
