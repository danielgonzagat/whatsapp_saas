# Wave 66 — Macro v5 Snapshot

> **Snapshot date**: 2026-05-28 (Wave 66, subagent C — macro v5 after waves 62-65)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **HEAD**: `5c2c8eb06 refactor(kloel): extract pure helpers from business-config-tools service`
> **Predecessors**: [`WAVE_43_MACRO.md`](./WAVE_43_MACRO.md) · [`WAVE_47_MACRO.md`](./WAVE_47_MACRO.md) · [`WAVE_50_FINAL_RECAP.md`](./WAVE_50_FINAL_RECAP.md) · [`WAVE_53_MACRO_FINAL.md`](./WAVE_53_MACRO_FINAL.md) · [`WAVE_56_STATUS.md`](./WAVE_56_STATUS.md) · [`WAVE_59_STATUS.md`](./WAVE_59_STATUS.md) · [`WAVE_61_GATE_STATE.md`](./WAVE_61_GATE_STATE.md) · [`WAVE_62_MACRO_V4.md`](./WAVE_62_MACRO_V4.md) · [`WAVE_64_STATE.md`](./WAVE_64_STATE.md)
> **Scope**: macro v5 = aggregate health snapshot rolling waves 62-65 forward.
> Captures rolling-session commit volume, all gate verdicts on committed HEAD,
> the now-very-shallow >800-LOC heap (1 source file remaining), and the next
> three wave recommendations.

---

## 1. Session totals

- **Commits since rolling-session start (2026-05-27 06:00 → snapshot)**: **258**
- **Commits since Wave 64 doc (`9f1aea280`, 2026-05-28 01:18 BRT)**: **5**
  - `862066f22 feat(kloel): expose payment execution rails in capabilities`
  - `fc033b9a5 refactor(wallet): extract pure split math + error classes (-29 LOC service)`
  - `87e74dfe7 refactor(marketing): extract tiktok-marketing pure helpers (-221 LOC service)`
  - `4546047f4 refactor(kloel): extract audio.service helpers (-67 LOC)`
  - `5cc870302 refactor(kloel): extract ad-rules-engine helpers (-60 LOC)`
  - `5c2c8eb06 refactor(kloel): extract pure helpers from business-config-tools service` (HEAD)
- **Wave 66 net contribution at snapshot**: this macro v5 doc commit.
- **Commit-type mix (full rolling session window)**:

  | type | count |
  |---|---:|
  | `refactor(*)` | 148 |
  | `fix(*)` | 77 |
  | `docs(*)` | 22 |
  | `feat(*)` | 7 |
  | `test(*)` | 3 |
  | `chore(*)` | 1 |

  Refactor remains dominant — extraction/decomposition theme; `fix(*)` cluster
  is the money-path stripe-reconciliation surface plus omnicore import drift
  cleanups; `feat(*)` carries the lineage-ledger and capability registry
  additions.
- **Behavior**: every refactor commit message tagged with delta LOC; every
  money-path commit explicitly notes `money-path preserved`. Zero
  `--no-verify`. Zero `git restore`.

---

## 2. All gates state (verified on HEAD `5c2c8eb06`)

| # | Gate | Verdict | Detail |
|---|---|---|---|
| 1 | `npm run canonical:check` (full chain) | **GREEN** | `check-canonical-duplicates.mjs` ends with `OK — all 13 cross-boundary util pairs within tolerance.` `create_checkout` baseline (17) holds steady since the wave-62 rebaseline. |
| 2 | `backend tsc -p tsconfig.build.json --noEmit` | **GREEN** | Exit 0, zero stderr, zero TS errors on full build config. |
| 3 | `node scripts/ops/check-canonical-vocabulary.mjs` | **GREEN** | **566 soft warning(s)**, **0 hard violation(s)**. Drift vs Wave 64 (565): +1 soft, within audited noise floor. |
| 4 | `node scripts/ops/check-mind-canonical-imports.mjs` | **GREEN** | 0 legacy import sites (soft; alias window still open until 4-week strict). |
| 5 | `node scripts/ops/check-no-direct-waha-import.mjs` | **GREEN** | 0 direct WAHA imports outside channel boundary (scanned **2901** files). |
| 6 | `node scripts/ops/check-no-direct-brain-imports.mjs` | **GREEN** | 0 direct brain-* imports outside mind/ boundary (scanned **2858** files). |
| 7 | `jest --testPathPatterns='checkout-payment\|ledger\|wallet\|kloel-tool-dispatcher'` | **GREEN** | **35 suites passed / 385 tests passed / 0 failures** in 8.205s. Money-path + dispatcher surface healthy across the wave 62-66 extraction sequence. |

### Macro health verdict

**All 7 gates GREEN on committed HEAD.** First fully-green macro snapshot in
the recent macro-v3/v4 sequence (Wave 62 macro v4 had gate #1 in-flight RED;
Wave 64 flipped it back to GREEN and it has held since). The money-path test
count expanded from 364 (Wave 62) to 385 (Wave 66), +21 net tests with zero
regressions across five extraction commits.

