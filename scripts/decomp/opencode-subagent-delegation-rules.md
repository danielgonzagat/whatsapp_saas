# OpenCode Subagent Delegation Rules for PULSE Auditor Debt

These rules are mandatory for every future OpenCode subagent delegation that
targets `scripts/pulse/no-hardcoded-reality-audit.ts` debt reduction.

## Mandatory pre-read

- Before doing any work, every OpenCode subagent must read the full contents of
  `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`.
- The debt guide is not optional context. It is the current operational record
  of what worked, what failed, which modules are truncated, which companions
  contain source-of-truth behavior, and which validation commands proved real
  progress.
- If a delegation prompt conflicts with the debt guide, the subagent must stop
  and report the conflict instead of guessing.

## Absolute prohibitions

- Do not run destructive or discard-based git workflows.
- If a file is corrupted, exports are duplicated, a large accidental deletion
  occurs, or TypeScript structure breaks, stop and report the exact failure.
- Do not try to repair corruption by restoring files from git.
- Do not edit `scripts/pulse/no-hardcoded-reality-audit.ts`.
- Do not edit governance/protected files such as repository agent instructions,
  package/config/CI/ops docs, validation scripts, or guardrail configs.
- Do not run `safe-decompose` unless the mission is explicitly
  decomposition-only.
- Auditor-debt missions must not introduce shim/replacement debt as a side
  effect.
- Do not use suppression comments or skip tags.
- Do not replace hardcode with cosmetic derivations, fake unit arithmetic, or
  moved fixed arrays.
- Do not delete companions, split files, restored logic, or module bodies just
  to reduce auditor counts.
- Do not treat lower auditor counts as success when behavior disappeared.

## Scope rules

- If the target file is a shim, the real ownership must include its parts.
- A delegation must name all editable files and directories explicitly.
- A delegation must not edit outside its named ownership set.
- Prefer one evidence family per subagent instead of broad multi-file prompts.
- Before patching PULSE files, verify there is no active PULSE writer process
  running `scripts/pulse/index.ts`. If such a process exists, report it as a
  workspace stability blocker instead of racing it.

## Launch mode

- OpenCode subagents must be launched interactively through a live session.
- Do not launch OpenCode in shell background mode.
- Do not rely on redirected background logs as proof of work.
- The orchestrator must poll the interactive session output and only consider a
  subagent useful after seeing it read the required rules, the debt guide, and
  its assigned target files.

## Functional restoration before debt reduction

- If a module is truncated or missing public exports expected by callers, the
  first task is to restore the real executable contract, not to lower debt.
- If behavior currently lives in `scripts/pulse/__companions__`, treat the
  companion as source evidence for restoration. Do not delete it blindly.
- After restoring behavior, re-run focused import/spec validation before
  attempting hardcode removal.
- A restoration can increase file-level auditor findings because real behavior
  came back. That is not failure by itself. The subagent must report the new
  baseline and then reduce hardcode from that honest baseline.
- Reducing hardcode before restoring a missing public contract is not accepted
  as proof, because the module may be importable but functionally false.

## Valid dynamic evidence

- TypeScript AST of real source files or real declaration files.
- Type-contract unions via AST/type-contract extraction.
- Runtime catalogs such as Node HTTP catalogs and TypeScript catalogs.
- Real filesystem evidence: package manifests, tsconfig/jsconfig, gitignore,
  discovered source files, observed artifacts, generated PULSE graph/state
  files.
- Package declaration files for framework/client method catalogs such as
  Prisma, BullMQ, Axios, and NestJS.
- Existing companions can be used as behavior evidence when the main module is
  truncated, but hardcoded decisions copied from companions must still be
  liquefied after restoration.

## Regex policy

- Regex is allowed as a parser helper to locate evidence in real source text.
- Regex is not allowed as final authority for fixed catalogs or business
  decisions when AST/type/filesystem evidence can provide authority.

## Required measurement

Every subagent must measure before and after for the full module surface:

- Main shim file, if any.
- All owned `__parts__` files.
- Any new helper file introduced by the subagent.
- Companion files if they are used as restoration evidence or remain part of
  the runtime path.

The report must include:

- `beforeModuleTotal`
- `afterModuleTotal`
- `newDebtCreated`
- `netDelta`
- per-file totals and findings by kind
- whether this was a restoration baseline shift or a debt-reduction patch

Success requires `netDelta < 0` and successful imports.
For restoration-only tasks, success requires restored public exports plus
focused import/spec validation; debt reduction must be measured as a follow-up
baseline, not conflated with restoration.

## Required validation

- Run import validation for every edited TypeScript module.
- If imports fail, the task is incomplete even if auditor numbers decreased.
- Do not claim success until imports pass and the focused auditor measurement
  shows net reduction.
- If a focused spec exists for the restored/touched module, run that spec and
  report the exact result.
- If a module is known to be truncated and isolated import fails due pre-existing
  missing helpers, report the missing symbols exactly and do not misattribute
  the failure to unrelated hardcode work.

## Preferred delegation slices

- Restore missing public contracts from companions before hardcode reduction:
  `manifest.ts`, `capability-model.ts`, `certification.ts`, `runtime-fusion.ts`,
  `api-fuzzer.ts`, and `property-tester.ts` are known risk surfaces from the
  debt guide.
- Prisma/BullMQ/Axios/NestJS method catalogs from declaration evidence.
- HTTP/decorator grammar from runtime HTTP catalogs and observed decorators.
- Fixture/status/framework labels from type unions.
- Source roots/config/artifact filenames from filesystem and PULSE artifacts.
- Runtime/source graph evidence for external-call and persistence-shape
  detection.
- For `source-root-detector.ts`, preserve working exports and specs. Replace
  lists/regex decisions with evidence from manifests, tsconfig/jsconfig,
  gitignore, imports, decorators, and observed files.
- For `property-tester.ts`, status counting and artifact names should come from
  dynamic kernel/type/artifact evidence; do not rely on local status literals.
- For `manifest.ts`, required fields and accepted health/time-window values
  should come from TypeScript AST/type contracts and fail closed if contracts
  cannot be read.

## Failure protocol

- If the subagent cannot make a real dynamic reduction, report no-change with
  evidence.
- Do not fabricate a reduction.
- Do not create helper files that add more debt than they remove.
- If the auditor decreases because code was deleted, moved out of scan, or made
  unreachable, report failure. That is loss of reality, not no-hardcoded
  success.
