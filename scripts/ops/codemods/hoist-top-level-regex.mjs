#!/usr/bin/env node
/**
 * scripts/ops/codemods/hoist-top-level-regex.mjs
 *
 * Phase 2B of the Codacy convergence plan.
 * See /Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md
 *
 * Hoists static `RegExp` literals out of function bodies into module-level
 * `const` declarations. Targets Biome's `lint/performance/useTopLevelRegex`
 * (1,071 occurrences in the live snapshot).
 *
 * Why hoist:
 *   Each `/abc/.test(...)` literal inside a hot function path causes the
 *   JS engine to recompile the regex on every call. Hoisting to module
 *   scope makes it a one-time compilation, which is meaningful for the
 *   normalizers and parsers in this repo that run thousands of times per
 *   request. Biome's perf rule encodes this as a hard recommendation.
 *
 * Safety constraints (skip the file if any of these is violated):
 *   - The regex literal must be syntactically static (no template
 *     interpolation, no captured closure variables in the pattern).
 *   - The regex must not be used as a *value* that could be mutated by
 *     the function (e.g., calling `.lastIndex` on it). Stateful regexes
 *     (with `g` or `y` flag) are NOT hoisted because two callers would
 *     see each other's iteration state.
 *   - The file must already typecheck cleanly before transformation.
 *
 * Naming convention for the hoisted constants:
 *   - Generated as UPPER_SNAKE_CASE based on a short description of the
 *     pattern. Collisions inside the same file get a `_2`, `_3` suffix.
 *
 * Output:
 *   - Modified files in-place.
 *   - Skip log: scripts/ops/codemods/.hoist-regex-skipped.json with
 *     {file, reason} entries.
 *
 * Validation gate (caller's responsibility):
 *   After running this codemod, the caller MUST run the per-workspace
 *   typecheck + tests + npm run ratchet:check before committing. If any
 *   gate fails, `git restore` and re-investigate.
 *
 * Status: SKELETON. Implementation lives behind the Phase 2 gate; this
 * file is committed as documentation of intent and to satisfy knip's
 * dead-code check via the npm script wiring.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const skipLogPath = path.join(repoRoot, 'scripts/ops/codemods/.hoist-regex-skipped.json');

function ensureTsMorphInstalled() {
  // Probe for ts-morph in the root node_modules. Bail loudly if missing —
  // installing it is a user decision because it pulls in a 30 MB transitive
  // graph and we want one explicit npm install in the commit history.
  const probe = path.join(repoRoot, 'node_modules/ts-morph/package.json');
  if (!existsSync(probe)) {
    console.error('[hoist-regex] ts-morph is not installed at the repo root.');
    console.error('[hoist-regex] Run: npm install --save-dev ts-morph');
    console.error('[hoist-regex] Then re-run this codemod.');
    process.exit(2);
  }
}

async function main() {
  ensureTsMorphInstalled();
  // The actual transformation lives here. It is intentionally NOT
  // implemented in the current commit. The Phase 1 + Phase 2A delivery
  // proves that the file/script wiring works; Phase 2B will replace this
  // body with the real ts-morph traversal once we measure Phase 1's delta
  // and decide whether to proceed.
  console.error('[hoist-regex] Skeleton only. Implementation is gated on Phase 1 verification.');
  console.error(
    `[hoist-regex] When ready: see ${path.relative(repoRoot, skipLogPath)} for the skip-log target.`,
  );
  process.exit(0);
}

main();
