# Kloel Payment Kernel Design

- Date: 2026-04-17
- Status: Approved
- Scope: Product/payment architecture contract for Kloel storefronts, multi-role split, ledger,
  payout control, and Stripe execution rail

## Capability

Kloel offers seller-branded storefronts under the seller's own domain while retaining full
operational control of checkout, attribution, financial orchestration, payout timing, and
stakeholder visibility.

The buyer buys inside the seller experience. Kloel controls the runtime, computes the canonical sale
allocation, governs pending versus available balances, and releases payouts according to Kloel
policy. Stripe is treated as the payment rail and execution layer, not as the source of product
truth.

## Product Thesis

Kloel combines:

- Shopify-grade storefront control and seller-branded checkout
- Hotmart/Braip-style affiliate and multi-stakeholder payment logic
- A Kloel-owned ledger, payout, and risk layer

This architecture is only defensible if the storefront runtime, checkout runtime, domain routing,
and post-payment state transitions stay under Kloel control.

## Core Constraints

- Domain, DNS routing, hosting, and storefront runtime must stay under Kloel control.
- Checkout must always originate from a Kloel-controlled runtime, even when rendered on the seller
  domain.
- Seller cannot replace or bypass the Kloel payment kernel for products that use Kloel split logic.
- All financial math uses integer cents only. Never floats.
- The canonical allocation order is fixed:
  - Kloel
  - Supplier
  - Affiliate
  - Coproducer
  - Manager
  - Seller
- Supplier and affiliate are protected by priority.
- Coproducer, manager, and seller can be clamped to zero if earlier priorities consume the available
  remainder.
- Dashboard balances shown by Kloel are ledger balances, not raw provider balances.
- Payouts are Kloel-controlled and manual/orchestrated.
- Refunds, disputes, reversals, and maturity transitions are ledger events before they are UI
  events.
- Every remunerated stakeholder needs a Kloel identity and a payout-capable connected/receiving
  account.

## Strategic Clarification

Kloel is not designed around what Stripe exposes as a complete product. Kloel is designed around its
own product contract.

Stripe is an execution rail.

Anything Stripe does not expose natively but that Kloel requires at product level must be
implemented in Kloel's own layers:

- Split rules
- Priority clamping
- Stakeholder visibility
- Pending versus available balance
- Maturity windows
- Payout release policy
- Reconciliation
- Risk and reversal policy

## Canonical Actors

- Buyer: final customer who pays at checkout
- Seller: store owner and primary commercial actor
- Supplier: fixed-value or priority stakeholder configured by product
- Affiliate: attributed promoter paid according to attribution and product rules
- Coproducer: secondary percentage stakeholder
- Manager: secondary percentage stakeholder
- Kloel Operator: platform actor responsible for policy, risk, payout release, reconciliation, and
  dispute operations

## Surfaces

### 1. Storefront Runtime

The seller storefront is rendered from Kloel infrastructure under a seller-branded domain.

Responsibilities:

- theme rendering
- seller-authored JSX templates
- safe extension sandbox
- Kloel tracking and attribution injection
- checkout entrypoint control

### 2. Checkout Runtime

The checkout runtime is controlled by Kloel and rendered in the seller experience. It is not
seller-editable in any way that can affect financial integrity.

Responsibilities:

- plan and offer resolution
- affiliate attribution lookup
- split preview and disclosures
- payment intent initiation
- anti-fraud checks
- post-payment routing

### 3. Product Backoffice

The seller configures:

- list price
- installment policy
- supplier rule
- affiliate commission
- coproducer commission
- manager commission
- payout maturity windows
- product disclosures

### 4. Stakeholder Dashboards

Each role sees only its own financial truth and the sale context relevant to that role.

Examples:

- seller sees sale value, own net commission, status, and optionally a breakdown
- affiliate sees only attributed sales and affiliate commission
- supplier sees only supplier-entitled sales and supplier commission

### 5. Operator Console

Used for:

- dispute operations
- payout release controls
- risk review
- reconciliation
- audit trails
- manual overrides

## Core Modules

### Domain Manager

Manages:

- domain purchase or transfer flow
- DNS pointing
- SSL
- tenant routing

### Storefront Compiler / Runtime

Compiles and runs seller-authored storefront code inside Kloel constraints.

### Affiliate Attribution Engine

Resolves:

- links
- cookies
- UTMs
- campaign ownership
- attribution window

### SplitEngine

Consumes:

- sale value
- buyer paid amount
- platform fee
- financing interest
- seller/product role configuration
- attribution context

Produces:

- canonical per-role allocation in cents
- residue and clamping decisions
- reasoned split audit data

### LedgerEngine

Kloel financial source of truth.

Tracks:

- pending balance
- available balance
- reserved balance
- reversed balance
- paid out balance
- negative balance

### Settlement Orchestrator

Translates the canonical Kloel sale into provider operations:

- charge creation
- transfers
- refunds
- reversals
- payouts
- event synchronization

