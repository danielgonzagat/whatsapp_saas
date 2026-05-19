# Round 137 Codex A/B Verdict

## Setup

- Task: split `backend/src/kloel/unified-agent.service.ts` into a smaller facade with extracted `unified-agent*` runtime/support modules.
- Normal worker: `019e39eb-0445-70a0-b140-8456f9f858f8` (`Singer_the_2nd`).
- Atomic worker: `019e39eb-0689-78a3-89f1-7cf21fdbbb67` (`Arendt_the_2nd`).
- Baseline focused Jest: 13/13 passing, 14.266 s reported runtime, 15.49 s wall.
- Both workers preserved public class, constructor, public methods, focused spec, protected files, and changed-scope boundaries.

## External Measurements

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Focused Jest | 13/13 | 13/13 | tie |
| Jest reported test runtime | 11.802 s | 11.807 s | tie/noise |
| Jest command wall time | 13.14 s | 13.15 s | tie/noise |
| Scorecard | pass | pass | tie |
| Public API audit | pass | pass | tie |
| Typecheck impact | pass | pass | tie |
| Typecheck impact duration | 6825 ms | 6944 ms | Normal |
| In-scope diagnostics | 0 | 0 | tie |
| Facade lines | 181 | 174 | Atomic |
| Changed product source files | 2 | 3 | Normal |
| Changed inventory lines | 841 | 834 | Atomic |
| Largest changed source | 660 lines | 433 lines | Atomic |
| Product churn added | 709 | 693 | Atomic |
| Product churn deleted | 605 | 596 | Normal |
| Product churn net | +104 | +97 | Atomic |
| Product churn total | 1314 | 1289 | Atomic |
| Raw/effective traces | 0/0 | 7/3 | Atomic for proof, Normal for raw count |
| Macro trace coverage | n/a/pass | pass | Atomic |
| First durable write | 07:12:16Z | 07:16:39.434Z | Normal |

## Atomic Wins

Atomic again won the structural/product surfaces:

- Smaller facade: 174 vs 181 lines.
- Lower changed inventory: 834 vs 841 lines.
- Much lower largest-module pressure: 433 vs 660 lines.
- Lower additions: 693 vs 709.
- Lower net source growth: +97 vs +104.
- Lower total churn: 1289 vs 1314.
- Product-batch traceability with macro coverage: 7 raw traces consolidated to 3 effective batch units.

The direct-value bundle remains useful: Atomic kept the facade smaller than Normal and avoided the Round 135 getter-heavy facade regression.

## Normal Wins

Normal still won the execution-cost surfaces:

- First durable write: Normal wrote about 263.434 s earlier.
- Product source file count: Normal used one extracted runtime module while Atomic used two.
- Typecheck-impact duration: Normal was 119 ms faster.
- Jest wall time and reported test runtime were effectively tied, with Normal ahead only by noise-level margins.
- Raw trace count: Atomic had 7 raw traces, although macro trace coverage reduced the effective trust surface to 3 batch units.

## Decision

Do not scale complexity.

Atomic is now consistently better at the refactor result, but it is still not dominant in execution start cost. The Round 136 `executionStartCapsule` made the start path explicit but did not make it compact enough for the worker to act early.

The next Atomic OS update should emit a `minimalDispatchBrief`: a dynamic, compact execution brief derived from the full policy, first-batch recipe, bundle mode, and validations. The worker should use the brief as the primary execution surface and consult the full policy only when the first mutation is refused, public API preservation is ambiguous, or validation fails.
