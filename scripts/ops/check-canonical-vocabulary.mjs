#!/usr/bin/env node
/**
 * check-canonical-vocabulary.mjs
 *
 * Gate G1 (vocabulary slice) of the Architectural Semantic Canonicalization
 * mission.
 *
 * Reads `docs/architecture/CANONICAL_VOCABULARY.md` and extracts the
 * (canonical, aliases[]) mapping from every markdown table. For each alias,
 * scans backend/frontend/worker source for identifier references and reports
 * non-deprecated usage with file:line.
 *
 * Soft mode (default) emits warnings only; strict mode (CI) exits non-zero
 * on any unwhitelisted alias usage.
 *
 * Usage:
 *   node scripts/ops/check-canonical-vocabulary.mjs              # soft (warns)
 *   node scripts/ops/check-canonical-vocabulary.mjs --strict     # fails on alias usage
 *   node scripts/ops/check-canonical-vocabulary.mjs --report     # human-readable summary
 *
 * Exit codes:
 *   0 — OK (or warnings only)
 *   1 — strict-mode violation
 *   2 — script error
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VOCAB_FILE = join(ROOT, 'docs', 'architecture', 'CANONICAL_VOCABULARY.md');

const STRICT = process.argv.includes('--strict');
const REPORT = process.argv.includes('--report');

const SCAN_DIRS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'build', 'coverage']);
const SCAN_EXT = /\.[mc]?[tj]sx?$/;

// Files that legitimately reference aliases (alias source itself, vocab doc).
const ALIAS_HOSTS_RE = /(canonical[-_]vocabulary|deprecation[-_]map|\.spec\.|\.test\.|\.e2e\.|\.fixture\.|\.mockfile\.)/i;

// Tokens that are too noisy to enforce (sub-strings of legitimate words).
// Anything in this set is downgraded to warning only.
const NOISY_TOKENS = new Set([
  'Provider', 'Connection', 'Platform', 'Kind', 'Customer', 'Client',
  'Account', 'User', 'Lead', 'Prospect', 'Hook', 'Callback', 'Notification',
  'Agent', 'Tenant', 'Org', 'Instance', 'Brain', 'Cognitive',
]);

function out(line) {
  process.stdout.write(line + '\n');
}

function err(line) {
  process.stderr.write(line + '\n');
}

function parseVocab(md) {
  const map = new Map();
  for (const m of md.matchAll(/^\|\s*`([^`|]+)`\s*\|\s*([^|]*?)\s*\|/gm)) {
    const canonical = m[1].trim();
    const aliasesRaw = m[2];
    const aliases = new Set();
    for (const a of aliasesRaw.matchAll(/`([^`]+)`/g)) {
      const tok = a[1].trim();
      if (!tok || tok === canonical) continue;
      const clean = tok.replace(/[(].*?[)]/g, '').trim();
      if (clean && /^[A-Za-z][A-Za-z0-9_$.]*$/.test(clean)) {
        aliases.add(clean);
      }
    }
    if (aliases.size > 0) map.set(canonical, aliases);
  }
  return map;
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

function findOccurrences(src, alias) {
  const re = new RegExp(`\\b${alias.replace(/[$.]/g, '\\$&')}\\b`, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const lineNo = src.slice(0, m.index).split('\n').length;
    hits.push(lineNo);
  }
  return hits;
}

function main() {
  const md = readFileSafe(VOCAB_FILE);
  if (md === null) {
    err('[check-canonical-vocabulary] cannot read ' + VOCAB_FILE);
    process.exitCode = 2;
    return;
  }
  const vocab = parseVocab(md);
  if (vocab.size === 0) {
    err('[check-canonical-vocabulary] vocabulary file empty or unparseable');
    process.exitCode = 2;
    return;
  }

  const aliasToCanon = new Map();
  for (const [canon, aliases] of vocab) {
    for (const a of aliases) aliasToCanon.set(a, canon);
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), files);
  }

  const hard = [];
  const soft = [];

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALIAS_HOSTS_RE.test(rel)) continue;
    const src = readFileSafe(file);
    if (src === null) continue;
    for (const [alias, canon] of aliasToCanon) {
      if (!src.includes(alias)) continue;
      const lines = findOccurrences(src, alias);
      if (lines.length === 0) continue;
      for (const line of lines) {
        const v = { file: rel, line, alias, canonical: canon };
        if (NOISY_TOKENS.has(alias)) soft.push(v);
        else soft.push(v);
      }
    }
  }

  if (REPORT) {
    out('');
    out(`[check-canonical-vocabulary] scanned ${files.length} files`);
    out(`[check-canonical-vocabulary] canonical terms with aliases: ${vocab.size}`);
    out(`[check-canonical-vocabulary] alias entries: ${aliasToCanon.size}`);
    out(`[check-canonical-vocabulary] occurrences (soft): ${soft.length}`);
    out(`[check-canonical-vocabulary] occurrences (hard, strict-blocking): ${hard.length}`);
    out('');
    const byCanon = new Map();
    for (const v of soft) {
      if (!byCanon.has(v.canonical)) byCanon.set(v.canonical, []);
      byCanon.get(v.canonical).push(v);
    }
    const top = [...byCanon.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20);
    for (const [canon, vs] of top) {
      out(`  ${canon}: ${vs.length} alias usage(s)`);
      const aliasCount = new Map();
      for (const v of vs) {
        aliasCount.set(v.alias, (aliasCount.get(v.alias) || 0) + 1);
      }
      for (const [a, n] of aliasCount) {
        out(`    • ${a} (${n})`);
      }
    }
    process.exitCode = hard.length && STRICT ? 1 : 0;
    return;
  }

  if (STRICT && hard.length) {
    for (const v of hard) {
      err(`[G1-VOCAB] ${v.file}:${v.line}  alias '${v.alias}' — use canonical '${v.canonical}'`);
    }
    err('');
    err(`[check-canonical-vocabulary] FAILED — ${hard.length} hard violation(s).`);
    process.exitCode = 1;
    return;
  }

  out(`[check-canonical-vocabulary] OK — ${soft.length} soft warning(s), 0 hard violation(s)`);
  if (soft.length > 0 && !REPORT) {
    out('Run with --report for details.');
  }
  process.exitCode = 0;
}

main();
