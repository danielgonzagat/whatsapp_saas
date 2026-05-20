#!/usr/bin/env node
// Anti-regression gate: refuse new event names that don't follow the canonical
// taxonomy (lowercase, dot-separated; no underscores/colons/camelCase variants).
//
// Reads docs/architecture/EVENT_TAXONOMY.md as the registered set.
// Scans current code; any emit/on string not matching the registered set
// AND not in canonical form is flagged.
//
// Exit 0 = clean. Exit 1 = unregistered or malformed events.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TAXONOMY = join(ROOT, 'docs/architecture/EVENT_TAXONOMY.md');

if (!existsSync(TAXONOMY)) {
  console.error(`Event taxonomy not found: ${TAXONOMY}`);
  console.error(`run: node tools/canonicalize/scan.mjs`);
  process.exit(2);
}

// parse registered events
const taxonomyText = readFileSync(TAXONOMY, 'utf8');
const registered = new Set();
const allEventsSection = taxonomyText.split('## All events')[1] ?? '';
for (const line of allEventsSection.split('\n')) {
  const m = /^- `([^`]+)`/.exec(line.trim());
  if (m) registered.add(m[1]);
}

// canonical form: lowercase, only [a-z0-9.] allowed
const CANONICAL_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;

// scan code for emit/on strings
const ROOTS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker/src'];
const SKIP_RE = /(node_modules|dist|\.next|build|__tests__|\.spec\.|\.test\.)/;
const tsFiles = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (SKIP_RE.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts)$/.test(e.name)) tsFiles.push(p);
  }
}
for (const r of ROOTS) walk(join(ROOT, r));

const emitRe = /\.emit\s*\(\s*['"`]([\w.:_-]+)['"`]/g;

const violations = [];
for (const f of tsFiles) {
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const rel = relative(ROOT, f);
  emitRe.lastIndex = 0;
  let m;
  while ((m = emitRe.exec(src))) {
    const event = m[1];
    if (event.length < 3) continue;
    // skip system-level / library events
    if (/^(close|error|data|end|finish|connect|disconnect|drain|message|ready|warning)$/.test(event)) continue;
    if (registered.has(event)) continue;
    if (!CANONICAL_RE.test(event)) {
      violations.push({ event, file: rel, reason: 'non-canonical form (use lowercase.dot.separator)' });
    } else {
      violations.push({ event, file: rel, reason: 'not registered in EVENT_TAXONOMY.md' });
    }
  }
}

if (violations.length === 0) {
  console.log(`OK — ${registered.size} events registered; all emit strings either canonical or system-level.`);
  process.exit(0);
}

console.error(`${violations.length} event regression(s):`);
for (const v of violations.slice(0, 50)) {
  console.error(`  [${v.reason}] \`${v.event}\` in ${v.file}`);
}
if (violations.length > 50) console.error(`  ... +${violations.length - 50} more`);
console.error('\nFix: emit only canonical event names registered in docs/architecture/EVENT_TAXONOMY.md');
console.error('  → if intentional, regenerate: node tools/canonicalize/scan.mjs');
process.exit(1);
