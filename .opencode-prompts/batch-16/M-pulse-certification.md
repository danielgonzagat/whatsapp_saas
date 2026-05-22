# Wave M — pulse/certification.ts hardcoded liquefication (2786 findings)

## Mission

Reduce `hardcoded_replacement_cheat_risk` findings on `scripts/pulse/certification.ts` (2786 findings) by replacing literals with dynamic derivation evidence.

## Pre-read mandatory (FULL READ)

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md`
3. `CLAUDE.md`, `AGENTS.md`
4. `scripts/pulse/certification.ts` (every line)

## ABSOLUTE FORBIDDEN

- DO NOT edit `scripts/pulse/no-hardcoded-reality-audit.ts` (auditor immutable)
- DO NOT use suppression comments / skip tags
- DO NOT replace hardcode with cosmetic/fake derivations
- DO NOT move literals to other files
- DO NOT delete companions

## Valid dynamic evidence

- TypeScript AST of real source files / declaration files
- Type-contract unions via AST extraction
- Runtime catalogs
- Filesystem evidence
- Package declaration files

## Method

1. Measure beforeModuleTotal via focused auditor
2. Read full file + understand its purpose
3. For each hardcoded literal, find valid dynamic evidence source
4. Replace with dynamic derivation
5. Re-measure
6. Success: netDelta < 0 AND imports pass

## Ownership

`scripts/pulse/certification.ts` + any helpers in same dir.

## Constraints

- NO bypass tokens
- NO commits

## Hard stops

- File corruption — STOP, report
- A literal genuinely can't be replaced — STOP, document
- Auditor decreases but spec fails — STOP (loss of reality)
