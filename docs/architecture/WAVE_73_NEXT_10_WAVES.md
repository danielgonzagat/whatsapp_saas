# Wave 73 — Next 10 Waves Roadmap

> **Snapshot date**: 2026-05-28 (Wave 73, subagent C — forward-looking roadmap)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **HEAD**: `b78bc3f88 refactor(mind): extract pure helpers from MindCapabilityExecutor`
> **Predecessor**: [`WAVE_71_MACRO_V7.md`](./WAVE_71_MACRO_V7.md)
> **Scope**: forward-looking — selects the next 10 carve-out / split targets to
> drive the backend `>500` LOC long-tail downward, file by file, in the same
> rhythm waves 64-72 used. Does **not** execute any of them; this doc is the
> queue.

---

## 1. Session totals at snapshot

- **Commits since rolling-session start (2026-05-27 06:00 → snapshot)**: **280**
- **Commits since Wave 71 doc (`90d9c7633`, 2026-05-28)**: **3**
  - `8c046437c refactor(partnerships): extract pure crypto + invite helpers from PartnershipsService`
  - `db65f65e2 refactor(sales): extract pure helpers from sales.service into sales.helpers` (closes Wave 71 §4 working-tree caveat)
  - `fd5da646d refactor(wallet): extract pure helpers from WalletService into wallet.service.helpers`
  - `294b5938e refactor(autopilot): extract pure helpers from autopilot-analytics-insights`
  - `b78bc3f88 refactor(mind): extract pure helpers from MindCapabilityExecutor` (HEAD)
- **Behavior**: every refactor preserves shell + sustained the helper-extraction
  pattern proven across Waves 64-72. Zero `--no-verify`. Zero `git restore`.

---

## 2. Gate state at snapshot (committed HEAD `b78bc3f88`)

| Gate | Verdict | Detail |
|---|---|---|
| `npm run canonical:check` (full chain) | **GREEN** | All five sub-gates pass; ends with `OK — all 13 cross-boundary util pairs within tolerance.` |
| Backend src non-spec files >500 LOC | **35** | -1 vs Wave 71 (36→35), thanks to the wallet/autopilot/mind extractions absorbing into helper modules. |
| Backend spec files >500 LOC | **26** | flat — the spec heap top is the natural growth zone for newly-extracted helper specs. |
| Repo-wide files >800 LOC | **1** | unchanged — only `checkout-payment.helpers.ts` (936), already documented in Wave 71 §3 as an intentional pure-helper outlier. |

Canonical gate output confirms `13 cross-boundary util pairs within tolerance`,
and the helper-extraction cadence has not regressed any canonical seal.

---

## 3. Next 10 carve targets (queue)

Rule applied: pick the **10 largest non-helpers, non-spec, non-controller-router**
files in `backend/src/` between 500-800 LOC where the structure shows a viable
helper or sub-module extraction. Each entry names the target, the current LOC,
the proposed extraction handle, and the target post-carve LOC.

> Convention: target post-carve LOC = "≤ X" means the wave is considered green
> if the parent file drops at least into the named band, mirroring the bookkeeping
> across waves 62-72. Concurrent-agent territory (anything mid-extracted in
> working tree) is **excluded** from this queue.

### Wave 73 — `kloel-tool-dispatcher.service.ts` (730 → ≤ 680)

- **File**: `backend/src/kloel/kloel-tool-dispatcher.service.ts`
- **Why**: sole backend file in the 700-LOC band. Carried forward from
  Wave 71's §5 next-3 recommendation. Concurrent-agent territory has cleared
  (working tree clean of `kloel/` mid-edits at snapshot).
- **Extraction handle**: largest residual cohesive `case` block group
  (likely the `inventory.*` / `catalog.*` / `messaging.*` cluster — pick the
  one with the most shared private helpers).
- **Spec impact**: dispatcher spec already at 597 LOC; new sibling handlers spec
  splits cleanly without bumping the spec heap.
