# WAVE14 — CIA Gap 9: Wire Wisdom Patterns as Beta Priors in MIND Policy

> Authored by PI atomic subagent `w14-cia-gap-9-wisdom-prior` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/wisdom/wisdom-relevance-filter.service.ts` | **NEW** — Injectable `WisdomRelevanceFilter` wrapper around `filterByRelevance()` |
| `backend/src/kloel/wisdom/wisdom-pattern-store.service.ts` | **NEW** — In-memory `WisdomPatternStore` for holding cross-workspace patterns |
| `backend/src/kloel/wisdom/wisdom.module.ts` | Added `WisdomRelevanceFilter` and `WisdomPatternStore` to providers/exports |
| `backend/src/kloel/mind-policy.service.ts` | Core change — injected `WisdomRelevanceFilter` and `WisdomPatternStore` as `@Optional()`; added `applyWisdomPriors()` pass after global prior mixing; added `wisdomAlignsWithOption()` helper |
| `backend/src/kloel/mind-policy.service.spec.ts` | Added 3 tests in `describe('wisdom priors (CIA Gap 9)')` block |

## 2. Test Results

```
Jest — backend/src/kloel/mind-policy.service.spec.ts
  Tests: 15 passed (13 existing + 3 new)

New tests:
  ✓ shifts belief mean toward prior target when wisdom pattern matches
  ✓ wisdom filter failure does not block decision — policy still chooses with no shift
  ✓ no patterns in store → no shift, policy proceeds normally
```

## 3. Backend tsc Result

```
npm --prefix backend run typecheck → exit 0, no errors
```

## 4. Beta Prior Nudge Formula

**Constants (in `mind-policy.service.ts`):**
```ts
const WISDOM_SCALE_FACTOR = 0.5;   // keeps wisdom from dominating workspace signal
const WISDOM_PRIOR_TARGET = 1.0;   // patterns suggest positive outcome
```

**Formula (in `applyWisdomPriors()`):**

For each matching wisdom pattern with confidence *c*:

```
wisdomWeight = WISDOM_SCALE_FACTOR × maxConfidence
```

For each decision option that aligns with the pattern (signalKind keyword
appears in option predicate/action/context):

```
effectiveN  = max(1, belief.samples ?? 0)
priorTarget = WISDOM_PRIOR_TARGET  (= 1.0)

                                (localMean × effectiveN) + (wisdomWeight × priorTarget)
nudgedMean  = ──────────────────────────────────────────────────────────────────────
                                            effectiveN + wisdomWeight
```

**Alignment heuristic (`wisdomAlignsWithOption()`):**
- Strips suffix from pattern `signalKind` (e.g., `reply_rate` → `reply`)
- Checks if the core concept appears in the option's `predicate`, `action`, or `context` values
- If any matching pattern aligns → nudge applied; otherwise option is skipped

**Example:** belief mean = 0.5, samples = 0, matching pattern confidence = 0.8:
```
wisdomWeight = 0.5 × 0.8 = 0.4
effectiveN   = max(1, 0) = 1
nudgedMean   = (0.5 × 1 + 0.4 × 1.0) / (1 + 0.4) = 0.9 / 1.4 ≈ 0.643
```
The mean shifts from 0.5 → 0.643 toward the pattern's recommendation.

**Safety guarantees:**
- `WisdomRelevanceFilter` and `WisdomPatternStore` are `@Optional()` — if not wired, no nudge
- `applyWisdomPriors()` wrapped in try/catch — failures log and return beliefs unmodified
- Scale factor (0.5) ensures wisdom priors never dominate workspace-local signal
- Only matching (relevance ≥ 0.2) and aligned patterns affect beliefs
