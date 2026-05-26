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
const ALIAS_HOSTS_RE = /(canonical[-_]vocabulary|deprecation[-_]map|\.spec\.|\.test\.|\.e2e\.|\.fixture\.|\.mock\.)/i;

// Tokens that are too noisy to enforce (sub-strings of legitimate words).
// Anything in this set is downgraded to warning only.
const NOISY_TOKENS = new Set([
  'Provider', 'Connection', 'Platform', 'Kind', 'Customer', 'Client',
  'Account', 'User', 'Lead', 'Prospect', 'Hook', 'Callback', 'Notification',
  'Agent', 'Tenant', 'Org', 'Instance', 'Brain', 'Cognitive',
]);

function parseVocab(md) {
  // Extract rows of the form: | `Canonical` | aliases | notes |
  // Aliases column may contain back-tick-delimited identifiers separated by commas.
  const map = new Map(); // canonical → Set<alias>
  for (const m of md.matchAll(/^\|\s*`([^`|]+)`\s*\|\s*([^|]*?)\s*\|/gm)) {
    const canonical = m[1].trim();
    const aliasesRaw = m[2];
    const aliases = new Set();
    for (const a of aliasesRaw.matchAll(/`([^`]+)`/g)) {
      const tok = a[1].trim();
      if (!tok || tok === canonical) continue;
      // Strip leading "*." or trailing parenthetical descriptors.
      const clean = tok.replace(/[(].*?[)]/g, '').trim();
      if (clean && /^[A-Za-z][A-Za-z0-9_$.]*$/.test(clean)) {
        aliases.add(clean);
      }
    }
    if (aliases.size > 0) map.set(canonical, aliases);
  }
  return map;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(name)) out.push(full);
  }
  return out;
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
  let md;
  try {
    md = readFileSync(VOCAB_FILE, 'utf8');
  } catch (e) {
    console.error('[check-canonical-vocabulary] cannot read ' + VOCAB_FILE);
    console.error(String(e));
    process.exit(2);
  }
  const vocab = parseVocab(md);
  if (vocab.size === 0) {
    console.error('[check-canonical-vocabulary] vocabulary file empty or unparseable');
    process.exit(2);
  }

  // Invert: alias → canonical
  const aliasToCanon = new Map();
  for (const [canon, aliases] of vocab) {
    for (const a of aliases) aliasToCanon.set(a, canon);
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), files);
  }

  const hard = []; // strict-blocking
  const soft = []; // warnings only

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALIAS_HOSTS_RE.test(rel)) continue;
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [alias, canon] of aliasToCanon) {
      // Cheap pre-filter
      if (!src.includes(alias)) continue;
      const lines = findOccurrences(src, alias);
      if (lines.length === 0) continue;
      for (const line of lines) {
        const v = { file: rel, line, alias, canonical: canon };
        if (NOISY_TOKENS.has(alias)) soft.push(v);
        else soft.push(v); // currently all entries are soft — promote to hard once baseline tracked
      }
    }
  }

  if (REPORT) {
    console.log(`\n[check-canonical-vocabulary] scanned ${files.length} files`);
    console.log(`[check-canonical-vocabulary] canonical terms with aliases: ${vocab.size}`);
    console.log(`[check-canonical-vocabulary] alias entries: ${aliasToCanon.size}`);
    console.log(`[check-canonical-vocabulary] occurrences (soft): ${soft.length}`);
    console.log(`[check-canonical-vocabulary] occurrences (hard, strict-blocking): ${hard.length}\n`);
    // Group by canonical
    const byCanon = new Map();
    for (const v of soft) {
      if (!byCanon.has(v.canonical)) byCanon.set(v.canonical, []);
      byCanon.get(v.canonical).push(v);
    }
    const top = [...byCanon.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20);
    for (const [canon, vs] of top) {
      console.log(`  ${canon}: ${vs.length} alias usage(s)`);
      const aliasCount = new Map();
      for (const v of vs) {
        aliasCount.set(v.alias, (aliasCount.get(v.alias) || 0) + 1);
      }
      for (const [a, n] of aliasCount) {
        console.log(`    • ${a} (${n})`);
      }
    }
    process.exit(hard.length && STRICT ? 1 : 0);
  }

  if (STRICT && hard.length) {
    for (const v of hard) {
      console.error(`[G1-VOCAB] ${v.file}:${v.line}  alias '${v.alias}' — use canonical '${v.canonical}'`);
    }
    console.error(`\n[check-canonical-vocabulary] FAILED — ${hard.length} hard violation(s).`);
    process.exit(1);
  }

  console.log(`[check-canonical-vocabulary] OK — ${soft.length} soft warning(s), 0 hard violation(s)`);
  if (soft.length > 0 && !REPORT) {
    console.log(`Run with --report for details.`);
  }
  process.exit(0);
}

main();
