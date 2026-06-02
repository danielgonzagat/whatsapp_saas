# Schema Canonicalization — Migration Plans (2026-06-02)

Phased expand→migrate→contract plans for the 5 big entity/schema canonicalization splits
surfaced by the broad canonicalization recon. **All touch production data; the financial ones
are owner-gated per CLAUDE.md (ledger/wallet/payout = teste+evidência+aprovação).** Full
agent detail in session task output `wzjs3ie7g`. Execute as dedicated, owner-reviewed PRs —
NOT rushed. Phone-normalization dedup fix (CANON-PHONE-01) already landed and is reused by backfills.

## 1. PERSON — KloelLead → Contact (effort L)
- **Canonical:** `Contact` (schema:399, 431 callers vs KloelLead 79). Provenance bridge
  `Contact.kloelLeadId` ALREADY in schema (currently 0 non-test writers). Zero money tables touched.
- **Phases:** P0 add nullable Contact cols (leadStatus/leadStage/lastMessage/lastIntent/totalMessages) — SAFE additive.
  P1 dual-write (3 sync gaps: kloel-lead-processor, whatsapp-mind-coordinator, extend lead-mind-coordinator.syncCanonicalContact).
  P2 migrate 7 readers. **P3 backfill (OWNER-GATED)** idempotent upsert on (workspaceId, normalizedPhone), write-if-null, dry-run collision report first, never drop a lead.
  P4 repoint KloelConversation.leadId (only hard FK) additively → contactId. P5 deprecate→drop (gated, observation window).
- **Risk:** Med-High. Central hazard = phone-dedup collisions (dry-run report + owner review). No orphans (KloelSale.leadId is loose String, no FK).

## 2. CONVERSATION (effort L) — TWO TRACKS, do NOT cross-merge
- **Track A (inbox):** `Conversation`+`Message` (FK→Contact) already canonical. KloelConversation (FK→KloelLead)
  migrates here AFTER the PERSON split (leadId→contactId). **Track B:** contact-less agent-memory rows must NOT
  enter the inbox — keep separate. Backfill keyed on source row id (idempotent).

## 3. PRODUCT-PLAN — ProductPlan(Float) → CheckoutProductPlan(Int cents) (effort L)
- **Canonical:** `CheckoutProductPlan` (priceInCents Int, 129 callers) vs legacy `ProductPlan` (price **Float**, viola
  money-in-cents, 41 callers). Backfill formula `priceInCents = BigInt(Math.round(price*100))` (matches live PIX path).
- **Risk:** Phase A additive/dual-write = MEDIUM (touches live PIX/checkout sales.service.ts:247). Pricing must not change.

## 4. SITE — KloelSite(blob) → Site(structured) (effort L)
- **Canonical:** `Site` (RAC_Site, SiteStatus enum, multi-domain). KloelSite (htmlContent blob, where users create today)
  migrates in. Backfill idempotent via new `legacyKloelSiteId` @unique. **Risk concentrated in /s/:slug public serve
  (revenue-facing — published sites must keep rendering through cutover).**

## 5. MONEY/LEDGER (effort XL) — OWNER APPROVAL REQUIRED
- **Workstream A (HIGH/financial):** Float wallet balances (KloelWallet.availableBalance/pending/blocked) → canonical
  BigInt `*InCents`. NOTE: cents backfill ALREADY done (migration 20260408210000) — cents cols exist+populated; the
  Float cols are deprecated remnants → migrate READERS off Float (safer than a fresh money migration). Ledger is
  append-only — never UPDATE money history; reconciliation test sum(cents)==sum(float*100).
- **Workstream B:** ledger field-name unification (amountCents vs amountInCents) — naming only.
- **Per CLAUDE.md: requires owner approval + evidence + reconciliation test. Do NOT auto-execute.**

## Recommended sequencing
PERSON (P0 additive safe → rest gated) → CONVERSATION (depends on PERSON) → SITE → PRODUCT-PLAN (checkout-gated) →
MONEY/LEDGER (owner-gated, mostly reader-migration since cents backfill done). Each = its own reviewable PR.
