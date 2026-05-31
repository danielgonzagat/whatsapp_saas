# Wave 77 — Macro v8 Snapshot

> **Snapshot date**: 2026-05-28 (Wave 77, subagent C — macro v8 after waves 73-77)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **HEAD**: `9a188b010 refactor(wallet): more pure helpers (-72 LOC, target ≤540, money-path)`
> **Predecessors**: [`WAVE_43_MACRO.md`](./WAVE_43_MACRO.md) · [`WAVE_47_MACRO.md`](./WAVE_47_MACRO.md) · [`WAVE_50_FINAL_RECAP.md`](./WAVE_50_FINAL_RECAP.md) · [`WAVE_53_MACRO_FINAL.md`](./WAVE_53_MACRO_FINAL.md) · [`WAVE_56_STATUS.md`](./WAVE_56_STATUS.md) · [`WAVE_59_STATUS.md`](./WAVE_59_STATUS.md) · [`WAVE_61_GATE_STATE.md`](./WAVE_61_GATE_STATE.md) · [`WAVE_62_MACRO_V4.md`](./WAVE_62_MACRO_V4.md) · [`WAVE_64_STATE.md`](./WAVE_64_STATE.md) · [`WAVE_66_MACRO_V5.md`](./WAVE_66_MACRO_V5.md) · [`WAVE_69_MACRO_V6.md`](./WAVE_69_MACRO_V6.md) · [`WAVE_71_MACRO_V7.md`](./WAVE_71_MACRO_V7.md)
> **Scope**: macro v8 = aggregate health snapshot rolling waves 73-77 forward.
> Captures the **third structural inflection**: continued LOC monotonic-down
> on every backend cluster (checkout-payment, sales, dispatcher, wallet) while
> 6 of 7 canonical gates stay GREEN. The 7th gate (canonical:check duplicates
> sub-gate) flipped to RED on a `normalize_phone` regression (5 → 6 impls)
> introduced by the otherwise-clean `a996aaf74 refactor(webhooks)` extraction.
> Money-path tests grew 43 → **44 suites / 451 tests** and remain green.

---

## 1. Session totals

- **Commits since rolling-session start (2026-05-27 06:00 → snapshot)**: **292**
  (vs 274 at Wave 71 — **+18** in the 73-77 window).
- **Commits since Wave 71 doc (`90d9c7633`, 2026-05-28 ~02:00 BRT)**: **17**
  (sorted newest-first):
  - `9a188b010 refactor(wallet): more pure helpers (-72 LOC, target ≤540, money-path)` (Wave 77, HEAD)
  - `08807063d refactor(kloel): extract kloel-thinker helpers (-93 LOC)`
  - `bd21674d9 refactor(mind/cia): extract cia.service helpers (-130 LOC)`
  - `46e14fe4b refactor(checkout): more pure helpers (-268 LOC, target ≤600, money-path)`
  - `4c02917a8 refactor(kloel): more product-sub-resource-tools helpers (-142 LOC)`
  - `4d08613c4 refactor(kloel): extract kloel.controller helpers (-109 LOC)`
  - `d12b17ecc refactor(sales): more pure helpers (-112 LOC, target ≤600)`
  - `3386cf2a1 refactor(kloel): extract more dispatcher handlers (-58 LOC, target ≤680)`
  - `950588c11 refactor(kloel): extract kloel-chat-tools helpers (-209 LOC)`
  - `399b855ac refactor(products): extract pure helpers + types from product.service`
  - `a996aaf74 refactor(webhooks): extract pure helpers from webhooks.service (-53 LOC)` ⚠ introduced `normalize_phone` 5 → 6 regression
  - `062721f42 docs(canonical): wave 73 — next 10 waves roadmap`
  - `b78bc3f88 refactor(mind): extract pure helpers from MindCapabilityExecutor`
  - `294b5938e refactor(autopilot): extract pure helpers from autopilot-analytics-insights`
  - `fd5da646d refactor(wallet): extract pure helpers from WalletService into wallet.service.helpers`
  - `90d9c7633 docs(canonical): wave 71 macro v7`
  - `8c046437c refactor(partnerships): extract pure crypto + invite helpers from PartnershipsService`
