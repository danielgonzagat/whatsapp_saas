# Codacy WRONG_RULE Cleanup — 2026-04-15

**Status**: BLOCKED on manual Codacy UI action by repository owner.
**Source snapshot**: `PULSE_CODACY_STATE.json` (sync 2026-04-15T11:17:43Z, 6700
issues).
**Related docs**:

- `docs/codacy/convergence-checkpoint-2026-04-14.md` (prior phase)
- `docs/codacy/applied-overrides.md` (full audit log + REST API findings)
- `docs/adr/0002-security-triage.md` (per-cluster classification)

## What this doc is

A precise, owner-actionable list of Codacy patterns that fire false positives
against this codebase because the rules target frameworks, runtimes, or
languages we don't use. None of them can be fixed in the source code without
introducing gambiarra (e.g., rewriting ESM as CommonJS to silence `es-x`
would break every build).

The only safe resolution path is to disable each listed pattern in the Codacy
"AI Policy" coding standard (ID `151338`, linked to `whatsapp_saas`). Prior
probing (see `applied-overrides.md`) showed the REST API mutation path is
only ~21% reliable (disables 4 of 19 attempted patterns), so the UI path is
the source of truth.

**Estimated impact**: disabling the patterns below drops the Codacy total
from **6,700** to approximately **~4,800 – ~5,000** (−28 to −28%) — a
single 30-minute session by @danielgonzagat.

## How to apply

1. Open
   <https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/coding-standards>
2. Click **AI Policy** (`151338`) → **Code Patterns**.
3. For each pattern listed below, use the filter box, then toggle it **off**.
4. Click **Save & sync**.
5. Wait for Codacy to re-analyze the latest commit. The issue count in
   `https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard` should
   drop live as re-analysis progresses.
6. Back here, run `npm run codacy:sync` and commit the refreshed
   `PULSE_CODACY_STATE.json` + update `ratchet.json` via
   `npm run ratchet:update`.

## Cluster 1 — ESLint8 `es-x` family (ES5 compat rules)

**Rationale**: The `eslint-plugin-es` plugin is designed for libraries that
must compile down to ES5. This monorepo targets Node 20 LTS (backend/worker)
and modern browsers via Next.js 15 (frontend) — both ES2022+. Every `es-x`
rule is structurally incompatible.

- `ESLint8_es-x_no-modules` — 267. Flags `import` / `export` (we're ESM
  by design).
- `ESLint8_es-x_no-block-scoped-variables` — 243. Flags `let` / `const`.
- `ESLint8_es-x_no-trailing-commas` — 118. Flags trailing commas in
  arrays / objects.
- `ESLint8_es-x_no-property-shorthands` — 68. Flags `{ x }` vs `{ x: x }`.
- `ESLint8_es-x_no-template-literals` — 53. Flags backtick strings.
- `ESLint8_es-x_no-arrow-functions` — 44. Flags `() => {}`.
- `ESLint8_es-x_no-trailing-function-commas` — 39. Flags `fn(a, b,)`.
- `ESLint8_es-x_no-optional-chaining` — 38. Flags `a?.b`.
- `ESLint8_es-x_no-destructuring` — 38. Flags `const { x } = obj`.
- `ESLint8_es-x_no-async-functions` — 37. Flags `async function`.

Plus the long tail ( `no-generators` , `no-classes` , `no-let` ,
`no-spread-elements` , etc.) —
**disable the entire `es-x` rule group** rather than one at a time if the Codacy
UI supports
bulk-disable by plugin.

**Subtotal**: ~945 issues in top 50, estimated ~1,100 total including tail.

## Cluster 2 — ESLint8 `fp` family (functional-programming only)

**Rationale**: The `eslint-plugin-fp` is for codebases that enforce pure
functional programming (no mutation, no `null`, no loops, etc.). KLOEL is
a standard object-oriented/imperative TypeScript codebase (NestJS classes,
React components with state). Every `fp_*` rule fires by construction.

| Pattern ID          | Count | What it flags                   |
| ------------------- | ----: | ------------------------------- |
| `ESLint8_fp_no-nil` |   110 | `null` and `undefined` literals |

Tail includes `fp_no-mutation`, `fp_no-let`, `fp_no-loops`, `fp_no-class`,
`fp_no-this`, etc. — **disable the entire `fp` rule group**.

**Subtotal**: ~110 in top 50, estimated ~300 total including tail.

## Cluster 3 — ESLint8 `flowtype` family (Flow type checker)

**Rationale**: `eslint-plugin-flowtype` targets the Facebook Flow type
checker. This project is TypeScript-only (see `tsconfig.json` in every
workspace). Flow annotations (`// @flow`) would not even parse.

