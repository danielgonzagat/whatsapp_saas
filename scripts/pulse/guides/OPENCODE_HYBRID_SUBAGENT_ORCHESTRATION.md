# OpenCode Hybrid Subagent Orchestration Guide

This guide standardizes the hybrid operating model for Codex sessions that use
OpenCode subagents inside this workspace.

The goal is not to create noise or parallel theater. The goal is to use Codex as
the main integrator and OpenCode subagents as bounded, inspectable workers so the
workspace can move faster without losing correctness, ownership, or governance.

## Core model

The hybrid model has one orchestrator and many bounded subagents.

Codex is the orchestrator.

OpenCode sessions are subagents.

Codex owns:

- the final architecture decision
- task slicing
- file ownership boundaries
- conflict prevention
- integration of patches
- validation policy
- final reporting
- user-facing status

OpenCode subagents own:

- one narrow research or implementation slice
- only the files explicitly assigned to them
- focused measurements before and after
- focused validation for their slice
- a final report with exact paths, deltas, blockers, and commands run

A subagent does not own the repo. A subagent owns a lane.

## When to use OpenCode subagents

Use OpenCode subagents when work can be split into independent lanes and when the
main Codex session can keep integrating or editing non-overlapping files.

Good fits:

- auditing separate modules in parallel
- reducing independent PULSE auditor debt families
- restoring separate truncated modules from companions
- extracting dynamic evidence from separate source families
- checking external adapter behavior read-only
- preparing patch plans for disjoint files
- running focused import validation for an owned module
- comparing before and after auditor counts for a known surface

Bad fits:

- one tiny edit that Codex can do directly
- work where every lane needs to edit the same file
- governance or protected changes
- broad prompts like "fix PULSE" with no file ownership
- background jobs where output cannot be watched interactively
- tasks that delete behavior to make a metric look better
- speculative refactors without a focused validation target

## Non-negotiable workspace rules

Every session must obey repository governance first.

Do not edit protected or governance files unless the user explicitly approves
that specific protected change and the workspace gate allows it.

Protected surfaces include, but are not limited to:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `ops/**`
- `scripts/ops/**`
- `.github/workflows/**`
- `.codacy.yml`
- package/config/CI guardrail files
- validation scripts
- docs under protected governance areas

For PULSE zero-hardcode work, do not edit:

- `scripts/pulse/no-hardcoded-reality-audit.ts`

For PULSE-only missions, do not edit SaaS/product code. Work stays inside
PULSE-owned code and PULSE documentation that is not protected.

Never use destructive git workflows to simplify the workspace.

Never use skip tags, suppression comments, or `--no-verify` to bypass gates.

## Mandatory pre-read for PULSE hardcode work

For any OpenCode subagent working on PULSE hardcode debt, the prompt must require
a full read of:

- `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md`
- `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`

The subagent must confirm it read them before touching files.

If those docs conflict with the user prompt, the subagent must stop and report
the conflict.

## Launch discipline

OpenCode subagents must be launched interactively.

Do not launch OpenCode as a hidden background process.

Do not rely on redirected logs as proof of useful work.

The orchestrator should keep visible session IDs and poll them deliberately.

The orchestrator must not assume a subagent is useful until it has shown:

- it read the required docs
- it understood its ownership set
- it identified before measurements or baseline state
- it is not editing outside scope

## Recommended launch pattern

Use one OpenCode session per lane.

The prompt must include:

- exact mission
- exact ownership files/directories
- explicit files it must not edit
- required pre-read docs
- required before/after measurements
- required validation commands
- expected final report format
- instruction not to revert unrelated work
- instruction to stop on unexpected corruption or protected surfaces

A good prompt is narrow enough that another agent can finish without asking what
it owns.

Do not ask OpenCode subagents to write reports under `/tmp`. In this workspace,
external directory writes can be auto-rejected. For read-only scouts, require the
report in stdout. For writable scout reports, assign an explicit in-repo
ownership path such as `scripts/pulse/guides/scout-reports/<lane>.md`.

## Subagent prompt template

