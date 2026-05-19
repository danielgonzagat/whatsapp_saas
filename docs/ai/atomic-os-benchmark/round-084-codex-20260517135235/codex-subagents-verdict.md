# Round 084 Codex A/B Verdict

## Mission

Repeat the same macro-refactor class after adding the dynamic
`directFirstWriteBlueprint` and compact `atomicWorkerBrief`.

## Lanes

- Normal: `Carver` / `019e36dd-98fd-79a0-b282-abdcf39bcf74`
- Atomic: `Raman` / `019e36dd-9b9c-7b12-86b2-cdd3797d0560`
- Normal worktree: `/private/tmp/kloel-ab084-normal-20260517135235`
- Atomic worktree: `/private/tmp/kloel-ab084-atomic-20260517135235`

## Result

Atomic wins this round on most important structural and trust metrics, including
first observable write. This is a real improvement over R082.

Do not scale complexity yet. Atomic still loses product file count and raw
source churn, so the win is not the required large-margin win across every
measured front.

## Atomic Wins

- First observable write:
  - Atomic: `2026-05-17 14:03:51 -03`
  - Normal: `2026-05-17 14:05:34 -03`
  - Distance: Atomic first-write advantage `1m43s`.
- Completion order:
  - Atomic completed before Normal.
- Changed source inventory:
  - Atomic: `912` lines
  - Normal: `994` lines
  - Distance: Atomic `82` lines smaller.
- Facade size:
  - Atomic: `192` lines
  - Normal: `346` lines
  - Distance: Atomic facade `154` lines smaller.
- Largest changed source:
  - Atomic: `378` lines
  - Normal: `397` lines
  - Distance: Atomic largest module `19` lines smaller.
- Traceability:
  - Atomic: `4` traces
  - Normal: `0` traces
- Trace isolation:
  - Atomic worktree trace count: `4`
  - Matching coordinator trace IDs: `0`
- Focused Jest:
  - Atomic: `13/13` pass
  - Normal: `13/13` pass
- Public API preservation:
  - Atomic: pass
  - Normal: pass
- Scorecard, allowing the copied benchmark harness as setup noise:
  - Atomic: pass
  - Normal: pass

## Normal Wins

- Product source file count:
  - Normal: `3`
  - Atomic: `4`
- Raw source churn:
  - Normal: `721` additions + `464` deletions = `1185`
  - Atomic: `778` additions + `603` deletions = `1381`
  - Distance: Normal `196` churn units lower.

## External Validation

- `npm --prefix backend test -- unified-agent.service.spec.ts --runInBand`
  - Normal: pass, `13/13`
  - Atomic: pass, `13/13`
- `public-api-preservation-audit.cjs`
  - Normal: pass
  - Atomic: pass
- `refactor-scorecard.cjs`
  - Normal: pass when the setup-only copied benchmark harness is allowed
  - Atomic: pass under the same setup allowance
- `scope-discipline-check.cjs`
  - Both workers reported failure because `docs/ai/atomic-os-benchmark/**` was
    copied into each worktree as untracked setup harness.
  - External product-scope validation passes when that harness path is treated
    as experiment setup, not worker product output.
- `trace-isolation-check.cjs`
  - Atomic: pass; no matching trace IDs with coordinator workspace.
- `git diff --check -- backend/src/kloel/unified-agent*`
  - Normal: pass
  - Atomic: pass
- `git diff --exit-code -- backend/src/kloel/unified-agent.service.spec.ts`
  - Normal: pass
  - Atomic: pass
- Suppression scan on changed product files:
  - Normal: pass
  - Atomic: pass
- `npm --prefix backend run typecheck`
  - Normal: fails only on existing out-of-scope Google Ads Prisma `TS2322`
    errors.
  - Atomic: fails on the same out-of-scope Google Ads errors.

## Diagnosis

The dynamic brief update worked: Atomic wrote first, completed first, kept the
facade much smaller, reduced total changed source inventory, and preserved API
with trace evidence.

The remaining loss is surface economy. The selected support-module shape reduced
largest-module pressure, but paid for that with one extra source file and higher
raw churn. The previous shape selector averaged pressure families, so a strong
modularity win could mask an economy loss.

The next Atomic OS update should make shape selection optimize for broad
balanced dominance, not single-front dominance.

## Atomic OS Update Applied After Verdict

- Updated `atomic-refactor-fastpath.cjs` shape ranking from average pressure
  regret to minimax family pressure regret.
- The selector now ranks by:
  - dynamic release pass;
  - lowest worst family regret;
  - lowest average regret;
  - lower product file count;
  - lower write-batch file count.
- This is dynamic and threshold-free: no fixed latency budget, line budget, or
  task-specific hardcoded contract was added.
- Validation:
  - `node --check docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs`
    passed.
  - Fastpath now selects `dependency_split_modules` instead of
    `dependency_split_with_support_module` for this topology.
  - `atomicWorkerBrief` now emits two write targets instead of three.
  - `git diff --check -- docs/ai/atomic-os-benchmark/tools/atomic-refactor-fastpath.cjs docs/ai/atomic-os-benchmark/round-084-codex-20260517135235`
    passed.

## Benchmark Harness Correction

The next round should not copy `docs/ai/atomic-os-benchmark/**` into worker
worktrees. Workers should call coordinator tools by absolute path instead. This
removes setup noise from scope checks and makes product-scope failures cleaner.

## Loop Decision

- Do not scale complexity.
- Repeat the same complexity after the minimax-family selector update.
- In the next round, keep the harness outside the worker worktrees.