- **Commit-type mix (full rolling session window — 2026-05-27 06:00 → snapshot)**:

  | type | count | Δ vs Wave 71 |
  |---|---:|---:|
  | `refactor(*)` | 173 | +16 |
  | `fix(*)` | 77 | 0 |
  | `docs(*)` | 26 | +2 |
  | `feat(*)` | 9 | 0 |
  | `test(*)` | 6 | 0 |
  | `chore(*)` | 1 | 0 |

  Refactor remains overwhelmingly dominant — **all 16** new commits in the
  73-77 window were `refactor(*)`. Zero new `feat(*)`, zero new `test(*)`,
  zero new `fix(*)` motion; the pipeline is in pure structural-cleanup mode.
- **Behavior**: every refactor commit message tagged with delta LOC; every
  money-path commit explicitly notes `money-path` or `defensive` in the
  subject (e.g. `46e14fe4b refactor(checkout): more pure helpers (-268 LOC,
  target ≤600, money-path)`, `9a188b010 refactor(wallet): more pure helpers
  (-72 LOC, target ≤540, money-path)`). Zero `--no-verify`. Zero
  `git restore`.

---

## 2. All gates state (verified on HEAD `9a188b010`)

| # | Gate | Verdict | Detail |
|---|---|---|---|
| 1 | `npm run canonical:check` (full chain) | **RED** | Duplicates sub-gate flips RED: `REGRESSION: capability normalize_phone grew 5 → 6 implementations.` Caused by `a996aaf74 refactor(webhooks)` which added `normalizePhoneDigits` in `backend/src/webhooks/webhooks.service.helpers.ts:123` without consolidating into the canonical `backend/src/common/phone/phone-normalization.util.ts` family. The other four sub-gates (events / WAHA / brain / utils-drift) all GREEN — only the duplicates sub-gate flipped. |
| 2 | `backend tsc -p tsconfig.build.json --noEmit` | **GREEN** | Exit 0. Zero TS errors on full build config. |
| 3 | `node scripts/ops/check-canonical-vocabulary.mjs` | **GREEN** | **570 soft warning(s)**, **0 hard violation(s)**. Drift vs Wave 71 (569): +1 soft (one of the 17 helper extractions added a single bookkeeping warning). |
| 4 | `node scripts/ops/check-mind-canonical-imports.mjs` | **GREEN** | 0 legacy import sites (soft; alias window still open until 4-week strict). |
| 5 | `node scripts/ops/check-no-direct-waha-import.mjs` | **GREEN** | 0 direct WAHA imports outside channel boundary (scanned **2969** files, +26 vs Wave 71 from the 17 helper / spec extractions). |
| 6 | `node scripts/ops/check-no-direct-brain-imports.mjs` | **GREEN** | 0 direct brain-* imports outside mind/ boundary (scanned **2919** files, +23 vs Wave 71). |
| 7 | `jest --testPathPatterns='checkout-payment\|ledger\|wallet\|kloel-tool-dispatcher'` | **GREEN** | **44 suites passed / 451 tests passed / 0 failures** in 8.479s. **+1 suite / +66 tests vs Wave 71** (43 / 385): coverage grew with the wallet + checkout-payment helper extractions. Money path safe. |

### Macro health verdict

**6 of 7 gates GREEN on committed HEAD.** First non-green macro snapshot since
Wave 64 — but the failure is narrowly scoped: a single capability regression
on `normalize_phone` (5 → 6 implementations) from one commit
(`a996aaf74 refactor(webhooks)`). All other gates strengthened: money-path
suite count grew 43 → 44 (+1) and test count 385 → 451 (+66) while every
refactor since Wave 71 landed clean. TSC stays GREEN across all three pillars
(backend, frontend, worker), all returning exit 0 with zero errors.