- **Money-path gate**: 43 suites / 385 tests must stay green.

### Wave 74 — `sales.service.ts` (689 → ≤ 600)

- **File**: `backend/src/sales/sales.service.ts`
- **Why**: even after `db65f65e2` extracted pure helpers to `sales.helpers.ts`,
  the service remains the second-largest non-helper backend file. Likely
  carries a further pure cluster (e.g. pipeline-stage rules, lead-scoring,
  reporting projections) that splits without DI churn.
- **Extraction handle**: `sales.pipeline.helpers.ts` (stage transitions,
  metric projections) — distinct from the existing `sales.helpers.ts` which
  is currently shaped around invite/lead-creation helpers.
- **Spec impact**: `sales.service.spec.ts` already at 528 LOC — new helper
  spec siblings cleanly.

### Wave 75 — `kloel-chat-tools.service.ts` (684 → ≤ 580)

- **File**: `backend/src/kloel/kloel-chat-tools.service.ts`
- **Why**: tied for the 684 line band with checkout-payment.service. Spec
  monolith was already split in Wave 67 (`d456d81a3 test(kloel): split
  chat-tools.spec by domain`), so the service is the last remaining
  oversized member of that cluster.
- **Extraction handle**: pure formatters / payload-builders → 
  `kloel-chat-tools.formatters.ts`. Companion sales-dashboard helpers were
  already moved out (sibling `kloel-chat-tools.service.sales-dashboard.spec.ts`
  exists at 555 LOC), so the remaining bulk is dispatch / formatting / context.
- **Money-path gate**: chat-tools is on the gate-7 pattern
  (`checkout-payment|ledger|wallet|kloel-tool-dispatcher`) only transitively —
  but the broader Jest backend run must stay green.

### Wave 76 — `checkout-payment.service.ts` (684 → ≤ 600)

- **File**: `backend/src/checkout/checkout-payment.service.ts`
- **Why**: the Wave 71 carve-out (792 → 684) cleared the danger zone, but
  follow-up shrinkage stays disciplined — Stripe payment-method-branching
  helpers can move to `checkout-payment.helpers.ts` (the intentional 936-LOC
  module) or to a new `checkout-payment.method-router.helpers.ts` sibling.
- **Extraction handle**: payment-method routing (pix / card / boleto branch
  selection + idempotency guards) — pure functions, transactional logic stays
  in the service.
- **Money-path gate**: gate-7 (43 suites / 385 tests) is non-negotiable;
  every extraction must run the suite locally before commit.
- **Caution**: this is *money path*. Defensive, low-LOC carves only — never
  big-bang splits.

### Wave 77 — `kloel-thinker.service.ts` (664 → ≤ 580)

- **File**: `backend/src/kloel/kloel-thinker.service.ts`
- **Why**: sibling helpers file already exists (`kloel-thinker.helpers.ts` at
  525 LOC), but the service is still 664 LOC. There's room to push more
  pure-prompt-shape logic out of the service.
- **Extraction handle**: cognitive-state → prompt-shape helpers (the recent
  HEAD-2 `fix(kloel): wire cognitive state into chat stream` indicates this
  surface is active). Move the new state-merging logic to the helpers file.
- **Note**: working-tree modifications exist on this file
  (`kloel-thinker.service.ts` is `M` in `git status`); coordinate with the
  active concurrent edit before queueing.

### Wave 78 — `kloel-product-sub-resource-tools.service.ts` (629 → ≤ 550)

- **File**: `backend/src/kloel/kloel-product-sub-resource-tools.service.ts`
- **Why**: 6th-largest backend non-helper / non-spec / non-controller file.
  Spec at 560 LOC (`product-sub-resources.controller.spec.ts`) — the service
  itself is the carve target.
- **Extraction handle**: sub-resource projection helpers
  (`kloel-product-sub-resource-tools.projections.ts`) — formatters for member
  area / sub-product listings, pure functions.