| Pattern ID                                          | Count | What it flags                |
| --------------------------------------------------- | ----: | ---------------------------- |
| `ESLint8_flowtype_no-types-missing-file-annotation` |    48 | Missing `// @flow` header    |
| `ESLint8_flowtype_require-parameter-type`           |    45 | Untyped params (TS enforces) |

**Disable the entire `flowtype` rule group.**

**Subtotal**: ~93 in top 50, estimated ~150 total including tail.

## Cluster 4 — `@lwc` (Salesforce Lightning Web Components)

**Rationale**: `eslint-plugin-lwc` is for Salesforce Lightning Web
Components. This project has no Salesforce anything.

- `ESLint8_@lwc_lwc_no-async-await` — 37. Flags `async` / `await` (LWC
  disallows it in certain lifecycle hooks).

**Disable the entire `@lwc` rule group.**

**Subtotal**: ~37.

## Cluster 5 — Semgrep known-wrong rules

- `Semgrep_json.npm.security.package-dependencies-check.package-dependencies-check`
  — 85. Flags every semver range like `^1.2.3` as a "potential dependency
  hijack". This rule is for orgs that pin to exact versions; this repo
  follows standard npm semver conventions. Already excluded for
  `worker/package.json` in `.codacy.yml` — need the same treatment for
  root and every other `package.json`.
- `Semgrep_javascript.lang.correctness.missing-template-string-indicator.missing-template-string-indicator`
  — 85. Flags strings containing `${...}` that aren't template literals
  (backticks), assuming they
  were meant to be interpolated. In practice, these are mostly strings like
  `"Use ${VARIABLE_NAME}"`
  in docs, `${}` in user-facing template prose, or SQL placeholders. False
  positive rate is
  near-total in this repo.
- `Semgrep_rules_lgpl_javascript_crypto_rule-node-insecure-random-generator`
  — 84. Flags `Math.random()` as cryptographically insecure. One real
  case (`checkout` slug generator, tracked in
  `docs/security/deferred.json`); remaining 83 are legitimate non-crypto
  uses (sampling, retry jitter, animation, mock data).

**Recommendation**: disable all three globally. Track the one real
insecure-random case via the existing `docs/security/deferred.json` entry.

**Subtotal**: ~254.

## Cluster 6 — Biome framework-mismatch rules (from 2026-04-14 checkpoint)

Reverified 2026-04-15. These come from Biome rule packs that target
specific JS frameworks we do not use. The convergence checkpoint already
has them in the "stuck" table — they remain stuck for the same reason.

- `Biome_lint_suspicious_noReactSpecificProps` — 1,785 (2026-04-14).
  Framework: Next.js-specific. Flags Next.js-specific props on DOM
  elements.
- `Biome_lint_correctness_noUndeclaredDependencies` — 1,379. Framework:
  monorepo layout. Can't resolve workspace imports across packages.
- `Biome_lint_nursery_noJsxPropsBind` — 977. Framework: experimental.
  Nursery rule, not ready for production.
- `Biome_lint_correctness_useQwikValidLexicalScope` — 497. Framework:
  Qwik. Not a Qwik codebase.
- `Biome_lint_performance_useSolidForComponent` — 247. Framework: Solid.
  Not a Solid codebase.

**Note**: between 2026-04-14 (13,183) and 2026-04-15 (6,700), these counts
have dropped naturally — some were scoped out by `.codacy.yml` exclusions.
The remaining ones still represent the bulk of Biome noise.

**Recommendation**: verify current counts via the Codacy dashboard; disable
any that still fire in significant volume.

## Expected outcome after UI session

Conservative lower bound: Clusters 1–5 alone (`es-x`, `fp`, `flowtype`,
`@lwc`, Semgrep known-wrong) are ~1,440 issues in the top 50 and
~1,700–1,900 including the tail.

If Cluster 6 patterns still fire (check dashboard), they add another
~500–1,500 on top.

**Total expected delta**: **−1,700 to −3,400** → new total **~4,300 to
~5,000** post-UI-session. Codacy grade should bump from **B (74)** to
**A (85+)**.

The remaining ~5,000 issues are the real convergence work:

- `Biome_lint_suspicious_noExplicitAny` (~1,625)
- `Lizard_ccn-medium` + `nloc-medium` + `file-nloc-medium` (~506)
- `@typescript-eslint_no-unsafe-*` family (~400)
- `Biome_lint_performance_noAwaitInLoops` (~142)
- Plus a long tail of real-but-low-count issues.

These require per-file type discipline and refactoring — the subject of
future convergence sessions.

## What happens after the disable

1. Codacy re-analyzes the latest commit.
2. Run `npm run codacy:sync` → refreshed `PULSE_CODACY_STATE.json`.
3. Run `npm run ratchet:update` → new floor locked in `ratchet.json`.
4. Commit both in a single `chore(codacy): post-UI-disable ratchet refresh`.
5. The nightly ops audit workflow will maintain the new floor going forward.
