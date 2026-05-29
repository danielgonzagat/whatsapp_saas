#!/usr/bin/env node

/**
 * Gate: Prevent new message-dispatcher outside the canonical path.
 *
 * RULE: All message dispatch logic must flow through a single, canonical
 * dispatcher. New dispatchers (functions named dispatch*, send*, channel*, etc.)
 * outside the approved list are forbidden.
 *
 * CANONICAL PATHS:
 *   - worker/providers/channel-dispatcher.ts
 *   - worker/providers/outbound-dispatcher.ts
 *   - backend/src/integrations/* (channel-specific outbound handlers only)
 *
 * VIOLATIONS DETECTED:
 *   - New function matching dispatch/send/channel naming pattern outside
 *     the canonical paths.
 *   - Duplicate dispatcher logic in unexpected locations.
 *
 * RUN:  node scripts/canon-gates/gate-message-dispatcher.mjs
 *
 * EXIT: 0 if all dispatchers are on canonical paths; 1 if rogue found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const CANONICAL_DISPATCHER_PATHS = new Set([
  'worker/providers/channel-dispatcher.ts',
  'worker/providers/outbound-dispatcher.ts',
  // backend/src/integrations/* allowed for channel-specific handlers
]);

// Patterns to identify dispatch logic
const dispatchPatterns = [
  /(?:export\s+)?(?:async\s+)?function\s+(dispatch[A-Za-z]*)\s*\(/g,
  /(?:export\s+)?(?:async\s+)?function\s+(send[A-Za-z]*)\s*\(/g,
  /(?:export\s+)?(?:async\s+)?function\s+(route[A-Za-z]*)\s*\(/g,
  /(?:export\s+)?class\s+([A-Za-z]*Dispatcher[A-Za-z]*)\s*[{({]/g,
  /private\s+(?:async\s+)?(?:dispatch|route|send)[A-Za-z]*\s*\(/g,
];

function findFiles(dir, isFile = () => true) {
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

const rogueDispatchers = [];

// Scan backend/src and worker for function declarations
const dirs = [
  join(ROOT, 'backend/src'),
  join(ROOT, 'worker'),
];

for (const dir of dirs) {
  const sourceFiles = findFiles(dir, (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.spec.ts'));

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(ROOT + '/', '');

    // Check if file is in a canonical path
    const isCanonical = CANONICAL_DISPATCHER_PATHS.has(relPath) ||
      relPath.startsWith('backend/src/integrations/');

    if (isCanonical) {
      continue; // Skip canonical files
    }

    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const dispatchPattern of dispatchPatterns) {
      let match;
      while ((match = dispatchPattern.exec(content)) !== null) {
        const fnName = match[1];
        // Heuristic: exclude test utilities, helpers with "test" or "mock" in name
        if (!fnName || fnName.toLowerCase().includes('test') || fnName.toLowerCase().includes('mock')) {
          continue;
        }

        const line = content.substring(0, match.index).split('\n').length;
        rogueDispatchers.push({ file: relPath, fnName, line });
      }
      dispatchPattern.lastIndex = 0;
    }
  }
}

if (rogueDispatchers.length > 0) {
  process.stderr.write(
    `FAIL gate-message-dispatcher: ${rogueDispatchers.length} rogue dispatcher(s) found outside canonical paths:\n`,
  );
  for (const { file, fnName, line } of rogueDispatchers) {
    process.stderr.write(`  ${file}:${line}: ${fnName}()\n`);
  }
  process.stderr.write(
    'All message dispatch logic must reside in:\n' +
    '  - worker/providers/{channel,outbound}-dispatcher.ts\n' +
    '  - backend/src/integrations/* (channel-specific handlers)\n',
  );
  process.exit(1);
}

process.stderr.write('PASS gate-message-dispatcher: no rogue dispatchers found\n');
process.exit(0);
