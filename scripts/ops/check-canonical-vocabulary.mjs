#!/usr/bin/env node
/**
 * check-canonical-vocabulary.mjs
 *
 * Gate G1 (vocabulary slice) of the Architectural Semantic Canonicalization
 * mission — a REAL, AST-backed ratchet (no longer advisory).
 *
 * Reads `docs/architecture/CANONICAL_VOCABULARY.md` and extracts the
 * (canonical, aliases[]) mapping from every markdown table. For each alias,
 * parses every backend/frontend/worker source file with the TypeScript
 * compiler API and flags an alias ONLY when it appears as a real identifier
 * in a *meaningful position*:
 *
 *   - the NAME of a class / interface / type-alias / enum declaration
 *   - a type-reference (annotation, generic argument, etc.)
 *   - an import-specifier or export-specifier
 *   - the type in an `extends` / `implements` heritage clause
 *   - the constructor in a `new Alias(...)` expression
 *
 * Because we match whole-identifier AST nodes (an Identifier node's `.text` is
 * the ENTIRE identifier), `Lead` never matches inside `LeadProcessor` and
 * `connection` never matches inside `dbConnection`/`getConnection`. That is the
 * precision the old substring scanner lacked — which is why it could only warn.
 *
 * RATCHET semantics: the current real-violation set is captured in
 * `vocabulary-baseline.json` (keyed `file::alias::canonical` with a per-key
 * count). `--strict` fails ONLY on keys absent from the baseline, or whose count
 * exceeds the recorded value (a new occurrence). Existing debt is tolerated so
 * CI does not break on pre-existing state; any newly-introduced alias usage
 * hard-fails. Re-tighten the floor with `--bootstrap`.
 *
 * Usage:
 *   node scripts/ops/check-canonical-vocabulary.mjs              # soft (warns on new)
 *   node scripts/ops/check-canonical-vocabulary.mjs --strict     # exit 1 on NEW violations
 *   node scripts/ops/check-canonical-vocabulary.mjs --report     # human-readable summary
 *   node scripts/ops/check-canonical-vocabulary.mjs --bootstrap  # (re)write the baseline
 *   node scripts/ops/check-canonical-vocabulary.mjs --selftest   # precision self-test
 *
 * Exit codes:
 *   0 — OK (no NEW violations) / bootstrap / selftest passed
 *   1 — strict-mode NEW violation, or selftest failure
 *   2 — script error
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VOCAB_FILE = join(ROOT, 'docs', 'architecture', 'CANONICAL_VOCABULARY.md');
const BASELINE_FILE = join(ROOT, 'scripts', 'ops', 'vocabulary-baseline.json');

const STRICT = process.argv.includes('--strict');
const REPORT = process.argv.includes('--report');
const BOOTSTRAP = process.argv.includes('--bootstrap');
const SELFTEST = process.argv.includes('--selftest');

const SCAN_DIRS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'build', 'coverage', 'out']);
const SCAN_EXT = /\.[mc]?[tj]sx?$/;

// Files that legitimately reference aliases (alias source itself, vocab doc,
// tests/fixtures/mocks that may name entities after deprecated terms on purpose).
const ALIAS_HOSTS_RE =
  /(canonical[-_]vocabulary|deprecation[-_]map|\.spec\.|\.test\.|\.e2e\.|\.fixture\.|\.mock)/i;

function loadTypeScript() {
  try {
    return require('typescript');
  } catch {
    return null;
  }
}

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
    // Canonical must itself be a bare identifier we could rename TO.
    if (!/^[A-Za-z][A-Za-z0-9_$]*$/.test(canonical)) continue;
    const aliasesRaw = m[2];
    const aliases = new Set();
    for (const a of aliasesRaw.matchAll(/`([^`]+)`/g)) {
      const tok = a[1].trim();
      if (!tok || tok === canonical) continue;
      // Strip parenthetical notes like "User (in messaging context)".
      const clean = tok.replace(/\(.*?\)/g, '').trim();
      // Only bare identifiers — dotted method refs (WhatsappApiService.sendText)
      // cannot be matched as a single AST Identifier node and are dropped.
      if (clean && /^[A-Za-z][A-Za-z0-9_$]*$/.test(clean)) {
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

function scriptKindFor(ts, file) {
  if (/\.tsx$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(file)) return ts.ScriptKind.JSX;
  if (/\.[mc]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * True when identifier `id` (with parent `p`) sits in a position where it
 * denotes a real type / class / imported binding — i.e. a meaningful use of
 * the alias as an entity, not an incidental property / variable substring.
 */