- **Money-path gate**: outside gate-7's direct pattern but participates in
  the broader Jest run.

### Wave 79 — `guest-chat.chat.helpers.ts` (624 → ≤ 520)

- **File**: `backend/src/kloel/guest-chat.chat.helpers.ts`
- **Why**: helper module (not a service), but sits in the 600-band and is
  already a helper file — splittable along the same lines as the proposed
  checkout-payment.helpers.ts split (see Wave 74's predecessor proposal in
  Wave 71 §5). Two-way thematic split: `guest-chat.chat.intent.helpers.ts`
  + `guest-chat.chat.format.helpers.ts`.
- **Reason for `helpers` file inclusion**: unlike the intentional 936-LOC
  `checkout-payment.helpers.ts`, this file is below 800 and has clean
  thematic seams (intent classification vs response formatting).

### Wave 80 — `wallet/wallet.service.ts` (612 → ≤ 540)

- **File**: `backend/src/wallet/wallet.service.ts`
- **Why**: distinct from `kloel/wallet.service.ts` (639) which has already
  had pure helpers extracted in `fd5da646d`. The `wallet/wallet.service.ts`
  surface is still untouched at 612 LOC.
- **Extraction handle**: pure helpers
  (`wallet/wallet.service.helpers.ts`) — balance-projection, hold-release,
  reconciliation formatters. Mirrors the pattern already used in the kloel
  wallet refactor.
- **Money-path gate**: gate-7 covers `wallet` directly — 43 suites / 385
  tests must stay green.

### Wave 81 — `kloel.controller.ts` (594 → ≤ 520)

- **File**: `backend/src/kloel/kloel.controller.ts`
- **Why**: largest backend *controller* in the heap. Controllers should stay
  thin per CLAUDE.md — anything heavier than 500 LOC is a smell.
- **Extraction handle**: split into thematic controllers
  (`kloel-context.controller.ts`, `kloel-stream.controller.ts`, or a sub-module
  wiring) or extract route-handler helpers (`kloel.controller.helpers.ts`).
  Prefer helper-extraction over module split to avoid route surface churn.
- **Caveat**: route surface preservation is non-negotiable per CLAUDE.md
  "preserve the shell" rule — any split must keep all existing URL paths and
  status codes intact.

### Wave 82 — `mind/cia/cia.service.ts` (590 → ≤ 520)

- **File**: `backend/src/kloel/mind/cia/cia.service.ts`
- **Why**: CIA (unified-agent) service sits in the 590-band; concurrent agent
  has already touched the mind subtree (HEAD `b78bc3f88` extracted from
  `MindCapabilityExecutor` at 517 LOC). Following that pattern, the next
  mind subtree carve is `cia.service.ts`.
- **Extraction handle**: pure cognitive-state-shape helpers
  (`cia.service.helpers.ts` — cognitive-state hashing, prompt-input
  assembly, decision-record projections).
- **Spec impact**: `cia-runtime.service.spec.ts` already at 540 LOC — split
  the new helper spec out as a sibling, not into the runtime spec.

---

## 4. Aggregate impact projection

If all 10 waves land at the targeted floors:

