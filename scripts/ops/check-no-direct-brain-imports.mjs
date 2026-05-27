#!/usr/bin/env node
// @ts-check
/**
 * check-no-direct-brain-imports.mjs
 *
 * Anti-regression gate for the brain-* legacy symbol boundary.
 *
 * Purpose:
 *   Forbid NEW direct imports of the six legacy `brain-*.service` symbols
 *   that are being dissolved into the canonical `kloel/mind/**` adapters
 *   per ADR-0013 (Kloel mind unification). Implements rows #12-#20 of
 *   `docs/architecture/DEPRECATION_MAP.md` as a runtime guard so the alias
 *   window can be retired safely.
 *
 * Background:
 *   The brain-*.service.ts modules in `backend/src/kloel/` are the *source*
 *   implementations and are kept alive only as deprecated aliases re-exported
 *   from `backend/src/kloel/mind/coordination/mind-*.service.ts`. Every NEW
 *   caller must reach the symbol through the canonical mind/ adapter, never
 *   via the legacy specifier. The gate is the only enforcement surface — the
 *   protected `backend/eslint.config.mjs` cannot host this rule.
 *
 * Allowed roots (any path starting with one of these may import brain-*
 * directly):
 *   - backend/src/kloel/brain-*.service.ts                    (source files)
 *   - backend/src/kloel/brain-*.service.spec.ts               (specs of the
 *                                                              source files)
 *   - backend/src/kloel/brain-*.<modifier>.spec.ts            (e.g.
 *                                                              brain-event-spine.diagnostics.spec.ts)
 *   - backend/src/kloel/mind/                                 (canonical
 *                                                              adapters that
 *                                                              re-export the
 *                                                              legacy symbols)
 *
 * The six brain-* symbols guarded by this gate (DEPRECATION_MAP rows
 * #12-#20):
 *   - brain-autonomy.service
 *   - brain-capability-executor.service
 *   - brain-capability-registry.service
 *   - brain-commercial-graph.service
 *   - brain-event-spine.service
 *   - brain-runtime.service
 *
 * Detection:
 *   Walks `backend/src` and `worker` for `*.ts` / `*.tsx` / `*.js` / `*.mjs`
 *   / `*.cjs` files, scans each line for
 *   `import ... from '...brain-<symbol>.service...'`,
 *   `export ... from '...brain-<symbol>.service...'`, and
 *   `require('...brain-<symbol>.service...')` patterns. Bare textual matches
 *   in logs, comments, identifiers, or JSDoc are ignored.
 *
 * Usage:
 *   node scripts/ops/check-no-direct-brain-imports.mjs            # soft mode (warns, exit 0)
 *   node scripts/ops/check-no-direct-brain-imports.mjs --strict   # fails on any offender
 *   node scripts/ops/check-no-direct-brain-imports.mjs --report   # verbose listing
 *
 * Exit codes:
 *   0 — OK (or soft mode with offenders)
 *   1 — strict mode: at least one offender detected
 *   2 — script error
 *
 * References:
 *   - docs/adr/0013-kloel-mind-unification.md
 *   - docs/architecture/DEPRECATION_MAP.md (rows #12-#20)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const STRICT = process.argv.includes('--strict');
const REPORT = process.argv.includes('--report');

const SCAN_DIRS = ['backend/src', 'worker'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.next']);
const SCAN_EXT = /\.[mc]?[tj]sx?$/;

/**
 * Six brain-* legacy symbols guarded by this gate. Listed in
 * `docs/architecture/DEPRECATION_MAP.md` rows #12-#20.
 */
const BRAIN_SYMBOLS = [
  'autonomy',
  'capability-executor',
  'capability-registry',
  'commercial-graph',
  'event-spine',
  'runtime',
];

/**
 * Allowlist of path prefixes (relative to repo root, POSIX-style) whose
 * files MAY import brain-*.service directly:
 *
 *   - the brain-*.service.ts source files themselves (and their spec
 *     siblings) — they are the implementation that the canonical mind/
 *     adapters re-export.
 *   - everything under backend/src/kloel/mind/ — the canonical adapters,
 *     which must reach into the legacy module to re-export it during the
 *     alias window.
 */
