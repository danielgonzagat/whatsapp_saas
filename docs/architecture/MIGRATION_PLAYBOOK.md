# Kloel Migration Playbook

## What this is

This is the set of **safe, staged migration plans for the design-heavy duplication families that cannot be autonomously executed** — the ones that mutate money ledgers, person identity, message/memory stores, auth credentials, and channel transport, where a wrong cut-over corrupts data or drops revenue. Each plan is *a plan, not an execution*: it specifies the canonical choice, the KEEP / MIGRATE / DEPRECATE verdict, the numbered additive→dual-write→backfill→parity→flip→retire sequence, the required tests, the rollback path, and the risks.

The **surgical** duplications (the ones safe to fix in a single guarded edit) are already fixed — see the **P0 verification log** in [`DUPLICATION_REGISTER.md`](./DUPLICATION_REGISTER.md). This playbook deliberately covers only the families whose canonicalization is multi-stage and data-bearing, so a human stays in the loop on every irreversible step.

Read this alongside:
- [`DUPLICATION_REGISTER.md`](./DUPLICATION_REGISTER.md) — the severity-tagged register of every structural duplication and the P0 verification log of what's already surgically fixed.
- [`CANONICAL_VOCABULARY.md`](./CANONICAL_VOCABULARY.md) — the one official term per concept and the forbidden aliases that route data to the wrong store. Each family below resolves to a row (or a needed new row) in that table.

**Operating rules for every family in this playbook:**
- Every mutating step is flag-gated; **read flags and write flags are always separate** so reads can revert instantly while the legacy store stays authoritative.
- Backfills are idempotent, chunked, resumable, and gated on **zero parity drift** before any reader flips.
- Destructive steps (column drops, table retirements, dead-body deletions) come **last**, only after the new path has soaked clean.
- A migration plan here is not permission to execute — the irreversible stages require human sign-off.

## Priority table

| Family | Risk | Canonical | Status |
|---|---|---|---|
| sale-payment | P0 — split sale ledgers, one payment `paid` in one store and `pending` in another | Keep `KloelSale` + `CheckoutOrder` + `CheckoutPayment`; make every webhook mutate them in ONE `$transaction`; `Payment` stays provider receipt; activate `sale-ledger-reconcile` last | Plan only — surgical P0 (raw payment lookup) already fixed; atomicity steps not yet executed |
| contact-identity (lead-contact) | P0 — two person entities (`Contact`, `KloelLead`) for the same human, RAW-phone path immortalizes duplicates | `Contact` (person); `LeadMindCoordinator.getOrCreateLead`+`syncCanonicalContact` (coordinator); `normalizePhone()` (keying) | Plan only — phone-normalization gate (Step 1) is the master dependency |
| message-memory-cutover | P1 — three canonical-but-dead-on-read tables fed by fail-open dual-writes, legacy still authoritative | `RAC_MindMessage` (post-FK), `RAC_MindMemory` (`default` plane), `ChannelDispatchRegistry` | Plan only — all three dual-writes flag-gated and additive today |
| admin-auth-core (identity-auth) | P1 — admin auth stack duplicates tenant auth stack with no shared core; security fixes land on one side only | Shared `auth-core/` credential/MFA/session core; keep `AdminUser` vs `Agent` and the two throttle/audit mechanisms divergent | Plan only — TOTP + admin-crypto hoist already DONE; refresh-at-rest still plaintext on tenant |
| money-ledgers | P1 — five parallel money balance+ledger systems with inconsistent ledger contracts | Keep all five per-actor tables; extract ONE `SharedLedger` append abstraction (modeled on Connect `LedgerService`); add `balanceAfter`; migrate `WalletAnticipation` Float→cents | Plan only — no `SharedLedger` interface exists yet |
| channel-meta | P2 — Meta page-messaging in two services, creds resolved by three readers, ~19 raw `metaConnection.find*` bypasses | `FacebookMessengerService.sendMessage` (page messaging); `MetaWhatsAppService.resolveConnection` (credentials) | Plan only — `ChannelMessageDispatchService` already resolves once per send |

---

## sale-payment — Sale/Order/Payment ledger split (staged migration plan)

**Family:** Sale settlement is split across four parallel ledgers written by different webhook events and different (non-atomic) transactions, so one human payment can be `paid` in one ledger and `pending` in another.

- `CheckoutOrder` (schema:3220) + `CheckoutPayment` (schema:3330) — checkout pipeline / de-facto GMV+dashboard canonical (`OrderStatus`, `PaymentStatus`).
- `KloelSale` (schema:1917, `externalPaymentId @unique`, `status` default `"pending"`, `paidAt`) — chat-driven originator.
- `Payment` (schema:2744, `@@unique([workspaceId, externalId])`) — provider-level receipt / settlement proof. No owning `@Injectable`.
- `PhysicalOrder` (schema:2706) — physical fulfillment, out of scope here.

### Canonical choice
Keep all three sale-status ledgers (`KloelSale`, `CheckoutOrder`, `CheckoutPayment`) but make **every webhook event mutate them inside ONE `prisma.$transaction` with `FINANCIAL_TRANSACTION_OPTIONS`**, never via a silent `.catch(() => undefined)`. `Payment` remains the provider receipt. The already-shipped `sale-ledger-reconcile` (`KLOEL_SALE_LEDGER_RECONCILE`) is activated as the back-fill safety net — but only **after** the in-handler atomicity closes the divergence sources.

### KEEP
- `CheckoutOrder`/`CheckoutPayment`, `KloelSale`, `Payment`, `PhysicalOrder` (all live, distinct roles).
- `backend/src/webhooks/sale-ledger-reconcile.helpers.ts` — `scanSaleLedgerDivergence` (read-only) + `reconcileSaleLedger` (flag-gated flip). **Already shipped, ZERO production callers today** (grep-verified).
- `FINANCIAL_TRANSACTION_OPTIONS` (re-exported `payment-webhook-types.ts:136` from `payments/ledger/ledger-audit.helper`) — already used by the reversal handlers in `payment-webhook-stripe.handlers.ts:42/121/208`.

