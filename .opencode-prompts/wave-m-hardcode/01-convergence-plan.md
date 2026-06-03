# Wave M / Slice 1 — LiqSlice-ConvergencePlan

## Mission

Eliminate hardcode "replacement_cheat_risk" findings in
`scripts/pulse/convergence-plan.ts`. Per mission section 1.11, this file has
**4607** findings — the LARGEST single hardcode reducer in the whole Wave M.

A "replacement_cheat_risk" finding is a substitution that LOOKS dynamic but is
cosmetic — e.g., `const FOO = 'bar'` masquerading as a derivation when it's
just a renamed literal. The fix: replace each with REAL dynamic evidence
(AST extraction, type-contract, filesystem catalog, runtime probe, Prisma
declaration, framework declaration files).

## Ownership set

- `scripts/pulse/convergence-plan.ts`
- `scripts/pulse/convergence-plan.spec.ts` (if exists, else CREATE)
- `scripts/pulse/__companions__/convergence-plan.companion.ts` (READ ONLY — if a companion exists, it contains source-of-truth behavior; do NOT delete)
- `scripts/pulse/__parts__/convergence-plan/*` (READ ONLY — if parts exist, they ARE the file)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md`.
2. `AGENTS.md`.
3. **CRITICAL**: `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md` — full read.
   The guide is mandatory for ALL Wave M work.
4. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full.
5. `scripts/pulse/convergence-plan.ts` — full.
6. `scripts/pulse/no-hardcoded-reality-audit.ts` (READ ONLY, NEVER EDIT) — to
   understand what the auditor counts as cheat-risk.

## Baseline measurement (DO FIRST)

```bash
# Get the BEFORE-state count
node scripts/pulse/no-hardcoded-reality-audit.ts --path scripts/pulse/convergence-plan.ts --json > /tmp/before-convergence-plan.json
jq '.summary.byKind.hardcoded_replacement_cheat_risk' /tmp/before-convergence-plan.json
# Expected ≈ 4607
```

## Pattern to apply

For each "replacement_cheat_risk" finding:
1. Identify the literal/constant being flagged.
2. Determine its TRUE source of truth — is it a Prisma model field name? A
   TypeScript declaration file enum? A filesystem catalog (e.g., "list of
   migration files")? A runtime probe result?
3. Replace the literal with a DYNAMIC derivation that reads from that source
   of truth.
4. The derivation must satisfy the auditor's "valid dynamic evidence" criteria
   (AST/type-contract/filesystem/runtime — see delegation rules section
   "Valid dynamic evidence").

Example transformations:
- BEFORE: `const KNOWN_MODELS = ['User', 'Workspace', 'CheckoutOrder']`
  AFTER: extract via `ts-morph` reading `backend/prisma/schema.prisma` at runtime.
- BEFORE: `const HTTP_STATUS_OK = 200`
  AFTER: import from `http-status-codes` declaration file (real package types).
- BEFORE: `const VALID_KINDS = ['BUG', 'TRANSITIVE', 'PK_REVIEW']`
  AFTER: extract from the enum type union in `scripts/ops/check-tenant-filter.mjs`
  via AST.

## Forbidden moves (CRITICAL — these are bypasses, not fixes)

- DO NOT replace a literal with another literal disguised by `as const`,
  template string, or array spread. That's the SAME cheat.
- DO NOT delete the literal entirely without preserving the behavior.
- DO NOT split the file into parts that hide the literals (count would drop
  but cheat risk same).
- DO NOT introduce a new layer of indirection without real evidence.
- DO NOT touch other files in Wave M scope (each slice has its file).

## Validation gates

```bash
# After-state count must be < before by AT LEAST 50%
node scripts/pulse/no-hardcoded-reality-audit.ts --path scripts/pulse/convergence-plan.ts --json > /tmp/after-convergence-plan.json
jq '.summary.byKind.hardcoded_replacement_cheat_risk' /tmp/after-convergence-plan.json
# Expected ≤ 2300 (≥50% reduction)

# Imports still resolve
npx ts-node --project scripts/pulse/tsconfig.json -e "import * as m from './scripts/pulse/convergence-plan'; console.log('exports:', Object.keys(m).slice(0,20))"

# Focused spec passes (if exists)
npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/convergence-plan.spec.ts
```

## Definition of done

- `hardcoded_replacement_cheat_risk` for this file ≤ 2300 (50%+ reduction
  from 4607).
- Every replacement is verifiable dynamic evidence (cite the source for each
  in the JSON report).
- Imports of `convergence-plan` still resolve from consumers.
- Public exports preserved (no breaking change to API).
- No bypass tokens, no protected files.
- No commits. CEO commits.

## Hard stop conditions

- If `convergence-plan.ts` has a `__companions__` or `__parts__` directory and
  one of those holds source-of-truth — STOP and report; the slice must
  restore-then-liquify (see PULSE debt guide section "Functional restoration").
- If a literal CANNOT be derived dynamically (truly a magic number) — leave
  it with a tagged comment `/* dynamic-evidence: <source> */` and explain why
  derivation is impossible in the report. Auditor may still count it but it's
  a justified exception.
- If file > 600 lines after edits — STOP, report (decomp scope).
- If imports break — STOP, restore via the delegation rules procedure (no
  git restore — restore from your snapshot before edit).
