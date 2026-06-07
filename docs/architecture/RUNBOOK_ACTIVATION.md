# Kloel Canonicalization — Activation Runbook

> **What this is.** The ordered, operator-supervised sequence to ACTIVATE the canonicalization work that
> shipped behind default-OFF flags + additive migrations. Every code change is already merged and
> **byte-identical in production while its flag is OFF** — this runbook turns each one ON safely.
>
> **Safety principle.** Each step is: (1) apply in **staging** → (2) run the **parity check** → (3) soak →
> (4) apply in **prod** → (5) re-check → keep the **rollback** (flip the flag OFF) one command away. Never
> skip the parity gate. Never run a destructive migration before its dual-write/backfill is proven.
>
> Source of truth: `DUPLICATION_REGISTER.md` (P0 verification log) + `MIGRATION_PLAYBOOK.md`.
> **Last generated:** 2026-06-07.

---

## 0. Pre-flight (once, before any activation)

1. Confirm the branch is merged to the deploy target and the deploy ran (the code below must be live with flags OFF).
2. Apply the **additive** migration (online-safe, `ADD COLUMN IF NOT EXISTS`, nullable — zero downtime):
   - `backend/prisma/migrations/20260607000000_add_ledger_balance_after_snapshots/migration.sql`
   - Run via the normal deploy pipeline (`prisma migrate deploy`). It adds NULLABLE `balanceAfter*Cents` columns to `RAC_KloelWalletLedger` + `marketplace_treasury_ledger`. No data change, no lock of consequence.
3. Verify all flags are currently **unset / not `'true'`** in prod env.

---

## 1. Cognition / message-memory reads (lowest risk)

These make the canonical Mind tables the read source. Writers must already be dual-writing first.

| Order | Flag | Enables | Pre-check | Parity check | Rollback |
|---|---|---|---|---|---|
| 1.1 | `KLOEL_MINDMESSAGE_DUALWRITE=true` | mirror legacy message writes into `RAC_MindMessage` | — | `SELECT count(*) FROM "RAC_MindMessage"` grows after live traffic | unset |
| 1.2 | `KLOEL_MINDMEMORY_DUALWRITE=true` | mirror legacy memory upserts into `RAC_MindMemory` (namespace=`default`) | 1.1 soaked ≥24h | row count grows; no error-log spike | unset |
| 1.3 | *(backfill)* run the chunked MindMessage/MindMemory backfill (see MIGRATION_PLAYBOOK message-memory steps 4/11) until legacy↔canonical row parity per workspace | 1.1/1.2 on | `count(legacy) == count(canonical)` per workspace | re-run idempotent |
| 1.4 | `KLOEL_MINDMESSAGE_READ_CANONICAL=true` | conversation-history facade reads `RAC_MindMessage` (fallback legacy on empty/error) | 1.3 parity | sample 20 conversations: canonical read === legacy read | unset (instant fallback) |
| 1.5 | `KLOEL_MINDMEMORY_READ_CANONICAL=true` | memory facade reads `RAC_MindMemory` namespace=`default` (umem: plane already canonical) | 1.4 ok | sample recall === legacy | unset |

**Note:** `READ_CANONICAL` flags already fall back to legacy on empty/error per request, so the blast radius of a wrong flip is self-healing. Still gate on parity.

---

## 2. Sale / payment ledger integrity

| Order | Flag | Enables | Pre-check | Parity check | Rollback |
|---|---|---|---|---|---|
| 2.1 | *(observe)* the `SaleLedgerReconcileScheduler` @Cron already runs read-only daily — watch `sale_ledger_divergence*` logs/ops-alerts for the current divergence baseline | migration §0 done | baseline divergence count recorded | n/a (read-only) |
| 2.2 | `KLOEL_PAYMENT_LEDGER_TX=true` | Stripe `checkout.session.completed` + `payment_intent.succeeded` fold their sale-status writes into ONE `$transaction` and a failed write surfaces (Stripe retries) instead of silent-swallow | run a staging test charge end-to-end first | new divergences trend to 0; no rise in webhook 5xx beyond legitimate retries; idempotency intact | unset (back to legacy non-tx + silent catch) |
| 2.3 | `KLOEL_SALE_LEDGER_RECONCILE=true` | the reconciler may BACK-FILL a diverged `KloelSale`→paid off the proven `Payment` receipt (idempotent, paid-guarded) | 2.2 soaked; baseline reviewed | divergence count drops to ~0 after a cron run | unset (detection-only) |