### MIGRATE
- `payment-webhook-stripe.handlers2.helpers.ts:53` `updatePaymentAndSaleForSessionHelper` — `payment.updateMany` (lines 75-81) and `kloelSale.updateMany` (lines 113-120) become ONE `$transaction` (STEP 1).
- `payment-webhook-stripe.handlers2.ts:54-130` `handlePaymentIntentEvent` — fold the CheckoutPayment/KloelSale flips into the order's existing `$transaction` (`updateOrderStatusForIntent`, lines 148-186), drop the duplicate at lines 63-81 (STEP 3).
- `mercadopago-webhook.controller.ts:130` — extend the `payment.updateMany`-only path to co-write the sale ledger (STEP 4).
- `payment-webhook-generic.helpers.ts:71` `updateSaleAndPaymentHelper` — collapse the two warn-and-swallow try/catch blocks into one tx (STEP 5).
- `sale-ledger-reconcile.helpers.ts` — wire into a `@Cron` + admin endpoint (STEP 0), then enable the flag (STEP 6).

### DEPRECATE (behaviors, not models)
- Silent `.catch(() => undefined)` on sale-ledger transactions at `payment-webhook-stripe.handlers2.ts:60`, `:79`, `:117` — turns a failed financial write into a 200-OK with no Stripe retry.
- Non-transactional sequential `payment`→`sale` writes in `updatePaymentAndSaleForSessionHelper`.
- Warn-and-continue partial writes in `updateSaleAndPaymentHelper` (generic webhook).
- `mercadopago-webhook.controller.ts:130` `payment.updateMany`-only (no sale co-write).

### Numbered safe steps (ordered by risk, lowest first)
1. **STEP 0 — detection only, zero risk.** Register `reconcileSaleLedger` behind a `@Cron` service (`webhooks.module.ts` providers, line 25) + admin endpoint, mirroring `ConnectLedgerReconciliationService` (`@Cron('0 */15 * * * *')`, registered in `payments.module.ts`, surfaced via `admin-carteira.controller.ts`). Leave `KLOEL_SALE_LEDGER_RECONCILE` unset → flag-OFF returns `flipped:0/reconciled:false`, writes nothing. Get the divergence baseline first.
2. **STEP 1 — checkout.session.completed atomicity.** Wrap the existing `payment.updateMany` + `kloelSale.updateMany` in `updatePaymentAndSaleForSessionHelper` in one `$transaction([...], FINANCIAL_TRANSACTION_OPTIONS)`, preserving the `validatePaymentTransition` guard and the `buildKloelSaleStripeWhere` join.
3. **STEP 2 — remove the silent catches** at `handlers2.ts:60/79/117`; let failures hit the existing `try/catch` (lines 119-126) → `financialAlert` → re-throw → Stripe retry. Keep the line-133 `markWebhookProcessed` catch (idempotency marker, non-financial).
4. **STEP 3 — payment_intent.succeeded one-tx.** Extend the order's existing `$transaction` (`updateOrderStatusForIntent`, lines 148-186) to flip `CheckoutPayment` + `KloelSale` alongside the `PROCESSING→PAID` `CheckoutOrder` guard; drop the duplicate KloelSale flip at lines 63-81.
5. **STEP 4 — MercadoPago co-write (new path, ship after Stripe).** After `pixCharge.getStatus` (line 102) and `payment.updateMany` (line 130), when status maps to APPROVED, co-write `KloelSale` (join on `externalPaymentId === externalId`, `@unique` → idempotent) + `CheckoutOrder`/`CheckoutPayment` in one `$transaction`.
6. **STEP 5 — generic webhook atomicity.** Collapse the two try/catch blocks in `updateSaleAndPaymentHelper` into one tx, keep the `validatePaymentTransition` guard, propagate errors.
7. **STEP 6 — activate the back-fill LAST.** Set `KLOEL_SALE_LEDGER_RECONCILE='true'`. `reconcileSaleLedger` then flips residual `kind:'pending'` divergences via a `paid`-guarded `updateMany` (idempotent); `kind:'missing'` stays an alert, never fabricated. Watch `flipped/scanned` trend to ~0.

### Required tests
- Extend `sale-ledger-reconcile.spec.ts`: flag-OFF post-cron still `flipped:0/reconciled:false`.
- `payment-webhook.controller.sale-processing.spec.ts`: inject a `kloelSale.updateMany` throw → assert the `payment` write rolls back AND the handler throws (Stripe retry).
- `payment-webhook.controller.spec.ts`: assert `CheckoutOrder(PAID)+CheckoutPayment(APPROVED)+KloelSale(paid)` flip in one tx and that removing `.catch(() => undefined)` surfaces the error.
- Assert `markWebhookProcessed` failure (`handlers2.ts:133`) still does NOT roll back the financial tx.
- New MercadoPago spec: APPROVED PIX co-writes `KloelSale(paid)` joined on `externalPaymentId`, idempotent on replay.
- Generic webhook: rollback `KloelSale` when the `Payment` write fails.
- Flag-ON back-fill: keep `sale-ledger-reconcile.spec.ts:151-182` green (flips pending, no-op on paid).

