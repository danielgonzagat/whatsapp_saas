# Wave M — No-Hardcoded-Reality Liquefication (top 10 PULSE files)

## Mission

Reduce `hardcoded_replacement_cheat_risk` findings on the top 10 highest-count PULSE files. Each file gets dynamic derivation (AST/type-contract/filesystem/runtime evidence) replacing static literals.

## Pre-read mandatory (NON-NEGOTIABLE — full read each)

1. `scripts/decomp/opencode-subagent-delegation-rules.md` (full)
2. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md` (full)
3. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE NÃO-INVENÇÃO
4. `AGENTS.md`

## ABSOLUTE FORBIDDEN MOVES

- DO NOT edit `scripts/pulse/no-hardcoded-reality-audit.ts` (auditor immutable)
- DO NOT use suppression comments or skip tags
- DO NOT replace hardcode with cosmetic derivations or fake unit arithmetic
- DO NOT replace literals with moved fixed arrays
- DO NOT delete companions, split files, or restored logic to reduce auditor counts
- DO NOT treat lower auditor counts as success when behavior disappeared
- DO NOT run destructive git workflows
- DO NOT use `git checkout --` to "fix" corruption

## Targets (per prompt section, top 10 by finding count)

1. `scripts/pulse/convergence-plan.ts` (4607 findings)
2. `scripts/pulse/__companions__/autopilot-processor.companion.ts` (4102 — restore contract first!)
3. `scripts/pulse/property-tester.ts` (3291)
4. `scripts/pulse/types.ts` (2932)
5. `scripts/pulse/certification.ts` (2786)
6. `scripts/pulse/observability-coverage.ts` (2608)
7. `scripts/pulse/chaos-engine.ts` (2380)
8. `scripts/pulse/behavior-graph.ts` (2318)
9. `scripts/pulse/runtime-fusion.ts` (2066)
10. `scripts/pulse/dataflow-engine.ts` (2050)

## Valid dynamic evidence (per PULSE debt guide)

- TypeScript AST of real source files or declaration files
- Type-contract unions via AST/type-contract extraction
- Runtime catalogs (Node HTTP catalogs, TypeScript catalogs)
- Filesystem evidence: package manifests, tsconfig/jsconfig, gitignore, discovered source files, observed artifacts
- Package declaration files for framework method catalogs (Prisma, BullMQ, Axios, NestJS)
- Existing companions as behavior evidence when main module is truncated

## Method per file

1. Measure beforeModuleTotal
2. Read full file
3. For each `hardcoded_*_risk` finding:
   - Identify what literal/array/regex is hardcoded
   - Find valid dynamic evidence source (AST/type/filesystem/runtime)
   - Replace with dynamic derivation
4. Re-run focused auditor: `npx ts-node scripts/pulse/index.ts --target <file>` (or equivalent)
5. Measure afterModuleTotal, newDebtCreated, netDelta
6. Success: netDelta < 0 AND imports pass AND focused spec passes
7. Move to next file

## Constraints

- NO bypass tokens
- NO commits — orchestrator commits after Tier-3 validation
- Restore behavior before reducing debt (per debt guide)

## Definition of Done

- Per-file netDelta < 0 for at least 5 of the 10 targets
- Imports pass for every edited TypeScript module
- Focused specs pass
- Report: per-file beforeModuleTotal / afterModuleTotal / netDelta / newDebtCreated

## Hard stop conditions

- File corruption — STOP, report exact missing symbol
- A literal can't be replaced by dynamic evidence (truly hard-coded business decision) — STOP, document
- Auditor reports negative findings but spec also fails — STOP (loss of reality, not success)