### Payout Scheduler

Moves ledger balances from pending to available according to role and product policy.

### Risk / Fraud Engine

Evaluates checkout and account behavior before settlement:

- velocity
- blacklist
- device fingerprint
- IP/email/CPF anomaly
- seller risk posture

### Reconciliation Engine

Reconciles Kloel ledger truth with provider events and balances.

### Notification Engine

Emits:

- sale approved
- payout available
- payout sent
- dispute created
- reversal posted
- refund processed

## Financial Rules

### Priority Order

1. Kloel takes platform fee plus financing interest.
2. Supplier is paid next.
3. Affiliate is paid next, with clamping to remaining eligible amount.
4. Coproducer is paid next.
5. Manager is paid next.
6. Seller receives the residue.

### Protected Roles

Protected against falling behind residual roles:

- Kloel
- Supplier
- Affiliate, when the sale is attributed to that affiliate

### Clamp Policy

- Affiliate is capped by the post-Kloel, post-supplier remainder.
- Coproducer and manager can be reduced to zero.
- Seller can be reduced to zero.

### Commission Base

The exact commission base must be explicitly configured and versioned by product policy. Kloel must
not depend on implicit provider math for this.

## Canonical Sale State Machine

- draft
- intent_created
- payment_pending
- payment_succeeded
- split_allocated
- settlement_in_progress
- settled
- partially_reversed
- refunded
- disputed
- written_off

## Canonical Balance State Machine

- pending
- available
- on_hold
- in_payout
- paid_out
- negative
- reserved_for_dispute

## Reference Flow

1. Buyer lands on seller domain served by Kloel.
2. Buyer enters checkout.
3. Kloel creates a SaleIntent.
4. Attribution and product role configuration are resolved.
5. SplitEngine computes the canonical allocation.
6. LedgerEngine records the intended allocation and state.
7. Settlement Orchestrator executes the payment rail operations.
8. LedgerEngine credits pending balances per stakeholder.
9. Payout Scheduler matures balances to available.
10. Dashboards display the Kloel view, not the provider view.

## Stripe Position

Stripe remains the first implementation rail, but not the product authority.

Kloel must be explicit about the distinction between:

- Kloel product contract
- Stripe-supported charge and transfer primitives

For the Stripe adapter:

- seller-branded experience must be preserved
- platform-level multi-stakeholder split must remain possible
- payout timing must remain under Kloel control
- dispute and refund handling must map back into the ledger

If a Stripe primitive does not fully match the Kloel contract, Kloel adapts around it with ledger,
policy, and orchestration. If Stripe becomes the bottleneck, the rail can be swapped later without
changing Kloel's product contract.

## Adapter Contract

Every payment rail adapter must implement:

- createSaleIntent
- authorizeOrCreateCharge
- allocateStakeholders
- releasePayout
- refundSale
- reverseAllocation
- syncProviderEvent
- reconcileBalances

This keeps the Kloel product model stable even if payment rails evolve.

## Non-Goals

- Exposing raw Stripe dashboard truth to sellers or stakeholders
- Letting sellers bypass the Kloel checkout runtime for Kloel-split products
- Treating provider balances as product balances
- Offering formal legal escrow
- Locking Kloel forever to one payment provider implementation

## Open Questions

- Which Stripe charge pattern will be used for the first production adapter?
- Will Kloel require full domain transfer or only mandatory DNS pointing?
- What is the default attribution policy: last click, first click, or configurable?
- What are the standard payout maturity windows by role?
- Is supplier always fixed-value or can it also be percentage-based?
- In chargeback and refund scenarios, is the debit cascade proportional or seller-first with
  fallback?
- Which parts of the seller-visible payment statement must reflect the seller versus the platform?

## Immediate Execution Implications

- The existing `split`, `ledger`, and `connect` modules in the repository should be treated as the
  nucleus of the Kloel Payment Kernel.
- Production operations on Stripe, Railway, and Vercel must follow this spec, not isolated gateway
  defaults.
- Pix readiness, environment variable setup, and provider onboarding structure should be judged by
  whether they support this kernel cleanly, not by whether the provider has a single turnkey switch.

## References

- [ADR 0003 — Stripe Connect Platform Model](../../adr/0003-stripe-connect-platform-model.md)
- [Split types](../../../backend/src/payments/split/split.types.ts)
- [Ledger types](../../../backend/src/payments/ledger/ledger.types.ts)
- [Connect types](../../../backend/src/payments/connect/connect.types.ts)
- Stripe docs:
  - https://docs.stripe.com/connect/direct-charges
  - https://docs.stripe.com/connect/separate-charges-and-transfers
  - https://docs.stripe.com/connect/destination-charges
  - https://docs.stripe.com/connect/manual-payouts
  - https://docs.stripe.com/connect/disputes
  - https://docs.stripe.com/connect/statement-descriptors
  - https://docs.stripe.com/connect/saas/tasks/app-fees
