#!/usr/bin/env node
// Cross-boundary utility duplication drift gate.
//
// KLOEL's backend (NestJS) and worker (BullMQ) are separate deploy units that
// intentionally do NOT import each other at runtime (see Wave 2A finding +
// docs/adr/0001-whatsapp-source-of-truth.md). Nine utility symbols are
// duplicated across them. This gate enforces Option B from
// docs/architecture/CROSS_BOUNDARY_UTILS_DECISION.md: parallel implementations
// are tolerated, but they MUST NOT silently drift further.
//
// For each pair we:
//   1. Locate both source files.
//   2. Extract the named export (function body or class declaration).
//   3. Normalize: strip JSDoc, strip line comments, collapse whitespace,
//      strip common TypeScript inference shims (e.g. `as Iterable<T>`).
//   4. Compute a similarity score in [0, 1].
//
// Modes:
//   (default)  soft — warn when drift > tolerance, exit 0.
//   --strict   fail when drift > tolerance, exit 1.
//
// Exit codes:
//   0  — all pairs within tolerance (soft mode always exits 0 unless I/O fails).
//   1  — at least one pair exceeded tolerance in strict mode.
//   2  — I/O / parse error.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { locateExport, extractDeclaration, normalize, similarity } from "./cross-boundary-utils-drift.helpers.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');

// Tolerance: pairs scoring above this similarity (0..1) are considered "no
// meaningful drift". Pairs scoring at-or-below are flagged. Most byte-identical
// pairs score 1.0; minor cast/error-string differences typically land 0.85-0.99.
const TOLERANCE = 0.85;

/**
 * @typedef {Object} PairSpec
 * @property {string} name        symbol exported from both files
 * @property {'function'|'class'} kind
 * @property {string} backend     path relative to ROOT
 * @property {string} worker      path relative to ROOT
 * @property {boolean} [knownDivergent]  pair documented as already-divergent in §2 of the decision doc
 * @property {number}  [floor]    per-pair similarity floor for knownDivergent pairs. The pair must
 *                                 stay AT OR ABOVE this score; the gate flags regression (further
 *                                 drift), not the existing documented divergence. Choose the floor
 *                                 ~0.02 below the current observed score to absorb safe edits.
 */

/** @type {PairSpec[]} */
const PAIRS = [
  {
    name: 'forEachSequential',
    kind: 'function',
    backend: 'backend/src/common/async-sequence.ts',
    worker: 'worker/utils/async-sequence.ts',
  },
  {
    name: 'findFirstSequential',
    kind: 'function',
    backend: 'backend/src/common/async-sequence.ts',
    worker: 'worker/utils/async-sequence.ts',
  },
  {
    name: 'pollUntil',
    kind: 'function',
    backend: 'backend/src/common/async-sequence.ts',
    worker: 'worker/utils/async-sequence.ts',
  },
  {
    name: 'resolveRedisUrl',
    kind: 'function',
    backend: 'backend/src/common/redis/resolve-redis-url.ts',
    worker: 'worker/resolve-redis-url.ts',
  },
  {
    name: 'safeResolve',
    kind: 'function',
    backend: 'backend/src/common/safe-path.ts',
    worker: 'worker/safe-path.ts',
    knownDivergent: true,
    floor: 0.8,
  },
  {
    name: 'renderTemplate',
    kind: 'function',
    backend: 'backend/src/common/sales-templates.ts',
    worker: 'worker/constants/sales-templates.ts',
  },
  {
    name: 'toPrismaJsonValue',
    kind: 'function',
    backend: 'backend/src/common/prisma/prisma-json.util.ts',
    worker: 'worker/utils/prisma-json.util.ts',
    knownDivergent: true,
    floor: 0.85,
  },
  {
    name: 'maskRedisUrl',
    kind: 'function',
    backend: 'backend/src/common/redis/resolve-redis-url.ts',
    worker: 'worker/resolve-redis-url.ts',
  },
  {
    name: 'RedisConfigurationError',
    kind: 'class',
    backend: 'backend/src/common/redis/resolve-redis-url.ts',
    worker: 'worker/resolve-redis-url.ts',
  },
  // --- Canonicalization row #39 (ADR-0012 OmniCore) ---
  // backend/src/common/phone/phone-normalization.util.ts is the source of truth
  // (per DEPRECATION_MAP.md row #39); worker/utils/phone-normalization.util.ts
  // is a deliberate byte-identical mirror so the worker — which can not import
  // from the backend at runtime — runs through the same validator. All four
  // canonical exports are tracked here so any future edit to one side without
  // a parallel edit to the other trips the gate.
  {
    name: 'extractAsciiDigits',
    kind: 'function',
    backend: 'backend/src/common/phone/phone-normalization.util.ts',
    worker: 'worker/utils/phone-normalization.util.ts',
  },
  {
    name: 'normalizePhone',
    kind: 'function',
    backend: 'backend/src/common/phone/phone-normalization.util.ts',
    worker: 'worker/utils/phone-normalization.util.ts',
  },
  {
    name: 'extractPhoneFromChatId',
    kind: 'function',
    backend: 'backend/src/common/phone/phone-normalization.util.ts',
    worker: 'worker/utils/phone-normalization.util.ts',
  },
  {
    name: 'phonesMatch',
    kind: 'function',
    backend: 'backend/src/common/phone/phone-normalization.util.ts',
    worker: 'worker/utils/phone-normalization.util.ts',
  },
];