The regression is **single-capability**, **single-commit**, and **trivially
reversible** (either consolidate `normalizePhoneDigits` into the canonical
`phone-normalization.util.ts` family, or update baseline if intentional —
documented as Wave 78 below).

---

## 3. Oversized files remaining (third structural inflection)

### Backend over-800 LOC — production source (services + controllers)

| LOC | File | Notes |
|----:|---|---|
| — | — | **EMPTY** |

The production-source `>800` LOC heap stays empty for the **third consecutive
wave** (Wave 69 → Wave 71 → Wave 77) — no service or controller file in
`backend/src/` sits above 800.

### Backend over-800 LOC — spec files

| LOC | File | Notes |
|----:|---|---|
| — | — | **EMPTY** |

Spec `>800` heap stays empty for the second consecutive wave.

### Backend over-800 LOC — pure helper modules

| LOC | File | Notes |
|----:|---|---|
| 1153 | `backend/src/checkout/checkout-payment.helpers.ts` | Intentional pure-helper module. Grew **936 → 1153** (+217 LOC) across waves 73-77 via `46e14fe4b refactor(checkout): more pure helpers (-268 LOC, target ≤600, money-path)`. Accepts the higher line budget because it carries the money-path helpers extracted from the service. Not a service / controller / spec. Wave 78 candidate for thematic split — see §5. |

### Backend 500-800 LOC band — long-tail summary

- **29** backend source files (non-spec) between 500-800 LOC (1 file from the
  500+ band is the >800 helpers module → 29 in band, 30 total >500).
- Down from **35** at Wave 71 (-6) via the 16 refactor commits in the 73-77
  window. Notable bump-downs:
  - `checkout-payment.service.ts` 684 → **416** (`46e14fe4b -268 LOC`) — the
    longest-historical-danger-zone service is now firmly mid-band.
  - `sales.service.ts` 689 → **577** (`d12b17ecc -112 LOC`) — out of the
    700-tier.
  - `kloel-tool-dispatcher.service.ts` 730 → **672** (`3386cf2a1 -58 LOC`) —
    out of the 700-tier; **no backend non-spec file is now at ≥700 LOC**.
  - `wallet.service.ts` (backend) 539 → cleared via `9a188b010 -72 LOC`
    (target ≤540, money-path).
- Top concentration still `backend/src/kloel/**` (dispatcher partitions,
  intent-router parsers/thematic-catalogs, mind/ subtree) and the wallet /
  sales / checkout cluster.
- **No backend non-spec file sits at ≥700 LOC.** The top of the band is now
  `kloel-tool-dispatcher.service.ts` at 672 — first wave where the band
  ceiling is below 700.

### Frontend over-700 LOC

| LOC | File |
|----:|---|
| — | — | **EMPTY** |

Stays empty (cleared at Wave 72). Frontend top is still
`frontend/src/lib/api/core.ts` at **653 LOC**, leaving the entire frontend
with **zero files above 700 LOC** and a durable >47 LOC clearance from the
threshold.

### Heap trend (waves 50 → 77) — production source only

| Wave | Files >800 LOC (src) | Headline |
|---:|---:|---|
| 50 | 8 | initial baseline |
| 53 | 5 | -3 |
| 59 | 3 | sub-partition tier-0-self-awareness (-776), autopilot segmentation (-343) |
| 61 | 3 | flat |
| 62 | 2 | meta-auth extraction; concurrent agent blocking guest-chat |
| 64 | 1 | checkout-payment crosses under 800 |
| 66 | 1 | flat — guest-chat blocked by concurrent agent |
| 69 | 0 | guest-chat decomposed across phases 1+2 (1114 → 48 LOC); production-source >800 heap cleared |
| 71 | 0 | flat at zero — `checkout-payment.service.ts` defensive 792 → 684 |
| **77** | **0** | **flat at zero — `checkout-payment.service.ts` 684 → 416, `sales.service.ts` 689 → 577, dispatcher 730 → 672; no backend non-spec file ≥700** |