**Do NOT** enable 2.3 before reviewing the 2.1 baseline — it writes. The flip is idempotent and paid-guarded, but review first.

---

## 3. Channels / leads / ledger snapshots

| Order | Flag | Enables | Parity check | Rollback |
|---|---|---|---|---|
| 3.1 | `KLOEL_INSTAGRAM_RESOLVER_UNIFY=true` | Instagram read path resolves its Meta connection via the canonical resolver | IG send/read still works on a test workspace | unset |
| 3.2 | `KLOEL_LEDGER_BALANCE_SNAPSHOT=true` | new ledger writes populate the nullable `balanceAfter*Cents` columns | spot-check: `balanceAfter == prior + signed(dir)*amount` on new rows | unset (columns stay NULL) |
| 3.3 | *(backfill)* run `LeadContactBackfillService` in **execute** mode per workspace (idempotent, Contact-only write-if-null) | re-run = 0 writes; every KloelLead has a Contact | n/a (additive) |
| 3.4 | `KLOEL_LEADS_READ_CONTACT=true` | `LeadsService.listLeads` reads from `Contact` (fallback legacy on empty) | sample: Contact-backed list === KloelLead-backed list per workspace | unset (instant fallback) |

---

## 4. Destructive finals — ONLY after the above soak (separate supervised deploys)

These are irreversible. Each has a hard gate. Do them LAST, one at a time, with a DB backup.

| Step | Action | Hard gate before running | Plan ref |
|---|---|---|---|
| 4.1 | `WalletAnticipation` Float→BigInt cents migration | add nullable `*InCents` cols → dual-write → idempotent cents backfill w/ rounding parity → THEN drop Float | PLAYBOOK money-ledgers Stages 2/7/8/11 |
| 4.2 | `NOT NULL` on the new `balanceAfter*Cents` columns | N days of zero-NULL on new rows (3.2 on) | PLAYBOOK money-ledgers Stage 10 |
| 4.3 | Retire `RAC_KloelLead` (DROP TABLE) | 3.3+3.4 soaked; `KloelConversation` FK history repointed; `Contact.kloelLeadId` provenance kept; `ContactIdentityMergeService` activated (PLAYBOOK lead-contact Step 4) | PLAYBOOK lead-contact Step 8 |
| 4.4 | Retire `RAC_KloelGlobalPrior` (DROP TABLE) | `MindGlobalPriorService` confirmed sole writer/reader for ≥N days | register P2-7 |
| 4.5 | Retire legacy `RAC_KloelMessage`/`RAC_KloelMemory` reads | §1 fully flipped + parity soaked + all callers on canonical | PLAYBOOK message-memory Steps 8/9/13 |

---

## 5. Already-active percept/cognition flags (FYI — independent of the above)

`KLOEL_CIA_PERCEPT_ENABLED`, `KLOEL_FLOWS_PERCEPT_ENABLED`, `KLOEL_VOICE_PERCEPT_ENABLED`, `KLOEL_COPILOT_LOOP_ENABLED`, `KLOEL_TRANSPORT_CANONICAL_DELEGATE`, `KLOEL_DECISION_LEDGER_DUALWRITE`, `KLOEL_INSTAGRAM_CANONICAL_DISPATCH`, `KLOEL_COMPLIANT_WHATSAPP_SEND` — pre-existing flag-gated capabilities; activate per their own ADR/owner decision, not part of this canonicalization sequence.

---

## Rollback (any step)

Every flag flip is reversible by **unsetting the env var** (or setting `≠ 'true'`) and redeploying the env — the code reverts to its byte-identical legacy path on the next request. The only non-reversible actions are §4 (destructive migrations), which is why each is gated behind a proven, soaked dual-write + backfill.
