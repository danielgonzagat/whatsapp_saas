#!/usr/bin/env node

/**
 * Gate: Prevent new events outside the canonical AsyncAPI taxonomy.
 *
 * RULE: Every event emitted must be listed in tools/asyncapi/asyncapi-spec.json
 * channels section with proper domain parameterization.
 *
 * VIOLATIONS DETECTED:
 *   - File contains `emit.*(' or `.emit(` with an event name NOT in the
 *     canonical AsyncAPI spec channels.
 *   - Event emission without a corresponding channel definition.
 *
 * RUN:  node scripts/canon-gates/gate-asyncapi-taxonomy.mjs
 *
 * EXIT: 0 if all emits are canonical; 1 if any undeclared event found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Load the AsyncAPI spec to extract canonical event names
const asyncapiPath = join(ROOT, 'tools/asyncapi/asyncapi-spec.json');
let asyncapiSpec;
try {
  asyncapiSpec = JSON.parse(readFileSync(asyncapiPath, 'utf8'));
} catch (err) {
  process.stderr.write(`FAIL gate-asyncapi-taxonomy: cannot read ${asyncapiPath}: ${err.message}\n`);
  process.exit(1);
}

const canonicalEvents = new Set(Object.keys(asyncapiSpec.channels || {}));

if (canonicalEvents.size === 0) {
  process.stderr.write('FAIL gate-asyncapi-taxonomy: no canonical events found in AsyncAPI spec\n');
  process.exit(1);
}

// Regex to detect event emission patterns: emit(..., eventName, ...)
// Covers: emit('event.name', ...), this.emit(...), service.emit(...)
const emitPatterns = [
  /\.emit\s*\(\s*['"`]([a-zA-Z0-9._-]+)['"`]/g,
  /emitter\s*\(\s*['"`]([a-zA-Z0-9._-]+)['"`]/g,
  /fireEvent\s*\(\s*['"`]([a-zA-Z0-9._-]+)['"`]/g,
  /publishEvent\s*\(\s*['"`]([a-zA-Z0-9._-]+)['"`]/g,
];

// Scan backend/src for all event emissions
// Simple recursive file discovery without globSync dependency
function findFiles(dir, pattern, ignore = []) {
  const results = [];
  function walk(current) {
    try {
      const files = readdirSync(current);
      for (const file of files) {
        const fullPath = join(current, file);
        const relPath = relative(ROOT, fullPath);
        
        if (ignore.some(ign => relPath.includes(ign))) continue;
        
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (pattern.test(file)) {
          results.push(relPath);
        }
      }
    } catch (err) {}
  }
  walk(dir);
  return results;
}

const sourceFiles = findFiles(
  join(ROOT, 'backend/src'),
  /\.(ts|tsx)$/,
  ['node_modules', '.d.ts']
);

const uncanonicalEmissions = [];

for (const file of sourceFiles) {
  const filePath = join(ROOT, file);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of emitPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const eventName = match[1];

      // Skip if it's a variable or dynamic value (heuristic: uppercase suggests constant)
      if (eventName === eventName.toUpperCase()) {
        continue;
      }

      // Check if canonical
      if (!canonicalEvents.has(eventName)) {
        uncanonicalEmissions.push({
          file,
          eventName,
          line: content.substring(0, match.index).split('\n').length,
        });
      }
    }
    // Reset regex stateful iteration
    pattern.lastIndex = 0;
  }
}

if (uncanonicalEmissions.length > 0) {
  process.stderr.write(
    `FAIL gate-asyncapi-taxonomy: ${uncanonicalEmissions.length} event(s) not in canonical AsyncAPI spec:\n`,
  );
  for (const { file, eventName, line } of uncanonicalEmissions) {
    process.stderr.write(`  ${file}:${line}: "${eventName}"\n`);
  }
  process.exit(1);
}

process.stderr.write(
  `PASS gate-asyncapi-taxonomy: all ${canonicalEvents.size} canonical events are declared; no rogue emissions found\n`,
);
process.exit(0);
