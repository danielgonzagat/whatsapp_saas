#!/usr/bin/env node
// Enrich docs/architecture/SERVICE_CATALOG.md with the JSDoc summary of
// each @Injectable() class. For services without a class JSDoc, leaves
// a TODO placeholder so the doc gap is explicit.
//
// Logic:
// 1. Scan backend/src for files matching the patterns of services in
//    SERVICE_CATALOG.md (extracted from the existing markdown)
// 2. For each service class, extract the JSDoc block immediately
//    preceding `@Injectable()` or `export class Foo`
// 3. Collapse the JSDoc to a single line (first sentence)
// 4. Rewrite SERVICE_CATALOG.md with descriptions inlined

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG = join(ROOT, 'docs/architecture/SERVICE_CATALOG.md');

const text = readFileSync(CATALOG, 'utf8');

// Lines like: - `ServiceName` — `path/to/file.ts`
const ROW_RE = /^- `([^`]+)` — `([^`]+)`\s*$/;

const lines = text.split('\n');
const out = [];
let enriched = 0;
let stubs = 0;

/** Extract the first meaningful line of JSDoc preceding `export class X`. */
function jsdocFor(className, file) {
  let src;
  try {
    src = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
  // Find "export class X" or "export abstract class X"
  const idx = src.search(new RegExp(`export\\s+(?:abstract\\s+)?class\\s+${className}\\b`));
  if (idx < 0) return null;

  // Walk backward to find the closing `*/` of the JSDoc block
  const before = src.slice(0, idx);
  const closeAt = before.lastIndexOf('*/');
  if (closeAt < 0) return null;

  // Verify the chunk between */ and the class decl is whitespace/@Injectable()
  const between = before.slice(closeAt + 2);
  if (between.length > 200) return null; // too far away, probably unrelated comment
  if (!/^[\s@A-Za-z(),]*$/.test(between)) return null;

  // Find the matching /** opening
  const openAt = before.lastIndexOf('/**', closeAt);
  if (openAt < 0) return null;

  const block = before.slice(openAt + 3, closeAt);
  // Take first non-empty cleaned line
  for (const raw of block.split('\n')) {
    const cleaned = raw.replace(/^\s*\*\s?/, '').trim();
    if (!cleaned) continue;
    if (cleaned.startsWith('@')) continue;
    // Stop at first sentence
    const m = /^([^.\n]{8,180})/.exec(cleaned);
    if (m) return m[1].trim();
  }
  return null;
}

for (const line of lines) {
  const m = ROW_RE.exec(line);
  if (!m) {
    out.push(line);
    continue;
  }
  const [, className, file] = m;
  const desc = jsdocFor(className, file);
  if (desc) {
    out.push(`- \`${className}\` — \`${file}\` — ${desc}`);
    enriched++;
  } else {
    out.push(`- \`${className}\` — \`${file}\` — _TODO: class-level JSDoc needed_`);
    stubs++;
  }
}

writeFileSync(CATALOG, out.join('\n'));
console.log(`enriched: ${enriched} services with JSDoc summary`);
console.log(`stubs: ${stubs} services missing class JSDoc (flagged with TODO)`);
console.log(`wrote ${CATALOG}`);
