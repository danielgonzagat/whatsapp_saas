#!/usr/bin/env node
/**
 * KLOEL Cognitive Participation Scanner — Contract Spec
 *
 * Self-executing spec (Node `node:assert` strict). Validates:
 *   1. The scanner runs end-to-end without throwing.
 *   2. Returns a summary with the required shape & invariants.
 *   3. Tag bookkeeping is internally consistent (DEAD ⊕ participating == total).
 *   4. Per-workspace breakdown sums to the global total.
 *   5. Every emitter file in a known-canonical short-list is detected.
 *   6. PILLAR files all live under the canonical mind/ folders.
 *
 * This spec is intentionally non-Jest — `scripts/` lives outside the per-package
 * jest projects (backend/frontend/worker). The matching repo convention is the
 * self-executing `*.spec.mjs` shape used by `scripts/cognitive/asyncapi-contract.spec.mjs`
 * and `scripts/pci/divergence-scan.spec.mjs`.
 *
 * Run:  node scripts/cognitive-participation.spec.mjs
 */

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scan } from './cognitive-participation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { files, summary } = scan();

// ---------------------------------------------------------------------------
// Shape invariants
// ---------------------------------------------------------------------------

assert.ok(Array.isArray(files), 'files must be an array');
assert.ok(files.length > 0, 'scanner must find at least one source file');

assert.equal(typeof summary.total, 'number', 'summary.total must be a number');
assert.equal(
  typeof summary.participating,
  'number',
  'summary.participating must be a number',
);
assert.equal(typeof summary.deadCount, 'number', 'summary.deadCount must be a number');
assert.equal(
  typeof summary.participatingPct,
  'number',
  'summary.participatingPct must be a number',
);

for (const tag of ['EMITTER', 'MIND_CONSUMER', 'PILLAR', 'OBSERVED', 'DEAD']) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(summary.tagCounts, tag),
    `summary.tagCounts.${tag} must exist`,
  );
  assert.equal(
    typeof summary.tagCounts[tag],
    'number',
    `summary.tagCounts.${tag} must be a number`,
  );
}

// ---------------------------------------------------------------------------
// Arithmetic invariants
// ---------------------------------------------------------------------------

assert.equal(
  summary.total,
  files.length,
  'summary.total must equal files.length',
);
assert.equal(
  summary.participating + summary.deadCount,
  summary.total,
  'participating + dead must equal total (a file is either dead or participating)',
);
assert.equal(
  summary.deadCount,
  summary.tagCounts.DEAD,
  'summary.deadCount must mirror summary.tagCounts.DEAD',
);

const pctActual = summary.total > 0 ? (summary.participating / summary.total) * 100 : 0;
assert.ok(
  Math.abs(summary.participatingPct - Number(pctActual.toFixed(2))) < 0.01,
  `participatingPct should round to ${pctActual.toFixed(2)} (got ${summary.participatingPct})`,
);

// ---------------------------------------------------------------------------
// Per-workspace consistency
// ---------------------------------------------------------------------------

const wsTotal = Object.values(summary.byWorkspace).reduce(
  (acc, bucket) => acc + bucket.total,
  0,
);
assert.equal(
  wsTotal,
  summary.total,
  'sum of per-workspace totals must equal summary.total',
);

for (const [name, bucket] of Object.entries(summary.byWorkspace)) {
  assert.equal(
    bucket.participating + bucket.tags.DEAD,
    bucket.total,
    `workspace ${name}: participating + DEAD must equal total`,
  );
  for (const tag of ['EMITTER', 'MIND_CONSUMER', 'PILLAR', 'OBSERVED', 'DEAD']) {
    assert.ok(
      bucket.tags[tag] <= bucket.total,
      `workspace ${name}: tag ${tag} cannot exceed total`,
    );
  }
}

// ---------------------------------------------------------------------------
// File-level tag invariants
// ---------------------------------------------------------------------------

for (const f of files) {
  assert.ok(f.tags instanceof Set, `file ${f.path}: tags must be a Set`);
  assert.ok(f.tags.size > 0, `file ${f.path}: must carry at least one tag`);
  if (f.tags.has('DEAD')) {
    assert.equal(
      f.tags.size,
      1,
      `file ${f.path}: DEAD must be exclusive (got ${[...f.tags].join(',')})`,
    );
  }
  if (f.tags.has('OBSERVED')) {
    assert.ok(
      f.tags.has('EMITTER'),
      `file ${f.path}: OBSERVED implies EMITTER`,
    );
  }
}

// ---------------------------------------------------------------------------
// PILLAR files live under the canonical folders only
// ---------------------------------------------------------------------------

const pillarFiles = files.filter((f) => f.tags.has('PILLAR'));
assert.ok(
  pillarFiles.length > 0,
  'expected at least one PILLAR file under backend/src/{kloel,admin}/mind/',
);
for (const f of pillarFiles) {
  const absLike = `${sep}${f.path.split('/').join(sep)}`;
  const insideKloelMind = absLike.includes(`${sep}backend${sep}src${sep}kloel${sep}mind${sep}`);
  const insideAdminMind = absLike.includes(`${sep}backend${sep}src${sep}admin${sep}mind${sep}`);
  assert.ok(
    insideKloelMind || insideAdminMind,
    `PILLAR file outside canonical mind/ folder: ${f.path}`,
  );
}

// ---------------------------------------------------------------------------
// Known-canonical emitter sites must be detected
// ---------------------------------------------------------------------------

const KNOWN_EMITTERS = [
  'backend/src/kloel/mind/consciousness/mind-consciousness.service.ts',
  'backend/src/kloel/kloel-thinker.abi.helpers.ts',
];

for (const expected of KNOWN_EMITTERS) {
  const absoluteExists = existsSync(resolve(ROOT, expected));
  if (!absoluteExists) {
    // Tolerate file renames during canonicalization — only assert when the
    // file is still present at the canonical path.
    continue;
  }
  const hit = files.find((f) => f.path === expected);
  assert.ok(hit, `expected scanner to enumerate canonical emitter file ${expected}`);
  assert.ok(
    hit.tags.has('EMITTER'),
    `expected ${expected} to be tagged EMITTER (got ${[...hit.tags].join(',')})`,
  );
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

process.stderr.write(
  `PASS cognitive-participation: scanned ${summary.total} files, ${summary.participating} participating (${summary.participatingPct}%), ${summary.deadCount} dead — invariants hold\n`,
);
