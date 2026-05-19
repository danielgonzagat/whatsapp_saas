# Round 070 Codex A/B Verdict

Date: 2026-05-17
Target: `backend/src/kloel/unified-agent.service.ts`
Task class: macro service facade split with public API/spec preservation

## Result

Atomic did not win by the required margin. Do not scale complexity.

This round is a clear efficiency loss for Atomic:

- Both lanes passed the focused product behavior gates.
- Both lanes failed backend typecheck on the same out-of-scope Google Ads baseline errors.
- Atomic won facade size and traceability.
- Normal won total time, first-write speed, changed inventory, largest changed source, and approximate product churn.
- Both lanes passed the new dynamic extraction economy gate, so the gate is not yet strong enough to detect the remaining Atomic disadvantage.

## Gate Results

Both lanes passed:

- Focused Jest: 13/13 tests.
- `git diff --check -- backend/src/kloel`.
- Focused spec unchanged.
- Public API preservation audit.
- Refactor scorecard.
- Dynamic target dominance release.
- Facade private-helper release.
- Dynamic extraction economy.
- Scope discipline.
- Protected diff empty.

Both lanes failed full backend typecheck on the same out-of-scope Google Ads integration errors:

- `src/integrations/google-ads-enhanced-conversions.service.ts`
- `src/integrations/google-ads-oauth.helpers.ts`
- `src/integrations/google-ads.provider.ts`

No `unified-agent*` typecheck errors appeared in either lane. For this round, typecheck is a shared baseline blocker, not an A/B differentiator.

Atomic additionally passed trace isolation:

- Worktree traces: 3.
- Coordinator new traces since worker start: 0.

## Atomic Wins

Atomic wins facade size:

- Normal facade: 188 lines.
- Atomic facade: 183 lines.
- Distance: Atomic about 2.7% smaller.

Atomic wins traceability:

- Normal traces: 0.
- Atomic traces: 3.
- Trace isolation: pass.

Atomic ties changed product source count:

- Normal product source files: 3.
- Atomic product source files: 3.

Atomic wins final facade helper surface:

- Normal private methods in facade: 0.
- Atomic private methods in facade: 0.
- Both released single-use private helper debt.

## Normal Wins

Normal wins total execution time:

- Normal: 7m17s.
- Atomic: 9m38s.
- Distance: Normal about 1.32x faster.

Normal wins time to first observable write:

- Normal: 2m27s.
- Atomic: 6m56s.
- Distance: Normal about 2.83x faster.

Normal wins changed source inventory:

- Normal: 857 lines.
- Atomic: 956 lines.
- Distance: Normal about 10.4% smaller.

Normal wins largest changed source:

- Normal largest changed source: `unified-agent-processing.part.ts`, 427 lines.
- Atomic largest changed source: `unified-agent-process.ts`, 510 lines.
- Distance: Normal about 16.3% smaller.

Normal wins approximate product churn:

- Normal tracked facade diff: +47/-596, plus 669 new product lines.
- Atomic tracked facade diff: +59/-613, plus 773 new product lines.
- Normal approximate product churn: 1312 lines.
- Atomic approximate product churn: 1445 lines.
- Distance: Normal about 9.2% smaller.

## Diagnosis

R070 shows that the R068 extraction-economy update was directionally useful but still too weak.

Atomic fixed the previous support-module scatter problem:

- It used the same product source count as Normal.
- It released target dominance.
- It left no private helper debt in the facade.
- It preserved trace isolation.

The remaining defect is different:

- Atomic selected a heavier extracted module shape for the same intent.
- Atomic created a larger dominant process module.
- Atomic took much longer before the first source write.
- The current extraction economy gate only detects support scatter, not avoidable over-extraction inside the dominant extracted module.

This is not a need for fixed line budgets or latency contracts. The defect is dynamic policy quality: Atomic needs to infer the smallest behavior-preserving extraction shape from the actual symbol dependency graph before writing.

## Required Atomic OS Update Before Next Round

Do not scale complexity yet.

Update Atomic OS to absorb the next Normal advantages dynamically:

- Add a dependency-aware extraction-shape signal that compares extracted module boundaries against actual symbol call clusters.
- Detect oversized dominant extraction when a smaller sibling split can preserve behavior with less inventory.
- Make the macro fastpath emit a ready-to-run extraction recipe from AST/public-surface evidence instead of letting the worker deliberate into a heavier shape.
- Keep this dynamic: no fixed file-count, fixed line-count, fixed latency, or prompt contract.
- Preserve the constitutional kernel: protected files, trace, path containment, rollback posture, validation, and no facade/private-helper regression.

The next target is:

> smallest dependency-cohesive extraction that releases target dominance, preserves public behavior, produces trace proof, and does not exceed Normal's inventory/churn shape.

## Conclusion

R070 is a Normal win.

Atomic is better on trust surface, but still not superior as an operating system for this macro-refactor class because it costs more time and produces more product surface. The loop should stay at this complexity level and update the dynamic policy/compiler before launching the next A/B round.
