# W25-C — ESLint canonical-enforcement plugin

**Date:** 2026-05-26
**Closes:** DoD criterion #11 (CANONICALIZATION_DOD.md row "ESLint custom rule not yet implemented") → 9/11 → **10/11**
**Delegated to:** PI atomic subagent `w25-eslint-canonical-plugin` (DeepSeek V4 Pro)
**CEO hardening:** Parser path fix for Node 25 + ESLint 9 flat-config compatibility

## Result

ESLint 9 flat-config plugin shipped at `scripts/ops/eslint-canonical-rules/`,
**outside** any protected file. Three rules implemented and smoke-tested.
Plugin opt-in via a 1-line require() overlay snippet — no edits to the
protected `*/eslint.config.mjs` files required.

## Files delivered

| Path | Purpose | Lines |
|---|---|---:|
| `scripts/ops/eslint-canonical-rules/index.cjs` | Plugin entry exporting 3 rules | 18 |
| `scripts/ops/eslint-canonical-rules/rules/no-rogue-unknown-record.cjs` | Blocks `type X = Record<string,unknown>` outside `common/types.ts` | 62 |
| `scripts/ops/eslint-canonical-rules/rules/no-rogue-phone-normalizer.cjs` | Blocks `digitsOnly`/`digitsOrNull`/`digitsOrUndefined`/`whatsappDigits` declarations outside `common/phone.ts` | 49 |
| `scripts/ops/eslint-canonical-rules/rules/no-rogue-clamp.cjs` | Blocks `clamp`/`clampScore` declarations outside `common/math.ts` | 44 |
| `scripts/ops/eslint-canonical-rules/__tests__/smoke.cjs` | Flat-config Linter API smoke test for all 3 rules | 225 |
| `scripts/ops/eslint-canonical-rules/.eslintrc.canonical-overlay.json` | Sample overlay the human owner can splice into each workspace eslint.config.mjs | ~25 |
| `scripts/ops/eslint-canonical-rules/README.md` | Operator instructions for opt-in | ~50 |
| `scripts/ops/eslint-canonical-rules/package.json` | Standalone package metadata | 12 |

## Smoke test output (post-CEO-hardening)

```
no-rogue-unknown-record:
  PASS  canonical declaration exempt
  PASS  rogue alias flagged
  PASS  non-matching Record allowed

no-rogue-phone-normalizer:
  PASS  canonical file exempt
  PASS  rogue digitsOnly flagged
  PASS  rogue whatsappDigits flagged
  PASS  unrelated function allowed

no-rogue-clamp:
  PASS  canonical file exempt
  PASS  rogue clamp flagged
  PASS  rogue clampScore flagged
  PASS  daysSince allowed (not in forbidden set)

3/3 rule suites passed.
SMOKE TEST PASSED
```

## CEO hardening — Node 25 parser path

The PI's smoke test imported `@typescript-eslint/parser` by bare module
specifier from a hard-coded `backend/node_modules/...` path. Under Node 25
(repo's current runtime), `require()` does not resolve the package's
`exports."."."default"` field for bare specifiers in this configuration.
Fix: load the parser via its concrete file path
(`@typescript-eslint/parser/dist/index.js`). One-line diff, no semantic change,
test now passes 11/11 assertions.

## Opt-in instructions for the human owner

The plugin is **inert by default** because `*/eslint.config.mjs` files are
protected and cannot be edited by an AI agent. To activate:

1. In `backend/eslint.config.mjs`, add inside the existing config array:

   ```js
   import canonicalPlugin from '../scripts/ops/eslint-canonical-rules/index.cjs';

   // ... after the existing config entries
   {
     files: ['src/**/*.ts', 'src/**/*.tsx'],
     plugins: { canonical: canonicalPlugin },
     rules: {
       'canonical/no-rogue-unknown-record': 'error',
       'canonical/no-rogue-phone-normalizer': 'error',
       'canonical/no-rogue-clamp': 'error',
     },
   }
   ```

2. Run `npm --prefix backend run lint` to verify zero existing violations.

3. If violations exist, they will be from this audit's `kept-local` decisions
   in [[asRecord-consolidation]] / [[DEPRECATION_MAP]] — those are intentional
   and should be added to the rule's exempt list or marked with eslint-disable
   ONLY with an accompanying [[CANONICAL_VOCABULARY]] divergence note.

## Why this matters

Before this gate, every new feature touching `Record<string, unknown>`,
phone normalization, or numeric clamping could (and did, per the
DEPRECATION_MAP migration backlog of 1028 candidates) introduce a fresh
local copy of canonical helpers. The semantic-scan check
(`canonical:check`) only catches structural duplications post-hoc.

This rule catches them at lint-time, BEFORE the PR even gets a tsc pass.

## Verification

- Smoke test: 11/11 PASS
- Plugin runtime: ESLint 9.39.4 + @typescript-eslint/parser 8.59.3
- Standalone (no workspace dep, no install step)
- No protected file touched

## Related

- [[CANONICALIZATION_DOD]] — closes row "ESLint custom rule not yet implemented"
- [[ANTI_REGRESSION_GATES]] — joins canonical:check + canonical:events
- [[CANONICAL_VOCABULARY]] — canonical helpers it protects
