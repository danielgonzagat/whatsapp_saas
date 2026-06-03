# Wave M — convergence-plan.ts hardcoded liquefication (single file, 4607 findings)

## Mission

Focus on ONE file only: `scripts/pulse/convergence-plan.ts` (4607 `hardcoded_replacement_cheat_risk` findings).

Replace hardcoded literals with dynamic derivation evidence (AST/type-contract/filesystem/runtime).

## Pre-read mandatory (FULL READ EACH)

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`
3. `CLAUDE.md`
4. `AGENTS.md`
5. `scripts/pulse/convergence-plan.ts` (full — every line)
6. Any companion: `scripts/pulse/__companions__/convergence-plan.companion.ts` if exists
7. `scripts/pulse/convergence-plan/utils.ts` if exists

## ABSOLUTE FORBIDDEN MOVES

- DO NOT edit `scripts/pulse/no-hardcoded-reality-audit.ts` (auditor immutable)
- DO NOT use suppression comments / skip tags
- DO NOT replace hardcode with cosmetic/fake derivations
- DO NOT move literals to other files
- DO NOT delete companion or restored logic to reduce counts
- DO NOT use `git checkout --`

## Valid dynamic evidence sources

- TypeScript AST of real source files
- Type-contract unions
- Runtime catalogs (Node HTTP, TypeScript catalogs)
- Filesystem evidence: manifests, tsconfig, gitignore
- Package declaration files
- Existing companions as evidence (don't delete)

## Method

1. Measure beforeModuleTotal (focused auditor: `npx ts-node scripts/pulse/index.ts --target scripts/pulse/convergence-plan.ts` or equivalent)
2. Read full file + understand its purpose
3. For each `hardcoded_*_risk`:
   - Identify the literal/array/regex
   - Determine valid dynamic evidence source
   - Replace with dynamic derivation
4. Re-run focused auditor
5. Measure afterModuleTotal, newDebtCreated, netDelta
6. Success: netDelta < 0 AND imports pass AND focused spec passes

## Constraints

- NO bypass tokens
- NO commits
- Restore behavior before reducing debt (per debt guide)
- Single file ownership: `scripts/pulse/convergence-plan.ts` + `scripts/pulse/convergence-plan/utils.ts`

## Definition of Done

- netDelta < 0 with quantified reduction
- Imports pass
- Focused spec passes
- Report: beforeModuleTotal / afterModuleTotal / netDelta / newDebtCreated

## Hard stop conditions

- File corruption — STOP, report exact missing symbol
- A literal genuinely can't be replaced (real business decision) — STOP, document
- Auditor decreases but spec fails — STOP (loss of reality)
