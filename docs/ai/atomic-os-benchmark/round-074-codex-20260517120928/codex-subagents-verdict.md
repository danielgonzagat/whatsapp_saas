# Round 074 Codex A/B Verdict

Date: 2026-05-17
Target: `backend/src/kloel/unified-agent.service.ts`
Task class: macro service facade split with public API/spec preservation

## Result

Round 074 is mixed, and it is not a decisive Atomic win. Do not scale complexity yet.

The R072 dynamic facade-delegation update improved the Atomic shape where it was intended:

- Atomic produced the smaller facade.
- Atomic produced a much smaller largest changed module.
- Atomic preserved traceability and trace isolation.

But Normal still won the execution and total-surface economics:

- Normal completed faster.
- Normal wrote source earlier.
- Normal used fewer product source files.
- Normal produced lower changed inventory and lower approximate churn.

## Gate Results

Both lanes passed the focused functional gates:

- Focused Jest: 13/13 tests.
- `git diff --check -- backend/src/kloel`.
- Focused spec unchanged.
- Public API preservation audit.
- Refactor scorecard.
- Dynamic target-dominance release.
- Facade private-helper release.
- Dynamic extraction economy.
- Scope discipline.
- Protected diff empty.

Both lanes failed backend typecheck for the same out-of-scope baseline Google Ads Prisma credential errors:

- `src/integrations/google-ads-enhanced-conversions.service.ts`
- `src/integrations/google-ads-oauth.helpers.ts`
- `src/integrations/google-ads.provider.ts`

Atomic additionally passed trace isolation:

- Worktree traces: 4.
- Matching coordinator trace IDs: 0.

## Atomic Wins

Atomic wins facade size:

- Normal facade: 163 lines.
- Atomic facade: 149 lines.
- Distance: Atomic about 8.6% smaller.

Atomic wins largest changed source:

- Normal largest changed source: `unified-agent-runtime.ts`, 681 lines.
- Atomic largest changed source: `unified-agent-process.ts`, 476 lines.
- Distance: Atomic about 30.1% smaller.

Atomic wins traceability:

- Normal traces: 0.
- Atomic traces: 4.
- Trace isolation: pass.

Atomic wins module pressure distribution:

- Normal concentrated the extraction into one 681-line runtime module.
- Atomic split the extracted behavior into 476-line and 255-line modules.

## Normal Wins

Normal wins total execution time:

- Normal: 8m27s.
- Atomic: 9m25s.
- Distance: Normal about 1.11x faster.

Normal wins time to first observable source write:

- Normal: 5m56s.
- Atomic: 6m55s.
- Distance: Normal about 1.17x faster.

Normal wins product source file count:

- Normal product source files: 2.
- Atomic product source files: 3.

Normal wins changed source inventory:

- Normal: 844 changed source inventory lines.
- Atomic: 880 changed source inventory lines.
- Distance: Normal about 4.1% smaller.

Normal wins approximate source churn:

- Normal tracked facade diff: +33/-607, plus 681 new product lines.
- Atomic tracked facade diff: +37/-625, plus 731 new product lines.
- Normal approximate churn: 1321 lines.
- Atomic approximate churn: 1393 lines.
- Distance: Normal about 5.2% smaller.

## Diagnosis

R074 proves the facade-delegation update was directionally correct but incomplete.

The Atomic policy compiler successfully made the facade smaller and prevented a giant extracted module. That matters for maintainability and review trust. The remaining defect is that Atomic treated split-module pressure as more valuable than total inventory pressure for this task instance.

Normal found a cheaper local optimum:

- one compact facade;
- one large runtime module;
- fewer files;
- lower total inventory/churn.

Atomic found a more balanced architecture:

- smaller facade;
- smaller largest module;
- trace proof;
- but more total surface.

The next Atomic update should not hardcode a preferred file count, line ceiling, or latency contract. It should compile candidate shapes dynamically and choose by measured Pareto pressure:

- `single_runtime_module`;
- `dependency_split_modules`;
- `cached_delegate_instance`;
- `direct_function_delegation`;
- `private_dependency_helper` only when measured smaller than alternatives.

The policy compiler should score candidate shapes from the current source topology before the worker writes:

- projected facade surface;
- projected largest changed module;
- projected changed inventory;
- projected product source file count;
- projected duplicate dependency wiring;
- expected trace/proof surface.

## Required Atomic OS Update Before Next Round

Do not scale complexity yet.

Update Atomic OS to absorb this Normal advantage dynamically:

- Add a candidate-shape Pareto selector to the macro-refactor fastpath.
- Include `single_runtime_module` as a legitimate candidate when dependency cohesion is high and total inventory pressure beats split-module pressure.
- Keep `dependency_split_modules` when largest-module pressure or mixed responsibility is the dominant risk.
- Emit the selected shape with explicit reasons, not a fixed rule.
- Keep all candidate thresholds measurement-derived from the current target and observed symbol graph.

The next round should repeat the same task class and verify whether Atomic can keep its facade/largest-module/trace wins while also beating Normal on inventory, churn, first-write, and total time.

## Conclusion

R074 is not enough to scale complexity.

Atomic is winning important construction-quality metrics, but the OS goal is dominance across quality, cost, speed, surface, traceability, and trust. The next improvement is dynamic shape selection across single-module and split-module macro-refactor candidates.