---

## 3. Oversized files remaining (concentrated heap)

### Backend over-800 LOC — production source only (the headline targets)

| LOC | File | Notes |
|----:|---|---|
| 1114 | `backend/src/kloel/guest-chat.action-intent.helpers.ts` | Decomposition plan filed in [`WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md`](./WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md). Concurrent agent's WT still touches the surrounding `kloel/*` cluster (capability-registry-v2, intent-router spec, dispatcher self-handlers) — defer this wave. |

**That is the entire >800 LOC source heap.** `checkout-payment.service.ts`
finally dropped under 800 in wave 63, and no other production source file
sits above the threshold.

### Backend over-800 LOC — spec files (separate ceiling, no production risk)

| LOC | File |
|----:|---|
| 931 | `backend/src/kloel/kloel-tool-dispatcher.service.chat-tools.spec.ts` |
| 851 | `backend/src/kloel/mind/policy/mind-policy.service.spec.ts` |
| 848 | `backend/src/kloel/kloel-tool-dispatcher.service.dotted-alias.spec.ts` |

Three oversized spec files, all in the kloel cluster. Splitting them by
`describe` block drops the count to 0 with zero production-code risk —
remains the wave-65/wave-67 candidate. (Wave 64 already recommended this.)

### Backend 500-800 LOC band — long tail summary

- **43** backend source files (non-spec) between 500-800 LOC.
- **41** backend source files (non-spec) between 500-800 LOC after excluding
  the 1114-LOC outlier.
- Top concentration remains `backend/src/kloel/**` (intent-router, mind/,
  unified-agent-actions-*, dispatcher partitions, chat-tools).
- Top of the long tail (LOC ≥ 700):

  | LOC | File |
  |----:|---|
  | 792 | `backend/src/checkout/checkout-payment.service.ts` |
  | 777 | `backend/src/checkout/checkout-payment.helpers.ts` |
  | 761 | `backend/src/sales/sales.service.ts` |
  | 730 | `backend/src/kloel/kloel-tool-dispatcher.service.ts` |

  `checkout-payment.service.ts` at 792 — just inside the ceiling after Wave
  63's final extraction pass. Sits in the danger zone where any new helper
  could push it back above; resist incidental additions.

### Frontend over-700 LOC

**None.** `frontend/src/app/(public)/onboarding-chat/page.tsx` dropped from
735 (Wave 62) to **680** (Wave 66) via the wave-64 helper extraction
(`ad57123e0 refactor(frontend): extract onboarding-chat page helpers -55 LOC`).
The frontend's largest file is now under 700.

### Heap trend (waves 50 → 66) — production source only

| Wave | Files >800 LOC (src) | Headline |
|---:|---:|---|
| 50 | 8 | initial baseline |
| 53 | 5 | -3 |
| 59 | 3 | sub-partition tier-0-self-awareness (-776), autopilot segmentation (-343) |
| 61 | 3 | flat |
| 62 | 2 | meta-auth extraction; concurrent agent blocking guest-chat |
| 64 | 1 | checkout-payment crosses under 800 |
| **66** | **1** | **flat — guest-chat blocked by concurrent agent** |

Monotonic-down; the floor at 1 is **policy-blocked, not technically blocked**
— `guest-chat.action-intent.helpers.ts` has a decomposition plan and a clear
runway the moment the concurrent agent's WT clears.

---

## 4. Working-tree caveat (concurrent agent still in-flight)

Same scope class as waves 59/61/62. Modified but uncommitted at snapshot
time:

- `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts`
- `backend/src/kloel/capability-registry-v2/capability-registry-v2.types.ts`
- `backend/src/kloel/kloel-tool-dispatcher.receipt.helpers.ts`
- `backend/src/kloel/kloel-tool-dispatcher.service.dotted-alias.spec.ts`
- `backend/src/kloel/toolplanner/full-chain.integration.spec.ts`
- `backend/src/kloel/toolplanner/toolplanner.service.ts`
- `docs/architecture/CANONICAL_DOMAINS.md`
- `docs/architecture/CAPABILITY_MAP.md`
- `docs/architecture/DUPLICATION_REGISTER.md`
- Untracked sibling: `docs/architecture/WAVE_5_WORKTREE_AUDIT.md`

**Action**: leave it alone. No `git restore`. This wave's commit touches only
the new macro v5 doc — zero overlap with the concurrent agent's set.

---

## 5. Next 3 waves recommended

### Wave 67 — Spec-file split (`kloel-tool-dispatcher` × 2 + `mind-policy`)

**Target**: 3 oversized kloel spec files → ≤500 LOC each by splitting on top-
level `describe` blocks. Drops the >800 backend file count (production +
spec, combined) from 4 to 1.

**Why**: zero production-code risk (test-fixture only), zero overlap with the
concurrent agent's set, and clears a long-standing carry-over from wave 64.
Cleanest possible win for >800 LOC tally.

**Sub-steps**:
1. Audit each spec for cohesive `describe` clusters.
2. Extract sibling files named after the `describe` (e.g.
   `kloel-tool-dispatcher.service.chat-tools.sales.spec.ts`) — keep imports
   identical; share fixtures via `__fixtures__/` if needed.