| Metric | Now (Wave 73 snapshot) | After 10 waves |
|---|---:|---:|
| Backend src non-spec files >700 LOC | 1 (`kloel-tool-dispatcher` at 730) | **0** |
| Backend src non-spec files >600 LOC | 5 (dispatcher, sales, chat-tools, checkout-payment, thinker) | **0** |
| Backend src non-spec files >500 LOC | 35 | **≤ 30** |
| Repo-wide files >800 LOC | 1 (`checkout-payment.helpers.ts` 936) | **1** (no change — that split is Wave 74's predecessor and is *not* in this queue; it remains an intentional outlier) |
| Combined service-or-spec >800 LOC | 0 | **0** (floor preserved) |
| Gate-7 (money-path) suite count | 43 / 385 | **43 / 385** (no regression allowed) |

The queue is consistent with the documented invariants in Wave 71 §7:

- Production-source `>800` heap stays empty (10 carves all start in the
  500-730 band; none introduces an `>800` file).
- Spec `>800` heap stays empty (10 carves emit *new* helper specs at
  100-300 LOC each — well under any threshold).
- Money path stays green (43 suites / 385 tests must pass each commit).
- Canonical gates 1, 3-6 stay green (no new WAHA / brain / canonical
  imports introduced by pure-helper extractions).

---

## 5. Sequencing & guardrails

1. **One wave per commit.** Mirror the cadence of `dfe8709d4` /
   `4f77506aa` / `5fe72dcee` / `b78bc3f88` — single-purpose refactor commit,
   delta LOC in message, money-path explicit when relevant.
2. **Concurrent-agent etiquette.** Skip any wave whose target file is
   `M` in `git status` at the moment the wave starts; reorder it later.
   Waves 73, 75, 78, 80 are safest right now; Waves 77 (thinker — `M`),
   82 (cia — may collide with mind subtree concurrent edits) need a working-tree
   clear before they start.
3. **Money-path defensive sizing.** Waves 76 (checkout-payment.service) and
   80 (wallet/wallet.service) are *money path*. Keep each carve under
   100 LOC of movement; run gate-7 explicitly before committing.
4. **Helper-module preference.** Default extraction shape is
   `<base>.helpers.ts` (pure functions, no DI), proven across Waves 64-72.
   Avoid creating new NestJS modules in this wave window — module surgery
   carries DI / wiring / spec-rewiring risk and is out of scope.
5. **Spec parity.** Every helper file gets a sibling `*.helpers.spec.ts`
   if the parent service had testable behavior in the carved logic.
   Examples already shipped: `partnerships.crypto.helpers.spec.ts`,
   `partnerships.invite.helpers.spec.ts`.
6. **No `git restore`.** Honor the project-wide ban from CLAUDE.md
   ("git restore proibido") for every wave in this queue. If a carve goes
   wrong, undo with edit-forward not restore.
7. **No `--no-verify`.** Pre-push gates must run on every commit; if a
   gate fires, fix the underlying issue and recommit.
8. **Snapshot every 3 waves.** After Waves 75, 78, 81, refresh the macro
   snapshot doc so the heap trend chart in Wave 71 §3 stays current.

---

## 6. Out-of-scope (not in this queue)

- **`checkout-payment.helpers.ts` (936)** — Wave 74's predecessor split
  (proposed in Wave 71 §5) is a *separate* bookkeeping wave and is not in
  this 10-wave queue. It remains the only repo-wide >800 file and is
  documented as an intentional outlier.
- **Frontend files** — frontend has zero files >700 LOC after Wave 72
  (`091f3190b`). Future frontend work is queue-able separately.
- **Worker files** — worker is out of scope for this LOC-driven queue;
  worker boot/probe issues belong in a separate operational wave.
- **Module / service splits** — explicitly preferred against in §5.5; only
  in-place helper extractions in this queue.
- **Concurrent-agent fixes** — `kloel-thinker.service.ts` and
  `kloel-thinker.service.spec.ts` are currently `M` in working tree;
  Wave 77 is queued but will not start until that working tree is clear.

---

## 7. Carry-forward signal

- Roadmap defined for 10 next waves; no execution in this doc.
- All 10 targets are non-helpers / non-spec files (one helpers exception:
  Wave 79's `guest-chat.chat.helpers.ts`) in the 590-730 LOC band.
- Aggregate goal: drive the `>600` LOC non-spec count from 5 to 0 across
  the queue.
- Sequencing respects concurrent-agent territory (Waves 73, 75, 78, 80 are
  safe-first).
- Money-path defensive guardrails documented for Waves 76 and 80.
- All targets retain the helper-extraction shape proven across Waves
  64-72; no module surgery in this window.
- Three macro-snapshot refresh points scheduled (after Waves 75, 78, 81)
  so the heap trend chart stays truthful.