Floor at **0** holds for the **third consecutive wave**. The "any inline
helper push back above 800" risk documented in Waves 64-69 is now retired
both at checkout-payment (clearance 384 LOC) and across every other
historical hotspot.

### Spec heap trend (waves 64 → 77)

| Wave | Spec files >800 LOC | Notes |
|---:|---:|---|
| 64 | 3 | `chat-tools` (931), `dotted-alias` (848), `mind-policy` (851) |
| 66 | 3 | flat |
| 69 | 1 | `mind-policy` only — `chat-tools` + `dotted-alias` split in Wave 67 |
| 71 | 0 | `mind-policy` split via `b3a8ccde3` — spec heap cleared |
| **77** | **0** | **flat at zero** |

### Combined >800 trend (excluding intentional helpers module)

| Wave | Combined (src+spec) >800 LOC | Status |
|---:|---:|---|
| 64 | 4 | baseline |
| 66 | 4 | flat |
| 69 | 1 | -3 |
| 71 | 0 | first wave fully cleared |
| **77** | **0** | **flat — second consecutive wave at the structural floor** |

---

## 4. Working-tree caveat (concurrent agent still in-flight)

Modified or untracked at snapshot time (concurrent-agent activity targeting
`guest-chat.chat.helpers.ts` — extracting operational helpers into a sibling
module):

- `backend/src/kloel/guest-chat.chat.helpers.ts` (M — concurrent-agent
  mid-extraction; sibling `guest-chat.operational.helpers.ts` untracked)
- `docs/architecture/CANONICAL_DOMAINS.md` (M)
- `docs/architecture/CAPABILITY_MAP.md` (M)
- `docs/architecture/DUPLICATION_REGISTER.md` (M)
- `docs/architecture/PRISMA_USAGE.md` (M)
- Untracked siblings:
  - `backend/src/kloel/guest-chat.operational.helpers.ts`
  - `docs/architecture/WAVE_5_WORKTREE_AUDIT.md`

This is the **smallest concurrent-agent dirty set since Wave 62** — just two
source files (one modified + one new sibling) and four docs / one audit
report. The partnerships + sales work that was dirty at Wave 71 has fully
landed as committed history (`8c046437c partnerships`, `d12b17ecc /
db65f65e2 sales`).

**Action**: leave the working-tree alone. No `git restore`. This wave's
commit touches only the new macro v8 doc — zero overlap with the concurrent
agent's set.

---

## 5. Next 3 waves recommended

### Wave 78 — fix `normalize_phone` 5 → 6 capability regression (gate 1 → GREEN)

**Target**: restore gate 1 by consolidating the new
`normalizePhoneDigits (function) — backend/src/webhooks/webhooks.service.helpers.ts:123`
into the canonical `backend/src/common/phone/phone-normalization.util.ts`
family (which already has the canonical `normalizePhone` at line 150 plus
the worker mirror).

**Why**: this is the **only RED gate** in the entire macro snapshot, and the
cause is a single line in a single helper module from one commit
(`a996aaf74`). Cheapest possible structural fix; restores the all-green
canonical floor in a single commit. The capability map already shows the
six call sites — three of them (`marketing/whatsapp/whatsapp-service.helpers`,
`webhooks.service.helpers`, `checkout/checkout-social-lead.util`) are
intra-backend duplicates that should route through the canonical
`backend/src/common/phone/phone-normalization.util.ts`.

**Sub-steps**:
1. Inspect `webhooks.service.helpers.ts:123` to confirm `normalizePhoneDigits`
   semantics match canonical `normalizePhone`. If yes → replace with import +
   delete local function. If subtly different → reconcile or update the
   capability baseline with an explicit ADR note.
