#!/usr/bin/env node
/**
 * scripts/ops/codemods/remove-prisma-dynamic.mjs
 *
 * Phase 2C of the Codacy convergence plan.
 * See /Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md
 *
 * Removes the `PrismaDynamic` type alias and the `prismaAny` accessor
 * across the backend codebase. Replaces every `this.prismaAny.<model>.<method>(args)`
 * call site with a typed `this.prisma.<model>.<method>(args)` call.
 *
 * Phase 0 inventory: 16 backend files, 128 `prismaAny` usage sites.
 * 5 files declare `type PrismaDynamic` aliases:
 *   - backend/src/checkout/checkout-webhook.controller.ts
 *   - backend/src/kloel/leads.service.ts
 *   - backend/src/kloel/wallet.service.ts
 *   - backend/src/kloel/asaas.service.ts
 *   - backend/src/whatsapp/account-agent.service.ts
 *
 * The other 11 files just consume `this.prismaAny.X` without declaring
 * the alias.
 *
 * Why this is risky:
 *   `prismaAny: any` lets calls compile even when the call shape is
 *   incompatible with the real Prisma client types. Removing the
 *   `any` makes typecheck fail on every call site that's ACTUALLY wrong
 *   — and many will be, because the alias was specifically introduced
 *   to bypass type-strict on legacy code paths. CLAUDE.md documents
 *   this as ongoing migration debt.
 *
 * Mitigation:
 *   - Per-file dry run + typecheck. If a file fails after transform,
 *     `git restore` it and append to .prisma-dynamic-failures.json so
 *     Phase 3 (Ralph Loop) can pick it up for manual file-by-file
 *     refactor.
 *   - Sensitive paths (auth/, billing/, checkout/, partnerships/,
 *     affiliate/, webhooks/, kloel/wallet*, prisma/) are processed in
 *     a separate pass and routed through PR with auto-merge instead
 *     of direct push.
 *
 * Validation gate (caller's responsibility):
 *   For each file the transform succeeds on:
 *     1. npm --prefix backend run typecheck
 *     2. npm --prefix backend test -- --testPathPattern=<related>
 *     3. npm run ratchet:check
 *   If any step fails, `git restore <file>` and add to skip log.
 *
 * Status: SKELETON. Implementation gated on Phase 1 verification.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const failuresLogPath = path.join(repoRoot, 'scripts/ops/codemods/.prisma-dynamic-failures.json');

const SENSITIVE_PATH_PREFIXES = [
  'backend/src/auth/',
  'backend/src/billing/',
  'backend/src/checkout/',
  'backend/src/partnerships/',
  'backend/src/affiliate/',
  'backend/src/webhooks/',
  'backend/src/kloel/wallet',
  'backend/prisma/',
];

function isSensitive(relPath) {
  return SENSITIVE_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function ensureTsMorphInstalled() {
  const probe = path.join(repoRoot, 'node_modules/ts-morph/package.json');
  if (!existsSync(probe)) {
    console.error('[remove-prisma-dynamic] ts-morph is not installed at the repo root.');
    console.error('[remove-prisma-dynamic] Run: npm install --save-dev ts-morph');
    console.error('[remove-prisma-dynamic] Then re-run this codemod.');
    process.exit(2);
  }
}

async function main() {
  ensureTsMorphInstalled();
  // Phase 2C implementation goes here. Steps:
  //   1. Use ts-morph to load the backend tsconfig.
  //   2. Find every source file with `prismaAny` references.
  //   3. For each non-sensitive file:
  //      a. Find the `type PrismaDynamic` alias if present and delete it.
  //      b. Find every `this.prismaAny.<model>` usage.
  //      c. Rewrite to `this.prisma.<model>` (Prisma model names match).
  //      d. Save the file.
  //      e. Spawn `npm --prefix backend run typecheck` filtered to that file.
  //      f. If typecheck fails: revert via ts-morph (undo edits in memory)
  //         and append to `.prisma-dynamic-failures.json` with the error.
  //      g. If typecheck succeeds: leave saved.
  //   4. For each sensitive file: same as above but write to a side branch
  //      and skip the in-place save (caller will create PR).
  //   5. Print summary: success count, failure count, sensitive count.
  console.error(
    '[remove-prisma-dynamic] Skeleton only. Implementation gated on Phase 1 verification.',
  );
  console.error(
    `[remove-prisma-dynamic] Sensitive prefixes: ${SENSITIVE_PATH_PREFIXES.join(', ')}`,
  );
  console.error(
    `[remove-prisma-dynamic] Failure log target: ${path.relative(repoRoot, failuresLogPath)}`,
  );
  process.exit(0);
}

main();
