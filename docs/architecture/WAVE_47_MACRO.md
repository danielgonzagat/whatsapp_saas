# Wave 47 — Macro Snapshot

> **Snapshot date**: 2026-05-27 (Wave 47, subagent C)
> **Branch**: `codex/backlog-consolidation-production-v2`
> **HEAD**: `d296eeba0` (`refactor(mind): drop 3 more orphan stubs (cumulative cleanup)`)
> **Predecessor**: [`WAVE_43_MACRO.md`](./WAVE_43_MACRO.md)
> **Goal**: quick refresh of macro state after Wave 43 → Wave 47 progression.

---

## 1. Snapshot stats (live, command-driven)

| Metric | Value | Δ vs Wave 43 | Source |
|---|---|---|---|
| Commits today (since 06:00) | **188** | +13 | `git log --since="06:00" --oneline \| wc -l` |
| Backend TSC errors | **4** | +4 (regression) | `npx tsc --noEmit \| wc -l` |
| Canonical vocab — hard violations | **0** | flat | `node scripts/ops/check-canonical-vocabulary.mjs` |
| Canonical vocab — soft warnings | **560** | -2 | same |
| Direct `brain-*` imports outside `mind/` | **0** (gate green) | flat | `check-no-direct-brain-imports` |
| Cross-boundary utils drift pairs | **0 hard / 13 within tolerance** | flat | `check-cross-boundary-utils-drift` |
| `mind/coordination/` canonical services | **8** | flat | `find backend/src/kloel/mind/coordination -name '*.service.ts'` |
| Remaining `brain-*.ts` files at kloel root | **1** | -5 | `find backend/src/kloel -maxdepth 1 -name 'brain-*.ts'` |
| Remaining `mind-*.ts` files at kloel root | **36** | (new metric) | `find backend/src/kloel -maxdepth 1 -name 'mind-*.ts'` |

### Notes on deltas

- **Brain-* legacy root files: 6 → 1.** Wave 43 Target 1 (flip 9 brain-* non-service
  impl files) is essentially complete — only one `brain-*.ts` file remains at the
  legacy kloel root. ADR-0013 M1 fully landed at the file-layout level.
- **TSC errors regressed from 0 → 4.** Concurrent agent activity (37 modified
  files in working tree including kloel + marketing helpers + checkout) is the
  likely cause. Not investigated this turn per scope (doc only).
- **Vocab soft warnings: 562 → 560.** Marginal drift; Wave 45 Contact-cluster
  sweep not yet started.
- **`mind-*.ts` files at root: 36.** Confirms Wave 43 Target 2 (mind-* legacy
  impl flip) remains the largest pending canonical move.

---

## 2. Gates summary

All canonical gates **green** at HEAD `d296eeba0`:

```
canonical:check                       → OK
  ├─ check-canonical-duplicates       → OK — 17 canonical capabilities, no regressions vs HEAD
  ├─ check-canonical-events           → OK — 39 events registered
  ├─ check-no-direct-waha-import      → OK — 0 direct WAHA imports outside channel boundary (2893 files)
  ├─ check-no-direct-brain-imports    → OK — 0 direct brain-* imports outside mind/ boundary (2873 files)
  └─ check-cross-boundary-utils-drift → OK — 13/13 within tolerance
check-canonical-vocabulary            → OK — 560 soft warning(s), 0 hard violation(s)
```

TSC regression (4 errors) is **outside the canonical gate set** and out of scope
for this macro snapshot.

---

## 3. Outstanding observations

- **Concurrent agent activity (significant)**: working tree shows 37 uncommitted
  modifications spanning `PULSE_*` artifacts, backend kloel/marketing/checkout
  helpers, frontend checkout hooks, worker flow-engine-voice-producer, and 8
  architecture docs. Per CLAUDE.md regra (don't compete), this macro doc stays
  isolated — only `WAVE_47_MACRO.md` is staged.
- **Wave 43 Target 1 (brain-* flip)**: structurally complete. Drop from 6 → 1
  legacy `brain-*.ts` files at kloel root.
- **Wave 43 Target 2 (mind-* flip)**: still pending. 36 `mind-*.ts` files at
  legacy root, matching the Wave 43 expectation.
- **TSC regression**: 0 → 4 errors. Likely concurrent-agent-induced; the doc
  here records it but does not investigate (out of scope).

---

## 4. Next-wave hints (carry-forward from Wave 43 §3)

Unchanged top picks remain valid:

1. **Finish Target 2** — mind-* legacy impl flip (36 files at root, biggest
   pending canonicalization pool).
2. **Target 3** — Contact-cluster vocab sweep (still ~248 of 560 soft warnings).
3. **Target 4** — decompose `capability-registry-v2.const.ts` (2288 LOC) and
   `kloel-tool-dispatcher.service.ts` (1578 LOC).
4. **Investigate TSC regression** (4 errors) before Wave 48 starts heavy
   refactoring.
5. **(gated)** Target 5 — WalletService unification (ADR-0015 still proposed).