2. Re-run `node scripts/ops/check-canonical-duplicates.mjs` — must end with
   `OK — 17 canonical capabilities, no regressions vs HEAD.`
3. Re-run money-path tests (`44 suites / 451 tests` baseline).
4. Commit: `fix(canonical): consolidate normalize_phone into phone-normalization util`.

### Wave 79 — `checkout-payment.helpers.ts` thematic split (1153 → two ≤700 modules)

**Target**: split the sole `>800` LOC file (the pure-helper module) along
thematic seams — likely a charge-construction bucket vs receipt/idempotency
bucket, or provider-payload vs domain-event bucket. The file grew
**936 → 1153** (+217 LOC) across waves 73-77 from continued service
extractions; the planned split from Wave 71 §5 is now overdue.

**Why**: pure helpers split trivially: no DI, no Prisma, no module wiring —
each split is self-contained. The growth trend (777 → 936 → 1153 across
three waves) won't stop without an intentional split, and reaching the
repo-wide "no file >800 anywhere" goal requires it. Money-path tests
strengthened to 44/451 give a robust regression net.

**Sub-steps**:
1. `grep -E '^export (function|const|class)'
   backend/src/checkout/checkout-payment.helpers.ts` to enumerate the helper
   surface area.
2. Group exports into two thematic buckets (e.g.
   `checkout-payment.charge.helpers.ts` and
   `checkout-payment.receipt.helpers.ts`).
3. Move each bucket to a sibling file; re-export shape preserved so the
   call sites in `checkout-payment.service.ts` don't churn.
4. Verify money-path tests (44 suites / 451 tests / 0 failures).
5. Commit per split: `refactor(checkout): split checkout-payment helpers into
   charge + receipt modules`.

### Wave 80 — `kloel-tool-dispatcher.service.ts` defensive carve (672 → ≤620)

**Target**: continue the monotonic-down trajectory on the dispatcher (730 →
672 in Wave 77 via `3386cf2a1 -58 LOC`). Take it another -50 LOC into the
mid-band; with `sales.service.ts` (577) and `checkout-payment.service.ts`
(416) now well below, the dispatcher is again the lone top-of-band backend
service.

**Why**: monotonic-down discipline. The dispatcher proved tractable in Wave
77 (concurrent-agent territory has shrunk; the 5fe72dcee + 3386cf2a1 cuts
landed cleanly). Sub-targets: extract the next cohesive handler cluster
(the existing `agent_*`, `sales.create_*`, `self.*`, `configure_*`
extractions plus the Wave 77 `3386cf2a1` extraction have proven the
pattern works).

**Sub-steps**:
1. Identify the next cohesive handler cluster in
   `kloel-tool-dispatcher.service.ts` (look for the largest residual
   `case` block group that shares helpers).
2. Extract to `kloel-tool-dispatcher.<cluster>.handlers.ts`.
3. Keep dispatcher down to `≤620` LOC; verify the 44-suite money-path gate
   stays green.
4. Commit single-purpose: `refactor(kloel): extract <cluster> handlers from
   dispatcher (-XX LOC)`.

---

## 6. Commands executed (reproducibility)