const report = [];
let driftCount = 0;
let ioErrors = 0;

for (const pair of PAIRS) {
  const bp = join(ROOT, pair.backend);
  const wp = join(ROOT, pair.worker);
  if (!existsSync(bp)) {
    report.push({ pair, status: 'MISSING_BACKEND', score: null });
    ioErrors++;
    continue;
  }
  if (!existsSync(wp)) {
    report.push({ pair, status: 'MISSING_WORKER', score: null });
    ioErrors++;
    continue;
  }
  const bs = readFileSync(bp, 'utf8');
  const ws = readFileSync(wp, 'utf8');
  const bLoc = locateExport(bs, pair.name, pair.kind);
  const wLoc = locateExport(ws, pair.name, pair.kind);
  if (!bLoc) {
    report.push({ pair, status: 'EXPORT_NOT_FOUND_BACKEND', score: null });
    ioErrors++;
    continue;
  }
  if (!wLoc) {
    report.push({ pair, status: 'EXPORT_NOT_FOUND_WORKER', score: null });
    ioErrors++;
    continue;
  }
  const bDecl = extractDeclaration(bs, bLoc.start);
  const wDecl = extractDeclaration(ws, wLoc.start);
  if (!bDecl || !wDecl) {
    report.push({ pair, status: 'PARSE_ERROR', score: null });
    ioErrors++;
    continue;
  }
  const bN = normalize(bDecl);
  const wN = normalize(wDecl);
  const score = similarity(bN, wN);
  // Per-pair threshold: knownDivergent pairs use their documented floor (must
  // not regress further); everything else uses the global TOLERANCE.
  const threshold = pair.knownDivergent && typeof pair.floor === 'number' ? pair.floor : TOLERANCE;
  const drifted = score < threshold;
  if (drifted) driftCount++;
  let status;
  if (drifted) {
    status = pair.knownDivergent ? 'REGRESSION' : 'DRIFT';
  } else if (score === 1) {
    status = 'IDENTICAL';
  } else if (pair.knownDivergent) {
    status = 'KNOWN_DIVERGENT';
  } else {
    status = 'WITHIN_TOLERANCE';
  }
  report.push({ pair, status, score, threshold });
}

// ────────────────────────────────────────────────────────────────────────────
// Output
// ────────────────────────────────────────────────────────────────────────────
const header = STRICT ? 'cross-boundary-utils-drift (strict)' : 'cross-boundary-utils-drift';
console.log(`# ${header}`);
console.log(`# Tolerance: similarity >= ${TOLERANCE.toFixed(2)} = no drift.`);
console.log('');
for (const row of report) {
  const score = row.score === null ? '----' : row.score.toFixed(3);
  const tag = `[${row.status}]`.padEnd(22, ' ');
  const floorNote =
    row.pair.knownDivergent && typeof row.pair.floor === 'number'
      ? ` (floor ${row.pair.floor.toFixed(2)})`
      : '';
  const known = row.pair.knownDivergent ? ` knownDivergent${floorNote}` : '';
  console.log(`${tag} ${score}  ${row.pair.name}${known}`);
  console.log(`                       backend: ${row.pair.backend}`);
  console.log(`                       worker:  ${row.pair.worker}`);
}
console.log('');
if (ioErrors > 0) {
  console.error(`I/O or parse errors: ${ioErrors}. See report above.`);
  process.exit(2);
}
if (driftCount > 0) {
  console.log(
    `${driftCount} pair(s) outside tolerance. See docs/architecture/CROSS_BOUNDARY_UTILS_DECISION.md for context.`,
  );
  if (STRICT) {
    console.error('--strict: refusing to pass.');
    process.exit(1);
  }
  console.log('(soft mode — would fail under --strict)');
  process.exit(0);
}
console.log(`OK — all ${PAIRS.length} cross-boundary util pairs within tolerance.`);
process.exit(0);
