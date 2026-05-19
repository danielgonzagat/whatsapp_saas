# Round 072 Codex A/B Verdict

Date: 2026-05-17
Target: `backend/src/kloel/unified-agent.service.ts`
Task class: macro service facade split with public API/spec preservation

## Result

Atomic wins the quality and surface metrics in Round 072, but not by the required large margin. Do not scale complexity yet.

This round proves the R070 dependency-graph update worked:

- Both lanes passed focused Jest and backend typecheck.
- Both lanes preserved the focused spec, public API, constructor shape, scope, and protected files.
- Atomic produced lower changed inventory, lower largest-module pressure, lower source churn, and trace proof.
- Normal still produced a smaller facade and reached first write plus completion faster.
- Normal also reported a generated Prisma-client side effect through the shared `backend/node_modules` symlink. That did not change tracked source, but it is a real isolation weakness for the normal lane.

## Gate Results

Both lanes passed:

- Focused Jest: 13/13 tests.
- Backend typecheck.
- `git diff --check -- backend/src/kloel`.
- Focused spec unchanged.
- Public API preservation audit.
- Refactor scorecard.
- Dynamic target dominance release.
- Facade private-helper release.
- Dynamic extraction economy.
- Scope discipline.
- Protected diff empty.

Atomic additionally passed trace isolation:

- Worktree traces: 6.
- Matching coordinator trace IDs: 0.

## Atomic Wins

Atomic wins changed inventory:

- Normal: 884 changed source inventory lines.
- Atomic: 850 changed source inventory lines.
- Distance: Atomic about 3.8% smaller.

Atomic wins largest changed source:

- Normal largest changed source: `unified-agent-core.ts`, 506 lines.
- Atomic largest changed source: `unified-agent-process.ts`, 471 lines.
- Distance: Atomic about 6.9% smaller.

Atomic wins approximate source churn:

- Normal tracked facade diff: +39/-635, plus 743 new product lines.
- Atomic tracked facade diff: +40/-627, plus 700 new product lines.
- Normal approximate churn: 1417 lines.
- Atomic approximate churn: 1367 lines.
- Distance: Atomic about 3.5% smaller.

Atomic wins traceability:

- Normal traces: 0.
- Atomic traces: 6.
- Trace isolation: pass.

Atomic wins operational isolation:

- Atomic reported no side effect outside the worktree.
- Normal reported that `prisma:generate` wrote generated client output through the shared `backend/node_modules` symlink.

Atomic ties product source file count:

- Normal product source files: 3.
- Atomic product source files: 3.

## Normal Wins

Normal wins total execution time:

- Normal: 8m40s.
- Atomic: 10m37s.
- Distance: Normal about 1.23x faster.

Normal wins time to first observable source write:

- Normal: 2m22s.
- Atomic: 3m41s.
- Distance: Normal about 1.56x faster.

Normal wins facade size:

- Normal facade: 141 lines.
- Atomic facade: 150 lines.
- Distance: Normal about 6.0% smaller.

Normal wins facade private-helper count:

- Normal private methods in facade: 0.
- Atomic private methods in facade: 1 (`delegateDeps`, used 3 times).
- The current scorecard correctly does not count this as single-use debt, but it still shows facade compactness pressure.

## Diagnosis

R072 validates the dependency-aware extraction-shape update.

Compared with R070, Atomic no longer over-expanded the dominant extracted module:

- R070 Atomic inventory: 956 lines.
- R072 Atomic inventory: 850 lines.
- R070 Atomic largest module: 510 lines.
- R072 Atomic largest module: 471 lines.

The remaining Atomic losses are now narrower:

- It still takes too long before the first write.
- It still takes longer overall.
- It keeps a small facade dependency-packaging helper that Normal avoided.

This is not a reason to add fixed latency budgets or fixed facade line ceilings. The next defect is dynamic execution packaging:

- The Atomic worker should receive an immediately executable dependency-cluster recipe.
- The facade replacement should be generated directly from public API and constructor dependencies.
- Repeated dependency bundles such as `delegateDeps` should be represented by the smallest faithful facade expression, not by a private helper when a plain object/delegation shape is smaller.

## Required Atomic OS Update Before Next Round

Do not scale complexity yet.

Update Atomic OS to absorb the next Normal advantages dynamically:

- Add a facade-delegation-shape signal to the policy compiler: detect whether repeated delegate dependency bundles are smaller as inline object, object factory, extracted type, or private helper.
- Prefer the smallest AST-measured facade delegation shape that preserves constructor dependency identity and avoids single-use or low-value private methods.
- Emit a more executable first-write recipe from the fastpath: dependency clusters plus facade delegation shape, so the worker starts from a compiled patch strategy rather than open planning.
- Keep all of this dynamic: no fixed line-count, file-count, latency, or prompt contract.

The next target is:

> keep Atomic's inventory/churn/largest-module/trace wins while closing Normal's first-write, total-time, and facade-size wins.

## Conclusion

R072 is an Atomic win on important construction-quality metrics, but not a decisive OS-level win.

Atomic should stay at this complexity level. The loop should now optimize dynamic facade delegation shape and pre-write execution packaging before repeating the same A/B task.
