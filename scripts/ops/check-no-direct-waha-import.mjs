#!/usr/bin/env node
// @ts-check
/**
 * check-no-direct-waha-import.mjs
 *
 * Anti-regression gate for the WAHA provider boundary.
 *
 * Purpose:
 *   Forbid direct imports of WAHA provider symbols (`waha.provider`,
 *   `waha-transport`) from files OUTSIDE the canonical channel boundary.
 *   Implements the "Anti-regression Gates" recommended in
 *   `docs/architecture/DUPLICATION_REGISTER.md` and is the runtime guard
 *   that keeps the WhatsApp channel dissolution (ADR-0012 / Wave 3) honest.
 *
 * Background:
 *   During the dissolution of `backend/src/whatsapp/**` into the canonical
 *   `backend/src/marketing/channels/whatsapp/` boundary, the legacy paths
 *   must still be allowed to consume WAHA directly; but no NEW caller may
 *   reach across the channel boundary and import WAHA symbols by hand.
 *   Doing so re-creates the entanglement we are dissolving.
 *
 * Allowed roots (any path starting with one of these may import WAHA):
 *   - backend/src/whatsapp/                       (legacy, allowed during dissolution)
 *   - backend/src/marketing/channels/whatsapp/    (canonical destination)
 *
 * Detection:
 *   Walks `backend/src` and `worker` for `*.ts` / `*.tsx` files, scans each
 *   line for `import ... from '...waha.provider...'` or
 *   `import ... from '...waha-transport...'` patterns. Bare matches of the
 *   string in non-import contexts (logs, comments, identifiers) are
 *   ignored.
 *
 * Usage:
 *   node scripts/ops/check-no-direct-waha-import.mjs            # soft mode (warns, exit 0)
 *   node scripts/ops/check-no-direct-waha-import.mjs --strict   # fails on any offender
 *   node scripts/ops/check-no-direct-waha-import.mjs --report   # verbose listing
 *
 * Exit codes:
 *   0 — OK (or soft mode with offenders)
 *   1 — strict mode: at least one offender detected
 *   2 — script error
 *
 * References:
 *   - docs/architecture/DUPLICATION_REGISTER.md
 *   - docs/architecture/CHANNEL_DISPATCH_CANONICAL.md
 *   - docs/architecture/CONNECT_CHANNEL_CANONICAL.md
 *   - docs/adr/0012-* (channel dissolution, Wave 3)
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
 * Allowlist of path prefixes (relative to repo root, POSIX-style) whose
 * files MAY import waha.provider / waha-transport directly.
 */
const ALLOWED_PREFIXES = [
  'backend/src/whatsapp/',
  'backend/src/marketing/channels/whatsapp/',
];

/**
 * Whole-file matcher for `import ... from '...waha.provider...'` /
 * `import ... from '...waha-transport...'` / `require('...waha.provider...')`
 * / `export ... from '...waha.provider...'`.
 *
 * The capture group is the specifier; the surrounding form is matched
 * across newlines so multi-line imports are not missed. The token
 * boundary `\b` keeps `waha.providers-meta` / `waha-transports` from
 * matching.
 */
const IMPORT_RE =
  /(?:\bimport\b[\s\S]*?\bfrom\s*|\bimport\s*|\bexport\s+(?:\*|\{[\s\S]*?\})\s+from\s*|\brequire\s*\()\s*['"]([^'"]*\bwaha(?:\.provider|-transport)\b[^'"]*)['"]/g;

const TARGET_RE = /\bwaha(?:\.provider|-transport)\b/;

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
 * prefix. Path is normalized to POSIX-style separators first.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
function isAllowed(relPath) {
  const posix = sep === '/' ? relPath : relPath.split(sep).join('/');
  for (const prefix of ALLOWED_PREFIXES) {
    if (posix.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Scans a single source file's text and returns the list of offending
 * (lineNo, specifier) tuples. Only counts `import` / `export ... from` /
 * `require()` statements whose specifier matches the WAHA target.
 *
 * Lines that carry an inline waiver comment `allowed-during-dissolution`
 * (anywhere on the matched specifier's line) are skipped — that comment
 * is the escape hatch for legitimate transitional imports while ADR-0012
 * Wave 3 progresses.
 *
 * @param {string} src
 * @returns {Array<{ line: number, specifier: string }>}
 */
function scanFile(src) {
  /** @type {Array<{ line: number, specifier: string }>} */
  const offenders = [];
  // Cheap pre-filter so we never touch the heavy regex on files that
  // do not even mention WAHA.
  if (!TARGET_RE.test(src)) return offenders;

  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const specifier = m[1];
    // The match index points at the `import` / `require` keyword. The
    // offender line we want to report is the line that holds the
    // specifier itself (last line of the import statement).
    const upto = src.slice(0, m.index + m[0].length);
    const line = upto.split('\n').length;
    // Allow waiver: dissolution marker on the specifier line OR on the
    // line directly above (so devs can write the waiver as a comment on
    // top of a multi-line import block).
    const allLines = src.split('\n');
    const specLine = allLines[line - 1] ?? '';
    const prevLine = line >= 2 ? (allLines[line - 2] ?? '') : '';
    if (
      specLine.includes('allowed-during-dissolution') ||
      prevLine.includes('allowed-during-dissolution')
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

  if (REPORT) {
    out('');
    out(`[check-no-direct-waha-import] scanned ${scanned} file(s) outside allowed roots`);
    out(`[check-no-direct-waha-import] allowed prefixes:`);
    for (const p of ALLOWED_PREFIXES) out(`    • ${p}`);
    out(`[check-no-direct-waha-import] direct WAHA imports outside boundary: ${offenders.length}`);
    out('');
    for (const o of offenders) {
      out(`  • ${o.file}:${o.line}  ${o.specifier}`);
    }
    process.exitCode = STRICT && offenders.length ? 1 : 0;
    return;
  }

  if (offenders.length === 0) {
    out(`[check-no-direct-waha-import] OK — 0 direct WAHA imports outside channel boundary (scanned ${scanned} file(s))`);
    process.exitCode = 0;
    return;
  }

  if (STRICT) {
    err(`[check-no-direct-waha-import] FAILED — ${offenders.length} direct WAHA import(s) outside channel boundary:`);
    for (const o of offenders) {
      err(`  • ${o.file}:${o.line}  ${o.specifier}`);
    }
    err('');
    err('Fix options:');
    err('  (a) Route the import through backend/src/marketing/channels/whatsapp/ (canonical), OR');
    err('  (b) Move the file into one of the allowed roots, OR');
    err('  (c) Mark the line with `// allowed-during-dissolution: <ADR-0012-W3>` if it is a legitimate transitional case.');
    process.exitCode = 1;
    return;
  }

  // Soft mode: warn but pass.
  out(`[check-no-direct-waha-import] WARN — ${offenders.length} direct WAHA import(s) outside channel boundary (soft mode, exit 0):`);
  for (const o of offenders) {
    out(`  • ${o.file}:${o.line}  ${o.specifier}`);
  }
  out('Run with --strict to fail on offenders.');
  process.exitCode = 0;
}

main();
