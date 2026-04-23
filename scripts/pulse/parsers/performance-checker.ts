import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|\/seed\.|fixture/i.test(filePath);
}

// Only loops that are likely to cause N+1: for statements, forEach, and ASYNC map/flatMap
// We require `async` in the callback for .map/.flatMap to avoid flagging data-extraction maps
// like `ids.map(x => x.id)` or `strings.map(s => s.trim()).join('\n')`
const FOR_LOOP_RE = /\bfor\s*\(|\bforEach\s*\(/;
const ASYNC_MAP_RE = /\.(map|flatMap)\s*\(\s*async\b/;

// A Prisma query inside an async call
const PRISMA_QUERY_RE = /await\s+(this\.prisma\.|this\.prismaAny\.|prismaAny\.)/;

// A batch query pattern — `{ in: ... }` means the query is already batched
const BATCH_IN_RE = /\{\s*in\s*:/;

/**
 * N+1 heuristic: if we see `await this.prisma.` inside a real loop body
 * (for/forEach, or async .map/.flatMap), flag it — unless the query already
 * uses `{ in: ... }` which indicates batching.
 *
 * Supports PULSE:OK annotations to suppress false positives.
 */
export function checkPerformance(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- N+1 Query Detection (backend) ----
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => !isTestFile(f));

  for (const file of backendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Track loop start info: { line, braceDepthAtStart }
    const loopEntries: Array<{ line: number; depth: number }> = [];

    // Track cumulative brace depth
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Skip PULSE:OK annotated lines
      if (/PULSE:OK/.test(trimmed)) {
        continue;
      }

      // Update brace depth from this line
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceDepth++;
        }
        if (ch === '}') {
          braceDepth--;
        }
      }

      // Detect real loop starts (for/forEach or async .map/.flatMap)
      if (FOR_LOOP_RE.test(trimmed) || ASYNC_MAP_RE.test(trimmed)) {
        loopEntries.push({ line: i, depth: braceDepth });
      }

      if (PRISMA_QUERY_RE.test(trimmed)) {
        // Check if PULSE:OK is on the previous line
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        if (/PULSE:OK/.test(prevLine)) {
          continue;
        }

        // Check if the query already uses { in: ... } batch pattern (look ahead 5 lines)
        const lookAhead = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
        if (BATCH_IN_RE.test(lookAhead)) {
          continue;
        }

        // Check if we're inside any recorded loop
        const insideLoop = loopEntries.some((entry) => {
          const dist = i - entry.line;
          return dist >= 1 && dist <= 15 && braceDepth > entry.depth;
        });

        if (insideLoop) {
          breaks.push({
            type: 'N_PLUS_ONE_QUERY',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: 'Prisma query inside loop — potential N+1 query problem',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // Prune loop entries that are too far back to matter (> 20 lines) or loops we've exited
      loopEntries.splice(
        0,
        loopEntries.findIndex((e) => i - e.line <= 20 && braceDepth >= e.depth) === -1
          ? loopEntries.length
          : loopEntries.findIndex((e) => i - e.line <= 20 && braceDepth >= e.depth),
      );
    }
  }

  // NOTE: setInterval/clearInterval cleanup is handled by the dedicated
  // interval-cleanup-checker.ts parser. No duplication here.

  return breaks;
}
