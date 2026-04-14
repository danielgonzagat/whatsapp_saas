#!/usr/bin/env node
/**
 * scripts/ops/codemods/cleanup-unused-vars.mjs
 *
 * Phase 2D of the Codacy convergence plan.
 * See /Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md
 *
 * Cleans up unused imports, unused variable declarations, and unused
 * function parameters across the codebase. Targets:
 *   - Biome `lint/correctness/noUnusedImports`
 *   - Biome `lint/correctness/noUnusedVariables`
 *   - ESLint `@typescript-eslint/no-unused-vars`
 *
 * Live snapshot estimates 400+ instances across all workspaces.
 *
 * Action policy:
 *   - Unused IMPORT → delete the import statement entirely.
 *   - Unused LOCAL variable → delete the declaration.
 *   - Unused FUNCTION PARAMETER in a function that is part of a public
 *     interface (interface method, abstract method, callback signature,
 *     React props handler, NestJS controller method) → prefix with `_`
 *     to preserve the signature.
 *   - Unused FUNCTION PARAMETER in a private/local function → delete it.
 *
 * Why a codemod and not just biome --apply:
 *   Biome's auto-fixer handles imports cleanly but is conservative on
 *   variables and parameters because of public-interface concerns.
 *   This codemod uses ts-morph to identify whether a function is part
 *   of an interface (in which case rename to `_param`) or local (in
 *   which case delete).
 *
 * Validation gate (caller's responsibility):
 *   After running, the caller MUST run:
 *     1. npm run typecheck (all workspaces)
 *     2. npm run test
 *     3. npm run ratchet:check
 *   If any fails, revert the codemod's commit and investigate.
 *
 * Status: SKELETON. Implementation gated on Phase 1 verification.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const skipLogPath = path.join(repoRoot, 'scripts/ops/codemods/.cleanup-unused-skipped.json');

function ensureTsMorphInstalled() {
  const probe = path.join(repoRoot, 'node_modules/ts-morph/package.json');
  if (!existsSync(probe)) {
    console.error('[cleanup-unused] ts-morph is not installed at the repo root.');
    console.error('[cleanup-unused] Run: npm install --save-dev ts-morph');
    process.exit(2);
  }
}

async function main() {
  ensureTsMorphInstalled();
  // Phase 2D implementation goes here. Steps:
  //   1. Load backend, frontend, worker tsconfigs into ts-morph projects.
  //   2. For each project, walk every source file:
  //      a. Find unused imports (compiler emit + manual heuristic for
  //         side-effect imports — never delete `import './styles.css'`).
  //      b. Find unused local variable declarations.
  //      c. Find unused function parameters.
  //      d. Apply policy: import → delete, local → delete, public
  //         param → rename `_<name>`, private param → delete.
  //   3. Save modified files.
  //   4. Print summary per workspace.
  console.error('[cleanup-unused] Skeleton only. Implementation gated on Phase 1 verification.');
  console.error(`[cleanup-unused] Skip log target: ${path.relative(repoRoot, skipLogPath)}`);
  process.exit(0);
}

main();