```bash
# from repo root
git log --since="2026-05-27 06:00" --oneline | wc -l            # 292
find backend/src -name '*.ts' -not -name '*.spec.ts' \
  | xargs wc -l 2>/dev/null | awk '$1 > 800 {print}' | sort -rn  # 1 file: checkout-payment.helpers.ts (1153) — intentional pure-helper module
find backend/src -name '*.ts' -not -name '*.spec.ts' \
  | xargs wc -l 2>/dev/null | awk '$1 > 500 {print}' | wc -l     # 30 (29 in band + 1 helpers module above 800)
find backend/src -name '*.spec.ts' \
  | xargs wc -l 2>/dev/null | awk '$1 > 800 {print}' | sort -rn  # (empty) — spec heap clear

npm run canonical:check                                           # gate 1 — RED (normalize_phone 5 → 6 regression)
node scripts/ops/check-canonical-events.mjs                       # GREEN (39 events)
node scripts/ops/check-no-direct-waha-import.mjs                  # GREEN (2969 files scanned)
node scripts/ops/check-no-direct-brain-imports.mjs                # GREEN (2919 files scanned)
node scripts/ops/check-cross-boundary-utils-drift.mjs             # GREEN (13 pairs within tolerance)
node scripts/ops/check-canonical-vocabulary.mjs                   # gate 3 — GREEN (570 soft, 0 hard)
node scripts/ops/check-mind-canonical-imports.mjs                 # gate 4 — GREEN

# from backend/
npx tsc -p tsconfig.build.json --noEmit                           # gate 2 — GREEN (exit 0)
npx jest --runInBand \
  --testPathPatterns='checkout-payment|ledger|wallet|kloel-tool-dispatcher'
  # gate 7 — GREEN (44 suites / 451 tests / 0 failures / 8.479s)

# from frontend/
npx tsc --noEmit                                                  # frontend tsc — GREEN (exit 0)

# from worker/
npx tsc --noEmit                                                  # worker tsc — GREEN (exit 0)
```

---

## 7. Carry-forward signal

- **6 of 7 gates GREEN on HEAD `9a188b010`** — first non-fully-green macro
  snapshot since Wave 64; failure is narrowly scoped to a single
  `normalize_phone` 5 → 6 capability regression introduced by
  `a996aaf74 refactor(webhooks)`. Wave 78 fixes it in a single commit.
- **All three TSCs GREEN on HEAD** — backend (`tsconfig.build.json`),
  frontend, and worker all report exit 0 with zero errors. Second
  consecutive wave verifying all three pillars in the same snapshot.
- **Production-source `>800` LOC heap stays cleared** for the **third
  consecutive wave** — 8 (Wave 50) → 5 (Wave 53) → 3 (Wave 59) → 3 (Wave 61)
  → 2 (Wave 62) → 1 (Wave 64) → 1 (Wave 66) → 0 (Wave 69) → 0 (Wave 71) →
  **0 (Wave 77)**.
- **Spec `>800` LOC heap stays cleared** for the second consecutive wave.
- **No backend non-spec file is at ≥700 LOC** — first wave where the
  500-800 band ceiling is below 700 (top is `kloel-tool-dispatcher.service.ts`
  at 672, down from 730).
- **Checkout-payment service cluster firmly retired from danger zone** —
  `checkout-payment.service.ts` 684 → **416** (`46e14fe4b -268 LOC`), now
  384 LOC clear of the 800 ceiling. Sister `sales.service.ts` 689 → 577.
- **Money-path coverage grew** — 43 → 44 suites (+1), 385 → 451 tests (+66).
  Every refactor since Wave 71 landed without regression on the money path.
- **Canonical floor holds on 4 of 5 sub-gates (gates 3-6)** — 0 hard
  vocabulary violations, 0 mind legacy imports, 0 WAHA leaks, 0 brain
  leaks, 39 events registered, 13 cross-boundary util pairs within
  tolerance. Only the duplicates sub-gate (gate 1) is RED on the single
  `normalize_phone` regression.
- **Frontend `>700` LOC stays empty** — Wave 72 clearance holds; top still
  `frontend/src/lib/api/core.ts` at 653.
- **Concurrent-agent caveat shrinks further** — dirty set is now one
  source file + one new sibling + four docs + one audit (smallest since
  Wave 62). The partnerships + sales work that was dirty at Wave 71 has
  fully committed.
- **Zero `--no-verify`, zero `git restore`, zero protected-file edits** in
  the 73-77 window — discipline holds across 17 commits.
