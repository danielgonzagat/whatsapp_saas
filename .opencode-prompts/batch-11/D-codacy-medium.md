# Wave D5 — Codacy MEDIUM convergence (~3200 → ≤200)

## Mission

Systematically reduce ~3200 Codacy MEDIUM issues through targeted codemods. Focus on highest-count patterns first.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE CODACY (MAX-RIGOR LOCK)
3. `AGENTS.md`

## Patterns to attack (in order, highest count first)

### 1. curly (736) — codemod

Add curly braces to single-line if/else:
```ts
// Before
if (x) return null;
// After
if (x) {
  return null;
}
```

Codemod via `eslint --rule curly:error --fix backend/src frontend/src worker/src frontend-admin/src`.

### 2. SQLFluff_RF06 quoting (540) — codemod migrations

```bash
# Apply consistent quoting to all backend/prisma/migrations/*.sql
# Use SQLFluff CLI or sed-based codemod
```

### 3. i18n no-raw-jsx-text (181) + no-hardcoded-jsx-user-props (170)

Pass JSX strings through `kloelT()`:
```tsx
// Before
<span>Hello world</span>
// After
<span>{kloelT('Hello world')}</span>
```

### 4. no-hardcoded-throw-error (159)

Use Error subclasses with kloelT message:
```ts
// Before
throw new Error('Bad request');
// After
throw new BadRequestException(kloelT('Bad request'));
```

### 5. no-hardcoded-number-format (129), no-hardcoded-console-error (88)

Apply formatters from `@/lib/format` and `Logger` from NestJS.

### 6. markdownlint_MD013 (813) — line length in docs/

Codemod: reflow markdown to ≤120 chars.

### 7. Lizard_nloc-minor (1541), Lizard_ccn-minor (866), maxstatements (695)

Extract helper functions where blocks are deep. Decompose functions >50 lines.

## Ownership set

ALL backend/src + frontend/src + worker/src + frontend-admin/src + docs/. NO protected files.

## Constraints

- NO bypass tokens (codacy-disable, nosonar, noqa)
- NO commits — orchestrator commits after Tier-3 validation
- NO `// codacy-disable` to hide issues — fix root cause

## Definition of Done

- `PULSE_CODACY_STATE.json` MEDIUM ≤ 200 (95% reduction)
- HIGH=0 maintained
- Build passes
- Lint passes (no new issues)
- Report per-pattern: count before/after

## Hard stop conditions

- A codemod would change runtime behavior — STOP, report
- Decomposition would break public exports — STOP, decompose carefully
- A rule is genuinely false-positive — STOP, document evidence in `docs/codacy/RULE_EXCLUSIONS.md` (request human approval for `.codacy.yml` change)