function isMeaningfulPosition(ts, id, p) {
  if (!p) return false;
  // Declaration NAME of a type-ish entity.
  if (
    (ts.isClassDeclaration(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isEnumDeclaration(p)) &&
    p.name === id
  ) {
    return true;
  }
  // Type reference (annotation / generic argument).
  if (ts.isTypeReferenceNode(p) && p.typeName === id) return true;
  // Import / export specifier — `import { Tenant }`, `export { Lead }`.
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) {
    return p.name === id || p.propertyName === id;
  }
  // extends / implements heritage clause.
  if (
    ts.isExpressionWithTypeArguments(p) &&
    p.expression === id &&
    p.parent &&
    ts.isHeritageClause(p.parent)
  ) {
    return true;
  }
  // `new Alias(...)` — constructing a class named exactly the alias.
  if (ts.isNewExpression(p) && p.expression === id) return true;
  return false;
}

/**
 * Scan source files and return the violation map keyed `file::alias::canonical`
 * with per-key occurrence counts, plus a flat list of {file,line,alias,canonical,key}.
 */
function scanRepo(ts, aliasToCanon) {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), files);
  }

  const counts = Object.create(null);
  const occurrences = [];

  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (ALIAS_HOSTS_RE.test(rel)) continue;
    const src = readFileSafe(file);
    if (src === null) continue;

    // Cheap pre-filter: skip files with no alias substring at all.
    let touches = false;
    for (const alias of aliasToCanon.keys()) {
      if (src.includes(alias)) {
        touches = true;
        break;
      }
    }
    if (!touches) continue;

    let sf;
    try {
      sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, scriptKindFor(ts, file));
    } catch {
      continue;
    }

    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const canon = aliasToCanon.get(node.text);
        if (canon && isMeaningfulPosition(ts, node, node.parent)) {
          const key = `${rel}::${node.text}::${canon}`;
          counts[key] = (counts[key] || 0) + 1;
          const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          occurrences.push({
            file: rel,
            line: lc.line + 1,
            alias: node.text,
            canonical: canon,
            key,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return { filesScanned: files.length, counts, occurrences };
}

function buildAliasMap(vocab) {
  const aliasToCanon = new Map();
  for (const [canon, aliases] of vocab) {
    for (const a of aliases) {
      if (!aliasToCanon.has(a)) aliasToCanon.set(a, canon); // first mapping wins
    }
  }
  return aliasToCanon;
}

function loadBaseline() {
  const raw = readFileSafe(BASELINE_FILE);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.violations && typeof parsed.violations === 'object') {
      return parsed.violations;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function writeBaseline(counts) {
  const sortedKeys = Object.keys(counts).sort();
  const violations = {};
  for (const k of sortedKeys) violations[k] = counts[k];
  const payload = {
    version: 1,
    note:
      'Captured real (AST-position) canonical-vocabulary violations. RATCHET floor: ' +
      '--strict fails only on keys absent here or with a count above the recorded value. ' +
      'Regenerate with: node scripts/ops/check-canonical-vocabulary.mjs --bootstrap',
    key: 'file::alias::canonical -> occurrence count',
    total: sortedKeys.reduce((s, k) => s + counts[k], 0),
    violations,
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n');
}

/**
 * Violations exceeding the baseline:
 *   - a key absent from the baseline → ALL occurrences are new
 *   - a key present but with a higher current count → the surplus is new
 */
function diffAgainstBaseline(counts, baseline) {
  const news = [];
  for (const [key, count] of Object.entries(counts)) {
    const allowed = baseline[key] || 0;
    if (count > allowed) {
      news.push({ key, count, allowed, surplus: count - allowed });
    }
  }
  return news;
}

function runSelfTest(ts) {
  const aliasToCanon = new Map([
    ['Lead', 'Contact'],
    ['connection', 'ChannelSession'],
    ['Tenant', 'Workspace'],
    ['Account', 'Workspace'],
  ]);

  // Specifier fixtures use module-specifier-free re-exports so this gate's own
  // source carries no `from '<spec>'` literal the convergence gate could read
  // as a dangling import. A re-export still produces an ExportSpecifier node.
  const cases = [
    ['class declaration name', 'export class Lead {}', ['Lead']],
    ['interface declaration name', 'interface Tenant { id: string }', ['Tenant']],
    ['type annotation', 'function f(x: Lead): void {}', ['Lead']],
    ['generic type argument', 'const xs: Array<Tenant> = [];', ['Tenant']],
    ['export specifier (Lead)', 'const Lead = 1; export { Lead };', ['Lead']],
    ['export specifier (Tenant)', 'const Tenant = 1; export { Tenant };', ['Tenant']],
    ['extends heritage', 'class C extends Account {}', ['Account']],
    ['implements heritage', 'class C implements Tenant {}', ['Tenant']],
    ['new expression', 'const a = new Account();', ['Account']],
    // Negative cases — MUST NOT flag:
    ['substring identifier (LeadProcessor)', 'class LeadProcessor {}', []],
    ['substring identifier (dbConnection)', 'const dbConnection = 1;', []],
    ['substring call (getConnection)', 'const c = getConnection();', []],
    ['property key', 'const o = { Lead: 1, Tenant: 2 };', []],
    ['property access', 'const v = obj.Lead;', []],
    ['plain variable read', 'const x = Account;', []],
    ['string literal', 'const s = "Lead and Tenant and connection";', []],
    ['local var named alias', 'function g() { const Account = 1; return Account; }', []],
  ];

  let failures = 0;
  for (const [desc, src, expected] of cases) {
    const sf = ts.createSourceFile('t.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const flagged = new Set();
    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const canon = aliasToCanon.get(node.text);
        if (canon && isMeaningfulPosition(ts, node, node.parent)) flagged.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    const got = [...flagged].sort();
    const want = [...expected].sort();
    const ok = got.length === want.length && got.every((v, i) => v === want[i]);
    if (!ok) {
      failures++;
      err(`[selftest] FAIL: ${desc}`);
      err(`            source : ${JSON.stringify(src)}`);
      err(`            expected: [${want.join(', ')}]`);
      err(`            got     : [${got.join(', ')}]`);
    }
  }

  // Ratchet diff semantics self-check.
  const baseline = { 'a.ts::Lead::Contact': 1 };
  const same = diffAgainstBaseline({ 'a.ts::Lead::Contact': 1 }, baseline);
  const grew = diffAgainstBaseline({ 'a.ts::Lead::Contact': 2 }, baseline);
  const fresh = diffAgainstBaseline({ 'b.ts::Tenant::Workspace': 1 }, baseline);
  if (same.length !== 0) {
    failures++;
    err('[selftest] FAIL: baseline-equal count should produce 0 new violations');
  }
  if (grew.length !== 1 || grew[0].surplus !== 1) {
    failures++;
    err('[selftest] FAIL: count above baseline should produce surplus=1');
  }
  if (fresh.length !== 1) {
    failures++;
    err('[selftest] FAIL: key absent from baseline should be flagged as new');
  }

  if (failures === 0) {
    out('[check-canonical-vocabulary] selftest OK — 20 assertions passed.');
    process.exitCode = 0;
  } else {
    err(`[check-canonical-vocabulary] selftest FAILED — ${failures} assertion(s).`);
    process.exitCode = 1;
  }
}

function main() {
  const ts = loadTypeScript();
  if (!ts) {
    err('[check-canonical-vocabulary] typescript compiler API not available');
    process.exitCode = 2;
    return;
  }

  if (SELFTEST) {
    runSelfTest(ts);
    return;
  }

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
  const aliasToCanon = buildAliasMap(vocab);

  const { filesScanned, counts, occurrences } = scanRepo(ts, aliasToCanon);
  const total = occurrences.length;

  if (BOOTSTRAP) {
    writeBaseline(counts);
    out(
      `[check-canonical-vocabulary] baseline written to ${relative(ROOT, BASELINE_FILE)} — ` +
        `${Object.keys(counts).length} key(s), ${total} occurrence(s).`,
    );
    process.exitCode = 0;
    return;
  }

  const baseline = loadBaseline();
  if (baseline === null) {
    err(
      `[check-canonical-vocabulary] missing/invalid baseline ${relative(ROOT, BASELINE_FILE)} — ` +
        'run with --bootstrap to create it.',
    );
    process.exitCode = 2;
    return;
  }

  const news = diffAgainstBaseline(counts, baseline);

  if (REPORT) {
    out('');
    out(`[check-canonical-vocabulary] scanned ${filesScanned} files`);
    out(`[check-canonical-vocabulary] canonical terms with aliases: ${vocab.size}`);
    out(`[check-canonical-vocabulary] alias entries: ${aliasToCanon.size}`);
    out(`[check-canonical-vocabulary] total real (AST) occurrences: ${total}`);
    out(`[check-canonical-vocabulary] baseline keys: ${Object.keys(baseline).length}`);
    out(`[check-canonical-vocabulary] NEW (beyond baseline): ${news.length}`);
    out('');
    const byCanon = new Map();
    for (const o of occurrences) {
      if (!byCanon.has(o.canonical)) byCanon.set(o.canonical, []);
      byCanon.get(o.canonical).push(o);
    }
    const top = [...byCanon.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [canon, os] of top) {
      out(`  ${canon}: ${os.length} alias usage(s)`);
      const aliasCount = new Map();
      for (const o of os) aliasCount.set(o.alias, (aliasCount.get(o.alias) || 0) + 1);
      for (const [a, n] of aliasCount) out(`    • ${a} (${n})`);
    }
    if (news.length) {
      out('');
      out('  NEW violations (would fail --strict):');
      for (const n of news) out(`    ✗ ${n.key}  (count ${n.count} > baseline ${n.allowed})`);
    }
    process.exitCode = STRICT && news.length ? 1 : 0;
    return;
  }

  if (news.length) {
    const newKeys = new Set(news.map((n) => n.key));
    const byKey = new Map();
    for (const o of occurrences) {
      if (!newKeys.has(o.key)) continue;
      if (!byKey.has(o.key)) byKey.set(o.key, []);
      byKey.get(o.key).push(o);
    }
    for (const n of news) {
      const [, alias, canonical] = n.key.split('::');
      const sample = (byKey.get(n.key) || [])[0];
      const loc = sample ? `${sample.file}:${sample.line}` : n.key;
      err(
        `[G1-VOCAB] ${loc}  alias '${alias}' — use canonical '${canonical}'  ` +
          `(new: ${n.count} > baseline ${n.allowed})`,
      );
    }
    err('');
    if (STRICT) {
      err(
        `[check-canonical-vocabulary] FAILED — ${news.length} NEW violation(s) beyond baseline. ` +
          'Rename to the canonical term, or (if intentional) update the baseline with --bootstrap.',
      );
      process.exitCode = 1;
    } else {
      err(
        `[check-canonical-vocabulary] WARN — ${news.length} NEW violation(s) beyond baseline ` +
          '(soft mode; run with --strict to enforce).',
      );
      process.exitCode = 0;
    }
    return;
  }

  out(
    `[check-canonical-vocabulary] OK — ${total} known occurrence(s), 0 new beyond baseline ` +
      `(${Object.keys(baseline).length} baseline key(s)).`,
  );
  process.exitCode = 0;
}

main();
