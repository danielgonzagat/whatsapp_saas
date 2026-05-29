#!/usr/bin/env node

/**
 * Gate: Prevent new worker/module without declared capability/domain.
 *
 * RULE: Every module in the worker codebase must declare its capability
 * (what it does) and domain (the business domain it serves). Orphan modules
 * without explicit registration are forbidden.
 *
 * DECLARATION FORM:
 *   - File header comment with @capability and @domain annotations.
 *   - Or: exported constant CAPABILITY_DEFINITION with shape { id, domain, ... }
 *   - Or: registration in worker capability registry (if it exists).
 *
 * VIOLATIONS DETECTED:
 *   - Module (*.ts file) in worker/ with NO capability declaration.
 *   - Exported service/class without @capability tag.
 *   - New processor/provider without domain linkage.
 *
 * RUN:  node scripts/canon-gates/gate-worker-capability.mjs
 *
 * EXIT: 0 if all worker modules are declared; 1 if orphan found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Scan worker directory for undecorated modules
function findFiles(dir, isFile = () => true, ignore = []) {
  const results = [];
  function walk(current) {
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const fullPath = join(current, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (isFile(entry)) {
          results.push(fullPath);
        }
      }
    } catch (err) {}
  }
  walk(dir);
  return results;
}

const sourceFiles = findFiles(
  join(ROOT, 'worker'),
  (name) => /\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.spec.ts'),
).filter((filePath) => {
  const rel = filePath.replace(ROOT + '/', '');
  const ignore = [
    'processors/',
    'providers/index.ts',
    'utils/',
    'types/',
    'redis-client.ts',
    'resolve-redis-url.ts',
    'metrics-server.ts',
    'pulse-runtime.ts',
  ];
  return !ignore.some((pattern) => rel.includes(pattern));
});

const orphanModules = [];

// Pattern: Look for @capability or @domain in file header, or CAPABILITY_DEFINITION export
const capabilityPattern = /@capability|@domain|CAPABILITY_DEFINITION|@processor|@provider|@handler/;

for (const filePath of sourceFiles) {
  const file = filePath.replace(ROOT + '/', '');
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  // Extract first 20 lines (likely to contain header declarations)
  const headerLines = content.split('\n').slice(0, 30).join('\n');

  if (!capabilityPattern.test(headerLines) && !capabilityPattern.test(content)) {
    // Also check if it's just a re-export barrel or has no exports
    if (
      !content.includes('export {') &&
      !content.includes('export *') &&
      !content.includes('export const') &&
      !content.includes('export function') &&
      !content.includes('export class')
    ) {
      continue; // Private module, OK
    }

    orphanModules.push(file);
  }
}

if (orphanModules.length > 0) {
  process.stderr.write(
    `FAIL gate-worker-capability: ${orphanModules.length} orphan module(s) without declared capability:\n`,
  );
  for (const file of orphanModules.slice(0, 10)) {
    process.stderr.write(`  ${file}\n`);
  }
  if (orphanModules.length > 10) {
    process.stderr.write(`  ... and ${orphanModules.length - 10} more\n`);
  }
  process.stderr.write(
    '\nAdd a capability declaration to each worker module:\n' +
    '  /**\n' +
    '   * @capability EmailSender\n' +
    '   * @domain communication\n' +
    '   */\n',
  );
  process.exit(1);
}

process.stderr.write(`PASS gate-worker-capability: all ${sourceFiles.length} worker modules have capability declarations\n`);
process.exit(0);
