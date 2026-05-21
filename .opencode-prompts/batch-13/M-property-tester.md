# Wave M — property-tester.ts hardcoded liquefication (3291 findings)

## Mission

Focus on ONE file: `scripts/pulse/property-tester.ts` (3291 `hardcoded_replacement_cheat_risk` findings).

Replace hardcoded literals with dynamic derivation evidence (AST/type-contract/filesystem/runtime).

## Pre-read mandatory (FULL READ EACH)

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`
3. `CLAUDE.md`
4. `AGENTS.md`
5. `scripts/pulse/property-tester.ts` (every line)
6. Any companion or related helper file

## ABSOLUTE FORBIDDEN MOVES

- DO NOT edit `scripts/pulse/no-hardcoded-reality-audit.ts` (auditor immutable)
- DO NOT use suppression comments / skip tags
- DO NOT replace hardcode with cosmetic/fake derivations
- DO NOT move literals to other files
- DO NOT delete companion or restored logic
- DO NOT use `git checkout --`

## Valid dynamic evidence sources

- TypeScript AST of real source files
- Type-contract unions
- Runtime catalogs
- Filesystem evidence
- Package declaration files
- Existing companions as evidence

## Method

1. Measure beforeModuleTotal (focused auditor)
2. Read full file
3. For each `hardcoded_*_risk`:
   - Identify the literal/array/regex
   - Determine valid dynamic evidence source
   - Replace with dynamic derivation
4. Re-run focused auditor
5. Measure afterModuleTotal, newDebtCreated, netDelta
6. Success: netDelta < 0 AND imports pass

## Constraints

- NO bypass tokens
- NO commits
- Single file ownership: `scripts/pulse/property-tester.ts`

## Definition of Done

- netDelta < 0
- Imports pass
- Focused spec passes
- Report: beforeModuleTotal / afterModuleTotal / netDelta / newDebtCreated

## Hard stop conditions

- File corruption — STOP, report
- A literal genuinely can't be replaced — STOP, document
- Auditor decreases but spec fails — STOP
