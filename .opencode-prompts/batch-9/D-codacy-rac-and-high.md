# Wave D — Codacy RAC + init_baseline + High issues (37 + 21 → 0)

## Mission

Eliminate Codacy HIGH issues:
1. RAC_table-access rule on `backend/prisma/migrations/20251209150035_init_baseline/migration.sql` (37 HIGH) — already excluded in `.codacy.yml` (verify and document)
2. `backend/src/auth/email.service.ts` html-in-template-string + missing-template-string-indicator
3. `package.json` version variant dependency
4. Other 21 HIGH issues per prompt section A.10

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE CODACY (MAX-RIGOR LOCK)
3. `AGENTS.md`
4. `.codacy.yml` (current state — should already exclude migrations)
5. `backend/src/auth/email.service.ts:273,334`
6. `package.json:144`

## Method

### D1: Verify .codacy.yml excludes migrations
`backend/prisma/migrations/**/migration.sql` already in `exclude_paths`. Document the rationale in `docs/codacy/RULE_EXCLUSIONS.md`:
- Reason: RAC_ prefix convention not used in this repo
- Migration DDL references unprefixed table names before forward-only rename
- Excluding auto-generated migration DDL preserves rule coverage on application code

### D2: Fix email.service.ts security findings
- Line 273 (html-in-template-string): refactor to use template engine (handlebars or DOMPurify-sanitized strings)
- Line 334 (missing-template-string-indicator): use explicit `String.raw` or escape user input

### D3: Fix package.json variant dependency
- Pin the version specified at line 144

### D4: Fix other HIGH issues
- `backend/src/autopilot/autopilot.service.ts:878` template-string
- `backend/src/flows/flow-template.service.ts:23` nloc-critical 102 lines → decompose
- `frontend/src/components/flow/NodeProperties.tsx:25` nloc 693 + ccn 57 → decompose
- `frontend/src/components/kloel/CommandPalette.tsx` ccn 17 + nloc 398 → decompose
- 4 package-lock.json entries: ignore in Codacy config (lock files are auto-generated)

## Ownership set

- `.codacy.yml`
- `docs/codacy/RULE_EXCLUSIONS.md` (CREATE)
- `backend/src/auth/email.service.ts`
- `package.json` (version pin only — no dep changes)
- `backend/src/autopilot/autopilot.service.ts`
- `backend/src/flows/flow-template.service.ts`
- `frontend/src/components/flow/NodeProperties.tsx` + decompose into ≤300 line modules
- `frontend/src/components/kloel/CommandPalette.tsx` + decompose

## Constraints

- NO bypass tokens
- NO `// codacy-disable` or `// nosonar`
- NO commits — orchestrator commits
- Decomposition must preserve all exports + spec coverage

## Definition of Done

- `npm run codacy:sync` returns HIGH=0 (after `.codacy.yml` change synced)
- `npm run pulse -- --deep --total` securityPass: PASS
- Report: per-file errors fixed, decomposition stats

## Hard stop conditions

- Codacy dashboard requires manual UI operation to disable the RAC rule globally — STOP, document, ask Daniel
- A decomposition would change public exports used by >5 callers — STOP, report scope
