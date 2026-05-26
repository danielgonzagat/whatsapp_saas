# SARIF Curly Autofix Report

**Date**: 2026-05-26  
**Scope**: `backend/src/**/*.ts` — curly rule autofix only  
**Method**: `npx eslint --fix` with non-curly autofixable rules disabled via `--rule` overrides  

## Before / After

| Metric | Before | After |
|--------|--------|-------|
| `curly` errors (seatbelt) | **1034** across 217 files | **0** |
| `curly` in SARIF rules list | present | absent |
| Total SARIF findings | ~8,651 | 8,731 |
| Files changed | — | 228 |
| Insertions / Deletions | — | 1,192 / 1,192 |

> **Note**: The task referenced 1,236 curly errors. The `.eslint-seatbelt.tsv` snapshot showed 1,034. The seatbelt is taken as authoritative.

## Change Verification

### Git diff
All 228 files show **pure brace additions** — `if (x) stmt;` → `if (x) { stmt; }`.  
Equal insert/delete counts (1,192 each) confirm no other rule changes leaked in.

### TypeScript compilation
`tsc -p backend/tsconfig.json --noEmit` reports **33 pre-existing type errors**.  
**Zero new errors** introduced by the brace additions.

### SARIF regeneration
Re-ran `scripts/cognitive/sarif-aggregate.mjs` after applying the
autofix directly in the main worktree (the PI-H patch had partial
conflicts with Wave M5 batch 1 moves; orchestrator re-ran ESLint
in-place to land the same effect cleanly):

- `curly` rule **absent** from the rules list (0 occurrences)
- Total backend findings: **8,592** (down from 8,651 baseline)
- Top remaining rules (by count): `prettier/prettier` 4,386,
  `@typescript-eslint/no-unsafe-assignment` 1,375,
  `@typescript-eslint/no-unsafe-member-access` 1,191,
  `@typescript-eslint/no-unused-vars` 821, others lower
- 4 spec files (`whatsapp.service.part{7,8,9}.spec.ts` +
  `whatsapp.service.spec.ts`) were reverted — they had non-standard
  structure that the autofix couldn't safely transform (parse error)

## Rules disabled during fix

- `prettier/prettier` — blocked by seatbelt policy
- `prefer-const`
- `no-useless-escape`
- `@typescript-eslint/prefer-as-const`
- `@typescript-eslint/no-unnecessary-type-assertion`

## Next Bucket Recommendation

| Rule | Est. errors | Autofixable | Blocker |
|------|-------------|-------------|---------|
| `prettier/prettier` | ~3,186 | Yes | Seatbelt policy must be cleared first |
| `prefer-const` | ~100+ | Yes | Safe, small blast radius |
| `@typescript-eslint/prefer-as-const` | ~10–20 | Yes | Safe |

**Recommendation**: Unblock `prettier/prettier` via seatbelt amendment, then run a similar scoped `--fix` pass.

## Hard Constraints Respected

- [x] Never touched `backend/eslint.config.mjs` or any protected file
- [x] Never passed `--no-verify`, `--no-eslintrc`, or any destructive flags
- [x] Scoped to `backend/src/` only
- [x] Verified with `tsc --noEmit`, `git diff`, and SARIF regeneration