3. Verify per-file: `npx jest --testPathPatterns='<new-file-name>'` green.
4. Verify aggregate gate: `jest --testPathPatterns='kloel-tool-dispatcher'`
   suite count matches.
5. Commit per file with format `test(kloel): split <name> spec by <axis>`.

### Wave 68 — `guest-chat.action-intent.helpers.ts` decomposition (1114 LOC)

**Target**: 1114 LOC → ≤700 LOC across a small number of cohesive helper
files; per the wave-60 plan.

**Why**: the only remaining >800 LOC production source file. **Gate first**:
verify concurrent agent's WT no longer touches `backend/src/kloel/*` before
queuing this. If still blocked, rotate to long-tail work in non-conflicted
surfaces (`backend/src/checkout/checkout-payment.service.ts` is now 792 —
monitor for upward drift; any helper churn could push it back above the
threshold).

**Sub-steps**:
1. Re-read [`WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md`](./WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md).
2. Extract one decomposition unit per commit; run guest-chat specs after each.
3. Stop at ≤700 LOC.

### Wave 69 — Long-tail 700+ LOC sweep (non-kloel surfaces)

**Target**: chip into the 4 files between 700-800 LOC (`checkout-payment.service.ts`,
`checkout-payment.helpers.ts`, `sales.service.ts`, `kloel-tool-dispatcher.service.ts`)
without crossing into concurrent-agent territory.

**Why**: ensures the 700-800 band doesn't drift upward over time. Two of the
four are in `backend/src/checkout/**` (concurrent-agent-clean); `sales.service.ts`
historically modified by the concurrent agent (defer); the dispatcher is
stable but partitioning further risks fragmentation.

**Sub-steps**:
1. Audit `checkout-payment.service.ts` (792) and `checkout-payment.helpers.ts`
   (777) for any final pure-helper carve-outs.
2. If concurrent agent has released `sales/`, include `sales.service.ts` (761).
3. Single extraction per commit; money-path tests must remain at 385/385.

---

## 6. Commands executed (reproducibility)

```bash
# from repo root
git log --since="2026-05-27 06:00" --oneline | wc -l            # 258
find backend/src -name '*.ts' -not -name '*.spec.ts' \
  | xargs wc -l 2>/dev/null | awk '$1 > 800 {print}' | sort -rn  # 1 file: guest-chat.action-intent.helpers (1114)
find backend/src -name '*.ts' -not -name '*.spec.ts' \
  | xargs wc -l 2>/dev/null | awk '$1 > 500 {print}' | wc -l     # 43

npm run canonical:check                                           # gate 1 — GREEN
node scripts/ops/check-canonical-vocabulary.mjs                   # gate 3 — GREEN (566 soft, 0 hard)
node scripts/ops/check-mind-canonical-imports.mjs                 # gate 4 — GREEN
node scripts/ops/check-no-direct-waha-import.mjs                  # gate 5 — GREEN (2901 files)
node scripts/ops/check-no-direct-brain-imports.mjs                # gate 6 — GREEN (2858 files)

# from backend/
npx tsc -p tsconfig.build.json --noEmit                           # gate 2 — GREEN (exit 0)
npx jest --runInBand \
  --testPathPatterns='checkout-payment|ledger|wallet|kloel-tool-dispatcher'
  # gate 7 — GREEN (35 suites / 385 tests / 0 failures / 8.205s)
```

---

## 7. Carry-forward signal

- **All 7 gates GREEN on HEAD `5c2c8eb06`** — first fully-green macro
  snapshot since the wave-59 concurrent-agent drift window opened.
- **Canonical floor holds (gates 3-6)** — 0 hard violations, 0 mind legacy
  imports, 0 WAHA leaks, 0 brain leaks. Module-boundary contract intact
  across waves 56-66.
- **TSC clean on HEAD** — zero TS errors on full build config.
- **Money-path safe** — 385 tests pass (+21 vs Wave 62). Five extraction
  commits since Wave 64 regressed nothing across checkout-payment, ledger,
  wallet, dispatcher, plus the new `feat(kloel)` payment-rails capability.
- **Production-source >800 LOC heap monotonic-down**:
  8 (Wave 50) → 5 (Wave 53) → 3 (Wave 59) → 3 (Wave 61) → 2 (Wave 62) →
  1 (Wave 64) → **1 (Wave 66)**. Remaining file is policy-blocked by the
  concurrent agent's WT, not technically blocked.
- **Frontend >700 LOC cleared** — `onboarding-chat/page.tsx` 735 → 680 via
  wave-64 helper extraction. Frontend's top LOC file is now under the
  700 threshold.
- **Concurrent agent caveat persists** — same scope as waves 59-64. Wave 67
  should re-check WT state before queuing any work in
  `backend/src/kloel/capability-registry-v2/**`,
  `backend/src/kloel/toolplanner/**`, the dispatcher receipt-helpers,
  the dotted-alias spec, or the three architecture docs.