```text
You are an OpenCode subagent in a shared workspace. You are not alone in the
repo. Do not revert or overwrite edits made by other agents.

Mission:
<one concrete objective>

Ownership:
You may edit only:
- <path 1>
- <path 2>

You must not edit:
- scripts/pulse/no-hardcoded-reality-audit.ts
- governance/protected files
- any file outside ownership

Mandatory pre-read:
- docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md
- docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md

Work rules:
- Measure before and after for your owned module surface.
- Do not reduce debt by deleting behavior, moving code out of scan, or hiding
  findings.
- Replace fixed truth with dynamic evidence from AST, type contracts,
  filesystem, runtime artifacts, package declarations, or observed code.
- Regex may locate evidence but must not be final decision authority.
- Stop if you hit protected files, corruption, duplicate exports, or unrelated
  failures.

Validation:
- Run focused import validation for every edited TypeScript module.
- Run focused specs only if they already exist or are required for this module.
- Report exact failures and whether they are pre-existing.

Final report:
- changed files
- before totals
- after totals
- net delta
- validations run
- remaining blockers
- any pre-existing failures encountered
```

## Ownership slicing

The orchestrator should split work by evidence family, not by vague themes.

Good slices:

- `legacy-break-adapter.ts` plus identity helpers
- `signal-graph.ts`, `evidence-graph.ts`, diagnostic/risk/proof pipeline
- one parser family such as env, visual, guard, or data integrity
- one graph part file plus its direct helpers
- one certification part file plus its direct helpers
- one daemon part file plus its direct helpers
- one sandbox part file plus its direct helpers
- one property-tester part file plus its direct helpers

Avoid slices where multiple subagents need the same central file. If a central
file must change, Codex should usually own that integration patch.

## Main orchestrator loop

Use this loop for serious hybrid work:

1. Establish the live baseline.
2. Identify protected boundaries.
3. Split independent ownership lanes.
4. Launch read-only audit subagents first if the terrain is unclear.
5. Convert the best audits into disjoint implementation prompts.
6. Keep Codex editing one lane locally while subagents work elsewhere.
7. Poll subagents at natural checkpoints, not constantly.
8. Integrate only patches that preserve behavior and pass focused validation.
9. Re-measure the same baseline surface after integration.
10. Record blockers and move to the next highest-return slice.

Do not launch twenty agents that all inspect the same files. That creates delay,
not throughput.

## What worked in this workspace

The highest-yield pattern was read-only OpenCode scouts followed by local Codex
integration.

This worked because scouts could inspect separate PULSE surfaces in parallel
without creating write conflicts.

Effective scout lanes included:

- `types.break-types.ts` and `legacy-break-adapter.ts`
- source root/config/dynamic kernel surfaces
- parser families such as env, visual, guard, and data integrity
- graph/behavior/AST/dataflow surfaces
- certification, daemon, sandbox, runtime fusion, and property tester surfaces

The best scout output was not a patch. It was a ranked list of safe,
low-collision conversions with estimated auditor impact and validation risks.

The fastest implementation path was then:

- Codex applies the smallest true dynamic conversion.
- Codex runs focused import/spec validation if explicitly part of the task.
- Codex runs the auditor measurement only for the touched surface or current
  total when needed.
- Codex leaves unrelated pre-existing failures alone and reports them exactly.

## What did not work

These patterns wasted time or created risk:

- launching OpenCode in shell background mode
- relying on redirected logs
- asking OpenCode to write `/tmp` reports that the sandbox rejects
- broad prompts with no ownership set
- asking many subagents to reduce the same file
- editing the auditor instead of eliminating real debt
- reducing counts by deleting code or behavior
- moving fixed lists into helper files without dynamic evidence
- creating fake arithmetic or cosmetic derivations
- treating parser regex as final authority
- ignoring companion files when a module was truncated
- validating the whole repo when a focused import was enough
- repeating identical failing validation without changing anything
- asking subagents to touch governance or protected files

## PULSE zero-hardcode implementation standard

For PULSE, the target is not "less hardcode". The target is no hardcoded reality.

A fixed value is unacceptable when it acts as truth before observation.

Forbidden decision authorities include:

- fixed diagnostic names
- fixed problem lists
- fixed stack assumptions
- fixed domain assumptions
- fixed route exceptions
- fixed source roots
- fixed parser protocols
- fixed adapter lists
- fixed artifact lists
- fixed severity maps
- fixed score weights
- fixed thresholds
- fixed actor roles
- fixed SQL tables for product data
- fixed visual token lists

Allowed mechanisms include:

