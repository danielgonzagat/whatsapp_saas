# Wave D5a — Codacy MEDIUM: curly + i18n raw text + format codemod

## Mission

Reduce specific high-count Codacy MEDIUM patterns via mechanical codemods (lower risk than complex restructuring):

1. **curly (736 issues)**: add curly braces to single-line if/else
2. **i18n no-raw-jsx-text (181) + no-hardcoded-jsx-user-props (170)**: wrap JSX strings via `kloelT()`
3. **no-hardcoded-throw-error (159)**: use BadRequestException + kloelT
4. **no-hardcoded-number-format (129), no-hardcoded-console-error (88)**: format utility + Logger

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE CODACY (MAX-RIGOR LOCK)
3. `AGENTS.md`

## Method

### 1. curly codemod

```bash
cd backend && npx eslint --rule curly:error --fix src
cd frontend && npx eslint --rule curly:error --fix src
cd worker && npx eslint --rule curly:error --fix src
cd frontend-admin && npx eslint --rule curly:error --fix src
```

### 2. i18n JSX text

For each match in frontend/src + frontend-admin/src:
```tsx
// Before
<span>Hello world</span>
// After  
<span>{kloelT('Hello world')}</span>
```

Use existing `kloelT` from `@/lib/i18n/t`. Skip aria-labels, alt-texts, and constant labels in design tokens.

### 3. no-hardcoded-throw-error

```ts
// Before: throw new Error('Bad request');
// After: throw new BadRequestException(kloelT('Bad request'));
```

In backend services use NestJS exception classes (BadRequest/NotFound/Forbidden/Unauthorized/Internal).

### 4. no-hardcoded-number-format

```ts
// Before: `R$ ${value.toFixed(2)}`
// After: formatBRL(value)  // from @/lib/format
```

### 5. no-hardcoded-console-error

```ts
// Before: console.error('failed', err);
// After: logger.error(`operation failed`, err);
```

(In NestJS, use `this.logger` instance — services already have one per Wave J).

## Ownership set

ALL backend/src + frontend/src + worker/src + frontend-admin/src. NO protected files (no .codacy.yml, no scripts/ops/, no .husky/, no .github/).

## Constraints

- NO bypass tokens (`codacy-disable`, `nosonar`, `noqa`)
- NO commits
- NO `// codacy-disable` to hide — fix root cause
- Preserve runtime behavior — type-safe replacements only

## Definition of Done

- `cd backend && npx tsc --noEmit` returns 0
- `npm run build` (each project) exits 0
- Lint errors no NEW count
- Report per-pattern: count fixed, count remaining

## Hard stop conditions

- A codemod would change runtime behavior — STOP, report
- Decomposition would break public exports — STOP
- A rule is genuinely false-positive — STOP, document in `docs/codacy/RULE_EXCLUSIONS.md` request