const ALLOWED_PREFIXES = ['backend/src/kloel/mind/'];

/**
 * Bare brain-*.service.ts / .spec.ts files at the top of backend/src/kloel/
 * are also allowed (the source files and their specs). We allow any file
 * whose basename matches `brain-<symbol>.<...>.ts(x?)` inside that exact
 * directory.
 */
const SOURCE_DIR = 'backend/src/kloel/';
const SOURCE_FILE_RE = new RegExp(
  `^brain-(?:${BRAIN_SYMBOLS.join('|')})(?:\\.[A-Za-z0-9_-]+)*\\.(?:m|c)?[tj]sx?$`,
);

/**
 * Whole-file matcher for
 *   `import ... from '...brain-<symbol>.service...'`,
 *   `export ... from '...brain-<symbol>.service...'`, or
 *   `require('...brain-<symbol>.service...')`.
 *
 * The capture group is the specifier; the surrounding form is matched
 * across newlines so multi-line imports are not missed. The token
 * boundary `\b` keeps unrelated identifiers from matching.
 */
const IMPORT_RE = new RegExp(
  `(?:\\bimport\\b[\\s\\S]*?\\bfrom\\s*|\\bimport\\s*|\\bexport\\s+(?:\\*|\\{[\\s\\S]*?\\})\\s+from\\s*|\\brequire\\s*\\()\\s*['"]([^'"]*\\bbrain-(?:${BRAIN_SYMBOLS.join('|')})\\.service\\b[^'"]*)['"]`,
  'g',
);

const TARGET_RE = new RegExp(`\\bbrain-(?:${BRAIN_SYMBOLS.join('|')})\\.service\\b`);

function out(line) {
  process.stdout.write(`${line}\n`);
}

function err(line) {
  process.stderr.write(`${line}\n`);
}

function readDirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'ENOTDIR')) {
      return null;
    }
    throw e;
  }
}

function statSafe(p) {
  try {
    return statSync(p);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES')) {
      return null;
    }
    throw e;
  }
}

function readFileSafe(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES')) {
      return null;
    }
    throw e;
  }
}

function walk(dir, acc) {
  const entries = readDirSafe(dir);
  if (entries === null) return acc;
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSafe(full);
    if (st === null) continue;
    if (st.isDirectory()) walk(full, acc);
    else if (SCAN_EXT.test(name)) acc.push(full);
  }
  return acc;
}

/**
 * Returns true if the given repo-relative path is under any allowed
 * prefix (mind/ adapters) OR if it is a brain-* source/spec file living
 * directly under backend/src/kloel/. Path is normalized to POSIX-style
 * separators first.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
function isAllowed(relPath) {
  const posix = sep === '/' ? relPath : relPath.split(sep).join('/');
  for (const prefix of ALLOWED_PREFIXES) {
    if (posix.startsWith(prefix)) return true;
  }
  // Allow brain-*.service.ts and brain-*.<modifier>.spec.ts that live at
  // the exact `backend/src/kloel/` directory level (no deeper).
  if (posix.startsWith(SOURCE_DIR)) {
    const tail = posix.slice(SOURCE_DIR.length);
    if (!tail.includes('/') && SOURCE_FILE_RE.test(tail)) return true;
  }
  return false;
}

/**
 * Scans a single source file's text and returns the list of offending
 * (lineNo, specifier) tuples. Only counts `import` / `export ... from` /
 * `require()` statements whose specifier matches one of the brain-*
 * symbol paths.
 *
 * Lines that carry an inline waiver comment `allowed-during-mind-unification`
 * (anywhere on the matched specifier's line, or on the line directly
 * above for multi-line imports) are skipped — that comment is the escape
 * hatch for legitimate transitional imports while ADR-0013 progresses.
 *
 * @param {string} src
 * @returns {Array<{ line: number, specifier: string }>}
 */