- AST evidence
- TypeScript type-contract extraction
- package declaration discovery
- filesystem discovery
- package manifest discovery
- tsconfig/jsconfig discovery
- gitignore discovery
- generated PULSE artifact discovery
- runtime trace evidence
- browser/network evidence
- database schema evidence
- external source evidence
- observed graph relationships

The correct conversion shape is:

```text
fixed parser/checker/finding
-> raw signal
-> evidence graph
-> predicate graph
-> generated diagnostic
-> generated proof requirement
-> action guidance
-> revalidation
```

A parser should not condemn. A parser should observe.

A regex can help locate observed evidence. A regex must not be the judge.

## PULSE auditor debt measurement

For PULSE hardcode work, measure before and after with the same surface.

Useful measurements:

- full auditor total when reporting global progress
- focused file/module total for a patch
- replacement debt separately from current-file debt when relevant
- per-kind counts when deciding next slice

A decrease is only valid when behavior remains executable.

A larger honest baseline after restoring real behavior is not failure. It means
the module stopped lying by omission. Debt reduction happens after restoration.

## Validation policy

Use focused validation.

For TypeScript modules, prefer import validation of the touched module.

For existing focused specs, run the focused spec.

Do not run broad test suites by default if the user did not request broad
validation.

Do not claim a subagent patch is done if the edited module cannot import.

If validation fails because of a pre-existing unrelated issue, report the exact
missing symbol, duplicate export, or failing dependency and do not keep retrying
blindly.

## Integration rules

Codex must integrate subagent results, not blindly trust them.

Before accepting a subagent patch, check:

- Did it stay inside ownership?
- Did it preserve behavior?
- Did it introduce new fixed truth?
- Did focused import/spec validation pass?
- Did auditor debt actually decrease for the owned surface?
- Did it create replacement debt elsewhere?
- Did it touch protected files?

If any answer is unsafe, do not integrate. Report the blocker and move on.

## Scaling rules

More agents only help when the work graph has independent lanes.

Scale up when:

- lanes have disjoint write sets
- each lane has a measurable target
- each lane can validate independently
- the orchestrator has enough context to merge safely

Do not scale up when:

- a central design decision is unresolved
- the same file must be edited by everyone
- the workspace has an active generator rewriting files
- prior agents are still ambiguous or failing silently
- validation and measurements are not defined

The practical high-throughput shape is:

- 3 to 6 read-only scouts for broad terrain
- 2 to 4 implementation workers for disjoint patches
- Codex as local integrator and final patch owner
- one validation lane only when validation can run without blocking edits

If the user asks for a larger swarm, report real runtime/tool limits honestly and
still preserve disjoint ownership.

## Hybrid work modes

Use read-only scout mode when the question is "where is the best safe debt to
cut?"

Use implementation worker mode when the exact files and dynamic conversion are
known.

Use local Codex mode when the patch touches central integration files or when a
small edit is faster than delegation.

Use stop-and-report mode when a task crosses governance, protected files,
corruption, or ambiguous ownership.

## How to maximize delivery

Start from the highest debt that can be safely converted without changing
contracts.

Prefer small true dynamic conversions over large speculative rewrites.

Convert authority source, not labels.

Examples:

- derive status labels from TypeScript unions instead of local string arrays
- derive source roots from tsconfig/package/filesystem instead of fixed folders
- derive schema paths from discovered Prisma config instead of fixed paths
- derive HTTP methods from runtime catalogs or observed decorators instead of
  fixed method lists
- derive artifact names from producers/consumers instead of fixed official lists
- derive evidence confidence from observed signal basis instead of fixed maps

Keep compatibility adapters temporary and explicit.

If a legacy name must exist for compatibility, it must not be used as decision
authority.

## Final reporting format

A good final report from Codex should include:

- solution first
- files changed
- exact current measurement after work
- validations run and their exact result
- known blockers that were not caused by this work
- next best independent lanes if continuing

Do not overclaim production readiness.

For PULSE, distinguish:

- can work now
- can execute bounded autonomous cycles
- can declare complete
- can replace human technical operation through production

Those are different states.

## One-line operating rule

Use OpenCode to multiply bounded investigation and disjoint implementation, but
keep Codex as the accountable integrator that protects governance, preserves
behavior, validates focused changes, and converts fixed truth into dynamic
evidence.