### Rollback
Each step is independently revertable and flag-/env-gated:
- STEPS 1-5 are pure code; revert the commit to restore the prior (non-atomic, swallow-and-continue) behavior. The `$transaction` changes do not alter schema, so no migration to undo.
- STEP 0/6 reconciler is gated by `KLOEL_SALE_LEDGER_RECONCILE`: setting it unset/`'false'` instantly returns the reconciler to read-only (`reconciled:false`, zero writes), byte-identical to today (per `sale-ledger-reconcile.flag.ts` docstring). The `@Cron` registration can stay (it's a no-op when the flag is off).
- The MercadoPago co-write (STEP 4) should land behind its own commit so it can be reverted without touching the Stripe atomicity wins.

### Risks
- STEP 4 is a NEW write path on the hottest revenue webhook — ship last, after Stripe paths prove atomic, and validate against STEP 0 metrics.
- Removing the silent catches (STEP 2) converts silent no-ops into Stripe retries; a persistent malformed-metadata error could cause a retry storm — pair with `financialAlert` monitoring.
- Widening `$transaction` scope holds row locks longer (deadlock/timeout risk under concurrency) — keep `FINANCIAL_TRANSACTION_OPTIONS` isolation + the `PROCESSING→PAID` guards.
- `kind:'missing'` divergences (settled `Payment`, no joined `KloelSale`) are intentionally NOT auto-created — they require a human/alert decision, not a fabricated row.
- `buildKloelSaleStripeWhere` matches by `id` OR `externalPaymentId`; for MP ensure the join uses the MP payment id, not a Stripe `pi_`, to avoid cross-provider mismatch.
- Enabling the flag (STEP 6) before STEPS 1-5 land would mask, not fix, the non-atomic writes — enforce the ordering.

---

## Lead–Contact duplication family — staged migration plan

**Family:** `contact-identity`. Two person entities model the same human — `Contact` (`RAC_Contact`, `backend/prisma/schema.prisma:399`, `@@unique([workspaceId, phone])` at `:464`) and `KloelLead` (`RAC_KloelLead`, `schema:1834`, `@@unique([workspaceId, phone])`) — plus 3+ near-identical lead-lifecycle coordinators, each with its own `getOrCreateLead`.

### Canonical choice
- **Person:** `Contact` (declared canonical; already carries the funnel snapshot `leadStatus/leadStage/lastMessage/lastIntent/totalMessages` at `schema:425-431` and the provenance bridge `kloelLeadId` `@relation("KloelLeadContacts")` at `schema:445`, with reverse `KloelLead.contacts` at `schema:1854`).
- **Coordinator:** `LeadMindCoordinator` (`backend/src/kloel/mind/coordination/lead-mind-coordinator.service.ts`, self-annotated "canonical per-lead cognitive coordinator" at line 2) — owns the single `getOrCreateLead` (`:92`) + `syncCanonicalContact` (`:125`).
- **Keying:** `normalizePhone()` (`backend/src/common/phone/phone-normalization.util.ts:150`, BR-promoting digits) — the same function `CrmService.upsertContact` uses (`crm.service.ts:47`).

### KEEP / MIGRATE / DEPRECATE
- **KEEP:** `Contact`; `LeadMindCoordinator.getOrCreateLead`+`syncCanonicalContact`; `normalizePhone()`; `CrmService.upsertContact`/`listContacts` (`crm.service.ts:39,146`); `ContactIdentityResolverService.resolve` (`contact-identity-resolver.service.ts:24`).
- **MIGRATE:** `LeadsService.listLeads` read from `prisma.kloelLead.findMany` (`leads.service.ts:103`) → `prisma.contact.findMany`; backfill `KloelLead` → `Contact`; **activate** the orphan `ContactIdentityMergeService.mergeContacts` (`contact-identity-merge.service.ts:24` — zero functional callers today, only module registration + spec); collapse the 4 lead-write paths onto one shared helper.
- **DEPRECATE → retire last:** `RAC_KloelLead`; the drifted `getOrCreateLead` copies in `kloel-lead-processor-helpers.ts:76` (writes `KloelLead` only — Contact-sync gap), `whatsapp-mind-coordinator.service.ts:175` (RAW-phone path, `handleIncomingMessage:135` passes `msg.from` unnormalized), and the inline `contact.upsert` at `kloel-lead-processor.service.ts:105`.

### Safe staged steps
1. **Phone dependency first** — normalize `msg.from` at `whatsapp-mind-coordinator.service.ts:135` before `getOrCreateLead`. (The digest's claimed P0 raw payment lookup at `kloel-lead-processor.service.ts:285` is **already fixed** in live source — line 291 normalizes — so the only remaining raw hole is this WhatsApp path.)
2. **Additive dual-write parity** — extract one shared `getOrCreateLead`+`syncCanonicalContact` from `LeadMindCoordinator`; route all four callers through it, flag-gated and fail-open (mirror of `:161`). Promote the `lead-contact-dualwrite` flag from the worktree into `backend/src`.
3. **Backfill** every `KloelLead` → canonical `Contact` on normalized `workspaceId_phone`, copying funnel fields + `kloelLeadId` write-if-null; reconcile counts.
4. **Activate `ContactIdentityMergeService`** from inside `ContactIdentityResolverService.resolve` to fold cross-channel duplicates (its `$transaction` re-points 8 relation tables, `:74-112`); run a one-shot reconcile.
5. **Collapse** the 3+ drifted coordinators onto `LeadMindCoordinator` (mind the separate `worker/` deployable).
6. **Repoint `LeadsService.listLeads` reads** to `Contact` (field-compatible with the existing `LeadOutput` mapper) — makes the stale `frontend/src/lib/api/leads.ts:4-12` docstring finally true. Behind a read flag.
7. **Parity soak** — Contact-backed list ≡ KloelLead-backed list per workspace; hold until divergence is zero.
8. **Retire `RAC_KloelLead`** only after parity is green and `KloelConversation` FK history is repointed/preserved; keep `Contact.kloelLeadId` for provenance.

### Required tests
`phone-normalization.util.spec.ts` (keying invariant, exists) · WhatsApp `(11) 98765-4321`≡`5511987654321` regression · `lead-mind-coordinator.service.spec.ts` Contact upsert on normalized phone · `contact-identity-merge.service.spec.ts` 8-table re-point + idempotency (exists) · resolver→merge activation · idempotent backfill · `leads.service.spec.ts` Contact-backed output ≡ KloelLead-backed output (exists) · `frontend leads.test.ts` payload shape (exists).

### Rollback
Every mutating step is flag-gated: kill the `lead-contact-dualwrite` write flag (STEP 2) and the read flag (STEP 6) to revert to `KloelLead` reads instantly — `RAC_KloelLead` data stays intact and authoritative until STEP 8. `mergeContacts` link rows are additive (`ContactIdentityLink`), reversible before the final table drop. Do NOT proceed to STEP 8 until the soak window (STEP 7) shows zero divergence.

### Risks
Phone-normalization ordering is the master gate (RAW WhatsApp path will immortalize duplicates if backfill runs first); pre-existing fragmented rows require the merge service; the standalone helper's Contact-sync gap means read cut-over before dual-write parity would drop leads; fail-open sync makes backfill parity the only true completeness signal; the `worker/` package and the worktree-only flag file are cross-cutting blockers.

---

## message-memory-cutover — staged migration plan

Three in-flight, flag-gated migrations that all share one shape: a **canonical-but-dead-on-read** target table fed by an additive, best-effort, fail-open dual-write, with the legacy table still authoritative. The job is to finish each safely via **enable dual-write → backfill → parity → flip one reader behind a *separate* read flag → validate → flip all → retire legacy**. A migration plan is not execution; this is the safe staged path only.

### Canonical choice (per family)

- **MindMessage** — `RAC_MindMessage` (schema:3849) is the declared canonical message store but is **canonical-but-DEAD-on-read**: 4 flag-gated writers, **ZERO readers** (verified — no `prisma.mindMessage.find*` in `src/`). The canonical read facade `MindCanonicalService.getConversationHistory` (`backend/src/kloel/mind/mind-canonical.service.ts:45`) → `MindMessageService.getHistory` (`backend/src/kloel/mind/aliases/mind-message.service.ts:49`) currently reads `RAC_KloelMessage`. That facade is the reader cut-over point.
- **MindMemory** — `RAC_MindMemory` (schema:3872) is the target; `RAC_KloelMemory` (schema:1711, already `@deprecated`) stays authoritative via `MindMemoryItemService` + ~41 direct `prisma.kloelMemory` callers.
- **Dispatch ChannelTransport** — `ChannelDispatchRegistry` (`backend/src/common/channel-dispatch/channel-dispatch.registry.ts`) is the canonical transport core; `ChannelTransportRegistry` (`backend/src/kloel/channel-transport.registry.ts:52`) keeps only its MindGuard+audit shell and **always delegates** once `KLOEL_TRANSPORT_CANONICAL_DELEGATE` is default-ON.

### Two load-bearing grounding corrections (verified against source)

1. **MindMessage has no conversation/thread/lead FK.** The model is `workspaceId / source / role / content / createdAt` only. The 4 sources are discriminated solely by `source` (`dashboard`, `thread`, `channel`, `lead_conversation`). Legacy readers window *per conversation* (StateBuilder; `KloelConversationStore` at `kloel-conversation-store.ts:56`), which `source` alone cannot reconstruct. **An additive, nullable discriminating FK column + index must land before any reader flip.**
2. **`RAC_MindMemory` has two disjoint planes on one table.** `MindMemoryItemService.upsert` (`mind-memory-item.service.ts:96`) dual-writes on `namespace='default'` keyed by the legacy `RAC_KloelMemory` keyspace — this plane has **zero readers** (the real migration). `KloelMemoryEngineService` (`kloel-memory-engine.service.ts:188/192/232/282`) independently reads+writes the SAME table on `namespace='umem:<userId>'` for the live per-user memory graph — a **separate feature, not part of this migration**. The digest's "read by kloel-memory-engine.service.ts" conflates the two; the engine reads its own per-user rows, never the `default`-namespace dual-write rows. **Backfill and the read flip must touch `namespace='default'` only.**

### KEEP / MIGRATE / DEPRECATE

- **KEEP:** `RAC_MindMessage` (post-FK), `RAC_MindMemory` (`default` plane), the `MindCanonicalService`/`MindMessageService`/`MindMemoryItemService` facade as the single cut-over point, `ChannelDispatchRegistry`, and `KloelMemoryEngineService` untouched.
- **MIGRATE:** the 4 MindMessage writers → authoritative; the facade read delegate → canonical tables behind a *new read flag*; the ~41 `prisma.kloelMemory` callers → `MindMemoryItemService`; `ChannelTransportRegistry.send` → default-ON delegation.
- **DEPRECATE:** `RAC_KloelMessage`, `RAC_KloelMemory`, the dead `provider.send()` bodies + `mapCanonicalResult` glue, and the stale `ZERO writers` schema comments.

### Numbered safe steps

**MindMessage**
1. Add an additive, nullable discriminating FK (`conversationId`/`leadId`/`threadId`) + index to `RAC_MindMessage` — no behavior change.
2. Extend the 4 dual-writers (`chat.service.ts:86`, `kloel-thread.service.ts:79`, `inbox.service.ts:60`, `kloel-lead-processor-helpers.ts:161`) to populate the FK, still gated by `KLOEL_MINDMESSAGE_DUALWRITE`, still best-effort.
3. Enable `KLOEL_MINDMESSAGE_DUALWRITE=true` in **staging only**; watch warn-log rate + 1:1 row growth vs the 4 legacy tables.
4. Backfill the 4 legacy tables into `RAC_MindMessage` (idempotent, chunked by workspace, correct `source` + FK).
5. Parity gate: per-workspace COUNT + last-N window parity before any read flip.
6. Add a **separate** `KLOEL_MINDMESSAGE_CANONICAL_READ` (default OFF); flip **one** reader — `MindMessageService.getHistory` — to `prisma.mindMessage` when ON. This single delegate validates `MindCanonicalService` + `KloelConversationStore`.
7. Validate in staging: diff canonical vs legacy windows for sample workspaces (chat UI + Mind state-builder).
8. Flip all readers routed through the facade; leave raw `prisma.kloelMessage` spec/util callers last.
9. Soak, then demote/retire `RAC_KloelMessage`; correct the stale schema comment.

**MindMemory**
10. Enable `KLOEL_MINDMEMORY_DUALWRITE=true` in staging (writer at `mind-memory-item.service.ts:96`, `namespace='default'`). Confirm the `umem:` plane is untouched.
11. Backfill `RAC_KloelMemory` → `RAC_MindMemory` as `(workspaceId, namespace='default', key)`, idempotent upsert.
12. Route the ~41 direct `prisma.kloelMemory` callers through `MindMemoryItemService` (prerequisite for completeness).
13. Add `KLOEL_MINDMEMORY_CANONICAL_READ` (default OFF); flip `MindMemoryItemService.findByKey`/`listByWorkspace` to read `mindMemory` (`namespace='default'`); validate via `MindCanonicalService.getMemoryItem`; flip all; soak; retire `RAC_KloelMemory`.

**Dispatch ChannelTransport**
14. Enable `KLOEL_TRANSPORT_CANONICAL_DELEGATE` in staging; verify for `whatsapp`/`instagram`/`messenger` (`canDelegate`, `channel-transport.registry.ts:170`) that `ChannelTransportRegistry.send` (`registry.ts:147`) maps CONTRACT-B→CONTRACT-A identically to `provider.send`; keep email+tiktok excluded; flip default ON; soak; delete the dead `provider.send` bodies + `mapCanonicalResult` glue.

### Required tests
- Keep all dual-write specs green as gates (`chat.service.dualwrite.spec.ts`, `inbox.service.spec.ts`, `kloel-thread.service.spec.ts`, `lead-conversation-mindmessage-dualwrite.spec.ts`, `mind-memory-item.dualwrite.spec.ts`).
- New: backfill idempotency, per-workspace parity, reader-flip equivalence (flag-OFF vs flag-ON identical windows), MindMemory namespace-isolation (`default` vs `umem:` never cross), transport delegation parity. Full backend suite green before promoting each flag to the next environment.

### Rollback
Every stage is reversible by env var because **read and write flags are separate**. Flip `KLOEL_*_CANONICAL_READ` OFF → reads revert to the legacy table instantly (legacy never stopped being written during dual-write). Flip `KLOEL_*_DUALWRITE` / `KLOEL_TRANSPORT_CANONICAL_DELEGATE` OFF → the canonical write / delegation short-circuits and the legacy path runs byte-for-byte (dual-writes are additive + fail-open; `provider.send` body is untouched). Do not delete any legacy table or `provider.send` body until its target has soaked with reads fully cut over.

### Risks
- **Reader flip without the MindMessage FK loses per-conversation windowing** — Step 1 is mandatory.
- **Enabling dual-write in prod with zero readers = 2x write cost + silent divergence** (digest warning) — backfill + parity first.
- **MindMemory plane collision** — backfill/read-flip must scope to `namespace='default'` or it corrupts the live per-user graph.
- **The ~41 raw `kloelMemory` callers bypass the service** — until routed through it, the canonical table is structurally incomplete.
- **Coupling read+write on one flag** removes the safe rollback — keep them separate.
- **Email/TikTok** must stay excluded from transport delegation (different mechanism).
- **High-volume backfills** must be chunked, off-peak, idempotent, resumable.
- **Stale schema comments** must be corrected to avoid misleading the next engineer.

---

## admin-auth-core — staged migration plan (identity-auth family)

**Concept (digest line 314):** the entire admin auth stack duplicates the tenant auth stack with **no shared core**, so security fixes don't propagate. Live proof: admin hashes its refresh token at rest (`sha256Hex`, `admin-session-factory.ts:94`) while tenant still stores it **plaintext** (`auth.token.service.ts:160` → `token: refreshToken`), and the access-token-revocation P0 (digest line 111) is another fix that landed on one side only.

### Canonical choice
Extract a shared **credential / MFA / session core** under `backend/src/common/auth-core/` — joining the already-landed `common/totp.ts` and the already-shared `admin/common/admin-crypto.ts` — consumed by **both** stacks. Keep **AdminUser vs Agent** (principal table + RBAC granularity) as the **only** divergence.

Two surfaces are genuinely divergent mechanisms and must **not** be force-unified:
- **Throttling** — admin = Postgres `adminLoginAttempt` count table (`admin-login-attempts.service.ts`, durable per-email+IP lockout, I-ADMIN-5); tenant = Redis fail-closed sliding-window (`auth/rate-limit.service.ts`). Share only a **policy** (window=15min, max=5), never the storage backend.
- **Audit** — admin `adminAuditLog` keyed by `adminUserId` via `AdminAuditService.append`; tenant `AuditLog` keyed by `workspaceId`+`agentId` via `AuditService.logWithTx`. Different principals → keep both writers.

### KEEP
- `common/totp.ts` — **TOTP hoist already DONE** (`MFA_PERIOD_SECONDS`/`generateMfaSecret`/`verifyTotp`); imported by `account-mfa.service.ts:10` and `admin-mfa.service.ts:13`.
- `admin/common/admin-crypto.ts` — **already shared cross-stack** (`encryptAdminSecret`/`decryptAdminSecret`/`sha256Hex`/`generateRawRefreshToken`); imported by `auth/account-mfa.service.ts:4`.
- `AdminUser`+`AdminSession` (schema:4112) and `Agent`+`RefreshToken` (schema:1153) — divergent by design.
- The two throttle storage mechanisms and the two audit writers — divergent by design.

### MIGRATE
1. `BCRYPT_WORK_FACTOR=12` (`admin-auth.service.helpers.ts:22`) and `BCRYPT_ROUNDS=12` (`common/constants.ts:10`) → one shared `PASSWORD_BCRYPT_COST` in `auth-core/password.ts`.
2. Inline bcrypt calls (admin `admin-auth.service.ts:114/255/486`; tenant `auth.password.service.ts:185/253`, `auth-service.password-verification.ts:80`, `auth-service.register-login.ts:160/225`, `auth-whatsapp-password.service.ts:269`) → shared `hashPassword`/`verifyPassword`.
3. `admin-crypto.ts` → move/re-export under `auth-core/` (path-only).
4. Opaque-token codec: tenant `hashOpaqueToken` (`auth-service.helpers.ts`) delegates to the shared `sha256Hex`/`generateRawRefreshToken` helper.
5. `RefreshToken.token` plaintext (`auth.token.service.ts:160`) → sha256 hashed-at-rest, matching `AdminSession.tokenHash`.
6. Throttle constants → shared `LoginThrottlePolicy` (policy only).

### DEPRECATE
- Duplicate `BCRYPT_WORK_FACTOR` constant; scattered inline bcrypt; plaintext refresh-token-at-rest; the bespoke per-stack opaque-token codecs.

### Numbered safe steps
0. **(done — verify)** Confirm `common/totp.ts` is the single TOTP source + `admin-crypto` shared; lock with a guard test.
1. Create `auth-core/password.ts` (`hashPassword`/`verifyPassword` + `PASSWORD_BCRYPT_COST=12`); collapse both bcrypt constants onto it.
2. Route all inline bcrypt callsites through the helper (identical cost, pure refactor).
3. Relocate `admin-crypto.ts` into `auth-core/` (or re-export); fix cross-stack imports; type-check gate.
4. Extract shared opaque-token helper; make tenant `hashOpaqueToken` delegate.
5. **Staged data migration** for refresh-at-rest: (5a) dual-write raw+hash → (5b) backfill plaintext rows → (5c) flip `refresh()` lookup (`auth.token.service.ts:233/254`) to hash → (5d) stop persisting plaintext (`:160`).
6. Extract `LoginThrottlePolicy` constants/interface only; storage backends untouched.
7. Document audit as permanently divergent (no shared writer).
8. Final convergence pass + full auth/admin/audit suites + type-check as merge gate.

### Required tests
- `common/totp.spec.ts` (exists) — both MFA paths green after any core move.
- New `auth-core/password` spec: cost=12, verify true/false, both login paths authenticate.
- `admin-login-attempts.service.spec.ts` + `auth/rate-limit.service.spec.ts` stay green (mechanisms untouched).
- `admin-session-factory` refresh-at-rest still sha256 (I-ADMIN-10).
- New tenant refresh-at-rest spec: stored token = sha256(raw), `refresh()` finds by hash, raw never persisted.
- `auth.token.service.spec.ts` rotation/concurrency green post-hashing.
- `admin-mfa.service.spec.ts` + `account-mfa.service.spec.ts` green.

### Rollback
Each stage is independently revertable. Stages 1–4, 6 are pure refactors / path moves — revert the commit. Stage 5 is the only risky one (data + behavior): gate behind a `REFRESH_TOKEN_HASH_AT_REST` flag, deploy in 5a→5d order; rollback = stop reading-by-hash (revert 5c) and keep dual-write until plaintext-readers are confirmed gone. Never delete the plaintext column until 5c has soaked. Stage 3 (admin-crypto move) rollback = restore the old import path.

### Risks
- Force-merging throttle storage weakens admin's durable lockout or tenant's multi-instance fail-closed guarantee — policy-only extraction.
- Audit tables model different principals — no shared writer.
- Stage 5 invalidates live tenant sessions if reads flip to hash-lookup before backfill — strict 5a→5d ordering behind a flag.
- bcrypt cost is identical today (12==12) so the password merge is behavior-neutral; guard against silently changing one stack's cost if values ever diverged.
- Tenant lacks a timing-safe dummy-hash on unknown-email login (admin throws before `bcryptCompare`); the shared verifier must not introduce/remove a user-enumeration timing oracle.
- `admin-crypto` is imported by tenant — the move is a path-only change touching admin imports; do it isolated with zero behavior change.

---

## Money-Ledgers Duplication Family — Staged Migration Plan

**Concept (from `_CONSOLIDATED.json`):** Five parallel money balance+ledger systems with near-identical hand-rolled append/reconcile/mature logic and inconsistent ledger contracts. Severity P1.

### The five systems (all grounded in source)

| System | Table (schema:line) | Owner service | `balanceAfter`? | Money type |
|---|---|---|---|---|
| Seller earnings | `KloelWalletLedger` (schema:2006) | `SellerWalletService` (`kloel/wallet.service.ts:49`) + `WalletLedgerService.appendWithinTx` (`kloel/wallet-ledger.service.ts:64`) | **MISSING** | `amountInCents BigInt` (2016) |
| Usage prepaid | `PrepaidWalletTransaction` (schema:4497) | `PrepaidWalletService` (`wallet/wallet.service.ts:73`) | **YES** `balanceAfterCents` (4503) | `BigInt` |
| Stripe Connect | `ConnectLedgerEntry` (schema:4424) | `LedgerService` (`payments/ledger/ledger.service.ts:59`) | **YES** two-bucket `balanceAfterPending/AvailableCents` (4430-4431) | `BigInt` |
| House treasury | `MarketplaceTreasuryLedger` (schema:4276) | `MarketplaceTreasuryService.append` (`marketplace-treasury.service.ts:193`) | **MISSING** | `amountInCents BigInt` (4283) |
| Receivable anticipation | `WalletAnticipation` (schema:2855) | no dedicated service — written at `kloel/wallet.service.tx.helpers.ts:328` | n/a | **`Float`** (2859-2862) |

### Canonical choice

**Keep all five per-actor tables separate — do NOT merge.** Each models a different actor's money. Extract ONE shared append-only `SharedLedger` abstraction, modeled on the strongest existing implementation (the Connect `LedgerService`, which already snapshots `balanceAfter` and is idempotent). Then close the two contract gaps: (1) add `balanceAfter` to `KloelWalletLedger` + `MarketplaceTreasuryLedger`; (2) migrate `WalletAnticipation` Float → BigInt cents. No `SharedLedger`/`AppendOnlyLedger` interface exists yet (verified — `payments/ledger/ledger.types.ts` is Connect-specific, treasury has its own `AppendLedgerInput` at `marketplace-treasury.service.ts:27`).

### KEEP / MIGRATE / DEPRECATE

- **KEEP** — all five tables and their per-actor owner services (the bucket semantics genuinely differ: seller = `available|pending|blocked` per schema:2015; treasury = `available|pending|reserved` per schema:4265-4267; Connect = pending/available; prepaid = single balance).
- **MIGRATE** — the four divergent hand-rolled append contracts collapse behind one `SharedLedger` port; `KloelWalletLedger` + `MarketplaceTreasuryLedger` gain `balanceAfter` columns; `WalletAnticipation` Float → BigInt cents.
- **DEPRECATE** — no data table is dropped or merged. Only the per-domain append signatures and the `WalletAnticipation` Float columns are deprecated (Float dropped last, Stage 11).

### Safe staged steps (additive → dual-write → backfill → cut-over → drop)

1. **Stage 0** — Freeze: catalogue the 4 appends + 3 reconcilers (`connect-ledger-reconciliation.service.ts:85`, `marketplace-treasury-reconcile.service.ts:51`, `common/ledger-reconciliation.service.ts:73`) + 2 maturation services; confirm all 47 ledger spec files green.
2. **Stage 1** — Additive nullable `balanceAfter*Cents` columns on `KloelWalletLedger` (3 buckets) and `MarketplaceTreasuryLedger` (3 buckets).
3. **Stage 2** — Additive nullable `*InCents` columns on `WalletAnticipation` (+`feeBps Int?` to match `MarketplaceFee.feeBps` schema:4300).
4. **Stage 3** — Define `SharedLedger` interface + pure `balanceAfter` helper in `common/`, superset of all four writers, modeled on the Connect contract.
5. **Stage 4** — Dual-write: wire `WalletLedgerService.appendWithinTx` and `MarketplaceTreasuryService.append` to also populate `balanceAfter` from the bucket balances they already read in-`$transaction`.
6. **Stage 5** — Idempotent offline backfill of historical `balanceAfter` via reconciler replay; gate on **zero drift** vs materialized buckets.
7. **Stage 6** — Route each writer through the `SharedLedger` port, one ledger per PR: Prepaid → Treasury → Seller → Connect (reference, last).
8. **Stage 7** — `WalletAnticipation` dual-write cents at `wallet.service.tx.helpers.ts:328` (cents already authoritative — `netAmountInCents` at :47/:65).
9. **Stage 8** — Idempotent `WalletAnticipation` cents backfill with rounding parity spot-check.
10. **Stage 9** — Cut readers (`wallet.helpers.responses.ts`, `wallet.helpers.ts`) to `*InCents` + `balanceAfter`; flag-gate user-facing flips (repo's `*-dualwrite.flag.ts` pattern).
11. **Stage 10** — `NOT NULL` migration on the new `balanceAfter` columns once 0 NULL rows for N days.
12. **Stage 11** — Drop `WalletAnticipation` Float columns (only destructive step, last).
13. **Stage 12** — Optional: unify the 3 reconcilers onto one replay engine parameterized by `SharedLedger`.

### Required tests

47-file regression baseline stays green · reconciliation drift = 0 post-backfill · `balanceAfter == prior + signed(direction)*amount` invariant · SharedLedger helper unit tests across all bucket sets + negative-amount reject (`wallet-ledger.service.ts:77`) · WalletAnticipation cents-parity · concurrent-debit contiguous-chain · idempotent backfill re-run · zero-NULL gate before Stage 10.

### Rollback

Every stage before Stage 11 is non-destructive and reversible: additive columns can be left nullable and ignored; dual-write can be flag-disabled; reader cut-over (Stage 9) is flag-gated and revertible to the legacy Float/recompute path. The `SharedLedger` routing (Stage 6) is per-ledger per-PR, so a regression reverts a single writer. Only Stage 10 (`NOT NULL`) and Stage 11 (Float drop) are one-way and are deferred until coverage is proven for N days; a pre-Stage-10 snapshot/migration-down keeps the columns nullable.

### Risks

Money-correctness (compute `balanceAfter` only in-`$transaction`, gate on zero drift) · Float→cents rounding (cents authoritative at write) · two distinct 3-bucket schemes (port must be bucket-set-parameterized, not fixed two-bucket) · long dual-write window (strict stage ordering) · Connect is reference but most consumer-heavy + emits `commerce.payment.*` spine events (refactor last) · maturation rows need `balanceAfter` recompute too · mixed `onDelete` (Restrict vs Cascade) · **digest staleness**: `WalletService` is already renamed to `SellerWalletService`/`PrepaidWalletService` — use current names, not the digest's `:49`/`:73` `WalletService` labels.

---

## channel-meta duplication family — staged migration plan

**Scope (grounded in `docs/architecture/inventory/channels-omnicore.json` + source):** the Meta page-messaging surface (`${pageId}/messages`) is implemented by two services, Meta credentials are resolved by three readers, and ~19 raw `prisma.metaConnection.find*` queries bypass all of them.

### Canonical choice
- **Page messaging →** `FacebookMessengerService.sendMessage` (`backend/src/marketing/facebook-messenger.service.ts:41`). It posts to `${pageId}/messages` AND persists `FbMessage` (success row with `mid`, FAILED row on Graph error), with DB idempotency from `@@unique([workspaceId, mid])` (`backend/prisma/schema.prisma:3936`). `MessengerService.sendTextMessage` (`backend/src/marketing/channels/messenger/messenger.service.ts:12`) hits the SAME endpoint but persists nothing — it is the thin duplicate.
- **Credential resolution →** `MetaWhatsAppService.resolveConnection` (`backend/src/meta/meta-whatsapp.service.ts:71`). It already takes a `channel` arg (default `'whatsapp'`) and centralizes decrypt + expiry in `buildResolvedMetaConnection` (`backend/src/meta/meta-whatsapp.service.helpers.ts:81`, calling `decryptMetaToken` + `computeMetaTokenExpired`). The canonical facade `ChannelMessageDispatchService.dispatch` already calls it once per send (`backend/src/marketing/channel-message-dispatch.service.ts:152/156`).

### KEEP
- `FacebookMessengerService.sendMessage` — survivor of the Messenger/Facebook merge.
- `MetaWhatsAppService.resolveConnection` — single resolver; one decrypt, one expiry.
- `ChannelMessageDispatchService.dispatch` — resolves creds once, builds the discriminated `ChannelSendInput`.
- `ChannelDispatchRegistry` (`backend/src/common/channel-dispatch/channel-dispatch.registry.ts:31`) + `FacebookDispatchAdapter` (`.../facebook/facebook-dispatch.adapter.ts:22`).
- `ChannelKind` / `CanonicalChannelName` (`backend/src/common/channel-dispatch/channel-dispatch.port.ts:14/37`).

### MIGRATE
- `resolveInstagramConnection` callers (`backend/src/marketing/instagram/instagram-marketing.service.ts:56/83/124/273/385/417`) → `resolveConnection(ws,'instagram')`.
- `MetaConnectionStateService.forWorkspace` (`backend/src/meta/meta-connection-state.service.ts:44`) → consume `resolveConnection.tokenExpired` instead of its local `EXPIRED()` (`:31`).
- The ~19 raw `prisma.metaConnection.find*` bypasses (`integrations/meta-marketing.provider.ts` ×6, `meta-conversions-api.service.ts:135`, `ads-sync-persistence.helpers.ts:132`, `cia.service.ts:98`, `meta-connect.service.ts:54`, `campaigns.service.ts:414`, `facebook-messenger.service.ts:274`, plus instagram sites) → `resolveConnection`.
- `MessengerDispatchAdapter` (`.../messenger/messenger-dispatch.adapter.ts:23`) → delegate `ChannelKind.MESSENGER` to `FacebookMessengerService` behind a flag.

### DEPRECATE / DELETE (end of rollout)
- `MessengerService.sendTextMessage/sendMediaMessage` bodies.
- `resolveInstagramConnection` bespoke decrypt helper.
- `MessengerChannelTransport` legacy `provider.send` body (`backend/src/kloel/channel-transport.providers.ts:124`) after `KLOEL_TRANSPORT_CANONICAL_DELEGATE` is permanently ON.

### Safe staged steps
0. Characterize current behavior (FbMessage row-count contracts; Messenger zero-persist; resolver/state expiry agreement).
1. Route Instagram readers through `resolveConnection`; strip now-redundant `decryptMetaToken` at each callsite.
2. `MetaConnectionStateService` consumes `resolveConnection` behind a read-only compare-log gate, then flip.
3. Drain raw `metaConnection.find*` bypasses one commit at a time, field-parity asserted; leave OAuth/list and by-`pageId` lookups last (they don't fit the `(workspace,channel)` signature).
4. Prove `MessengerService` and `FacebookMessengerService` emit identical `${pageId}/messages` bodies.
5. Flag-gate `MESSENGER`→`FacebookMessengerService` (map `recipientId`→`recipientPsid`, pass `pageId`/`pageAccessToken`/`workspaceId`); assert exactly one `FbMessage` per send. Default OFF.
6. Burn-in: monitor `FbMessage` counts + `(workspaceId, mid)` conflicts vs the echo-upsert path; flip default ON.
7. Delete the `MessengerService` send duplicate; re-point registry `MESSENGER` or remove the adapter.
8. Finish `KLOEL_TRANSPORT_CANONICAL_DELEGATE` rollout LAST, then drop the legacy transport body.

### Required tests
`marketing/facebook-messenger.service.spec.ts` (exactly-one-row persistence), `marketing/channels/messenger/messenger.service.spec.ts` (zero→unified persistence), `meta/meta-whatsapp.service.spec.ts` + `.helpers.spec.ts` (decrypt-once + `tokenExpired`), `meta/meta-connection-state.service.spec.ts` (zero-drift vs legacy `EXPIRED()`), `marketing/instagram/instagram-marketing.service.spec.ts` (no double-decrypt), a NEW wire-equivalence spec, `kloel/channel-transport.registry.canonical-delegate.spec.ts`, and per-bypass field-parity assertions.

### Rollback
Each stage is independently revertable: Stages 1-3 are pure read-path swaps (revert the commit). Stage 5/6 are behind `KLOEL_MESSENGER_UNIFY_FACEBOOK` — set the env back to off to instantly restore the legacy no-persist `MessengerService` path (mirrors the existing `KLOEL_TRANSPORT_CANONICAL_DELEGATE` default-OFF safety). Stage 2 ships behind a compare-log gate so the canonical value is only returned after divergence is proven zero. Deletions (Stages 7-8) happen only after their flag has been ON and clean through a burn-in window; reverting restores the deleted body from git.

### Risks
Double-persist (FacebookMessengerService always writes `FbMessage`; rerouting MESSENGER adds rows the old path never created — intended one-ledger unification, idempotent via `@@unique([workspaceId, mid])`); credential double-decrypt if a caller keeps `decryptMetaToken` after Stage 1; expiry-semantics drift in Stage 2 (compare-log gate catches it); `recipientId` vs `recipientPsid` field-map error; the dispatch facade resolves channel `'facebook'` for both kinds so there is no separate `'messenger'` MetaConnection row (safe to unify, but code keying on `channel=='messenger'` finds nothing); transport flag must be enabled LAST.

---

## See also

- [`DUPLICATION_REGISTER.md`](./DUPLICATION_REGISTER.md) — full severity-tagged duplication register + the P0 verification log of the surgical fixes already landed.
- [`CANONICAL_VOCABULARY.md`](./CANONICAL_VOCABULARY.md) — canonical term → forbidden aliases; the PR/ADR tiebreaker each family above resolves against.

---

_Last generated 2026-06-07_
