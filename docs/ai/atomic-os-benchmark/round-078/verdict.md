# Round 078 Verdict

Status: `rejected_atomic_context_dependency_loss`

## Task

Scale one step beyond Round 077: extract the three private runtime-context
methods from `UnifiedAgentService` into
`backend/src/kloel/unified-agent-runtime-context.helpers.ts`:

- `buildAgentRuntimeContext`
- `recordAgentRuntimeTurn`
- `buildAgentToolEnvelope`

The helper functions had to receive `AgentRuntimeContextService | undefined`
explicitly, contain no `this.` references, remove the original private methods,
and keep the focused unified-agent Jest suite green.

## Validation

- Normal produced the requested two-file product shape.
- Normal passed focused Jest: `13/13`.
- Normal helper passed the no-`this.` scan.
- Normal removed the private methods.
- Normal passed diff-check, protected diff, and suppression scan.
- Atomic executed the preprompt macro quickly, but failed task acceptance.
- Atomic focused Jest failed: `8 failed, 5 passed`.
- Atomic helper still contained `this.agentRuntime`.
- Atomic typecheck included Kloel-specific `TS2554` errors at the converted
  callsites, in addition to the shared unrelated Google Ads/Prisma noise.
- Atomic removed the private methods, but the exported functions were not
  semantically adapted to standalone helpers.

## Benchmark Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Functional acceptance | Pass | Fail | Normal |
| Event rows | 78 | 3 | Atomic |
| First action | 21,466 ms | 7,489 ms | Atomic |
| Total agent time | 542,501 ms | 69,403 ms | Atomic |
| Completed commands | 10 | 1 | Atomic |
| Failed commands | 0 | 1 | Normal |
| Input tokens | 86,312 | 53,726 | Atomic |
| Output tokens | 4,914 | 103 | Atomic |
| Reasoning tokens | 6,747 | 230 | Atomic |
| Atomic traces | 0 | 12 | Atomic |
| Touched Kloel files | 2 | 2 | Tie |
| Source churn | 100 | 84 | Atomic |

## Wins

Normal wins the round because it passed the actual product/refactor acceptance:
explicit dependency parameter, no helper `this.`, private methods removed, and
focused behavior preserved.

Atomic wins raw execution surface: first action, total time, events, commands,
tokens, traces, and source churn. Those wins do not count as tier closure while
the code is behaviorally broken.

## Diagnosis

`extract_class_methods_to_file` moved class methods verbatim into a top-level
helper file. That was sufficient for class methods that only used their
parameters, but insufficient for methods with instance dependencies. The macro
needed to transform `this.agentRuntime` into an explicit function parameter and
add the corresponding type import before validating.

This is not an OpenCode reasoning failure alone. It is a missing Atomic OS macro
capability: context-aware class-method extraction.

## Decision

Do not scale complexity. Round 079 must repeat the same tier after the Atomic
operator is updated.

Required Atomic OS update:

- Add method extraction adapters to `extract_class_methods_to_file`.
- Allow generated helper headers/imports.
- Allow signature-prefix parameters.
- Allow deterministic body replacements such as
  `this.agentRuntime -> agentRuntime`.
- Preserve Atomic-only execution and traceability.
- Treat helper `this.` scans and missing private-method scans as hard
  acceptance gates for this task class.

The next A/B must use the same real task and only scale after Atomic passes
functional acceptance while maintaining its operational wins.