function scanFile(src) {
  /** @type {Array<{ line: number, specifier: string }>} */
  const offenders = [];
  // Cheap pre-filter so we never touch the heavy regex on files that
  // do not even mention any brain-* target.
  if (!TARGET_RE.test(src)) return offenders;

  IMPORT_RE.lastIndex = 0;
  let m;
  const allLines = src.split('\n');
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const specifier = m[1];
    // The match index points at the `import` / `require` keyword. The
    // offender line we want to report is the line that holds the
    // specifier itself (last line of the import statement).
    const upto = src.slice(0, m.index + m[0].length);
    const line = upto.split('\n').length;
    const specLine = allLines[line - 1] ?? '';
    const prevLine = line >= 2 ? (allLines[line - 2] ?? '') : '';
    if (
      specLine.includes('allowed-during-mind-unification') ||
      prevLine.includes('allowed-during-mind-unification')
    ) {
      continue;
    }
    offenders.push({ line, specifier });
  }
  return offenders;
}

function main() {
  /** @type {Array<{ file: string, line: number, specifier: string }>} */
  const offenders = [];

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), files);
  }

  let scanned = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (isAllowed(rel)) continue;
    const src = readFileSafe(file);
    if (src === null) continue;
    scanned += 1;
    const hits = scanFile(src);
    for (const h of hits) {
      offenders.push({ file: rel, line: h.line, specifier: h.specifier });
    }
  }

  // Per-file aggregation for clearer reporting.
  /** @type {Map<string, number>} */
  const byFile = new Map();
  for (const o of offenders) {
    byFile.set(o.file, (byFile.get(o.file) ?? 0) + 1);
  }

  if (REPORT) {
    out('');
    out(`[check-no-direct-brain-imports] scanned ${scanned} file(s) outside allowed roots`);
    out(`[check-no-direct-brain-imports] guarded brain-* symbols (DEPRECATION_MAP #12-#20):`);
    for (const s of BRAIN_SYMBOLS) out(`    • brain-${s}.service`);
    out(`[check-no-direct-brain-imports] allowed prefixes:`);
    for (const p of ALLOWED_PREFIXES) out(`    • ${p}`);
    out(`    • ${SOURCE_DIR}brain-<symbol>(.<modifier>)*.{ts,tsx,js,mjs,cjs}`);
    out(`[check-no-direct-brain-imports] direct brain-* imports outside boundary: ${offenders.length}`);
    out(`[check-no-direct-brain-imports] offending files: ${byFile.size}`);
    out('');
    for (const o of offenders) {
      out(`  • ${o.file}:${o.line}  ${o.specifier}`);
    }
    if (byFile.size > 0) {
      out('');
      out('  Summary by file:');
      const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
      for (const [file, count] of sorted) {
        out(`    ${count.toString().padStart(3)}  ${file}`);
      }
    }
    process.exitCode = STRICT && offenders.length ? 1 : 0;
    return;
  }

  if (offenders.length === 0) {
    out(
      `[check-no-direct-brain-imports] OK — 0 direct brain-* imports outside mind/ boundary (scanned ${scanned} file(s))`,
    );
    process.exitCode = 0;
    return;
  }

  if (STRICT) {
    err(
      `[check-no-direct-brain-imports] FAILED — ${offenders.length} direct brain-* import(s) outside mind/ boundary across ${byFile.size} file(s):`,
    );
    for (const o of offenders) {
      err(`  • ${o.file}:${o.line}  ${o.specifier}`);
    }
    err('');
    err('Fix options:');
    err(
      '  (a) Route the import through backend/src/kloel/mind/coordination/mind-*.service.ts (canonical adapter), OR',
    );
    err('  (b) Move the file into one of the allowed roots, OR');
    err(
      '  (c) Mark the line with `// allowed-during-mind-unification: <ADR-0013-M1>` if it is a legitimate transitional case.',
    );
    process.exitCode = 1;
    return;
  }

  // Soft mode: warn but pass.
  out(
    `[check-no-direct-brain-imports] WARN — ${offenders.length} direct brain-* import(s) outside mind/ boundary across ${byFile.size} file(s) (soft mode, exit 0):`,
  );
  for (const o of offenders) {
    out(`  • ${o.file}:${o.line}  ${o.specifier}`);
  }
  out('Run with --strict to fail on offenders.');
  process.exitCode = 0;
}

main();
